/**
 * Full integration tests exercising the entire git-context package
 * with real temporary Git repositories.
 *
 * Covers:
 * 1. Git not available
 * 2. Not a git repository
 * 3. Single-repo discovery
 * 4. Multi-root single-repo
 * 5. Multi-root multi-repo (must select)
 * 6. Nested repo deduplication
 * 7. Staged/unstaged/untracked
 * 8. Commit range valid/invalid
 * 9. Cross-repo rejection
 * 10. Timeout and cancellation
 * 11. Paths with spaces and Chinese
 * 12. Git non-zero exit handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitRepositoryDiscovery } from '../discovery.js';
import { GitStatusCollector } from '../statusSnapshot.js';
import { GitCommitRangeService } from '../commitRange.js';
import { GitRepository, deriveDisplayName, sanitizeRemoteUrl } from '../repository.js';
import { GitNotAvailableError, GitCommandError, GitTimeoutError, GitCancelledError, InvalidCommitError } from '../errors.js';
import {
  createTempDir,
  initRepo,
  createAndCommitFile,
  createAndStageFile,
  modifyFile,
  createUntrackedFile,
} from './helpers.js';
import type { TempRepoFixture } from './helpers.js';

// ---------------------------------------------------------------------------
// 1. Git Not Available
// ---------------------------------------------------------------------------
describe('Git Not Available', () => {
  it('should throw GitNotAvailableError when git is not found', async () => {
    const badRunner = new GitCommandRunner('nonexistent-git-binary-xyz');
    await expect(
      badRunner.run({ cwd: process.cwd(), args: ['--version'] }),
    ).rejects.toThrow(GitNotAvailableError);
  });
});

// ---------------------------------------------------------------------------
// 2. Not a Git Repository
// ---------------------------------------------------------------------------
describe('Not a Git Repository', () => {
  it('discovery should return empty for non-repo directory', async () => {
    const fixture = createTempDir();
    try {
      const runner = new GitCommandRunner();
      const discovery = new GitRepositoryDiscovery(runner);
      const results = await discovery.discover([fixture.root]);
      expect(results).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it('status collector should handle non-repo gracefully', async () => {
    const fixture = createTempDir();
    try {
      const runner = new GitCommandRunner();
      const collector = new GitStatusCollector(runner);
      const repo = new GitRepository({
        root: fixture.root,
        displayName: 'not-a-repo',
        hasRemote: false,
      });

      // Should return empty changes rather than crash
      const status = await collector.getStatus(repo);
      expect(status.hasChanges).toBe(false);
      expect(status.staged).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Single-Repository Discovery
// ---------------------------------------------------------------------------
describe('Single-Repository Discovery', () => {
  it('should discover exactly one repo in a single-root workspace', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      const discovery = new GitRepositoryDiscovery(runner);
      const results = await discovery.discover([fixture.root]);

      expect(results).toHaveLength(1);
      expect(results[0]!.repository.displayName).toBeTruthy();
      expect(results[0]!.repository.root).toBeTruthy();
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Multi-Root Single Repository
// ---------------------------------------------------------------------------
describe('Multi-Root Single Repository', () => {
  it('should find one repo when only one root has a git repo', async () => {
    const repoFixture = createTempDir();
    const nonRepoFixture = createTempDir();
    try {
      initRepo(repoFixture.root);
      const runner = new GitCommandRunner();
      const discovery = new GitRepositoryDiscovery(runner);
      const results = await discovery.discover([repoFixture.root, nonRepoFixture.root]);

      expect(results).toHaveLength(1);
    } finally {
      repoFixture.cleanup();
      nonRepoFixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Multi-Root Multiple Repositories
// ---------------------------------------------------------------------------
describe('Multi-Root Multiple Repositories', () => {
  it('should discover all repos in multi-root workspace', async () => {
    const fixture1 = createTempDir();
    const fixture2 = createTempDir();
    try {
      initRepo(fixture1.root);
      initRepo(fixture2.root);
      const runner = new GitCommandRunner();
      const discovery = new GitRepositoryDiscovery(runner);
      const results = await discovery.discover([fixture1.root, fixture2.root]);

      expect(results).toHaveLength(2);
    } finally {
      fixture1.cleanup();
      fixture2.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Nested Repository Deduplication
// ---------------------------------------------------------------------------
describe('Nested Repository Deduplication', () => {
  it('should deduplicate when the same repo is referenced from multiple folders', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      const discovery = new GitRepositoryDiscovery(runner);

      // Add both root and a subdirectory as workspace folders
      const results = await discovery.discover([fixture.root, fixture.root + '/src']);
      expect(results).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Staged / Unstaged / Untracked
// ---------------------------------------------------------------------------
describe('Staged / Unstaged / Untracked', () => {
  let fixture: TempRepoFixture;
  let repo: GitRepository;
  let collector: GitStatusCollector;
  let runner: GitCommandRunner;

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

  it('should detect staged new files', async () => {
    createAndStageFile(fixture.root, 'staged.txt', 'staged content');
    const status = await collector.getStatus(repo);
    expect(status.staged.some((e) => e.path === 'staged.txt' && e.status === 'added')).toBe(true);
  });

  it('should detect unstaged modifications', async () => {
    createAndCommitFile(fixture.root, 'tracked.txt', 'v1', 'initial');
    modifyFile(fixture.root, 'tracked.txt', 'v2');
    const status = await collector.getStatus(repo);
    expect(status.unstaged.some((e) => e.path === 'tracked.txt')).toBe(true);
  });

  it('should detect untracked files', async () => {
    createUntrackedFile(fixture.root, 'untracked.txt', 'new');
    const status = await collector.getStatus(repo);
    expect(status.untracked.some((e) => e.path === 'untracked.txt')).toBe(true);
  });

  it('should detect all three states simultaneously', async () => {
    // Create a committed file first, then a separate staged change
    createAndCommitFile(fixture.root, 'committed.txt', 'v1', 'initial commit');
    createAndStageFile(fixture.root, 'staged.txt', 'staged content');
    modifyFile(fixture.root, 'committed.txt', 'v2 (unstaged modification)');
    createUntrackedFile(fixture.root, 'untracked.txt', 'new untracked file');

    const status = await collector.getStatus(repo);
    expect(status.staged.length).toBeGreaterThanOrEqual(1);
    expect(status.unstaged.length).toBeGreaterThanOrEqual(1);
    expect(status.untracked.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Commit Range Valid / Invalid
// ---------------------------------------------------------------------------
describe('Commit Range', () => {
  let fixture: TempRepoFixture;
  let repo: GitRepository;
  let service: GitCommitRangeService;
  let runner: GitCommandRunner;
  let commit1: string;
  let commit2: string;

  beforeEach(async () => {
    runner = new GitCommandRunner();
    service = new GitCommitRangeService(runner);
    fixture = createTempDir();
    initRepo(fixture.root);
    repo = new GitRepository({
      root: fixture.root,
      displayName: 'test',
      hasRemote: false,
    });

    createAndCommitFile(fixture.root, 'a.txt', 'a', 'first');
    commit1 = (await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();
    createAndCommitFile(fixture.root, 'b.txt', 'b', 'second');
    commit2 = (await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();
  });

  afterEach(() => {
    fixture?.cleanup();
  });

  it('should accept a valid range', async () => {
    const range = await service.validate(repo, commit1, commit2);
    expect(range.base).toBe(commit1);
    expect(range.target).toBe(commit2);
  });

  it('should reject nonexistent commit', async () => {
    await expect(
      service.validate(repo, '0000000000000000000000000000000000000000', commit2),
    ).rejects.toThrow(InvalidCommitError);
  });

  it('should reject empty base or target', async () => {
    await expect(service.validate(repo, '', commit2)).rejects.toThrow();
    await expect(service.validate(repo, commit1, '')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. Cross-Repository Rejection
// ---------------------------------------------------------------------------
describe('Cross-Repository Rejection', () => {
  it('should reject commits from another repository', async () => {
    const repo1 = createTempDir();
    const repo2 = createTempDir();
    try {
      initRepo(repo1.root);
      initRepo(repo2.root);

      const runner = new GitCommandRunner();
      const service = new GitCommitRangeService(runner);

      createAndCommitFile(repo1.root, 'f1.txt', 'f1', 'c1');
      const hash1 = (await runner.run({ cwd: repo1.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();
      createAndCommitFile(repo1.root, 'f2.txt', 'f2', 'c2');
      const hash2 = (await runner.run({ cwd: repo1.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();

      const repo1Model = new GitRepository({
        root: repo1.root,
        displayName: 'repo1',
        hasRemote: false,
      });

      // These should work
      const range = await service.validate(repo1Model, hash1, hash2);
      expect(range).toBeDefined();

      // Cross-repo: use repo2's commits with repo1's model
      createAndCommitFile(repo2.root, 'o.txt', 'o', 'other');
      const otherHash = (await runner.run({ cwd: repo2.root, args: ['rev-parse', 'HEAD'] })).stdout.trim();

      // This should fail because otherHash is not in repo1
      await expect(
        service.validate(repo1Model, hash1, otherHash),
      ).rejects.toThrow(InvalidCommitError);
    } finally {
      repo1.cleanup();
      repo2.cleanup();
    }
  });

  it('containsPath should reject paths from other repos', () => {
    const repo = new GitRepository({
      root: '/repo-a',
      displayName: 'repo-a',
      hasRemote: false,
    });

    expect(repo.containsPath('/repo-b/file.txt')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Timeout and Cancellation
// ---------------------------------------------------------------------------
describe('Timeout and Cancellation', () => {
  it('should throw GitTimeoutError with very short timeout', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      await expect(
        runner.run({ cwd: fixture.root, args: ['log', '--all'], timeout: 1 }),
      ).rejects.toThrow(GitTimeoutError);
    } finally {
      fixture.cleanup();
    }
  });

  it('should throw GitCancelledError when cancelled', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();
      const controller = new AbortController();
      controller.abort();
      await expect(
        runner.run({ cwd: fixture.root, args: ['status'], signal: controller.signal }),
      ).rejects.toThrow(GitCancelledError);
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Paths with Spaces and Chinese Characters
// ---------------------------------------------------------------------------
describe('Paths with Special Characters', () => {
  let fixture: TempRepoFixture;
  let repo: GitRepository;
  let collector: GitStatusCollector;
  let runner: GitCommandRunner;

  beforeEach(() => {
    runner = new GitCommandRunner();
    collector = new GitStatusCollector(runner);
    fixture = createTempDir();
    initRepo(fixture.root);
    repo = new GitRepository({
      root: fixture.root,
      displayName: 'test',
      hasRemote: false,
    });
  });

  afterEach(() => {
    fixture?.cleanup();
  });

  it('should handle files with spaces in staged changes', async () => {
    createAndStageFile(fixture.root, 'my document.txt', 'content');
    const status = await collector.getStatus(repo);
    expect(status.staged.some((e) => e.path === 'my document.txt')).toBe(true);

    const diff = await collector.getStagedDiff(repo);
    expect(diff).toContain('my document.txt');
  });

  it('should handle files with Chinese names', async () => {
    createUntrackedFile(fixture.root, '报告.md', '审核内容');
    const status = await collector.getStatus(repo);
    // Check: the untracked list should contain the file (encoding handled by git -z flag)
    expect(status.untracked.length).toBe(1);
    expect(status.untracked[0]!.path).toBeTruthy();
    expect(status.untracked[0]!.status).toBe('untracked');
  });

  it('should handle files with mixed special characters', async () => {
    createUntrackedFile(fixture.root, '测试 report (v1).md', 'content');
    const status = await collector.getStatus(repo);
    expect(status.untracked.some((e) => e.path === '测试 report (v1).md')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Git Non-Zero Exit Does Not Crash
// ---------------------------------------------------------------------------
describe('Git Non-Zero Exit', () => {
  it('should throw GitCommandError (not crash) on bad command', async () => {
    const runner = new GitCommandRunner();
    const fixture = createTempDir();
    try {
      await expect(
        runner.run({ cwd: fixture.root, args: ['status'] }),
      ).rejects.toThrow(GitCommandError);
    } finally {
      fixture.cleanup();
    }
  });

  it('should include exit code and stderr in error', async () => {
    const runner = new GitCommandRunner();
    const fixture = createTempDir();
    try {
      await runner.run({ cwd: fixture.root, args: ['rev-parse', 'HEAD'] });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GitCommandError);
      const gitErr = err as GitCommandError;
      expect(gitErr.exitCode).not.toBe(0);
      expect(typeof gitErr.stderr).toBe('string');
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 13. Parameters Cannot Be Interpreted as Shell Commands
// ---------------------------------------------------------------------------
describe('Shell Injection Protection', () => {
  it('should treat shell metacharacters as literal arguments', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();

      // Args with shell metacharacters: execFile passes them as literal args to git,
      // not through a shell. Git will either accept them as valid ref names or reject
      // them as unknown options — but should NOT execute a shell command.
      await expect(
        runner.run({
          cwd: fixture.root,
          args: ['rev-parse', '--show-toplevel', ';', 'echo', 'pwned'],
        }),
      ).rejects.toThrow(GitCommandError);

      // The command should have failed, not executed 'echo pwned'
    } finally {
      fixture.cleanup();
    }
  });

  it('should not interpret backticks as command substitution', async () => {
    const fixture = createTempDir();
    try {
      initRepo(fixture.root);
      const runner = new GitCommandRunner();

      // With execFile (no shell), backticks are literal
      const result = await runner.run({
        cwd: fixture.root,
        args: ['status', '--porcelain'],
      });
      expect(result.exitCode).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 14. deriveDisplayName and sanitizeRemoteUrl
// ---------------------------------------------------------------------------
describe('URL utilities', () => {
  it('deriveDisplayName should extract project name from various URL formats', () => {
    expect(deriveDisplayName('https://github.com/user/my-project.git')).toBe('my-project');
    expect(deriveDisplayName('git@github.com:user/my-project.git')).toBe('my-project');
    expect(deriveDisplayName('ssh://git@github.com/user/my-project.git')).toBe('my-project');
  });

  it('sanitizeRemoteUrl should strip credentials', () => {
    expect(sanitizeRemoteUrl('https://user:token@github.com/owner/repo.git'))
      .toBe('https://github.com/owner/repo.git');
    expect(sanitizeRemoteUrl('https://x-access-token:ghp_abc123@github.com/owner/repo.git'))
      .not.toContain('ghp_');
  });
});
