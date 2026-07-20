import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { logInfo, logWarn } from '../services/logService';
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

      const reviewId = await selectReviewIdFromHistory();
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
        reviewId,
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

async function selectReviewIdFromHistory(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    await vscode.window.showWarningMessage(
      'ReviewLume: Open the repository workspace that contains the review history first.',
    );
    return undefined;
  }

  const historyService = new HistoryService();
  const entries: HistoryEntry[] = [];
  for (const folder of workspaceFolders) {
    try {
      entries.push(...(await historyService.list(folder.uri.fsPath)));
    } catch (error) {
      logWarn(`Failed to list browser bridge review history (${getErrorCode(error)})`);
    }
  }

  const usableEntries = entries.filter((entry) => entry.integrity !== 'corrupt');
  if (usableEntries.length === 0) {
    await vscode.window.showWarningMessage(
      'ReviewLume: No usable review history was found in the current workspace.',
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    usableEntries.map((entry) => ({
      label: entry.metadata.repositoryDisplayName,
      description: formatDate(entry.metadata.createdAt),
      detail: `${entry.metadata.reviewId} · ${entry.metadata.fileCount} file(s) · ${entry.integrity}`,
      reviewId: entry.metadata.reviewId,
    })),
    {
      title: 'Select ReviewLume review',
      placeHolder: 'Search by repository, date, or review ID',
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  return picked?.reviewId;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : iso;
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'UNKNOWN');
  }
  return 'UNKNOWN';
}
