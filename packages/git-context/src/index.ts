/**
 * @reviewlume/git-context
 *
 * Git context retrieval for ReviewLume.
 * Handles staged, unstaged, and commit range diffs with security constraints.
 *
 * # Architecture
 *
 * ```
 *                     ┌─────────────────────┐
 *                     │   GitCommandRunner   │  ← Safe git subprocess via execFile
 *                     ├─────────────────────┤
 *                     │   GitRepository      │  ← Immutable repo model with path boundary
 *                     ├─────────────────────┤
 *                     │ GitRepositoryDiscovery│ ← Discover repos in workspace folders
 *                     ├─────────────────────┤
 *                     │ GitStatusCollector   │  ← Staged / unstaged / untracked
 *                     ├─────────────────────┤
 *                     │ GitCommitRangeService│ ← Commit range validation & diff
 *                     └─────────────────────┘
 * ```
 *
 * # Security
 *
 * - All git commands use `child_process.execFile` with parameter arrays.
 * - No `shell: true` or string concatenation.
 * - Repository boundaries are enforced for all file and commit operations.
 * - Remote URLs are sanitized before exposure (credentials stripped).
 * - Write operations (checkout, reset, commit, etc.) are never executed.
 * - Workspace Trust must be verified before running any git command.
 *
 * @packageDocumentation
 */

// Re-export core types for convenience.
export type { ReviewMode } from '@reviewlume/core';

// Error types
export {
  GitNotAvailableError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
  NotInGitRepositoryError,
  CrossRepositoryError,
  InvalidCommitError,
  WorkspaceUntrustedError,
  MultipleRepositoriesError,
} from './errors.js';

// Command runner
export { GitCommandRunner } from './commandRunner.js';
export type { GitResult, GitCommandOptions } from './commandRunner.js';

// Repository model
export { GitRepository, deriveDisplayName, sanitizeRemoteUrl, resolveSafePath, verifyCommitInRepository } from './repository.js';
export type { GitRepositoryData } from './repository.js';

// Repository discovery
export { GitRepositoryDiscovery, discoverRepositoryRoots } from './discovery.js';
export type { DiscoveryResult } from './discovery.js';

// Status snapshot
export { GitStatusCollector } from './statusSnapshot.js';
export type { GitChangeEntry, GitStatusSnapshot } from './statusSnapshot.js';

// Commit range
export { GitCommitRangeService } from './commitRange.js';
export type { CommitRange } from './commitRange.js';
