import * as path from 'node:path';
import { realpath, readFile, stat } from 'node:fs/promises';

interface GitRunOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly signal?: AbortSignal;
}

export interface McpGitRunner {
  run(options: GitRunOptions): Promise<{ readonly stdout: string }>;
}

export interface McpContentGuard {
  hasSensitiveContent(relativePath: string, content: string): boolean;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: {
    readonly readOnlyHint: true;
    readonly destructiveHint: false;
    readonly idempotentHint: true;
    readonly openWorldHint: false;
  };
}

export interface McpToolCallResult {
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

interface RepositoryToolsOptions {
  readonly root: string;
  readonly displayName: string;
  readonly runner: McpGitRunner;
  readonly contentGuard: McpContentGuard;
  readonly maxResultBytes?: number;
}

interface CollectedDiff {
  readonly output: string;
  readonly truncated: boolean;
  readonly excludedSensitiveFiles: number;
  readonly includedFiles: number;
}

const DEFAULT_MAX_RESULT_BYTES = 512 * 1024;
const MAX_READ_BYTES = 256 * 1024;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_FILES = 5_000;
const MAX_DIFF_FILES = 200;
const DEFAULT_SEARCH_RESULTS = 40;
const MAX_SEARCH_RESULTS = 100;

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const SENSITIVE_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
]);

const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore']);

export class McpRepositoryTools {
  readonly #root: string;
  readonly #displayName: string;
  readonly #runner: McpGitRunner;
  readonly #contentGuard: McpContentGuard;
  readonly #maxResultBytes: number;
  #realRoot: string | undefined;

