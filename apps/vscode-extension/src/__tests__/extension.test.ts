import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { activate } from '../extension';
import { COMMANDS, VIEWS } from '../constants';

interface PkgJson {
  name: string;
  version: string;
  activationEvents: string[];
  main: string;
  repository: { url: string };
  capabilities?: {
    untrustedWorkspaces?: {
      supported: boolean | 'limited';
      description?: string;
    };
  };
  contributes: {
    commands: Array<{ command: string; title: string }>;
    configuration?: {
      properties?: Record<string, { scope?: string; type?: string }>;
    };
    viewsContainers?: {
      activitybar: Array<{ id: string; title: string; icon: string }>;
    };
    views?: {
      [containerId: string]: Array<{ type: string; id: string; name: string }>;
    };
  };
}

interface VscodeTesting {
  getRegisteredCommand(command: string): (() => unknown) | undefined;
  reset(): void;
}

const testing = (vscode as unknown as { __testing: VscodeTesting }).__testing;

const PUBLIC_COMMANDS = [
  COMMANDS.HELLO,
  COMMANDS.CREATE_REVIEW_PACK,
  COMMANDS.ADD_RELATED_FILES,
  COMMANDS.RECOMMEND_TEST_FILES,
  COMMANDS.SCAN_SELECTED_FILES,
  COMMANDS.EXPORT_REVIEW_PACK,
  COMMANDS.ADD_EXPORT_DIRECTORY_TO_GITIGNORE,
  COMMANDS.OPEN_REVIEW_HISTORY,
  COMMANDS.IMPORT_REVIEW_RESPONSE,
  COMMANDS.UPDATE_ISSUE_STATUS,
  COMMANDS.GENERATE_IMPLEMENTATION_PROMPT,
  COMMANDS.IMPORT_IMPLEMENTATION_SUMMARY,
  COMMANDS.GENERATE_RE_REVIEW_PROMPT,
  COMMANDS.IMPORT_RE_REVIEW_RESPONSE,
  COMMANDS.VIEW_RE_REVIEW_COMPARISON,
  COMMANDS.OPEN_REVIEW_PANEL,
  COMMANDS.MCP_CONNECTOR_MENU,
  COMMANDS.CONNECT_SECURE_MCP_TUNNEL,
  COMMANDS.CONFIGURE_SECURE_MCP_TUNNEL,
  COMMANDS.OPEN_SECURE_MCP_TUNNEL_UI,
  COMMANDS.START_MCP_CONNECTOR,
  COMMANDS.COPY_MCP_CONNECTION_INFO,
  COMMANDS.STOP_MCP_CONNECTOR,
] as const;

const LEGACY_BROWSER_COMMANDS = [
  COMMANDS.BROWSER_BRIDGE_MENU,
  COMMANDS.START_BROWSER_BRIDGE,
  COMMANDS.PAIR_BROWSER_EXTENSION,
  COMMANDS.REVOKE_BROWSER_SESSIONS,
  COMMANDS.SEND_PROMPT_TO_BROWSER,
] as const;

function listPackagedJavaScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === '__tests__') return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listPackagedJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

