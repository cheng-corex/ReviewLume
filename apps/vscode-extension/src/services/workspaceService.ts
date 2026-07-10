import * as vscode from 'vscode';

/**
 * Describes the current workspace state relevant to ReviewLume.
 */
export enum WorkspaceState {
  /** No workspace folder is open. */
  NoWorkspace = 'no-workspace',
  /** Workspace is open but not fully trusted (Restricted Mode). */
  Untrusted = 'untrusted',
  /** Workspace is trusted, but Git detection explicitly found no repository. */
  NoGit = 'no-git',
  /** Workspace is open and trusted; Git may be detected in a later phase. */
  Ready = 'ready',
}

/**
 * Convenience type alias for the workspace state enum values.
 */
export type WorkspaceStateValue = `${WorkspaceState}`;

/**
 * Pure input used to evaluate workspace state.
 *
 * `hasGitRepository` is optional because P1 does not inspect Git yet. P2 can
 * pass an explicit boolean once repository discovery is implemented.
 */
export interface WorkspaceSnapshot {
  hasWorkspace: boolean;
  isTrusted: boolean;
  hasGitRepository?: boolean;
}

/** Evaluate a workspace snapshot without reading VS Code global state. */
export function evaluateWorkspaceState(snapshot: WorkspaceSnapshot): WorkspaceState {
  if (!snapshot.hasWorkspace) {
    return WorkspaceState.NoWorkspace;
  }

  if (!snapshot.isTrusted) {
    return WorkspaceState.Untrusted;
  }

  if (snapshot.hasGitRepository === false) {
    return WorkspaceState.NoGit;
  }

  return WorkspaceState.Ready;
}

/**
 * Determine the current workspace state.
 *
 * P1 intentionally checks only folder presence and Workspace Trust. Git
 * repository discovery belongs to P2, so no Git result is assumed here.
 */
export function getWorkspaceState(): WorkspaceState {
  const folders = vscode.workspace.workspaceFolders;
  return evaluateWorkspaceState({
    hasWorkspace: Boolean(folders && folders.length > 0),
    isTrusted: vscode.workspace.isTrusted,
  });
}

/** Return the user-facing warning for a specific workspace state. */
export function getWorkspaceWarningForState(state: WorkspaceState): string | null {
  switch (state) {
    case WorkspaceState.NoWorkspace:
      return 'No workspace folder is open. Open a folder or workspace to use ReviewLume features.';
    case WorkspaceState.Untrusted:
      return 'Workspace is in Restricted Mode. Trust the workspace to enable ReviewLume features.';
    case WorkspaceState.NoGit:
      return 'No Git repository detected in the current workspace. ReviewLume requires a Git repository.';
    case WorkspaceState.Ready:
      return null;
  }
}

/**
 * Get a human-readable description of the current workspace state.
 * Returns `null` when ReviewLume operations can proceed.
 */
export function getWorkspaceWarning(): string | null {
  return getWorkspaceWarningForState(getWorkspaceState());
}
