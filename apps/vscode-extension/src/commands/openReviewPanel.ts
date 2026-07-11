/**
 * P6 — "ReviewLume: Open Review Panel" command.
 *
 * Creates or reveals the single review panel Webview and wires it to the
 * active FileSelectionService and SecurityReviewService.
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
        vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`openReviewPanel blocked — ${warning}`);
        return;
      }

      try {
        const panel = createOrShowReviewPanel(
          context.extensionUri,
          fileSelectionService,
          securityReviewService,
        );

        // Forward tree-view selection changes to the panel
        const refreshDisposable = vscode.commands.registerCommand(
          `${COMMANDS.OPEN_REVIEW_PANEL}.refresh`,
          () => {
            try {
              // We use postMessage through controller via the panel's webview
              panel.webview.postMessage({ type: 'refresh' });
            } catch {
              // Panel may have been disposed
            }
          },
        );

        panel.onDidDispose(() => {
          refreshDisposable.dispose();
        });

        logInfo('Review panel opened');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        logWarn(`Failed to open review panel: ${message}`);
        vscode.window.showErrorMessage(
          'ReviewLume: Failed to open the Review Panel.',
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}
