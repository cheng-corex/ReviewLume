/**
 * Vitest setup: mock the `vscode` module so that modules importing
 * from `vscode` can be loaded in unit tests.
 */
import { vi } from 'vitest';

vi.mock('vscode', () => {
  // Mutable workspace state — tests can override via `vi.mocked()`.
  const workspaceState: { folders: unknown[]; trusted: boolean } = {
    folders: [],
    trusted: false,
  };

  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
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
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    TreeItem: class MockTreeItem {
      label: string;
      constructor(label: string) { this.label = label; }
    },
    TreeItemCollapsibleState: {
      None: 0,
      Expanded: 1,
      Collapsed: 2,
    },
    EventEmitter: vi.fn(() => ({
      event: vi.fn(),
      fire: vi.fn(),
    })),
    ThemeIcon: class MockThemeIcon {
      id: string;
      constructor(id: string) { this.id = id; }
    },
  };
});
