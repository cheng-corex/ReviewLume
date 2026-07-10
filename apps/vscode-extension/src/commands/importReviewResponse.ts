import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo } from '../services/logService';

/**
 * Register the `reviewlume.importReviewResponse` command.
 *
 * P1 placeholder — shows a message indicating this feature is coming soon.
 */
export function registerImportReviewResponse(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(COMMANDS.IMPORT_REVIEW_RESPONSE, () => {
    const warning = getWorkspaceWarning();
    if (warning) {
      vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
      logInfo(`importReviewResponse blocked — ${warning}`);
      return;
    }

    vscode.window.showInformationMessage(
      'ReviewLume: Importing review responses is not yet implemented. ' +
      'This feature will allow you to import AI review results and track resolutions.',
    );
    logInfo('importReviewResponse invoked (stub)');
  });

  context.subscriptions.push(disposable);
}
