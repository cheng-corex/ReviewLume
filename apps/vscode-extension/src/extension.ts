import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { initLogService, logInfo } from './services/logService';
import { registerCreateReviewPack } from './commands/createReviewPack';
import { registerOpenReviewHistory } from './commands/openReviewHistory';
import { registerImportReviewResponse } from './commands/importReviewResponse';
import { registerReviewLumeTreeView } from './views/reviewLumeTreeProvider';

/**
 * Activates the ReviewLume VS Code extension.
 *
 * P1 responsibilities:
 * - Create the OutputChannel for diagnostic logging.
 * - Register all P1 commands (Create Review Pack, Open Review History,
 *   Import Review Response) plus the P0 hello command.
 * - Register the Activity Bar tree view.
 * - Support Workspace Trust checks in all commands.
 * - Provide clear empty-state, no-workspace, and restricted-mode messages.
 */
export function activate(context: vscode.ExtensionContext): void {
  // 1. Initialise logging
  const channel = initLogService();
  context.subscriptions.push(channel);
  logInfo('ReviewLume extension activating');

  // 2. Register P0 hello command (kept for backward compatibility)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.HELLO, () => {
      vscode.window.showInformationMessage('ReviewLume extension is active!');
      logInfo('hello command invoked');
    }),
  );

  // 3. Register P1 commands
  registerCreateReviewPack(context);
  registerOpenReviewHistory(context);
  registerImportReviewResponse(context);

  // 4. Register the Activity Bar tree view
  registerReviewLumeTreeView(context);

  logInfo('ReviewLume extension activated');
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Cleanup will be added in future phases.
}
