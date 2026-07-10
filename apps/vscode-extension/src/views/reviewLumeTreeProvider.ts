import * as vscode from 'vscode';
import { COMMANDS, VIEWS } from '../constants';
import { getWorkspaceState, WorkspaceState } from '../services/workspaceService';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

/**
 * Discriminated union of tree item kinds.
 * - `section`: collapsible header grouping related items.
 * - `status`: read-only state indicator.
 * - `action`: clickable item that triggers a command.
 */
export type ItemKind = 'section' | 'status' | 'action';

/**
 * A tree item in the ReviewLume sidebar.
 */
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

// ---------------------------------------------------------------------------
// Tree data provider
// ---------------------------------------------------------------------------

/**
 * Provides the tree data for the `reviewlume.mainView` tree view in the
 * Activity Bar.
 *
 * Structure:
 * ```
 * ReviewLume (root, hidden)
 * ├── Status (section)
 * │   └── <current workspace state>
 * └── Actions (section)
 *     ├── Create Review Pack
 *     ├── Open Review History
 *     └── Import Review Response
 * ```
 */
export class ReviewLumeTreeProvider
  implements vscode.TreeDataProvider<ReviewLumeTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewLumeTreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Force the tree view to refresh. */
  refresh(): void {
    this._onDidChangeTreeData.fire();
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

  // ---- private helpers ------------------------------------------------

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
      return this.getStatusItems();
    }
    if (sectionLabel === 'Actions') {
      return this.getActionItems();
    }
    return [];
  }

  private getStatusItems(): ReviewLumeTreeItem[] {
    const state = getWorkspaceState();
    const item = this.buildStatusItem(state);
    return [item];
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
          'Trust the workspace to enable features',
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
          'Ready',
          vscode.TreeItemCollapsibleState.None,
          'ReviewLume is active',
          undefined,
          'check',
        );
    }
  }

  private getActionItems(): ReviewLumeTreeItem[] {
    return [
      new ReviewLumeTreeItem(
        'action',
        'Create Review Pack',
        vscode.TreeItemCollapsibleState.None,
        'Build a review pack from current changes',
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

// ---- factory function called from extension.ts ------------------------

/**
 * Create and register the tree view and its data provider.
 * Returns the provider for potential external refresh triggers.
 */
export function registerReviewLumeTreeView(
  context: vscode.ExtensionContext,
): ReviewLumeTreeProvider {
  const provider = new ReviewLumeTreeProvider();

  const treeView = vscode.window.createTreeView(VIEWS.MAIN_VIEW, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });

  context.subscriptions.push(treeView);

  // Refresh when workspace folders or trust changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
  );
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => provider.refresh()),
  );

  return provider;
}
