import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService, type HistoryEntry } from '../services/historyService';
import { ReportService } from '../services/reportService';
import {
  generateImplementationPrompt,
  generateReReviewPrompt,
  type ImplementationSummary,
} from '../services/reviewLoopModel';
import {
  ReviewLoopStorageError,
  ReviewLoopStorageService,
  sha256,
} from '../services/reviewLoopStorageService';
import { historyText as t } from '../services/historyI18n';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo, logWarn } from '../services/logService';

const MAX_SUMMARY_BYTES = 800_000;

export function registerReviewLoopCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.GENERATE_IMPLEMENTATION_PROMPT, async () => {
      await runGenerateImplementationPrompt();
    }),
    vscode.commands.registerCommand(COMMANDS.IMPORT_IMPLEMENTATION_SUMMARY, async () => {
      await runImportImplementationSummary();
    }),
    vscode.commands.registerCommand(COMMANDS.GENERATE_RE_REVIEW_PROMPT, async () => {
      await runGenerateReReviewPrompt();
    }),
  );
}

async function runGenerateImplementationPrompt(): Promise<void> {
  const warning = getWorkspaceWarning();
  if (warning) {
    await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return;
  }

  try {
    const selected = await selectReviewWithReport();
    if (!selected) return;
    const issueIds = await selectIssueIds(selected.report.issues, true);
    if (!issueIds) return;

    const prompt = generateImplementationPrompt(selected.report, issueIds);
    const storage = new ReviewLoopStorageService();
    await ensureLoopState(storage, selected.reviewDirectory, selected.entry, selected.report);
    await storage.saveImplementationPrompt(selected.reviewDirectory, prompt);
    await vscode.env.clipboard.writeText(prompt);
    await vscode.window.showInformationMessage(
      t(
        `ReviewLume: Implementation prompt generated for ${issueIds.length} issue(s) and copied to the clipboard.`,
        `ReviewLume：已为 ${issueIds.length} 个问题生成实施提示并复制到剪贴板。`,
      ),
    );
    logInfo(`Implementation prompt generated (${selected.entry.metadata.reviewId})`);
  } catch (error) {
    logWarn(`Implementation prompt generation failed (${errorCode(error)})`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: Failed to generate the implementation prompt safely.',
        'ReviewLume：无法安全生成实施提示。',
      ),
    );
  }
}

async function runImportImplementationSummary(): Promise<void> {
  const warning = getWorkspaceWarning();
  if (warning) {
    await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return;
  }

  try {
    const selected = await selectReviewWithReport();
    if (!selected) return;
    const issueIds = await selectIssueIds(selected.report.issues, false);
    if (!issueIds) return;
    const text = await readTextInput();
    if (text === undefined) return;

    const storage = new ReviewLoopStorageService();
    await ensureLoopState(storage, selected.reviewDirectory, selected.entry, selected.report);
    const summary: ImplementationSummary = {
      importedAt: new Date().toISOString(),
      sourceHash: sha256(text),
      issueIds,
      text,
    };
    await storage.saveImplementationSummary(
      selected.reviewDirectory,
      selected.entry.metadata.reviewId,
      summary,
    );
    await vscode.window.showInformationMessage(
      t(
        `ReviewLume: Implementation summary imported and linked to ${issueIds.length} issue(s). Issue statuses were not changed automatically.`,
        `ReviewLume：修复摘要已导入并关联 ${issueIds.length} 个问题；问题状态未被自动修改。`,
      ),
    );
    logInfo(`Implementation summary imported (${selected.entry.metadata.reviewId})`);
  } catch (error) {
    logWarn(`Implementation summary import failed (${errorCode(error)})`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: Failed to import the implementation summary safely.',
        'ReviewLume：无法安全导入修复摘要。',
      ),
    );
  }
}

async function runGenerateReReviewPrompt(): Promise<void> {
  const warning = getWorkspaceWarning();
  if (warning) {
    await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
    return;
  }

  try {
    const selected = await selectReviewWithReport();
    if (!selected) return;

    const storage = new ReviewLoopStorageService();
    await ensureLoopState(storage, selected.reviewDirectory, selected.entry, selected.report);
    const state = await storage.readState(
      selected.reviewDirectory,
      selected.entry.metadata.reviewId,
    );
    if (!state.implementationSummary) {
      await vscode.window.showWarningMessage(
        t(
          'ReviewLume: Import an implementation summary before generating a re-review prompt.',
          'ReviewLume：请先导入修复摘要，再生成二次复核提示。',
        ),
      );
      return;
    }

    const round = state.rounds.length + 1;
    const prompt = generateReReviewPrompt(selected.report, state.implementationSummary, round);
    await storage.saveReReviewPrompt(
      selected.reviewDirectory,
      selected.entry.metadata.reviewId,
      round,
      prompt,
    );
    await vscode.env.clipboard.writeText(prompt);
    await vscode.window.showInformationMessage(
      t(
        `ReviewLume: Re-review prompt for round ${round} generated and copied to the clipboard.`,
        `ReviewLume：第 ${round} 轮二次复核提示已生成并复制到剪贴板。`,
      ),
    );
    logInfo(`Re-review prompt generated (${selected.entry.metadata.reviewId}, round ${round})`);
  } catch (error) {
    logWarn(`Re-review prompt generation failed (${errorCode(error)})`);
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: Failed to generate the re-review prompt safely.',
        'ReviewLume：无法安全生成二次复核提示。',
      ),
    );
  }
}

