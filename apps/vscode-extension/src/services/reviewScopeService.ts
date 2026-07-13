import * as path from 'node:path';
import {
  FileSelectionService,
  isTestPath,
  testRelationshipScore,
  type EligibleRepositoryFile,
} from './fileSelectionService';

export type ReviewScopeMode = 'changes' | 'smart' | 'full';

export interface ReviewScopeSummary {
  readonly mode: ReviewScopeMode;
  readonly eligibleFileCount: number;
  readonly contextFileCount: number;
  readonly estimatedSourceBytes: number;
}

export type ReviewScopeErrorCode =
  | 'NO_ACTIVE_REVIEW'
  | 'FULL_REPOSITORY_TOO_LARGE'
  | 'FULL_REPOSITORY_TOO_MANY_FILES';

export class ReviewScopeError extends Error {
  constructor(
    readonly code: ReviewScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewScopeError';
  }
}

const SMART_CONTEXT_MAX_FILES = 60;
const SMART_CONTEXT_MAX_BYTES = 768 * 1024;
const SMART_FILE_READ_LIMIT = 512 * 1024;
const SMART_REVERSE_SCAN_MAX_FILES = 1000;
const SMART_REVERSE_SCAN_MAX_BYTES = 4 * 1024 * 1024;
const FULL_REPOSITORY_MAX_FILES = 500;
const FULL_REPOSITORY_MAX_SOURCE_BYTES = 1536 * 1024;
const IMPORT_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.vue', '.svelte',
  '.css', '.scss', '.less', '.html',
] as const;
const INDEX_EXTENSIONS = [
  'index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs',
  'index.json', 'index.vue', 'index.svelte',
] as const;
const PROJECT_CONTEXT_FILES = new Set([
  'package.json', 'angular.json', 'nx.json', 'vite.config.ts', 'vite.config.js',
  'webpack.config.js', 'webpack.config.ts', 'tsconfig.json', 'jsconfig.json',
  'pnpm-workspace.yaml', 'workspace.json', 'project.json',
]);
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.java', '.kt',
  '.cs', '.py', '.go', '.rs', '.php', '.rb', '.css', '.scss', '.less', '.html',
]);

/**
 * Builds a reversible, repository-bound context overlay for the active review.
 * It never reads ignored files, follows FileSelectionService real-path checks,
 * and applies hard file/byte limits before full-repository mode is accepted.
 */
