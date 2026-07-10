import * as vscode from 'vscode';
import { beforeEach, describe, expect, it } from 'vitest';
import { COMMANDS } from '../../constants';
import { ReviewLumeTreeProvider } from '../../views/reviewLumeTreeProvider';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function section(provider: ReviewLumeTreeProvider, label: string) {
  const item = provider.getChildren().find((candidate) => candidate.label === label);
  expect(item).toBeDefined();
  return item!;
}

beforeEach(() => {
  testing.reset();
});

describe('ReviewLumeTreeProvider', () => {
  it('shows the no-workspace empty state', () => {
    testing.setWorkspaceState([], true);
    const provider = new ReviewLumeTreeProvider();

    const statusItems = provider.getChildren(section(provider, 'Status'));
    expect(statusItems).toHaveLength(1);
    expect(statusItems[0].label).toBe('No Workspace Folder');
  });

  it('shows Restricted Mode without inspecting repository content', () => {
    testing.setWorkspaceState([{}], false);
    const provider = new ReviewLumeTreeProvider();

    const statusItems = provider.getChildren(section(provider, 'Status'));
    expect(statusItems[0].label).toBe('Restricted Mode');
  });

  it('shows an honest trusted-workspace state and all P1 actions', () => {
    testing.setWorkspaceState([{}], true);
    const provider = new ReviewLumeTreeProvider();

    const statusItems = provider.getChildren(section(provider, 'Status'));
    expect(statusItems[0].label).toBe('Ready');
    expect(statusItems[0].description).toBe('Workspace is open and trusted');

    const actions = provider.getChildren(section(provider, 'Actions'));
    expect(actions.map((item) => item.command?.command)).toEqual([
      COMMANDS.CREATE_REVIEW_PACK,
      COMMANDS.OPEN_REVIEW_HISTORY,
      COMMANDS.IMPORT_REVIEW_RESPONSE,
    ]);
  });
});
