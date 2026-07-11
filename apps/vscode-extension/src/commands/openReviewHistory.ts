/**
 * P7 — "ReviewLume: Open Review History" command.
 *
 * Displays a QuickPick-based history browser for past Review Pack exports
 * stored under `.reviewlume/history/<reviewId>/`.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService } from '../services/historyService';
import { GitContextService } from '../services/gitContextService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo, logWarn } from '../services/logService';
import type { FileSelectionService } from '../services/fileSelectionService';
import type { HistoryEntry } from '../services/historyService';

/**
 * Register the `reviewlume.openReviewHistory` command.
 *
 * @param providedGitContextService  Optional — used for testing; auto-created when omitted.
 */
export function registerOpenReviewHistory(
  context: vscode.ExtensionContext,
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): void {
  const disposable = vscode.commands.registerCommand(
    COMMANDS.OPEN_REVIEW_HISTORY,
    async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`openReviewHistory blocked — ${warning}`);
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
            'ReviewLume: No workspace folder is open. Open a folder to view review history.',
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
              title: 'ReviewLume: Select Repository for History',
              placeHolder: 'Choose a repository to browse its review history',
            });
            return picked?.repo;
          },
        );

        if (!inspection || inspection.kind !== 'ready') {
          if (inspection?.kind === 'git-unavailable') {
            await vscode.window.showWarningMessage(
              'ReviewLume: Git is not available. Install Git and ensure it is on PATH.',
            );
          } else if (inspection?.kind === 'no-repository') {
            await vscode.window.showWarningMessage(
              'ReviewLume: No Git repository was found in the current workspace.',
            );
          }
          return;
        }

        repositoryRoot = inspection.repository.root;
      }

      if (!repositoryRoot) return;

      const historyService = new HistoryService();
      let entries: HistoryEntry[];

      try {
        entries = await historyService.list(repositoryRoot);
      } catch (error) {
        logWarn(`Failed to list review history: ${getErrorCode(error)}`);
        await vscode.window.showErrorMessage(
          'ReviewLume: Failed to read review history. Check the ReviewLume output channel.',
        );
        return;
      }

      if (entries.length === 0) {
        const createChoice = await vscode.window.showInformationMessage(
          'ReviewLume: No review history found. Create a Review Pack to start building history.',
          'Create Review Pack',
        );
        if (createChoice) {
          await vscode.commands.executeCommand(COMMANDS.CREATE_REVIEW_PACK);
        }
        return;
      }

      const pickedEntry = await showHistoryList(entries);
      if (!pickedEntry) return;

      await showHistoryActions(repositoryRoot, pickedEntry, historyService);
    },
  );

  context.subscriptions.push(disposable);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function showHistoryList(entries: HistoryEntry[]): Promise<HistoryEntry | undefined> {
  const items = entries.map((entry) => {
    const meta = entry.metadata;
    const date = formatDate(meta.createdAt);
    const size = formatBytes(meta.byteLength);
    const w = meta.security.warnCount;
    const cw = meta.security.confirmedWarnCount;
    return {
      label: `${meta.repositoryDisplayName} — ${date}`,
      description: `${meta.exportFormat} · ${meta.fileCount} file(s) · ${size}`,
      detail:
        `WARN: ${w} (${cw} confirmed) | ` +
        `HARD_BLOCK: ${meta.security.hardBlockCount} | BLOCK: ${meta.security.blockCount}`,
      entry,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'ReviewLume: Review History',
    placeHolder: 'Select a review session to view or manage',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return picked?.entry;
}

async function showHistoryActions(
  repositoryRoot: string,
  entry: HistoryEntry,
  historyService: HistoryService,
): Promise<void> {
  const meta = entry.metadata;
  const date = formatDate(meta.createdAt);

  interface ActionItem extends vscode.QuickPickItem {
    readonly action: string;
  }

  const items: ActionItem[] = [];

  if (entry.markdownPath) {
    items.push({
      label: '$(file) Open REVIEW_REQUEST.md',
      description: 'Open the exported Markdown review pack',
      action: 'open-markdown',
    });
  }

  if (entry.zipPath) {
    items.push({
      label: '$(archive) Open ZIP',
      description: 'Open the exported ZIP review pack',
      action: 'open-zip',
    });
  }

  if (entry.markdownPath || entry.zipPath) {
    items.push({
      label: '$(folder-opened) Open Export Directory',
      description: 'Reveal the export folder in the file explorer',
      action: 'open-directory',
    });
  }

  items.push({
    label: '$(clippy) Copy Review Prompt',
    description: 'Copy the saved request.md content to the clipboard',
    action: 'copy-prompt',
  });

  if (!meta.hasMarkdown) {
    items.push({
      label: '$(new-file) Re-export as Markdown',
      description: 'Export the saved request as REVIEW_REQUEST.md',
      action: 're-export-markdown',
    });
  }
  if (!meta.hasZip) {
    items.push({
      label: '$(file-zip) Re-export as ZIP',
      description: 'Export the saved request as a ZIP archive',
      action: 're-export-zip',
    });
  }

  items.push({
    label: '$(trash) Delete History Entry',
    description: `Remove this history record for ${meta.reviewId}`,
    action: 'delete',
  });

  items.push({
    label: '$(close-all) Clear All History',
    description: 'Remove all review history for this repository',
    action: 'clear-all',
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: `ReviewLume: ${meta.repositoryDisplayName} — ${date}`,
    placeHolder: 'Choose an action',
  });

  if (!picked) return;

  try {
    switch (picked.action) {
      case 'open-markdown':
        if (entry.markdownPath) {
          await vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(entry.markdownPath),
          );
        }
        break;

      case 'open-zip':
        if (entry.zipPath) {
          await vscode.commands.executeCommand(
            'revealFileInOS',
            vscode.Uri.file(entry.zipPath),
          );
        }
        break;

      case 'open-directory': {
        const dir = entry.markdownPath
          ? path.dirname(entry.markdownPath)
          : entry.zipPath
            ? path.dirname(entry.zipPath)
            : undefined;
        if (dir) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
        }
        break;
      }

      case 'copy-prompt': {
        const requestContent = await historyService.loadRequest(repositoryRoot, meta.reviewId);
        await vscode.env.clipboard.writeText(requestContent);
        await vscode.window.showInformationMessage(
          'ReviewLume: Review prompt copied to clipboard from history.',
        );
        logInfo(`Review prompt copied from history (${meta.reviewId})`);
        break;
      }

      case 're-export-markdown': {
        const requestContent = await historyService.loadRequest(repositoryRoot, meta.reviewId);
        const exportDir = path.join(repositoryRoot, '.reviewlume/exports', meta.reviewId);
        await fsMkdir(exportDir);
        const mdPath = path.join(exportDir, 'REVIEW_REQUEST.md');
        await fsWriteFile(mdPath, Buffer.from(requestContent, 'utf8'));
        await vscode.window.showInformationMessage(
          `ReviewLume: REVIEW_REQUEST.md re-exported to ${path.relative(repositoryRoot, mdPath)}`,
        );
        logInfo(`Review Pack re-exported as Markdown from history (${meta.reviewId})`);
        break;
      }

      case 're-export-zip': {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ReviewPackBuilder } = require('../vendor/review-pack/index.js') as {
          ReviewPackBuilder: new () => {
            build(input: {
              repositoryIdentity: string;
              repositoryDisplayName: string;
              reviewMode: string;
              gitBase: string;
              gitTarget: string;
              security: {
                scanId: string;
                contentFingerprint: string;
                hardBlockCount: number;
                blockCount: number;
                warnCount: number;
                infoCount: number;
                confirmedWarnCount: number;
                hasHardBlock: boolean;
                hasUnresolvedBlock: boolean;
                hasUnresolvedWarn: boolean;
              };
              instructions: string;
              files: readonly { path: string; content: string }[];
              reviewId?: string;
            }): Promise<{
              zip: Uint8Array;
              directoryName: string;
            }>;
          };
        };
        const builder = new ReviewPackBuilder();
        const minimal = await builder.build({
          repositoryIdentity: repositoryRoot,
          repositoryDisplayName: meta.repositoryDisplayName,
          reviewMode: meta.reviewMode,
          gitBase: 'HEAD',
          gitTarget: 'WORKTREE',
          security: {
            scanId: '',
            contentFingerprint: '',
            hardBlockCount: meta.security.hardBlockCount,
            blockCount: meta.security.blockCount,
            warnCount: meta.security.warnCount,
            infoCount: meta.security.infoCount,
            confirmedWarnCount: meta.security.confirmedWarnCount,
            hasHardBlock: meta.security.hardBlockCount > 0,
            hasUnresolvedBlock: meta.security.blockCount > 0,
            hasUnresolvedWarn: meta.security.warnCount > meta.security.confirmedWarnCount,
          },
          instructions: 'Review the attached code.',
          files: [],
          reviewId: meta.reviewId,
        });
        const exportDir = path.join(repositoryRoot, '.reviewlume/exports', meta.reviewId);
        await fsMkdir(exportDir);
        const zipPath = path.join(exportDir, `${minimal.directoryName}.zip`);
        await fsWriteFile(zipPath, Buffer.from(minimal.zip));
        await vscode.window.showInformationMessage(
          `ReviewLume: ZIP re-exported to ${path.relative(repositoryRoot, zipPath)}`,
        );
        logInfo(`Review Pack re-exported as ZIP from history (${meta.reviewId})`);
        break;
      }

      case 'delete': {
        const confirm = await vscode.window.showWarningMessage(
          `ReviewLume: Delete history for ${meta.reviewId}?`,
          { modal: true },
          'Delete',
          'Cancel',
        );
        if (confirm !== 'Delete') return;
        await historyService.delete(repositoryRoot, meta.reviewId);
        await vscode.window.showInformationMessage(
          `ReviewLume: History entry ${meta.reviewId} deleted.`,
        );
        logInfo(`Review history deleted (${meta.reviewId})`);
        break;
      }

      case 'clear-all': {
        const confirm = await vscode.window.showWarningMessage(
          'ReviewLume: Delete ALL review history for this repository? This cannot be undone.',
          { modal: true },
          'Delete All',
          'Cancel',
        );
        if (confirm !== 'Delete All') return;
        await historyService.clearAll(repositoryRoot);
        await vscode.window.showInformationMessage(
          'ReviewLume: All review history has been cleared.',
        );
        logInfo('All review history cleared');
        break;
      }
    }
  } catch (error) {
    const code = getErrorCode(error);
    logWarn(`Review history action failed (${code}): ${picked.action}`);
    await vscode.window.showErrorMessage(
      `ReviewLume: Action failed (${picked.action}). Check the ReviewLume output channel.`,
    );
  }
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) return `${bytes} B`;
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function fsMkdir(dir: string): Promise<void> {
  const fs = await import('node:fs/promises');
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    const code = typeof error === 'object' && error !== null
      ? String((error as NodeJS.ErrnoException).code ?? '') : '';
    if (code !== 'EEXIST') throw error;
  }
}

async function fsWriteFile(filePath: string, content: Buffer): Promise<void> {
  const fs = await import('node:fs/promises');
  try {
    await fs.writeFile(filePath, content, { flag: 'wx' });
  } catch (error) {
    const code = typeof error === 'object' && error !== null
      ? String((error as NodeJS.ErrnoException).code ?? '') : '';
    if (code === 'EEXIST') {
      throw Object.assign(new Error('Export target already exists.'), { code: 'EEXIST' });
    }
    throw error;
  }
}
