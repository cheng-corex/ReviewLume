import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  GitChangeEntry,
  GitRepository,
  GitStatusSnapshot,
} from '../../../../packages/git-context/dist/index.js';

interface GitRunnerLike {
  run(options: {
    readonly cwd: string;
    readonly args: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<{ readonly stdout: string }>;
}

export type ReviewFileSource = 'changed' | 'manual' | 'recommended';

export interface ReviewFileSelectionEntry {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly changeKinds: readonly GitChangeEntry['status'][];
  readonly exists: boolean;
  readonly selected: boolean;
}

interface MutableReviewFileSelectionEntry {
  path: string;
  source: ReviewFileSource;
  changeKinds: GitChangeEntry['status'][];
  exists: boolean;
  selected: boolean;
}

export interface FileAdditionResult {
  readonly added: readonly string[];
  readonly skipped: readonly {
    path: string;
    reason: 'already-selected' | 'gitignore' | 'reviewlumeignore';
  }[];
}

export type FileSelectionErrorCode =
  | 'NO_FILE_SELECTION'
  | 'CROSS_REPOSITORY'
  | 'SYMLINK_ESCAPE'
  | 'NOT_A_FILE'
  | 'GIT_METADATA'
  | 'INVALID_REPOSITORY_PATH';

export class FileSelectionError extends Error {
  constructor(
    readonly code: FileSelectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FileSelectionError';
  }
}

interface IgnoreRule {
  readonly negated: boolean;
  readonly regex: RegExp;
}

/** Minimal gitignore-style matcher for the repository-root `.reviewlumeignore`. */
export class ReviewLumeIgnoreMatcher {
  readonly #rules: IgnoreRule[];

  constructor(lines: readonly string[]) {
    this.#rules = lines.flatMap((line) => compileIgnoreRule(line));
  }

  isIgnored(relativePath: string): boolean {
    const normalized = toPosixPath(relativePath);
    let ignored = false;

    for (const rule of this.#rules) {
      if (rule.regex.test(normalized)) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  }
}

function createDefaultRunner(): GitRunnerLike {
  type GitContextRuntime = typeof import('../../../../packages/git-context/dist/index.js');
  // The extension build vendors the Git runtime beside this module as CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const runtime = require('../vendor/git-context/index.js') as GitContextRuntime;
  return new runtime.GitCommandRunner();
}

/**
 * Owns the active P3 file-selection session. All paths are repository-relative,
 * `.gitignore` and `.reviewlumeignore` are enforced, and real paths are checked
 * before an existing file can enter the selection.
 */
export class FileSelectionService {
  readonly #runner: GitRunnerLike;
  readonly #entries = new Map<string, MutableReviewFileSelectionEntry>();
  #repository: GitRepository | undefined;
  #repositoryRealPath: string | undefined;
  #ignoreMatcher = new ReviewLumeIgnoreMatcher([]);

  constructor(runner: GitRunnerLike = createDefaultRunner()) {
    this.#runner = runner;
  }

  get hasSession(): boolean {
    return this.#repository !== undefined;
  }

  get repository(): GitRepository | undefined {
    return this.#repository;
  }

  get entries(): readonly ReviewFileSelectionEntry[] {
    return Array.from(this.#entries.values())
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((entry) => ({
        path: entry.path,
        source: entry.source,
        changeKinds: [...entry.changeKinds],
        exists: entry.exists,
        selected: entry.selected,
      }));
  }

  get selectedCount(): number {
    let count = 0;
    for (const entry of this.#entries.values()) {
      if (entry.selected) count += 1;
    }
    return count;
  }

  clear(): void {
    this.#entries.clear();
    this.#repository = undefined;
    this.#repositoryRealPath = undefined;
    this.#ignoreMatcher = new ReviewLumeIgnoreMatcher([]);
  }

  async initialize(
    repository: GitRepository,
    status: GitStatusSnapshot,
    signal?: AbortSignal,
  ): Promise<void> {
    const repositoryRealPath = await fs.realpath(repository.root);
    const ignoreMatcher = await this.#loadReviewLumeIgnore(repository, repositoryRealPath);
    const nextEntries = new Map<string, MutableReviewFileSelectionEntry>();

    for (const change of [...status.staged, ...status.unstaged, ...status.untracked]) {
      this.#throwIfCancelled(signal);
      const relativePath = normalizeRepositoryPath(change.path);
      this.#assertNotGitMetadata(relativePath);

      if (ignoreMatcher.isIgnored(relativePath)) {
        continue;
      }

      const existing = nextEntries.get(relativePath);
      if (existing) {
        if (!existing.changeKinds.includes(change.status)) {
          existing.changeKinds.push(change.status);
        }
        continue;
      }

      const exists = await this.#validateChangedPath(
        repository,
        repositoryRealPath,
        relativePath,
        change.status,
      );

      nextEntries.set(relativePath, {
        path: relativePath,
        source: 'changed',
        changeKinds: [change.status],
        exists,
        selected: true,
      });
    }

    this.#entries.clear();
    for (const [key, value] of nextEntries) {
      this.#entries.set(key, value);
    }
    this.#repository = repository;
    this.#repositoryRealPath = repositoryRealPath;
    this.#ignoreMatcher = ignoreMatcher;
  }

  setSelected(relativePath: string, selected: boolean): void {
    const normalized = normalizeRepositoryPath(relativePath);
    const entry = this.#entries.get(normalized);
    if (!entry) {
      throw new FileSelectionError('INVALID_REPOSITORY_PATH', 'The selected file is not in the active review.');
    }
    entry.selected = selected;
  }

  setSelectedUnder(prefix: string, selected: boolean): void {
    const normalizedPrefix = normalizeRepositoryPath(prefix).replace(/\/$/, '');
    const prefixWithSlash = `${normalizedPrefix}/`;
    for (const entry of this.#entries.values()) {
      if (entry.path === normalizedPrefix || entry.path.startsWith(prefixWithSlash)) {
        entry.selected = selected;
      }
    }
  }

  async addManualFiles(
    absolutePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<FileAdditionResult> {
    const { repository, repositoryRealPath } = this.#requireSession();
    const prepared: string[] = [];
    const skipped: Array<{
      path: string;
      reason: 'already-selected' | 'gitignore' | 'reviewlumeignore';
    }> = [];

    for (const absolutePath of absolutePaths) {
      this.#throwIfCancelled(signal);
      const relativePath = await this.#validateExistingAbsolutePath(
        repository,
        repositoryRealPath,
        absolutePath,
      );

      if (this.#ignoreMatcher.isIgnored(relativePath)) {
        skipped.push({ path: relativePath, reason: 'reviewlumeignore' });
        continue;
      }

      if (await this.#isIgnoredByGit(repository, relativePath, signal)) {
        skipped.push({ path: relativePath, reason: 'gitignore' });
        continue;
      }

      const existing = this.#entries.get(relativePath);
      if (existing?.selected) {
        skipped.push({ path: relativePath, reason: 'already-selected' });
        continue;
      }

      prepared.push(relativePath);
    }

    for (const relativePath of prepared) {
      const existing = this.#entries.get(relativePath);
      if (existing) {
        existing.selected = true;
      } else {
        this.#entries.set(relativePath, {
          path: relativePath,
          source: 'manual',
          changeKinds: [],
          exists: true,
          selected: true,
        });
      }
    }

    return { added: prepared, skipped };
  }

  async recommendTests(signal?: AbortSignal): Promise<readonly string[]> {
    const { repository, repositoryRealPath } = this.#requireSession();
    const targets = Array.from(this.#entries.values()).filter(
      (entry) => entry.selected && !isTestPath(entry.path),
    );
    if (targets.length === 0) return [];

    const result = await this.#runner.run({
      cwd: repository.root,
      args: ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--'],
      signal,
    });

