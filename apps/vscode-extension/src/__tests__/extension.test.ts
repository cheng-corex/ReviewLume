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

function listJavaScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

// Extension Host behavior is covered further by manual verification. These tests
// validate manifest contracts, activation wiring, and the packaged JS boundary.

describe('reviewlume-vscode manifest', () => {
  const pkgPath = path.resolve(__dirname, '../../package.json');

  function readPkg(): PkgJson {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgJson;
  }

  it('has a valid package.json structure', () => {
    const content = readPkg();
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.activationEvents).toBeDefined();
    expect(content.main).toBe('dist/extension.js');
    expect(content.repository.url).toBe('https://github.com/cheng-corex/ReviewLume.git');
  });

  it('declares limited Restricted Mode support before using Workspace Trust APIs', () => {
    const capability = readPkg().capabilities?.untrustedWorkspaces;
    expect(capability?.supported).toBe('limited');
    expect(capability?.description).toContain('Workspace Trust');
  });

  describe('commands', () => {
    const expectedCommands = [
      { command: 'reviewlume.hello', title: 'Hello' },
      { command: 'reviewlume.createReviewPack', title: 'Create Review Pack' },
      { command: 'reviewlume.openReviewHistory', title: 'Open Review History' },
      { command: 'reviewlume.importReviewResponse', title: 'Import Review Response' },
    ];

    for (const { command, title } of expectedCommands) {
      it(`registers command "${command}"`, () => {
        const content = readPkg();
        const commandContribution = content.contributes.commands.find(
          (candidate) => candidate.command === command,
        );
        expect(commandContribution).toBeDefined();
        expect(commandContribution!.title).toContain(title);
      });
    }
  });

  describe('activation events', () => {
    const requiredEvents: Array<{ key: string; prefix: 'onCommand' | 'onView' }> = [
      { key: 'reviewlume.hello', prefix: 'onCommand' },
      { key: 'reviewlume.createReviewPack', prefix: 'onCommand' },
      { key: 'reviewlume.openReviewHistory', prefix: 'onCommand' },
      { key: 'reviewlume.importReviewResponse', prefix: 'onCommand' },
      { key: 'reviewlume.mainView', prefix: 'onView' },
    ];

    for (const { key, prefix } of requiredEvents) {
      const eventKey = `${prefix}:${key}`;
      it(`has activation event for "${eventKey}"`, () => {
        expect(readPkg().activationEvents).toContain(eventKey);
      });
    }
  });

  describe('views', () => {
    it('has a view container in the activity bar', () => {
      const content = readPkg();
      const containers = content.contributes.viewsContainers?.activitybar;
      expect(containers).toBeDefined();
      const container = containers!.find((candidate) => candidate.id === VIEWS.CONTAINER);
      expect(container).toBeDefined();
      expect(container!.title).toBe('ReviewLume');
      expect(container!.icon).toMatch(/^resources\/icon\.(png|svg)$/);
    });

    it('has the main tree view under the ReviewLume container', () => {
      const views = readPkg().contributes.views?.[VIEWS.CONTAINER];
      expect(views).toBeDefined();
      const mainView = views!.find((candidate) => candidate.id === VIEWS.MAIN_VIEW);
      expect(mainView).toBeDefined();
      expect(mainView!.type).toBe('tree');
      expect(mainView!.name).toBe('ReviewLume');
    });
  });

  it('keeps every compiled module free of unpackaged workspace imports', () => {
    const distPath = path.resolve(__dirname, '../../dist');
    const compiledFiles = listJavaScriptFiles(distPath);
    expect(compiledFiles.length).toBeGreaterThan(0);

    for (const compiledFile of compiledFiles) {
      const compiled = fs.readFileSync(compiledFile, 'utf-8');
      expect(compiled, compiledFile).not.toContain("require('@reviewlume/");
      expect(compiled, compiledFile).not.toContain('require("@reviewlume/');
    }
  });

  it('has a non-empty icon file at the declared path', () => {
    const content = readPkg();
    const iconRelPath = content.contributes.viewsContainers?.activitybar?.[0]?.icon;
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

  it('registers all P1 commands and the Activity Bar tree view', () => {
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    activate(context);

    expect(testing.getRegisteredCommand(COMMANDS.HELLO)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.CREATE_REVIEW_PACK)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.OPEN_REVIEW_HISTORY)).toBeDefined();
    expect(testing.getRegisteredCommand(COMMANDS.IMPORT_REVIEW_RESPONSE)).toBeDefined();
    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      VIEWS.MAIN_VIEW,
      expect.objectContaining({ showCollapseAll: false }),
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
