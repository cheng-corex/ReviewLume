import * as vscode from 'vscode';
import { CONFIG_NAMESPACE, CURRENT_SCHEMA_VERSION } from '@reviewlume/core';

/**
 * Activates the ReviewLume VS Code extension.
 *
 * Registers the minimum `reviewlume.hello` command so that the extension
 * can be verified in Extension Development Host.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('reviewlume.hello', () => {
      const message = `ReviewLume extension is active! (schema v${CURRENT_SCHEMA_VERSION})`;
      vscode.window.showInformationMessage(message);
    }),
  );

  // Log activation for diagnostics
  console.log(`ReviewLume extension activated (namespace: ${CONFIG_NAMESPACE})`);
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Cleanup if needed in future phases.
}
