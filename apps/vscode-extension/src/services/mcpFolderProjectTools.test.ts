import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  McpFolderProjectTools,
  discoverNestedGitRepositories,
} from './mcpFolderProjectTools';
import type { McpGitRunner, McpToolCallResult } from './mcpRepositoryTools';

function structured<T extends Record<string, unknown>>(result: McpToolCallResult): T {
  if (!result.structuredContent) throw new Error('Expected structured MCP content.');
  return result.structuredContent as T;
}

class FakeNestedGitRunner implements McpGitRunner {
  constructor(private readonly externalGitDirectory?: string) {}

  async run(options: {
    readonly cwd: string;
    readonly args: readonly string[];
  }): Promise<{ readonly stdout: string }> {
    const cwd = path.resolve(options.cwd);
    const args = options.args;
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return { stdout: `${cwd}\n` };
    }
    if (args[0] === 'rev-parse' && args[1] === '--absolute-git-dir') {
      if (path.basename(cwd) === 'external-metadata' && this.externalGitDirectory) {
        return { stdout: `${this.externalGitDirectory}\n` };
      }
      return { stdout: `${path.join(cwd, '.git')}\n` };
    }
    if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
      return { stdout: 'main\n' };
    }
    if (args[0] === 'rev-parse') {
      return { stdout: '0123456789012345678901234567890123456789\n' };
    }
    if (args[0] === 'status') {
      return { stdout: '## main\n M src/example.ts\n' };
    }
    if (args[0] === 'log') {
      return {
        stdout:
          '0123456789012345678901234567890123456789\tDev\t2026-09-11T00:00:00Z\tNested commit',
      };
    }
    if (args[0] === 'remote') throw new Error('No remote');
    if (args[0] === 'diff' && args.includes('--name-only')) {
      return { stdout: 'src/example.ts\0' };
    }
    if (args[0] === 'diff') {
      return { stdout: 'diff --git a/src/example.ts b/src/example.ts\n+changed\n' };
    }
    if (args[0] === 'ls-files') return { stdout: '' };
    throw new Error(`Unexpected Git call: ${args.join(' ')}`);
  }
}

describe('McpFolderProjectTools nested Git support', () => {
  let root: string;
  let outside: string;
  let runner: FakeNestedGitRunner;
  let tools: McpFolderProjectTools;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-folder-project-'));
    outside = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-folder-project-outside-'));
    await mkdir(path.join(outside, '.git'), { recursive: true });
    runner = new FakeNestedGitRunner(path.join(outside, '.git'));
    tools = new McpFolderProjectTools({
      root,
      displayName: 'fixture-folder',
      gitRunner: runner,
    });
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  async function createNestedRepository(relativePath: string): Promise<void> {
    await mkdir(path.join(root, relativePath, '.git'), { recursive: true });
    await mkdir(path.join(root, relativePath, 'src'), { recursive: true });
    await writeFile(path.join(root, relativePath, 'src', 'example.ts'), 'export const value = 1;\n');
  }

  it('exposes Folder file tools plus explicitly scoped nested Git tools', () => {
    expect(tools.definitions.map((definition) => definition.name)).toEqual([
      'project_summary',
      'list_git_repositories',
      'repository_summary',
      'git_status',
      'recent_commits',
      'get_diff',
      'list_files',
      'read_file',
      'search_code',
    ]);
    expect(tools.definitions.map((definition) => definition.name)).not.toContain('verification_status');
  });

  it('keeps the Folder root non-Git while advertising nested Git capability', async () => {
    const result = await tools.call('project_summary', {});
    expect(structured(result)).toMatchObject({
      project: 'fixture-folder',
      projectKind: 'folder',
      gitHistoryAvailable: false,
      nestedGitRepositoriesAvailable: true,
      localVerificationAvailable: false,
    });
    expect(structured(result)).not.toHaveProperty('repository');
    expect(result.content[0].text).toContain('no aggregate Git history');
  });

  it('discovers nested repositories and runs read-only Git against one explicit child repository', async () => {
    await createNestedRepository('ui');
    await createNestedRepository('services/api');
    await mkdir(path.join(root, 'ordinary'), { recursive: true });

    const listed = await tools.call('list_git_repositories', {});
    expect(structured<{ repositories: Array<{ path: string }> }>(listed).repositories)
      .toEqual([{ path: 'services/api', name: 'api' }, { path: 'ui', name: 'ui' }]);

    const summary = await tools.call('repository_summary', { repository: 'ui' });
    expect(structured(summary)).toMatchObject({
      project: 'fixture-folder',
      projectKind: 'folder',
      repository: 'ui',
      repositoryPath: 'ui',
      branch: 'main',
    });

    const status = await tools.call('git_status', { repository: 'services/api' });
    expect(structured<{ status: string }>(status).status).toContain('M src/example.ts');
    expect(structured(status)).toMatchObject({
      project: 'fixture-folder',
      projectKind: 'folder',
      repository: 'services/api',
      repositoryPath: 'services/api',
    });

    const commits = await tools.call('recent_commits', { repository: 'ui', count: 1 });
    expect(structured<{ commits: Array<{ subject: string }> }>(commits).commits[0]?.subject)
      .toBe('Nested commit');

    const diff = await tools.call('get_diff', { repository: 'ui', scope: 'working' });
    expect(structured<{ diff: string }>(diff).diff).toContain('diff --git');
  });

  it('rejects missing, escaping, absolute, and non-repository selectors', async () => {
    await createNestedRepository('ui');
    await mkdir(path.join(root, 'ordinary'), { recursive: true });

    for (const argumentsValue of [
      {},
      { repository: '../outside' },
      { repository: path.resolve(root, 'ui') },
      { repository: 'C:\\temp\\repo' },
      { repository: '\\\\server\\share\\repo' },
      { repository: '.' },
      { repository: 'ordinary' },
    ]) {
      const result = await tools.call('git_status', argumentsValue);
      expect(result.isError).toBe(true);
    }
  });

  it('requires the exact repository path returned by discovery and rejects link aliases', async () => {
    await createNestedRepository('ui');
    const alias = path.join(root, 'ui-alias');
    try {
      await symlink(path.join(root, 'ui'), alias, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') return;
      throw error;
    }

    const listed = await tools.call('list_git_repositories', {});
    expect(structured<{ repositories: Array<{ path: string }> }>(listed).repositories)
      .toEqual([{ path: 'ui', name: 'ui' }]);

    const aliasResult = await tools.call('git_status', { repository: 'ui-alias' });
    expect(aliasResult.isError).toBe(true);
    expect(aliasResult.content[0].text).toContain('exactly match');

    const realResult = await tools.call('git_status', { repository: 'ui' });
    expect(realResult.isError).not.toBe(true);
  });

  it('rejects a nested repository whose Git metadata resolves outside the authorized Folder root', async () => {
    await createNestedRepository('allowed');
    await createNestedRepository('external-metadata');

    const discovery = await discoverNestedGitRepositories(root, runner);
    expect(discovery.repositories.map((repository) => repository.relativePath)).toEqual(['allowed']);

    const blocked = await tools.call('repository_summary', { repository: 'external-metadata' });
    expect(blocked.isError).toBe(true);
  });

  it('still rejects Local Verification tools in Folder mode', async () => {
    for (const name of ['verification_status', 'read_verification_output']) {
      const result = await tools.call(name, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not available for a Folder Project');
    }
  });
});
