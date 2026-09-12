import * as vscode from 'vscode';
import { createReadOnlyGitRunner } from './gitRuntime';
import type { LocalVerificationService, VerificationResultReader } from './localVerificationService';
import { logInfo, logWarn } from './logService';
import { McpConnectorServer, type McpConnectorAddress } from './mcpConnectorServer';
import { McpFolderProjectTools } from './mcpFolderProjectTools';
import {
  McpRepositoryTools,
  type McpGitRunner,
  type McpToolCallResult,
  type McpToolDefinition,
} from './mcpRepositoryTools';
import { resolveProjectContext, type ProjectKind } from './projectContext';

export interface McpConnectionInfo extends McpConnectorAddress {
  /** Backward-compatible display name used by existing tunnel/UI code. */
  readonly repository: string;
  /** Backward-compatible root field used by existing integrations. */
  readonly repositoryRoot: string;
  readonly project: string;
  readonly projectRoot: string;
  readonly projectKind: ProjectKind;
  readonly authorizationHeader: string;
  /** Dedicated loopback header value used by OpenAI tunnel-client. */
  readonly tunnelToken: string;
}

interface RepositoryIdentityToolsOptions {
  readonly root: string;
  readonly displayName: string;
  readonly runner: McpGitRunner;
  readonly maxResultBytes?: number;
  readonly verification?: VerificationResultReader;
}

interface StableProjectToolsOptions extends RepositoryIdentityToolsOptions {
  readonly projectKind: ProjectKind;
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const VERIFICATION_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'verification_status',
    title: 'Local verification status',
    description:
      'Read the latest user-approved local verification result for the connected Git Project, including whether it still matches the current HEAD and working tree. Folder Projects return an unavailable result. This tool cannot start a process.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'read_verification_output',
    title: 'Read local verification output',
    description:
      'Read a bounded line range from sanitized output of one previously completed user-approved verification step for the connected Git Project. Folder Projects return an unavailable result. This tool cannot start, retry, or alter a process.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stepId: { type: 'string', description: 'Optional verification step ID.' },
        startLine: { type: 'integer', minimum: 1, default: 1 },
        endLine: { type: 'integer', minimum: 1 },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

/**
 * Add explicit identity semantics and optional read-only verification evidence
 * without changing the existing Git repository tool contract.
 */
export class RepositoryIdentityTools extends McpRepositoryTools {
  readonly #root: string;
  readonly #runner: McpGitRunner;
  readonly #verification: VerificationResultReader | undefined;

  constructor(options: RepositoryIdentityToolsOptions) {
    super(options);
    this.#root = options.root;
    this.#runner = options.runner;
    this.#verification = options.verification;
  }

  override get definitions(): readonly McpToolDefinition[] {
    const repositoryDefinitions = super.definitions.map((definition) =>
      definition.name === 'repository_summary'
        ? {
            ...definition,
            description:
              'Identify the actual VS Code Git Project currently connected through ReviewLume. ReviewLume is the connector name, not an expected repository name. Report the connected project neutrally and do not describe another repository name as a mismatch.',
          }
        : definition,
    );
    return this.#verification
      ? [...repositoryDefinitions, ...VERIFICATION_TOOL_DEFINITIONS]
      : repositoryDefinitions;
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (this.#verification && name === 'verification_status') {
      return this.#callVerification(() =>
        this.#verification!.getVerificationStatus(this.#root, this.#runner),
      );
    }
    if (this.#verification && name === 'read_verification_output') {
      return this.#callVerification(() =>
        this.#verification!.readVerificationOutput(this.#root, rawArguments, this.#runner),
      );
    }

    const result = await super.call(name, rawArguments, signal);
    return name === 'repository_summary' ? addRepositoryIdentityContext(result) : result;
  }

  async #callVerification(
    operation: () => Promise<Record<string, unknown>>,
  ): Promise<McpToolCallResult> {
    try {
      const structuredContent = await operation();
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
        isError: false,
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: error instanceof Error ? error.message : 'Verification evidence could not be read.',
        }],
        isError: true,
      };
    }
  }
}

/**
 * Keep the MCP tool contract stable across Git Project and Folder Project.
 *
 * ChatGPT may retain an approved snapshot of tool names and input schemas. If
 * ReviewLume changed the advertised contract whenever the user switched project
 * kind, that snapshot could become stale even though the tunnel still reached the
 * current local server. This wrapper therefore advertises one read-only superset
 * for both kinds and gates project-specific behavior at call time.
 */
export class StableProjectTools extends McpRepositoryTools {
  readonly #delegate: McpRepositoryTools;
  readonly #projectKind: ProjectKind;
  readonly #displayName: string;
  readonly #verificationAvailable: boolean;

