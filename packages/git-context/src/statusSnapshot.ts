/**
 * @reviewlume/git-context — Git status snapshot
 *
 * Collects staged, unstaged, and untracked changes from a Git repository.
 *
 * All git commands use `-z` (NUL-delimited) output to safely handle
 * paths containing spaces, newlines, and non-ASCII characters.
 */

import { GitCommandRunner } from './commandRunner.js';
import { GitRepository } from './repository.js';

/** Status of a single changed file. */
export interface GitChangeEntry {
  /** Path relative to repository root (forward slashes). */
  readonly path: string;
  /** Type of change. */
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  /** Previous path (for renames/copies). */
  readonly oldPath?: string;
}

/** Snapshot of the current Git status. */
export interface GitStatusSnapshot {
  /** The repository this snapshot is for. */
  readonly repository: GitRepository;
  /** Changes staged for commit. */
  readonly staged: GitChangeEntry[];
  /** Unstaged changes in the working tree. */
  readonly unstaged: GitChangeEntry[];
  /** Untracked files. */
  readonly untracked: GitChangeEntry[];
  /** Whether there are any changes at all. */
  readonly hasChanges: boolean;
}

/**
 * Collects and parses Git status information.
 *
 * Uses three separate git commands for clarity:
 * 1. `git diff --cached --name-status -z`  → staged changes
 * 2. `git diff --name-status -z`           → unstaged changes
 * 3. `git ls-files --others --exclude-standard -z` → untracked files
 */
export class GitStatusCollector {
  constructor(private readonly runner: GitCommandRunner) {}

  /**
   * Collect the full status snapshot for a repository.
   */
  async getStatus(repo: GitRepository): Promise<GitStatusSnapshot> {
    const [staged, unstaged, untracked] = await Promise.all([
      this.#getStaged(repo),
      this.#getUnstaged(repo),
      this.#getUntracked(repo),
    ]);

    return {
      repository: repo,
      staged,
      unstaged,
      untracked,
      get hasChanges(): boolean {
        return staged.length > 0 || unstaged.length > 0 || untracked.length > 0;
      },
    };
  }

  /**
   * Get the staged diff content (full patch).
   */
  async getStagedDiff(repo: GitRepository, signal?: AbortSignal): Promise<string> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['diff', '--cached', '--no-color'],
      signal,
    });
    return result.stdout;
  }

  /**
   * Get the unstaged diff content (full patch).
   */
  async getUnstagedDiff(repo: GitRepository, signal?: AbortSignal): Promise<string> {
    const result = await this.runner.run({
      cwd: repo.root,
      args: ['diff', '--no-color'],
      signal,
    });
    return result.stdout;
  }

  // ---- Private helpers ----

  /**
   * Parse staged changes using `git diff --cached --name-status -z`.
   */
  async #getStaged(repo: GitRepository): Promise<GitChangeEntry[]> {
    try {
      const result = await this.runner.run({
        cwd: repo.root,
        args: ['diff', '--cached', '--name-status', '-z'],
      });
      return this.#parseNameStatusZ(result.stdout, 'staged');
    } catch {
      return [];
    }
  }

  /**
   * Parse unstaged changes using `git diff --name-status -z`.
   */
  async #getUnstaged(repo: GitRepository): Promise<GitChangeEntry[]> {
    try {
      const result = await this.runner.run({
        cwd: repo.root,
        args: ['diff', '--name-status', '-z'],
      });
      return this.#parseNameStatusZ(result.stdout, 'unstaged');
    } catch {
      return [];
    }
  }

  /**
   * Parse untracked files using `git ls-files --others --exclude-standard -z`.
   */
  async #getUntracked(repo: GitRepository): Promise<GitChangeEntry[]> {
    try {
      const result = await this.runner.run({
        cwd: repo.root,
        args: ['ls-files', '--others', '--exclude-standard', '-z'],
      });
      return this.#parseUntrackedZ(result.stdout);
    } catch {
      return [];
    }
  }

  /**
   * Parse NUL-delimited `--name-status -z` output.
   *
   * Format: `<status>\0<path>\0`
   * Renames: `R<score>\0<old_path>\0<new_path>\0`
   */
  #parseNameStatusZ(output: string, _source: 'staged' | 'unstaged'): GitChangeEntry[] {
    const entries: GitChangeEntry[] = [];
    const parts = output.split('\0');

    let i = 0;
    while (i < parts.length) {
      const statusField = parts[i]?.trim();
      if (!statusField) {
        i++;
        continue;
      }

      // Parse the status character
      const statusChar = statusField[0]!;
      const isRename = statusChar === 'R' || statusChar === 'C';
      const isCopy = statusChar === 'C';

      if (isRename || isCopy) {
        // Rename/Copy: status field includes score (e.g. "R100")
        const oldPath = parts[i + 1];
        const newPath = parts[i + 2];
        if (oldPath && newPath) {
          entries.push({
            path: this.#normalizePath(newPath),
            status: isCopy ? 'copied' : 'renamed',
            oldPath: this.#normalizePath(oldPath),
          });
          i += 3;
        } else {
          i++;
        }
      } else {
        // Standard: status field is a single char, then path
        const filePath = parts[i + 1];
        if (filePath) {
          entries.push({
            path: this.#normalizePath(filePath),
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
   * Parse NUL-delimited untracked file list.
   */
  #parseUntrackedZ(output: string): GitChangeEntry[] {
    const entries: GitChangeEntry[] = [];
    const parts = output.split('\0');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) {
        entries.push({
          path: this.#normalizePath(trimmed),
          status: 'untracked',
        });
      }
    }

    return entries;
  }

  /**
   * Map a single git diff status character to our status type.
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

  /**
   * Normalize path separators to forward slashes.
   */
  #normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
  }
}
