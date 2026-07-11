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
    if (entry.isDirectory() && entry.name === '__tests__') {
      return [];
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listPackagedJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

describe('reviewlume-vscode manifest', () => {
  const pkgPath = path.resolve(__dirname, '../../package.json');

  function readPkg(): PkgJson {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgJson;
  }

  it('has valid extension metadata', () => {
    const content = readPkg();
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.activationEvents).toBeDefined();
    expect(content.main).toBe('dist/extension.js');
    expect(content.repository.url).toBe('https://github.com/cheng-corex/ReviewLume.git');
  });

  it('declares limited Restricted Mode support', () => {
    const capability = readPkg().capabilities?.untrustedWorkspaces;
    expect(capability?.supported).toBe('limited');
    expect(capability?.description).toContain('Workspace Trust');
  });

  describe('commands', () => {
    const expectedCommands = [
      { command: 'reviewlume.hello', title: 'Hello' },
      { command: 'reviewlume.createReviewPack', title: 'Create Review Pack' },
      { command: 'reviewlume.addRelatedFiles', title: 'Add Related Files' },
      { command: 'reviewlume.recommendTestFiles', title: 'Recommend Test Files' },
      { command: 'reviewlume.openReviewHistory', title: 'Open Review History' },
      { command: 'reviewlume.importReviewResponse', title: 'Import Review Response' },
    ];

    for (const { command, title } of expectedCommands) {
      it(`registers command "${command}"`, () => {
        const contribution = readPkg().contributes.commands.find(
          (candidate) => candidate.command === command,
        );
        expect(contribution).toBeDefined();
        expect(contribution!.title).toContain(title);
      });
    }
  });

  describe('activation events', () => {
    const requiredEvents: Array<{ key: string; prefix: 'onCommand' | 'onView' }> = [
      { key: 'reviewlume.hello', prefix: 'onCommand' },
      { key: 'reviewlume.createReviewPack', prefix: 'onCommand' },
      { key: 'reviewlume.addRelatedFiles', prefix: 'onCommand' },
      { key: 'reviewlume.recommendTestFiles', prefix: 'onCommand' },
      { key: 'reviewlume.openReviewHistory', prefix: 'onCommand' },
      { key: 'reviewlume.importReviewResponse', prefix: 'onCommand' },
      { key: 'reviewlume.mainView', prefix: 'onView' },
    ];

    for (const { key, prefix } of requiredEvents) {
      it(`has activation event for "${prefix}:${key}"`, () => {
        expect(readPkg().activationEvents).toContain(`${prefix}:${key}`);
      });
    }
  });

  it('contributes the Activity Bar view', () => {
    const content = readPkg();
    const container = content.contributes.viewsContainers?.activitybar.find(
      (candidate) => candidate.id === VIEWS.CONTAINER,
    );
    expect(container?.title).toBe('ReviewLume');
    expect(container?.icon).toMatch(/^resources\/icon\.(png|svg)$/);

    const mainView = content.contributes.views?.[VIEWS.CONTAINER]?.find(
      (candidate) => candidate.id === VIEWS.MAIN_VIEW,
    );
    expect(mainView).toMatchObject({ type: 'tree', name: 'ReviewLume' });
  });

  it('packages a self-contained CommonJS Git context runtime', () => {
    const extensionRoot = path.resolve(__dirname, '../..');
    const vendorRoot = path.join(extensionRoot, 'dist', 'vendor', 'git-context');
    const vendorEntry = path.join(vendorRoot, 'index.js');
    const commandRunnerModule = path.join(vendorRoot, 'commandRunner.js');
    expect(fs.existsSync(vendorEntry)).toBe(true);
    expect(fs.existsSync(commandRunnerModule)).toBe(true);

    const entrySource = fs.readFileSync(vendorEntry, 'utf-8');
    const commandRunnerSource = fs.readFileSync(commandRunnerModule, 'utf-8');
    expect(entrySource).toContain('GitCommandRunner');
    expect(commandRunnerSource).toContain('check-ignore');
    expect(entrySource).not.toContain("require('@reviewlume/");
    expect(entrySource).not.toContain('require("@reviewlume/');
  });

  it('keeps every packaged runtime module free of bare workspace imports', () => {
    const distPath = path.resolve(__dirname, '../../dist');
    const compiledFiles = listPackagedJavaScriptFiles(distPath);
    expect(compiledFiles.length).toBeGreaterThan(1);

    for (const compiledFile of compiledFiles) {
      const compiled = fs.readFileSync(compiledFile, 'utf-8');
      expect(compiled, compiledFile).not.toContain("require('@reviewlume/");
      expect(compiled, compiledFile).not.toContain('require("@reviewlume/');
    }
  });

  it('has a non-empty icon file', () => {
    const iconRelPath = readPkg().contributes.viewsContainers?.activitybar?.[0]?.icon;
    expect(iconRelPath).toBeDefined();
    const iconPath = path.resolve(__dirname, '../..', iconRelPath!);
    expect(fs.existsSync(iconPath)).toBe(true);
    expect(fs.statSync(iconPath).size).toBeGreaterThan(0);
  });
});

describe('extension activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testing.reset();
  });

  it('registers P3 entry points without spawning Git during activation', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    activate(context);

    expect(testing.getRegisteredCommand(COMMANDS.HELLO)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.ADD_RELATED_FILES)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.RECOMMEND_TEST_FILES)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.OPEN_REVIEW_HISTORY)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.IMPORT_REVIEW_RESPONSE)).toBeDefined();
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
