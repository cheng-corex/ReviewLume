import * as path from 'node:path';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { McpFolderTools } from './mcpFolderTools';
import {
  McpRepositoryTools,
  type McpGitRunner,
  type McpToolCallResult,
  type McpToolDefinition,
} from './mcpRepositoryTools';

interface FolderProjectToolsOptions {
  readonly root: string;
  readonly displayName: string;
  readonly gitRunner: McpGitRunner;
  readonly maxResultBytes?: number;
}

interface NestedGitRepository {
  readonly relativePath: string;
  readonly absolutePath: string;
}

export interface NestedGitDiscoveryResult {
  readonly repositories: readonly NestedGitRepository[];
  readonly truncated: boolean;
}

const MAX_NESTED_GIT_REPOSITORIES = 64;
const MAX_NESTED_GIT_ENTRIES = 20_000;
const MAX_NESTED_GIT_DEPTH = 32;

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const NESTED_GIT_TOOL_NAMES = new Set([
  'repository_summary',
  'git_status',
  'recent_commits',
  'get_diff',
]);

const SKIPPED_DISCOVERY_DIRECTORY_NAMES = new Set([
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

/**
 * Folder Project MCP with explicit, repository-scoped read-only Git inspection.
 *
 * The authorized Folder root remains the outer security boundary. Git tools are
 * never applied to the Folder root as a synthetic repository: callers must first
 * select one real nested repository by project-relative path. Local Verification
 * remains unavailable in Folder mode.
 */
export class McpFolderProjectTools extends McpFolderTools {
  readonly #root: string;
  readonly #displayName: string;
  readonly #gitRunner: McpGitRunner;
  readonly #maxResultBytes: number | undefined;

  constructor(options: FolderProjectToolsOptions) {
    super({
      root: options.root,
      displayName: options.displayName,
      maxResultBytes: options.maxResultBytes,
    });
    this.#root = path.resolve(options.root);
    this.#displayName = options.displayName;
    this.#gitRunner = options.gitRunner;
    this.#maxResultBytes = options.maxResultBytes;
  }

  override get definitions(): readonly McpToolDefinition[] {
    const common = super.definitions.map((definition) =>
      definition.name === 'project_summary'
        ? {
            ...definition,
            description:
              'Identify the bound Folder Project and its read-only capabilities. The Folder root has no aggregate Git history, but explicitly selected nested Git repositories can be inspected read-only.',
          }
        : definition,
    );
    const [summary, ...fileTools] = common;
    return [
      ...(summary ? [summary] : []),
      LIST_GIT_REPOSITORIES_DEFINITION,
      ...NESTED_GIT_TOOL_DEFINITIONS,
      ...fileTools,
    ];
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (name === 'project_summary') {
      return this.#projectSummary(signal);
    }
    if (name === 'list_git_repositories') {
      return this.#listGitRepositories(signal);
    }
    if (NESTED_GIT_TOOL_NAMES.has(name)) {
      return this.#callNestedGit(name, rawArguments, signal);
    }
    return super.call(name, rawArguments, signal);
  }

  async #projectSummary(signal?: AbortSignal): Promise<McpToolCallResult> {
    const base = await super.call('project_summary', {}, signal);
    if (base.isError || !base.structuredContent) return base;

    const structuredContent = {
      ...base.structuredContent,
      nestedGitRepositoriesAvailable: true,
      capabilities: this.definitions.map((definition) => definition.name),
      historyNotice:
        'The Folder root has no aggregate Git history. Use list_git_repositories, then pass an explicit repository path to repository_summary, git_status, recent_commits, or get_diff. Never combine child repositories into synthetic Git history.',
    };
    return folderSuccess(structuredContent);
  }

  async #listGitRepositories(signal?: AbortSignal): Promise<McpToolCallResult> {
    try {
      const discovery = await discoverNestedGitRepositories(this.#root, this.#gitRunner, signal);
      return folderSuccess({
        project: this.#displayName,
        projectKind: 'folder',
        repositories: discovery.repositories.map((repository) => ({
          path: repository.relativePath,
          name: path.posix.basename(repository.relativePath),
        })),
        truncated: discovery.truncated,
        note:
          'Each listed path is a separate Git repository inside the authorized Folder Project. Git queries must select exactly one repository path.',
      });
    } catch (error) {
      return folderError(toSafeMessage(error));
    }
  }

  async #callNestedGit(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    try {
      const args = asObject(rawArguments);
      const requestedRepository = readRepositoryPath(args.repository);
      const repository = await resolveNestedGitRepository(
        this.#root,
        requestedRepository,
        this.#gitRunner,
        signal,
      );
      const nestedArguments = { ...args };
      delete nestedArguments.repository;

      const tools = new McpRepositoryTools({
        root: repository.absolutePath,
        displayName: repository.relativePath,
        runner: this.#gitRunner,
        maxResultBytes: this.#maxResultBytes,
      });
      const result = await tools.call(name, nestedArguments, signal);
      if (result.isError || !result.structuredContent) return result;

      const structuredContent = {
        ...result.structuredContent,
        project: this.#displayName,
        projectKind: 'folder',
        repositoryPath: repository.relativePath,
      };
      return {
        ...result,
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    } catch (error) {
      return folderError(toSafeMessage(error));
    }
  }
}

