import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOpenReviewHistory } from '../../commands/openReviewHistory';
import { COMMANDS } from '../../constants';
import { initLogService } from '../../services/logService';
import type { GitContextService } from '../../services/gitContextService';
import type { FileSelectionService } from '../../services/fileSelectionService';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  getRegisteredCommand(command: string): (() => Promise<void>) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function registerCommand(options?: {
  inspection?: unknown;
  hasSession?: boolean;
  repositoryRoot?: string;
}): { handler: () => Promise<void>; inspect: ReturnType<typeof vi.fn> } {
  const inspect = vi.fn().mockResolvedValue(
    options?.inspection ?? { kind: 'no-repository' },
  );
  const gitService = { inspect } as unknown as GitContextService;

  const fileService = {
    hasSession: options?.hasSession ?? false,
    repository: options?.repositoryRoot
      ? { root: options.repositoryRoot, displayName: 'test-repo' }
      : undefined,
  } as unknown as FileSelectionService;

  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerOpenReviewHistory(context, fileService, gitService);
  const handler = testing.getRegisteredCommand(COMMANDS.OPEN_REVIEW_HISTORY);
  expect(handler).toBeDefined();
  return { handler: handler!, inspect };
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  initLogService();
});

describe('openReviewHistory command', () => {
  it('blocks in Restricted Mode', async () => {
    testing.setWorkspaceState([{}], false);
    const { handler } = registerCommand();
    await handler();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Restricted Mode'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('shows empty history message when no workspace folder is open', async () => {
    testing.setWorkspaceState([], true);
    const { handler } = registerCommand();
    await handler();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No workspace folder'),
    );
  });

  it('shows no-history prompt when Git workspace has no review history', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/test' } }], true);
    const { handler } = registerCommand({
      inspection: {
        kind: 'ready',
        repository: { root: '/test', displayName: 'test-repo' },
        status: { staged: [], unstaged: [], untracked: [], hasChanges: false },
      },
    });
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No review history found'),
      expect.any(String),
    );
  });
});
