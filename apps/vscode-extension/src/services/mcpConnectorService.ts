import * as path from 'node:path';
import * as vscode from 'vscode';
import { createReadOnlyGitRunner } from './gitRuntime';
import type { LocalVerificationService, VerificationResultReader } from './localVerificationService';
import { logInfo, logWarn } from './logService';
import { McpConnectorServer, type McpConnectorAddress } from './mcpConnectorServer';
import {
  McpRepositoryTools,
  type McpGitRunner,
  type McpToolCallResult,
  type McpToolDefinition,
} from './mcpRepositoryTools';

export interface McpConnectionInfo extends McpConnectorAddress {
  readonly repository: string;
  readonly repositoryRoot: string;
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
      'Read the latest user-approved local verification result for the connected repository, including whether it still matches the current HEAD and working tree. This tool cannot start a process.',
    inputSchema: { type: 'object', additionalProperties: false },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'read_verification_output',
    title: 'Read local verification output',
    description:
      'Read a bounded line range from the sanitized output of one previously completed user-approved verification step. This tool cannot start, retry, or alter a process.',
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
 * without changing the existing repository field or exposing process execution.
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
              'Identify the actual VS Code project currently connected through ReviewLume. ReviewLume is the connector name, not an expected repository name. Report the connected project neutrally and do not describe another repository name as a mismatch.',
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

export function addRepositoryIdentityContext(
  result: McpToolCallResult,
): McpToolCallResult {
  if (result.isError || !result.structuredContent) return result;

  const structuredContent = {
    ...result.structuredContent,
    connector: 'ReviewLume',
    repositoryRole: 'current-connected-project',
    identityNotice:
      'ReviewLume is the connector name. The repository field identifies the current connected project and may legitimately be any repository; do not describe a different repository name as a mismatch.',
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

/** Owns the MCP endpoint for the repository selected in VS Code. */
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

    if (this.#verification) {
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

    const runner = createReadOnlyGitRunner();
    const root = (
      await runner.run({
        cwd: workspaceFolder.uri.fsPath,
        args: ['rev-parse', '--show-toplevel'],
      })
    ).stdout.trim();
    if (!root) throw new Error('The selected workspace folder is not inside a Git repository.');

    if (this.#connection?.repositoryRoot === root) return this.#connection;
    await this.stop();

    const repository = path.basename(root) || 'repository';
    const configuredBytes = vscode.workspace
      .getConfiguration('reviewlume')
      .get<number>('mcp.maxToolResultBytes', 512 * 1024);
    const tools = new RepositoryIdentityTools({
      root,
      displayName: repository,
      runner,
      maxResultBytes: configuredBytes,
      verification: this.#verification,
    });
    const server = new McpConnectorServer({
      tools,
      onToolCall: createSafeToolCallObserver((toolName) =>
        logInfo(`MCP tool invoked: ${toolName}`),
      ),
    });
    const address = await server.start();

    this.#server = server;
    this.#connection = {
      ...address,
      repository,
      repositoryRoot: root,
      authorizationHeader: `Bearer ${address.bearerToken}`,
      tunnelToken: address.bearerToken,
    };
    logInfo(`ReviewLume MCP connector started for ${repository} on loopback port ${address.port}`);
    return this.#connection;
  }

  async stop(): Promise<void> {
    const repository = this.#connection?.repository;
    await this.#server?.stop();
    this.#server = undefined;
    this.#connection = undefined;
    if (repository) logInfo(`ReviewLume MCP connector stopped for ${repository}`);
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
