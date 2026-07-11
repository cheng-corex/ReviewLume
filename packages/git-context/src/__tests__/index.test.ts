import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  GitNotAvailableError,
  GitUnsafeCommandError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
  NotInGitRepositoryError,
  CrossRepositoryError,
  InvalidCommitError,
  WorkspaceUntrustedError,
  MultipleRepositoriesError,
  GitCommandRunner,
  assertReadOnlyGitCommand,
  redactGitDiagnostic,
  GitRepository,
  deriveDisplayName,
  sanitizeRemoteUrl,
  GitRepositoryDiscovery,
  GitStatusCollector,
  GitCommitRangeService,
} from '../index.js';

describe('@reviewlume/git-context exports', () => {
  it('exports all P2 services and utilities', () => {
    expect(GitCommandRunner).toBeDefined();
    expect(GitRepository).toBeDefined();
    expect(GitRepositoryDiscovery).toBeDefined();
    expect(GitStatusCollector).toBeDefined();
    expect(GitCommitRangeService).toBeDefined();
    expect(assertReadOnlyGitCommand).toBeDefined();
    expect(redactGitDiagnostic).toBeDefined();
    expect(deriveDisplayName).toBeDefined();
    expect(sanitizeRemoteUrl).toBeDefined();
  });

  it('exports error types with stable machine-readable codes', () => {
    expect(new GitNotAvailableError('git').code).toBe('GIT_NOT_AVAILABLE');
    expect(new GitUnsafeCommandError('reset').code).toBe('GIT_UNSAFE_COMMAND');
    expect(new GitCommandError('failed', 1, '').code).toBe('GIT_COMMAND_ERROR');
    expect(new GitTimeoutError(100).code).toBe('GIT_TIMEOUT');
    expect(new GitCancelledError().code).toBe('GIT_CANCELLED');
    expect(new NotInGitRepositoryError().code).toBe('NOT_IN_GIT_REPOSITORY');
    expect(new CrossRepositoryError('cross').code).toBe('CROSS_REPOSITORY');
    expect(new InvalidCommitError('abc', 'repo').code).toBe('INVALID_COMMIT');
    expect(new WorkspaceUntrustedError().code).toBe('WORKSPACE_UNTRUSTED');
    expect(new MultipleRepositoriesError(2).code).toBe('MULTIPLE_REPOSITORIES');
  });

  it('constructs a repository with path boundary checks', () => {
    const root = resolve('/home/user/project');
    const repo = new GitRepository({
      root,
      displayName: 'project',
      hasRemote: true,
      remoteUrl: 'https://github.com/user/project.git',
    });

    expect(repo.root).toBe(root);
    expect(repo.remoteUrl).toBe('https://github.com/user/project.git');
    expect(repo.containsPath('/home/user/project/src/file.ts')).toBe(true);
    expect(repo.containsPath('/home/user/other/file.ts')).toBe(false);
    expect(repo.containsPath('../other/file.ts')).toBe(false);
  });
});
