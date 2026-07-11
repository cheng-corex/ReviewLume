/**
 * P6 — "ReviewLume: Open Review Panel" command.
 */
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { getWorkspaceWarning } from '../services/workspaceService';
import { createOrShowReviewPanel } from '../webview/reviewPanel';
import type { FileSelectionService } from '../services/fileSelectionService';
import type { SecurityReviewService } from '../services/securityReviewService';
import { logInfo, logWarn } from '../services/logService';

export function registerOpenReviewPanel(
  context: vscode.ExtensionContext,
  fileSelectionService: FileSelectionService,
  securityReviewService: SecurityReviewService,
): void {
  const disposable = vscode.commands.registerCommand(
    COMMANDS.OPEN_REVIEW_PANEL,
    () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        void vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`openReviewPanel blocked — ${warning}`);
        return;
      }

      try {
        createOrShowReviewPanel(
          context.extensionUri,
          fileSelectionService,
          securityReviewService,
        );
        logInfo('Review panel opened');
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'UNKNOWN';
        logWarn(`Failed to open review panel (${code})`);
        void vscode.window.showErrorMessage(
          'ReviewLume: Failed to open the Review Panel.',
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}
