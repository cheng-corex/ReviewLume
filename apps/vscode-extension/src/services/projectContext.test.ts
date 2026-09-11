import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { McpGitRunner } from './mcpRepositoryTools';
import { resolveProjectContext } from './projectContext';

class FakeRunner implements McpGitRunner {
  constructor(private readonly result: string | Error) {}

  async run(): Promise<{ readonly stdout: string }> {
    if (this.result instanceof Error) throw this.result;
    return { stdout: this.result };
  }
}

describe('resolveProjectContext', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('uses a trusted ordinary workspace folder when Git discovery fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-folder-context-'));
    roots.push(root);

    const context = await resolveProjectContext(root, new FakeRunner(new Error('not a repository')));

    expect(context).toEqual({
      root,
      displayName: path.basename(root),
      kind: 'folder',
    });
  });

  it('keeps the discovered Git repository root for Git Projects', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-git-context-'));
    roots.push(root);
    const nested = path.join(root, 'packages', 'app');
    await mkdir(nested, { recursive: true });

    const context = await resolveProjectContext(
      nested,
      new FakeRunner(`${root}${os.EOL}`),
    );

    expect(context).toEqual({
      root,
      displayName: path.basename(root),
      kind: 'git',
    });
  });
});