    const recommendations: Array<{ path: string; score: number }> = [];
    for (const rawPath of result.stdout.split('\0')) {
      this.#throwIfCancelled(signal);
      if (!rawPath) continue;

      const relativePath = normalizeRepositoryPath(rawPath);
      if (!isTestPath(relativePath) || this.#entries.has(relativePath)) continue;
      if (this.#ignoreMatcher.isIgnored(relativePath)) continue;

      const score = Math.max(...targets.map((target) => testRelationshipScore(target.path, relativePath)));
      if (score < 80) continue;

      await this.#validateExistingRelativePath(repository, repositoryRealPath, relativePath);
      recommendations.push({ path: relativePath, score });
    }

    recommendations.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    const added = recommendations.slice(0, 20).map((recommendation) => recommendation.path);

    for (const relativePath of added) {
      this.#entries.set(relativePath, {
        path: relativePath,
        source: 'recommended',
        changeKinds: [],
        exists: true,
        selected: false,
      });
    }

    return added;
  }

  absolutePathFor(relativePath: string): string | undefined {
    if (!this.#repository) return undefined;
    const normalized = normalizeRepositoryPath(relativePath);
    const entry = this.#entries.get(normalized);
    if (!entry?.exists) return undefined;
    return path.resolve(this.#repository.root, ...normalized.split('/'));
  }

  async #loadReviewLumeIgnore(
    repository: GitRepository,
    repositoryRealPath: string,
  ): Promise<ReviewLumeIgnoreMatcher> {
    const ignorePath = path.join(repository.root, '.reviewlumeignore');
    try {
      await this.#assertRealFileInside(repositoryRealPath, ignorePath);
      const content = await fs.readFile(ignorePath, 'utf8');
      return new ReviewLumeIgnoreMatcher(content.split(/\r?\n/));
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        return new ReviewLumeIgnoreMatcher([]);
      }
      throw error;
    }
  }

  async #validateChangedPath(
    repository: GitRepository,
    repositoryRealPath: string,
    relativePath: string,
    status: GitChangeEntry['status'],
  ): Promise<boolean> {
    const absolutePath = this.#resolveInsideRepository(repository, relativePath);
    try {
      await this.#assertRealFileInside(repositoryRealPath, absolutePath);
      return true;
    } catch (error) {
      if (isNodeError(error, 'ENOENT') && status === 'deleted') {
        return false;
      }
      throw error;
    }
  }

  async #validateExistingAbsolutePath(
    repository: GitRepository,
    repositoryRealPath: string,
    absolutePath: string,
  ): Promise<string> {
    const resolved = path.resolve(absolutePath);
    const relative = path.relative(repository.root, resolved);
    if (isOutsidePath(relative)) {
      throw new FileSelectionError(
        'CROSS_REPOSITORY',
        'A related file must belong to the repository selected for this review.',
      );
    }

    const relativePath = normalizeRepositoryPath(relative);
    this.#assertNotGitMetadata(relativePath);
    await this.#assertRealFileInside(repositoryRealPath, resolved);
    return relativePath;
  }

  async #validateExistingRelativePath(
    repository: GitRepository,
    repositoryRealPath: string,
    relativePath: string,
  ): Promise<void> {
    this.#assertNotGitMetadata(relativePath);
    const absolutePath = this.#resolveInsideRepository(repository, relativePath);
    await this.#assertRealFileInside(repositoryRealPath, absolutePath);
  }

  async #assertRealFileInside(repositoryRealPath: string, absolutePath: string): Promise<void> {
    const realPath = await fs.realpath(absolutePath);
    const realRelative = path.relative(repositoryRealPath, realPath);
    if (isOutsidePath(realRelative)) {
      throw new FileSelectionError(
        'SYMLINK_ESCAPE',
        'A symbolic link resolves outside the repository selected for this review.',
      );
    }

    const targetStat = await fs.stat(realPath);
    if (!targetStat.isFile()) {
      throw new FileSelectionError('NOT_A_FILE', 'Only regular files can be added to a review.');
    }
  }

  #resolveInsideRepository(repository: GitRepository, relativePath: string): string {
    const absolutePath = path.resolve(repository.root, ...relativePath.split('/'));
    const relative = path.relative(repository.root, absolutePath);
    if (isOutsidePath(relative)) {
      throw new FileSelectionError(
        'CROSS_REPOSITORY',
        'The requested path resolves outside the repository selected for this review.',
      );
    }
    return absolutePath;
  }

  async #isIgnoredByGit(
    repository: GitRepository,
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.#runner.run({
        cwd: repository.root,
        args: ['check-ignore', '-q', '--', relativePath],
        signal,
      });
      return true;
    } catch (error) {
      if (isGitCommandExit(error, 1)) return false;
      throw error;
    }
  }

  #assertNotGitMetadata(relativePath: string): void {
    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      throw new FileSelectionError('GIT_METADATA', 'Git metadata cannot be added to a review.');
    }
  }

  #requireSession(): { repository: GitRepository; repositoryRealPath: string } {
    if (!this.#repository || !this.#repositoryRealPath) {
      throw new FileSelectionError(
        'NO_FILE_SELECTION',
        'Create a Review Pack before selecting related files.',
      );
    }
    return { repository: this.#repository, repositoryRealPath: this.#repositoryRealPath };
  }

  #throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const error = new Error('File selection was cancelled.');
      Object.assign(error, { code: 'GIT_CANCELLED' });
      throw error;
    }
  }
}

