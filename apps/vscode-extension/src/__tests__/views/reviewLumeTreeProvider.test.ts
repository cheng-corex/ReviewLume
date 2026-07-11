import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../../constants';
import type { FileSelectionService } from '../../services/fileSelectionService';
import {
  registerReviewLumeTreeView,
  ReviewLumeTreeProvider,
} from '../../views/reviewLumeTreeProvider';

interface VscodeTesting {
  setWorkspaceState(folders: unknown[], trusted: boolean): void;
  getCheckboxHandler(): ((event: { items: Array<[unknown, number]> }) => unknown) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

function selectionService(options?: {
  active?: boolean;
  entries?: Array<{
    path: string;
    source: 'changed' | 'manual' | 'recommended';
    changeKinds: Array<'added' | 'modified' | 'deleted'>;
    exists: boolean;
    selected: boolean;
  }>;
}): FileSelectionService {
  const entries = options?.entries ?? [];
  return {
    hasSession: options?.active ?? false,
    repository: options?.active ? { displayName: 'ReviewLume' } : undefined,
    entries,
    selectedCount: entries.filter((entry) => entry.selected).length,
    setSelected: vi.fn(),
    clear: vi.fn(),
  } as unknown as FileSelectionService;
}

function section(provider: ReviewLumeTreeProvider, label: string) {
  const item = provider.getChildren().find((candidate) => candidate.label === label);
  expect(item).toBeDefined();
  return item!;
}

beforeEach(() => testing.reset());

describe('ReviewLumeTreeProvider', () => {
  it('shows the no-workspace empty state', () => {
    testing.setWorkspaceState([], true);
    const provider = new ReviewLumeTreeProvider(selectionService());
    expect(provider.getChildren(section(provider, 'Status'))[0].label).toBe(
      'No Workspace Folder',
    );
  });

  it('shows Restricted Mode without inspecting repository content', () => {
    testing.setWorkspaceState([{}], false);
    const provider = new ReviewLumeTreeProvider(selectionService());
    expect(provider.getChildren(section(provider, 'Status'))[0].label).toBe(
      'Restricted Mode',
    );
  });

  it('shows every review action as a directly executable command', () => {
    testing.setWorkspaceState([{}], true);
    const provider = new ReviewLumeTreeProvider(selectionService());

    const status = provider.getChildren(section(provider, 'Status'))[0];
    expect(status.label).toBe('Workspace Trusted');
    expect(status.description).toContain('changed files');

    const files = provider.getChildren(section(provider, 'Files'));
    expect(files[0].label).toBe('No Active Review');

    const actions = provider.getChildren(section(provider, 'Actions'));
    expect(actions.map((item) => item.command?.command)).toEqual([
      COMMANDS.CREATE_REVIEW_PACK,
      COMMANDS.ADD_RELATED_FILES,
      COMMANDS.RECOMMEND_TEST_FILES,
      COMMANDS.SCAN_SELECTED_FILES,
      COMMANDS.EXPORT_REVIEW_PACK,
      COMMANDS.OPEN_REVIEW_HISTORY,
      COMMANDS.IMPORT_REVIEW_RESPONSE,
    ]);
    for (const action of actions) {
      expect(action.itemKind).toBe('action');
      expect(action.command).toBeDefined();
      expect(action.tooltip).toContain('click to run');
    }
  });

  it('renders repository-relative folders and checkbox state', () => {
    testing.setWorkspaceState([{}], true);
    const provider = new ReviewLumeTreeProvider(
      selectionService({
        active: true,
        entries: [
          {
            path: 'src/app.ts',
            source: 'changed',
            changeKinds: ['modified'],
            exists: true,
            selected: true,
          },
          {
            path: 'src/app.test.ts',
            source: 'recommended',
            changeKinds: [],
            exists: true,
            selected: false,
          },
          {
            path: 'README.md',
            source: 'manual',
            changeKinds: [],
            exists: true,
            selected: true,
          },
        ],
      }),
    );

    const status = provider.getChildren(section(provider, 'Status'))[0];
    expect(status.label).toBe('ReviewLume');
    expect(status.description).toBe('2/3 files selected');

    const rootFiles = provider.getChildren(section(provider, 'Files'));
    expect(rootFiles.map((item) => item.label)).toEqual(['src', 'README.md']);
    expect(rootFiles[1].checkboxState).toBe(vscode.TreeItemCheckboxState.Checked);

    const srcFiles = provider.getChildren(rootFiles[0]);
    expect(srcFiles.map((item) => item.label)).toEqual(['app.test.ts', 'app.ts']);
    expect(srcFiles[0].checkboxState).toBe(vscode.TreeItemCheckboxState.Unchecked);
    expect(srcFiles[0].description).toBe('recommended test');
    expect(srcFiles[1].checkboxState).toBe(vscode.TreeItemCheckboxState.Checked);
  });

  it('applies checkbox changes only to repository-relative file nodes', () => {
    const service = selectionService({
      active: true,
      entries: [
        {
          path: 'src/app.ts',
          source: 'changed',
          changeKinds: ['modified'],
          exists: true,
          selected: true,
        },
      ],
    });
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const provider = registerReviewLumeTreeView(context, service);
    const file = provider.getChildren(provider.getChildren(section(provider, 'Files'))[0])[0];

    testing.getCheckboxHandler()!({
      items: [[file, vscode.TreeItemCheckboxState.Unchecked]],
    });

    expect(service.setSelected).toHaveBeenCalledWith('src/app.ts', false);
  });
});