export async function discoverNestedGitRepositories(
  root: string,
  runner: McpGitRunner,
  signal?: AbortSignal,
): Promise<NestedGitDiscoveryResult> {
  const canonicalRoot = await realpath(path.resolve(root));
  const repositories: NestedGitRepository[] = [];
  const queue: Array<{ readonly absolutePath: string; readonly relativePath: string; readonly depth: number }> = [
    { absolutePath: canonicalRoot, relativePath: '', depth: 0 },
  ];
  let visitedEntries = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (signal?.aborted) throw new Error('Nested Git repository discovery was cancelled.');
    if (
      repositories.length >= MAX_NESTED_GIT_REPOSITORIES ||
      visitedEntries >= MAX_NESTED_GIT_ENTRIES
    ) {
      truncated = true;
      break;
    }

    const current = queue.shift();
    if (!current || current.depth > MAX_NESTED_GIT_DEPTH) {
      if (current) truncated = true;
      continue;
    }

    let entries;
    try {
      entries = await readdir(current.absolutePath, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    if (current.relativePath) {
      const marker = entries.find((entry) => entry.name.toLocaleLowerCase() === '.git');
      if (marker) {
        const markerPath = path.join(current.absolutePath, marker.name);
        try {
          const markerDetails = await lstat(markerPath);
          if (
            !markerDetails.isSymbolicLink() &&
            (markerDetails.isDirectory() || markerDetails.isFile())
          ) {
            const repository = await verifyNestedGitRepository(
              canonicalRoot,
              current,
              runner,
              signal,
            );
            if (
              repository &&
              !repositories.some((candidate) =>
                sameCanonicalPath(candidate.absolutePath, repository.absolutePath),
              )
            ) {
              repositories.push(repository);
            }
          }
        } catch {
          // Ignore unreadable or invalid .git markers. They never widen access.
        }
      }
    }

    for (const entry of entries) {
      if (signal?.aborted) throw new Error('Nested Git repository discovery was cancelled.');
      visitedEntries += 1;
      if (visitedEntries >= MAX_NESTED_GIT_ENTRIES) {
        truncated = queue.length > 0 || entries.indexOf(entry) < entries.length - 1;
        break;
      }
      if (SKIPPED_DISCOVERY_DIRECTORY_NAMES.has(entry.name.toLocaleLowerCase())) continue;

      const candidate = path.join(current.absolutePath, entry.name);
      let details;
      try {
        details = await lstat(candidate);
      } catch {
        continue;
      }
      if (!details.isDirectory() || details.isSymbolicLink()) continue;

      const resolved = await safeRealpathInside(canonicalRoot, candidate);
      if (!resolved) continue;
      const relativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;
      queue.push({
        absolutePath: resolved,
        relativePath: normalizeProjectPath(relativePath),
        depth: current.depth + 1,
      });
    }
  }

  repositories.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (queue.length > 0) truncated = true;
  return { repositories, truncated };
}

async function resolveNestedGitRepository(
  root: string,
  requestedRepository: string,
  runner: McpGitRunner,
  signal?: AbortSignal,
): Promise<NestedGitRepository> {
  const canonicalRoot = await realpath(path.resolve(root));
  const discovery = await discoverNestedGitRepositories(canonicalRoot, runner, signal);
  const repository = discovery.repositories.find(
    (candidate) => candidate.relativePath === requestedRepository,
  );
  if (!repository) {
    throw new Error(
      'The requested path must exactly match a nested Git repository returned by list_git_repositories.',
    );
  }

  const selectedPath = await safeRealpathInside(
    canonicalRoot,
    path.resolve(canonicalRoot, repository.relativePath),
  );
  if (!selectedPath || !sameCanonicalPath(selectedPath, repository.absolutePath)) {
    throw new Error('The selected nested Git repository no longer resolves to the discovered path.');
  }
  return repository;
}

async function verifyNestedGitRepository(
  canonicalRoot: string,
  candidate: { readonly absolutePath: string; readonly relativePath: string },
  runner: McpGitRunner,
  signal?: AbortSignal,
): Promise<NestedGitRepository | undefined> {
  try {
    const topLevelOutput = (
      await runner.run({
        cwd: candidate.absolutePath,
        args: ['rev-parse', '--show-toplevel'],
        signal,
      })
    ).stdout.trim();
    const gitDirectoryOutput = (
      await runner.run({
        cwd: candidate.absolutePath,
        args: ['rev-parse', '--absolute-git-dir'],
        signal,
      })
    ).stdout.trim();
    if (!topLevelOutput || !gitDirectoryOutput) return undefined;

    const topLevel = await safeRealpathInside(
      canonicalRoot,
      path.isAbsolute(topLevelOutput)
        ? topLevelOutput
        : path.resolve(candidate.absolutePath, topLevelOutput),
    );
    const gitDirectory = await safeRealpathInside(
      canonicalRoot,
      path.isAbsolute(gitDirectoryOutput)
        ? gitDirectoryOutput
        : path.resolve(candidate.absolutePath, gitDirectoryOutput),
    );
    if (!topLevel || !gitDirectory) return undefined;
    if (!sameCanonicalPath(topLevel, candidate.absolutePath)) return undefined;

    const relativePath = normalizeProjectPath(path.relative(canonicalRoot, topLevel));
    if (!relativePath || relativePath === '.') return undefined;
    return { relativePath, absolutePath: topLevel };
  } catch {
    return undefined;
  }
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

function sameCanonicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === '' && path.relative(right, left) === '';
}

function readRepositoryPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('repository must name one nested Git repository returned by list_git_repositories.');
  }
  const normalized = normalizeProjectPath(value.trim());
  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.startsWith('//')
  ) {
    throw new Error('repository must be a project-relative path.');
  }
  const parts = normalized.split('/').filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === '.' || part === '..' || part.toLocaleLowerCase() === '.git')
  ) {
    throw new Error('repository must be a safe nested project-relative path.');
  }
  return parts.join('/');
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeProjectPath(value: string): string {
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

function toSafeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nested Git repository inspection failed.';
}

