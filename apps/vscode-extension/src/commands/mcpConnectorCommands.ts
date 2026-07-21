import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { McpConnectorService, type McpConnectionInfo } from '../services/mcpConnectorService';
import { logInfo } from '../services/logService';

interface McpAction extends vscode.QuickPickItem {
  readonly action: 'start' | 'copy' | 'open-chatgpt' | 'stop' | 'logs';
}

interface WorkspaceFolderItem extends vscode.QuickPickItem {
  readonly folder: vscode.WorkspaceFolder;
}

export function registerMcpConnectorCommands(
  context: vscode.ExtensionContext,
  connector: McpConnectorService,
): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.name = 'ReviewLume MCP Connector';
  status.command = COMMANDS.MCP_CONNECTOR_MENU;
  status.show();
  context.subscriptions.push(status);

  const refreshStatus = (): void => {
    const connection = connector.connection;
    status.text = connection
      ? `$(plug) ReviewLume: ${connection.repository}`
      : '$(debug-disconnect) ReviewLume MCP';
    status.tooltip = connection
      ? `Read-only MCP is bound to ${connection.repository} on loopback port ${connection.port}. Click for actions.`
      : 'Connect ChatGPT to the current VS Code Git repository through ReviewLume read-only MCP.';
  };
  refreshStatus();

  const start = async (): Promise<McpConnectionInfo | undefined> => {
    const folder = await chooseWorkspaceFolder();
    if (!folder) return undefined;
    const connection = await connector.start(folder);
    refreshStatus();
    await vscode.window.showInformationMessage(
      `ReviewLume read-only MCP is ready for ${connection.repository}. ` +
        'Use Secure MCP Tunnel to connect this local endpoint to ChatGPT.',
      'Copy connection info',
    ).then(async (selection) => {
      if (selection === 'Copy connection info') await copyConnectionInfo(connection);
    });
    return connection;
  };

  const copy = async (): Promise<void> => {
    const connection = connector.connection ?? (await start());
    if (!connection) return;
    await copyConnectionInfo(connection);
    await vscode.window.showInformationMessage(
      'ReviewLume MCP connection information was copied. It contains a short-lived local bearer token; do not share it.',
    );
  };

  const stop = async (): Promise<void> => {
    await connector.stop();
    refreshStatus();
    await vscode.window.showInformationMessage('ReviewLume MCP connector stopped.');
  };

  const showMenu = async (): Promise<void> => {
    const connection = connector.connection;
    const actions: McpAction[] = [];
    if (!connection) {
      actions.push({
        label: '$(play) Start Read-only MCP',
        description: 'Bind one Git repository from the current VS Code workspace',
        action: 'start',
      });
    } else {
      actions.push({
        label: '$(clippy) Copy MCP Connection Info',
        description: `${connection.repository} · loopback port ${connection.port}`,
        action: 'copy',
      });
    }
    actions.push(
      {
        label: '$(globe) Open ChatGPT',
        description: 'Give instructions in ChatGPT after the MCP app is connected',
        action: 'open-chatgpt',
      },
      {
        label: '$(output) Show ReviewLume Logs',
        description: 'Shows tool names only; file contents and tokens are not logged',
        action: 'logs',
      },
    );
    if (connection) {
      actions.push({
        label: '$(close) Stop MCP Connector',
        description: 'Immediately invalidate the local endpoint and bearer token',
        action: 'stop',
      });
    }

    const selected = await vscode.window.showQuickPick(actions, {
      title: connection
        ? `ReviewLume Read-only MCP · ${connection.repository}`
        : 'ReviewLume Read-only MCP',
      placeHolder: 'Choose an MCP action',
    });
    if (!selected) return;

    switch (selected.action) {
      case 'start':
        await start();
        break;
      case 'copy':
        await copy();
        break;
      case 'open-chatgpt':
        await vscode.env.openExternal(vscode.Uri.parse('https://chatgpt.com/'));
        break;
      case 'logs':
        await vscode.commands.executeCommand('workbench.action.output.show', 'ReviewLume');
        break;
      case 'stop':
        await stop();
        break;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.MCP_CONNECTOR_MENU, showMenu),
    vscode.commands.registerCommand(COMMANDS.START_MCP_CONNECTOR, start),
    vscode.commands.registerCommand(COMMANDS.COPY_MCP_CONNECTION_INFO, copy),
    vscode.commands.registerCommand(COMMANDS.STOP_MCP_CONNECTOR, stop),
  );
}

async function chooseWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    await vscode.window.showErrorMessage('Open a folder inside a Git repository before starting ReviewLume MCP.');
    return undefined;
  }

  const activeFolder = vscode.window.activeTextEditor
    ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    : undefined;
  if (activeFolder) return activeFolder;
  if (folders.length === 1) return folders[0];

  const selected = await vscode.window.showQuickPick<WorkspaceFolderItem>(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    {
      title: 'Choose the repository to expose through ReviewLume MCP',
      placeHolder: 'One MCP connection is bound to one Git repository',
    },
  );
  return selected?.folder;
}

async function copyConnectionInfo(connection: McpConnectionInfo): Promise<void> {
  const value = JSON.stringify(
    {
      name: 'ReviewLume Read-only Repository',
      transport: 'streamable-http',
      endpoint: connection.endpointUrl,
      authorization: connection.authorizationHeader,
      repository: connection.repository,
      access: 'read-only',
      note: 'Forward this loopback endpoint through OpenAI Secure MCP Tunnel; never expose it directly to the public internet.',
    },
    null,
    2,
  );
  await vscode.env.clipboard.writeText(value);
  logInfo(`MCP connection information copied for ${connection.repository}; bearer token omitted from logs`);
}