describe('reviewlume-vscode manifest', () => {
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const nlsPath = path.resolve(__dirname, '../../package.nls.json');
  const readPkg = (): PkgJson => JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgJson;
  const readNls = (): Record<string, string> =>
    JSON.parse(fs.readFileSync(nlsPath, 'utf-8')) as Record<string, string>;
  const resolveNls = (value: string): string => {
    const match = /^%(.+)%$/.exec(value);
    return match ? readNls()[match[1]] ?? value : value;
  };

  it('has valid extension metadata and Restricted Mode support', () => {
    const content = readPkg();
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.version).toBe('0.1.10');
    expect(content.main).toBe('dist/extension.js');
    expect(content.repository.url).toBe('https://github.com/cheng-corex/ReviewLume.git');
    expect(content.capabilities?.untrustedWorkspaces?.supported).toBe('limited');
  });

  const expectedCommands = [
    { command: 'reviewlume.hello', title: 'Hello' },
    { command: 'reviewlume.createReviewPack', title: 'Create Review Pack' },
    { command: 'reviewlume.addRelatedFiles', title: 'Add Related Files' },
    { command: 'reviewlume.recommendTestFiles', title: 'Recommend Test Files' },
    { command: 'reviewlume.scanSelectedFiles', title: 'Scan Selected Files' },
    { command: 'reviewlume.exportReviewPack', title: 'Export Review Pack' },
    {
      command: 'reviewlume.addExportDirectoryToGitignore',
      title: 'Add Export Directory to .gitignore',
    },
    { command: 'reviewlume.openReviewHistory', title: 'Open Review History' },
    { command: 'reviewlume.importReviewResponse', title: 'Import Review Response' },
    { command: 'reviewlume.updateIssueStatus', title: 'Update Issue Status' },
    { command: 'reviewlume.openReviewPanel', title: 'Open Review Panel' },
    { command: 'reviewlume.mcpConnectorMenu', title: 'Secure MCP Connector' },
    { command: 'reviewlume.connectSecureMcpTunnel', title: 'Connect Repository to ChatGPT' },
    {
      command: 'reviewlume.configureSecureMcpTunnel',
      title: 'Configure OpenAI Secure MCP Tunnel',
    },
    {
      command: 'reviewlume.openSecureMcpTunnelUi',
      title: 'Open Secure MCP Tunnel Diagnostics',
    },
    { command: 'reviewlume.startMcpConnector', title: 'Start Local Read-only MCP' },
    {
      command: 'reviewlume.copyMcpConnectionInfo',
      title: 'Copy Local MCP Connection Info',
    },
    { command: 'reviewlume.stopMcpConnector', title: 'Stop Secure MCP Connection' },
  ];

  for (const { command, title } of expectedCommands) {
    it(`registers command and activation event for ${command}`, () => {
      const content = readPkg();
      const manifestTitle = content.contributes.commands.find(
        (item) => item.command === command,
      )?.title;
      expect(manifestTitle).toBeDefined();
      expect(resolveNls(manifestTitle!)).toContain(title);
      expect(content.activationEvents).toContain(`onCommand:${command}`);
    });
  }

  it('keeps the tunnel-client path machine-local and does not define credential settings', () => {
    const properties = readPkg().contributes.configuration?.properties ?? {};
    expect(properties['reviewlume.mcp.tunnelClientPath']).toMatchObject({
      type: 'string',
      scope: 'machine',
    });
    expect(Object.keys(properties).some((key) => /api.?key|token|secret/i.test(key))).toBe(
      false,
    );
  });

  it('does not expose the superseded browser input bridge commands', () => {
    const content = readPkg();
    const contributed = new Set(content.contributes.commands.map((item) => item.command));
    for (const command of LEGACY_BROWSER_COMMANDS) {
      expect(contributed.has(command), command).toBe(false);
      expect(content.activationEvents).not.toContain(`onCommand:${command}`);
    }
  });

  it('contributes the Activity Bar view', () => {
    const content = readPkg();
    expect(
      content.contributes.viewsContainers?.activitybar.find(
        (item) => item.id === VIEWS.CONTAINER,
      )?.title,
    ).toBe('ReviewLume');
    expect(
      content.contributes.views?.[VIEWS.CONTAINER]?.find(
        (item) => item.id === VIEWS.MAIN_VIEW,
      ),
    ).toMatchObject({ type: 'tree', name: 'ReviewLume' });
    expect(content.activationEvents).toContain(`onView:${VIEWS.MAIN_VIEW}`);
  });

  it('includes English and Chinese NLS resources', () => {
    const english = readNls();
    const chinese = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.nls.zh-cn.json'), 'utf8'),
    ) as Record<string, string>;
    expect(english['command.openReviewPanel']).toContain('Open Review Panel');
    expect(chinese['command.openReviewPanel']).toContain('打开审核面板');
    expect(english['command.updateIssueStatus']).toContain('Update Issue Status');
    expect(chinese['command.updateIssueStatus']).toContain('更新问题状态');
    expect(english['command.connectSecureMcpTunnel']).toContain('ChatGPT');
    expect(chinese['command.connectSecureMcpTunnel']).toContain('ChatGPT');
  });

  it('packages self-contained Git, scanner, Review Pack, report parser, and Webview runtimes', () => {
    const root = path.resolve(__dirname, '../../dist/vendor');
    const required = [
      path.join(root, 'git-context', 'index.js'),
      path.join(root, 'secret-scanner', 'index.js'),
      path.join(root, 'review-pack', 'index.js'),
      path.resolve(__dirname, '../../dist/node_modules/@reviewlume/report-parser/index.js'),
    ];
    for (const file of required) expect(fs.existsSync(file), file).toBe(true);
    expect(fs.readFileSync(path.join(root, 'git-context', 'commandRunner.js'), 'utf8')).toContain(
      'check-ignore',
    );
    expect(fs.readFileSync(path.join(root, 'secret-scanner', 'index.js'), 'utf8')).toContain(
      'HARD_BLOCK',
    );
    expect(fs.readFileSync(path.join(root, 'review-pack', 'index.js'), 'utf8')).toContain(
      'REVIEW_REQUEST.md',
    );
    const mediaRoot = path.resolve(__dirname, '../../dist/webview/media');
    for (const file of ['reviewPanel.js', 'reviewPanel.css', 'reviewPanelTheme.css']) {
      expect(fs.existsSync(path.join(mediaRoot, file), file).toBe(true);
    }
  });

  it('keeps every packaged runtime module free of unresolved workspace imports', () => {
    const compiledFiles = listPackagedJavaScriptFiles(path.resolve(__dirname, '../../dist'));
    expect(compiledFiles.length).toBeGreaterThan(3);
    for (const compiledFile of compiledFiles) {
      const compiled = fs.readFileSync(compiledFile, 'utf-8');
      if (compiledFile.includes(path.join('node_modules', '@reviewlume', 'report-parser'))) {
        continue;
      }
      const workspaceImports = [
        ...compiled.matchAll(/require\(["'](@reviewlume\/[^"']+)["']\)/g),
      ].map((match) => match[1]);
      for (const dependency of workspaceImports) {
        expect(
          fs.existsSync(
            path.resolve(__dirname, '../../dist/node_modules', dependency, 'index.js'),
          ),
          `${compiledFile} requires packaged runtime ${dependency}`,
        ).toBe(true);
      }
    }
  });

  it('has a non-empty icon file', () => {
    const iconRelPath = readPkg().contributes.viewsContainers?.activitybar?.[0]?.icon;
    expect(iconRelPath).toBeDefined();
    expect(fs.statSync(path.resolve(__dirname, '../..', iconRelPath!)).size).toBeGreaterThan(0);
  });
});

describe('extension activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testing.reset();
  });

  it('registers the Secure MCP primary flow and Advanced review commands without the browser prototype', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    activate(context);

    for (const command of PUBLIC_COMMANDS) {
      expect(testing.getRegisteredCommand(command), command).toBeDefined();
    }
    for (const command of LEGACY_BROWSER_COMMANDS) {
      expect(testing.getRegisteredCommand(command), command).toBeUndefined();
    }
    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      VIEWS.MAIN_VIEW,
      expect.objectContaining({ showCollapseAll: true }),
    );
  });

  it('keeps the P0 verification command working', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    activate(context);
    testing.getRegisteredCommand(COMMANDS.HELLO)!();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'ReviewLume extension is active!',
    );
  });
});
