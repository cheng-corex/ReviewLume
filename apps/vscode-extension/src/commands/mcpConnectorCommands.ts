import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { McpConnectorService, type McpConnectionInfo } from '../services/mcpConnectorService';
import { logError, logInfo } from '../services/logService';
import {
  CHATGPT_CONNECTORS_URL,
  OPENAI_RUNTIME_KEYS_URL,
  OPENAI_TUNNEL_CLIENT_RELEASE_URL,
  OPENAI_TUNNELS_URL,
  SecureMcpTunnelService,
  isValidTunnelId,
} from '../services/secureMcpTunnelService';

interface McpAction extends vscode.QuickPickItem {
  readonly action:
    | 'connect'
    | 'configure'
    | 'copy'
    | 'open-chatgpt-connectors'
    | 'open-tunnel-ui'
    | 'open-openai-tunnels'
    | 'open-tunnel-client-release'
    | 'stop'
    | 'logs';
}

interface WorkspaceFolderItem extends vscode.QuickPickItem {
  readonly folder: vscode.WorkspaceFolder;
}

export function registerMcpConnectorCommands(
  context: vscode.ExtensionContext,
  connector: McpConnectorService,
  secureTunnel: SecureMcpTunnelService,
): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.name = 'ReviewLume MCP Connector';
  status.command = COMMANDS.MCP_CONNECTOR_MENU;
  status.show();
  context.subscriptions.push(status, secureTunnel.onDidChange(refreshStatus));

  function refreshStatus(): void {
    const connection = connector.connection;
    const tunnelState = secureTunnel.state;
    if (tunnelState.status === 'ready' && connection) {
      status.text = `$(radio-tower) ReviewLume: ${connection.repository}`;
      status.tooltip =
        `Secure MCP Tunnel is ready for ${connection.repository}. ` +
        `Tunnel ${tunnelState.tunnelId ?? 'connected'}. Click for actions.`;
      return;
    }
    if (tunnelState.status === 'starting') {
      status.text = '$(sync~spin) ReviewLume Tunnel';
      status.tooltip = 'OpenAI Secure MCP Tunnel is starting and running readiness checks.';
      return;
    }
    if (tunnelState.status === 'failed') {
      status.text = '$(warning) ReviewLume Tunnel';
      status.tooltip = 'Secure MCP Tunnel failed. Click to view actions and logs.';
      return;
    }
    if (connection) {
      status.text = `$(plug) ReviewLume: ${connection.repository}`;
      status.tooltip =
        `Local read-only MCP is bound to ${connection.repository} on loopback port ${connection.port}; ` +
        'the Secure MCP Tunnel is not running.';
      return;
    }
    status.text = '$(debug-disconnect) ReviewLume MCP';
    status.tooltip =
      'Connect ChatGPT to the current VS Code Git repository through ReviewLume read-only MCP.';
  }
  refreshStatus();

  const configure = async (replaceExisting = false): Promise<boolean> => {
    const configurationStatus = await secureTunnel.getConfigurationStatus();
    let binaryPath = await secureTunnel.discoverBinary();
    if (!binaryPath || replaceExisting) {
      const selected = await vscode.window.showWarningMessage(
        'ReviewLume requires the official OpenAI tunnel-client executable. ' +
          'Download it only from the openai/tunnel-client GitHub releases page, then select the executable.',
        'Choose executable',
        'Open official releases',
      );
      if (selected === 'Open official releases') {
        await openExternal(OPENAI_TUNNEL_CLIENT_RELEASE_URL);
        return false;
      }
      if (selected !== 'Choose executable') return false;
      const picked = await vscode.window.showOpenDialog({
        title: 'Choose the official OpenAI tunnel-client executable',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Use tunnel-client',
      });
      binaryPath = picked?.[0]?.fsPath;
      if (!binaryPath) return false;
    }

    let tunnelId = replaceExisting ? undefined : configurationStatus.tunnelId;
    if (!tunnelId) {
      const action = await vscode.window.showInformationMessage(
        'Create or select a tunnel in the OpenAI Platform, then paste its tunnel ID into ReviewLume.',
        'Enter Tunnel ID',
        'Open OpenAI Tunnels',
      );
      if (action === 'Open OpenAI Tunnels') {
        await openExternal(OPENAI_TUNNELS_URL);
        return false;
      }
      if (action !== 'Enter Tunnel ID') return false;
      tunnelId = await vscode.window.showInputBox({
        title: 'ReviewLume Secure MCP Tunnel',
        prompt: 'Paste the OpenAI tunnel ID. It starts with tunnel_.',
        placeHolder: 'tunnel_0123456789abcdef0123456789abcdef',
        ignoreFocusOut: true,
        validateInput: (value) =>
          isValidTunnelId(value)
            ? undefined
            : 'Tunnel ID must be tunnel_ followed by 32 lowercase hexadecimal characters.',
      });
      if (!tunnelId) return false;
    }

    let runtimeApiKey: string | undefined;
    if (!configurationStatus.hasRuntimeApiKey || replaceExisting) {
      const action = await vscode.window.showWarningMessage(
        'Create a least-privilege Runtime API key for this tunnel. Do not paste an admin key.',
        'Enter Runtime Key',
        'Open Runtime API Keys',
      );
      if (action === 'Open Runtime API Keys') {
        await openExternal(OPENAI_RUNTIME_KEYS_URL);
        return false;
      }
      if (action !== 'Enter Runtime Key') return false;
      runtimeApiKey = await vscode.window.showInputBox({
        title: 'ReviewLume Secure MCP Tunnel',
        prompt: 'Paste the OpenAI Runtime API key. It is stored only in VS Code SecretStorage.',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) =>
          value.trim().length >= 10 ? undefined : 'A Runtime API key is required.',
      });
      if (!runtimeApiKey) return false;
    } else {
      runtimeApiKey = await context.secrets.get('reviewlume.secureMcpTunnel.runtimeApiKey');
      if (!runtimeApiKey) return false;
    }

    await secureTunnel.saveConfiguration({ binaryPath, tunnelId, runtimeApiKey });
    await vscode.window.showInformationMessage(
      'ReviewLume Secure MCP Tunnel configuration saved. The Runtime API key remains in VS Code SecretStorage.',
    );
    return true;
  };

  const startLocal = async (): Promise<McpConnectionInfo | undefined> => {
    const folder = await chooseWorkspaceFolder();
    if (!folder) return undefined;
    const connection = await connector.start(folder);
    refreshStatus();
    return connection;
  };

  const connect = async (): Promise<void> => {
    let configurationStatus = await secureTunnel.getConfigurationStatus();
    let binaryPath = await secureTunnel.discoverBinary();
    if (!binaryPath || !configurationStatus.tunnelId || !configurationStatus.hasRuntimeApiKey) {
      const configured = await configure(false);
      if (!configured) return;
      configurationStatus = await secureTunnel.getConfigurationStatus();
      binaryPath = await secureTunnel.discoverBinary();
    }
    if (!binaryPath || !configurationStatus.tunnelId || !configurationStatus.hasRuntimeApiKey) {
      throw new Error('Secure MCP Tunnel configuration is incomplete.');
    }

    const connection = await startLocal();
    if (!connection) return;
    const tunnelState = await secureTunnel.start(connection);
    refreshStatus();
    await vscode.env.clipboard.writeText(tunnelState.tunnelId ?? configurationStatus.tunnelId);
    await openExternal(CHATGPT_CONNECTORS_URL);
    await vscode.window.showInformationMessage(
      `ReviewLume is connected through OpenAI Secure MCP Tunnel for ${connection.repository}. ` +
        'The tunnel ID was copied. In ChatGPT, add a custom connector, choose Connection: Tunnel, and paste the ID.',
      'Open tunnel diagnostics',
    ).then(async (selection) => {
      if (selection === 'Open tunnel diagnostics' && tunnelState.uiUrl) {
        await openExternal(tunnelState.uiUrl);
      }
    });
  };

  const copy = async (): Promise<void> => {
    const connection = connector.connection ?? (await startLocal());
    if (!connection) return;
    await copyConnectionInfo(connection);
    await vscode.window.showInformationMessage(
      'Local MCP debugging information was copied. It contains a short-lived loopback token; do not share it.',
    );
  };

  const stop = async (): Promise<void> => {
    await secureTunnel.stop();
    await connector.stop();
    refreshStatus();
    await vscode.window.showInformationMessage(
      'ReviewLume Secure MCP Tunnel and local MCP connector stopped.',
    );
  };

  const openTunnelUi = async (): Promise<void> => {
    const uiUrl = secureTunnel.state.uiUrl;
    if (!uiUrl) {
      await vscode.window.showWarningMessage('The Secure MCP Tunnel is not ready.');
      return;
    }
    await openExternal(uiUrl);
  };

  const showMenu = async (): Promise<void> => {
    const connection = connector.connection;
    const tunnelState = secureTunnel.state;
    const actions: McpAction[] = [
      {
        label: tunnelState.status === 'ready'
          ? '$(check) Open ChatGPT Connectors'
          : '$(radio-tower) Connect Current Repository to ChatGPT',
        description: tunnelState.status === 'ready'
          ? `${connection?.repository ?? 'Repository'} · tunnel ready`
          : 'Start local read-only MCP and the official OpenAI Secure MCP Tunnel',
        action: tunnelState.status === 'ready' ? 'open-chatgpt-connectors' : 'connect',
      },
      {
        label: '$(gear) Configure Secure MCP Tunnel',
        description: 'Official tunnel-client, Tunnel ID, and Runtime API key',
        action: 'configure',
      },
    ];
    if (tunnelState.status === 'ready' && tunnelState.uiUrl) {
      actions.push({
        label: '$(pulse) Open Tunnel Diagnostics',
        description: 'Open the loopback-only tunnel-client health UI',
        action: 'open-tunnel-ui',
      });
    }
    actions.push(
      {
        label: '$(key) Open OpenAI Tunnels',
        description: 'Create or inspect the OpenAI tunnel and Runtime API key',
        action: 'open-openai-tunnels',
      },
      {
        label: '$(cloud-download) Open Official tunnel-client Release',
        description: 'Download only from the official OpenAI GitHub repository',
        action: 'open-tunnel-client-release',
      },
      {
        label: '$(clippy) Copy Local MCP Info (Advanced)',
        description: connection
          ? `${connection.repository} · loopback port ${connection.port}`
          : 'Start local MCP and copy short-lived debugging credentials',
        action: 'copy',
      },
      {
        label: '$(output) Show ReviewLume Logs',
        description: 'Secrets, file contents, and raw HTTP payloads are not logged',
        action: 'logs',
      },
    );
    if (connection || tunnelState.status !== 'stopped') {
      actions.push({
        label: '$(close) Stop Secure MCP Connection',
        description: 'Stop tunnel and local MCP; invalidate the local token',
        action: 'stop',
      });
    }

    const selected = await vscode.window.showQuickPick(actions, {
      title: connection
        ? `ReviewLume Secure MCP · ${connection.repository}`
        : 'ReviewLume Secure MCP',
      placeHolder: 'Choose an MCP action',
    });
    if (!selected) return;

    switch (selected.action) {
      case 'connect':
        await connect();
        break;
      case 'configure':
        await configure(true);
        break;
      case 'copy':
        await copy();
        break;
      case 'open-chatgpt-connectors':
        await openExternal(CHATGPT_CONNECTORS_URL);
        break;
      case 'open-tunnel-ui':
        await openTunnelUi();
        break;
      case 'open-openai-tunnels':
        await openExternal(OPENAI_TUNNELS_URL);
        break;
      case 'open-tunnel-client-release':
        await openExternal(OPENAI_TUNNEL_CLIENT_RELEASE_URL);
        break;
      case 'logs':
        await vscode.commands.executeCommand('workbench.action.output.show', 'ReviewLume');
        break;
      case 'stop':
        await stop();
        break;
    }
  };

  const safely = (operation: () => Promise<unknown>) => async (): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ReviewLume Secure MCP operation failed.';
      logError('ReviewLume Secure MCP operation failed', error instanceof Error ? error : undefined);
      await vscode.window.showErrorMessage(message);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.MCP_CONNECTOR_MENU, safely(showMenu)),
    vscode.commands.registerCommand(COMMANDS.CONNECT_SECURE_MCP_TUNNEL, safely(connect)),
    vscode.commands.registerCommand(
      COMMANDS.CONFIGURE_SECURE_MCP_TUNNEL,
      safely(() => configure(true)),
    ),
    vscode.commands.registerCommand(COMMANDS.OPEN_SECURE_MCP_TUNNEL_UI, safely(openTunnelUi)),
    vscode.commands.registerCommand(COMMANDS.START_MCP_CONNECTOR, safely(startLocal)),
    vscode.commands.registerCommand(COMMANDS.COPY_MCP_CONNECTION_INFO, safely(copy)),
    vscode.commands.registerCommand(COMMANDS.STOP_MCP_CONNECTOR, safely(stop)),
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
      note: 'For local debugging only. The normal ChatGPT flow uses the official OpenAI Secure MCP Tunnel.',
    },
    null,
    2,
  );
  await vscode.env.clipboard.writeText(value);
  logInfo(`Local MCP debugging information copied for ${connection.repository}; token omitted from logs`);
}

async function openExternal(value: string): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(value));
  if (!opened) throw new Error(`Could not open ${value}`);
}
