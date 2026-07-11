import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitCommitRangeService } from '../commitRange.js';
import { GitRepository } from '../repository.js';
import { InvalidCommitError, CrossRepositoryError } from '../errors.js';
import { createTempDir, initRepo, createAndCommitFile } from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

describe('GitCommitRangeService', () => {
  let runner: GitCommandRunner;
  let service: GitCommitRangeService;
  let fixture: TempRepoFixture;
  let repo: GitRepository;
  let firstCommitHash: string;
  let secondCommitHash: string;

  beforeEach(async () => {
    runner = new GitCommandRunner();
    service = new GitCommitRangeService(runner);
    fixture = createTempDir();
    initRepo(fixture.root);
    repo = new GitRepository({
      root: fixture.root,
      displayName: 'test-repo',
      hasRemote: false,
    });

    createAndCommitFile(fixture.root, 'file1.txt', 'content 1', 'first commit');
    firstCommitHash = (
      await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })
    ).stdout.trim();
    createAndCommitFile(fixture.root, 'file2.txt', 'content 2', 'second commit');
    secondCommitHash = (
      await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })
    ).stdout.trim();
  });

  afterEach(() => fixture.cleanup());

  it('validates and canonicalizes full and short commit refs', async () => {
    const full = await service.validate(repo, firstCommitHash, secondCommitHash);
    expect(full).toEqual({ base: firstCommitHash, target: secondCommitHash });

    const short = await service.validate(repo, firstCommitHash.slice(0, 7), 'HEAD');
    expect(short).toEqual({ base: firstCommitHash, target: secondCommitHash });
  });

  it('rejects invalid or empty refs', async () => {
    await expect(
      service.validate(repo, '0'.repeat(40), secondCommitHash),
    ).rejects.toThrow(InvalidCommitError);
    await expect(service.validate(repo, '', secondCommitHash)).rejects.toThrow(
      CrossRepositoryError,
    );
    await expect(service.validate(repo, firstCommitHash, '')).rejects.toThrow(
      CrossRepositoryError,
    );
  });

  it('rejects different ref spellings that resolve to the same commit', async () => {
    await expect(service.validate(repo, 'HEAD', secondCommitHash)).rejects.toThrow(
      CrossRepositoryError,
    );
  });

  it('rejects commits from another repository', async () => {
    const otherFixture = createTempDir();
    try {
      initRepo(otherFixture.root);
      createAndCommitFile(otherFixture.root, 'other.txt', 'other', 'other commit');
      const otherHash = (
        await runner.run({ cwd: otherFixture.root, args: ['rev-parse', 'HEAD'] })
      ).stdout.trim();

      await expect(
        service.validate(repo, firstCommitHash, otherHash),
      ).rejects.toThrow(InvalidCommitError);
    } finally {
      otherFixture.cleanup();
    }
  });

  it('returns a safe patch, changed files, and log for a validated range', async () => {
    const range = await service.validate(repo, firstCommitHash, secondCommitHash);

    const diff = await service.getDiff(repo, range);
    expect(diff).toContain('file2.txt');
    expect(diff).toContain('+content 2');

    const files = await service.getChangedFiles(repo, range);
    expect(files).toContainEqual(
      expect.objectContaining({ path: 'file2.txt', status: 'added' }),
    );

    const log = await service.getLog(repo, range);
    expect(log).toContain('second commit');
  });

  it('revalidates externally constructed ranges', async () => {
    await expect(
      service.getDiff(repo, { base: firstCommitHash, target: '0'.repeat(40) }),
    ).rejects.toThrow(InvalidCommitError);
    await expect(
      service.getLog(repo, { base: secondCommitHash, target: secondCommitHash }),
    ).rejects.toThrow(CrossRepositoryError);
  });
});
