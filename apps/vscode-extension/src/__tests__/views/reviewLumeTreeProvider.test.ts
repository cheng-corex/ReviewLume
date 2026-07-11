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

beforeEach(() => testing.reset());

describe('ReviewLumeTreeProvider', () => {
  it('shows the no-workspace empty state', () => {
    testing.setWorkspaceState([], true);
    const provider = new ReviewLumeTreeProvider();
    expect(provider.getChildren(section(provider, 'Status'))[0].label).toBe(
      'No Workspace Folder',
    );
  });

  it('shows Restricted Mode without inspecting repository content', () => {
    testing.setWorkspaceState([{}], false);
    const provider = new ReviewLumeTreeProvider();
    expect(provider.getChildren(section(provider, 'Status'))[0].label).toBe(
      'Restricted Mode',
    );
  });

  it('does not claim Git readiness before the P2 inspection command runs', () => {
    testing.setWorkspaceState([{}], true);
    const provider = new ReviewLumeTreeProvider();

    const status = provider.getChildren(section(provider, 'Status'))[0];
    expect(status.label).toBe('Workspace Trusted');
    expect(status.description).toContain('inspect Git repositories');

    const actions = provider.getChildren(section(provider, 'Actions'));
    expect(actions.map((item) => item.command?.command)).toEqual([
      COMMANDS.CREATE_REVIEW_PACK,
      COMMANDS.OPEN_REVIEW_HISTORY,
      COMMANDS.IMPORT_REVIEW_RESPONSE,
    ]);
  });
});
