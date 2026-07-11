import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerImportReviewResponse } from '../../commands/importReviewResponse';
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

function registerCommand(inspection?: unknown): {
  handler: () => Promise<void>;
  inspect: ReturnType<typeof vi.fn>;
} {
  const inspect = vi.fn().mockResolvedValue(
    inspection ?? { kind: 'no-repository' },
  );
  const gitService = { inspect } as unknown as GitContextService;
  const fileService = { hasSession: false } as unknown as FileSelectionService;
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerImportReviewResponse(context, fileService, gitService);
  const handler = testing.getRegisteredCommand(COMMANDS.IMPORT_REVIEW_RESPONSE);
  expect(handler).toBeDefined();
  return { handler: handler!, inspect };
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  initLogService();
});

describe('importReviewResponse command', () => {
  it('blocks in Restricted Mode', async () => {
    testing.setWorkspaceState([{}], false);
    const { handler } = registerCommand();
    await handler();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Restricted Mode'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('shows no-workspace message when no folder is open', async () => {
    testing.setWorkspaceState([], true);
    const { handler } = registerCommand();
    await handler();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No workspace folder'),
    );
  });

  it('shows no-history prompt when no review history exists', async () => {
    testing.setWorkspaceState([{ uri: { fsPath: '/test' } }], true);
    const { handler } = registerCommand({
      kind: 'ready',
      repository: { root: '/test', displayName: 'test-repo' },
      status: { staged: [], unstaged: [], untracked: [], hasChanges: false },
    });
    await handler();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('No review history found'),
    );
  });
});
