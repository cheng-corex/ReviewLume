/**
 * @reviewlume/git-context — Commit range support
 *
 * Validates and retrieves diff for a commit range within a single repository.
 *
 * Security guarantees:
 * - Both base and target commits are verified to exist in the repository.
 * - Cross-repository commit ranges are rejected.
 * - All output uses NUL-delimited format for safe path handling.
 */

import { GitCommandRunner } from './commandRunner.js';
import { GitRepository, verifyCommitInRepository } from './repository.js';
import { CrossRepositoryError } from './errors.js';
import type { GitChangeEntry } from './statusSnapshot.js';

/** A validated commit range within a single repository. */
export interface CommitRange {
  /** Base commit (exclusive — range starts after this). */
  readonly base: string;
  /** Target commit (inclusive — range ends at this). */
  readonly target: string;
}

/**
 * Validates commit ranges and retrieves diffs.
 *
 * All commit references are verified against the current repository
 * before any diff operation is performed.
 */
export class GitCommitRangeService {
  constructor(private readonly runner: GitCommandRunner) {}

  /**
   * Validate that `base` and `target` are valid commits in the repository.
   *
   * @returns A validated `CommitRange` object.
   * @throws {InvalidCommitError} if either commit does not exist.
   */
  async validate(repo: GitRepository, base: string, target: string): Promise<CommitRange> {
    const trimmedBase = base.trim();
    const trimmedTarget = target.trim();

    if (!trimmedBase || !trimmedTarget) {
      throw new CrossRepositoryError('Both base and target commits must be specified.');
    }

    if (trimmedBase === trimmedTarget) {
      throw new CrossRepositoryError('Base and target commits must be different.');
    }

    // Verify both commits exist in this repository
    await verifyCommitInRepository(this.runner, repo, trimmedBase);
    await verifyCommitInRepository(this.runner, repo, trimmedTarget);

    return { base: trimmedBase, target: trimmedTarget };
  }

  /**
   * Get the full diff (patch) for a commit range.
   *
   * Uses `git diff <base>..<target> --no-color` to get the combined diff.
   */
  async getDiff(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<string> {
    // Re-validate to ensure cross-repo safety
    await verifyCommitInRepository(this.runner, repo, range.base);
    await verifyCommitInRepository(this.runner, repo, range.target);

    const result = await this.runner.run({
      cwd: repo.root,
      args: ['diff', '--no-color', `${range.base}..${range.target}`],
      signal,
    });

    return result.stdout;
  }

  /**
   * Get the list of changed files in a commit range.
   *
   * Uses `git diff <base>..<target> --name-status -z`.
   */
  async getChangedFiles(
    repo: GitRepository,
    range: CommitRange,
  ): Promise<GitChangeEntry[]> {
    // Re-validate to ensure cross-repo safety
    await verifyCommitInRepository(this.runner, repo, range.base);
    await verifyCommitInRepository(this.runner, repo, range.target);

    const result = await this.runner.run({
      cwd: repo.root,
      args: ['diff', '--no-color', '--name-status', '-z', `${range.base}..${range.target}`],
    });

    return this.#parseNameStatusZ(result.stdout);
  }

  /**
   * Get the commit log for a range (one-line format).
   */
  async getLog(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<string> {
    await verifyCommitInRepository(this.runner, repo, range.base);
    await verifyCommitInRepository(this.runner, repo, range.target);

    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'log',
        '--oneline',
        '--no-color',
        `${range.base}..${range.target}`,
      ],
      signal,
    });

    return result.stdout;
  }

  // ---- Private helpers ----

  /**
   * Parse NUL-delimited `--name-status -z` output.
   */
  #parseNameStatusZ(output: string): GitChangeEntry[] {
    const entries: GitChangeEntry[] = [];
    const parts = output.split('\0');

    let i = 0;
    while (i < parts.length) {
      const statusField = parts[i]?.trim();
      if (!statusField) {
        i++;
        continue;
      }

      const statusChar = statusField[0]!;
      const isRename = statusChar === 'R' || statusChar === 'C';
      const isCopy = statusChar === 'C';

      if (isRename || isCopy) {
        const oldPath = parts[i + 1];
        const newPath = parts[i + 2];
        if (oldPath && newPath) {
          entries.push({
            path: newPath.replace(/\\/g, '/'),
            status: isCopy ? 'copied' as const : 'renamed' as const,
            oldPath: oldPath.replace(/\\/g, '/'),
          });
          i += 3;
        } else {
          i++;
        }
      } else {
        const filePath = parts[i + 1];
        if (filePath) {
          entries.push({
            path: filePath.replace(/\\/g, '/'),
            status: this.#mapStatus(statusChar),
          });
          i += 2;
        } else {
          i++;
        }
      }
    }

    return entries;
  }

  /**
   * Map a git diff status character to our status type.
   */
  #mapStatus(char: string): GitChangeEntry['status'] {
    switch (char) {
      case 'A':
        return 'added';
      case 'M':
        return 'modified';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      default:
        return 'modified';
    }
  }
}