function compileIgnoreRule(rawLine: string): IgnoreRule[] {
  const line = rawLine.replace(/\r$/, '');
  if (line === '' || /^\s*#/.test(line)) return [];

  let pattern = line;
  let negated = false;
  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1);
  }
  if (!pattern) return [];

  const directoryOnly = pattern.endsWith('/');
  const anchored = pattern.startsWith('/');
  pattern = pattern.replace(/^\//, '').replace(/\/$/, '');
  if (!pattern) return [];

  const hasSlash = pattern.includes('/');
  const body = globToRegex(pattern);
  const prefix = anchored || hasSlash ? '^' : '(?:^|/)';
  const suffix = directoryOnly || !hasSlash ? '(?:$|/.*)' : '$';
  return [{ negated, regex: new RegExp(`${prefix}${body}${suffix}`) }];
}

function globToRegex(pattern: string): string {
  let result = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        const followedBySlash = pattern[index + 2] === '/';
        result += followedBySlash ? '(?:.*/)?' : '.*';
        index += followedBySlash ? 2 : 1;
      } else {
        result += '[^/]*';
      }
    } else if (character === '?') {
      result += '[^/]';
    } else {
      result += character.replace(/[|\\{}()[\]^$+?.-]/g, '\\$&');
    }
  }
  return result;
}

