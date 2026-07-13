import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TextDecoder } from 'node:util';
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

export type ReviewFileSource = 'changed' | 'manual' | 'recommended' | 'context';

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

export interface EligibleRepositoryFile {
  readonly path: string;
  readonly size: number;
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
  | 'INVALID_REPOSITORY_PATH'
  | 'FILE_TOO_LARGE'
  | 'BINARY_FILE';

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

const MAX_CONTEXT_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_PROBE_BYTES = 8192;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const BUILT_IN_EXCLUDED_ROOTS = new Set([
  '.git',
  '.reviewlume',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '_appdata',
  '_db',
]);
const BINARY_OR_DATABASE_EXTENSIONS = new Set([
  '.7z', '.a', '.avi', '.bin', '.bmp', '.class', '.db', '.dll', '.dylib', '.exe',
  '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.keystore', '.lockb', '.mov',
  '.mp3', '.mp4', '.o', '.obj', '.pdf', '.pfx', '.p12', '.png', '.pyc', '.so',
  '.sqlite', '.sqlite3', '.tar', '.ttf', '.wasm', '.webp', '.woff', '.woff2', '.zip',
]);

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
      if (rule.regex.test(normalized)) ignored = !rule.negated;
    }

    return ignored;
  }
}

/**
 * Owns the active file-selection session. All paths are repository-relative,
 * ignore rules are enforced, and real paths are checked before a file enters
 * the review. P7.5 context files use a reversible overlay so changing review
 * scope never silently changes the user's explicit selections.
 */
export class FileSelectionService {
  readonly #runner: GitRunnerLike;
  readonly #entries = new Map<string, MutableReviewFileSelectionEntry>();
  readonly #contextSelectionOriginals = new Map<string, boolean>();
  #repository: GitRepository | undefined;
  #repositoryRealPath: string | undefined;
  #ignoreMatcher = new ReviewLumeIgnoreMatcher([]);

  constructor(runner: GitRunnerLike) {
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
    this.#contextSelectionOriginals.clear();
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
      if (isBuiltInExcluded(relativePath) || ignoreMatcher.isIgnored(relativePath)) continue;

      const existing = nextEntries.get(relativePath);
      if (existing) {
        if (!existing.changeKinds.includes(change.status)) existing.changeKinds.push(change.status);
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
    this.#contextSelectionOriginals.clear();
    for (const [key, value] of nextEntries) this.#entries.set(key, value);
    this.#repository = repository;
    this.#repositoryRealPath = repositoryRealPath;
    this.#ignoreMatcher = ignoreMatcher;
  }

  setSelected(relativePath: string, selected: boolean): void {
    const normalized = normalizeRepositoryPath(relativePath);
    const entry = this.#entries.get(normalized);
    if (!entry) {
      throw new FileSelectionError(
        'INVALID_REPOSITORY_PATH',
        'The selected file is not in the active review.',
      );
    }
    // A direct user toggle takes ownership from the automatic scope overlay.
    this.#contextSelectionOriginals.delete(normalized);
    entry.selected = selected;
  }

  setSelectedUnder(prefix: string, selected: boolean): void {
    const normalizedPrefix = normalizeRepositoryPath(prefix).replace(/\/$/, '');
    const prefixWithSlash = `${normalizedPrefix}/`;
    for (const entry of this.#entries.values()) {
      if (entry.path === normalizedPrefix || entry.path.startsWith(prefixWithSlash)) {
        this.#contextSelectionOriginals.delete(entry.path);
        entry.selected = selected;
      }
    }
  }

  /** Replace the automatic context overlay atomically after validating every path. */
  async replaceContextFiles(
    relativePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    const { repository, repositoryRealPath } = this.#requireSession();
    const prepared: string[] = [];
    const seen = new Set<string>();

    for (const candidate of relativePaths) {
      this.#throwIfCancelled(signal);
      const relativePath = normalizeRepositoryPath(candidate);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      this.#assertNotGitMetadata(relativePath);
      if (isBuiltInExcluded(relativePath) || this.#ignoreMatcher.isIgnored(relativePath)) continue;
      await this.#validateExistingRelativePath(repository, repositoryRealPath, relativePath);
      prepared.push(relativePath);
    }

    this.clearContextFiles();
    for (const relativePath of prepared) {
      const existing = this.#entries.get(relativePath);
      if (existing) {
        if (!existing.selected) {
          this.#contextSelectionOriginals.set(relativePath, false);
          existing.selected = true;
        }
      } else {
        this.#entries.set(relativePath, {
          path: relativePath,
          source: 'context',
          changeKinds: [],
          exists: true,
          selected: true,
        });
      }
    }
    return prepared;
  }

