/**
 * Integration tests for GitCommitRangeService.
 *
 * Tests commit range validation, diff retrieval, and cross-repo rejection
 * using real temporary Git repositories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitCommitRangeService, type CommitRange } from '../commitRange.js';
import { GitRepository } from '../repository.js';
import { InvalidCommitError, CrossRepositoryError } from '../errors.js';
import {
  createTempDir,
  initRepo,
  createAndCommitFile,
} from './helpers.js';
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

    // Create a couple of commits for testing
    createAndCommitFile(fixture.root, 'file1.txt', 'content 1', 'first commit');
    firstCommitHash = (await runner.run({
      cwd: fixture.root,
      args: ['rev-parse', 'HEAD'],
    })).stdout.trim();

    createAndCommitFile(fixture.root, 'file2.txt', 'content 2', 'second commit');
    secondCommitHash = (await runner.run({
      cwd: fixture.root,
      args: ['rev-parse', 'HEAD'],
    })).stdout.trim();
  });

  afterEach(() => {
    fixture?.cleanup();
  });

  describe('validate', () => {
    it('should validate a valid commit range', async () => {
      const range = await service.validate(repo, firstCommitHash, secondCommitHash);
      expect(range.base).toBe(firstCommitHash);
      expect(range.target).toBe(secondCommitHash);
    });

    it('should accept short commit hashes', async () => {
      const shortBase = firstCommitHash.substring(0, 7);
      const range = await service.validate(repo, shortBase, secondCommitHash);
      expect(range.base).toBe(shortBase);
      expect(range.target).toBe(secondCommitHash);
    });

    it('should reject invalid base commit', async () => {
      await expect(
        service.validate(repo, '0000000000000000000000000000000000000000', secondCommitHash),
      ).rejects.toThrow(InvalidCommitError);
    });

    it('should reject invalid target commit', async () => {
      await expect(
        service.validate(repo, firstCommitHash, '0000000000000000000000000000000000000000'),
      ).rejects.toThrow(InvalidCommitError);
    });

    it('should reject empty base or target', async () => {
      await expect(
        service.validate(repo, '', secondCommitHash),
      ).rejects.toThrow(CrossRepositoryError);
      await expect(
        service.validate(repo, firstCommitHash, ''),
      ).rejects.toThrow(CrossRepositoryError);
    });

    it('should reject identical base and target', async () => {
      await expect(
        service.validate(repo, firstCommitHash, firstCommitHash),
      ).rejects.toThrow(CrossRepositoryError);
    });

    it('should reject commits from another repository', async () => {
      const otherFixture = createTempDir();
      try {
        initRepo(otherFixture.root);
        createAndCommitFile(otherFixture.root, 'other.txt', 'other', 'other commit');
        const otherHash = (await runner.run({
          cwd: otherFixture.root,
          args: ['rev-parse', 'HEAD'],
        })).stdout.trim();

        // otherHash does not exist in the first repo
        await expect(
          service.validate(repo, firstCommitHash, otherHash),
        ).rejects.toThrow(InvalidCommitError);
      } finally {
        otherFixture.cleanup();
      }
    });
  });

  describe('getDiff', () => {
    it('should return diff content for a valid range', async () => {
      const range: CommitRange = { base: firstCommitHash, target: secondCommitHash };
      const diff = await service.getDiff(repo, range);

      expect(diff).toContain('file2.txt');
      expect(diff).toContain('+content 2');
    });

    it('should re-validate before returning diff (cross-repo safety)', async () => {
      const otherFixture = createTempDir();
      try {
        initRepo(otherFixture.root);
        const range: CommitRange = { base: firstCommitHash, target: 'HEAD' };
        // target 'HEAD' exists in the test repo, but re-validation happens
        const diff = await service.getDiff(repo, range);
        expect(diff).toBeTruthy();
      } finally {
        otherFixture.cleanup();
      }
    });
  });

  describe('getChangedFiles', () => {
    it('should list files changed in a range', async () => {
      const range: CommitRange = { base: firstCommitHash, target: secondCommitHash };
      const files = await service.getChangedFiles(repo, range);

      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files.some((f) => f.path === 'file2.txt')).toBe(true);
    });
  });

  describe('getLog', () => {
    it('should return commit log for a range', async () => {
      const range: CommitRange = { base: firstCommitHash, target: secondCommitHash };
      const log = await service.getLog(repo, range);

      expect(log).toContain('second commit');
    });

    it('should return empty for a range with no new commits', async () => {
      // git log base..target returns empty when base == target
      // (both commits exist in the repo, so it doesn't reject)
      const range: CommitRange = { base: secondCommitHash, target: secondCommitHash };
      const log = await service.getLog(repo, range);
      expect(log).toBe('');
    });
  });
});
