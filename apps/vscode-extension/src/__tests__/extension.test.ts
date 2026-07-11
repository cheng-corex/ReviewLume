import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { activate } from '../extension';
import { COMMANDS, VIEWS } from '../constants';

interface PkgJson {
  name: string;
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
  const readPkg = (): PkgJson => JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgJson;

  it('has valid extension metadata and Restricted Mode support', () => {
    const content = readPkg();
    expect(content.name).toBe('reviewlume-vscode');
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
    { command: 'reviewlume.openReviewHistory', title: 'Open Review History' },
    { command: 'reviewlume.importReviewResponse', title: 'Import Review Response' },
  ];

  for (const { command, title } of expectedCommands) {
    it(`registers command and activation event for ${command}`, () => {
      const content = readPkg();
      expect(content.contributes.commands.find((item) => item.command === command)?.title).toContain(title);
      expect(content.activationEvents).toContain(`onCommand:${command}`);
    });
  }

  it('contributes the Activity Bar view', () => {
    const content = readPkg();
    expect(content.contributes.viewsContainers?.activitybar.find((item) => item.id === VIEWS.CONTAINER)?.title).toBe('ReviewLume');
    expect(content.contributes.views?.[VIEWS.CONTAINER]?.find((item) => item.id === VIEWS.MAIN_VIEW)).toMatchObject({ type: 'tree', name: 'ReviewLume' });
    expect(content.activationEvents).toContain(`onView:${VIEWS.MAIN_VIEW}`);
  });

  it('packages self-contained Git, scanner, and Review Pack runtimes', () => {
    const root = path.resolve(__dirname, '../../dist/vendor');
    const required = [
      path.join(root, 'git-context', 'index.js'),
      path.join(root, 'secret-scanner', 'index.js'),
      path.join(root, 'review-pack', 'index.js'),
    ];
    for (const file of required) expect(fs.existsSync(file), file).toBe(true);
    expect(fs.readFileSync(path.join(root, 'git-context', 'commandRunner.js'), 'utf8')).toContain('check-ignore');
    expect(fs.readFileSync(path.join(root, 'secret-scanner', 'index.js'), 'utf8')).toContain('HARD_BLOCK');
    expect(fs.readFileSync(path.join(root, 'review-pack', 'index.js'), 'utf8')).toContain('REVIEW_REQUEST.md');
  });

  it('keeps every packaged runtime module free of bare workspace imports', () => {
    const compiledFiles = listPackagedJavaScriptFiles(path.resolve(__dirname, '../../dist'));
    expect(compiledFiles.length).toBeGreaterThan(3);
    for (const compiledFile of compiledFiles) {
      const compiled = fs.readFileSync(compiledFile, 'utf-8');
      expect(compiled, compiledFile).not.toContain("require('@reviewlume/");
      expect(compiled, compiledFile).not.toContain('require("@reviewlume/');
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

  it('registers P5 entry points without loading security runtimes during activation', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    activate(context);

    for (const command of Object.values(COMMANDS)) {
      expect(testing.getRegisteredCommand(command), command).toBeDefined();
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
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('ReviewLume extension is active!');
  });
});
