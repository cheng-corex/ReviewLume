/**
 * P6 — ReviewPanelController.
 * The Webview is untrusted. It receives explicit DTOs only and all inbound
 * messages are validated before dispatch to fixed extension operations.
 */
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import {
  getReviewPanelStrings,
  type ExportFormat,
  type ReviewPanelStrings,
} from '../localization';
import type { FileSelectionService } from '../services/fileSelectionService';
import { logInfo, logWarn } from '../services/logService';
import type { SecurityReviewService } from '../services/securityReviewService';
import { getWorkspaceWarning } from '../services/workspaceService';
import { buildReviewPanelHtml } from './reviewPanelHtml';
import {
  ReviewPanelInboundMessageSchema,
  type ReviewPanelFileDto,
  type ReviewPanelFindingDto,
  type ReviewPanelStateDto,
} from './reviewPanelMessages';

const REVIEW_PANEL_VIEW_TYPE = 'reviewlume.reviewPanel';
let existingPanel: vscode.WebviewPanel | undefined;
let existingController: ReviewPanelController | undefined;

export function createOrShowReviewPanel(
  extensionUri: vscode.Uri,
  fileSelectionService: FileSelectionService,
  securityReviewService: SecurityReviewService,
): vscode.WebviewPanel {
  if (existingPanel && existingController) {
    existingPanel.reveal(vscode.ViewColumn.Beside);
    void existingController.postState();
    return existingPanel;
  }

  const strings = getReviewPanelStrings(vscode.env.language);
  const nonce = crypto.randomBytes(16).toString('base64url');
  const panel = vscode.window.createWebviewPanel(
    REVIEW_PANEL_VIEW_TYPE,
    strings.panelTitle,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'media'),
      ],
    },
  );

  panel.webview.html = buildReviewPanelHtml(panel.webview, nonce, strings);
  const controller = new ReviewPanelController(
    panel,
    fileSelectionService,
    securityReviewService,
    strings,
  );
  existingPanel = panel;
  existingController = controller;

  const disposeListener = panel.onDidDispose(() => {
    controller.dispose();
    existingPanel = undefined;
    existingController = undefined;
  });
  controller.disposables.push(disposeListener);
  return panel;
}

export function refreshReviewPanel(): void {
  void existingController?.postState();
}

export class ReviewPanelController {
  readonly disposables: vscode.Disposable[] = [];
  readonly #panel: vscode.WebviewPanel;
  readonly #fileSelectionService: FileSelectionService;
  readonly #securityReviewService: SecurityReviewService;
  readonly #strings: ReviewPanelStrings;
  #disposed = false;

  constructor(
    panel: vscode.WebviewPanel,
    fileSelectionService: FileSelectionService,
    securityReviewService: SecurityReviewService,
    strings = getReviewPanelStrings(vscode.env.language),
  ) {
    this.#panel = panel;
    this.#fileSelectionService = fileSelectionService;
    this.#securityReviewService = securityReviewService;
    this.#strings = strings;
    this.disposables.push(
      panel.webview.onDidReceiveMessage((rawMessage: unknown) =>
        this.#handleMessage(rawMessage),
      ),
    );
  }

  async postState(): Promise<void> {
    if (this.#disposed) return;
    const payload = await this.#buildStateDto();
    await this.#panel.webview.postMessage({ type: 'state', payload });
  }

  postError(message: string): void {
    if (this.#disposed) return;
    void this.#panel.webview.postMessage({ type: 'error', message });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  async #handleMessage(rawMessage: unknown): Promise<void> {
    const parsed = ReviewPanelInboundMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      logWarn('ReviewPanel received an invalid message');
      this.postError(this.#strings.invalidMessage);
      return;
    }

    const message = parsed.data;
    try {
      switch (message.type) {
        case 'createReviewPack':
          await vscode.commands.executeCommand(COMMANDS.CREATE_REVIEW_PACK);
          break;
        case 'toggleFile':
          this.#toggleFile(message.filePath, message.selected);
          break;
        case 'addRelatedFiles':
          await vscode.commands.executeCommand(COMMANDS.ADD_RELATED_FILES);
          break;
        case 'recommendTestFiles':
          await vscode.commands.executeCommand(COMMANDS.RECOMMEND_TEST_FILES);
          break;
        case 'scan':
          await this.#scan();
          break;
        case 'confirmWarning':
          this.#confirmWarnings(message.findingIds);
          break;
        case 'export':
          await vscode.commands.executeCommand(COMMANDS.EXPORT_REVIEW_PACK);
          break;
        case 'copyPrompt':
          await this.#copyPrompt();
          break;
        case 'updateGitignore':
          await vscode.commands.executeCommand(
            COMMANDS.ADD_EXPORT_DIRECTORY_TO_GITIGNORE,
          );
          break;
        case 'setExportFormat':
          await this.#setExportFormat(message.format);
          break;
        case 'refresh':
          break;
      }
      await this.postState();
    } catch (error) {
      const code = getErrorCode(error);
      logWarn(`ReviewPanel operation failed (${message.type}, ${code})`);
      this.postError(this.#strings.genericOperationError);
    }
  }

  async #setExportFormat(format: ExportFormat): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('reviewlume');
    await configuration.update(
      'export.format',
      format,
      vscode.ConfigurationTarget.Workspace,
    );
    await this.#panel.webview.postMessage({ type: 'formatUpdated', format });
    logInfo(`Review Panel export format updated to ${format}`);
  }

  #toggleFile(filePath: string, selected: boolean): void {
    if (!this.#fileSelectionService.hasSession) {
      throw Object.assign(new Error('No active review session.'), {
        code: 'NO_ACTIVE_SESSION',
      });
    }
    const normalizedPath = filePath.replace(/\\/g, '/');
    const entry = this.#fileSelectionService.entries.find(
      (candidate) => candidate.path === normalizedPath,
    );
    if (!entry) {
      logWarn('ReviewPanel rejected a file outside the active selection');
      throw Object.assign(new Error('Unknown review file.'), {
        code: 'UNKNOWN_REVIEW_FILE',
      });
    }
    this.#fileSelectionService.setSelected(entry.path, selected);
    this.#securityReviewService.invalidate();
  }

