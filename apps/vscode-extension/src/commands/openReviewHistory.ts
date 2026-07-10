import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo } from '../services/logService';

/**
 * Register the `reviewlume.openReviewHistory` command.
 *
 * P1 placeholder — shows a message indicating this feature is coming soon.
 */
export function registerOpenReviewHistory(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(COMMANDS.OPEN_REVIEW_HISTORY, () => {
    const warning = getWorkspaceWarning();
    if (warning) {
      vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
      logInfo(`openReviewHistory blocked — ${warning}`);
      return;
    }

    vscode.window.showInformationMessage(
      'ReviewLume: Review history is not yet implemented. ' +
      'This feature will allow you to browse past review sessions and their results.',
    );
    logInfo('openReviewHistory invoked (stub)');
  });

  context.subscriptions.push(disposable);
}
