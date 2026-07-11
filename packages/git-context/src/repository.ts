/**
 * @reviewlume/git-context — Git repository model
 *
 * Represents a single Git repository with path-boundary validation.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { GitCommandRunner } from './commandRunner.js';
import { CrossRepositoryError, GitCommandError, InvalidCommitError } from './errors.js';

/** Data required to construct a GitRepository. */
export interface GitRepositoryData {
  /** Absolute path to the repository root. */
  readonly root: string;
  /** Human-readable display name. */
  readonly displayName: string;
  /** Whether the repository has an origin remote. */
  readonly hasRemote: boolean;
  /** Sanitized remote URL. Credential-bearing user info is never retained. */
  readonly remoteUrl?: string;
}

/** Immutable Git repository representation. */
export class GitRepository {
  readonly #root: string;
  readonly #displayName: string;
  readonly #hasRemote: boolean;
  readonly #remoteUrl: string | undefined;

  constructor(data: GitRepositoryData) {
    this.#root = path.resolve(data.root);
    this.#displayName = data.displayName;
    this.#hasRemote = data.hasRemote;
    this.#remoteUrl = data.remoteUrl ? sanitizeRemoteUrl(data.remoteUrl) : undefined;
  }

  get root(): string {
    return this.#root;
  }

  get displayName(): string {
    return this.#displayName;
  }

  get hasRemote(): boolean {
    return this.#hasRemote;
  }

  /** Sanitized remote URL, if present. */
  get remoteUrl(): string | undefined {
    return this.#remoteUrl;
  }

  /** Check whether a resolved path is inside this repository. */
  containsPath(filePath: string): boolean {
    const resolved = path.resolve(this.#root, filePath);
    const relative = path.relative(this.#root, resolved);
    return (
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
  }

  /** Check whether a resolved path is strictly inside the repository root. */
  containsStrict(filePath: string): boolean {
    const resolved = path.resolve(this.#root, filePath);
    const relative = path.relative(this.#root, resolved);
    return (
      relative !== '' &&
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  }
}

/** Derive a display name from a remote URL. */
export function deriveDisplayName(remoteUrl: string): string {
  const sanitized = sanitizeRemoteUrl(remoteUrl);

  try {
    const url = new URL(sanitized);
    const pathname = url.pathname.replace(/\.git$/, '');
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url.hostname;
  } catch {
    const match = sanitized.match(/[:/]([^/]+?)(?:\.git)?$/);
    return match?.[1] || 'repository';
  }
}

/**
 * Strip credentials from a remote URL before it is stored, displayed, logged,
 * or used as repository identity input.
 */
export function sanitizeRemoteUrl(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace('//@', '//');
  } catch {
    const scpStyle = trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scpStyle && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
      return `ssh://${scpStyle[1]}/${scpStyle[2]}`;
    }

    return trimmed.replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      '$1[REDACTED]@',
    );
  }
}

/** Resolve a relative path inside the repository. */
export function resolveSafePath(repo: GitRepository, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new CrossRepositoryError('Only relative repository paths are allowed.');
  }

  const resolved = path.resolve(repo.root, relativePath);
  if (!repo.containsStrict(resolved)) {
    throw new CrossRepositoryError(
      `Path "${relativePath}" resolves outside repository "${repo.displayName}".`,
    );
  }

  if (!fs.existsSync(resolved)) {
    throw new CrossRepositoryError(
      `Path "${relativePath}" does not exist in repository "${repo.displayName}".`,
    );
  }

  return resolved;
}

/** Verify a commit reference and return its canonical object ID. */
export async function verifyCommitInRepository(
  runner: GitCommandRunner,
  repo: GitRepository,
  ref: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await runner.run({
      cwd: repo.root,
      args: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`],
      signal,
    });
    const objectId = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(objectId)) {
      throw new GitCommandError('Git returned an invalid commit object ID.', 1, '');
    }
    return objectId.toLowerCase();
  } catch (error) {
    if (error instanceof GitCommandError) {
      throw new InvalidCommitError(ref, repo.displayName);
    }
    throw error;
  }
}
