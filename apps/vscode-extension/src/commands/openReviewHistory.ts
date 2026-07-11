import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { GitContextService } from '../services/gitContextService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { historyText as t } from '../services/historyI18n';
import { logInfo, logWarn } from '../services/logService';
import type { FileSelectionService } from '../services/fileSelectionService';

export function registerOpenReviewHistory(
  context: vscode.ExtensionContext,
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): void {
  const disposable = vscode.commands.registerCommand(
    COMMANDS.OPEN_REVIEW_HISTORY,
    async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`openReviewHistory blocked — ${warning}`);
        return;
      }

      const repositoryRoot = await resolveRepositoryRoot(
        fileSelectionService,
        providedGitContextService,
      );
      if (!repositoryRoot) return;

      const historyService = new HistoryService();
      let entries: HistoryEntry[];
      try {
        entries = await historyService.list(repositoryRoot);
      } catch (error) {
        logWarn(`Failed to list review history (${getErrorCode(error)})`);
        await vscode.window.showErrorMessage(
          t(
            'ReviewLume: Failed to read review history. Check the ReviewLume output channel.',
            'ReviewLume：读取审核历史失败，请查看 ReviewLume 输出通道。',
          ),
        );
        return;
      }

      if (entries.length === 0) {
        const createChoice = await vscode.window.showInformationMessage(
          t(
            'ReviewLume: No review history found. Create a Review Pack to start building history.',
            'ReviewLume：尚无审核历史，请先创建审核包。',
          ),
          t('Create Review Pack', '创建审核包'),
        );
        if (createChoice) {
          await vscode.commands.executeCommand(COMMANDS.CREATE_REVIEW_PACK);
        }
        return;
      }

      const pickedEntry = await showHistoryList(entries);
      if (!pickedEntry) return;
      await showHistoryActions(repositoryRoot, pickedEntry, historyService);
    },
  );

  context.subscriptions.push(disposable);
}

