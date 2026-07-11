import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  excludeGeneratedReviewLumeExports,
  registerCreateReviewPack,
} from '../../commands/createReviewPack';
import { COMMANDS } from '../../constants';
import { initLogService } from '../../services/logService';
import type { GitContextService } from '../../services/gitContextService';
import type { FileSelectionService } from '../../services/fileSelectionService';
import type { GitStatusSnapshot } from '../../../../../packages/git-context/dist/index.js';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  getRegisteredCommand(command: string): (() => Promise<void>) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function registerCommand(inspection: unknown): {
  readonly handler: () => Promise<void>;
  readonly inspect: ReturnType<typeof vi.fn>;
} {
  const inspect = vi.fn().mockResolvedValue(inspection);
  const service = { inspect } as unknown as GitContextService;
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerCreateReviewPack(context, service);
  const handler = testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK);
  expect(handler).toBeDefined();
  return { handler: handler!, inspect };
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  initLogService();
});

describe('createReviewPack command', () => {
  it('does not inspect Git when no workspace is open', async () => {
    testing.setWorkspaceState([], true);
    const { handler, inspect } = registerCommand({ kind: 'no-repository' });

    await handler();

    expect(inspect).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No workspace folder'),
    );
  });

  it('does not spawn Git in Restricted Mode', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/repo' } }], false);
    const { handler, inspect } = registerCommand({ kind: 'no-repository' });

    await handler();

    expect(inspect).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Restricted Mode'),
    );
  });

  it('reports when Git is unavailable', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/repo' } }], true);
    const { handler, inspect } = registerCommand({ kind: 'git-unavailable' });

    await handler();

    expect(inspect).toHaveBeenCalledWith(['/repo'], expect.any(Function), expect.any(AbortSignal));
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Git is not available'),
    );
  });

  it('reports when no repository is found', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/workspace' } }], true);
    const { handler } = registerCommand({ kind: 'no-repository' });

    await handler();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No Git repository'),
    );
  });

  it('shows the selected repository and status counts', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/workspace' } }], true);
    const { handler } = registerCommand({
      kind: 'ready',
      repository: { displayName: 'ReviewLume' },
      status: {
        staged: [{ path: 'a.ts' }],
        unstaged: [{ path: 'b.ts' }, { path: 'c.ts' }],
        untracked: [],
      },
    });

    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('1 staged, 2 unstaged, 0 untracked'),
    );
  });

  it('initializes the P3 file tree before reporting success', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/workspace' } }], true);
    const repository = { displayName: 'ReviewLume', root: '/repo' };
    const status = { staged: [], unstaged: [], untracked: [] };
    const inspect = vi.fn().mockResolvedValue({ kind: 'ready', repository, status });
    const initialize = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    registerCreateReviewPack(
      context,
      { inspect } as unknown as GitContextService,
      { initialize, selectedCount: 3 } as unknown as FileSelectionService,
      refresh,
    );

    await testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK)!();

    expect(initialize).toHaveBeenCalledWith(
      repository,
      expect.objectContaining({ staged: [], unstaged: [], untracked: [], hasChanges: false }),
      expect.any(AbortSignal),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('3 file(s) selected'),
    );
  });

  it('removes generated exports from every Git status category before selection', () => {
    const repository = { root: '/repo' } as GitStatusSnapshot['repository'];
    const filtered = excludeGeneratedReviewLumeExports({
      repository,
      staged: [
        { path: '.reviewlume/exports/old/REVIEW_REQUEST.md', status: 'added' },
        { path: 'src/a.ts', status: 'modified' },
      ],
      unstaged: [
        { path: '.reviewlume/exports/pack.zip', status: 'modified' },
        { path: 'src/b.ts', status: 'modified' },
      ],
      untracked: [
        { path: '.reviewlume/exports/new/REVIEW_REQUEST.md', status: 'untracked' },
        { path: 'src/c.ts', status: 'untracked' },
      ],
      hasChanges: true,
    });

    expect(filtered.staged.map((entry) => entry.path)).toEqual(['src/a.ts']);
    expect(filtered.unstaged.map((entry) => entry.path)).toEqual(['src/b.ts']);
    expect(filtered.untracked.map((entry) => entry.path)).toEqual(['src/c.ts']);
    expect(filtered.hasChanges).toBe(true);
  });

  it('uses an explicit Quick Pick when the service requests repository selection', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/workspace' } }], true);
    const first = {
      folderPath: '/first',
      repository: { displayName: 'first', remoteUrl: undefined },
    };
    const second = {
      folderPath: '/second',
      repository: { displayName: 'second', remoteUrl: 'https://example.com/repo.git' },
    };
    vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) =>
      Array.from(items as readonly unknown[])[1] as never,
    );

    const inspect = vi.fn(async (_folders, picker) => {
      const selected = await picker([first, second]);
      expect(selected).toBe(second);
      return { kind: 'selection-cancelled' as const };
    });
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerCreateReviewPack(context, { inspect } as unknown as GitContextService);

    await testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK)!();

    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalled();
  });

  it('shows a generic error without exposing Git stderr', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/workspace' } }], true);
    const inspect = vi.fn().mockRejectedValue(
      Object.assign(new Error('https://user:secret@example.com/repo.git'), {
        code: 'GIT_COMMAND_ERROR',
      }),
    );
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerCreateReviewPack(context, { inspect } as unknown as GitContextService);

    await testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK)!();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'ReviewLume: Review initialization failed. Check the ReviewLume output channel.',
    );
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('secret'),
    );
  });
});
