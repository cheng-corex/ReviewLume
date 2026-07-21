/**
 * Vitest setup: mock the `vscode` module so unit tests can exercise command,
 * workspace-state, logging, progress, file-picking, configuration, locale,
 * clipboard, status-bar, dirty-editor, and tree-view behavior without an Extension Host.
 */
import { vi } from 'vitest';

vi.mock('vscode', () => {
  type CommandHandler = (...args: unknown[]) => unknown;
  type CheckboxHandler = (event: { items: Array<[unknown, number]> }) => unknown;

  const workspaceState: {
    folders: unknown[];
    trusted: boolean;
    configuration: Map<string, unknown>;
    language: string;
    textDocuments: unknown[];
  } = {
    folders: [],
    trusted: false,
    configuration: new Map(),
    language: 'en',
    textDocuments: [],
  };
  const registeredCommands = new Map<string, CommandHandler>();
  let checkboxHandler: CheckboxHandler | undefined;

  const clipboard = {
    readText: vi.fn(async () => ''),
    writeText: vi.fn(async () => undefined),
  };
  const statusBarItem = {
    name: '',
    command: undefined as unknown,
    text: '',
    tooltip: undefined as unknown,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };

  const testing = {
    setWorkspaceState(folders: unknown[], trusted: boolean): void {
      workspaceState.folders = folders;
      workspaceState.trusted = trusted;
    },
    setConfiguration(key: string, value: unknown): void {
      workspaceState.configuration.set(key, value);
    },
    setLanguage(language: string): void {
      workspaceState.language = language;
    },
    setTextDocuments(documents: unknown[]): void {
      workspaceState.textDocuments = documents;
    },
    getRegisteredCommand(command: string): CommandHandler | undefined {
      return registeredCommands.get(command);
    },
    getCheckboxHandler(): CheckboxHandler | undefined {
      return checkboxHandler;
    },
    reset(): void {
      workspaceState.folders = [];
      workspaceState.trusted = false;
      workspaceState.configuration.clear();
      workspaceState.language = 'en';
      workspaceState.textDocuments = [];
      registeredCommands.clear();
      checkboxHandler = undefined;
      clipboard.readText.mockReset().mockResolvedValue('');
      clipboard.writeText.mockReset().mockResolvedValue(undefined);
      statusBarItem.name = '';
      statusBarItem.command = undefined;
      statusBarItem.text = '';
      statusBarItem.tooltip = undefined;
      statusBarItem.show.mockReset();
      statusBarItem.hide.mockReset();
      statusBarItem.dispose.mockReset();
    },
  };

  class MockEventEmitter<T = unknown> {
    readonly event = vi.fn();
    readonly fire = vi.fn((_value?: T) => undefined);
    readonly dispose = vi.fn();
  }

  return {
    __testing: testing,
    window: {
      createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
      createStatusBarItem: vi.fn(() => statusBarItem),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      withProgress: vi.fn(async (_options, task) =>
        task(
          { report: vi.fn() },
          {
            isCancellationRequested: false,
            onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
          },
        ),
      ),
      createTreeView: vi.fn(() => ({
        dispose: vi.fn(),
        onDidChangeCheckboxState: vi.fn((handler: CheckboxHandler) => {
          checkboxHandler = handler;
          return { dispose: vi.fn() };
        }),
      })),
    },
    env: {
      get language() {
        return workspaceState.language;
      },
      clipboard,
    },
    ProgressLocation: { Notification: 15 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: {
      get workspaceFolders() {
        return workspaceState.folders.length > 0 ? workspaceState.folders : undefined;
      },
      get textDocuments() {
        return workspaceState.textDocuments;
      },
      get isTrusted() {
        return workspaceState.trusted;
      },
      getConfiguration: vi.fn((section: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
          const fullKey = `${section}.${key}`;
          return workspaceState.configuration.has(fullKey)
            ? (workspaceState.configuration.get(fullKey) as T)
            : defaultValue;
        },
        update: vi.fn(async (key: string, value: unknown) => {
          workspaceState.configuration.set(`${section}.${key}`, value);
        }),
      })),
      onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
      onDidGrantWorkspaceTrust: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      registerCommand: vi.fn((command: string, handler: CommandHandler) => {
        registeredCommands.set(command, handler);
        return { dispose: vi.fn() };
      }),
      executeCommand: vi.fn(),
    },
    Uri: {
      file: vi.fn((fsPath: string) => ({ fsPath, scheme: 'file' })),
      parse: vi.fn((value: string) => ({ value, scheme: value.split(':')[0] })),
    },
    TreeItem: class MockTreeItem {
      label: string;
      collapsibleState: number;
      description?: string;
      tooltip?: string;
      iconPath?: unknown;
      command?: unknown;
      checkboxState?: number;
      contextValue?: string;

      constructor(label: string, collapsibleState = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: { None: 0, Expanded: 1, Collapsed: 2 },
    TreeItemCheckboxState: { Unchecked: 0, Checked: 1 },
    EventEmitter: MockEventEmitter,
    ThemeIcon: class MockThemeIcon {
      id: string;
      constructor(id: string) {
        this.id = id;
      }
    },
  };
});
