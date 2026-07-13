import * as fs from 'node:fs/promises';
import type { FileSelectionService, ReviewFileSelectionEntry } from './fileSelectionService';
import type { LazyFileSelectionGitRunner } from './lazyFileSelectionGitRunner';
import type { ReviewScopeMode, ReviewScopeService } from './reviewScopeService';
import type { GitRepository } from '../../../../packages/git-context/dist/index.js';
import type { ScanFinding, ScanInputFile, ScanResolutionInput, ScanResult, SecretScanner } from '../../../../packages/secret-scanner/dist/index.js';
import type { ReviewPackBuildResult, ReviewPackBuilder } from '../../../../packages/review-pack/dist/index.js';

const MAX_SELECTED_FILE_BYTES = 2 * 1024 * 1024;
const DIFF_SCAN_PATH = '@reviewlume/git-diff.patch';
const INSTRUCTIONS_SCAN_PATH = '@reviewlume/review-instructions.txt';

interface SecretScannerRuntime { readonly SecretScanner: new () => SecretScanner }
interface ReviewPackRuntime { readonly ReviewPackBuilder: new () => ReviewPackBuilder }
interface CollectedReviewContent {
  readonly repository: GitRepository;
  readonly files: readonly ScanInputFile[];
  readonly diff: string;
  readonly instructions: string;
  readonly scanInputs: readonly ScanInputFile[];
}

export class SecurityReviewService {
  #lastScan: ScanResult | undefined;
  #lastBuiltPack: ReviewPackBuildResult | undefined;

  constructor(
    private readonly fileSelectionService: FileSelectionService,
    private readonly gitRunner: LazyFileSelectionGitRunner,
    private scanner?: SecretScanner,
    private builder?: ReviewPackBuilder,
    private readonly reviewScopeService?: Pick<ReviewScopeService, 'mode'>,
  ) {}