async function selectReviewWithReport(): Promise<{
  readonly repositoryRoot: string;
  readonly entry: HistoryEntry;
  readonly reviewDirectory: string;
  readonly report: NonNullable<Awaited<ReturnType<ReportService['readReport']>>['report']>;
} | undefined> {
  const repositoryRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repositoryRoot) {
    await vscode.window.showWarningMessage(
      t('ReviewLume: Open a repository folder first.', 'ReviewLume：请先打开仓库文件夹。'),
    );
    return undefined;
  }

  const history = new HistoryService();
  const entries = (await history.list(repositoryRoot)).filter(
    (entry) => entry.integrity !== 'corrupt',
  );
  if (entries.length === 0) {
    await vscode.window.showInformationMessage(
      t('ReviewLume: No usable review history found.', 'ReviewLume：没有可用的审核历史。'),
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: `${entry.metadata.repositoryDisplayName} — ${formatDate(entry.metadata.createdAt)}`,
      description: `${entry.metadata.fileCount} ${t('file(s)', '个文件')}`,
      detail: `ID: ${entry.metadata.reviewId}`,
      entry,
    })),
    {
      title: t('ReviewLume: Select Review Session', 'ReviewLume：选择审核会话'),
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) return undefined;

  const response = await history.loadResponse(repositoryRoot, picked.entry.metadata.reviewId);
  const reviewDirectory = await history.getReviewDirectory(
    repositoryRoot,
    picked.entry.metadata.reviewId,
  );
  const reportResult = await new ReportService().readReport(
    reviewDirectory,
    picked.entry.metadata.reviewId,
    response,
  );
  if (!reportResult.report || reportResult.status !== 'valid') {
    await vscode.window.showWarningMessage(
      t(
        'ReviewLume: This review does not have a valid structured report. Import or re-parse the review response first.',
        'ReviewLume：该审核没有有效的结构化报告，请先导入或重新解析审核回复。',
      ),
    );
    return undefined;
  }

  return { repositoryRoot, entry: picked.entry, reviewDirectory, report: reportResult.report };
}

async function selectIssueIds(
  issues: readonly {
    readonly issueId: string;
    readonly title: string;
    readonly severity: string;
    readonly status: string;
    readonly filePath?: string;
  }[],
  unresolvedOnly: boolean,
): Promise<string[] | undefined> {
  const available = unresolvedOnly
    ? issues.filter((issue) => issue.status === 'open' || issue.status === 'needs-review')
    : issues;
  if (available.length === 0) {
    await vscode.window.showInformationMessage(
      t('ReviewLume: No matching issues are available.', 'ReviewLume：没有可选择的问题。'),
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    available.map((issue) => ({
      label: `[${issue.severity}] ${issue.title}`,
      description: `${issue.issueId} · ${issue.status}`,
      detail: issue.filePath,
      issueId: issue.issueId,
      picked: true,
    })),
    {
      canPickMany: true,
      title: t('ReviewLume: Select Issues', 'ReviewLume：选择问题'),
      placeHolder: t('Select one or more issues', '选择一个或多个问题'),
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked || picked.length === 0) return undefined;
  return picked.map((item) => item.issueId);
}

async function readTextInput(): Promise<string | undefined> {
  const source = await vscode.window.showQuickPick(
    [
      { label: t('$(file) Read from File', '$(file) 从文件读取'), value: 'file' as const },
      { label: t('$(clippy) Read from Clipboard', '$(clippy) 从剪贴板读取'), value: 'clipboard' as const },
    ],
    { title: t('ReviewLume: Import Implementation Summary', 'ReviewLume：导入修复摘要') },
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
      filters: { 'Markdown/Text': ['md', 'mdx', 'txt', 'text'] },
    });
    if (!uris?.[0]) return undefined;
    const stat = await fs.stat(uris[0].fsPath);
    if (!stat.isFile() || stat.size > MAX_SUMMARY_BYTES) {
      throw new ReviewLoopStorageError('CONTENT_TOO_LARGE', 'Invalid implementation summary file.');
    }
    text = await fs.readFile(uris[0].fsPath, 'utf8');
  }

  if (!text.trim() || Buffer.byteLength(text, 'utf8') > MAX_SUMMARY_BYTES) {
    throw new ReviewLoopStorageError('CONTENT_TOO_LARGE', 'Invalid implementation summary content.');
  }
  return text;
}

async function ensureLoopState(
  storage: ReviewLoopStorageService,
  reviewDirectory: string,
  entry: HistoryEntry,
  report: object,
): Promise<void> {
  try {
    await storage.readState(reviewDirectory, entry.metadata.reviewId);
  } catch (error) {
    if (!(error instanceof ReviewLoopStorageError) || error.code !== 'MISSING_STATE') throw error;
    await storage.initialize(
      reviewDirectory,
      entry.metadata.reviewId,
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
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
