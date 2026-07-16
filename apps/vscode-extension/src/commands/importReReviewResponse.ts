import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { parseReviewResponse, type ReviewReport } from '@reviewlume/report-parser';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { historyText as t } from '../services/historyI18n';
import { logInfo, logWarn } from '../services/logService';
import {
  compareReviewReports,
  summarizeComparisons,
} from '../services/reviewLoopModel';
import {
  ReviewLoopStorageError,
  ReviewLoopStorageService,
} from '../services/reviewLoopStorageService';
import { parseStoredReviewReport } from '../services/reportSchema';
import { ReportService } from '../services/reportService';
import { getWorkspaceWarning } from '../services/workspaceService';

const MAX_RESPONSE_BYTES = 800_000;

export function registerImportReReviewResponse(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.IMPORT_RE_REVIEW_RESPONSE, async () => {
      await runImportReReviewResponse();
    }),
  );
}

async function runImportReReviewResponse(): Promise<void> {
  const warning = getWorkspaceWarning();
  if (warning) {
    await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return;
  }

  try {
    const selected = await selectReviewWithPendingRound();
    if (!selected) return;
    const responseText = await readTextInput();
    if (responseText === undefined) return;

    const parsed = parseReviewResponse(responseText, {
      reviewId: selected.entry.metadata.reviewId,
    });
    const report = parseStoredReviewReport(parsed.report);
    if (report.reviewId !== selected.entry.metadata.reviewId) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Re-review response reviewId mismatch.');
    }

    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    await selected.storage.saveReReviewResult(
      selected.reviewDirectory,
      selected.entry.metadata.reviewId,
      selected.round,
      responseText,
      reportText,
    );

    const comparisons = compareReviewReports(
      selected.baselineReport,
      report,
      selected.issueIds,
    );
    const summary = summarizeComparisons(comparisons);
    await vscode.window.showInformationMessage(
      t(
        `ReviewLume: Re-review round ${selected.round} imported — ${summary.resolved} resolved, ${summary.persistent} persistent, ${summary.newIssues} new.`,
        `ReviewLume：第 ${selected.round} 轮复核已导入 — 已解决 ${summary.resolved}、仍存在 ${summary.persistent}、新增 ${summary.newIssues}。`,
      ),
    );
    logInfo(
      `Re-review response imported (${selected.entry.metadata.reviewId}, round ${selected.round})`,
    );
  } catch (error) {
    logWarn(`Re-review response import failed (${errorCode(error)})`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: Failed to import the re-review response safely.',
        'ReviewLume：无法安全导入二次复核回复。',
      ),
    );
  }
}

async function selectReviewWithPendingRound(): Promise<{
  readonly entry: HistoryEntry;
  readonly reviewDirectory: string;
  readonly baselineReport: ReviewReport;
  readonly storage: ReviewLoopStorageService;
  readonly round: number;
  readonly issueIds: readonly string[];
} | undefined> {
  const repositoryRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repositoryRoot) {
    await vscode.window.showWarningMessage(
      t('ReviewLume: Open a repository folder first.', 'ReviewLume：请先打开仓库文件夹。'),
    );
    return undefined;
  }

  const history = new HistoryService();
  const storage = new ReviewLoopStorageService();
  const candidates: Array<{
    entry: HistoryEntry;
    reviewDirectory: string;
    baselineReport: ReviewReport;
    round: number;
    issueIds: readonly string[];
  }> = [];

  for (const entry of await history.list(repositoryRoot)) {
    if (entry.integrity === 'corrupt') continue;
    try {
      const reviewDirectory = await history.getReviewDirectory(
        repositoryRoot,
        entry.metadata.reviewId,
      );
      const state = await storage.readState(reviewDirectory, entry.metadata.reviewId);
      const pending = state.rounds.find((item) => !item.responseHash && !item.reportHash);
      if (!pending || !state.implementationSummary) continue;
      const response = await history.loadResponse(repositoryRoot, entry.metadata.reviewId);
      const result = await new ReportService().readReport(
        reviewDirectory,
        entry.metadata.reviewId,
        response,
      );
      if (result.status !== 'valid' || !result.report) continue;
      candidates.push({
        entry,
        reviewDirectory,
        baselineReport: result.report,
        round: pending.round,
        issueIds: pending.issueIds,
      });
    } catch {
      // Invalid or incomplete loop state is not selectable.
    }
  }

  if (candidates.length === 0) {
    await vscode.window.showInformationMessage(
      t(
        'ReviewLume: No pending re-review round is available.',
        'ReviewLume：没有待导入结果的二次复核轮次。',
      ),
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: `${candidate.entry.metadata.repositoryDisplayName} — ${formatDate(candidate.entry.metadata.createdAt)}`,
      description: t(
        `Round ${candidate.round} · ${candidate.issueIds.length} issue(s)`,
        `第 ${candidate.round} 轮 · ${candidate.issueIds.length} 个问题`,
      ),
      detail: `ID: ${candidate.entry.metadata.reviewId}`,
      candidate,
    })),
    {
      title: t('ReviewLume: Select Pending Re-review', 'ReviewLume：选择待导入的二次复核'),
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) return undefined;
  return { ...picked.candidate, storage };
}

async function readTextInput(): Promise<string | undefined> {
  const source = await vscode.window.showQuickPick(
    [
      { label: t('$(file) Read from File', '$(file) 从文件读取'), value: 'file' as const },
      { label: t('$(clippy) Read from Clipboard', '$(clippy) 从剪贴板读取'), value: 'clipboard' as const },
    ],
    { title: t('ReviewLume: Import Re-review Response', 'ReviewLume：导入二次复核回复') },
  );
  if (!source) return undefined;

  let text: string;
  if (source.value === 'clipboard') {
    text = await vscode.env.clipboard.readText();
  } else {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Markdown/Text': ['md', 'mdx', 'txt', 'text', 'json'] },
    });
    if (!uris?.[0]) return undefined;
    const stat = await fs.stat(uris[0].fsPath);
    if (!stat.isFile() || stat.size > MAX_RESPONSE_BYTES) {
      throw new ReviewLoopStorageError('CONTENT_TOO_LARGE', 'Invalid re-review response file.');
    }
    text = await fs.readFile(uris[0].fsPath, 'utf8');
  }

  if (!text.trim() || Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ReviewLoopStorageError('CONTENT_TOO_LARGE', 'Invalid re-review response content.');
  }
  return text;
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
