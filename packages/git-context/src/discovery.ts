/**
 * @reviewlume/git-context — Git repository discovery
 */

import * as path from 'node:path';
import { realpathSync } from 'node:fs';
import { GitCommandRunner, type GitResult } from './commandRunner.js';
import { GitRepository, deriveDisplayName, sanitizeRemoteUrl } from './repository.js';
import { GitCommandError } from './errors.js';

export interface DiscoveryResult {
  readonly folderPath: string;
  readonly repository: GitRepository;
}

function stripLineEnding(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function rootKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

/** Discovers Git repositories across workspace folders. */
export class GitRepositoryDiscovery {
  constructor(private readonly runner: GitCommandRunner) {}

  async discover(
    workspaceFolders: readonly string[],
    signal?: AbortSignal,
  ): Promise<DiscoveryResult[]> {
    const results: DiscoveryResult[] = [];
    const seenRoots = new Set<string>();

    for (const folder of workspaceFolders) {
      const result = await this.#tryDiscover(folder, signal);
      if (!result) continue;

      const key = rootKey(result.repository.root);
      if (!seenRoots.has(key)) {
        seenRoots.add(key);
        results.push(result);
      }
    }

    return results;
  }

  /** Return false only for the expected "not a repository" Git failure. */
  async isGitRepository(dir: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const result = await this.runner.run({
        cwd: dir,
        args: ['rev-parse', '--is-inside-work-tree'],
        signal,
      });
      return result.stdout.trim() === 'true';
    } catch (error) {
      if (error instanceof GitCommandError) {
        return false;
      }
      throw error;
    }
  }

  async #tryDiscover(
    folderPath: string,
    signal?: AbortSignal,
  ): Promise<DiscoveryResult | null> {
    let rootOutput: GitResult;
    try {
      rootOutput = await this.runner.run({
        cwd: folderPath,
        args: ['rev-parse', '--show-toplevel'],
        signal,
      });
    } catch (error) {
      if (error instanceof GitCommandError) {
        return null;
      }
      throw error;
    }

    const root = stripLineEnding(rootOutput.stdout);
    if (!root) return null;

    const resolvedRoot = canonicalPath(root);
    let remoteUrl: string | undefined;

    try {
      const remoteResult = await this.runner.run({
        cwd: resolvedRoot,
        args: ['remote', 'get-url', 'origin'],
        signal,
      });
      const rawUrl = stripLineEnding(remoteResult.stdout);
      if (rawUrl) {
        remoteUrl = sanitizeRemoteUrl(rawUrl);
      }
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw error;
      }
      // A repository without an origin remote is valid.
    }

    const displayName = remoteUrl ? deriveDisplayName(remoteUrl) : path.basename(resolvedRoot);

    return {
      folderPath: canonicalPath(folderPath),
      repository: new GitRepository({
        root: resolvedRoot,
        displayName,
        hasRemote: Boolean(remoteUrl),
        remoteUrl,
      }),
    };
  }
}

export async function discoverRepositoryRoots(
  discovery: GitRepositoryDiscovery,
  workspaceFolders: readonly string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const results = await discovery.discover(workspaceFolders, signal);
  return results.map((result) => result.repository.root);
}