  constructor(options: RepositoryToolsOptions) {
    this.#root = path.resolve(options.root);
    this.#displayName = options.displayName;
    this.#runner = options.runner;
    this.#contentGuard = options.contentGuard;
    this.#maxResultBytes = clampInteger(
      options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES,
      64 * 1024,
      2 * 1024 * 1024,
    );
  }

  get definitions(): readonly McpToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  async call(name: string, rawArguments: unknown, signal?: AbortSignal): Promise<McpToolCallResult> {
    try {
      const args = asObject(rawArguments);
      switch (name) {
        case 'repository_summary':
          return this.#repositorySummary(signal);
        case 'git_status':
          return this.#gitStatus(signal);
        case 'recent_commits':
          return this.#recentCommits(args, signal);
        case 'get_diff':
          return this.#getDiff(args, signal);
        case 'list_files':
          return this.#listFiles(args, signal);
        case 'read_file':
          return this.#readFile(args);
        case 'search_code':
          return this.#searchCode(args, signal);
        default:
          return toolError(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return toolError(toSafeErrorMessage(error));
    }
  }

  async #repositorySummary(signal?: AbortSignal): Promise<McpToolCallResult> {
    const [branch, head, status, latestCommitOutput] = await Promise.all([
      this.#git(['rev-parse', '--abbrev-ref', 'HEAD'], signal),
      this.#git(['rev-parse', 'HEAD'], signal),
      this.#git(['status', '--short', '--branch', '--untracked-files=all'], signal),
      this.#git(
        ['log', '-1', '--date=iso-strict', '--pretty=format:%H%x09%an%x09%ad%x09%s'],
        signal,
      ),
    ]);

    let remoteUrl: string | undefined;
    try {
      remoteUrl = sanitizeRemoteUrl((await this.#git(['remote', 'get-url', 'origin'], signal)).trim());
    } catch {
      remoteUrl = undefined;
    }

    const statusLines = nonEmptyLines(status);
    const latestCommit = this.#sanitizeCommit(parseCommitLine(latestCommitOutput));
    const result = {
      repository: this.#displayName,
      branch: branch.trim(),
      head: head.trim(),
      remoteUrl,
      hasWorkingTreeChanges: statusLines.some((line) => !line.startsWith('##')),
      status: truncateText(status, this.#maxResultBytes),
      latestCommit,
      access: 'read-only',
    };
    return toolSuccess(result);
  }

  async #gitStatus(signal?: AbortSignal): Promise<McpToolCallResult> {
    const status = await this.#git(
      ['status', '--short', '--branch', '--untracked-files=all'],
      signal,
    );
    return toolSuccess({
      repository: this.#displayName,
      status: truncateText(status, this.#maxResultBytes),
    });
  }

  async #recentCommits(
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const count = readInteger(args.count, 5, 1, 30);
    const output = await this.#git(
      [
        'log',
        '-n',
        String(count),
        '--date=iso-strict',
        '--pretty=format:%H%x09%an%x09%ad%x09%s',
      ],
      signal,
    );
    const commits = nonEmptyLines(output).map(parseCommitLine).map((commit) => this.#sanitizeCommit(commit));
    return toolSuccess({ repository: this.#displayName, commits });
  }

  #sanitizeCommit(commit: Record<string, string>): Record<string, string> {
    if (!this.#contentGuard.hasSensitiveContent('git/commit-message.txt', commit.subject ?? '')) {
      return commit;
    }
    return { ...commit, subject: '[BLOCKED: sensitive content detected]' };
  }

  async #getDiff(
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const scope = readEnum(args.scope, ['working', 'staged', 'range'] as const, 'working');
    const pathFilter = normalizeOptionalFilePath(readOptionalString(args.path));

    let output: string;
    let baseRef: string | undefined;
    let headRef: string | undefined;
    let truncated = false;
    let excludedSensitiveFiles = 0;
    let includedFiles = 0;

    if (scope === 'working') {
      const [unstaged, staged] = await Promise.all([
        this.#collectDiff([], pathFilter, signal),
        this.#collectDiff(['--cached'], pathFilter, signal),
      ]);
      output = [
        unstaged.output ? `## Unstaged changes\n${unstaged.output}` : '',
        staged.output ? `## Staged changes\n${staged.output}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      truncated = unstaged.truncated || staged.truncated;
      excludedSensitiveFiles =
        unstaged.excludedSensitiveFiles + staged.excludedSensitiveFiles;
      includedFiles = unstaged.includedFiles + staged.includedFiles;
    } else if (scope === 'staged') {
      const staged = await this.#collectDiff(['--cached'], pathFilter, signal);
      output = staged.output;
      truncated = staged.truncated;
      excludedSensitiveFiles = staged.excludedSensitiveFiles;
      includedFiles = staged.includedFiles;
    } else {
      baseRef = readString(args.baseRef, 'baseRef');
      headRef = readOptionalString(args.headRef) ?? 'HEAD';
      const verifiedBase = await this.#verifyCommit(baseRef, signal);
      const verifiedHead = await this.#verifyCommit(headRef, signal);
      const ranged = await this.#collectDiff(
        [verifiedBase, verifiedHead],
        pathFilter,
        signal,
      );
      output = ranged.output;
      truncated = ranged.truncated;
      excludedSensitiveFiles = ranged.excludedSensitiveFiles;
      includedFiles = ranged.includedFiles;
    }

    return toolSuccess({
      repository: this.#displayName,
      scope,
      baseRef,
      headRef,
      path: pathFilter,
      diff: truncateText(output, this.#maxResultBytes),
      includedFiles,
      excludedSensitiveFiles,
      truncated: truncated || Buffer.byteLength(output, 'utf8') > this.#maxResultBytes,
    });
  }

  async #collectDiff(
    refArguments: readonly string[],
    pathFilter: string | undefined,
    signal?: AbortSignal,
  ): Promise<CollectedDiff> {
    const safeFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
    const pathArguments = pathFilter ? [pathFilter] : [];
    const namesOutput = await this.#git(
      [
        'diff',
        ...safeFlags,
        '--name-only',
        '-z',
        ...refArguments,
        '--',
        ...pathArguments,
      ],
      signal,
    );
    const changedFiles = namesOutput.split('\0').filter(Boolean);
    const safeFiles = changedFiles.filter((file) => !isSensitivePath(file));
    const selectedFiles = safeFiles.slice(0, MAX_DIFF_FILES);
    const pieces: string[] = [];
    let byteCount = 0;
    let excludedSensitiveFiles = changedFiles.length - safeFiles.length;
    let truncated = safeFiles.length > selectedFiles.length;

    for (const file of selectedFiles) {
      const normalizedFile = normalizeRepositoryRelativePath(file, 'Git diff path', true);
      const diff = await this.#git(
        ['diff', ...safeFlags, ...refArguments, '--', normalizedFile],
        signal,
      );
      if (!diff) continue;
      if (this.#contentGuard.hasSensitiveContent(normalizedFile, diff)) {
        excludedSensitiveFiles += 1;
        continue;
      }
      const nextBytes = Buffer.byteLength(diff, 'utf8');
      if (byteCount + nextBytes > this.#maxResultBytes) {
        const remainingBytes = Math.max(0, this.#maxResultBytes - byteCount);
        if (remainingBytes > 0) pieces.push(truncateText(diff, remainingBytes));
        truncated = true;
        break;
      }
      pieces.push(diff);
      byteCount += nextBytes;
    }

    return {
      output: pieces.join('\n'),
      truncated,
      excludedSensitiveFiles,
      includedFiles: pieces.length,
    };
  }

  async #listFiles(
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const prefix = normalizeOptionalPrefix(readOptionalString(args.prefix));
    const limit = readInteger(args.limit, 300, 1, 2_000);
    const output = await this.#git(['ls-files', '-co', '--exclude-standard', '-z'], signal);
    const eligible = output
      .split('\0')
      .filter(Boolean)
      .filter((file) => !isSensitivePath(file))
      .filter((file) => !prefix || normalizeRepoPath(file).startsWith(prefix));
    const files = eligible.slice(0, limit);
    return toolSuccess({
      repository: this.#displayName,
      files,
      truncated: eligible.length > files.length,
    });
  }

  async #readFile(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const relativePath = readString(args.path, 'path');
    const startLine = readInteger(args.startLine, 1, 1, 1_000_000);
    const endLine = readInteger(args.endLine, startLine + 399, startLine, 1_000_000);
    const resolved = await this.#resolveReadableFile(relativePath);
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) throw new Error('Only regular files can be read.');
    if (fileStat.size > MAX_READ_BYTES) {
      throw new Error(`File exceeds the ${MAX_READ_BYTES}-byte read limit.`);
    }

    const buffer = await readFile(resolved);
    if (looksBinary(buffer)) throw new Error('Binary files cannot be read.');
    const lines = buffer.toString('utf8').split(/\r?\n/);
    const selected = lines.slice(startLine - 1, endLine);
    const selectedContent = selected.join('\n');
    const normalizedPath = normalizeRepoPath(relativePath);
    if (this.#contentGuard.hasSensitiveContent(normalizedPath, selectedContent)) {
      throw new Error('Sensitive content was detected in the requested line range.');
    }
    const content = selected.map((line, index) => `${startLine + index}: ${line}`).join('\n');
    return toolSuccess({
      repository: this.#displayName,
      path: normalizedPath,
      startLine,
      endLine: Math.min(endLine, lines.length),
      totalLines: lines.length,
      content: truncateText(content, this.#maxResultBytes),
    });
  }

  async #searchCode(
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const query = readString(args.query, 'query');
    if (query.length > 200) throw new Error('Search query is too long.');
    const prefix = normalizeOptionalPrefix(readOptionalString(args.prefix));
    const maxResults = readInteger(
      args.maxResults,
      DEFAULT_SEARCH_RESULTS,
      1,
      MAX_SEARCH_RESULTS,
    );
    const output = await this.#git(['ls-files', '-co', '--exclude-standard', '-z'], signal);
    const candidates = output
      .split('\0')
      .filter(Boolean)
      .filter((file) => !isSensitivePath(file))
      .filter((file) => !prefix || normalizeRepoPath(file).startsWith(prefix))
      .slice(0, MAX_SEARCH_FILES);

    const needle = query.toLocaleLowerCase();
    const matches: Array<{ path: string; line: number; snippet: string }> = [];
    for (const relativePath of candidates) {
      if (matches.length >= maxResults) break;
      try {
        const resolved = await this.#resolveReadableFile(relativePath);
        const fileStat = await stat(resolved);
        if (!fileStat.isFile() || fileStat.size > MAX_SEARCH_FILE_BYTES) continue;
        const buffer = await readFile(resolved);
        if (looksBinary(buffer)) continue;
        const lines = buffer.toString('utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
          const line = lines[index] ?? '';
          if (!line.toLocaleLowerCase().includes(needle)) continue;
          const normalizedPath = normalizeRepoPath(relativePath);
          if (this.#contentGuard.hasSensitiveContent(normalizedPath, line)) continue;
          matches.push({
            path: normalizedPath,
            line: index + 1,
            snippet: line.trim().slice(0, 500),
          });
        }
      } catch {
        // Files may disappear while the workspace changes. Skip them without widening access.
      }
    }

    return toolSuccess({
      repository: this.#displayName,
      query,
      matches,
      truncated: matches.length === maxResults,
    });
  }

  async #verifyCommit(ref: string, signal?: AbortSignal): Promise<string> {
    const output = await this.#git(
      ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`],
      signal,
    );
    const commit = output.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error('Invalid commit reference.');
    return commit;
  }

  async #git(args: readonly string[], signal?: AbortSignal): Promise<string> {
    return (await this.#runner.run({ cwd: this.#root, args, signal })).stdout;
  }

  async #resolveReadableFile(relativePath: string): Promise<string> {
    const normalized = normalizeRepositoryRelativePath(relativePath, 'File path', true);
    const candidate = path.resolve(this.#root, normalized);
    const realRoot = (this.#realRoot ??= await realpath(this.#root));
    let realCandidate: string;
    try {
      realCandidate = await realpath(candidate);
    } catch {
      throw new Error('Requested file does not exist or is not readable.');
    }
    const boundary = path.relative(realRoot, realCandidate);
    if (
      boundary === '' ||
      boundary === '..' ||
      boundary.startsWith(`..${path.sep}`) ||
      path.isAbsolute(boundary)
    ) {
      throw new Error('Path resolves outside the repository.');
    }
    return realCandidate;
  }
}

const TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'repository_summary',
    title: 'Repository summary',
    description:
      'Read the bound repository identity, current branch, HEAD commit, latest commit, and working-tree summary. Use this first when the user refers to the current project without naming a precise range.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'git_status',
    title: 'Git status',
    description: 'Read staged, unstaged, and untracked changes in the bound repository.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'recent_commits',
    title: 'Recent commits',
    description: 'List recent commits so you can choose a sensible review range.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { count: { type: 'integer', minimum: 1, maximum: 30, default: 5 } },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'get_diff',
    title: 'Read Git diff',
    description:
      'Read working-tree, staged, or commit-range changes after excluding credential-like paths and content. For recent commit review, inspect recent_commits first and then request an explicit range.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: { type: 'string', enum: ['working', 'staged', 'range'], default: 'working' },
        baseRef: { type: 'string' },
        headRef: { type: 'string', default: 'HEAD' },
        path: { type: 'string', description: 'Optional repository-relative path filter.' },
      },
      allOf: [
        {
          if: { properties: { scope: { const: 'range' } }, required: ['scope'] },
          then: { required: ['baseRef'] },
        },
      ],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'list_files',
    title: 'List repository files',
    description: 'List tracked and untracked, non-ignored repository files, excluding blocked sensitive paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prefix: { type: 'string', description: 'Optional repository-relative directory prefix.' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, default: 300 },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'read_file',
    title: 'Read repository file',
    description:
      'Read a bounded line range from a non-sensitive text file inside the bound repository. Absolute paths, .git, symlink escapes, binary files, credential-like files, and sensitive content are rejected.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        startLine: { type: 'integer', minimum: 1, default: 1 },
        endLine: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'search_code',
    title: 'Search repository code',
    description:
      'Search non-ignored text files for a literal, case-insensitive string and return bounded, secret-scanned matching lines. Use this to locate callers, tests, configuration, and related implementation before reading files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        prefix: { type: 'string' },
        maxResults: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
      },
      required: ['query'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

function toolSuccess(value: Record<string, unknown>): McpToolCallResult {
  const text = JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }], structuredContent: value, isError: false };
}

