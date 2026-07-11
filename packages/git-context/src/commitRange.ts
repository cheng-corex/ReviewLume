/**
 * @reviewlume/git-context — Commit range support
 */

import { GitCommandRunner } from './commandRunner.js';
import { GitRepository, verifyCommitInRepository } from './repository.js';
import { CrossRepositoryError } from './errors.js';
import type { GitChangeEntry } from './statusSnapshot.js';

/** A validated commit range represented by canonical object IDs. */
export interface CommitRange {
  readonly base: string;
  readonly target: string;
}

/** Validates commit ranges and retrieves read-only diffs. */
export class GitCommitRangeService {
  constructor(private readonly runner: GitCommandRunner) {}

  async validate(
    repo: GitRepository,
    base: string,
    target: string,
    signal?: AbortSignal,
  ): Promise<CommitRange> {
    const baseRef = base.trim();
    const targetRef = target.trim();

    if (!baseRef || !targetRef) {
      throw new CrossRepositoryError('Both base and target commits must be specified.');
    }

    const [baseObjectId, targetObjectId] = await Promise.all([
      verifyCommitInRepository(this.runner, repo, baseRef, signal),
      verifyCommitInRepository(this.runner, repo, targetRef, signal),
    ]);

    if (baseObjectId === targetObjectId) {
      throw new CrossRepositoryError('Base and target resolve to the same commit.');
    }

    return { base: baseObjectId, target: targetObjectId };
  }

  async getDiff(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<string> {
    const validated = await this.#revalidate(repo, range, signal);
    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        `${validated.base}..${validated.target}`,
        '--',
      ],
      signal,
    });
    return result.stdout;
  }

  async getChangedFiles(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<GitChangeEntry[]> {
    const validated = await this.#revalidate(repo, range, signal);
    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'diff',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        `${validated.base}..${validated.target}`,
        '--',
      ],
      signal,
    });
    return this.#parseNameStatusZ(result.stdout);
  }

  async getLog(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<string> {
    const validated = await this.#revalidate(repo, range, signal);
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['log', '--oneline', '--no-color', `${validated.base}..${validated.target}`, '--'],
      signal,
    });
    return result.stdout;
  }

  async #revalidate(
    repo: GitRepository,
    range: CommitRange,
    signal?: AbortSignal,
  ): Promise<CommitRange> {
    const [base, target] = await Promise.all([
      verifyCommitInRepository(this.runner, repo, range.base, signal),
      verifyCommitInRepository(this.runner, repo, range.target, signal),
    ]);
    if (base === target) {
      throw new CrossRepositoryError('Base and target resolve to the same commit.');
    }
    return { base, target };
  }

  #parseNameStatusZ(output: string): GitChangeEntry[] {
    const entries: GitChangeEntry[] = [];
    const parts = output.split('\0');
    let index = 0;

    while (index < parts.length) {
      const statusField = parts[index];
      if (statusField === undefined || statusField === '') {
        index += 1;
        continue;
      }

      const statusChar = statusField[0] ?? '';
      if (statusChar === 'R' || statusChar === 'C') {
        const oldPath = parts[index + 1];
        const newPath = parts[index + 2];
        if (oldPath !== undefined && newPath !== undefined && oldPath !== '' && newPath !== '') {
          entries.push({
            path: newPath,
            status: statusChar === 'C' ? 'copied' : 'renamed',
            oldPath,
          });
          index += 3;
          continue;
        }
      } else {
        const filePath = parts[index + 1];
        if (filePath !== undefined && filePath !== '') {
          entries.push({ path: filePath, status: this.#mapStatus(statusChar) });
          index += 2;
          continue;
        }
      }

      index += 1;
    }

    return entries;
  }

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
      case 'T':
        return 'type-changed';
      case 'U':
        return 'unmerged';
      default:
        return 'unknown';
    }
  }
}
