import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo } from '../services/logService';

/**
 * Register the `reviewlume.createReviewPack` command.
 *
 * P1: This is a placeholder that validates workspace state and guides users
 * to the upcoming feature. Real implementation comes in P2+.
 */
export function registerCreateReviewPack(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(COMMANDS.CREATE_REVIEW_PACK, () => {
    const warning = getWorkspaceWarning();
    if (warning) {
      vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
      logInfo(`createReviewPack blocked — ${warning}`);
      return;
    }

    vscode.window.showInformationMessage(
      'ReviewLume: Review Pack creation is not yet implemented. ' +
      'This feature will be available in a future update to select Git changes and build a review pack.',
    );
    logInfo('createReviewPack invoked (stub)');
  });

  context.subscriptions.push(disposable);
}
