import * as path from 'node:path';
import * as vscode from 'vscode';
import { logInfo } from './logService';
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
}

/**
 * Add explicit identity semantics without changing the existing repository field.
 *
 * ReviewLume is the connector product. The repository field is the actual project
 * currently selected in VS Code and is not expected to be named ReviewLume.
 */
class RepositoryIdentityTools extends McpRepositoryTools {
  constructor(options: RepositoryIdentityToolsOptions) {
    super(options);
  }

  override get definitions(): readonly McpToolDefinition[] {
    return super.definitions.map((definition) =>
      definition.name === 'repository_summary'
        ? {
            ...definition,
            description:
              'Identify the actual VS Code project currently connected through ReviewLume. ReviewLume is the connector name, not an expected repository name. Report the connected project neutrally and do not describe another repository name as a mismatch.',
          }
        : definition,
    );
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const result = await super.call(name, rawArguments, signal);
    return name === 'repository_summary' ? addRepositoryIdentityContext(result) : result;
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
  #server: McpConnectorServer | undefined;
  #connection: McpConnectionInfo | undefined;

  get connection(): McpConnectionInfo | undefined {
    return this.#connection;
  }

  async start(workspaceFolder: vscode.WorkspaceFolder): Promise<McpConnectionInfo> {
    if (!vscode.workspace.isTrusted) {
      throw new Error('ReviewLume MCP requires a trusted VS Code workspace.');
    }

    const runner = createGitRunner();
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

function createGitRunner(): McpGitRunner {
  type GitContextRuntime = typeof import('../../../../packages/git-context/dist/index.js');
  try {
    // Packaged VSIX runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const runtime = require('../vendor/git-context/index.js') as GitContextRuntime;
    return new runtime.GitCommandRunner();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'MODULE_NOT_FOUND') throw error;
    // Workspace test/development runtime before the vendor build has run.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const runtime = require('../../../../packages/git-context/src/index') as GitContextRuntime;
    return new runtime.GitCommandRunner();
  }
}
