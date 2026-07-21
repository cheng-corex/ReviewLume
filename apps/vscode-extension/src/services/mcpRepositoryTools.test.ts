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
      return { stdout: ['src/example.ts', 'src/example.test.ts', 'src/embedded-secret.ts', '.env', ''].join('\0') };
    }
    if (options.args[0] === 'diff' && options.args.includes('--name-only')) {
      return { stdout: ['src/example.ts', 'src/embedded-secret.ts', '.env', ''].join('\0') };
    }
    if (options.args[0] === 'diff') {
      const requestedPath = options.args[options.args.length - 1];
      if (requestedPath === '.env') return { stdout: 'SECRET=do-not-return\n' };
      if (requestedPath === 'src/embedded-secret.ts') {
        return { stdout: '+const apiKey = "embedded-secret-value";\n' };
      }
      return { stdout: 'diff --git a/src/example.ts b/src/example.ts\n+export const value = 1;\n' };
    }
    if (options.args[0] === 'status') return { stdout: '## main\n M src/example.ts\n' };
    if (options.args[0] === 'log') {
      return { stdout: '0123456789012345678901234567890123456789\tDev\t2026-07-21T00:00:00Z\tToken embedded-secret-value' };
    }
    if (options.args[0] === 'rev-parse' && options.args.includes('--abbrev-ref')) return { stdout: 'main\n' };
    if (options.args[0] === 'rev-parse') return { stdout: '0123456789012345678901234567890123456789\n' };
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
    await writeFile(path.join(root, 'src', 'embedded-secret.ts'), 'const token = "embedded-secret-value";\n');
    await writeFile(path.join(root, '.env'), 'SECRET=do-not-read\n');
    runner = new FakeRunner();
    tools = new McpRepositoryTools({ root, displayName: 'fixture', runner });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('declares the current MCP tools as read-only and non-destructive', () => {
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
    const result = await tools.call('read_file', { path: 'src/example.ts', startLine: 2, endLine: 2 });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      path: 'src/example.ts', startLine: 2, endLine: 2,
      content: '2: export const other = value + 1;',
    });
  });

  it('reads credential-like paths and content while still blocking repository escapes', async () => {
    const envFile = await tools.call('read_file', { path: '.env' });
    const embedded = await tools.call('read_file', { path: 'src/embedded-secret.ts' });
    const escaped = await tools.call('read_file', { path: '../outside.txt' });

    expect(envFile.isError).toBe(false);
    expect(envFile.structuredContent?.content).toContain('SECRET=do-not-read');
    expect(embedded.isError).toBe(false);
    expect(embedded.structuredContent?.content).toContain('embedded-secret-value');
    expect(escaped.isError).toBe(true);
    expect(escaped.content[0].text).toContain('outside the repository');
  });

  it('returns credential-like paths and content in Git diffs', async () => {
    const result = await tools.call('get_diff', { scope: 'working' });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      excludedSensitiveFiles: 0,
      includedFiles: 6,
      truncated: false,
    });
    expect(result.structuredContent?.diff).toContain('src/example.ts');
    expect(result.structuredContent?.diff).toContain('do-not-return');
    expect(result.structuredContent?.diff).toContain('embedded-secret-value');
    expect(runner.calls.some((args) => args[0] === 'diff' && !args.includes('--name-only') && args.at(-1) === '.env')).toBe(true);
  });

  it('allows credential-like Git diff path filters but rejects escaping filters', async () => {
    const envDiff = await tools.call('get_diff', { scope: 'working', path: '.env' });
    const escaped = await tools.call('get_diff', { scope: 'working', path: '../outside.ts' });

    expect(envDiff.isError).toBe(false);
    expect(envDiff.structuredContent?.diff).toContain('do-not-return');
    expect(escaped.isError).toBe(true);
    expect(escaped.content[0].text).toContain('outside the repository');
  });

  it('lists and searches credential-like files and matching lines', async () => {
    const listed = await tools.call('list_files', { limit: 10 });
    const envSearch = await tools.call('search_code', { query: 'do-not-read', maxResults: 10 });
    const secretSearch = await tools.call('search_code', { query: 'embedded-secret', maxResults: 10 });

    expect(listed.isError).toBe(false);
    expect(listed.structuredContent?.files).toContain('.env');
    expect(envSearch.structuredContent?.matches).toEqual([
      { path: '.env', line: 1, snippet: 'SECRET=do-not-read' },
    ]);
    expect(secretSearch.structuredContent?.matches).toEqual([
      { path: 'src/embedded-secret.ts', line: 1, snippet: 'const token = "embedded-secret-value";' },
    ]);
  });

  it('does not hide credential-like text in commit subjects', async () => {
    const result = await tools.call('recent_commits', { count: 1 });
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.commits).toEqual([
      {
        sha: '0123456789012345678901234567890123456789',
        author: 'Dev',
        date: '2026-07-21T00:00:00Z',
        subject: 'Token embedded-secret-value',
      },
    ]);
  });

  it('redacts credentials from remote URLs in repository summaries', async () => {
    const result = await tools.call('repository_summary', {});
    expect(result.isError).toBe(false);
    expect(result.structuredContent?.remoteUrl).toBe('https://example.com/acme/repo.git');
  });
});
