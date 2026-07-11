/**
 * @reviewlume/git-context — Git status snapshot
 *
 * Collects staged, unstaged, and untracked changes from a Git repository.
 * Porcelain v2 with NUL delimiters is the source of truth so status remains
 * consistent with `git status` even when diff-only commands omit a path.
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

interface ParsedStatus {
  readonly staged: GitChangeEntry[];
  readonly unstaged: GitChangeEntry[];
  readonly untracked: GitChangeEntry[];
}

/** Collects and parses Git status information. */
export class GitStatusCollector {
  constructor(private readonly runner: GitCommandRunner) {}

  async getStatus(
    repo: GitRepository,
    signal?: AbortSignal,
  ): Promise<GitStatusSnapshot> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
      signal,
    });
    const parsed = this.#parsePorcelainV2Z(result.stdout);

    return {
      repository: repo,
      ...parsed,
      hasChanges:
        parsed.staged.length > 0 ||
        parsed.unstaged.length > 0 ||
        parsed.untracked.length > 0,
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

  #parsePorcelainV2Z(output: string): ParsedStatus {
    const staged: GitChangeEntry[] = [];
    const unstaged: GitChangeEntry[] = [];
    const untracked: GitChangeEntry[] = [];
    const records = output.split('\0');

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index] ?? '';
      if (!record) continue;

      if (record.startsWith('? ')) {
        const filePath = record.slice(2);
        if (filePath) untracked.push({ path: filePath, status: 'untracked' });
        continue;
      }

      if (record.startsWith('! ') || record.startsWith('# ')) continue;

      if (record.startsWith('1 ')) {
        const parsed = this.#splitRecord(record, 8);
        if (!parsed) continue;
        this.#appendTracked(parsed.xy, parsed.path, undefined, staged, unstaged);
        continue;
      }

      if (record.startsWith('2 ')) {
        const parsed = this.#splitRecord(record, 9);
        const oldPath = records[index + 1];
        if (!parsed || oldPath === undefined) continue;
        index += 1;
        this.#appendTracked(parsed.xy, parsed.path, oldPath, staged, unstaged);
        continue;
      }

      if (record.startsWith('u ')) {
        const parsed = this.#splitRecord(record, 10);
        if (!parsed) continue;
        const entry: GitChangeEntry = { path: parsed.path, status: 'unmerged' };
        staged.push(entry);
        unstaged.push(entry);
      }
    }

    return { staged, unstaged, untracked };
  }

  #splitRecord(record: string, spacesBeforePath: number): { xy: string; path: string } | undefined {
    let cursor = 0;
    for (let count = 0; count < spacesBeforePath; count += 1) {
      cursor = record.indexOf(' ', cursor);
      if (cursor < 0) return undefined;
      cursor += 1;
    }
    const xyEnd = record.indexOf(' ', 2);
    if (xyEnd < 0) return undefined;
    const xy = record.slice(2, xyEnd);
    const filePath = record.slice(cursor);
    return xy.length === 2 && filePath ? { xy, path: filePath } : undefined;
  }

  #appendTracked(
    xy: string,
    filePath: string,
    oldPath: string | undefined,
    staged: GitChangeEntry[],
    unstaged: GitChangeEntry[],
  ): void {
    const indexStatus = xy[0] ?? '.';
    const worktreeStatus = xy[1] ?? '.';

    if (indexStatus !== '.') {
      staged.push({
        path: filePath,
        status: this.#mapStatus(indexStatus),
        ...(oldPath && (indexStatus === 'R' || indexStatus === 'C') ? { oldPath } : {}),
      });
    }
    if (worktreeStatus !== '.') {
      unstaged.push({
        path: filePath,
        status: this.#mapStatus(worktreeStatus),
        ...(oldPath && (worktreeStatus === 'R' || worktreeStatus === 'C') ? { oldPath } : {}),
      });
    }
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
