import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitStatusCollector } from '../statusSnapshot.js';
import { GitRepository } from '../repository.js';
import { GitCommandError } from '../errors.js';
import {
  createTempDir,
  initRepo,
  createAndCommitFile,
  createAndStageFile,
  modifyFile,
  createUntrackedFile,
  stageAll,
} from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

describe('GitStatusCollector', () => {
  let runner: GitCommandRunner;
  let collector: GitStatusCollector;
  let fixture: TempRepoFixture;
  let repo: GitRepository;

  beforeEach(() => {
    runner = new GitCommandRunner();
    collector = new GitStatusCollector(runner);
    fixture = createTempDir();
    initRepo(fixture.root);
    repo = new GitRepository({
      root: fixture.root,
      displayName: 'test-repo',
      hasRemote: false,
    });
  });

  afterEach(() => fixture.cleanup());

  it('returns no changes for a fresh repository', async () => {
    const status = await collector.getStatus(repo);
    expect(status).toMatchObject({ hasChanges: false, staged: [], unstaged: [], untracked: [] });
  });

  it('detects staged, unstaged, and untracked changes together', async () => {
    createAndCommitFile(fixture.root, 'committed.txt', 'v1', 'initial');
    createAndStageFile(fixture.root, 'staged.txt', 'staged content');
    modifyFile(fixture.root, 'committed.txt', 'unstaged modification');
    createUntrackedFile(fixture.root, 'untracked.txt', 'untracked content');

    const status = await collector.getStatus(repo);
    expect(status.hasChanges).toBe(true);
    expect(status.staged).toContainEqual(
      expect.objectContaining({ path: 'staged.txt', status: 'added' }),
    );
    expect(status.unstaged).toContainEqual(
      expect.objectContaining({ path: 'committed.txt', status: 'modified' }),
    );
    expect(status.untracked).toContainEqual({ path: 'untracked.txt', status: 'untracked' });
  });

  it('detects staged deletions without using the production runner for writes', async () => {
    createAndCommitFile(fixture.root, 'delete-me.txt', 'content', 'add file');
    rmSync(join(fixture.root, 'delete-me.txt'));
    stageAll(fixture.root);

    const status = await collector.getStatus(repo);
    expect(status.staged).toContainEqual({ path: 'delete-me.txt', status: 'deleted' });
  });

  it('returns staged and unstaged patches with external drivers disabled', async () => {
    createAndCommitFile(fixture.root, 'file.txt', 'v1', 'initial');
    modifyFile(fixture.root, 'file.txt', 'v2');
    expect(await collector.getUnstagedDiff(repo)).toContain('+v2');

    createAndStageFile(fixture.root, 'file.txt', 'v3');
    expect(await collector.getStagedDiff(repo)).toContain('+v3');
  });

  it('preserves spaces and Chinese characters', async () => {
    createUntrackedFile(fixture.root, 'my file.txt', 'content');
    createUntrackedFile(fixture.root, '中文文件.txt', '内容');

    const paths = (await collector.getStatus(repo)).untracked.map((entry) => entry.path);
    expect(paths).toContain('my file.txt');
    expect(paths).toContain('中文文件.txt');
  });

  it.skipIf(process.platform === 'win32')(
    'preserves leading, trailing, newline, and backslash characters on POSIX',
    async () => {
      const names = [' leading and trailing ', 'line\nbreak.txt', 'back\\slash.txt'];
      for (const name of names) {
        createUntrackedFile(fixture.root, name, 'content');
      }

      const paths = (await collector.getStatus(repo)).untracked.map((entry) => entry.path);
      for (const name of names) {
        expect(paths).toContain(name);
      }
    },
  );

  it('propagates Git failures instead of reporting a clean repository', async () => {
    const nonRepository = createTempDir();
    try {
      const invalid = new GitRepository({
        root: nonRepository.root,
        displayName: 'not-a-repository',
        hasRemote: false,
      });
      await expect(collector.getStatus(invalid)).rejects.toThrow(GitCommandError);
    } finally {
      nonRepository.cleanup();
    }
  });
});
