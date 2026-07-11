import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService } from '../services/historyService';
import { GitContextService } from '../services/gitContextService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo } from '../services/logService';
import type { FileSelectionService } from '../services/fileSelectionService';

/** Maximum response size: 5 MB. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Register the `reviewlume.importReviewResponse` command.
 *
 * P7 — allows the user to import an AI review response and save it
 * as `response.md` inside an existing history entry.
 */
export function registerImportReviewResponse(
  context: vscode.ExtensionContext,
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): void {
  const disposable = vscode.commands.registerCommand(
    COMMANDS.IMPORT_REVIEW_RESPONSE,
    async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`importReviewResponse blocked — ${warning}`);
        return;
      }

      let repositoryRoot: string | undefined;

      if (fileSelectionService?.hasSession && fileSelectionService.repository) {
        repositoryRoot = fileSelectionService.repository.root;
      }

      if (!repositoryRoot) {
        const gitContextService =
          providedGitContextService ?? new GitContextService();
        const workspaceFolders =
          vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];

        if (workspaceFolders.length === 0) {
          await vscode.window.showWarningMessage(
            'ReviewLume: No workspace folder is open. Open a folder to import review responses.',
          );
          return;
        }

        const inspection = await gitContextService.inspect(
          workspaceFolders,
          async (repositories) => {
            if (repositories.length === 0) return undefined;
            if (repositories.length === 1) return repositories[0];
            const items = repositories.map((r, i) => ({
              label: r.repository.displayName,
              description: `Repository ${i + 1} of ${repositories.length}`,
              detail: r.repository.remoteUrl ?? 'Local repository',
              repo: r,
            }));
            const picked = await vscode.window.showQuickPick(items, {
              title: 'ReviewLume: Select Repository',
              placeHolder: 'Choose a repository',
            });
            return picked?.repo;
          },
        );

        if (!inspection || inspection.kind !== 'ready') {
          if (inspection?.kind === 'git-unavailable') {
            await vscode.window.showWarningMessage(
              'ReviewLume: Git is not available.',
            );
          } else if (inspection?.kind === 'no-repository') {
            await vscode.window.showWarningMessage(
              'ReviewLume: No Git repository was found.',
            );
          }
          return;
        }

        repositoryRoot = inspection.repository.root;
      }

      if (!repositoryRoot) return;

      const historyService = new HistoryService();
      const entries = await historyService.list(repositoryRoot);

      if (entries.length === 0) {
        await vscode.window.showInformationMessage(
          'ReviewLume: No review history found. Export a Review Pack first to create history.',
        );
        return;
      }

      // Let user pick a history entry
      const items = entries.map((entry) => ({
        label: `${entry.metadata.repositoryDisplayName} — ${formatDate(entry.metadata.createdAt)}`,
        description: `${entry.metadata.exportFormat} · ${entry.metadata.fileCount} file(s)`,
        detail: `ID: ${entry.metadata.reviewId.slice(0, 20)}…`,
        entry,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: 'ReviewLume: Select Review Session',
        placeHolder: 'Choose the review session to import a response for',
      });

      if (!picked) return;

      const reviewId = picked.entry.metadata.reviewId;

      // Let user choose how to provide the response
      const sourceChoice = await vscode.window.showQuickPick(
        [
          { label: '$(file) Read from File', description: 'Open a Markdown or text file', action: 'file' },
          { label: '$(clippy) Paste from Clipboard', description: 'Import response text from clipboard', action: 'clipboard' },
        ],
        { title: 'ReviewLume: Import Response', placeHolder: 'Choose response source' },
      );

      if (!sourceChoice) return;

      let responseText: string | undefined;

      if (sourceChoice.action === 'file') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Markdown/Text': ['md', 'mdx', 'txt', 'text'] },
          title: 'ReviewLume: Select Response File',
        });
        if (!uris || uris.length === 0) return;

        const fs = await import('node:fs/promises');
        const stat = await fs.stat(uris[0].fsPath);
        if (stat.size > MAX_RESPONSE_BYTES) {
          await vscode.window.showErrorMessage(
            'ReviewLume: The selected file is too large (max 5 MB).',
          );
          return;
        }
        responseText = await fs.readFile(uris[0].fsPath, 'utf8');
      } else {
        responseText = await vscode.env.clipboard.readText();
        if (!responseText || responseText.trim().length === 0) {
          await vscode.window.showErrorMessage(
            'ReviewLume: Clipboard is empty. Copy response text first.',
          );
          return;
        }
        if (Buffer.byteLength(responseText, 'utf8') > MAX_RESPONSE_BYTES) {
          await vscode.window.showErrorMessage(
            'ReviewLume: Clipboard content is too large (max 5 MB).',
          );
          return;
        }
      }

      if (!responseText) return;

      // Save response.md to history directory
      const historyRoot = path.resolve(repositoryRoot, '.reviewlume/history');
      const reviewDir = path.resolve(historyRoot, reviewId);

      const fs = await import('node:fs/promises');
      await fs.mkdir(reviewDir, { recursive: true });

      const responsePath = path.join(reviewDir, 'response.md');

      try {
        await fs.writeFile(responsePath, responseText, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        const code = typeof error === 'object' && error !== null
          ? String((error as NodeJS.ErrnoException).code ?? '') : '';
        if (code === 'EEXIST') {
          const overwrite = await vscode.window.showWarningMessage(
            'ReviewLume: A response already exists for this session. Overwrite?',
            { modal: true },
            'Overwrite',
            'Cancel',
          );
          if (overwrite !== 'Overwrite') return;
          await fs.writeFile(responsePath, responseText, { encoding: 'utf8', flag: 'w' });
        } else {
          throw error;
        }
      }

      // Basic title parsing: extract first h1 or h2
      const title = extractTitle(responseText);

      await vscode.window.showInformationMessage(
        title
          ? `ReviewLume: Response imported for ${reviewId.slice(0, 16)}… — "${title}"`
          : `ReviewLume: Response imported for ${reviewId.slice(0, 16)}….`,
      );
      logInfo(`Review response imported for ${reviewId}${title ? ` (title: ${title})` : ''}`);
    },
  );

  context.subscriptions.push(disposable);
}

/** Extract the first Markdown heading from the response text. */
function extractTitle(text: string): string | undefined {
  const match = text.match(/^#{1,2}\s+(.+)$/m);
  return match?.[1]?.trim();
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
