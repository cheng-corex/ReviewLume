import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpRepositoryTools, type McpGitRunner } from './mcpRepositoryTools';

class FakeRunner implements McpGitRunner {
  readonly calls: string[][] = [];

  async run(options: { readonly args: readonly string[] }): Promise<{ readonly stdout: string }> {
    this.calls.push([...options.args]);
    if (options.args[0] === 'ls-files') {
      return { stdout: ['src/example.ts', 'src/example.test.ts', '.env', ''].join('\0') };
    }
    if (options.args[0] === 'diff' && options.args.includes('--name-only')) {
      return { stdout: ['src/example.ts', '.env', ''].join('\0') };
    }
    if (options.args[0] === 'diff') {
      const requestedPath = options.args[options.args.length - 1];
      if (requestedPath === '.env') return { stdout: 'SECRET=do-not-return\n' };
      return { stdout: 'diff --git a/src/example.ts b/src/example.ts\n+export const value = 1;\n' };
    }
    if (options.args[0] === 'status') return { stdout: '## main\n M src/example.ts\n' };
    if (options.args[0] === 'log') {
      return { stdout: '0123456789012345678901234567890123456789\tDev\t2026-07-21T00:00:00Z\tTest' };
    }
    if (options.args[0] === 'rev-parse' && options.args.includes('--abbrev-ref')) {
      return { stdout: 'main\n' };
    }
    if (options.args[0] === 'rev-parse') {
      return { stdout: '0123456789012345678901234567890123456789\n' };
    }
    if (options.args[0] === 'remote') return { stdout: 'https://user:secret@example.com/acme/repo.git\n' };
    throw new Error(`Unexpected Git call: ${options.args.join(' ')}`);
  }
}

describe('McpRepositoryTools', () => {
  let root: string;
  let runner: FakeRunner;
  let tools: McpRepositoryTools;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-mcp-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'example.ts'), 'export const value = 1;\nexport const other = value + 1;\n');
    await writeFile(path.join(root, 'src', 'example.test.ts'), 'expect(value).toBe(1);\n');
    await writeFile(path.join(root, '.env'), 'SECRET=do-not-read\n');
    runner = new FakeRunner();
    tools = new McpRepositoryTools({ root, displayName: 'fixture', runner });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('declares every MCP tool as read-only and non-destructive', () => {
    expect(tools.definitions.length).toBeGreaterThan(0);
    for (const definition of tools.definitions) {
      expect(definition.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it('reads only the requested bounded line range', async () => {
    const result = await tools.call('read_file', {
      path: 'src/example.ts',
      startLine: 2,
      endLine: 2,
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      path: 'src/example.ts',
      startLine: 2,
      endLine: 2,
      content: '2: export const other = value + 1;',
    });
  });

  it('blocks sensitive files and repository escapes', async () => {
    const sensitive = await tools.call('read_file', { path: '.env' });
    const escaped = await tools.call('read_file', { path: '../outside.txt' });

    expect(sensitive.isError).toBe(true);
    expect(sensitive.content[0].text).toContain('Sensitive files are blocked');
    expect(escaped.isError).toBe(true);
    expect(escaped.content[0].text).toContain('outside the repository');
  });

  it('filters sensitive paths before reading Git diff content', async () => {
    const result = await tools.call('get_diff', { scope: 'working' });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      excludedSensitiveFiles: 2,
      includedFiles: 2,
      truncated: false,
    });
    expect(result.structuredContent?.diff).toContain('src/example.ts');
    expect(result.structuredContent?.diff).not.toContain('do-not-return');
    expect(
      runner.calls.some(
        (args) => args[0] === 'diff' && !args.includes('--name-only') && args.at(-1) === '.env',
      ),
    ).toBe(false);
  });

  it('rejects sensitive or escaping Git diff path filters', async () => {
    const sensitive = await tools.call('get_diff', { scope: 'working', path: '.env' });
    const escaped = await tools.call('get_diff', { scope: 'working', path: '../outside.ts' });

    expect(sensitive.isError).toBe(true);
    expect(sensitive.content[0].text).toContain('Sensitive files are blocked');
    expect(escaped.isError).toBe(true);
    expect(escaped.content[0].text).toContain('outside the repository');
  });

  it('searches text files while excluding blocked sensitive paths', async () => {
    const result = await tools.call('search_code', { query: 'value', maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      query: 'value',
      matches: [
        { path: 'src/example.ts', line: 1, snippet: 'export const value = 1;' },
        { path: 'src/example.ts', line: 2, snippet: 'export const other = value + 1;' },
        { path: 'src/example.test.ts', line: 1, snippet: 'expect(value).toBe(1);' },
      ],
    });
  });

  it('redacts credentials from remote URLs in repository summaries', async () => {
    const result = await tools.call('repository_summary', {});

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.remoteUrl).toBe('https://example.com/acme/repo.git');
  });
});
