import * as vscode from 'vscode';

/**
 * Describes the current workspace state relevant to ReviewLume.
 */
export enum WorkspaceState {
  /** No workspace folder is open. */
  NoWorkspace = 'no-workspace',
  /** Workspace is open but not fully trusted (Restricted Mode). */
  Untrusted = 'untrusted',
  /** Workspace is open and trusted, but no Git repository was detected. */
  NoGit = 'no-git',
  /** Workspace is open, trusted, and has at least one Git repository. */
  Ready = 'ready',
}

/**
 * Convenience type alias for the workspace state enum values.
 */
export type WorkspaceStateValue = `${WorkspaceState}`;

/**
 * Determine the current workspace state.
 *
 * Order of checks:
 *  1. No workspace folders → NoWorkspace
 *  2. Workspace not trusted → Untrusted
 *  3. Workspace trusted with folders → Ready (Git detection in P2)
 */
export function getWorkspaceState(): WorkspaceState {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return WorkspaceState.NoWorkspace;
  }

  if (!vscode.workspace.isTrusted) {
    return WorkspaceState.Untrusted;
  }

  // Git repository detection will be added in P2.
  // For P1 we assume Ready when trusted folders exist.
  return WorkspaceState.Ready;
}

/**
 * Get a human-readable description of the current workspace state.
 * Returns `null` when ReviewLume operations can proceed (Ready state).
 */
export function getWorkspaceWarning(): string | null {
  const state = getWorkspaceState();

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
