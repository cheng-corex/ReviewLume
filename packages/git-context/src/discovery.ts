/**
 * @reviewlume/git-context — Git repository discovery
 *
 * Discovers Git repositories in workspace folders.
 * Handles single-root, multi-root, and nested repository scenarios.
 */

import * as path from 'node:path';
import { GitCommandRunner, type GitResult } from './commandRunner.js';
import { GitRepository, deriveDisplayName } from './repository.js';

/** Result of discovering a Git repository in a workspace folder. */
export interface DiscoveryResult {
  /** The workspace folder path that contains this repository. */
  readonly folderPath: string;
  /** The discovered Git repository. */
  readonly repository: GitRepository;
}

/**
 * Discovers Git repositories across workspace folders.
 *
 * Security model:
 * - Each workspace folder is checked independently.
 * - Duplicate roots (e.g. nested repos / submodules) are deduplicated.
 * - No automatic selection when multiple repos are found.
 */
export class GitRepositoryDiscovery {
  constructor(private readonly runner: GitCommandRunner) {}

  /**
   * Discover Git repositories in the given workspace folders.
   *
   * @param workspaceFolders  Absolute paths to workspace folders.
   * @returns Array of discovery results (deduplicated by repository root).
   */
  async discover(workspaceFolders: string[]): Promise<DiscoveryResult[]> {
    const results: DiscoveryResult[] = [];
    const seenRoots = new Set<string>();

    for (const folder of workspaceFolders) {
      const result = await this.#tryDiscover(folder);
      if (result && !seenRoots.has(result.repository.root)) {
        seenRoots.add(result.repository.root);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Check whether a directory is inside a Git repository.
   */
  async isGitRepository(dir: string): Promise<boolean> {
    try {
      const result = await this.runner.run({
        cwd: dir,
        args: ['rev-parse', '--is-inside-work-tree'],
      });
      return result.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Try to discover a Git repository in a single folder.
   * Returns `null` if the folder is not inside a Git repository.
   */
  async #tryDiscover(folderPath: string): Promise<DiscoveryResult | null> {
    let root: string;

    try {
      const result: GitResult = await this.runner.run({
        cwd: folderPath,
        args: ['rev-parse', '--show-toplevel'],
      });
      root = result.stdout.trim();
    } catch {
      return null;
    }

    if (!root) {
      return null;
    }

    // Resolve to an absolute path (git returns forward slashes on Windows)
    const resolvedRoot = path.resolve(root);

    // Derive display name
    const displayName = await this.#getDisplayName(resolvedRoot);

    // Check for remote
    let hasRemote = false;
    let remoteUrl: string | undefined;

    try {
      const remoteResult = await this.runner.run({
        cwd: resolvedRoot,
        args: ['remote', 'get-url', 'origin'],
      });
      const rawUrl = remoteResult.stdout.trim();
      if (rawUrl) {
        hasRemote = true;
        remoteUrl = rawUrl;
      }
    } catch {
      // No remote or multiple remotes — treat as no remote
    }

    return {
      folderPath: path.resolve(folderPath),
      repository: new GitRepository({
        root: resolvedRoot,
        displayName,
        hasRemote,
        remoteUrl,
      }),
    };
  }

  /**
   * Get a human-readable display name for a repository.
   */
  async #getDisplayName(root: string): Promise<string> {
    // Try remote URL first
    try {
      const result = await this.runner.run({
        cwd: root,
        args: ['remote', 'get-url', 'origin'],
      });
      const url = result.stdout.trim();
      if (url) {
        return deriveDisplayName(url);
      }
    } catch {
      // Fall through
    }

    // Use directory name
    return path.basename(root);
  }
}

/**
 * Convenience wrapper: discover repos and return only the root paths.
 */
export async function discoverRepositoryRoots(
  discovery: GitRepositoryDiscovery,
  workspaceFolders: string[],
): Promise<string[]> {
  const results = await discovery.discover(workspaceFolders);
  return results.map((r) => r.repository.root);
}