export class ReviewScopeService {
  #mode: ReviewScopeMode = 'smart';
  #summary: ReviewScopeSummary = {
    mode: 'smart',
    eligibleFileCount: 0,
    contextFileCount: 0,
    estimatedSourceBytes: 0,
  };

  constructor(private readonly fileSelectionService: FileSelectionService) {}

  get mode(): ReviewScopeMode {
    return this.#mode;
  }

  get summary(): ReviewScopeSummary {
    return this.#summary;
  }

  async initialize(signal?: AbortSignal): Promise<ReviewScopeSummary> {
    return this.apply('smart', signal);
  }

  async apply(mode: ReviewScopeMode, signal?: AbortSignal): Promise<ReviewScopeSummary> {
    if (!this.fileSelectionService.hasSession) {
      throw new ReviewScopeError('NO_ACTIVE_REVIEW', 'No active review session.');
    }

    if (mode === 'changes') {
      this.fileSelectionService.clearContextFiles();
      this.#mode = mode;
      this.#summary = {
        mode,
        eligibleFileCount: 0,
        contextFileCount: 0,
        estimatedSourceBytes: 0,
      };
      return this.#summary;
    }

    const eligible = await this.fileSelectionService.listEligibleRepositoryFiles(signal);
    if (mode === 'full') return this.#applyFullRepository(eligible, signal);
    return this.#applySmartContext(eligible, signal);
  }

  async #applyFullRepository(
    eligible: readonly EligibleRepositoryFile[],
    signal?: AbortSignal,
  ): Promise<ReviewScopeSummary> {
    if (eligible.length > FULL_REPOSITORY_MAX_FILES) {
      throw new ReviewScopeError(
        'FULL_REPOSITORY_TOO_MANY_FILES',
        'The eligible repository contains too many files for one review pack.',
      );
    }
    const totalBytes = eligible.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > FULL_REPOSITORY_MAX_SOURCE_BYTES) {
      throw new ReviewScopeError(
        'FULL_REPOSITORY_TOO_LARGE',
        'The eligible repository is too large for a non-truncated review pack.',
      );
    }

    const explicitPaths = new Set(
      this.fileSelectionService.entries
        .filter((entry) => entry.source !== 'context')
        .map((entry) => entry.path),
    );
    const paths = eligible.map((file) => file.path);
    await this.fileSelectionService.replaceContextFiles(paths, signal);
    this.#mode = 'full';
    this.#summary = {
      mode: 'full',
      eligibleFileCount: eligible.length,
      contextFileCount: paths.filter((filePath) => !explicitPaths.has(filePath)).length,
      estimatedSourceBytes: totalBytes,
    };
    return this.#summary;
  }

  async #applySmartContext(
    eligible: readonly EligibleRepositoryFile[],
    signal?: AbortSignal,
  ): Promise<ReviewScopeSummary> {
    const candidateByPath = new Map(eligible.map((file) => [file.path, file] as const));
    const seeds = this.fileSelectionService.entries
      .filter((entry) => entry.selected && entry.source !== 'context')
      .map((entry) => entry.path);
    if (seeds.length === 0) {
      await this.fileSelectionService.replaceContextFiles([], signal);
      this.#mode = 'smart';
      this.#summary = {
        mode: 'smart',
        eligibleFileCount: eligible.length,
        contextFileCount: 0,
        estimatedSourceBytes: 0,
      };
      return this.#summary;
    }

    const seedSet = new Set(seeds);
    const scores = new Map<string, number>();
    const score = (filePath: string, value: number): void => {
      if (seedSet.has(filePath) || !candidateByPath.has(filePath)) return;
      scores.set(filePath, Math.max(scores.get(filePath) ?? 0, value));
    };

    for (const candidate of eligible) {
      if (isProjectContextFile(candidate.path)) score(candidate.path, 45);
      if (isTypeCompanion(candidate.path, seeds)) score(candidate.path, 70);
      if (isTestPath(candidate.path)) {
        const relationship = Math.max(
          0,
          ...seeds.filter((seed) => !isTestPath(seed)).map((seed) =>
            testRelationshipScore(seed, candidate.path),
          ),
        );
        if (relationship >= 80) score(candidate.path, 90 + Math.min(relationship, 40));
      }
    }

    for (const seed of seeds) {
      const content = await this.#readForAnalysis(seed, signal);
      if (content === undefined) continue;
      for (const specifier of extractLocalSpecifiers(content)) {
        const resolved = resolveLocalSpecifier(seed, specifier, candidateByPath);
        if (resolved) score(resolved, 140);
      }
    }

    let reverseFiles = 0;
    let reverseBytes = 0;
    for (const candidate of eligible) {
      if (signal?.aborted) throw cancelledError();
      if (seedSet.has(candidate.path) || !isSourceLike(candidate.path)) continue;
      if (reverseFiles >= SMART_REVERSE_SCAN_MAX_FILES) break;
      if (reverseBytes + candidate.size > SMART_REVERSE_SCAN_MAX_BYTES) break;
      reverseFiles += 1;
      reverseBytes += candidate.size;
      const content = await this.#readForAnalysis(candidate.path, signal);
      if (content === undefined) continue;
      const dependsOnSeed = extractLocalSpecifiers(content).some((specifier) => {
        const resolved = resolveLocalSpecifier(candidate.path, specifier, candidateByPath);
        return resolved !== undefined && seedSet.has(resolved);
      });
      if (dependsOnSeed) score(candidate.path, 120);
    }

    const ranked = Array.from(scores, ([filePath, value]) => ({
      file: candidateByPath.get(filePath)!,
      score: value,
    })).sort(
      (left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path),
    );

    const selected: EligibleRepositoryFile[] = [];
    let selectedBytes = 0;
    for (const item of ranked) {
      if (selected.length >= SMART_CONTEXT_MAX_FILES) break;
      if (selectedBytes + item.file.size > SMART_CONTEXT_MAX_BYTES) continue;
      selected.push(item.file);
      selectedBytes += item.file.size;
    }

    await this.fileSelectionService.replaceContextFiles(
      selected.map((file) => file.path),
      signal,
    );
    this.#mode = 'smart';
    this.#summary = {
      mode: 'smart',
      eligibleFileCount: eligible.length,
      contextFileCount: selected.length,
      estimatedSourceBytes: selectedBytes,
    };
    return this.#summary;
  }

  async #readForAnalysis(filePath: string, signal?: AbortSignal): Promise<string | undefined> {
    try {
      return await this.fileSelectionService.readRepositoryText(
        filePath,
        SMART_FILE_READ_LIMIT,
        signal,
      );
    } catch (error) {
      if (getErrorCode(error) === 'GIT_CANCELLED') throw error;
      return undefined;
    }
  }
}

function extractLocalSpecifiers(content: string): readonly string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1];
      if (value?.startsWith('.')) specifiers.add(value);
    }
  }
  return Array.from(specifiers);
}

function resolveLocalSpecifier(
  importerPath: string,
  specifier: string,
  candidates: ReadonlyMap<string, EligibleRepositoryFile>,
): string | undefined {
  const importerDirectory = path.posix.dirname(importerPath);
  const base = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  if (!base || base === '..' || base.startsWith('../') || base.startsWith('/')) return undefined;
  for (const extension of IMPORT_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (candidates.has(candidate)) return candidate;
  }
  for (const fileName of INDEX_EXTENSIONS) {
    const candidate = `${base}/${fileName}`;
    if (candidates.has(candidate)) return candidate;
  }
  return undefined;
}

function isProjectContextFile(filePath: string): boolean {
  if (PROJECT_CONTEXT_FILES.has(filePath)) return true;
  const fileName = path.posix.basename(filePath);
  return /^tsconfig(?:\.[^.]+)?\.json$/i.test(fileName) && path.posix.dirname(filePath) === '.';
}

function isTypeCompanion(candidatePath: string, seeds: readonly string[]): boolean {
  const candidateName = path.posix.basename(candidatePath).toLowerCase();
  if (!/(?:\.d\.ts|\.types?\.|\.models?\.|\.interfaces?\.)/.test(candidateName)) return false;
  return seeds.some((seed) => {
    const seedStem = path.posix.basename(seed).replace(/\.[^.]+$/, '').toLowerCase();
    return candidateName.includes(seedStem) || path.posix.dirname(candidatePath) === path.posix.dirname(seed);
  });
}

function isSourceLike(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'UNKNOWN';
}

function cancelledError(): Error {
  return Object.assign(new Error('Review scope selection was cancelled.'), {
    code: 'GIT_CANCELLED',
  });
}
