import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { logInfo } from '../services/logService';
import { BrowserBridgeService } from '../services/browserBridgeService';

const TARGET_SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com'] as const;

export function registerBrowserBridgeCommands(
  context: vscode.ExtensionContext,
  bridge: BrowserBridgeService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.START_BROWSER_BRIDGE, async () => {
      const address = await bridge.start();
      logInfo(`Browser bridge started on ${address.baseUrl}`);
      await vscode.window.showInformationMessage(
        `ReviewLume browser bridge is running on ${address.baseUrl}.`,
      );
    }),
    vscode.commands.registerCommand(COMMANDS.PAIR_BROWSER_EXTENSION, async () => {
      const pairing = await bridge.createPairingCode();
      await vscode.env.clipboard.writeText(pairing.code);
      logInfo(`Browser pairing code created; expires at ${pairing.expiresAt}`);
      await vscode.window.showInformationMessage(
        `Pairing code ${pairing.code} copied to the clipboard. Bridge: ${pairing.address.baseUrl}`,
      );
    }),
    vscode.commands.registerCommand(COMMANDS.REVOKE_BROWSER_SESSIONS, async () => {
      bridge.revokeAll();
      logInfo('All browser bridge sessions revoked');
      await vscode.window.showInformationMessage('All ReviewLume browser sessions were revoked.');
    }),
    vscode.commands.registerCommand(COMMANDS.SEND_PROMPT_TO_BROWSER, async () => {
      const paired = bridge.getPairedExtensions();
      if (paired.length === 0) {
        await vscode.window.showWarningMessage(
          'No active browser extension is paired. Run “ReviewLume: Pair Browser Extension” first.',
        );
        return;
      }

      const extensionInstanceId =
        paired.length === 1
          ? paired[0]
          : await vscode.window.showQuickPick([...paired], {
              title: 'Select paired browser extension',
              placeHolder: 'Extension instance ID',
            });
      if (!extensionInstanceId) return;

      const reviewId = await vscode.window.showInputBox({
        title: 'Review ID',
        prompt: 'Enter the ReviewLume review ID bound to this prompt.',
        validateInput: (value) => (value.trim() ? undefined : 'Review ID is required.'),
      });
      if (!reviewId) return;

      const targetSite = await vscode.window.showQuickPick([...TARGET_SITES], {
        title: 'Target AI site',
        placeHolder: 'The browser extension will only fill this site.',
      });
      if (!targetSite) return;

      const prompt = await vscode.window.showInputBox({
        title: 'Prompt to fill in browser',
        prompt: 'ReviewLume only fills the prompt field; it never submits automatically.',
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : 'Prompt is required.'),
      });
      if (!prompt) return;

      await bridge.publishPrompt(extensionInstanceId, {
        reviewId: reviewId.trim(),
        targetSite,
        prompt,
      });
      logInfo(`Prompt queued for paired browser extension ${extensionInstanceId}`);
      await vscode.window.showInformationMessage(
        'Prompt queued for the paired browser extension. It will be filled but not submitted.',
      );
    }),
  );
}
