/**
 * @reviewlume/git-context
 *
 * Git context retrieval for ReviewLume.
 * Handles staged, unstaged, and commit range diffs with security constraints.
 */

// Re-export core types for convenience.
export type { ReviewMode } from '@reviewlume/core';

/** Represents a single changed file entry. */
export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  oldPath?: string;
}

/** Diff content for a repository. */
export interface DiffResult {
  files: ChangedFile[];
  diffContent: string;
}

/** Git repository information. */
export interface RepositoryInfo {
  root: string;
  displayName: string;
  hasRemote: boolean;
  remoteUrl?: string;
}

/** Service for interacting with Git repositories. */
export class GitContextService {
  /**
   * Get the repository info for the given workspace folder.
   * P0: Returns a placeholder until the full implementation.
   */
  async getRepositoryInfo(_workspaceFolder: string): Promise<RepositoryInfo | null> {
    // TODO: P2 — implement actual Git detection
    return null;
  }

  /**
   * Get the diff for staged changes.
   * P0: Returns a placeholder until the full implementation.
   */
  async getStagedDiff(_repoRoot: string): Promise<DiffResult | null> {
    // TODO: P2 — implement staged diff retrieval
    return null;
  }

  /**
   * Get the diff for unstaged changes.
   * P0: Returns a placeholder until the full implementation.
   */
  async getUnstagedDiff(_repoRoot: string): Promise<DiffResult | null> {
    // TODO: P2 — implement unstaged diff retrieval
    return null;
  }

  /**
   * Get the diff for a commit range.
   * P0: Returns a placeholder until the full implementation.
   */
  async getCommitRangeDiff(_repoRoot: string, _base: string, _target: string): Promise<DiffResult | null> {
    // TODO: P2 — implement commit range diff retrieval
    return null;
  }
}