  constructor(options: StableProjectToolsOptions) {
    super(options);
    this.#projectKind = options.projectKind;
    this.#displayName = options.displayName;
    this.#verificationAvailable = options.projectKind === 'git' && Boolean(options.verification);
    this.#delegate = options.projectKind === 'git'
      ? new RepositoryIdentityTools(options)
      : new McpFolderProjectTools({
          root: options.root,
          displayName: options.displayName,
          gitRunner: options.runner,
          maxResultBytes: options.maxResultBytes,
        });
  }

  override get definitions(): readonly McpToolDefinition[] {
    return STABLE_PROJECT_TOOL_DEFINITIONS;
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (name === 'project_summary') {
      if (this.#projectKind === 'folder') {
        const summary = await this.#delegate.call(name, rawArguments, signal);
        if (summary.isError || !summary.structuredContent) return summary;
        return projectSuccess({
          ...summary.structuredContent,
          capabilities: this.definitions.map((definition) => definition.name),
          nestedGitRepositoriesAvailable: true,
          localVerificationAvailable: false,
          historyNotice:
            'The Folder root has no aggregate Git history. Use list_git_repositories, then pass an explicit repository path to repository_summary, git_status, recent_commits, or get_diff. Never combine child repositories into synthetic Git history.',
        });
      }
      const summary = await this.#delegate.call('repository_summary', {}, signal);
      if (summary.isError || !summary.structuredContent) return summary;
      return projectSuccess({
        ...summary.structuredContent,
        capabilities: this.definitions.map((definition) => definition.name),
        nestedGitRepositoriesAvailable: false,
        localVerificationAvailable: this.#verificationAvailable,
        historyNotice:
          'This project root is already a Git Project. Git tools target it directly and the repository selector must be omitted.',
      });
    }

    if (name === 'list_git_repositories') {
      if (this.#projectKind === 'folder') {
        return this.#delegate.call(name, rawArguments, signal);
      }
      return projectSuccess({
        project: this.#displayName,
        projectKind: 'git',
        repositories: [],
        truncated: false,
        note:
          'The connected project root is already a Git Project. Use repository_summary, git_status, recent_commits, or get_diff directly without a repository selector.',
      });
    }

    if (name === 'verification_status' || name === 'read_verification_output') {
      if (this.#projectKind === 'folder') {
        return projectError('Local Verification is not available for a Folder Project.');
      }
      if (!this.#verificationAvailable) {
        return projectError('Local Verification evidence is not available for this Git Project connection.');
      }
      return this.#delegate.call(name, rawArguments, signal);
    }

    if (
      this.#projectKind === 'git' &&
      (name === 'repository_summary' ||
        name === 'git_status' ||
        name === 'recent_commits' ||
        name === 'get_diff')
    ) {
      const args = asArguments(rawArguments);
      if (typeof args.repository === 'string' && args.repository.trim()) {
        return projectError(
          'repository is only used for Folder Projects. Omit it for the connected Git Project.',
        );
      }
      const gitArguments = { ...args };
      delete gitArguments.repository;
      return this.#delegate.call(name, gitArguments, signal);
    }

    return this.#delegate.call(name, rawArguments, signal);
  }
}

