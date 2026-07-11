import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { SecurityReviewService } from '../services/securityReviewService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo, logWarn } from '../services/logService';

export function registerSecurityReviewCommands(
  context: vscode.ExtensionContext,
  service: SecurityReviewService,
  refresh: () => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SCAN_SELECTED_FILES, async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        return;
      }

      try {
        let result = await withCancellation('Scanning selected files for sensitive content', (signal) =>
          service.scan(signal),
        );
        const unresolvedWarnings = result.findings.filter(
          (finding) => finding.level === 'WARN' && finding.resolution.kind === 'unresolved',
        );
        const confirmed = [];
        for (const finding of unresolvedWarnings) {
          const choice = await vscode.window.showWarningMessage(
            `ReviewLume WARN: ${finding.file}:${finding.line} — ${finding.message}\n${finding.preview}`,
            { modal: true },
            'Confirm WARN',
            'Cancel',
          );
          if (choice !== 'Confirm WARN') break;
          confirmed.push(finding);
        }
        if (confirmed.length > 0) result = service.confirmWarnings(confirmed);
        refresh();

        const summary = `HARD_BLOCK ${result.hardBlockCount}, BLOCK ${result.blockCount}, WARN ${result.warnCount} (${result.confirmedWarnCount} confirmed), INFO ${result.infoCount}`;
        if (result.canExport) {
          await vscode.window.showInformationMessage(`ReviewLume: Sensitive-content scan passed — ${summary}.`);
        } else {
          await vscode.window.showWarningMessage(
            `ReviewLume: Export remains blocked — ${summary}. Remove HARD_BLOCK content; exclude or redact BLOCK content and rescan; confirm each WARN.`,
          );
        }
        logInfo(`Sensitive-content scan completed (${summary})`);
      } catch (error) {
        if (getErrorCode(error) === 'CANCELLED') return;
        logWarn(`Sensitive-content scan failed (${getErrorCode(error)})`);
        await vscode.window.showErrorMessage(
          'ReviewLume: Sensitive-content scan failed. No raw matched secret was written to the UI or log.',
        );
      }
    }),

    vscode.commands.registerCommand(COMMANDS.EXPORT_REVIEW_PACK, async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        return;
      }

      try {
        const pack = await withCancellation('Building privacy-safe Review Pack', (signal) =>
          service.buildReviewPack(signal),
        );
        const format = await vscode.window.showQuickPick(['Markdown', 'ZIP'] as const, {
          title: 'ReviewLume: Export Review Pack',
          placeHolder: 'Choose an export format',
        });
        if (!format) return;

        const activeRepository = service.activeRepository;
        if (!activeRepository) throw new Error('No active review repository.');
        const defaultName = format === 'Markdown' ? 'REVIEW_REQUEST.md' : `${pack.directoryName}.zip`;
        const destination = await vscode.window.showSaveDialog({
          title: 'ReviewLume: Save Review Pack',
          defaultUri: vscode.Uri.file(path.join(activeRepository.root, defaultName)),
          filters: format === 'Markdown' ? { Markdown: ['md'] } : { ZIP: ['zip'] },
        });
        if (!destination) return;

        const bytes = format === 'Markdown' ? Buffer.from(pack.markdown, 'utf8') : Buffer.from(pack.zip);
        await fs.writeFile(destination.fsPath, bytes, { flag: 'wx' });
        await vscode.window.showInformationMessage(
          `ReviewLume: Review Pack ${pack.reviewId} saved (${pack.byteLength} Markdown bytes).`,
        );
        logInfo(`Review Pack exported (${pack.reviewId}, ${format})`);
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'CANCELLED') return;
        logWarn(`Review Pack export failed (${code})`);
        const message = code === 'EEXIST'
          ? 'ReviewLume: The selected export file already exists. Choose a new file name.'
          : 'ReviewLume: Review Pack export was blocked or failed. Run the sensitive-content scan again and resolve all findings.';
        await vscode.window.showErrorMessage(message);
      }
    }),
  );
}

async function withCancellation<T>(
  title: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ReviewLume: ${title}`, cancellable: true },
    async (_progress, token) => {
      const controller = new AbortController();
      const disposable = token.onCancellationRequested(() => controller.abort());
      try {
        return await operation(controller.signal);
      } finally {
        disposable.dispose();
      }
    },
  );
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
