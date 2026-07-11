/**
 * @reviewlume/git-context — Git repository model
 *
 * Represents a single Git repository with path-boundary validation.
 * All path comparisons use resolved absolute paths to prevent
 * directory traversal and cross-repository access.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { GitCommandRunner } from './commandRunner.js';
import { CrossRepositoryError, InvalidCommitError } from './errors.js';

/** Data required to construct a GitRepository. */
export interface GitRepositoryData {
  /** Absolute path to the repository root (resolved, no trailing slash). */
  readonly root: string;
  /** Human-readable display name (e.g. "reviewlume"). */
  readonly displayName: string;
  /** Whether the repository has a remote named "origin". */
  readonly hasRemote: boolean;
  /** Raw remote URL (may contain credentials — handle with care). */
  readonly remoteUrl?: string;
}

/**
 * Immutable Git repository representation.
 *
 * Every GitRepository is tied to one resolved root path and provides
 * boundary checking to prevent cross-repository access.
 */
export class GitRepository {
  readonly #root: string;
  readonly #displayName: string;
  readonly #hasRemote: boolean;
  readonly #remoteUrl: string | undefined;

  constructor(data: GitRepositoryData) {
    // Normalize and resolve the root path
    this.#root = path.resolve(data.root);
    this.#displayName = data.displayName;
    this.#hasRemote = data.hasRemote;
    this.#remoteUrl = data.remoteUrl;
  }

  /** Absolute, resolved path to the repository root. */
  get root(): string {
    return this.#root;
  }

  /** Human-readable display name. */
  get displayName(): string {
    return this.#displayName;
  }

  /** Whether the repo has a remote named "origin". */
  get hasRemote(): boolean {
    return this.#hasRemote;
  }

  /**
   * Sanitized remote URL (credentials stripped).
   * Returns `undefined` if no remote or if sanitization fails.
   */
  get remoteUrl(): string | undefined {
    return this.#remoteUrl ? sanitizeRemoteUrl(this.#remoteUrl) : undefined;
  }

  /**
   * Raw remote URL — only for internal workspaceId computation.
   * Never log, display, or persist this value.
   */
  get rawRemoteUrl(): string | undefined {
    return this.#remoteUrl;
  }

  /**
   * Check whether `filePath` is inside this repository.
   *
   * Resolves the path and verifies it starts with the repository root.
   * This prevents `../` traversal and symlink escapes to parent dirs.
   */
  containsPath(filePath: string): boolean {
    const resolved = path.resolve(this.#root, filePath);
    // Ensure the resolved path starts with the repo root
    const normalizedRoot = this.#root.endsWith(path.sep)
      ? this.#root
      : this.#root + path.sep;
    return resolved.startsWith(normalizedRoot) || resolved === this.#root;
  }

  /**
   * Verify that the resolved path is strictly inside the repository
   * (not equal to the root itself) — useful for file-level checks.
   */
  containsStrict(filePath: string): boolean {
    const resolved = path.resolve(this.#root, filePath);
    const normalizedRoot = this.#root.endsWith(path.sep)
      ? this.#root
      : this.#root + path.sep;
    return resolved.startsWith(normalizedRoot) && resolved !== this.#root;
  }
}

/**
 * Derive a display name from a remote URL.
 */
export function deriveDisplayName(remoteUrl: string): string {
  const sanitized = sanitizeRemoteUrl(remoteUrl);

  try {
    const url = new URL(sanitized);
    const pathname = url.pathname.replace(/\.git$/, '');
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url.hostname;
  } catch {
    // SSH-style: git@github.com:owner/repo.git
    const match = sanitized.match(/[:/]([^/]+?)(?:\.git)?$/);
    if (match) {
      return match[1]!;
    }
    // Fallback: use the URL itself
    return sanitized;
  }
}

/**
 * Strip credentials from a remote URL.
 *
 * - `https://user:token@host.com/owner/repo.git` → `https://host.com/owner/repo.git`
 * - SSH URLs (`git@host.com:owner/repo.git`) have no credentials to strip.
 */
export function sanitizeRemoteUrl(url: string): string {
  // Strip trailing newlines/spaces
  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);
    if (parsed.username) {
      parsed.username = '';
      parsed.password = '';
      // URL parsing removes the username but leaves '://' - reconstruct
      return parsed.toString().replace('//@', '//');
    }
    return parsed.toString();
  } catch {
    // Not a URL (e.g. SSH git@ style), return as-is — no credentials to strip
    return trimmed;
  }
}

/**
 * Resolve a relative path inside the repository.
 * Throws if the resolved path escapes the repository.
 */
export function resolveSafePath(repo: GitRepository, relativePath: string): string {
  const resolved = path.resolve(repo.root, relativePath);
  if (!repo.containsPath(resolved)) {
    throw new CrossRepositoryError(
      `Path "${relativePath}" resolves outside the repository "${repo.displayName}".`,
    );
  }

  // Verify the path actually exists
  if (!fs.existsSync(resolved)) {
    throw new CrossRepositoryError(
      `Path "${relativePath}" does not exist in repository "${repo.displayName}".`,
    );
  }

  return resolved;
}

/**
 * Verify that a commit reference exists in the given repository.
 *
 * @throws {InvalidCommitError} if the commit does not exist.
 */
export async function verifyCommitInRepository(
  runner: GitCommandRunner,
  repo: GitRepository,
  ref: string,
): Promise<void> {
  try {
    await runner.run({
      cwd: repo.root,
      args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    });
  } catch {
    throw new InvalidCommitError(ref, repo.root);
  }
}