export function addRepositoryIdentityContext(
  result: McpToolCallResult,
): McpToolCallResult {
  if (result.isError || !result.structuredContent) return result;

  const repository =
    typeof result.structuredContent.repository === 'string'
      ? result.structuredContent.repository
      : undefined;
  const structuredContent = {
    ...result.structuredContent,
    connector: 'ReviewLume',
    project: repository,
    projectKind: 'git',
    repositoryRole: 'current-connected-project',
    identityNotice:
      'ReviewLume is the connector name. The repository field identifies the current connected Git Project and may legitimately be any repository; do not describe a different repository name as a mismatch.',
  };
  return {
    ...result,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

/**
 * Wrap a best-effort observability callback so logging can never break an MCP tool call.
 * This matters during extension-host reloads, when the OutputChannel may already be disposed
 * while the tunnel is still draining an in-flight request.
 */
export function createSafeToolCallObserver(
  observer: (toolName: string) => void,
): (toolName: string) => void {
  return (toolName: string): void => {
    try {
      observer(toolName);
    } catch {
      // Observability must never alter the MCP protocol result.
    }
  };
}

/** Owns the MCP endpoint for the single project selected in VS Code. */
export class McpConnectorService {
  readonly #verification: LocalVerificationService | undefined;
  #server: McpConnectorServer | undefined;
  #connection: McpConnectionInfo | undefined;

  constructor(verification?: LocalVerificationService) {
    this.#verification = verification;
  }

  get connection(): McpConnectionInfo | undefined {
    return this.#connection;
  }

  async start(workspaceFolder: vscode.WorkspaceFolder): Promise<McpConnectionInfo> {
    if (!vscode.workspace.isTrusted) {
      throw new Error('ReviewLume MCP requires a trusted VS Code workspace.');
    }

    const runner = createReadOnlyGitRunner();
    const project = await resolveProjectContext(workspaceFolder.uri.fsPath, runner);

    // Local Verification keeps its existing repository-bound safety model. A
    // Folder Project never discovers or runs verification. The stable MCP
    // contract advertises the evidence tool names for both project kinds, but
    // Folder calls are rejected without starting any process.
    if (project.kind === 'git' && this.#verification) {
      try {
        await this.#verification.runOnConnect(workspaceFolder);
      } catch (error) {
        logWarn(
          `Local verification could not complete before connection: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (
      this.#connection?.projectRoot === project.root &&
      this.#connection.projectKind === project.kind
    ) {
      return this.#connection;
    }
    await this.stop();

    const configuredBytes = vscode.workspace
      .getConfiguration('reviewlume')
      .get<number>('mcp.maxToolResultBytes', 512 * 1024);
    const tools = new StableProjectTools({
      root: project.root,
      displayName: project.displayName,
      runner,
      projectKind: project.kind,
      maxResultBytes: configuredBytes,
      verification: this.#verification,
    });
    const server = new McpConnectorServer({
      tools,
      projectKind: project.kind,
      onToolCall: createSafeToolCallObserver((toolName) =>
        logInfo(`MCP tool invoked: ${toolName}`),
      ),
    });
    const address = await server.start();

    this.#server = server;
    this.#connection = {
      ...address,
      repository: project.displayName,
      repositoryRoot: project.root,
      project: project.displayName,
      projectRoot: project.root,
      projectKind: project.kind,
      authorizationHeader: `Bearer ${address.bearerToken}`,
      tunnelToken: address.bearerToken,
    };
    logInfo(
      `ReviewLume MCP connector started for ${project.displayName} (${project.kind}) on loopback port ${address.port}`,
    );
    return this.#connection;
  }

  async stop(): Promise<void> {
    const project = this.#connection?.project;
    await this.#server?.stop();
    this.#server = undefined;
    this.#connection = undefined;
    if (project) logInfo(`ReviewLume MCP connector stopped for ${project}`);
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}

function asArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function projectSuccess(value: Record<string, unknown>): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

function projectError(message: string): McpToolCallResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

const REPOSITORY_SELECTOR = {
  type: 'string',
  description:
    'For Folder Projects, the Folder-relative repository path returned by list_git_repositories. Omit for a directly connected Git Project.',
} as const;

export const STABLE_PROJECT_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'project_summary',
    title: 'Project summary',
    description:
      'Identify the connected ReviewLume Project, its kind, read-only capabilities, and whether Git or Local Verification context is available.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'list_git_repositories',
    title: 'List Git repositories',
    description:
      'For a Folder Project, discover bounded nested Git repositories inside the authorized root. For a directly connected Git Project, report that no nested selection is required.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'repository_summary',
    title: 'Repository summary',
    description:
      'Read identity, branch, HEAD, latest commit, and working-tree summary. Folder Projects require repository; directly connected Git Projects require it to be omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { repository: REPOSITORY_SELECTOR },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'git_status',
    title: 'Git status',
    description:
      'Read staged, unstaged, and untracked changes. Folder Projects require repository; directly connected Git Projects require it to be omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { repository: REPOSITORY_SELECTOR },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'recent_commits',
    title: 'Recent commits',
    description:
      'List recent commits for the selected repository. Folder Projects require repository; directly connected Git Projects require it to be omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: REPOSITORY_SELECTOR,
        count: { type: 'integer', minimum: 1, maximum: 30, default: 5 },
      },
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'get_diff',
    title: 'Read Git diff',
    description:
      'Read working-tree, staged, or commit-range changes. Folder Projects require repository; directly connected Git Projects require it to be omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: REPOSITORY_SELECTOR,
        scope: { type: 'string', enum: ['working', 'staged', 'range'], default: 'working' },
        baseRef: { type: 'string' },
        headRef: { type: 'string', default: 'HEAD' },
        path: { type: 'string', description: 'Optional path relative to the selected repository.' },
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
    title: 'List project files',
    description:
      'List bounded files inside the connected project root. Folder Projects use bounded filesystem enumeration; Git Projects preserve tracked/untracked repository semantics.',
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
      'Read a bounded line range from a regular text file inside the connected project root. Folder Projects additionally enforce their sensitive-path policy.',
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
      'Search bounded regular text files inside the connected project root for a literal, case-insensitive string.',
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
  ...VERIFICATION_TOOL_DEFINITIONS,
];
