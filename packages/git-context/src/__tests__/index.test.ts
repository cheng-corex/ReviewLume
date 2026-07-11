import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  // Error types
  GitNotAvailableError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
  NotInGitRepositoryError,
  CrossRepositoryError,
  InvalidCommitError,
  WorkspaceUntrustedError,
  MultipleRepositoriesError,
  // Command runner
  GitCommandRunner,
  // Repository model
  GitRepository,
  deriveDisplayName,
  sanitizeRemoteUrl,
  // Discovery
  GitRepositoryDiscovery,
  // Status
  GitStatusCollector,
  // Commit range
  GitCommitRangeService,
} from '../index.js';

describe('@reviewlume/git-context exports', () => {
  it('should export all P2 classes', () => {
    expect(GitCommandRunner).toBeDefined();
    expect(GitRepository).toBeDefined();
    expect(GitRepositoryDiscovery).toBeDefined();
    expect(GitStatusCollector).toBeDefined();
    expect(GitCommitRangeService).toBeDefined();
  });

  it('should export all error types', () => {
    expect(GitNotAvailableError).toBeDefined();
    expect(GitCommandError).toBeDefined();
    expect(GitTimeoutError).toBeDefined();
    expect(GitCancelledError).toBeDefined();
    expect(NotInGitRepositoryError).toBeDefined();
    expect(CrossRepositoryError).toBeDefined();
    expect(InvalidCommitError).toBeDefined();
    expect(WorkspaceUntrustedError).toBeDefined();
    expect(MultipleRepositoriesError).toBeDefined();
  });

  it('should export utility functions', () => {
    expect(deriveDisplayName).toBeDefined();
    expect(sanitizeRemoteUrl).toBeDefined();
  });

  it('should construct error types with correct codes', () => {
    const notAvail = new GitNotAvailableError('git');
    expect(notAvail.code).toBe('GIT_NOT_AVAILABLE');
    expect(notAvail.message).toContain('git');

    const cmdErr = new GitCommandError('cmd failed', 1, 'stderr');
    expect(cmdErr.code).toBe('GIT_COMMAND_ERROR');
    expect(cmdErr.exitCode).toBe(1);

    const timeout = new GitTimeoutError(5000);
    expect(timeout.code).toBe('GIT_TIMEOUT');

    const cancelled = new GitCancelledError();
    expect(cancelled.code).toBe('GIT_CANCELLED');

    const noGit = new NotInGitRepositoryError('/path');
    expect(noGit.code).toBe('NOT_IN_GIT_REPOSITORY');

    const cross = new CrossRepositoryError('cross repo');
    expect(cross.code).toBe('CROSS_REPOSITORY');

    const invalid = new InvalidCommitError('abc123', '/repo');
    expect(invalid.code).toBe('INVALID_COMMIT');

    const untrusted = new WorkspaceUntrustedError();
    expect(untrusted.code).toBe('WORKSPACE_UNTRUSTED');

    const multi = new MultipleRepositoriesError(3);
    expect(multi.code).toBe('MULTIPLE_REPOSITORIES');
  });

  it('should create a GitRepository with path boundary checks', () => {
    const root = resolve('/home/user/project');
    const repo = new GitRepository({
      root,
      displayName: 'project',
      hasRemote: true,
      remoteUrl: 'https://github.com/user/project.git',
    });

    expect(repo.root).toBe(root);
    expect(repo.displayName).toBe('project');
    expect(repo.hasRemote).toBe(true);
    expect(repo.remoteUrl).toBe('https://github.com/user/project.git');

    // Path boundary checks
    expect(repo.containsPath('/home/user/project/src/file.ts')).toBe(true);
    expect(repo.containsPath('/home/user/project')).toBe(true);
    expect(repo.containsPath('/home/user/other/file.ts')).toBe(false);
    expect(repo.containsPath('../other/file.ts')).toBe(false);
  });
});
