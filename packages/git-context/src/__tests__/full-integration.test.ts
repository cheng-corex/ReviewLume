import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitRepositoryDiscovery } from '../discovery.js';
import { GitStatusCollector } from '../statusSnapshot.js';
import { GitCommitRangeService } from '../commitRange.js';
import { GitRepository, sanitizeRemoteUrl } from '../repository.js';
import {
  GitNotAvailableError,
  GitUnsafeCommandError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
  InvalidCommitError,
  CrossRepositoryError,
} from '../errors.js';
import {
  createTempDir,
  initRepo,
  createAndCommitFile,
  createAndStageFile,
  modifyFile,
  createUntrackedFile,
} from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

describe('git-context full integration', () => {
  it('reports a missing Git executable', async () => {
    const runner = new GitCommandRunner('nonexistent-git-binary-reviewlume');
    await expect(runner.getVersion()).rejects.toThrow(GitNotAvailableError);
  });

  it('discovers one or multiple workspace repositories without auto-selection', async () => {
    const first = createTempDir();
    const second = createTempDir();
    const plain = createTempDir();
    try {
      initRepo(first.root);
      initRepo(second.root);
      const discovery = new GitRepositoryDiscovery(new GitCommandRunner());

      expect(await discovery.discover([plain.root])).toHaveLength(0);
      expect(await discovery.discover([first.root, plain.root])).toHaveLength(1);
      expect(await discovery.discover([first.root, second.root])).toHaveLength(2);
      expect(await discovery.discover([first.root, `${first.root}/src`])).toHaveLength(1);
    } finally {
      first.cleanup();
      second.cleanup();
      plain.cleanup();
    }
  });

  it('collects staged, unstaged, and untracked changes', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      createAndCommitFile(fixture.root, 'tracked.txt', 'v1', 'initial');
      createAndStageFile(fixture.root, 'staged file.txt', 'staged');
      modifyFile(fixture.root, 'tracked.txt', 'v2');
      createUntrackedFile(fixture.root, '报告.md', '内容');

      const repository = new GitRepository({
        root: fixture.root,
        displayName: 'fixture',
        hasRemote: false,
      });
      const snapshot = await new GitStatusCollector(new GitCommandRunner()).getStatus(repository);

      expect(snapshot.staged.some((entry) => entry.path === 'staged file.txt')).toBe(true);
      expect(snapshot.unstaged.some((entry) => entry.path === 'tracked.txt')).toBe(true);
      expect(snapshot.untracked.some((entry) => entry.path === '报告.md')).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('propagates status failures for a non-repository', async () => {
    const fixture = createTempDir();
    try {
      const repository = new GitRepository({
        root: fixture.root,
        displayName: 'invalid',
        hasRemote: false,
      });
      await expect(
        new GitStatusCollector(new GitCommandRunner()).getStatus(repository),
      ).rejects.toThrow(GitCommandError);
    } finally {
      fixture.cleanup();
    }
  });

  describe('commit ranges', () => {
    let fixture: TempRepoFixture;
    let runner: GitCommandRunner;
    let repository: GitRepository;
    let service: GitCommitRangeService;
    let firstHash: string;
    let secondHash: string;

    beforeEach(async () => {
      fixture = createTempDir();
      initRepo(fixture.root);
      runner = new GitCommandRunner();
      service = new GitCommitRangeService(runner);
      repository = new GitRepository({
        root: fixture.root,
        displayName: 'range-fixture',
        hasRemote: false,
      });

      createAndCommitFile(fixture.root, 'a.txt', 'a', 'first');
      firstHash = (await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();
      createAndCommitFile(fixture.root, 'b.txt', 'b', 'second');
      secondHash = (await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();
    });

    afterEach(() => fixture.cleanup());

    it('canonicalizes valid refs and returns safe diffs', async () => {
      const range = await service.validate(repository, firstHash.slice(0, 12), 'HEAD');
      expect(range.base).toBe(firstHash);
      expect(range.target).toBe(secondHash);
      expect(await service.getDiff(repository, range)).toContain('b.txt');
      expect(await service.getChangedFiles(repository, range)).toContainEqual(
        expect.objectContaining({ path: 'b.txt', status: 'added' }),
      );
    });

    it('rejects aliases that resolve to the same commit', async () => {
      await expect(service.validate(repository, 'HEAD', secondHash)).rejects.toThrow(
        CrossRepositoryError,
      );
    });

    it('rejects missing and cross-repository commits', async () => {
      await expect(
        service.validate(repository, '0'.repeat(40), secondHash),
      ).rejects.toThrow(InvalidCommitError);

      const other = createTempDir();
      try {
        initRepo(other.root);
        createAndCommitFile(other.root, 'other.txt', 'other', 'other');
        const otherHash = (
          await runner.run({ cwd: other.root, args: ['rev-parse', 'HEAD'] })
        ).stdout.trim();
        await expect(service.validate(repository, firstHash, otherHash)).rejects.toThrow(
          InvalidCommitError,
        );
      } finally {
        other.cleanup();
      }
    });
  });

  it('supports deterministic timeout and cancellation', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      await expect(
        runner.run({ cwd: fixture.root, args: ['cat-file', '--batch'], timeout: 20 }),
      ).rejects.toThrow(GitTimeoutError);

      const controller = new AbortController();
      const operation = runner.run({
        cwd: fixture.root,
        args: ['cat-file', '--batch'],
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);
      await expect(operation).rejects.toThrow(GitCancelledError);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects Git write commands and shell-style payloads', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      await expect(
        runner.run({ cwd: fixture.root, args: ['checkout', '--', 'main'] }),
      ).rejects.toThrow(GitUnsafeCommandError);
      await expect(
        runner.run({
          cwd: fixture.root,
          args: ['rev-parse', '--show-toplevel', ';', 'echo', 'pwned'],
        }),
      ).rejects.toThrow(GitCommandError);
    } finally {
      fixture.cleanup();
    }
  });

  it('sanitizes remote credentials before exposure', () => {
    const sanitized = sanitizeRemoteUrl(
      'https://x-access-token:ghp_secret@github.com/owner/repo.git',
    );
    expect(sanitized).toBe('https://github.com/owner/repo.git');
    expect(sanitized).not.toContain('ghp_secret');
  });
});