function toolError(message: string): McpToolCallResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool arguments must be an object.');
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('Expected a string value.');
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value)) throw new Error('Expected an integer value.');
  return clampInteger(value as number, minimum, maximum);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new Error(`Expected one of: ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function nonEmptyLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseCommitLine(value: string): Record<string, string> {
  const [sha = '', author = '', date = '', ...subjectParts] = value.trim().split('\t');
  return { sha, author, date, subject: subjectParts.join('\t') };
}

function truncateText(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '[TRUNCATED BY REVIEWLUME]';
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return `${value.slice(0, low)}\n[TRUNCATED BY REVIEWLUME]`;
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isAbsoluteLike(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    path.posix.isAbsolute(normalizeRepoPath(value)) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value)
  );
}

function normalizeRepositoryRelativePath(
  value: string,
  label: string,
  blockSensitive: boolean,
): string {
  if (isAbsoluteLike(value) || value.includes('\0')) {
    throw new Error(`${label} must be repository-relative.`);
  }
  const normalized = path.posix.normalize(normalizeRepoPath(value));
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`${label} resolves outside the repository.`);
  }
  if (normalized === '.git' || normalized.startsWith('.git/')) {
    throw new Error('The .git directory is not readable through MCP.');
  }
  if (blockSensitive && isSensitivePath(normalized)) {
    throw new Error('Sensitive files are blocked.');
  }
  return normalized;
}

function normalizeOptionalFilePath(value: string | undefined): string | undefined {
  return value
    ? normalizeRepositoryRelativePath(value, 'Git diff path', true)
    : undefined;
}

function normalizeOptionalPrefix(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeRepositoryRelativePath(value, 'Prefix', false).replace(/\/+$/, '');
  return `${normalized}/`;
}

function isSensitivePath(value: string): boolean {
  const normalized = normalizeRepoPath(value).toLowerCase();
  const parts = normalized.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (SENSITIVE_FILE_NAMES.has(name)) return true;
  if (name.startsWith('.env.')) return true;
  if (SENSITIVE_EXTENSIONS.has(path.extname(name))) return true;
  return parts.some((part) => part === '.ssh' || part === 'secrets' || part === 'credentials');
}

function looksBinary(value: Buffer): boolean {
  const sample = value.subarray(0, Math.min(value.length, 8_192));
  return sample.includes(0);
}

function sanitizeRemoteUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace('//@', '//');
  } catch {
    const scpStyle = trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scpStyle && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
      return `ssh://${scpStyle[1]}/${scpStyle[2]}`;
    }
    return trimmed.replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      '$1[REDACTED]@',
    );
  }
}

function toSafeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Repository tool failed.';
  return error.message
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .slice(0, 1_000);
}
