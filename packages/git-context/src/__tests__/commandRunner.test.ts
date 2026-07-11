import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GitCommandRunner,
  assertReadOnlyGitCommand,
  redactGitDiagnostic,
} from '../commandRunner.js';
import {
  GitNotAvailableError,
  GitUnsafeCommandError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
} from '../errors.js';
import { createTempDir, initRepo, createAndCommitFile } from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

describe('GitCommandRunner', () => {
  let runner: GitCommandRunner;
  let fixture: TempRepoFixture | undefined;

  beforeEach(() => {
    runner = new GitCommandRunner();
  });

  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
  });

  it('detects Git and returns its version', async () => {
    expect(await runner.isAvailable()).toBe(true);
    expect(await runner.getVersion()).toMatch(/^git version \d+\.\d+/);
  });

  it('executes allowed commands with argument arrays', async () => {
    fixture = createTempDir();
    initRepo(fixture.root);
    createAndCommitFile(fixture.root, 'file with spaces.txt', 'hello', 'test commit');

    const result = await runner.run({
      cwd: fixture.root,
      args: ['rev-parse', '--show-toplevel'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('reviewlume-git-test-');
  });

  it('rejects write commands before spawning Git', async () => {
    fixture = createTempDir();
    initRepo(fixture.root);

    await expect(
      runner.run({ cwd: fixture.root, args: ['reset', '--hard'] }),
    ).rejects.toThrow(GitUnsafeCommandError);
    await expect(
      runner.run({ cwd: fixture.root, args: ['add', '--all'] }),
    ).rejects.toThrow(GitUnsafeCommandError);
  });

  it('rejects output-writing and externally executable diff options', () => {
    expect(() => assertReadOnlyGitCommand(['log', '--output=report.txt'])).toThrow(
      GitUnsafeCommandError,
    );
    expect(() => assertReadOnlyGitCommand(['diff', '--no-color'])).toThrow(
      GitUnsafeCommandError,
    );
    expect(() =>
      assertReadOnlyGitCommand([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--',
      ]),
    ).not.toThrow();
  });

  it('throws GitNotAvailableError for a missing executable', async () => {
    const badRunner = new GitCommandRunner('git-nonexistent-command-12345');
    await expect(
      badRunner.run({ cwd: process.cwd(), args: ['--version'] }),
    ).rejects.toThrow(GitNotAvailableError);
  });

  it('throws GitCommandError with a non-zero exit code', async () => {
    fixture = createTempDir();
    await expect(
      runner.run({ cwd: fixture.root, args: ['rev-parse', '--show-toplevel'] }),
    ).rejects.toMatchObject({ code: 'GIT_COMMAND_ERROR' });
  });

  it('redacts credential-bearing diagnostics', () => {
    const value = redactGitDiagnostic(
      'fatal: https://user:ghp_secret@example.com/owner/repo.git Authorization: bearer-token',
    );
    expect(value).not.toContain('ghp_secret');
    expect(value).not.toContain('bearer-token');
    expect(value).toContain('[REDACTED]');
  });

  it('times out a reliably blocking read-only command', async () => {
    fixture = createTempDir();
    initRepo(fixture.root);

    await expect(
      runner.run({ cwd: fixture.root, args: ['cat-file', '--batch'], timeout: 20 }),
    ).rejects.toThrow(GitTimeoutError);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    fixture = createTempDir();
    initRepo(fixture.root);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runner.run({
        cwd: fixture.root,
        args: ['rev-parse', '--show-toplevel'],
        signal: controller.signal,
      }),
    ).rejects.toThrow(GitCancelledError);
  });

  it('cancels a running read-only command', async () => {
    fixture = createTempDir();
    initRepo(fixture.root);
    const controller = new AbortController();

    const operation = runner.run({
      cwd: fixture.root,
      args: ['cat-file', '--batch'],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);

    await expect(operation).rejects.toThrow(GitCancelledError);
  });

  it('uses GitCommandError rather than leaking raw command arguments', async () => {
    fixture = createTempDir();
    try {
      await runner.run({ cwd: fixture.root, args: ['rev-parse', 'missing-secret-like-ref'] });
      expect.unreachable('Expected Git to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GitCommandError);
      expect((error as Error).message).not.toContain('missing-secret-like-ref');
    }
  });
});
