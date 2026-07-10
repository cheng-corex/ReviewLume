import { describe, expect, it } from 'vitest';
import {
  evaluateWorkspaceState,
  getWorkspaceWarningForState,
  WorkspaceState,
} from '../../services/workspaceService';

describe('workspaceService', () => {
  it('returns NoWorkspace before evaluating trust or Git', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: false,
        isTrusted: false,
        hasGitRepository: true,
      }),
    ).toBe(WorkspaceState.NoWorkspace);
  });

  it('returns Untrusted for an open workspace in Restricted Mode', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: true,
        isTrusted: false,
        hasGitRepository: true,
      }),
    ).toBe(WorkspaceState.Untrusted);
  });

  it('returns NoGit only when repository discovery explicitly reports false', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: true,
        isTrusted: true,
        hasGitRepository: false,
      }),
    ).toBe(WorkspaceState.NoGit);
  });

  it('returns Ready when the trusted P1 workspace has not evaluated Git yet', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: true,
        isTrusted: true,
      }),
    ).toBe(WorkspaceState.Ready);
  });

  it('provides explicit warnings for every blocked state', () => {
    expect(getWorkspaceWarningForState(WorkspaceState.NoWorkspace)).toContain(
      'No workspace folder',
    );
    expect(getWorkspaceWarningForState(WorkspaceState.Untrusted)).toContain('Restricted Mode');
    expect(getWorkspaceWarningForState(WorkspaceState.NoGit)).toContain('No Git repository');
    expect(getWorkspaceWarningForState(WorkspaceState.Ready)).toBeNull();
  });
});