async function resolveRepositoryRoot(
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): Promise<string | undefined> {
  if (fileSelectionService?.hasSession && fileSelectionService.repository) {
    return fileSelectionService.repository.root;
  }

  const workspaceFolders =
    vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  if (workspaceFolders.length === 0) {
    await vscode.window.showWarningMessage(
      t(
        'ReviewLume: No workspace folder is open. Open a folder to view review history.',
        'ReviewLume：当前未打开工作区文件夹，请先打开一个文件夹。',
      ),
    );
    return undefined;
  }

  const gitContextService = providedGitContextService ?? new GitContextService();
  const inspection = await gitContextService.inspect(
    workspaceFolders,
    async (repositories) => {
      if (repositories.length === 0) return undefined;
      if (repositories.length === 1) return repositories[0];
      const items = repositories.map((repository, index) => ({
        label: repository.repository.displayName,
        description: t(
          `Repository ${index + 1} of ${repositories.length}`,
          `仓库 ${index + 1}/${repositories.length}`,
        ),
        detail: repository.repository.remoteUrl
          ? t('Origin remote configured', '已配置远程仓库')
          : t('Local repository', '本地仓库'),
        repo: repository,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        title: t(
          'ReviewLume: Select Repository for History',
          'ReviewLume：选择历史记录所属仓库',
        ),
        placeHolder: t(
          'Choose a repository to browse its review history',
          '选择要查看审核历史的仓库',
        ),
      });
      return picked?.repo;
    },
  );

  if (!inspection || inspection.kind !== 'ready') {
    if (inspection?.kind === 'git-unavailable') {
      await vscode.window.showWarningMessage(
        t(
          'ReviewLume: Git is not available. Install Git and ensure it is on PATH.',
          'ReviewLume：Git 不可用，请安装 Git 并确认已加入 PATH。',
        ),
      );
    } else if (inspection?.kind === 'no-repository') {
      await vscode.window.showWarningMessage(
        t(
          'ReviewLume: No Git repository was found in the current workspace.',
          'ReviewLume：当前工作区中未找到 Git 仓库。',
        ),
      );
    }
    return undefined;
  }

  return inspection.repository.root;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function showHistoryList(
  entries: readonly HistoryEntry[],
): Promise<HistoryEntry | undefined> {
  const items = entries.map((entry) => {
    const metadata = entry.metadata;
    const integrity =
      entry.integrity === 'valid'
        ? t('Ready', '完整')
        : entry.integrity === 'partial'
          ? t('Partial', '部分缺失')
          : t('Corrupt', '已损坏');
    const fileSearchText = metadata.selectedFiles.map((file) => file.path).join(' ');
    return {
      label: `${metadata.repositoryDisplayName} — ${formatDate(metadata.createdAt)}`,
      description:
        `${metadata.exportFormat} · ${metadata.fileCount} ${t('file(s)', '个文件')} · ` +
        `${formatBytes(metadata.byteLength)} · ${integrity}`,
      detail:
        `ID: ${metadata.reviewId} | WARN: ${metadata.security.warnCount} ` +
        `(${metadata.security.confirmedWarnCount} ${t('confirmed', '已确认')}) | ` +
        `${fileSearchText}`,
      entry,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: t('ReviewLume: Review History', 'ReviewLume：审核历史'),
    placeHolder: t(
      'Search by review ID, file path, or export format',
      '可按审核 ID、文件路径或导出格式搜索',
    ),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.entry;
}

async function showHistoryActions(
  repositoryRoot: string,
  entry: HistoryEntry,
  historyService: HistoryService,
): Promise<void> {
  const metadata = entry.metadata;
  interface ActionItem extends vscode.QuickPickItem {
    readonly action:
      | 'open-markdown'
      | 'open-zip'
      | 'open-directory'
      | 'copy-prompt'
      | 're-export-markdown'
      | 'delete';
  }

  const items: ActionItem[] = [];
  if (entry.markdownPath) {
    items.push({
      label: t('$(file) Open REVIEW_REQUEST.md', '$(file) 打开 REVIEW_REQUEST.md'),
      description: t('Open the exported Markdown review pack', '打开已导出的 Markdown 审核包'),
      action: 'open-markdown',
    });
  }
  if (entry.zipPath) {
    items.push({
      label: t('$(archive) Show ZIP', '$(archive) 显示 ZIP'),
      description: t('Reveal the exported ZIP review pack', '在文件管理器中显示 ZIP 审核包'),
      action: 'open-zip',
    });
  }
  if (entry.markdownPath || entry.zipPath) {
    items.push({
      label: t('$(folder-opened) Open Export Directory', '$(folder-opened) 打开导出目录'),
      description: t('Reveal the managed export directory', '在文件管理器中打开导出目录'),
      action: 'open-directory',
    });
  }
  if (entry.integrity !== 'corrupt' && !entry.issues.includes('REQUEST_MISSING_OR_INVALID')) {
    items.push({
      label: t('$(clippy) Copy Review Prompt', '$(clippy) 复制审核提示'),
      description: t('Copy the exact saved request.md content', '复制历史中保存的原始 request.md'),
      action: 'copy-prompt',
    });
    if (!entry.markdownPath) {
      items.push({
        label: t('$(new-file) Re-export Markdown', '$(new-file) 重新导出 Markdown'),
        description: t(
          'Restore REVIEW_REQUEST.md from the exact history snapshot',
          '根据历史快照恢复 REVIEW_REQUEST.md',
        ),
        action: 're-export-markdown',
      });
    }
  }
  items.push({
    label: t('$(trash) Delete History Entry', '$(trash) 删除这条历史'),
    description: t(
      'Delete the history record and its managed export directory',
      '删除历史记录及其受管导出目录',
    ),
    action: 'delete',
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: `ReviewLume: ${metadata.repositoryDisplayName} — ${formatDate(metadata.createdAt)}`,
    placeHolder:
      entry.integrity === 'valid'
        ? t('Choose an action', '选择操作')
        : t(
            `Integrity: ${entry.integrity} (${entry.issues.join(', ')})`,
            `完整性：${entry.integrity}（${entry.issues.join('、')}）`,
          ),
  });
  if (!picked) return;

  try {
    switch (picked.action) {
      case 'open-markdown':
        if (entry.markdownPath) {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(entry.markdownPath));
        }
        break;
      case 'open-zip':
        if (entry.zipPath) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(entry.zipPath));
        }
        break;
      case 'open-directory': {
        const filePath = entry.markdownPath ?? entry.zipPath;
        if (filePath) {
          await vscode.commands.executeCommand(
            'revealFileInOS',
            vscode.Uri.file(path.dirname(filePath)),
          );
        }
        break;
      }
      case 'copy-prompt': {
        const requestContent = await historyService.loadRequest(
          repositoryRoot,
          metadata.reviewId,
        );
        await vscode.env.clipboard.writeText(requestContent);
        await vscode.window.showInformationMessage(
          t(
            'ReviewLume: Review prompt copied from history.',
            'ReviewLume：已从历史记录复制审核提示。',
          ),
        );
        logInfo(`Review prompt copied from history (${metadata.reviewId})`);
        break;
      }
      case 're-export-markdown': {
        const markdownPath = await historyService.reexportMarkdown(
          repositoryRoot,
          metadata.reviewId,
        );
        await vscode.window.showInformationMessage(
          t(
            `ReviewLume: Markdown restored to ${path.relative(repositoryRoot, markdownPath)}.`,
            `ReviewLume：Markdown 已恢复到 ${path.relative(repositoryRoot, markdownPath)}。`,
          ),
        );
        logInfo(`Review Pack Markdown restored from history (${metadata.reviewId})`);
        break;
      }
      case 'delete': {
        const confirm = await vscode.window.showWarningMessage(
          t(
            `ReviewLume: Delete history and managed exports for ${metadata.reviewId}?`,
            `ReviewLume：删除 ${metadata.reviewId} 的历史记录及受管导出文件？`,
          ),
          { modal: true },
          t('Delete', '删除'),
          t('Cancel', '取消'),
        );
        if (confirm !== t('Delete', '删除')) return;
        await historyService.delete(repositoryRoot, metadata.reviewId);
        await vscode.window.showInformationMessage(
          t(
            `ReviewLume: History entry ${metadata.reviewId} deleted.`,
            `ReviewLume：历史记录 ${metadata.reviewId} 已删除。`,
          ),
        );
        logInfo(`Review history deleted (${metadata.reviewId})`);
        break;
      }
    }
  } catch (error) {
    logWarn(`Review history action failed (${getErrorCode(error)}): ${picked.action}`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: History action failed. Check the ReviewLume output channel.',
        'ReviewLume：历史操作失败，请查看 ReviewLume 输出通道。',
      ),
    );
  }
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