  async #scan(): Promise<void> {
    const warning = getWorkspaceWarning();
    if (warning) {
      throw Object.assign(new Error(warning), { code: 'WORKSPACE_BLOCKED' });
    }
    await this.#securityReviewService.scan();
  }

  #confirmWarnings(findingIds: readonly string[]): void {
    const lastScan = this.#securityReviewService.lastScan;
    if (!lastScan) {
      throw Object.assign(new Error('No scan available.'), {
        code: 'NO_SCAN_RESULT',
      });
    }
    const uniqueIds = new Set(findingIds);
    if (uniqueIds.size !== findingIds.length) {
      throw Object.assign(new Error('Duplicate finding IDs.'), {
        code: 'INVALID_FINDING_IDS',
      });
    }
    const findings = lastScan.findings.filter(
      (finding) =>
        uniqueIds.has(finding.id) &&
        finding.level === 'WARN' &&
        finding.resolution.kind === 'unresolved',
    );
    if (findings.length !== uniqueIds.size) {
      throw Object.assign(new Error('Unknown or resolved finding ID.'), {
        code: 'INVALID_FINDING_IDS',
      });
    }
    this.#securityReviewService.confirmWarnings(findings);
  }

  async #copyPrompt(): Promise<void> {
    const pack = await this.#securityReviewService.buildReviewPack();
    await vscode.env.clipboard.writeText(pack.markdown);
    await this.#panel.webview.postMessage({ type: 'copyComplete' });
    logInfo('Review prompt copied to clipboard from the review panel');
  }

  async #buildStateDto(): Promise<ReviewPanelStateDto> {
    const base = this.#buildBaseState();
    if (!base) return emptyState(this.#getExportFormat());
    if (!base.canExport || base.selectedCount === 0) return base;

    try {
      const pack = await this.#securityReviewService.buildReviewPack();
      return {
        ...base,
        reviewPackPreview: pack.markdown,
        reviewPackByteLength: pack.byteLength,
        reviewPackCharLength: pack.markdown.length,
        reviewPackTruncated: pack.manifest.truncations.length > 0,
        truncationMessages: [...pack.manifest.truncations],
        estimatedTokens: Math.ceil(pack.markdown.length / 4),
      };
    } catch (error) {
      logWarn(`ReviewPanel preview unavailable (${getErrorCode(error)})`);
      return { ...base, canExport: false };
    }
  }

  #getExportFormat(): ExportFormat {
    return vscode.workspace
      .getConfiguration('reviewlume')
      .get<ExportFormat>('export.format', 'markdown');
  }

  #buildBaseState(): ReviewPanelStateDto | undefined {
    const selection = this.#fileSelectionService;
    const lastScan = this.#securityReviewService.lastScan;
    if (!selection.hasSession || !selection.repository) return undefined;

    const files: ReviewPanelFileDto[] = selection.entries.map((entry) => ({
      path: entry.path,
      source: entry.source,
      changeKinds: [...entry.changeKinds],
      exists: entry.exists,
      selected: entry.selected,
    }));
    const findings: ReviewPanelFindingDto[] = lastScan
      ? lastScan.findings.map((finding) => ({
          id: finding.id,
          level: finding.level,
          file: finding.file,
          line: finding.line,
          column: finding.column,
          rule: finding.rule,
          message: finding.message,
          preview: finding.preview,
          confirmed: finding.resolution.kind === 'confirmed',
        }))
      : [];

    return {
      hasSession: true,
      repositoryDisplayName: selection.repository.displayName,
      files,
      selectedCount: selection.selectedCount,
      totalCount: selection.entries.length,
      findings,
      hardBlockCount: lastScan?.hardBlockCount ?? 0,
      blockCount: lastScan?.blockCount ?? 0,
      warnCount: lastScan?.warnCount ?? 0,
      infoCount: lastScan?.infoCount ?? 0,
      confirmedWarnCount: lastScan?.confirmedWarnCount ?? 0,
      canExport: lastScan?.canExport ?? false,
      hasScanResult: lastScan !== undefined,
      reviewPackPreview: '',
      reviewPackByteLength: 0,
      reviewPackCharLength: 0,
      reviewPackTruncated: false,
      truncationMessages: [],
      estimatedTokens: 0,
      exportFormat: this.#getExportFormat(),
    };
  }
}

function emptyState(exportFormat: ExportFormat): ReviewPanelStateDto {
  return {
    hasSession: false,
    repositoryDisplayName: '',
    files: [],
    selectedCount: 0,
    totalCount: 0,
    findings: [],
    hardBlockCount: 0,
    blockCount: 0,
    warnCount: 0,
    infoCount: 0,
    confirmedWarnCount: 0,
    canExport: false,
    hasScanResult: false,
    reviewPackPreview: '',
    reviewPackByteLength: 0,
    reviewPackCharLength: 0,
    reviewPackTruncated: false,
    truncationMessages: [],
    estimatedTokens: 0,
    exportFormat,
  };
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}
