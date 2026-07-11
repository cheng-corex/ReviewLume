import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getWorkspaceWarning } from '../services/workspaceService';
import { GitContextService } from '../services/gitContextService';
import type { DiscoveryResult } from '../../../../packages/git-context/dist/index.js';
import { logInfo, logWarn } from '../services/logService';

interface RepositoryQuickPickItem extends vscode.QuickPickItem {
  readonly discoveryResult: DiscoveryResult;
}

/** Register the P2-aware Create Review Pack entry point. */
export function registerCreateReviewPack(
  context: vscode.ExtensionContext,
  providedGitContextService?: GitContextService,
): void {
  let gitContextService = providedGitContextService;

  const disposable = vscode.commands.registerCommand(
    COMMANDS.CREATE_REVIEW_PACK,
    async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`createReviewPack blocked — ${warning}`);
        return;
      }

      gitContextService ??= new GitContextService();
      const workspaceFolders =
        vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];

      try {
        const inspection = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'ReviewLume: Inspecting Git context',
            cancellable: true,
          },
          async (_progress, token) => {
            const controller = new AbortController();
            const cancellation = token.onCancellationRequested(() => controller.abort());
            try {
              return await gitContextService!.inspect(
                workspaceFolders,
                async (repositories) => pickRepository(repositories),
                controller.signal,
              );
            } finally {
              cancellation.dispose();
            }
          },
        );

        switch (inspection.kind) {
          case 'git-unavailable':
            await vscode.window.showWarningMessage(
              'ReviewLume: Git is not available. Install Git and ensure it is on PATH.',
            );
            return;
          case 'no-repository':
            await vscode.window.showWarningMessage(
              'ReviewLume: No Git repository was found in the current workspace.',
            );
            return;
          case 'selection-cancelled':
            logInfo('createReviewPack repository selection cancelled');
            return;
          case 'ready': {
            const { repository, status } = inspection;
            logInfo(
              `Git context ready for ${repository.displayName}: ` +
                `${status.staged.length} staged, ${status.unstaged.length} unstaged, ` +
                `${status.untracked.length} untracked`,
            );
            await vscode.window.showInformationMessage(
              `ReviewLume: Repository "${repository.displayName}" selected — ` +
                `${status.staged.length} staged, ${status.unstaged.length} unstaged, ` +
                `${status.untracked.length} untracked. File selection will be added in P3.`,
            );
          }
        }
      } catch (error) {
        if (isErrorCode(error, 'GIT_CANCELLED')) {
          logInfo('createReviewPack Git inspection cancelled');
          return;
        }

        const code = getErrorCode(error);
        logWarn(`Git context inspection failed (${code})`);
        await vscode.window.showErrorMessage(
          'ReviewLume: Git context inspection failed. Check the ReviewLume output channel.',
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}

async function pickRepository(
  repositories: readonly DiscoveryResult[],
): Promise<DiscoveryResult | undefined> {
  const items: RepositoryQuickPickItem[] = repositories.map((repository, index) => ({
    label: repository.repository.displayName,
    description: `Repository ${index + 1} of ${repositories.length}`,
    detail: repository.repository.remoteUrl
      ? 'Origin remote configured'
      : 'Local repository without origin remote',
    discoveryResult: repository,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: 'ReviewLume: Select Repository',
    placeHolder: 'Choose exactly one Git repository for this review task',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.discoveryResult;
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}

function isErrorCode(error: unknown, code: string): boolean {
  return getErrorCode(error) === code;
}
