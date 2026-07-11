/**
 * P6 — ReviewPanelController
 *
 * Owns the ReviewLume review panel Webview panel. It is the single bridge
 * between the Webview (untrusted) and VS Code services (trusted).
 *
 * ═══════════════════════════════════════════════════════════════════
 * SECURITY:
 * - Every inbound Webview message is validated with Zod before dispatch.
 * - The controller calls existing services for all real work; the
 *   Webview never touches Git, the file system, or the Review Pack builder.
 * - State DTOs are constructed explicitly — no raw service objects are
 *   passed through.
 * - CSP is configured to block remote resources and eval.
 * ═══════════════════════════════════════════════════════════════════
 */
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ReviewPanelInboundMessageSchema } from './reviewPanelMessages';
import { buildReviewPanelHtml } from './reviewPanelHtml';
import type {
  ReviewPanelStateDto,
  ReviewPanelFileDto,
  ReviewPanelFindingDto,
} from './reviewPanelMessages';
import type { FileSelectionService } from '../services/fileSelectionService';
import type { SecurityReviewService } from '../services/securityReviewService';
import { logInfo, logWarn } from '../services/logService';

/**
 * Mapping from panel view type to the internal label used for multiplexing.
 * Only one review panel is allowed at a time — re-focusing an existing panel
 * is preferred over creating a second one.
 */
const REVIEW_PANEL_VIEW_TYPE = 'reviewlume.reviewPanel';

/**
 * Closed panel sentinel used to detect whether a panel was explicitly
 * disposed by the user.
 */
let existingPanel: vscode.WebviewPanel | undefined;

/**
 * Create or reveal the single review panel Webview.
 */
export function createOrShowReviewPanel(
  extensionUri: vscode.Uri,
  fileSelectionService: FileSelectionService,
  securityReviewService: SecurityReviewService,
): vscode.WebviewPanel {
  if (existingPanel) {
    existingPanel.reveal(vscode.ViewColumn.Beside);
    return existingPanel;
  }

  const nonce = crypto.randomBytes(16).toString('base64url');

  const panel = vscode.window.createWebviewPanel(
    REVIEW_PANEL_VIEW_TYPE,
    'ReviewLume Review Panel',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'media'),
      ],
    },
  );

  panel.webview.html = buildReviewPanelHtml(panel.webview, nonce);

  const controller = new ReviewPanelController(
    panel,
    fileSelectionService,
    securityReviewService,
  );

  panel.onDidDispose(
    () => {
      controller.dispose();
      existingPanel = undefined;
    },
    undefined,
    controller.disposables,
  );

  existingPanel = panel;
  return panel;
}

/**
 * Manages the life cycle of a single review panel Webview.
 */
export class ReviewPanelController {
  readonly disposables: vscode.Disposable[] = [];
  readonly #panel: vscode.WebviewPanel;
  readonly #fileSelectionService: FileSelectionService;
  readonly #securityReviewService: SecurityReviewService;
  #disposed = false;

  constructor(
    panel: vscode.WebviewPanel,
    fileSelectionService: FileSelectionService,
    securityReviewService: SecurityReviewService,
  ) {
    this.#panel = panel;
    this.#fileSelectionService = fileSelectionService;
    this.#securityReviewService = securityReviewService;

    this.disposables.push(
      panel.webview.onDidReceiveMessage(
        (rawMessage: unknown) => this.#handleMessage(rawMessage),
        undefined,
        this.disposables,
      ),
    );
  }

