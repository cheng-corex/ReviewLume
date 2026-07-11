/**
 * @reviewlume/git-context
 *
 * Read-only Git context retrieval for ReviewLume.
 *
 * Security properties:
 * - Git is invoked with execFile and argument arrays, never a shell.
 * - A read-only command allowlist rejects write-capable commands.
 * - External diff and textconv execution are disabled.
 * - Repository boundaries are validated before file operations.
 * - Credential-bearing remote user info is discarded before storage.
 * - Callers must enforce Workspace Trust before invoking the package.
 *
 * @packageDocumentation
 */

export type { ReviewMode } from '@reviewlume/core';

export {
  GitNotAvailableError,
  GitUnsafeCommandError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
  NotInGitRepositoryError,
  CrossRepositoryError,
  InvalidCommitError,
  WorkspaceUntrustedError,
  MultipleRepositoriesError,
} from './errors.js';

export {
  GitCommandRunner,
  assertReadOnlyGitCommand,
  redactGitDiagnostic,
} from './commandRunner.js';
export type { GitResult, GitCommandOptions } from './commandRunner.js';

export {
  GitRepository,
  deriveDisplayName,
  sanitizeRemoteUrl,
  resolveSafePath,
  verifyCommitInRepository,
} from './repository.js';
export type { GitRepositoryData } from './repository.js';

export { GitRepositoryDiscovery, discoverRepositoryRoots } from './discovery.js';
export type { DiscoveryResult } from './discovery.js';

export { GitStatusCollector } from './statusSnapshot.js';
export type { GitChangeEntry, GitStatusSnapshot } from './statusSnapshot.js';

export { GitCommitRangeService } from './commitRange.js';
export type { CommitRange } from './commitRange.js';
