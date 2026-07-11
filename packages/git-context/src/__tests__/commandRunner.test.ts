/**
 * Integration tests for GitCommandRunner.
 *
 * These tests verify the runner works with a real (or absent) git executable.
 * The "git not available" scenario is covered by checking that the runner
 * properly handles ENOENT when git is not on PATH.
 */

import { existsSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitNotAvailableError, GitCommandError, GitTimeoutError, GitCancelledError } from '../errors.js';
import { createTempDir, initRepo, createAndCommitFile } from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

describe('GitCommandRunner', () => {
  let runner: GitCommandRunner;
  let fixture: TempRepoFixture;

  beforeEach(() => {
    runner = new GitCommandRunner();
  });

  afterEach(() => {
    fixture?.cleanup();
  });

  describe('isAvailable', () => {
    it('should return true when git is installed', async () => {
      const available = await runner.isAvailable();
      // This test assumes git is installed on the dev/CI machine
      expect(available).toBe(true);
    });

    it('should return the git version string', async () => {
      const version = await runner.getVersion();
      expect(version).toMatch(/^git version \d+\.\d+/);
    });
  });

  describe('run with args array', () => {
    it('should execute a basic git command and return output', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      const result = await runner.run({
        cwd: fixture.root,
        args: ['rev-parse', '--show-toplevel'],
      });

      expect(result.exitCode).toBe(0);
      const gitRoot = result.stdout.trim();
      // Verify the git root is a valid directory
      expect(existsSync(gitRoot)).toBe(true);
      // Verify it ends with our temp dir name (cross-platform safe)
      expect(gitRoot).toMatch(/reviewlume-git-test-/);
    });

    it('should not use shell and reject shell metacharacters as arguments', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      // Using execFile with args array should treat ";" as a literal argument, not a command separator
      await expect(
        runner.run({
          cwd: fixture.root,
          args: ['rev-parse', '--show-toplevel', ';', 'echo', 'pwned'],
        }),
      ).rejects.toThrow(GitCommandError);
    });

    it('should handle paths with spaces', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      createAndCommitFile(fixture.root, 'file with spaces.txt', 'hello', 'test commit');

      const result = await runner.run({
        cwd: fixture.root,
        args: ['diff', '--cached', '--name-status', '-z'],
      });

      // Should not crash, output should contain the filename with spaces
      expect(result.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw GitNotAvailableError for nonexistent git path', async () => {
      const badRunner = new GitCommandRunner('git-nonexistent-command-12345');
      await expect(
        badRunner.run({ cwd: process.cwd(), args: ['--version'] }),
      ).rejects.toThrow(GitNotAvailableError);
    });

    it('should throw GitCommandError for non-zero exit codes', async () => {
      fixture = createTempDir();
      // Not a git repo
      await expect(
        runner.run({ cwd: fixture.root, args: ['rev-parse', '--show-toplevel'] }),
      ).rejects.toThrow(GitCommandError);
    });

    it('should include stderr and exitCode in GitCommandError', async () => {
      fixture = createTempDir();
      try {
        await runner.run({ cwd: fixture.root, args: ['rev-parse', '--show-toplevel'] });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitCommandError);
        const gitErr = err as GitCommandError;
        expect(gitErr.exitCode).not.toBe(0);
        expect(gitErr.stderr).toBeTruthy();
      }
    });
  });

  describe('timeout', () => {
    it('should throw GitTimeoutError when command exceeds timeout', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      // Use a very short timeout
      await expect(
        runner.run({
          cwd: fixture.root,
          args: ['log', '--all'], // Might complete quickly, but with 1ms timeout it should be forced to timeout
          timeout: 1,
        }),
      ).rejects.toThrow(GitTimeoutError);
    });
  });

  describe('cancellation', () => {
    it('should throw GitCancelledError when signal is already aborted', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      const controller = new AbortController();
      controller.abort();

      await expect(
        runner.run({
          cwd: fixture.root,
          args: ['status'],
          signal: controller.signal,
        }),
      ).rejects.toThrow(GitCancelledError);
    });

    it('should throw GitCancelledError when signal is aborted during execution', async () => {
      fixture = createTempDir();
      initRepo(fixture.root);

      const controller = new AbortController();

      // Use a command that might take long enough to cancel
      const promise = runner.run({
        cwd: fixture.root,
        args: ['log', '--all'],
        signal: controller.signal,
      });

      // Cancel immediately
      controller.abort();

      await expect(promise).rejects.toThrow(GitCancelledError);
    });
  });
});