  /** Send a state snapshot to the Webview. */
  async postState(): Promise<void> {
    if (this.#disposed) return;
    const state = await this.#buildStateDto();
    this.#panel.webview.postMessage({ type: 'state', payload: state });
  }

  /** Send an error message to the Webview. */
  postError(message: string): void {
    if (this.#disposed) return;
    this.#panel.webview.postMessage({ type: 'error', message });
  }

  /** Send scan-complete state to the Webview (includes Review Pack preview). */
  async postScanComplete(): Promise<void> {
    if (this.#disposed) return;
    const state = await this.#buildStateDtoWithPreview();
    this.#panel.webview.postMessage({ type: 'scanComplete', payload: state });
  }

  /** Notify the Webview that a Review Pack export succeeded. */
  postExportComplete(reviewId: string): void {
    if (this.#disposed) return;
    this.#panel.webview.postMessage({ type: 'exportComplete', reviewId });
  }

  /** Notify the Webview that a Review Pack export failed. */
  postExportError(message: string): void {
    if (this.#disposed) return;
    this.#panel.webview.postMessage({ type: 'exportError', message });
  }

  /** Notify the Webview that a prompt copy succeeded. */
  postCopyComplete(): void {
    if (this.#disposed) return;
    this.#panel.webview.postMessage({ type: 'copyComplete' });
  }

  dispose(): void {
    this.#disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  // ─── Private ─────────────────────────────────────────────────────

  /** Validate and dispatch an inbound Webview message. */
  async #handleMessage(rawMessage: unknown): Promise<void> {
    // SECURITY: Every inbound message MUST pass Zod validation.
    const parsed = ReviewPanelInboundMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      logWarn('ReviewPanel received an invalid message from the Webview');
      this.postError('Invalid message received from the Webview.');
      return;
    }

    const message = parsed.data;

    try {
      switch (message.type) {
        case 'createReviewPack':
          await vscode.commands.executeCommand('reviewlume.createReviewPack');
          await this.postState();
          break;

        case 'toggleFile':
          this.#handleToggleFile(message.filePath, message.selected);
          await this.postState();
          break;

        case 'addRelatedFiles':
          await vscode.commands.executeCommand('reviewlume.addRelatedFiles');
          await this.postState();
          break;

        case 'recommendTestFiles':
          await vscode.commands.executeCommand('reviewlume.recommendTestFiles');
          await this.postState();
          break;

        case 'scan':
          await this.#handleScan();
          await this.postScanComplete();
          break;

        case 'confirmWarning':
          await this.#handleConfirmWarnings(message.findingIds);
          await this.postScanComplete();
          break;

        case 'export':
          await vscode.commands.executeCommand('reviewlume.exportReviewPack');
          await this.postState();
          break;

        case 'copyPrompt':
          await this.#handleCopyPrompt();
          break;

        case 'updateGitignore':
          await vscode.commands.executeCommand(
            'reviewlume.addExportDirectoryToGitignore',
          );
          await this.postState();
          break;

        case 'refresh':
          await this.postState();
          break;

        default:
          break;
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'An unknown error occurred.';
      logWarn(`ReviewPanel command failed (${message.type}): ${messageText}`);
      this.postError(messageText);
    }
  }

  #handleToggleFile(filePath: string, selected: boolean): void {
    // SECURITY: Verify the file path belongs to the current session.
    const service = this.#fileSelectionService;
    if (!service.hasSession) return;

    // Verify the path exists in the current session.
    const entry = service.entries.find(
      (e) => e.path === filePath.replace(/\\/g, '/'),
    );
    if (!entry) {
      logWarn(
        `ReviewPanel: Webview tried to toggle an unknown path: ${filePath}`,
      );
      return;
    }

    service.setSelected(entry.path, selected);
    this.#securityReviewService.invalidate();
  }

  async #handleScan(): Promise<void> {
    const warning = this.#getWorkspaceWarning();
    if (warning) {
      this.postError(warning);
      return;
    }

    await this.#securityReviewService.scan();
  }

  async #handleConfirmWarnings(findingIds: readonly string[]): Promise<void> {
    const lastScan = this.#securityReviewService.lastScan;
    if (!lastScan) {
      this.postError('No scan results available. Run a scan first.');
      return;
    }

    const findings = lastScan.findings.filter(
      (f) =>
        findingIds.includes(f.id) &&
        f.level === 'WARN' &&
        f.resolution.kind === 'unresolved',
    );

    if (findings.length === 0) {
      this.postError('No matching unresolved WARN findings found.');
      return;
    }

    this.#securityReviewService.confirmWarnings(findings);
  }

  async #handleCopyPrompt(): Promise<void> {
    const lastScan = this.#securityReviewService.lastScan;
    if (!lastScan) {
      this.postError(
        'Run the sensitive-content scan and build a Review Pack first.',
      );
      return;
    }

    try {
      const pack = await this.#securityReviewService.buildReviewPack();
      await vscode.env.clipboard.writeText(pack.markdown);
      this.postCopyComplete();
      logInfo('Review prompt copied to clipboard from the review panel.');
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to build Review Pack.';
      logWarn(`Review prompt copy failed: ${messageText}`);
      this.postError(messageText);
    }
  }

  /** Build a basic state DTO without Review Pack preview (synchronous portion). */
  #buildBaseState(): ReviewPanelStateDto | null {
    const service = this.#fileSelectionService;
    const scanService = this.#securityReviewService;
    const lastScan = scanService.lastScan;

    if (!service.hasSession || !service.repository) {
      return null;
    }

    const files: ReviewPanelFileDto[] = service.entries.map((entry) => ({
      path: entry.path,
      source: entry.source,
      changeKinds: [...entry.changeKinds],
      exists: entry.exists,
      selected: entry.selected,
    }));

    const findings: ReviewPanelFindingDto[] = lastScan
      ? lastScan.findings.map((f) => ({
          id: f.id,
          level: f.level,
          file: f.file,
          line: f.line,
          column: f.column,
          rule: f.rule,
          message: f.message,
          preview: f.preview,
          confirmed: f.resolution.kind === 'confirmed',
        }))
      : [];

    return {
      hasSession: true,
      repositoryDisplayName: service.repository.displayName,
      repositoryRoot: service.repository.root,
      files,
      selectedCount: service.selectedCount,
      totalCount: service.entries.length,
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
    };
  }

  /** Build a lightweight state DTO (no Review Pack preview). */
  async #buildStateDto(): Promise<ReviewPanelStateDto> {
    const base = this.#buildBaseState();
    if (!base) {
      return {
        hasSession: false,
        repositoryDisplayName: '',
        repositoryRoot: '',
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
      };
    }
    return base;
  }

