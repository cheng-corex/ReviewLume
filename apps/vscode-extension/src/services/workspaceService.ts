import * as vscode from 'vscode';

/**
 * Describes the current workspace state relevant to ReviewLume.
 */
export enum WorkspaceState {
  /** No workspace folder is open. */
  NoWorkspace = 'no-workspace',
  /** Workspace is open but not fully trusted (Restricted Mode). */
  Untrusted = 'untrusted',
  /** Workspace is open and trusted; project kind is resolved when MCP connects. */
  Ready = 'ready',
}

/**
 * Convenience type alias for the workspace state enum values.
 */
export type WorkspaceStateValue = `${WorkspaceState}`;

/**
 * Pure input used to evaluate workspace state.
 *
 * Git discovery is intentionally not part of readiness. A trusted workspace can
 * connect as either a Git Project or a Folder Project.
 */
export interface WorkspaceSnapshot {
  hasWorkspace: boolean;
  isTrusted: boolean;
  /** @deprecated Git is no longer a workspace-readiness prerequisite. */
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

  return WorkspaceState.Ready;
}

/** Determine the current workspace state without requiring Git. */
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
