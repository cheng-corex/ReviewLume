import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCreateReviewPack } from '../../commands/createReviewPack';
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
  registerCreateReviewPack(context);
  const handler = testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK);
  expect(handler).toBeDefined();
  return handler!;
}

beforeEach(() => {
  vi.clearAllMocks();
  testing.reset();
  initLogService();
});

describe('createReviewPack command', () => {
  it('blocks when no workspace is open', () => {
    testing.setWorkspaceState([], true);
    registerCommand()();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No workspace folder'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('blocks repository inspection in Restricted Mode', () => {
    testing.setWorkspaceState([{}], false);
    registerCommand()();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Restricted Mode'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('shows an honest placeholder in a trusted workspace', () => {
    testing.setWorkspaceState([{}], true);
    registerCommand()();

    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('not yet implemented'),
    );
  });
});
