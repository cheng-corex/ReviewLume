import * as fs from 'node:fs/promises';
import type { FileSelectionService, ReviewFileSelectionEntry } from './fileSelectionService';
import type { LazyFileSelectionGitRunner } from './lazyFileSelectionGitRunner';
import type {
  ScanFinding,
  ScanInputFile,
  ScanResolutionInput,
  ScanResult,
  SecretScanner,
} from '../../../../packages/secret-scanner/dist/index.js';
import type {
  ReviewPackBuildResult,
  ReviewPackBuilder,
} from '../../../../packages/review-pack/dist/index.js';

const MAX_SELECTED_FILE_BYTES = 2 * 1024 * 1024;

interface SecretScannerRuntime {
  readonly SecretScanner: new () => SecretScanner;
}

interface ReviewPackRuntime {
  readonly ReviewPackBuilder: new () => ReviewPackBuilder;
}

export class SecurityReviewService {
  #scanner: SecretScanner | undefined;
  #builder: ReviewPackBuilder | undefined;
  #lastScan: ScanResult | undefined;

  constructor(
    private readonly fileSelectionService: FileSelectionService,
    private readonly gitRunner: LazyFileSelectionGitRunner,
  ) {}

  get lastScan(): ScanResult | undefined {
    return this.#lastScan;
  }

  invalidate(): void {
    this.#lastScan = undefined;
  }

  async scan(signal?: AbortSignal): Promise<ScanResult> {
    const files = await this.#readSelectedFiles(signal);
    const result = this.#getScanner().scan(files);
    this.#lastScan = result;
    return result;
  }

  confirmWarnings(findings: readonly ScanFinding[], at = new Date().toISOString()): ScanResult {
    if (!this.#lastScan) throw new Error('No sensitive-content scan is available.');
    const resolutions: ScanResolutionInput[] = findings.map((item) => ({
      findingId: item.id,
      action: 'confirm',
      at,
    }));
    const resolved = this.#getScanner().resolve(this.#lastScan, resolutions);
    this.#lastScan = resolved;
    return resolved;
  }

  async buildReviewPack(signal?: AbortSignal): Promise<ReviewPackBuildResult> {
    const repository = this.fileSelectionService.repository;
    if (!repository) throw new Error('No active review repository.');
    if (!this.#lastScan) throw new Error('Run the sensitive-content scan before exporting.');

    const files = await this.#readSelectedFiles(signal);
    const current = this.#getScanner().scan(files);
    this.#getScanner().assertExportAllowed(this.#lastScan, current.contentFingerprint);

    const selectedPaths = this.fileSelectionService.entries
      .filter((entry) => entry.selected)
      .map((entry) => entry.path);
    const diff = selectedPaths.length > 0
      ? await this.gitRunner.run({
          cwd: repository.root,
          args: ['diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', '--', ...selectedPaths],
          signal,
        })
      : { stdout: '' };

    return this.#getBuilder().build({
      repositoryIdentity: repository.remoteUrl ?? repository.root,
      repositoryDisplayName: repository.displayName,
      reviewMode: 'standard',
      gitBase: 'HEAD',
      gitTarget: 'WORKTREE',
      security: this.#lastScan,
      instructions: 'Review the selected changes for correctness, security, regressions, lifecycle issues, and missing tests. Report findings by severity with repository-relative file paths and actionable fixes.',
      diff: diff.stdout,
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
        source: this.fileSelectionService.entries.find((entry) => entry.path === file.path)?.source,
      })),
      excluded: this.fileSelectionService.entries
        .filter((entry) => !entry.selected)
        .map((entry) => ({ path: entry.path, reason: 'not selected for this review' })),
    });
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
    if (!this.#scanner) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const runtime = require('../vendor/secret-scanner/index.js') as SecretScannerRuntime;
      this.#scanner = new runtime.SecretScanner();
    }
    return this.#scanner;
  }

  #getBuilder(): ReviewPackBuilder {
    if (!this.#builder) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const runtime = require('../vendor/review-pack/index.js') as ReviewPackRuntime;
      this.#builder = new runtime.ReviewPackBuilder();
    }
    return this.#builder;
  }
}
