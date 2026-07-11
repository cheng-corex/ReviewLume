import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import type { SecurityReviewService } from '../services/securityReviewService';
import {
  saveAutomaticReviewPack,
  type ReviewPackExportFormat,
  type ReviewPackExportMode,
} from '../services/reviewPackExportService';
import {
  HISTORY_DIRECTORY,
  HistoryService,
  type HistorySaveOptions,
} from '../services/historyService';
import { ensureExportDirectoryIgnored } from '../services/gitignoreService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { logInfo, logWarn } from '../services/logService';

const DEFAULT_EXPORT_DIRECTORY = '.reviewlume/exports';
type BuiltReviewPack = Awaited<ReturnType<SecurityReviewService['buildReviewPack']>>;

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
        let result = await withCancellation(
          'Scanning selected files for sensitive content',
          (signal) => service.scan(signal),
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
          await vscode.window.showInformationMessage(
            `ReviewLume: Sensitive-content scan passed — ${summary}.`,
          );
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
        const activeRepository = service.activeRepository;
        if (!activeRepository) throw new Error('No active review repository.');

        const configuration = vscode.workspace.getConfiguration('reviewlume.export');
        const mode = configuration.get<ReviewPackExportMode>('mode', 'automatic');
        const configuredFormat = configuration.get<ReviewPackExportFormat>('format', 'markdown');
        const configuredDirectory = configuration.get<string>(
          'directory',
          DEFAULT_EXPORT_DIRECTORY,
        );

        if (mode === 'automatic') {
          const result = await saveAutomaticReviewPack(
            activeRepository.root,
            configuredDirectory,
            configuredFormat,
            pack,
          );

          await recordHistory(activeRepository.root, pack, {
            format: configuredFormat,
            mode: 'automatic',
            exportDirectory: configuredDirectory,
          });

          if (configuration.get<boolean>('autoUpdateGitignore', true)) {
            try {
              const ignoreResult = await ensureExportDirectoryIgnored(
                activeRepository.root,
                configuredDirectory,
              );
              logInfo(
                ignoreResult.added
                  ? 'Automatic export directory added to repository .gitignore'
                  : 'Automatic export directory already covered by repository .gitignore',
              );
            } catch (error) {
              logWarn(`Automatic .gitignore update failed (${getErrorCode(error)})`);
              await vscode.window.showWarningMessage(
                'ReviewLume: The Review Pack was saved, but the repository .gitignore could not be updated. Use the ReviewLume action to retry.',
              );
            }
          }

          const choice = await vscode.window.showInformationMessage(
            `ReviewLume: Review Pack ${pack.reviewId} saved automatically (${configuredFormat}).`,
            'Open File',
            'Open Folder',
          );
          if (choice === 'Open File' && result.files[0]) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result.files[0]));
          } else if (choice === 'Open Folder') {
            await vscode.commands.executeCommand(
              'revealFileInOS',
              vscode.Uri.file(result.directory),
            );
          }

          logInfo(`Review Pack exported automatically (${pack.reviewId}, ${configuredFormat})`);
          return;
        }

        const format = await vscode.window.showQuickPick(['Markdown', 'ZIP'] as const, {
          title: 'ReviewLume: Export Review Pack',
          placeHolder: 'Choose an export format',
        });
        if (!format) return;

        const defaultName =
          format === 'Markdown' ? 'REVIEW_REQUEST.md' : `${pack.directoryName}.zip`;
        const destination = await vscode.window.showSaveDialog({
          title: 'ReviewLume: Save Review Pack',
          defaultUri: vscode.Uri.file(path.join(activeRepository.root, defaultName)),
          filters: format === 'Markdown' ? { Markdown: ['md'] } : { ZIP: ['zip'] },
        });
        if (!destination) return;

        const bytes =
          format === 'Markdown' ? Buffer.from(pack.markdown, 'utf8') : Buffer.from(pack.zip);
        await fs.writeFile(destination.fsPath, bytes, { flag: 'wx' });
        await vscode.window.showInformationMessage(
          `ReviewLume: Review Pack ${pack.reviewId} saved (${pack.byteLength} Markdown bytes).`,
        );

        const effectiveFormat: ReviewPackExportFormat =
          format === 'ZIP' ? 'zip' : 'markdown';
        await recordHistory(activeRepository.root, pack, {
          format: effectiveFormat,
          mode: 'askEveryTime',
        });

        logInfo(`Review Pack exported (${pack.reviewId}, ${format})`);
      } catch (error) {
        const code = getErrorCode(error);
        if (code === 'CANCELLED') return;
        logWarn(`Review Pack export failed (${code})`);
        const message =
          code === 'EEXIST'
            ? 'ReviewLume: The export target already exists. Create a new review or choose a different location.'
            : code === 'INVALID_EXPORT_DIRECTORY'
              ? 'ReviewLume: The automatic export directory must stay inside the active repository and cannot traverse symbolic links.'
              : 'ReviewLume: Review Pack export was blocked or failed. Run the sensitive-content scan again and resolve all findings.';
        await vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.ADD_EXPORT_DIRECTORY_TO_GITIGNORE, async () => {
      const warning = getWorkspaceWarning();
      if (warning) {
        await vscode.window.showWarningMessage(`ReviewLume: ${warning}`);
        return;
      }

      const activeRepository = service.activeRepository;
      if (!activeRepository) {
        await vscode.window.showWarningMessage(
          'ReviewLume: Create a Review Pack before updating .gitignore.',
        );
        return;
      }

      const configuredDirectory = vscode.workspace
        .getConfiguration('reviewlume.export')
        .get<string>('directory', DEFAULT_EXPORT_DIRECTORY);

      try {
        const result = await ensureExportDirectoryIgnored(
          activeRepository.root,
          configuredDirectory,
        );
        await vscode.window.showInformationMessage(
          result.added
            ? `ReviewLume: Added ${result.rule} to the repository root .gitignore.`
            : `ReviewLume: ${result.rule} is already covered by the repository root .gitignore.`,
        );
        logInfo(
          result.added
            ? 'Export directory added to repository .gitignore by user command'
            : 'Export directory already covered by repository .gitignore',
        );
      } catch (error) {
        logWarn(`Manual .gitignore update failed (${getErrorCode(error)})`);
        await vscode.window.showErrorMessage(
          'ReviewLume: The repository .gitignore could not be updated safely.',
        );
      }
    }),
  );
}

async function recordHistory(
  repositoryRoot: string,
  pack: BuiltReviewPack,
  options: HistorySaveOptions,
): Promise<void> {
  try {
    // History contains the exact approved review request and must never become Git input.
    await ensureExportDirectoryIgnored(repositoryRoot, HISTORY_DIRECTORY);
    await new HistoryService().save(repositoryRoot, pack, options);
    logInfo(`Review history recorded (${pack.reviewId})`);
  } catch (error) {
    logWarn(`Failed to record review history (${getErrorCode(error)})`);
    await vscode.window.showWarningMessage(
      'ReviewLume: The Review Pack was saved, but its local history was not recorded safely.',
    );
  }
}

async function withCancellation<T>(
  title: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `ReviewLume: ${title}`,
      cancellable: true,
    },
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
