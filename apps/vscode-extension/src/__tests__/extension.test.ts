import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface PkgJson {
  name: string;
  activationEvents: string[];
  main: string;
  repository: { url: string };
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

// Extension activation is tested via @vscode/test-electron in later phases.
// These unit tests verify the package metadata and the packaged entry-point contract.

describe('reviewlume-vscode', () => {
  const pkgPath = path.resolve(__dirname, '../../package.json');

  function readPkg(): PkgJson {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PkgJson;
  }

  it('should have a valid package.json structure', () => {
    const content = readPkg();
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.activationEvents).toBeDefined();
    expect(content.main).toBe('dist/extension.js');
    expect(content.repository.url).toBe('https://github.com/cheng-corex/ReviewLume.git');
  });

  describe('commands', () => {
    const expectedCommands = [
      { command: 'reviewlume.hello', title: 'Hello' },
      { command: 'reviewlume.createReviewPack', title: 'Create Review Pack' },
      { command: 'reviewlume.openReviewHistory', title: 'Open Review History' },
      { command: 'reviewlume.importReviewResponse', title: 'Import Review Response' },
    ];

    for (const { command, title } of expectedCommands) {
      it(`should register command "${command}"`, () => {
        const content = readPkg();
        const cmd = content.contributes.commands.find((c) => c.command === command);
        expect(cmd).toBeDefined();
        expect(cmd!.title).toContain(title);
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
      it(`should have activation event for "${eventKey}"`, () => {
        const content = readPkg();
        expect(content.activationEvents).toContain(eventKey);
      });
    }
  });

  describe('views', () => {
    it('should have a view container in the activity bar', () => {
      const content = readPkg();
      const containers = content.contributes.viewsContainers?.activitybar;
      expect(containers).toBeDefined();
      const container = containers!.find((c) => c.id === 'reviewlume');
      expect(container).toBeDefined();
      expect(container!.title).toBe('ReviewLume');
      expect(container!.icon).toMatch(/^resources\/icon\.(png|svg)$/);
    });

    it('should have the main tree view under the reviewlume container', () => {
      const content = readPkg();
      const views = content.contributes.views?.['reviewlume'];
      expect(views).toBeDefined();
      const mainView = views!.find((v) => v.id === 'reviewlume.mainView');
      expect(mainView).toBeDefined();
      expect(mainView!.type).toBe('tree');
      expect(mainView!.name).toBe('ReviewLume');
    });
  });

  it('should keep the compiled entry point free of unpackaged workspace imports', () => {
    const compiledPath = path.resolve(__dirname, '../../dist/extension.js');
    const compiled = fs.readFileSync(compiledPath, 'utf-8');

    expect(compiled).not.toContain("require('@reviewlume/");
    expect(compiled).not.toContain('require("@reviewlume/');
  });

  it('should have a valid icon file at the declared path', () => {
    const content = readPkg();
    const iconRelPath = content.contributes.viewsContainers?.activitybar?.[0]?.icon;
    expect(iconRelPath).toBeDefined();
    const iconPath = path.resolve(__dirname, '../..', iconRelPath!);
    expect(fs.existsSync(iconPath)).toBe(true);
    const stat = fs.statSync(iconPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});
