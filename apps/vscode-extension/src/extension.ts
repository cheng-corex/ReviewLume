import * as vscode from 'vscode';

/**
 * Activates the ReviewLume VS Code extension.
 *
 * Registers the minimum `reviewlume.hello` command so that the extension
 * can be verified in Extension Development Host and from an installed VSIX.
 *
 * The P0 entry point intentionally has no runtime workspace-package imports.
 * The VSIX is packaged with `--no-dependencies`, so keeping this entry point
 * self-contained prevents an installed extension from failing with
 * `MODULE_NOT_FOUND` before a bundling strategy is introduced.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('reviewlume.hello', () => {
      vscode.window.showInformationMessage('ReviewLume extension is active!');
    }),
  );

  // Log activation for diagnostics without including local paths or user data.
  console.log('ReviewLume extension activated');
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Cleanup if needed in future phases.
}
