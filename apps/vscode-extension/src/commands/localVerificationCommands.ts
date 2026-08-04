import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { LocalVerificationService } from '../services/localVerificationService';
import { logError } from '../services/logService';

interface WorkspaceFolderItem extends vscode.QuickPickItem {
  readonly folder: vscode.WorkspaceFolder;
}

export function registerLocalVerificationCommands(
  context: vscode.ExtensionContext,
  verification: LocalVerificationService,
): void {
  const safely = (operation: () => Promise<unknown>) => async (): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ReviewLume local verification failed.';
      logError('ReviewLume local verification command failed', error instanceof Error ? error : undefined);
      await vscode.window.showErrorMessage(message);
    }
  };

  const withFolder = (
    operation: (folder: vscode.WorkspaceFolder) => Promise<unknown>,
  ): (() => Promise<void>) =>
    safely(async () => {
      const folder = await chooseWorkspaceFolder();
      if (folder) await operation(folder);
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.CONFIGURE_LOCAL_VERIFICATION,
      withFolder((folder) => verification.configure(folder, true)),
    ),
    vscode.commands.registerCommand(
      COMMANDS.RUN_LOCAL_VERIFICATION,
      withFolder((folder) => verification.runApproved(folder)),
    ),
    vscode.commands.registerCommand(
      COMMANDS.CLEAR_LOCAL_VERIFICATION,
      withFolder((folder) => verification.clearApproval(folder)),
    ),
  );
}

async function chooseWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    await vscode.window.showWarningMessage('Open a folder inside a Git repository first.');
    return undefined;
  }
  if (folders.length === 1) return folders[0];

  const selected = await vscode.window.showQuickPick<WorkspaceFolderItem>(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    {
      title: 'Choose the repository for ReviewLume local verification',
      placeHolder: 'One verification approval is bound to one Git repository',
    },
  );
  return selected?.folder;
}
