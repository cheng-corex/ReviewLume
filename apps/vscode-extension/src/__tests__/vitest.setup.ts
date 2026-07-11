/**
 * Vitest setup: mock the `vscode` module so unit tests can exercise command,
 * workspace-state, logging, progress, and tree-view behavior without an
 * Extension Host.
 */
import { vi } from 'vitest';

vi.mock('vscode', () => {
  type CommandHandler = (...args: unknown[]) => unknown;

  const workspaceState: { folders: unknown[]; trusted: boolean } = {
    folders: [],
    trusted: false,
  };
  const registeredCommands = new Map<string, CommandHandler>();

  const testing = {
    setWorkspaceState(folders: unknown[], trusted: boolean): void {
      workspaceState.folders = folders;
      workspaceState.trusted = trusted;
    },
    getRegisteredCommand(command: string): CommandHandler | undefined {
      return registeredCommands.get(command);
    },
    reset(): void {
      workspaceState.folders = [];
      workspaceState.trusted = false;
      registeredCommands.clear();
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
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showQuickPick: vi.fn(),
      withProgress: vi.fn(async (_options, task) =>
        task(
          { report: vi.fn() },
          {
            isCancellationRequested: false,
            onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
          },
        ),
      ),
      createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    },
    ProgressLocation: {
      Notification: 15,
    },
    workspace: {
      get workspaceFolders() {
        return workspaceState.folders.length > 0 ? workspaceState.folders : undefined;
      },
      get isTrusted() {
        return workspaceState.trusted;
      },
      onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
      onDidGrantWorkspaceTrust: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      registerCommand: vi.fn((command: string, handler: CommandHandler) => {
        registeredCommands.set(command, handler);
        return { dispose: vi.fn() };
      }),
    },
    TreeItem: class MockTreeItem {
      label: string;
      collapsibleState: number;
      description?: string;
      tooltip?: string;
      iconPath?: unknown;
      command?: unknown;

      constructor(label: string, collapsibleState = 0) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: {
      None: 0,
      Expanded: 1,
      Collapsed: 2,
    },
    EventEmitter: MockEventEmitter,
    ThemeIcon: class MockThemeIcon {
      id: string;

      constructor(id: string) {
        this.id = id;
      }
    },
  };
});
