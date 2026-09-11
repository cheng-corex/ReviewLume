import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpFolderTools, enumerateFolderFiles, isSensitiveFolderPath } from './mcpFolderTools';
import type { McpToolCallResult } from './mcpRepositoryTools';

function structured<T extends Record<string, unknown>>(result: McpToolCallResult): T {
  if (!result.structuredContent) throw new Error('Expected structured MCP content.');
  return result.structuredContent as T;
}

describe('McpFolderTools', () => {
  let root: string;
  let outside: string;
  let tools: McpFolderTools;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-folder-tools-'));
    outside = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-folder-outside-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, '.git'), { recursive: true });
    await mkdir(path.join(root, 'node_modules', 'ignored-package'), { recursive: true });
    await writeFile(path.join(root, 'src', 'example.ts'), 'export const answer = 42;\n');
    await writeFile(path.join(root, 'src', 'example.test.ts'), 'expect(answer).toBe(42);\n');
    await writeFile(path.join(root, '.env'), 'SECRET=blocked\n');
    await writeFile(path.join(root, '.env.example'), 'SECRET=example-only\n');
    await writeFile(path.join(root, '.git', 'config'), '[remote "origin"]\n');
    await writeFile(path.join(root, 'node_modules', 'ignored-package', 'index.js'), 'ignored\n');
    await writeFile(path.join(outside, 'outside.ts'), 'export const escaped = true;\n');
    tools = new McpFolderTools({ root, displayName: 'fixture-folder' });
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  it('exposes only Folder Project capabilities', () => {
    expect(tools.definitions.map((definition) => definition.name)).toEqual([
      'project_summary',
      'list_files',
      'read_file',
      'search_code',
    ]);
    expect(tools.definitions.map((definition) => definition.name)).not.toContain('git_status');
    expect(tools.definitions.map((definition) => definition.name)).not.toContain('verification_status');
  });

  it('returns an explicit Folder Project identity without Git history claims', async () => {
    const result = await tools.call('project_summary', {});
    expect(structured(result)).toMatchObject({
      project: 'fixture-folder',
      projectKind: 'folder',
      gitHistoryAvailable: false,
      localVerificationAvailable: false,
    });
    expect(structured(result)).not.toHaveProperty('repository');
    expect(result.content[0].text).toContain('no reliable Git history');
  });

  it('lists, reads, and searches ordinary project source files without synthetic repository identity', async () => {
    const listed = await tools.call('list_files', { limit: 20 });
    const read = await tools.call('read_file', { path: 'src/example.ts' });
    const searched = await tools.call('search_code', { query: 'answer', maxResults: 10 });

    expect(structured<{ files: string[] }>(listed).files).toEqual([
      '.env.example',
      'src/example.test.ts',
      'src/example.ts',
    ]);
    expect(structured<{ content: string }>(read).content).toContain('export const answer = 42;');
    expect(structured<{ matches: Array<{ path: string }> }>(searched).matches.map((match) => match.path))
      .toEqual(['src/example.test.ts', 'src/example.ts']);
    expect(structured(read)).toMatchObject({ project: 'fixture-folder', projectKind: 'folder' });
    for (const result of [listed, read, searched]) {
      expect(structured(result)).not.toHaveProperty('repository');
    }
  });

  it('rejects hidden Git or verification tool calls instead of simulating them', async () => {
    for (const name of ['repository_summary', 'git_status', 'recent_commits', 'get_diff', 'verification_status', 'read_verification_output']) {
      const result = await tools.call(name, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not available for a Folder Project');
    }
  });

  it('rejects traversal, absolute, Windows drive, UNC, and VCS metadata reads', async () => {
    for (const requestedPath of [
      '../outside.ts',
      path.resolve(root, 'src', 'example.ts'),
      'C:\\Windows\\system.ini',
      '\\\\server\\share\\file.txt',
      '.git/config',
      'nested/.git/config',
    ]) {
      const result = await tools.call('read_file', { path: requestedPath });
      expect(result.isError).toBe(true);
    }
  });

  it('omits and rejects obvious credential-like paths while allowing env templates', async () => {
    const listed = await tools.call('list_files', { limit: 20 });
    const blocked = await tools.call('read_file', { path: '.env' });
    const template = await tools.call('read_file', { path: '.env.example' });

    expect(structured<{ files: string[] }>(listed).files).not.toContain('.env');
    expect(blocked.isError).toBe(true);
    expect(template.isError).toBe(false);
    expect(isSensitiveFolderPath('config/id_rsa')).toBe(true);
    expect(isSensitiveFolderPath('config/client.pem')).toBe(true);
    expect(isSensitiveFolderPath('.env.sample')).toBe(false);
  });

  it('does not enumerate a symlink or junction that resolves outside the project root', async () => {
    const linkPath = path.join(root, 'external-link');
    try {
      await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') return;
      throw error;
    }

    const files = await enumerateFolderFiles(root);
    expect(files.some((file) => file.startsWith('external-link/'))).toBe(false);
    const escaped = await tools.call('read_file', { path: 'external-link/outside.ts' });
    expect(escaped.isError).toBe(true);
  });
});
