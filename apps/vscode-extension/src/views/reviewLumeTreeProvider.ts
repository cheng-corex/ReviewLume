import * as vscode from 'vscode';
import { COMMANDS, VIEWS } from '../constants';
import { getWorkspaceState, WorkspaceState } from '../services/workspaceService';

export type ItemKind = 'section' | 'status' | 'action';

export class ReviewLumeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly itemKind: ItemKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    description?: string,
    command?: vscode.Command,
    iconName?: string,
  ) {
    super(label, collapsibleState);

    if (description) {
      this.description = description;
      this.tooltip = description;
    }
    if (iconName) {
      this.iconPath = new vscode.ThemeIcon(iconName);
    }
    if (command) {
      this.command = command;
    }
  }
}

/** Activity Bar tree for workspace status and ReviewLume entry points. */
export class ReviewLumeTreeProvider
  implements vscode.TreeDataProvider<ReviewLumeTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewLumeTreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

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

    return [];
  }

  private getRootItems(): ReviewLumeTreeItem[] {
    return [
      new ReviewLumeTreeItem(
        'section',
        'Status',
        vscode.TreeItemCollapsibleState.Expanded,
        'Current workspace state',
        undefined,
        'info',
      ),
      new ReviewLumeTreeItem(
        'section',
        'Actions',
        vscode.TreeItemCollapsibleState.Expanded,
        'Available review commands',
        undefined,
        'lightbulb',
      ),
    ];
  }

  private getChildrenForSection(sectionLabel: string): ReviewLumeTreeItem[] {
    if (sectionLabel === 'Status') {
      return [this.buildStatusItem(getWorkspaceState())];
    }
    if (sectionLabel === 'Actions') {
      return this.getActionItems();
    }
    return [];
  }

  private buildStatusItem(state: WorkspaceState): ReviewLumeTreeItem {
    switch (state) {
      case WorkspaceState.NoWorkspace:
        return new ReviewLumeTreeItem(
          'status',
          'No Workspace Folder',
          vscode.TreeItemCollapsibleState.None,
          'Open a folder to get started',
          undefined,
          'folder-opened',
        );
      case WorkspaceState.Untrusted:
        return new ReviewLumeTreeItem(
          'status',
          'Restricted Mode',
          vscode.TreeItemCollapsibleState.None,
          'Trust the workspace to enable Git inspection',
          undefined,
          'shield',
        );
      case WorkspaceState.NoGit:
        return new ReviewLumeTreeItem(
          'status',
          'No Git Repository',
          vscode.TreeItemCollapsibleState.None,
          'Open a Git repository to use ReviewLume',
          undefined,
          'git-branch',
        );
      case WorkspaceState.Ready:
        return new ReviewLumeTreeItem(
          'status',
          'Workspace Trusted',
          vscode.TreeItemCollapsibleState.None,
          'Run Create Review Pack to inspect Git repositories',
          undefined,
          'shield',
        );
    }
  }

  private getActionItems(): ReviewLumeTreeItem[] {
    return [
      new ReviewLumeTreeItem(
        'action',
        'Create Review Pack',
        vscode.TreeItemCollapsibleState.None,
        'Inspect Git changes and begin a review task',
        {
          command: COMMANDS.CREATE_REVIEW_PACK,
          title: 'Create Review Pack',
        },
        'new-file',
      ),
      new ReviewLumeTreeItem(
        'action',
        'Open Review History',
        vscode.TreeItemCollapsibleState.None,
        'Browse past review sessions',
        {
          command: COMMANDS.OPEN_REVIEW_HISTORY,
          title: 'Open Review History',
        },
        'history',
      ),
      new ReviewLumeTreeItem(
        'action',
        'Import Review Response',
        vscode.TreeItemCollapsibleState.None,
        'Import an AI review response',
        {
          command: COMMANDS.IMPORT_REVIEW_RESPONSE,
          title: 'Import Review Response',
        },
        'cloud-download',
      ),
    ];
  }
}

export function registerReviewLumeTreeView(
  context: vscode.ExtensionContext,
): ReviewLumeTreeProvider {
  const provider = new ReviewLumeTreeProvider();
  const treeView = vscode.window.createTreeView(VIEWS.MAIN_VIEW, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });

  context.subscriptions.push(
    treeView,
    provider,
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => provider.refresh()),
  );

  return provider;
}
