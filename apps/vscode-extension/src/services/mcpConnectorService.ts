import * as path from 'node:path';
import * as vscode from 'vscode';
import { logInfo } from './logService';
import { McpConnectorServer, type McpConnectorAddress } from './mcpConnectorServer';
import { McpReadOnlyRepositoryTools } from './mcpReadOnlyRepositoryTools';
import type { McpGitRunner } from './mcpRepositoryTools';
import {
  McpWritableRepositoryTools,
  type McpWriteConfirmationRequest,
  type McpWriteDecision,
} from './mcpWritableRepositoryTools';

export type McpAccessMode = 'read-only' | 'confirmed-write';

export interface McpConnectionInfo extends McpConnectorAddress {
  readonly repository: string;
  readonly repositoryRoot: string;
  readonly accessMode: McpAccessMode;
  readonly authorizationHeader: string;
  /** Dedicated loopback header value used by OpenAI tunnel-client. */
  readonly tunnelToken: string;
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

    const writeAccess = vscode.workspace
      .getConfiguration('reviewlume', workspaceFolder.uri)
      .get<'disabled' | 'confirmEachRequest'>('mcp.writeAccess', 'disabled');
    const accessMode: McpAccessMode =
      writeAccess === 'confirmEachRequest' ? 'confirmed-write' : 'read-only';

    if (
      this.#connection?.repositoryRoot === root &&
      this.#connection.accessMode === accessMode
    ) {
      return this.#connection;
    }
    await this.stop();

    const repository = path.basename(root) || 'repository';
    const configuredBytes = vscode.workspace
      .getConfiguration('reviewlume', workspaceFolder.uri)
      .get<number>('mcp.maxToolResultBytes', 512 * 1024);
    const commonOptions = {
      root,
      displayName: repository,
      runner,
      maxResultBytes: configuredBytes,
    };
    const tools =
      accessMode === 'confirmed-write'
        ? new McpWritableRepositoryTools({
            ...commonOptions,
            confirmWrite: createWriteConfirmationHandler(repository),
          })
        : new McpReadOnlyRepositoryTools(commonOptions);
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
      accessMode,
      authorizationHeader: `Bearer ${address.bearerToken}`,
      tunnelToken: address.bearerToken,
    };
    logInfo(
      `ReviewLume MCP connector started for ${repository} in ${accessMode} mode on loopback port ${address.port}`,
    );
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

export function createWriteConfirmationHandler(
  repository: string,
): (request: McpWriteConfirmationRequest) => Promise<McpWriteDecision> {
  return async (request): Promise<McpWriteDecision> => {
    const dirtyBeforeConfirmation = findDirtyTargetFiles(request);
    if (dirtyBeforeConfirmation.length > 0) {
      return await rejectDirtyWrite(dirtyBeforeConfirmation);
    }

    const detail = [
      request.reason ? `Requested reason: ${request.reason}` : 'No reason was supplied by ChatGPT.',
      '',
      ...request.files.map(
        (file) =>
          `${file.action === 'create' ? 'Create' : 'Replace'} ${file.path} (${file.oldBytes} → ${file.newBytes} bytes)`,
      ),
      '',
      'ReviewLume will not delete files, run commands, modify .git, commit, or push. The resulting working-tree diff remains uncommitted.',
    ].join('\n');
    const selection = await vscode.window.showWarningMessage(
      `ChatGPT requests writing ${request.files.length} file${request.files.length === 1 ? '' : 's'} in ${repository}.`,
      { modal: true, detail },
      'Apply changes',
    );
    if (selection !== 'Apply changes') {
      return {
        approved: false,
        message: 'The user declined the VS Code write confirmation.',
      };
    }

    const dirtyAfterConfirmation = findDirtyTargetFiles(request);
    if (dirtyAfterConfirmation.length > 0) {
      return await rejectDirtyWrite(dirtyAfterConfirmation);
    }
    return { approved: true };
  };
}

function findDirtyTargetFiles(
  request: McpWriteConfirmationRequest,
): readonly McpWriteConfirmationRequest['files'][number][] {
  const dirtyDocuments = new Set(
    vscode.workspace.textDocuments
      .filter((document) => document.isDirty && document.uri.scheme === 'file')
      .map((document) => normalizeFsPathForComparison(document.uri.fsPath)),
  );
  return request.files.filter((file) =>
    dirtyDocuments.has(normalizeFsPathForComparison(file.absolutePath)),
  );
}

async function rejectDirtyWrite(
  dirtyFiles: readonly McpWriteConfirmationRequest['files'][number][],
): Promise<McpWriteDecision> {
  const paths = dirtyFiles.map((file) => file.path).join(', ');
  await vscode.window.showErrorMessage(
    `ReviewLume blocked the write because these files have unsaved editor changes: ${paths}. Save or revert them, then retry.`,
  );
  return {
    approved: false,
    message: 'Write blocked because one or more target files have unsaved VS Code changes.',
  };
}

function normalizeFsPathForComparison(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
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
