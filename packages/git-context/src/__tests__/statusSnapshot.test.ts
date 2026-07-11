/**
 * Integration tests for GitStatusCollector.
 *
 * Tests staged, unstaged, untracked, and mixed scenarios
 * using real temporary Git repositories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitStatusCollector } from '../statusSnapshot.js';
import { GitRepository } from '../repository.js';
import {
  createTempDir,
  initRepo,
  createAndCommitFile,
  createAndStageFile,
  modifyFile,
  createUntrackedFile,
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

  afterEach(() => {
    fixture?.cleanup();
  });

  describe('getStatus — empty repo', () => {
    it('should return no changes for a fresh repo', async () => {
      const status = await collector.getStatus(repo);
      expect(status.hasChanges).toBe(false);
      expect(status.staged).toHaveLength(0);
      expect(status.unstaged).toHaveLength(0);
      expect(status.untracked).toHaveLength(0);
    });
  });

  describe('getStatus — staged changes', () => {
    it('should detect staged new files', async () => {
      createAndStageFile(fixture.root, 'newfile.txt', 'hello');

      const status = await collector.getStatus(repo);
      expect(status.hasChanges).toBe(true);
      expect(status.staged).toHaveLength(1);
      expect(status.staged[0]!.path).toBe('newfile.txt');
      expect(status.staged[0]!.status).toBe('added');
    });

    it('should detect staged modifications', async () => {
      createAndCommitFile(fixture.root, 'file.txt', 'v1', 'initial');
      createAndStageFile(fixture.root, 'file.txt', 'v2');

      const status = await collector.getStatus(repo);
      const stagedModified = status.staged.filter((e) => e.status === 'modified');
      expect(stagedModified.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect staged deletions', async () => {
      createAndCommitFile(fixture.root, 'todelete.txt', 'content', 'add file');
      // Stage deletion
      await runner.run({ cwd: fixture.root, args: ['rm', '--', 'todelete.txt'] });

      const status = await collector.getStatus(repo);
      const deleted = status.staged.filter((e) => e.status === 'deleted');
      expect(deleted.length).toBeGreaterThanOrEqual(1);
      expect(deleted[0]!.path).toBe('todelete.txt');
    });
  });

  describe('getStatus — unstaged changes', () => {
    it('should detect unstaged modifications', async () => {
      createAndCommitFile(fixture.root, 'file.txt', 'v1', 'initial');
      modifyFile(fixture.root, 'file.txt', 'v2 (modified but not staged)');

      const status = await collector.getStatus(repo);
      expect(status.unstaged).toHaveLength(1);
      expect(status.unstaged[0]!.path).toBe('file.txt');
      expect(status.unstaged[0]!.status).toBe('modified');
    });
  });

  describe('getStatus — untracked changes', () => {
    it('should detect untracked files', async () => {
      createUntrackedFile(fixture.root, 'untracked.txt', 'new untracked file');

      const status = await collector.getStatus(repo);
      expect(status.untracked).toHaveLength(1);
      expect(status.untracked[0]!.path).toBe('untracked.txt');
      expect(status.untracked[0]!.status).toBe('untracked');
    });
  });

  describe('getStatus — mixed state', () => {
    it('should detect staged + unstaged + untracked simultaneously', async () => {
      // Committed file, then a separate staged change
      createAndCommitFile(fixture.root, 'committed.txt', 'v1', 'initial');
      createAndStageFile(fixture.root, 'staged.txt', 'staged content');

      // Unstaged modification to an existing committed file
      modifyFile(fixture.root, 'committed.txt', 'unstaged modification');

      // Untracked file
      createUntrackedFile(fixture.root, 'untracked.txt', 'untracked content');

      const status = await collector.getStatus(repo);
      expect(status.hasChanges).toBe(true);
      expect(status.staged.length).toBeGreaterThanOrEqual(1);
      expect(status.unstaged.length).toBeGreaterThanOrEqual(1);
      expect(status.untracked.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStagedDiff', () => {
    it('should return diff content for staged changes', async () => {
      createAndStageFile(fixture.root, 'newfile.txt', 'content');

      const diff = await collector.getStagedDiff(repo);
      expect(diff).toContain('newfile.txt');
      expect(diff).toContain('+content');
    });

    it('should return empty string when no staged changes', async () => {
      const diff = await collector.getStagedDiff(repo);
      expect(diff).toBe('');
    });
  });

  describe('getUnstagedDiff', () => {
    it('should return diff content for unstaged changes', async () => {
      createAndCommitFile(fixture.root, 'file.txt', 'v1', 'initial');
      modifyFile(fixture.root, 'file.txt', 'v2 (unstaged)');

      const diff = await collector.getUnstagedDiff(repo);
      expect(diff).toContain('file.txt');
      expect(diff).toContain('-v1');
      expect(diff).toContain('+v2 (unstaged)');
    });
  });

  describe('paths with special characters', () => {
    it('should handle files with spaces in names', async () => {
      createUntrackedFile(fixture.root, 'my file with spaces.txt', 'content');

      const status = await collector.getStatus(repo);
      expect(status.untracked).toHaveLength(1);
      expect(status.untracked[0]!.path).toBe('my file with spaces.txt');
    });

    it('should handle files with Chinese characters in names', async () => {
      const chineseName = '中文文件.txt';
      createUntrackedFile(fixture.root, chineseName, '内容');

      const status = await collector.getStatus(repo);
      expect(status.untracked).toHaveLength(1);
      expect(status.untracked[0]!.path).toBe(chineseName);
    });
  });
});
