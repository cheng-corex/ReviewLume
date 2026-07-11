import * as vscode from 'vscode';
import { COMMANDS, VIEWS } from '../constants';
import type {
  FileSelectionService,
  ReviewFileSelectionEntry,
} from '../services/fileSelectionService';
import { getWorkspaceState, WorkspaceState } from '../services/workspaceService';

export type ItemKind = 'section' | 'status' | 'action' | 'folder' | 'file';

export class ReviewLumeTreeItem extends vscode.TreeItem {
  readonly relativePath?: string;

  constructor(
    public readonly itemKind: ItemKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options: {
      readonly description?: string;
      readonly command?: vscode.Command;
      readonly iconName?: string;
      readonly relativePath?: string;
      readonly selected?: boolean;
      readonly tooltip?: string;
    } = {},
  ) {
    super(label, collapsibleState);
    this.relativePath = options.relativePath;

    if (options.description) {
      this.description = options.description;
    }
    this.tooltip = options.tooltip ?? options.description;
    if (options.iconName) {
      this.iconPath = new vscode.ThemeIcon(options.iconName);
    }
    if (options.command) {
      this.command = options.command;
    }
    if (options.selected !== undefined) {
      this.checkboxState = options.selected
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }
    this.contextValue = `reviewlume.${itemKind}`;
  }
}

/** Activity Bar tree for workspace status, file selection, and ReviewLume actions. */
export class ReviewLumeTreeProvider
  implements vscode.TreeDataProvider<ReviewLumeTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewLumeTreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly fileSelectionService: FileSelectionService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: ReviewLumeTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewLumeTreeItem): ReviewLumeTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }

    if (element.itemKind === 'section') {
      const label =
        typeof element.label === 'string' ? element.label : element.label?.label ?? '';
      return this.getChildrenForSection(label);
    }

    if (element.itemKind === 'folder' && element.relativePath) {
      return this.getFileTreeChildren(element.relativePath);
    }

    return [];
  }

  private getRootItems(): ReviewLumeTreeItem[] {
    return [
      new ReviewLumeTreeItem('section', 'Status', vscode.TreeItemCollapsibleState.Expanded, {
        description: 'Current review state',
        iconName: 'info',
      }),
      new ReviewLumeTreeItem('section', 'Files', vscode.TreeItemCollapsibleState.Expanded, {
        description: 'Files included in this review',
        iconName: 'files',
      }),
      new ReviewLumeTreeItem('section', 'Actions', vscode.TreeItemCollapsibleState.Expanded, {
        description: 'Available review commands',
        iconName: 'lightbulb',
      }),
    ];
  }

  private getChildrenForSection(sectionLabel: string): ReviewLumeTreeItem[] {
    if (sectionLabel === 'Status') {
      return [this.buildStatusItem(getWorkspaceState())];
    }
    if (sectionLabel === 'Files') {
      return this.getFileSectionItems();
    }
    if (sectionLabel === 'Actions') {
      return this.getActionItems();
    }
    return [];
  }

  private buildStatusItem(state: WorkspaceState): ReviewLumeTreeItem {
    if (this.fileSelectionService.hasSession && this.fileSelectionService.repository) {
      const total = this.fileSelectionService.entries.length;
      return new ReviewLumeTreeItem(
        'status',
        this.fileSelectionService.repository.displayName,
        vscode.TreeItemCollapsibleState.None,
        {
          description: `${this.fileSelectionService.selectedCount}/${total} files selected`,
          iconName: 'git-branch',
          tooltip: 'Active review repository and selected file count',
        },
      );
    }

    switch (state) {
      case WorkspaceState.NoWorkspace:
        return new ReviewLumeTreeItem(
          'status',
          'No Workspace Folder',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Open a folder to get started',
            iconName: 'folder-opened',
          },
        );
      case WorkspaceState.Untrusted:
        return new ReviewLumeTreeItem(
          'status',
          'Restricted Mode',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Trust the workspace to enable repository inspection',
            iconName: 'shield',
          },
        );
      case WorkspaceState.NoGit:
        return new ReviewLumeTreeItem(
          'status',
          'No Git Repository',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Open a Git repository to use ReviewLume',
            iconName: 'git-branch',
          },
        );
      case WorkspaceState.Ready:
        return new ReviewLumeTreeItem(
          'status',
          'Workspace Trusted',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Run Create Review Pack to inspect changed files',
            iconName: 'shield',
          },
        );
    }
  }

  private getFileSectionItems(): ReviewLumeTreeItem[] {
    if (!this.fileSelectionService.hasSession) {
      return [
        new ReviewLumeTreeItem(
          'status',
          'No Active Review',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Run Create Review Pack to build the file tree',
            iconName: 'files',
          },
        ),
      ];
    }

    if (this.fileSelectionService.entries.length === 0) {
      return [
        new ReviewLumeTreeItem(
          'status',
          'No Selectable Changes',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Add related files manually or change the repository',
            iconName: 'info',
          },
        ),
      ];
    }

    return this.getFileTreeChildren('');
  }

  private getFileTreeChildren(prefix: string): ReviewLumeTreeItem[] {
    const entries = this.fileSelectionService.entries;
    const prefixWithSlash = prefix ? `${prefix}/` : '';
    const folders = new Set<string>();
    const files: ReviewFileSelectionEntry[] = [];

    for (const entry of entries) {
      if (!entry.path.startsWith(prefixWithSlash)) continue;
      const remainder = entry.path.slice(prefixWithSlash.length);
      if (!remainder) continue;
      const slashIndex = remainder.indexOf('/');
      if (slashIndex >= 0) {
        folders.add(remainder.slice(0, slashIndex));
      } else {
        files.push(entry);
      }
    }

    const folderItems = Array.from(folders)
      .sort((left, right) => left.localeCompare(right))
      .map((folder) => {
        const relativePath = prefix ? `${prefix}/${folder}` : folder;
        return new ReviewLumeTreeItem(
          'folder',
          folder,
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            relativePath,
            iconName: 'folder',
            tooltip: relativePath,
          },
        );
      });

    const fileItems = files
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((entry) => this.buildFileItem(entry));

    return [...folderItems, ...fileItems];
  }

  private buildFileItem(entry: ReviewFileSelectionEntry): ReviewLumeTreeItem {
    const label = entry.path.split('/').at(-1) ?? entry.path;
    const description = describeFileEntry(entry);
    return new ReviewLumeTreeItem('file', label, vscode.TreeItemCollapsibleState.None, {
      relativePath: entry.path,
      description,
      iconName: entry.source === 'recommended' ? 'beaker' : entry.source === 'manual' ? 'link' : 'diff',
      selected: entry.selected,
      tooltip: `${entry.path} — ${description}`,
    });
  }

  private getActionItems(): ReviewLumeTreeItem[] {
    return [
      actionItem(
        'Create Review Pack',
        'Inspect Git changes and start a file-selection session',
        COMMANDS.CREATE_REVIEW_PACK,
        'new-file',
      ),
      actionItem(
        'Add Related Files',
        'Add repository-local files that support the review',
        COMMANDS.ADD_RELATED_FILES,
        'link',
      ),
      actionItem(
        'Recommend Test Files',
        'Find likely tests for selected implementation files',
        COMMANDS.RECOMMEND_TEST_FILES,
        'beaker',
      ),
      actionItem(
        'Scan Selected Files',
        'Scan the exact review input for sensitive content',
        COMMANDS.SCAN_SELECTED_FILES,
        'shield',
      ),
      actionItem(
        'Export Review Pack',
        'Build and save the privacy-checked Review Pack',
        COMMANDS.EXPORT_REVIEW_PACK,
        'export',
      ),
      actionItem(
        'Open Review History',
        'Browse past review sessions',
        COMMANDS.OPEN_REVIEW_HISTORY,
        'history',
      ),
      actionItem(
        'Import Review Response',
        'Import an AI review response',
        COMMANDS.IMPORT_REVIEW_RESPONSE,
        'cloud-download',
      ),
    ];
  }
}

