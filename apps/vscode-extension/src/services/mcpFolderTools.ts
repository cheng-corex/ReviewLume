import * as path from 'node:path';
import { lstat, readdir, realpath } from 'node:fs/promises';
import {
  McpRepositoryTools,
  type McpGitRunner,
  type McpToolCallResult,
  type McpToolDefinition,
} from './mcpRepositoryTools';

interface FolderToolsOptions {
  readonly root: string;
  readonly displayName: string;
  readonly maxResultBytes?: number;
}

const MAX_FOLDER_FILES = 5_000;
const MAX_FOLDER_ENTRIES = 20_000;
const MAX_FOLDER_DEPTH = 32;

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const COMMON_TOOL_NAMES = new Set(['list_files', 'read_file', 'search_code']);
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.kube',
  'node_modules',
  '.pnpm-store',
  '.yarn',
  '.cache',
  '.next',
  '.nuxt',
  'coverage',
  'dist',
  'build',
  'out',
  'target',
]);

const SENSITIVE_FILE_NAMES = new Set([
  'credentials',
  'credentials.json',
  'secrets.json',
  'secrets.yml',
  'secrets.yaml',
  'id_rsa',
  'id_ed25519',
  '.npmrc',
  '.pypirc',
  '.netrc',
]);

const SENSITIVE_EXTENSIONS = new Set(['.key', '.pem', '.p12', '.pfx', '.jks', '.keystore', '.kdbx']);
const SAFE_ENV_TEMPLATE_SUFFIXES = new Set(['.example', '.sample', '.template', '.dist']);

/**
 * Folder Project tools intentionally expose only project identity and common
 * read-only file inspection. Git history and Local Verification are absent from
 * the tool definitions and are rejected even if a client attempts a hidden call.
 *
 * Common file reading/search behavior is reused from McpRepositoryTools. A tiny
 * ls-files adapter supplies a bounded filesystem enumeration instead of Git.
 */
export class McpFolderTools extends McpRepositoryTools {
  readonly #displayName: string;

  constructor(options: FolderToolsOptions) {
    super({
      root: options.root,
      displayName: options.displayName,
      runner: new FolderProjectFileRunner(options.root),
      maxResultBytes: options.maxResultBytes,
    });
    this.#displayName = options.displayName;
  }

