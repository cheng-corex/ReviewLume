import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService } from '../services/historyService';
import { ReportService } from '../services/reportService';
import {
  formatIssueStatus,
  getIssueStatusActions,
} from '../services/issueStatusPresentation';
import { GitContextService } from '../services/gitContextService';
import { historyText as t } from '../services/historyI18n';
import { logInfo, logWarn } from '../services/logService';
import type { FileSelectionService } from '../services/fileSelectionService';

export function registerUpdateIssueStatus(
  context: vscode.ExtensionContext,
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.UPDATE_ISSUE_STATUS, async () => {
      const repositoryRoot = await resolveRepositoryRoot(
        fileSelectionService,
        providedGitContextService,
      );
      if (!repositoryRoot) return;

      const locale = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      const historyService = new HistoryService();
      const entries = await historyService.list(repositoryRoot);
      const candidates = [] as Array<{
        label: string;
        description: string;
        reviewId: string;
      }>;

      for (const entry of entries) {
        if (!(await historyService.hasResponse(repositoryRoot, entry.metadata.reviewId))) {
          continue;
        }
        const reviewDirectory = await historyService.getReviewDirectory(
          repositoryRoot,
          entry.metadata.reviewId,
        );
        const responseText = await historyService.loadResponse(
          repositoryRoot,
          entry.metadata.reviewId,
        );
        const result = await new ReportService().readReport(
          reviewDirectory,
          entry.metadata.reviewId,
          responseText,
        );
        if (result.status !== 'valid' || !result.report || result.report.issues.length === 0) {
          continue;
        }
        candidates.push({
          label: `${entry.metadata.repositoryDisplayName} — ${entry.metadata.reviewId}`,
          description: t(
            `${result.report.issues.length} issue(s)`,
            `${result.report.issues.length} 个问题`,
          ),
          reviewId: entry.metadata.reviewId,
        });
      }

      if (candidates.length === 0) {
        await vscode.window.showInformationMessage(
          t(
            'ReviewLume: No valid reports with issues are available.',
            'ReviewLume：没有可更新状态的有效问题报告。',
          ),
        );
        return;
      }

      const review = await vscode.window.showQuickPick(candidates, {
        title: t('ReviewLume: Select Review', 'ReviewLume：选择审核记录'),
        placeHolder: t('Choose a review report', '选择一个审核报告'),
        matchOnDescription: true,
      });
      if (!review) return;

      const reviewDirectory = await historyService.getReviewDirectory(
        repositoryRoot,
        review.reviewId,
      );
      const responseText = await historyService.loadResponse(
        repositoryRoot,
        review.reviewId,
      );
      const reportService = new ReportService();
      const result = await reportService.readReport(
        reviewDirectory,
        review.reviewId,
        responseText,
      );
      if (result.status !== 'valid' || !result.report) {
        await vscode.window.showWarningMessage(
          t(
            `ReviewLume: Report cannot be updated while it is ${result.status}.`,
            `ReviewLume：报告当前状态为 ${result.status}，无法更新。`,
          ),
        );
        return;
      }

      const issue = await vscode.window.showQuickPick(
        result.report.issues.map((item) => ({
          label: `[${item.severity}] ${item.title}`,
          description: `${formatIssueStatus(item.status, locale)} · ${item.filePath ?? t('(no location)', '（无位置）')}`,
          detail: item.description,
          issue: item,
        })),
        {
          title: t('ReviewLume: Select Issue', 'ReviewLume：选择问题'),
          placeHolder: t('Choose an issue to update', '选择要更新状态的问题'),
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      if (!issue) return;

      const options = getIssueStatusActions(issue.issue.status, locale);
      if (options.length === 0) {
        await vscode.window.showInformationMessage(
          t(
            'ReviewLume: This issue has no available status transitions.',
            'ReviewLume：该问题当前没有可用的状态流转。',
          ),
        );
        return;
      }

      const target = await vscode.window.showQuickPick(
        options.map((option) => ({
          label: `$(${option.icon}) ${option.label}`,
          description: option.description,
          status: option.status,
        })),
        {
          title: t('ReviewLume: Update Issue Status', 'ReviewLume：更新问题状态'),
          placeHolder: t('Choose the new status', '选择新的问题状态'),
        },
      );
      if (!target) return;

      try {
        await reportService.transitionIssueStatusOnDisk(
          reviewDirectory,
          review.reviewId,
          issue.issue.issueId,
          target.status,
          responseText,
        );
        await vscode.window.showInformationMessage(
          t(
            `ReviewLume: Issue status updated to ${formatIssueStatus(target.status, locale)}.`,
            `ReviewLume：问题状态已更新为“${formatIssueStatus(target.status, locale)}”。`,
          ),
        );
        logInfo(
          `Issue status updated from command (${review.reviewId}/${issue.issue.issueId}): ${target.status}`,
        );
      } catch (error) {
        logWarn(`Issue status command failed: ${getErrorCode(error)}`);
        await vscode.window.showErrorMessage(
          t(
            'ReviewLume: Failed to update issue status. Re-open the report and try again.',
            'ReviewLume：问题状态更新失败，请重新打开报告后重试。',
          ),
        );
      }
    }),
  );
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
        'ReviewLume: Open a workspace folder first.',
        'ReviewLume：请先打开工作区文件夹。',
      ),
    );
    return undefined;
  }

  const inspection = await (providedGitContextService ?? new GitContextService()).inspect(
    workspaceFolders,
    async (repositories) => {
      if (repositories.length === 0) return undefined;
      if (repositories.length === 1) return repositories[0];
      const selected = await vscode.window.showQuickPick(
        repositories.map((repository) => ({
          label: repository.repository.displayName,
          repository,
        })),
        {
          title: t('ReviewLume: Select Repository', 'ReviewLume：选择仓库'),
        },
      );
      return selected?.repository;
    },
  );

  return inspection?.kind === 'ready' ? inspection.repository.root : undefined;
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