function normalizeRepositoryPath(value: string): string {
  if (
    value.includes('\0') ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('\\\\')
  ) {
    throw new FileSelectionError('INVALID_REPOSITORY_PATH', 'Only repository-relative paths are allowed.');
  }

  const normalized = path.posix.normalize(toPosixPath(value)).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new FileSelectionError('INVALID_REPOSITORY_PATH', 'The repository-relative path is invalid.');
  }
  return normalized;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function isOutsidePath(relativePath: string): boolean {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === code
  );
}

function isGitCommandExit(error: unknown, exitCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'GIT_COMMAND_ERROR' &&
    'exitCode' in error &&
    (error as { exitCode: unknown }).exitCode === exitCode
  );
}

function isTestPath(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath);
  const fileName = path.posix.basename(normalized);
  return (
    /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i.test(normalized) ||
    /(?:\.test|\.spec)\.[^.]+$/i.test(fileName) ||
    /(?:^test_|_test\.)/i.test(fileName) ||
    /Test\.(?:java|kt|cs)$/i.test(fileName)
  );
}

function testRelationshipScore(sourcePath: string, testPath: string): number {
  const sourceStem = sourceFileStem(sourcePath);
  const testStem = testFileStem(testPath);
  let score = 0;

  if (sourceStem === testStem) score += 100;
  else if (testStem.includes(sourceStem) || sourceStem.includes(testStem)) score += 45;

  const sourceDirectory = path.posix.dirname(sourcePath);
  const testDirectory = path.posix.dirname(testPath);
  if (sourceDirectory === testDirectory) score += 30;
  if (testDirectory === `${sourceDirectory}/__tests__`) score += 35;

  const sourceTopLevel = sourcePath.split('/')[0];
  const testTopLevel = testPath.split('/')[0];
  if (sourceTopLevel && sourceTopLevel === testTopLevel) score += 10;

  return score;
}

function sourceFileStem(relativePath: string): string {
  const fileName = path.posix.basename(relativePath);
  return fileName.replace(/\.[^.]+$/, '').replace(/^index$/i, path.posix.basename(path.posix.dirname(relativePath)));
}

function testFileStem(relativePath: string): string {
  const fileName = path.posix.basename(relativePath).replace(/\.[^.]+$/, '');
  return fileName
    .replace(/(?:\.test|\.spec)$/i, '')
    .replace(/^test_/i, '')
    .replace(/_test$/i, '')
    .replace(/Test$/i, '');
}
