import * as vscode from 'vscode';
import type { ReviewReport } from '@reviewlume/report-parser';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { historyText as t } from '../services/historyI18n';
import { logInfo, logWarn } from '../services/logService';
import { compareReviewReports, summarizeComparisons } from '../services/reviewLoopModel';
import { ReviewLoopStorageService } from '../services/reviewLoopStorageService';
import { parseStoredReviewReport } from '../services/reportSchema';
import { ReportService } from '../services/reportService';
import { getWorkspaceWarning } from '../services/workspaceService';

interface ComparisonCandidate {
  readonly entry: HistoryEntry;
  readonly reviewDirectory: string;
  readonly baseline: ReviewReport;
  readonly current: ReviewReport;
  readonly round: number;
  readonly issueIds: readonly string[];
}

export function registerViewReReviewComparison(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.VIEW_RE_REVIEW_COMPARISON, async () => {
      await runViewReReviewComparison();
    }),
  );
}

async function runViewReReviewComparison(): Promise<void> {
  const warning = getWorkspaceWarning();
  if (warning) {
    await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return;
  }

  try {
    const candidate = await selectCompletedRound();
    if (!candidate) return;
    const comparisons = compareReviewReports(
      candidate.baseline,
      candidate.current,
      candidate.issueIds,
    );
    const summary = summarizeComparisons(comparisons);
    const picked = await vscode.window.showQuickPick(
      comparisons.map((item) => {
        const issue = item.current ?? item.baseline;
        return {
          label: `${icon(item.status)} [${item.status}] ${issue?.title ?? 'Unknown issue'}`,
          description: issue
            ? `${issue.severity}${item.severityChanged ? ' · severity changed' : ''}`
            : undefined,
          detail: issue?.filePath
            ? `${issue.filePath}${issue.lineStart ? `:${issue.lineStart}` : ''}`
            : issue?.issueId,
        };
      }),
      {
        title: t(
          `ReviewLume Comparison · Round ${candidate.round} · ${summary.resolved} resolved · ${summary.persistent} persistent · ${summary.newIssues} new`,
          `ReviewLume 复核对比 · 第 ${candidate.round} 轮 · 已解决 ${summary.resolved} · 仍存在 ${summary.persistent} · 新增 ${summary.newIssues}`,
        ),
        placeHolder: t(
          'Review the comparison results; selecting an item closes this read-only view.',
          '查看对比结果；选择任一项将关闭此只读视图。',
        ),
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    void picked;
    logInfo(`Re-review comparison viewed (${candidate.entry.metadata.reviewId}, round ${candidate.round})`);
  } catch (error) {
    logWarn(`Re-review comparison failed (${errorCode(error)})`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: Failed to open the re-review comparison safely.',
        'ReviewLume：无法安全打开二次复核对比。',
      ),
    );
  }
}

async function selectCompletedRound(): Promise<ComparisonCandidate | undefined> {
  const repositoryRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repositoryRoot) {
    await vscode.window.showWarningMessage(
      t('ReviewLume: Open a repository folder first.', 'ReviewLume：请先打开仓库文件夹。'),
    );
    return undefined;
  }

  const history = new HistoryService();
  const storage = new ReviewLoopStorageService();
  const reportService = new ReportService();
  const candidates: ComparisonCandidate[] = [];

  for (const entry of await history.list(repositoryRoot)) {
    if (entry.integrity === 'corrupt') continue;
    try {
      const reviewDirectory = await history.getReviewDirectory(
        repositoryRoot,
        entry.metadata.reviewId,
      );
      const response = await history.loadResponse(repositoryRoot, entry.metadata.reviewId);
      const baselineResult = await reportService.readReport(
        reviewDirectory,
        entry.metadata.reviewId,
        response,
      );
      if (baselineResult.status !== 'valid' || !baselineResult.report) continue;
      const state = await storage.readState(reviewDirectory, entry.metadata.reviewId);
      for (const round of state.rounds) {
        if (!round.reportHash) continue;
        const current = parseStoredReviewReport(
          JSON.parse(
            await storage.readReReviewReportText(
              reviewDirectory,
              entry.metadata.reviewId,
              round.round,
            ),
          ),
        );
        candidates.push({
          entry,
          reviewDirectory,
          baseline: baselineResult.report,
          current,
          round: round.round,
          issueIds: round.issueIds ?? state.implementationSummary?.issueIds ?? [],
        });
      }
    } catch {
      // Invalid or incomplete loop state is not selectable.
    }
  }

  if (candidates.length === 0) {
    await vscode.window.showInformationMessage(
      t(
        'ReviewLume: No completed re-review comparison is available.',
        'ReviewLume：没有可查看的已完成二次复核对比。',
      ),
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: `${candidate.entry.metadata.repositoryDisplayName} — ${formatDate(candidate.entry.metadata.createdAt)}`,
      description: t(
        `Round ${candidate.round} · ${candidate.issueIds.length} scoped issue(s)`,
        `第 ${candidate.round} 轮 · ${candidate.issueIds.length} 个范围内问题`,
      ),
      detail: `ID: ${candidate.entry.metadata.reviewId}`,
      candidate,
    })),
    {
      title: t('ReviewLume: Select Re-review Comparison', 'ReviewLume：选择二次复核对比'),
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return picked?.candidate;
}

function icon(status: 'persistent' | 'resolved' | 'new'): string {
  if (status === 'resolved') return '$(pass)';
  if (status === 'new') return '$(warning)';
  return '$(circle-filled)';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : iso;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
