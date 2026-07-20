import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { logInfo, logWarn } from '../services/logService';
import { BrowserBridgeService } from '../services/browserBridgeService';

const TARGET_SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com'] as const;
const SITE_URLS: Readonly<Record<(typeof TARGET_SITES)[number], string>> = {
  'chatgpt.com': 'https://chatgpt.com/',
  'claude.ai': 'https://claude.ai/',
  'gemini.google.com': 'https://gemini.google.com/',
};

interface BridgeAction extends vscode.QuickPickItem {
  readonly action:
    | 'start'
    | 'pair'
    | 'open-chatgpt'
    | 'open-claude'
    | 'open-gemini'
    | 'send'
    | 'revoke'
    | 'logs'
    | 'stop';
}

export function registerBrowserBridgeCommands(
  context: vscode.ExtensionContext,
  bridge: BrowserBridgeService,
): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.name = 'ReviewLume Browser Bridge';
  status.command = COMMANDS.BROWSER_BRIDGE_MENU;
  status.show();
  context.subscriptions.push(status);

  const refreshStatus = (): void => {
    const address = bridge.address;
    status.text = address
      ? `$(radio-tower) ReviewLume (${address.port})`
      : '$(circle-slash) ReviewLume Bridge';
    status.tooltip = address
      ? `ReviewLume browser bridge is running on ${address.baseUrl}. Click for actions.`
      : 'ReviewLume browser bridge is stopped. Click to start or open actions.';
  };
  refreshStatus();

  const start = async (showMessage = true): Promise<void> => {
    const address = await bridge.start();
    refreshStatus();
    logInfo(`Browser bridge started on ${address.baseUrl}`);
    if (showMessage) {
      await vscode.window.showInformationMessage(
        `ReviewLume browser bridge is running on ${address.baseUrl}.`,
      );
    }
  };

  const pair = async (): Promise<void> => {
    const pairing = await bridge.createPairingCode();
    refreshStatus();
    await vscode.env.clipboard.writeText(pairing.code);
    logInfo(`Browser pairing code created; expires at ${pairing.expiresAt}`);
    await vscode.window.showInformationMessage(
      `Pairing code ${pairing.code} copied. Bridge ${pairing.address.baseUrl}. Open the ReviewLume browser extension and confirm pairing.`,
      'Open ChatGPT',
    ).then(async (choice) => {
      if (choice === 'Open ChatGPT') await openSite('chatgpt.com');
    });
  };

  const revoke = async (): Promise<void> => {
    bridge.revokeAll();
    logInfo('All browser bridge sessions revoked');
    await vscode.window.showInformationMessage('All ReviewLume browser sessions were revoked.');
  };

  const stop = async (): Promise<void> => {
    await bridge.stop();
    refreshStatus();
    logInfo('Browser bridge stopped');
    await vscode.window.showInformationMessage('ReviewLume browser bridge stopped.');
  };

  const showMenu = async (): Promise<void> => {
    const address = bridge.address;
    const pairedCount = bridge.getPairedExtensions().length;
    const items: BridgeAction[] = [];
    if (!address) {
      items.push({
        label: '$(play) Start Browser Bridge',
        description: 'Start the local loopback service',
        action: 'start',
      });
    }
    items.push(
      {
        label: '$(plug) Connect Browser Extension',
        description: pairedCount > 0 ? `${pairedCount} active connection(s)` : 'Create a short-lived pairing code',
        action: 'pair',
      },
      {
        label: '$(globe) Open ChatGPT',
        description: 'chatgpt.com',
        action: 'open-chatgpt',
      },
      {
        label: '$(globe) Open Claude',
        description: 'claude.ai',
        action: 'open-claude',
      },
      {
        label: '$(globe) Open Gemini',
        description: 'gemini.google.com',
        action: 'open-gemini',
      },
      {
        label: '$(send) Send Review Prompt',
        description: pairedCount > 0 ? 'Queue a prompt without submitting it' : 'Requires a paired browser extension',
        action: 'send',
      },
      {
        label: '$(debug-disconnect) Revoke Browser Connections',
        description: 'Invalidate all active sessions',
        action: 'revoke',
      },
      {
        label: '$(output) Show ReviewLume Logs',
        description: 'Open the ReviewLume output channel',
        action: 'logs',
      },
    );
    if (address) {
      items.push({
        label: '$(close) Stop Browser Bridge',
        description: address.baseUrl,
        action: 'stop',
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: address
        ? `ReviewLume Browser Bridge (port ${address.port})`
        : 'ReviewLume Browser Bridge',
      placeHolder: 'Choose a browser bridge action',
    });
    if (!picked) return;

    switch (picked.action) {
      case 'start': await start(); break;
      case 'pair': await pair(); break;
      case 'open-chatgpt': await openSite('chatgpt.com'); break;
      case 'open-claude': await openSite('claude.ai'); break;
      case 'open-gemini': await openSite('gemini.google.com'); break;
      case 'send': await vscode.commands.executeCommand(COMMANDS.SEND_PROMPT_TO_BROWSER); break;
      case 'revoke': await revoke(); break;
      case 'logs': await vscode.commands.executeCommand('workbench.action.output.show', 'ReviewLume'); break;
      case 'stop': await stop(); break;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.BROWSER_BRIDGE_MENU, showMenu),
    vscode.commands.registerCommand(COMMANDS.START_BROWSER_BRIDGE, () => start()),
    vscode.commands.registerCommand(COMMANDS.PAIR_BROWSER_EXTENSION, pair),
    vscode.commands.registerCommand(COMMANDS.REVOKE_BROWSER_SESSIONS, revoke),
    vscode.commands.registerCommand(COMMANDS.SEND_PROMPT_TO_BROWSER, async () => {
      const paired = bridge.getPairedExtensions();
      if (paired.length === 0) {
        const choice = await vscode.window.showWarningMessage(
          'No active browser extension is paired.',
          'Connect Browser Extension',
        );
        if (choice === 'Connect Browser Extension') await pair();
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
      const openChoice = await vscode.window.showInformationMessage(
        'Prompt queued. ReviewLume will fill it but never submit it.',
        `Open ${siteLabel(targetSite)}`,
      );
      if (openChoice) await openSite(targetSite);
    }),
  );
}

async function openSite(site: (typeof TARGET_SITES)[number]): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(SITE_URLS[site]));
}

function siteLabel(site: (typeof TARGET_SITES)[number]): string {
  return site === 'chatgpt.com' ? 'ChatGPT' : site === 'claude.ai' ? 'Claude' : 'Gemini';
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
