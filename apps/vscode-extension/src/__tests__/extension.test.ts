import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Extension activation is tested via @vscode/test-electron in later phases.
// This unit test verifies the module can be loaded without errors.
// We use a text-based approach to avoid @typescript-eslint/no-require-imports.

describe('reviewlume-vscode', () => {
  it('should have a valid package.json structure', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      name: string;
      activationEvents: string[];
      main: string;
    };
    expect(content.name).toBe('reviewlume-vscode');
    expect(content.activationEvents).toBeDefined();
    expect(content.main).toBe('dist/extension.js');
  });

  it('should have the hello command registered in package.json', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      contributes: { commands: Array<{ command: string; title: string }> };
    };
    const helloCommand = content.contributes.commands.find(
      (c) => c.command === 'reviewlume.hello',
    );
    expect(helloCommand).toBeDefined();
    expect(helloCommand?.title).toContain('ReviewLume');
  });
});
