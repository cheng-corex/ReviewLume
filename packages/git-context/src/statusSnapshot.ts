/**
 * @reviewlume/git-context — Git status snapshot
 *
 * Collects staged, unstaged, and untracked changes from a Git repository.
 * NUL-delimited output is parsed without trimming or separator rewriting so
 * valid POSIX filenames containing whitespace, newlines, or backslashes are
 * preserved exactly.
 */

import { GitCommandRunner } from './commandRunner.js';
import { GitRepository } from './repository.js';

export interface GitChangeEntry {
  /** Path relative to repository root, exactly as emitted by Git. */
  readonly path: string;
  readonly status:
    | 'added'
    | 'modified'
    | 'deleted'
    | 'renamed'
    | 'copied'
    | 'type-changed'
    | 'unmerged'
    | 'unknown'
    | 'untracked';
  readonly oldPath?: string;
}

export interface GitStatusSnapshot {
  readonly repository: GitRepository;
  readonly staged: GitChangeEntry[];
  readonly unstaged: GitChangeEntry[];
  readonly untracked: GitChangeEntry[];
  readonly hasChanges: boolean;
}

/** Collects and parses Git status information. */
export class GitStatusCollector {
  constructor(private readonly runner: GitCommandRunner) {}

  async getStatus(
    repo: GitRepository,
    signal?: AbortSignal,
  ): Promise<GitStatusSnapshot> {
    const [staged, unstaged, untracked] = await Promise.all([
      this.#getStaged(repo, signal),
      this.#getUnstaged(repo, signal),
      this.#getUntracked(repo, signal),
    ]);

    return {
      repository: repo,
      staged,
      unstaged,
      untracked,
      hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
    };
  }

  async getStagedDiff(repo: GitRepository, signal?: AbortSignal): Promise<string> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'diff',
        '--cached',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--',
      ],
      signal,
    });
    return result.stdout;
  }

  async getUnstagedDiff(repo: GitRepository, signal?: AbortSignal): Promise<string> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--'],
      signal,
    });
    return result.stdout;
  }

  async #getStaged(
    repo: GitRepository,
    signal?: AbortSignal,
  ): Promise<GitChangeEntry[]> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'diff',
        '--cached',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--',
      ],
      signal,
    });
    return this.#parseNameStatusZ(result.stdout);
  }

  async #getUnstaged(
    repo: GitRepository,
    signal?: AbortSignal,
  ): Promise<GitChangeEntry[]> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: [
        'diff',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--',
      ],
      signal,
    });
    return this.#parseNameStatusZ(result.stdout);
  }

  async #getUntracked(
    repo: GitRepository,
    signal?: AbortSignal,
  ): Promise<GitChangeEntry[]> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['ls-files', '--others', '--exclude-standard', '-z', '--'],
      signal,
    });
    return this.#parseUntrackedZ(result.stdout);
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
      const isRenameOrCopy = statusChar === 'R' || statusChar === 'C';

      if (isRenameOrCopy) {
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

  #parseUntrackedZ(output: string): GitChangeEntry[] {
    return output
      .split('\0')
      .filter((filePath) => filePath !== '')
      .map((filePath) => ({ path: filePath, status: 'untracked' as const }));
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
