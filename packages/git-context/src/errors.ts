/**
 * @reviewlume/git-context — Error types
 *
 * All error types used by the git-context package.
 * Every error carries a machine-readable `code` property
 * and a human-readable `message`.
 */

/** Git is not installed or not found in PATH. */
export class GitNotAvailableError extends Error {
  readonly code = 'GIT_NOT_AVAILABLE' as const;

  constructor(gitPath: string) {
    super(`Git executable not found: "${gitPath}". Ensure Git is installed and available in PATH.`);
    this.name = 'GitNotAvailableError';
  }
}

/** A caller attempted to execute a Git command outside ReviewLume's read-only allowlist. */
export class GitUnsafeCommandError extends Error {
  readonly code = 'GIT_UNSAFE_COMMAND' as const;

  constructor(command: string) {
    super(`Git command "${command || '<empty>'}" is not allowed by ReviewLume's read-only policy.`);
    this.name = 'GitUnsafeCommandError';
  }
}

/** A Git command returned a non-zero exit code. */
export class GitCommandError extends Error {
  readonly code = 'GIT_COMMAND_ERROR' as const;

  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitCommandError';
  }
}

/** A Git command exceeded the allowed time limit. */
export class GitTimeoutError extends Error {
  readonly code = 'GIT_TIMEOUT' as const;

  constructor(timeoutMs: number) {
    super(`Git command timed out after ${timeoutMs} ms.`);
    this.name = 'GitTimeoutError';
  }
}

/** A Git command was cancelled via AbortSignal. */
export class GitCancelledError extends Error {
  readonly code = 'GIT_CANCELLED' as const;

  constructor() {
    super('Git command was cancelled.');
    this.name = 'GitCancelledError';
  }
}

/** The current directory is not inside a Git repository. */
export class NotInGitRepositoryError extends Error {
  readonly code = 'NOT_IN_GIT_REPOSITORY' as const;

  constructor(location = 'the current workspace') {
    super(`No Git repository was found for ${location}.`);
    this.name = 'NotInGitRepositoryError';
  }
}

/** An operation attempted to cross repository boundaries. */
export class CrossRepositoryError extends Error {
  readonly code = 'CROSS_REPOSITORY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CrossRepositoryError';
  }
}

/** A commit reference does not exist in the selected repository. */
export class InvalidCommitError extends Error {
  readonly code = 'INVALID_COMMIT' as const;

  constructor(ref: string, repositoryName: string) {
    super(`Commit "${ref}" does not exist in repository "${repositoryName}".`);
    this.name = 'InvalidCommitError';
  }
}

/** Workspace Trust is required for this operation. */
export class WorkspaceUntrustedError extends Error {
  readonly code = 'WORKSPACE_UNTRUSTED' as const;

  constructor() {
    super('Operation requires Workspace Trust. Please trust the workspace to use Git features.');
    this.name = 'WorkspaceUntrustedError';
  }
}

/** Multiple repositories were found and explicit user selection is required. */
export class MultipleRepositoriesError extends Error {
  readonly code = 'MULTIPLE_REPOSITORIES' as const;

  constructor(count: number) {
    super(`Found ${count} Git repositories. Please select one for this review task.`);
    this.name = 'MultipleRepositoriesError';
  }
}
