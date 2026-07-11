/**
 * @reviewlume/git-context — Error types
 *
 * All error types used by the git-context package.
 * Every error carries a machine-readable `code` property
 * and a human-readable `message`.
 */

/**
 * Git is not installed or not found in PATH.
 */
export class GitNotAvailableError extends Error {
  readonly code = 'GIT_NOT_AVAILABLE' as const;

  constructor(gitPath: string) {
    super(`Git executable not found: "${gitPath}". Ensure Git is installed and available in PATH.`);
    this.name = 'GitNotAvailableError';
  }
}

/**
 * A Git command returned a non-zero exit code.
 */
export class GitCommandError extends Error {
  readonly code = 'GIT_COMMAND_ERROR' as const;

  /**
   * @param message  Human-readable description
   * @param exitCode Non-zero exit code from the git process
   * @param stderr   Standard error output (may be empty)
   */
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

/**
 * A Git command exceeded the allowed time limit.
 */
export class GitTimeoutError extends Error {
  readonly code = 'GIT_TIMEOUT' as const;

  constructor(timeoutMs: number) {
    super(`Git command timed out after ${timeoutMs} ms.`);
    this.name = 'GitTimeoutError';
  }
}

/**
 * A Git command was cancelled via AbortSignal.
 */
export class GitCancelledError extends Error {
  readonly code = 'GIT_CANCELLED' as const;

  constructor() {
    super('Git command was cancelled.');
    this.name = 'GitCancelledError';
  }
}

/**
 * The current directory is not inside a Git repository.
 */
export class NotInGitRepositoryError extends Error {
  readonly code = 'NOT_IN_GIT_REPOSITORY' as const;

  constructor(dir: string) {
    super(`Not inside a Git repository: "${dir}".`);
    this.name = 'NotInGitRepositoryError';
  }
}

/**
 * An operation attempted to cross repository boundaries.
 */
export class CrossRepositoryError extends Error {
  readonly code = 'CROSS_REPOSITORY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CrossRepositoryError';
  }
}

/**
 * A commit reference does not exist in the current repository.
 */
export class InvalidCommitError extends Error {
  readonly code = 'INVALID_COMMIT' as const;

  constructor(ref: string, repoRoot: string) {
    super(`Commit "${ref}" does not exist in repository "${repoRoot}".`);
    this.name = 'InvalidCommitError';
  }
}

/**
 * Workspace Trust is required for this operation.
 */
export class WorkspaceUntrustedError extends Error {
  readonly code = 'WORKSPACE_UNTRUSTED' as const;

  constructor() {
    super('Operation requires Workspace Trust. Please trust the workspace to use Git features.');
    this.name = 'WorkspaceUntrustedError';
  }
}

/**
 * Multiple repositories found and user selection is required.
 * This is not an error per se, but a signal to the UI layer.
 */
export class MultipleRepositoriesError extends Error {
  readonly code = 'MULTIPLE_REPOSITORIES' as const;

  constructor(count: number) {
    super(`Found ${count} Git repositories. Please select one for this review task.`);
    this.name = 'MultipleRepositoriesError';
  }
}