  override get definitions(): readonly McpToolDefinition[] {
    return FOLDER_TOOL_DEFINITIONS;
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (name === 'project_summary') {
      return folderSuccess({
        project: this.#displayName,
        projectKind: 'folder',
        access: 'read-only',
        gitHistoryAvailable: false,
        localVerificationAvailable: false,
        capabilities: ['project_summary', 'list_files', 'read_file', 'search_code'],
        historyNotice:
          'This Folder Project has no reliable Git history. Do not infer recent changes, staged state, commits, branches, or diffs.',
      });
    }

    if (!COMMON_TOOL_NAMES.has(name)) {
      return folderError(`Tool ${name} is not available for a Folder Project.`);
    }

    if (name === 'read_file') {
      const requestedPath = readRequestedPath(rawArguments);
      if (requestedPath && isSensitiveFolderPath(requestedPath)) {
        return folderError('This sensitive path is not readable through Folder Project MCP.');
      }
    }

    const result = await super.call(name, rawArguments, signal);
    if (result.isError || !result.structuredContent) return result;

    // The reused common implementation carries a legacy `repository` display
    // field. Strip it at the Folder boundary so a plain folder never presents a
    // synthetic Git repository identity to the MCP client.
    const commonContent = { ...result.structuredContent };
    delete commonContent.repository;
    const structuredContent = {
      ...commonContent,
      project: this.#displayName,
      projectKind: 'folder',
    };
    return {
      ...result,
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  }
}

/**
 * Adapter used only for the two common operations that historically enumerate
 * files through `git ls-files`. It does not execute Git or any other process.
 */
class FolderProjectFileRunner implements McpGitRunner {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  async run(options: {
    readonly cwd: string;
    readonly args: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<{ readonly stdout: string }> {
    if (options.args[0] !== 'ls-files') {
      throw new Error('Git tools are unavailable for a Folder Project.');
    }
    const files = await enumerateFolderFiles(this.#root, options.signal);
    return { stdout: files.length > 0 ? `${files.join('\0')}\0` : '' };
  }
}

export async function enumerateFolderFiles(root: string, signal?: AbortSignal): Promise<string[]> {
  const canonicalRoot = await realpath(path.resolve(root));
  const files: string[] = [];
  const queue: Array<{ readonly absolute: string; readonly relative: string; readonly depth: number }> = [
    { absolute: canonicalRoot, relative: '', depth: 0 },
  ];
  let visitedEntries = 0;

  while (queue.length > 0 && files.length < MAX_FOLDER_FILES && visitedEntries < MAX_FOLDER_ENTRIES) {
    if (signal?.aborted) throw new Error('Folder enumeration was cancelled.');
    const current = queue.shift();
    if (!current) break;
    if (current.depth > MAX_FOLDER_DEPTH) continue;

    let entries;
    try {
      entries = await readdir(current.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (signal?.aborted) throw new Error('Folder enumeration was cancelled.');
      visitedEntries += 1;
      if (visitedEntries > MAX_FOLDER_ENTRIES || files.length >= MAX_FOLDER_FILES) break;

      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const normalizedRelative = normalizeFolderPath(relative);
      const absolute = path.join(current.absolute, entry.name);

      let details;
      try {
        details = await lstat(absolute);
      } catch {
        continue;
      }

      // Never follow symlinks/junctions/reparse-point links during enumeration.
      if (details.isSymbolicLink()) continue;

      if (details.isDirectory()) {
        if (shouldSkipDirectory(normalizedRelative)) continue;
        const resolvedDirectory = await safeRealpathInside(canonicalRoot, absolute);
        if (!resolvedDirectory) continue;
        queue.push({
          absolute: resolvedDirectory,
          relative: normalizedRelative,
          depth: current.depth + 1,
        });
        continue;
      }

      if (!details.isFile() || isSensitiveFolderPath(normalizedRelative)) continue;
      const resolvedFile = await safeRealpathInside(canonicalRoot, absolute);
      if (!resolvedFile) continue;
      files.push(normalizedRelative);
    }
  }

  return files;
}

async function safeRealpathInside(root: string, candidate: string): Promise<string | undefined> {
  try {
    const resolved = await realpath(candidate);
    const boundary = path.relative(root, resolved);
    if (
      boundary === '..' ||
      boundary.startsWith(`..${path.sep}`) ||
      path.isAbsolute(boundary)
    ) {
      return undefined;
    }
    return resolved;
  } catch {
    return undefined;
  }
}

function shouldSkipDirectory(relativePath: string): boolean {
  const parts = normalizeFolderPath(relativePath).toLocaleLowerCase().split('/');
  return parts.some((part) => SKIPPED_DIRECTORY_NAMES.has(part));
}

export function isSensitiveFolderPath(value: string): boolean {
  const normalized = normalizeFolderPath(value);
  const parts = normalized.toLocaleLowerCase().split('/').filter(Boolean);
  if (parts.some((part) => ['.git', '.ssh', '.gnupg', '.aws', '.azure', '.kube'].includes(part))) {
    return true;
  }

  const basename = parts.at(-1) ?? '';
  if (SENSITIVE_FILE_NAMES.has(basename)) return true;
  if (SENSITIVE_EXTENSIONS.has(path.posix.extname(basename))) return true;

  if (basename === '.env') return true;
  if (basename.startsWith('.env.')) {
    const suffix = basename.slice('.env'.length);
    return !SAFE_ENV_TEMPLATE_SUFFIXES.has(suffix);
  }

  return false;
}

function readRequestedPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as { readonly path?: unknown }).path;
  return typeof candidate === 'string' ? candidate : undefined;
}

function normalizeFolderPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function folderSuccess(value: Record<string, unknown>): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

function folderError(message: string): McpToolCallResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const FOLDER_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'project_summary',
    title: 'Project summary',
    description:
      'Identify the bound Folder Project and its read-only capabilities. Folder Projects have no reliable Git history or Local Verification.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'list_files',
    title: 'List project files',
    description:
      'List bounded regular files inside the Folder Project. VCS metadata, common dependency/build trees, symlinks/junctions, and obvious credential paths are omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        prefix: { type: 'string', description: 'Optional project-relative directory prefix.' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, default: 300 },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'read_file',
    title: 'Read project file',
    description:
      'Read a bounded line range from a regular text file inside the Folder Project. Absolute paths, traversal, VCS metadata, obvious credential paths, symlink/junction escapes, binary files, and oversized files are rejected.',
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
    title: 'Search project code',
    description:
      'Search bounded, non-sensitive regular text files inside the Folder Project for a literal, case-insensitive string.',
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
