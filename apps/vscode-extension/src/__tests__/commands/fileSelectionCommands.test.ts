import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFileSelectionCommands } from '../../commands/fileSelectionCommands';
import { COMMANDS } from '../../constants';
import type { FileSelectionService } from '../../services/fileSelectionService';
import { initLogService } from '../../services/logService';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  getRegisteredCommand(command: string): (() => Promise<void>) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function service(overrides?: Partial<FileSelectionService>): FileSelectionService {
  return {
    hasSession: true,
    repository: { root: '/repo', displayName: 'fixture' },
    addManualFiles: vi.fn().mockResolvedValue({ added: ['src/helper.ts'], skipped: [] }),
    recommendTests: vi.fn().mockResolvedValue(['src/helper.test.ts']),
    ...overrides,
  } as unknown as FileSelectionService;
}

function registerCommands(fileSelectionService: FileSelectionService) {
  const refresh = vi.fn();
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerFileSelectionCommands(context, fileSelectionService, refresh);
  return { refresh };
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  testing.setWorkspaceState([{ uri: { fsPath: '/repo' } }], true);
  initLogService();
});

describe('file-selection commands', () => {
  it('blocks manual selection before a review session exists', async () => {
    const fileSelectionService = service({ hasSession: false });
    registerCommands(fileSelectionService);

    await testing.getRegisteredCommand(COMMANDS.ADD_RELATED_FILES)!();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Create a Review Pack'),
    );
    expect(vscode.window.showOpenDialog).not.toHaveBeenCalled();
  });

  it('adds selected repository-local files and refreshes the tree', async () => {
    const fileSelectionService = service();
    vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([
      { fsPath: '/repo/src/helper.ts' } as vscode.Uri,
    ]);
    const { refresh } = registerCommands(fileSelectionService);

    await testing.getRegisteredCommand(COMMANDS.ADD_RELATED_FILES)!();

    expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
      }),
    );
    expect(fileSelectionService.addManualFiles).toHaveBeenCalledWith(
      ['/repo/src/helper.ts'],
      expect.any(AbortSignal),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 related file(s) added'),
    );
  });

  it('adds test recommendations as candidates and refreshes the tree', async () => {
    const fileSelectionService = service();
    const { refresh } = registerCommands(fileSelectionService);

    await testing.getRegisteredCommand(COMMANDS.RECOMMEND_TEST_FILES)!();

    expect(fileSelectionService.recommendTests).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 related test file(s)'),
    );
  });

  it('does not expose rejected file paths in UI errors', async () => {
    const addManualFiles = vi.fn().mockRejectedValue(
      Object.assign(new Error('/outside/private/path.ts'), {
        code: 'CROSS_REPOSITORY',
      }),
    );
    const fileSelectionService = service({ addManualFiles } as Partial<FileSelectionService>);
    vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([
      { fsPath: '/outside/private/path.ts' } as vscode.Uri,
    ]);
    registerCommands(fileSelectionService);

    await testing.getRegisteredCommand(COMMANDS.ADD_RELATED_FILES)!();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.not.stringContaining('/outside/private/path.ts'),
    );
  });
});