  /** Build a full state DTO including the Review Pack preview. */
  async #buildStateDtoWithPreview(): Promise<ReviewPanelStateDto> {
    const base = this.#buildBaseState();
    if (!base) {
      return {
        hasSession: false,
        repositoryDisplayName: '',
        repositoryRoot: '',
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
      };
    }

    // Attempt to build a preview pack — silently fail if not possible
    const lastScan = this.#securityReviewService.lastScan;
    let reviewPackPreview = '';
    let reviewPackByteLength = 0;
    let reviewPackCharLength = 0;
    let reviewPackTruncated = false;
    let truncationMessages: string[] = [];

    if (lastScan && base.selectedCount > 0 && lastScan.canExport) {
      try {
        const pack = await this.#securityReviewService.buildReviewPack();
        reviewPackPreview = pack.markdown.slice(0, 8000);
        reviewPackByteLength = pack.byteLength;
        reviewPackCharLength = pack.markdown.length;
        reviewPackTruncated = pack.manifest.truncations.length > 0;
        truncationMessages = [...pack.manifest.truncations];
      } catch {
        // Preview building is best-effort
      }
    }

    const charCount = reviewPackPreview.length;
    const estimatedTokens = Math.ceil((charCount || reviewPackCharLength) / 4);

    return {
      ...base,
      reviewPackPreview,
      reviewPackByteLength,
      reviewPackCharLength,
      reviewPackTruncated,
      truncationMessages,
      estimatedTokens,
    };
  }

  #getWorkspaceWarning(): string | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ws = require('../services/workspaceService') as typeof import('../services/workspaceService');
      return ws.getWorkspaceWarning() ?? undefined;
    } catch {
      return undefined;
    }
  }
}
