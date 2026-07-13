import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { HistoryService } from '../services/historyService';
import { ReportService } from '../services/reportService';
import { GitContextService } from '../services/gitContextService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { historyText as t } from '../services/historyI18n';
import { logInfo, logWarn } from '../services/logService';
import type { FileSelectionService } from '../services/fileSelectionService';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export function registerImportReviewResponse(
  context: vscode.ExtensionContext,
  fileSelectionService?: FileSelectionService,
  providedGitContextService?: GitContextService,
): void {
  const disposable = vscode.commands.registerCommand(
    COMMANDS.IMPORT_REVIEW_RESPONSE,
    async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        logInfo(`importReviewResponse blocked — ${warning}`);
        return;
      }

      try {
        const repositoryRoot = await resolveRepositoryRoot(
          fileSelectionService,
          providedGitContextService,
        );
        if (!repositoryRoot) return;

        const historyService = new HistoryService();
        const entries = (await historyService.list(repositoryRoot)).filter(
          (entry) => entry.integrity !== 'corrupt',
        );
        if (entries.length === 0) {
          await vscode.window.showInformationMessage(
            t(
              'ReviewLume: No usable review history found. Export a Review Pack first.',
              'ReviewLume：没有可用的审核历史，请先导出审核包。',
            ),
          );
          return;
        }

        const items = entries.map((entry) => ({
          label: `${entry.metadata.repositoryDisplayName} — ${formatDate(entry.metadata.createdAt)}`,
          description: `${entry.metadata.exportFormat} · ${entry.metadata.fileCount} ${t('file(s)', '个文件')}`,
          detail: `ID: ${entry.metadata.reviewId}`,
          entry,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          title: t('ReviewLume: Select Review Session', 'ReviewLume：选择审核会话'),
          placeHolder: t(
            'Choose the review session to import a response for',
            '选择要导入回复的审核会话',
          ),
        });
        if (!picked) return;

        const sourceChoice = await vscode.window.showQuickPick(
          [
            {
              label: t('$(file) Read from File', '$(file) 从文件读取'),
              description: t('Open a Markdown or text file', '打开 Markdown 或文本文件'),
              action: 'file' as const,
            },
            {
              label: t('$(clippy) Paste from Clipboard', '$(clippy) 从剪贴板粘贴'),
              description: t('Import response text from clipboard', '从剪贴板导入回复文本'),
              action: 'clipboard' as const,
            },
          ],
          {
            title: t('ReviewLume: Import Response', 'ReviewLume：导入审核回复'),
            placeHolder: t('Choose response source', '选择回复来源'),
          },
        );
        if (!sourceChoice) return;

        const responseText = await readResponseText(sourceChoice.action);
        if (responseText === undefined) return;

        const reviewId = picked.entry.metadata.reviewId;
        try {
          await historyService.saveResponse(repositoryRoot, reviewId, responseText, false);
        } catch (error) {
          if (getErrorCode(error) !== 'EEXIST') throw error;
          const overwrite = await vscode.window.showWarningMessage(
            t(
              'ReviewLume: A response already exists for this session. Overwrite it?',
              'ReviewLume：该会话已经存在回复，是否覆盖？',
            ),
            { modal: true },
            t('Overwrite', '覆盖'),
            t('Cancel', '取消'),
          );
          if (overwrite !== t('Overwrite', '覆盖')) return;
          await historyService.saveResponse(repositoryRoot, reviewId, responseText, true);
        }

        const title = extractSafeTitle(responseText);

        // P8A: Auto-parse the response into a structured report
        let parseMessage = '';
        try {
          const reportService = new ReportService();
          const reviewDir = await historyService.getReviewDirectory(
            repositoryRoot,
            reviewId,
          );
          const report = await reportService.createReport(
            reviewDir,
            reviewId,
            responseText,
          );
          parseMessage = t(
            ` — ${report.issues.length} issue(s) identified (${report.parseStatus}).`,
            ` — 识别到 ${report.issues.length} 个问题（${report.parseStatus}）。`,
          );
          logInfo(
            `Report auto-parsed for review ${reviewId}: ${report.issues.length} issues, status=${report.parseStatus}`,
          );
        } catch (parseError) {
          // Parsing failure must not roll back the saved response
          parseMessage = t(
            ' — Response saved but structured parse failed.',
            ' — 原始回复已保存，但结构化解析失败。',
          );
          logWarn(
            `Report parse failed for review ${reviewId} (response still saved): ${getErrorCode(parseError)}`,
          );
        }

        await vscode.window.showInformationMessage(
          title
            ? t(
                `ReviewLume: Response imported — "${title}"${parseMessage}`,
                `ReviewLume：审核回复已导入——"${title}"${parseMessage}`,
              )
            : t(
                `ReviewLume: Response imported.${parseMessage}`,
                `ReviewLume：审核回复已导入。${parseMessage}`,
              ),
        );
        // Never log response content or a user-controlled title.
        logInfo(`Review response imported (${reviewId})`);
      } catch (error) {
        logWarn(`Review response import failed (${getErrorCode(error)})`);
        await vscode.window.showErrorMessage(
          t(
            'ReviewLume: Failed to import the review response safely.',
            'ReviewLume：无法安全导入审核回复。',
          ),
        );
      }
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
        'ReviewLume: No workspace folder is open. Open a folder to import review responses.',
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
        title: t('ReviewLume: Select Repository', 'ReviewLume：选择仓库'),
        placeHolder: t('Choose a repository', '选择仓库'),
      });
      return picked?.repo;
    },
  );

  if (!inspection || inspection.kind !== 'ready') {
    if (inspection?.kind === 'git-unavailable') {
      await vscode.window.showWarningMessage(
        t('ReviewLume: Git is not available.', 'ReviewLume：Git 不可用。'),
      );
    } else if (inspection?.kind === 'no-repository') {
      await vscode.window.showWarningMessage(
        t(
          'ReviewLume: No Git repository was found.',
          'ReviewLume：未找到 Git 仓库。',
        ),
      );
    }
    return undefined;
  }
  return inspection.repository.root;
}

async function readResponseText(
  source: 'file' | 'clipboard',
): Promise<string | undefined> {
  let responseText: string;
  if (source === 'file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Markdown/Text': ['md', 'mdx', 'txt', 'text'] },
      title: t('ReviewLume: Select Response File', 'ReviewLume：选择回复文件'),
    });
    if (!uris?.[0]) return undefined;
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(uris[0].fsPath);
    if (!stat.isFile() || stat.size > MAX_RESPONSE_BYTES) {
      await vscode.window.showErrorMessage(
        t(
          'ReviewLume: The selected file is invalid or larger than 5 MB.',
          'ReviewLume：所选文件无效或超过 5 MB。',
        ),
      );
      return undefined;
    }
    responseText = await fs.readFile(uris[0].fsPath, 'utf8');
  } else {
    responseText = await vscode.env.clipboard.readText();
  }

  if (!responseText.trim()) {
    await vscode.window.showErrorMessage(
      t('ReviewLume: The response is empty.', 'ReviewLume：回复内容为空。'),
    );
    return undefined;
  }
  if (Buffer.byteLength(responseText, 'utf8') > MAX_RESPONSE_BYTES) {
    await vscode.window.showErrorMessage(
      t(
        'ReviewLume: The response is larger than 5 MB.',
        'ReviewLume：回复内容超过 5 MB。',
      ),
    );
    return undefined;
  }
  return responseText;
}

function extractSafeTitle(text: string): string | undefined {
  const title = text.match(/^#{1,2}\s+(.+)$/m)?.[1]
    ?.replace(/[\0\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
  return title || undefined;
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

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
