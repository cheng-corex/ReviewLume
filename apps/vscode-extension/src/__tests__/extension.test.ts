import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Extension activation is tested via @vscode/test-electron in later phases.
// These unit tests verify the package metadata and the packaged entry-point contract.

describe('reviewlume-vscode', () => {
  it('should have a valid package.json structure', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      name: string;
      activationEvents: string[];
      main: string;
      repository: { url: string };
    };
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.activationEvents).toBeDefined();
    expect(content.main).toBe('dist/extension.js');
    expect(content.repository.url).toBe('https://github.com/cheng-corex/ReviewLume.git');
  });

  it('should have the hello command registered in package.json', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      contributes: { commands: Array<{ command: string; title: string }> };
    };
    const helloCommand = content.contributes.commands.find(
      (command) => command.command === 'reviewlume.hello',
    );
    expect(helloCommand).toBeDefined();
    expect(helloCommand?.title).toContain('ReviewLume');
  });

  it('should keep the compiled P0 entry point free of unpackaged workspace imports', () => {
    const compiledPath = path.resolve(__dirname, '../../dist/extension.js');
    const compiled = fs.readFileSync(compiledPath, 'utf-8');

    expect(compiled).not.toContain("require('@reviewlume/");
    expect(compiled).not.toContain('require("@reviewlume/');
  });
});
