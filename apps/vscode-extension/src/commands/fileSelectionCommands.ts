import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { FileSelectionError, FileSelectionService } from '../services/fileSelectionService';
import { logInfo, logWarn } from '../services/logService';
import { getWorkspaceWarning } from '../services/workspaceService';

export function registerFileSelectionCommands(
  context: vscode.ExtensionContext,
  fileSelectionService: FileSelectionService,
  onSelectionChanged: () => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.ADD_RELATED_FILES, async () => {
      if (!ensureSelectionAvailable(fileSelectionService)) return;

      const repository = fileSelectionService.repository!;
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        defaultUri: vscode.Uri.file(repository.root),
        openLabel: 'Add Related Files',
        title: 'ReviewLume: Add Related Files',
      });
      if (!selected || selected.length === 0) return;

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'ReviewLume: Validating related files',
            cancellable: true,
          },
          async (_progress, token) => {
            const controller = new AbortController();
            const cancellation = token.onCancellationRequested(() => controller.abort());
            try {
              return await fileSelectionService.addManualFiles(
                selected.map((uri) => uri.fsPath),
                controller.signal,
              );
            } finally {
              cancellation.dispose();
            }
          },
        );

        onSelectionChanged();
        logInfo(
          `Related files processed: ${result.added.length} added, ${result.skipped.length} skipped`,
        );
        await vscode.window.showInformationMessage(
          `ReviewLume: ${result.added.length} related file(s) added; ` +
            `${result.skipped.length} skipped by ignore rules or existing selection.`,
        );
      } catch (error) {
        await handleSelectionError(error, 'Related files could not be added.');
      }
    }),
    vscode.commands.registerCommand(COMMANDS.RECOMMEND_TEST_FILES, async () => {
      if (!ensureSelectionAvailable(fileSelectionService)) return;

      try {
        const recommendations = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'ReviewLume: Finding related tests',
            cancellable: true,
          },
          async (_progress, token) => {
            const controller = new AbortController();
            const cancellation = token.onCancellationRequested(() => controller.abort());
            try {
              return await fileSelectionService.recommendTests(controller.signal);
            } finally {
              cancellation.dispose();
            }
          },
        );

        onSelectionChanged();
        logInfo(`Test recommendation completed: ${recommendations.length} candidate(s)`);
        await vscode.window.showInformationMessage(
          recommendations.length === 0
            ? 'ReviewLume: No related test files were found.'
            : `ReviewLume: ${recommendations.length} related test file(s) were added as unchecked recommendations.`,
        );
      } catch (error) {
        await handleSelectionError(error, 'Test recommendation failed.');
      }
    }),
  );
}

function ensureSelectionAvailable(fileSelectionService: FileSelectionService): boolean {
  const warning = getWorkspaceWarning();
  if (warning) {
    void vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return false;
  }

  if (!fileSelectionService.hasSession) {
    void vscode.window.showWarningMessage(
      'ReviewLume: Create a Review Pack before selecting related files.',
    );
    return false;
  }

  return true;
}

async function handleSelectionError(error: unknown, fallback: string): Promise<void> {
  if (getErrorCode(error) === 'GIT_CANCELLED') {
    logInfo('File selection operation cancelled');
    return;
  }

  const code = getErrorCode(error);
  logWarn(`File selection operation failed (${code})`);

  const message =
    error instanceof FileSelectionError
      ? userFacingSelectionError(error.code)
      : `ReviewLume: ${fallback} Check the ReviewLume output channel.`;
  await vscode.window.showErrorMessage(message);
}

function userFacingSelectionError(code: FileSelectionError['code']): string {
  switch (code) {
    case 'CROSS_REPOSITORY':
      return 'ReviewLume: Files outside the selected repository cannot be added.';
    case 'SYMLINK_ESCAPE':
      return 'ReviewLume: A selected symbolic link resolves outside the repository and was rejected.';
    case 'NOT_A_FILE':
      return 'ReviewLume: Only regular files can be added.';
    case 'GIT_METADATA':
      return 'ReviewLume: Files inside .git cannot be added.';
    case 'NO_FILE_SELECTION':
      return 'ReviewLume: Create a Review Pack before selecting related files.';
    case 'INVALID_REPOSITORY_PATH':
      return 'ReviewLume: One of the selected repository paths is invalid.';
    case 'FILE_TOO_LARGE':
      return 'ReviewLume: A selected context file exceeds the safe size limit.';
    case 'BINARY_FILE':
      return 'ReviewLume: Binary files cannot be added as review context.';
  }
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