export function registerReviewLumeTreeView(
  context: vscode.ExtensionContext,
  fileSelectionService: FileSelectionService,
): ReviewLumeTreeProvider {
  const provider = new ReviewLumeTreeProvider(fileSelectionService);
  const treeView = vscode.window.createTreeView(VIEWS.MAIN_VIEW, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    treeView,
    provider,
    treeView.onDidChangeCheckboxState((event) => {
      for (const [item, state] of event.items) {
        if (item.itemKind === 'file' && item.relativePath) {
          fileSelectionService.setSelected(
            item.relativePath,
            state === vscode.TreeItemCheckboxState.Checked,
          );
        }
      }
      provider.refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      fileSelectionService.clear();
      provider.refresh();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => provider.refresh()),
  );

  return provider;
}

function actionItem(
  label: string,
  description: string,
  command: string,
  iconName: string,
): ReviewLumeTreeItem {
  return new ReviewLumeTreeItem('action', label, vscode.TreeItemCollapsibleState.None, {
    description,
    command: { command, title: label },
    iconName,
    tooltip: `${label} — click to run`,
  });
}

function describeFileEntry(entry: ReviewFileSelectionEntry): string {
  if (entry.source === 'manual') return 'related file';
  if (entry.source === 'recommended') return 'recommended test';

  const changeDescription = entry.changeKinds.length > 0 ? entry.changeKinds.join(', ') : 'changed';
  return entry.exists ? changeDescription : `${changeDescription}, deleted`;
}
