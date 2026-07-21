import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSafeToolCallObserver,
  createWriteConfirmationHandler,
} from './mcpConnectorService';
import type { McpWriteConfirmationRequest } from './mcpWritableRepositoryTools';

interface VscodeTesting {
  setTextDocuments(documents: unknown[]): void;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;
const request: McpWriteConfirmationRequest = {
  repository: 'fixture',
  reason: 'Fix the reviewed issue.',
  files: [
    {
      path: 'src/example.ts',
      absolutePath: '/workspace/fixture/src/example.ts',
      action: 'replace',
      oldBytes: 10,
      newBytes: 12,
    },
  ],
};

function dirtyDocument() {
  return {
    isDirty: true,
    uri: {
      scheme: 'file',
      fsPath: '/workspace/fixture/src/example.ts',
    },
  };
}

describe('createSafeToolCallObserver', () => {
  it('forwards the tool name when observability is healthy', () => {
    const observer = vi.fn();
    const safeObserver = createSafeToolCallObserver(observer);

    safeObserver('repository_summary');

    expect(observer).toHaveBeenCalledWith('repository_summary');
  });

  it('does not let a disposed or failing log channel break tools/call', () => {
    const safeObserver = createSafeToolCallObserver(() => {
      throw new Error('OutputChannel has been disposed');
    });

    expect(() => safeObserver('git_status')).not.toThrow();
  });
});

describe('createWriteConfirmationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testing.reset();
  });

  it('approves only after the user selects Apply changes', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Apply changes' as never);

    await expect(createWriteConfirmationHandler('fixture')(request)).resolves.toEqual({
      approved: true,
    });
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'ChatGPT requests writing 1 file in fixture.',
      expect.objectContaining({ modal: true }),
      'Apply changes',
    );
  });

  it('blocks a dirty target before showing an approval prompt', async () => {
    testing.setTextDocuments([dirtyDocument()]);

    await expect(createWriteConfirmationHandler('fixture')(request)).resolves.toMatchObject({
      approved: false,
      message: expect.stringContaining('unsaved VS Code changes'),
    });
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('src/example.ts'),
    );
  });

  it('rechecks dirty targets after the modal confirmation', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockImplementationOnce(async () => {
      testing.setTextDocuments([dirtyDocument()]);
      return 'Apply changes' as never;
    });

    await expect(createWriteConfirmationHandler('fixture')(request)).resolves.toMatchObject({
      approved: false,
      message: expect.stringContaining('unsaved VS Code changes'),
    });
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('src/example.ts'),
    );
  });

  it('treats closing the modal as a declined write', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined);

    await expect(createWriteConfirmationHandler('fixture')(request)).resolves.toEqual({
      approved: false,
      message: 'The user declined the VS Code write confirmation.',
    });
  });
});