const LIST_GIT_REPOSITORIES_DEFINITION: McpToolDefinition = {
  name: 'list_git_repositories',
  title: 'List nested Git repositories',
  description:
    'Discover bounded Git repositories nested inside the authorized Folder Project. Symlink/junction escapes and Git metadata outside the Folder Project are rejected.',
  inputSchema: { type: 'object', additionalProperties: false },
  annotations: READ_ONLY_ANNOTATIONS,
};

const NESTED_GIT_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'repository_summary',
    title: 'Nested repository summary',
    description:
      'Read identity, branch, HEAD, latest commit, and working-tree summary for one nested Git repository inside the Folder Project.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: {
          type: 'string',
          description: 'Folder-Project-relative repository path returned by list_git_repositories.',
        },
      },
      required: ['repository'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'git_status',
    title: 'Nested Git status',
    description:
      'Read staged, unstaged, and untracked changes for one explicitly selected nested Git repository.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: {
          type: 'string',
          description: 'Folder-Project-relative repository path returned by list_git_repositories.',
        },
      },
      required: ['repository'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'recent_commits',
    title: 'Nested recent commits',
    description: 'List recent commits for one explicitly selected nested Git repository.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: {
          type: 'string',
          description: 'Folder-Project-relative repository path returned by list_git_repositories.',
        },
        count: { type: 'integer', minimum: 1, maximum: 30, default: 5 },
      },
      required: ['repository'],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'get_diff',
    title: 'Read nested Git diff',
    description:
      'Read working-tree, staged, or commit-range changes for one explicitly selected nested Git repository.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: {
          type: 'string',
          description: 'Folder-Project-relative repository path returned by list_git_repositories.',
        },
        scope: { type: 'string', enum: ['working', 'staged', 'range'], default: 'working' },
        baseRef: { type: 'string' },
        headRef: { type: 'string', default: 'HEAD' },
        path: { type: 'string', description: 'Optional path relative to the selected nested repository.' },
      },
      required: ['repository'],
      allOf: [
        {
          if: { properties: { scope: { const: 'range' } }, required: ['scope'] },
          then: { required: ['baseRef'] },
        },
      ],
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
];