  get lastScan(): ScanResult | undefined { return this.#lastScan; }
  get activeRepository(): GitRepository | undefined { return this.fileSelectionService.repository; }
  get reviewScope(): ReviewScopeMode { return this.reviewScopeService?.mode ?? 'changes'; }

  invalidate(): void {
    this.#lastScan = undefined;
    this.#lastBuiltPack = undefined;
  }

  async scan(signal?: AbortSignal): Promise<ScanResult> {
    const collected = await this.#collectReviewContent(signal);
    const result = this.#getScanner().scan(collected.scanInputs);
    this.#lastScan = result;
    this.#lastBuiltPack = undefined;
    return result;
  }

  confirmWarnings(findings: readonly ScanFinding[], at = new Date().toISOString()): ScanResult {
    if (!this.#lastScan) throw new Error('No sensitive-content scan is available.');
    const resolutions: ScanResolutionInput[] = findings.map((item) => ({ findingId: item.id, action: 'confirm', at }));
    const resolved = this.#getScanner().resolve(this.#lastScan, resolutions);
    this.#lastScan = resolved;
    this.#lastBuiltPack = undefined;
    return resolved;
  }

  async buildReviewPack(signal?: AbortSignal): Promise<ReviewPackBuildResult> {
    if (!this.#lastScan) throw new Error('Run the sensitive-content scan before exporting.');
    const collected = await this.#collectReviewContent(signal);
    const current = this.#getScanner().scan(collected.scanInputs);
    this.#getScanner().assertExportAllowed(this.#lastScan, current.contentFingerprint);
    if (this.#lastBuiltPack) return this.#lastBuiltPack;

    const builtPack = await this.#getBuilder().build({
      repositoryIdentity: collected.repository.remoteUrl ?? collected.repository.root,
      repositoryDisplayName: collected.repository.displayName,
      reviewMode: 'standard',
      gitBase: 'HEAD',
      gitTarget: 'WORKTREE',
      security: this.#lastScan,
      instructions: collected.instructions,
      diff: collected.diff,
      files: collected.files.map((file) => ({
        path: file.path,
        content: file.content,
        source: this.fileSelectionService.entries.find((entry) => entry.path === file.path)?.source,
      })),
      excluded: this.fileSelectionService.entries
        .filter((entry) => !entry.selected)
        .map((entry) => ({ path: entry.path, reason: 'not selected for this review' })),
    });

    if (this.reviewScope === 'full' && builtPack.manifest.truncations.length > 0) {
      throw Object.assign(
        new Error('Full repository mode must not silently truncate review content.'),
        { code: 'FULL_REPOSITORY_TOO_LARGE' },
      );
    }
    this.#lastBuiltPack = builtPack;
    return builtPack;
  }

  async #collectReviewContent(signal?: AbortSignal): Promise<CollectedReviewContent> {
    const repository = this.fileSelectionService.repository;
    if (!repository) throw new Error('No active review repository.');
    const files = await this.#readSelectedFiles(signal);
    const changedPaths = this.fileSelectionService.entries
      .filter((entry) => entry.selected && entry.changeKinds.length > 0)
      .map((entry) => entry.path);
    const diff = changedPaths.length > 0
      ? (await this.gitRunner.run({
          cwd: repository.root,
          args: ['diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', '--', ...changedPaths],
          signal,
        })).stdout
      : '';
    const instructions = reviewInstructions(this.reviewScope);
    return {
      repository,
      files,
      diff,
      instructions,
      scanInputs: [
        ...files,
        { path: DIFF_SCAN_PATH, content: diff },
        { path: INSTRUCTIONS_SCAN_PATH, content: instructions },
      ],
    };
  }

  async #readSelectedFiles(signal?: AbortSignal): Promise<ScanInputFile[]> {
    if (!this.fileSelectionService.hasSession) throw new Error('No active file-selection session.');
    const selected = this.fileSelectionService.entries.filter((entry) => entry.selected);
    if (selected.length === 0) throw new Error('No files are selected for review.');
    const files: ScanInputFile[] = [];
    for (const entry of selected) {
      if (signal?.aborted) throw Object.assign(new Error('Operation cancelled.'), { code: 'CANCELLED' });
      files.push(await this.#readEntry(entry));
    }
    return files;
  }

  async #readEntry(entry: ReviewFileSelectionEntry): Promise<ScanInputFile> {
    const absolutePath = this.fileSelectionService.absolutePathFor(entry.path);
    if (!absolutePath || !entry.exists) return { path: entry.path, content: '' };
    const stat = await fs.stat(absolutePath);
    if (stat.size > MAX_SELECTED_FILE_BYTES) {
      throw Object.assign(new Error('A selected file exceeds the safe per-file scan limit.'), {
        code: 'FILE_TOO_LARGE',
      });
    }
    return { path: entry.path, content: await fs.readFile(absolutePath, 'utf8') };
  }

  #getScanner(): SecretScanner {
    if (!this.scanner) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const runtime = require('../vendor/secret-scanner/index.js') as SecretScannerRuntime;
      this.scanner = new runtime.SecretScanner();
    }
    return this.scanner;
  }

  #getBuilder(): ReviewPackBuilder {
    if (!this.builder) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const runtime = require('../vendor/review-pack/index.js') as ReviewPackRuntime;
      this.builder = new runtime.ReviewPackBuilder();
    }
    return this.builder;
  }
}

function reviewInstructions(scope: ReviewScopeMode): string {
  const common = 'Review for correctness, security, regressions, lifecycle issues, and missing tests. Report findings by severity with repository-relative file paths and actionable fixes.';
  if (scope === 'full') {
    return `Treat the Git diff as the primary review focus, but use the complete eligible repository snapshot to verify architecture, callers, contracts, configuration, and regressions. ${common}`;
  }
  if (scope === 'smart') {
    return `Treat the Git diff as the primary review focus and use the automatically selected one-hop context files to verify callers, local dependencies, types, configuration, and tests. ${common}`;
  }
  return `Review the selected changes and explicitly selected related files. ${common}`;
}
