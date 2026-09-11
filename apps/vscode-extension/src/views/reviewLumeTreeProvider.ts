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
            description: 'Trust the workspace to enable project inspection',
            iconName: 'shield',
          },
        );
      case WorkspaceState.Ready:
        return new ReviewLumeTreeItem(
          'status',
          'Workspace Trusted',
          vscode.TreeItemCollapsibleState.None,
          {
            description: 'Read-only MCP can connect Git or Folder Projects',
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
      const slash = remainder.indexOf('/');
      if (slash >= 0) {
        folders.add(remainder.slice(0, slash));
      } else {
        files.push(entry);
      }
    }

    const folderItems = [...folders]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const relativePath = prefix ? `${prefix}/${name}` : name;
        return new ReviewLumeTreeItem(
          'folder',
          name,
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            relativePath,
            iconName: 'folder',
          },
        );
      });

    const fileItems = files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => {
        const basename = entry.path.split('/').pop() ?? entry.path;
        const description = this.getFileDescription(entry);
        return new ReviewLumeTreeItem(
          'file',
          basename,
          vscode.TreeItemCollapsibleState.None,
          {
            relativePath: entry.path,
            selected: entry.selected,
            description,
            iconName: entry.exists ? 'file' : 'trash',
            tooltip: `${entry.path}\n${description}`,
          },
        );
      });

    return [...folderItems, ...fileItems];
  }

  private getFileDescription(entry: ReviewFileSelectionEntry): string {
    const changeText = entry.changeKinds.length > 0 ? entry.changeKinds.join(', ') : '';
    const sourceText =
      entry.source === 'recommended'
        ? 'recommended test'
        : entry.source === 'manual'
          ? 'related file'
          : 'changed file';
    return [sourceText, changeText, entry.exists ? '' : 'deleted']
      .filter(Boolean)
      .join(' · ');
  }

  private getActionItems(): ReviewLumeTreeItem[] {
    return [
      actionItem('Open Review Panel', COMMANDS.OPEN_REVIEW_PANEL, 'Open the guided review workflow'),
      actionItem('Create Review Pack', COMMANDS.CREATE_REVIEW_PACK, 'Build a review from Git changes'),
      actionItem('Add Related Files', COMMANDS.ADD_RELATED_FILES, 'Add repository files to the active review'),
      actionItem('Recommend Test Files', COMMANDS.RECOMMEND_TEST_FILES, 'Find likely test files for the active review'),
      actionItem('Scan Selected Files', COMMANDS.SCAN_SELECTED_FILES, 'Run the P8 sensitive-content scan'),
      actionItem('Export Review Pack', COMMANDS.EXPORT_REVIEW_PACK, 'Export the active P8 review package'),
      actionItem('Add Export Directory to .gitignore', COMMANDS.ADD_EXPORT_DIRECTORY_TO_GITIGNORE, 'Keep generated review output out of Git'),
      actionItem('Open Review History', COMMANDS.OPEN_REVIEW_HISTORY, 'Browse locally stored review history'),
      actionItem('Import Review Response', COMMANDS.IMPORT_REVIEW_RESPONSE, 'Import an AI review response into P8'),
    ];
  }
}

function actionItem(label: string, command: string, tooltip: string): ReviewLumeTreeItem {
  return new ReviewLumeTreeItem(
    'action',
    label,
    vscode.TreeItemCollapsibleState.None,
    {
      command: { command, title: label },
      iconName: 'play',
      tooltip: `${tooltip}; click to run`,
    },
  );
}

export function registerReviewLumeTreeView(
  context: vscode.ExtensionContext,
  fileSelectionService: FileSelectionService,
): ReviewLumeTreeProvider {
  const provider = new ReviewLumeTreeProvider(fileSelectionService);
  const treeView = vscode.window.createTreeView<ReviewLumeTreeItem>(VIEWS.REVIEW, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(
    provider,
    treeView,
    treeView.onDidChangeCheckboxState((event) => {
      for (const [item, state] of event.items) {
        if (item.itemKind !== 'file' || !item.relativePath) continue;
        fileSelectionService.setSelected(
          item.relativePath,
          state === vscode.TreeItemCheckboxState.Checked,
        );
      }
      provider.refresh();
    }),
  );
  return provider;
}
