import * as path from 'node:path';
import * as vscode from 'vscode';
import { logInfo } from './logService';
import { McpConnectorServer, type McpConnectorAddress } from './mcpConnectorServer';
import { McpRepositoryTools, type McpGitRunner } from './mcpRepositoryTools';

export interface McpConnectionInfo extends McpConnectorAddress {
  readonly repository: string;
  readonly repositoryRoot: string;
  readonly authorizationHeader: string;
}

/** Owns the read-only MCP endpoint for the repository selected in VS Code. */
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
    const tools = new McpRepositoryTools({
      root,
      displayName: repository,
      runner,
      maxResultBytes: configuredBytes,
    });
    const server = new McpConnectorServer({
      tools,
      onToolCall: (toolName) => logInfo(`MCP read-only tool invoked: ${toolName}`),
    });
    const address = await server.start();

    this.#server = server;
    this.#connection = {
      ...address,
      repository,
      repositoryRoot: root,
      authorizationHeader: `Bearer ${address.bearerToken}`,
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