  clearContextFiles(): void {
    for (const [relativePath, originalSelected] of this.#contextSelectionOriginals) {
      const entry = this.#entries.get(relativePath);
      if (entry && entry.source !== 'context') entry.selected = originalSelected;
    }
    this.#contextSelectionOriginals.clear();
    for (const [relativePath, entry] of this.#entries) {
      if (entry.source === 'context') this.#entries.delete(relativePath);
    }
  }

  /** Enumerate safe text files already admitted by Git and ReviewLume ignore rules. */
  async listEligibleRepositoryFiles(signal?: AbortSignal): Promise<readonly EligibleRepositoryFile[]> {
    const { repository, repositoryRealPath } = this.#requireSession();
    const result = await this.#runner.run({
      cwd: repository.root,
      args: ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--'],
      signal,
    });
    const files: EligibleRepositoryFile[] = [];
    const seen = new Set<string>();

    for (const rawPath of result.stdout.split('\0')) {
      this.#throwIfCancelled(signal);
      if (!rawPath) continue;
      const relativePath = normalizeRepositoryPath(rawPath);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      if (isBuiltInExcluded(relativePath) || this.#ignoreMatcher.isIgnored(relativePath)) continue;
      if (BINARY_OR_DATABASE_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())) continue;

      try {
        const absolutePath = this.#resolveInsideRepository(repository, relativePath);
        await this.#assertRealFileInside(repositoryRealPath, absolutePath);
        const stat = await fs.stat(absolutePath);
        if (stat.size > MAX_CONTEXT_FILE_BYTES) continue;
        const handle = await fs.open(absolutePath, 'r');
        try {
          const probe = Buffer.alloc(Math.min(TEXT_PROBE_BYTES, stat.size));
          if (probe.length > 0) await handle.read(probe, 0, probe.length, 0);
          if (!isUtf8Text(probe)) continue;
        } finally {
          await handle.close();
        }
        files.push({ path: relativePath, size: stat.size });
      } catch (error) {
        if (isNodeError(error, 'ENOENT')) continue;
        if (error instanceof FileSelectionError && error.code === 'SYMLINK_ESCAPE') throw error;
        throw error;
      }
    }

    return files.sort((left, right) => left.path.localeCompare(right.path));
  }

  async readRepositoryText(
    relativePathInput: string,
    maxBytes = MAX_CONTEXT_FILE_BYTES,
    signal?: AbortSignal,
  ): Promise<string> {
    this.#throwIfCancelled(signal);
    const { repository, repositoryRealPath } = this.#requireSession();
    const relativePath = normalizeRepositoryPath(relativePathInput);
    this.#assertNotGitMetadata(relativePath);
    if (isBuiltInExcluded(relativePath) || this.#ignoreMatcher.isIgnored(relativePath)) {
      throw new FileSelectionError('INVALID_REPOSITORY_PATH', 'The requested file is excluded.');
    }
    const absolutePath = this.#resolveInsideRepository(repository, relativePath);
    await this.#assertRealFileInside(repositoryRealPath, absolutePath);
    const stat = await fs.stat(absolutePath);
    if (stat.size > maxBytes) {
      throw new FileSelectionError('FILE_TOO_LARGE', 'The requested file exceeds the context limit.');
    }
    const bytes = await fs.readFile(absolutePath);
    if (!isUtf8Text(bytes)) {
      throw new FileSelectionError('BINARY_FILE', 'Binary files cannot be used as review context.');
    }
    return UTF8_DECODER.decode(bytes);
  }

  async addManualFiles(
    absolutePaths: readonly string[],
    signal?: AbortSignal,
  ): Promise<FileAdditionResult> {
    const { repository, repositoryRealPath } = this.#requireSession();
    const prepared = new Set<string>();
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
      if (isBuiltInExcluded(relativePath) || this.#ignoreMatcher.isIgnored(relativePath)) {
        skipped.push({ path: relativePath, reason: 'reviewlumeignore' });
        continue;
      }
      if (await this.#isIgnoredByGit(repository, relativePath, signal)) {
        skipped.push({ path: relativePath, reason: 'gitignore' });
        continue;
      }
      const existing = this.#entries.get(relativePath);
      if (existing?.selected || prepared.has(relativePath)) {
        skipped.push({ path: relativePath, reason: 'already-selected' });
        continue;
      }
      prepared.add(relativePath);
    }

    for (const relativePath of prepared) {
      const existing = this.#entries.get(relativePath);
      this.#contextSelectionOriginals.delete(relativePath);
      if (existing) {
        existing.selected = true;
        if (existing.source === 'context') existing.source = 'manual';
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

    return { added: Array.from(prepared), skipped };
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
      if (isBuiltInExcluded(relativePath) || this.#ignoreMatcher.isIgnored(relativePath)) continue;
      const score = Math.max(
        ...targets.map((target) => testRelationshipScore(target.path, relativePath)),
      );
      if (score < 80) continue;
      await this.#validateExistingRelativePath(repository, repositoryRealPath, relativePath);
      recommendations.push({ path: relativePath, score });
    }

    recommendations.sort(
      (left, right) => right.score - left.score || left.path.localeCompare(right.path),
    );
    const added = recommendations.slice(0, 20).map((item) => item.path);
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
      if (isNodeError(error, 'ENOENT')) return new ReviewLumeIgnoreMatcher([]);
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
      if (isNodeError(error, 'ENOENT') && status === 'deleted') return false;
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
  const hasWindowsAbsoluteSyntax =
    path.sep === '\\' && (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'));
  if (value.includes('\0') || path.isAbsolute(value) || hasWindowsAbsoluteSyntax) {
    throw new FileSelectionError(
      'INVALID_REPOSITORY_PATH',
      'Only repository-relative paths are allowed.',
    );
  }
  const normalized = path.posix.normalize(toPosixPath(value)).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new FileSelectionError(
      'INVALID_REPOSITORY_PATH',
      'The repository-relative path is invalid.',
    );
  }
  return normalized;
}

function toPosixPath(value: string): string {
  return path.sep === '\\' ? value.replace(/\\/g, '/') : value;
}

function isOutsidePath(relativePath: string): boolean {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function isBuiltInExcluded(relativePath: string): boolean {
  const root = relativePath.split('/')[0]?.toLowerCase();
  return root ? BUILT_IN_EXCLUDED_ROOTS.has(root) : true;
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    UTF8_DECODER.decode(bytes);
    return true;
  } catch {
    return false;
  }
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

export function isTestPath(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath);
  const fileName = path.posix.basename(normalized);
  return (
    /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i.test(normalized) ||
    /(?:\.test|\.spec)\.[^.]+$/i.test(fileName) ||
    /(?:^test_|_test\.)/i.test(fileName) ||
    /Test\.(?:java|kt|cs)$/i.test(fileName)
  );
}

export function testRelationshipScore(sourcePath: string, testPath: string): number {
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
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^index$/i, path.posix.basename(path.posix.dirname(relativePath)));
}

function testFileStem(relativePath: string): string {
  const fileName = path.posix.basename(relativePath).replace(/\.[^.]+$/, '');
  return fileName
    .replace(/(?:\.test|\.spec)$/i, '')
    .replace(/^test_/i, '')
    .replace(/_test$/i, '')
    .replace(/Test$/i, '');
}
