import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const CHATGPT_BROWSER_STATE = 'reviewlume.chatgpt.browser';

export type ChatGptBrowserPreference = 'default' | 'edge' | 'chrome';

interface BrowserChoice extends vscode.QuickPickItem {
  readonly preference: ChatGptBrowserPreference;
}

export interface BrowserLaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
}

interface BrowserRuntime {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly fileExists: (value: string) => boolean;
  readonly spawnProcess: (
    command: string,
    args: readonly string[],
  ) => ChildProcess;
  readonly openDefault: (url: string) => Promise<boolean>;
}

const DEFAULT_RUNTIME: BrowserRuntime = {
  platform: process.platform,
  env: process.env,
  fileExists: existsSync,
  spawnProcess: (command, args) =>
    spawn(command, [...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    }),
  openDefault: async (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
};

/** Opens ChatGPT in a user-selected browser without changing the system default browser. */
export class ChatGptBrowserService {
  readonly #context: vscode.ExtensionContext;
  readonly #runtime: BrowserRuntime;

  constructor(context: vscode.ExtensionContext, runtime: BrowserRuntime = DEFAULT_RUNTIME) {
    this.#context = context;
    this.#runtime = runtime;
  }

  async getPreference(): Promise<ChatGptBrowserPreference | undefined> {
    return normalizeBrowserPreference(
      this.#context.globalState.get<string>(CHATGPT_BROWSER_STATE),
    );
  }

  async getPreferenceLabel(): Promise<string> {
    const preference = await this.getPreference();
    return preference ? browserPreferenceLabel(preference) : 'Not selected';
  }

  async chooseBrowser(force = false): Promise<ChatGptBrowserPreference | undefined> {
    const stored = await this.getPreference();
    if (stored && !force) return stored;

    const choices: BrowserChoice[] = [
      {
        label: '$(globe) System default browser',
        description: 'Use the browser configured by Windows, macOS, or Linux',
        preference: 'default',
      },
      {
        label: '$(browser) Microsoft Edge',
        description: 'Open ChatGPT directly in Microsoft Edge',
        preference: 'edge',
      },
      {
        label: '$(browser) Google Chrome',
        description: 'Open ChatGPT directly in Google Chrome',
        preference: 'chrome',
      },
    ];
    const selected = await vscode.window.showQuickPick(choices, {
      title: 'Choose the browser ReviewLume uses for ChatGPT',
      placeHolder: stored
        ? `Current: ${browserPreferenceLabel(stored)}`
        : 'The choice is saved for future ReviewLume connections',
    });
    if (!selected) return undefined;
    await this.#context.globalState.update(CHATGPT_BROWSER_STATE, selected.preference);
    return selected.preference;
  }

  async openUrl(url: string): Promise<ChatGptBrowserPreference | undefined> {
    const preference = await this.chooseBrowser(false);
    if (!preference) return undefined;

    if (preference === 'default') {
      const opened = await this.#runtime.openDefault(url);
      if (!opened) throw new Error(`Could not open ${url} in the system default browser.`);
      return preference;
    }

    const candidates = resolveBrowserLaunchCommands(
      preference,
      this.#runtime.platform,
      this.#runtime.env,
      this.#runtime.fileExists,
      url,
    );
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        await spawnDetached(this.#runtime.spawnProcess(candidate.command, candidate.args));
        return preference;
      } catch (error) {
        lastError = error;
      }
    }

    const suffix = lastError instanceof Error ? ` ${lastError.message}` : '';
    throw new Error(
      `${browserPreferenceLabel(preference)} could not be started.${suffix} ` +
        'Choose another browser from the ReviewLume MCP menu.',
    );
  }
}

export function browserPreferenceLabel(preference: ChatGptBrowserPreference): string {
  switch (preference) {
    case 'edge':
      return 'Microsoft Edge';
    case 'chrome':
      return 'Google Chrome';
    default:
      return 'System default browser';
  }
}

export function normalizeBrowserPreference(
  value: string | undefined,
): ChatGptBrowserPreference | undefined {
  return value === 'default' || value === 'edge' || value === 'chrome' ? value : undefined;
}

export function resolveBrowserLaunchCommands(
  preference: Exclude<ChatGptBrowserPreference, 'default'>,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  fileExists: (value: string) => boolean,
  url: string,
): BrowserLaunchCommand[] {
  if (platform === 'darwin') {
    return [
      {
        command: '/usr/bin/open',
        args: ['-a', preference === 'edge' ? 'Microsoft Edge' : 'Google Chrome', url],
      },
    ];
  }

  if (platform === 'win32') {
    const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter(
      (value): value is string => Boolean(value),
    );
    const relative =
      preference === 'edge'
        ? path.join('Microsoft', 'Edge', 'Application', 'msedge.exe')
        : path.join('Google', 'Chrome', 'Application', 'chrome.exe');
    const knownPaths = roots.map((root) => path.join(root, relative)).filter(fileExists);
    const pathCommand = preference === 'edge' ? 'msedge.exe' : 'chrome.exe';
    return [
      ...knownPaths.map((command) => ({ command, args: [url] as readonly string[] })),
      { command: pathCommand, args: [url] },
    ];
  }

  const commands =
    preference === 'edge'
      ? ['microsoft-edge', 'microsoft-edge-stable']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  return commands.map((command) => ({ command, args: [url] }));
}

async function spawnDetached(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    child.once('error', onError);
    child.once('spawn', () => {
      child.off('error', onError);
      child.unref();
      resolve();
    });
  });
}
