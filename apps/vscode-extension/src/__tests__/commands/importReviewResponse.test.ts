import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerImportReviewResponse } from '../../commands/importReviewResponse';
import { COMMANDS } from '../../constants';
import { initLogService } from '../../services/logService';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  getRegisteredCommand(command: string): (() => unknown) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function registerCommand(): () => unknown {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerImportReviewResponse(context);
  const handler = testing.getRegisteredCommand(COMMANDS.IMPORT_REVIEW_RESPONSE);
  expect(handler).toBeDefined();
  return handler!;
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  initLogService();
});

describe('importReviewResponse command', () => {
  it('blocks in Restricted Mode', () => {
    testing.setWorkspaceState([{}], false);
    registerCommand()();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Restricted Mode'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('reports that import is not implemented without pretending success', () => {
    testing.setWorkspaceState([{}], true);
    registerCommand()();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('not yet implemented'),
    );
  });
});
