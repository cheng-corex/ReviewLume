import { describe, expect, it } from 'vitest';
import {
  evaluateWorkspaceState,
  getWorkspaceWarningForState,
  WorkspaceState,
} from '../../services/workspaceService';

describe('workspaceService', () => {
  it('returns NoWorkspace before evaluating trust or project kind', () => {
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

  it('returns Ready for a trusted ordinary folder without Git', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: true,
        isTrusted: true,
        hasGitRepository: false,
      }),
    ).toBe(WorkspaceState.Ready);
  });

  it('returns Ready when project kind has not been evaluated yet', () => {
    expect(
      evaluateWorkspaceState({
        hasWorkspace: true,
        isTrusted: true,
      }),
    ).toBe(WorkspaceState.Ready);
  });

  it('provides explicit warnings only for blocked workspace states', () => {
    expect(getWorkspaceWarningForState(WorkspaceState.NoWorkspace)).toContain(
      'No workspace folder',
    );
    expect(getWorkspaceWarningForState(WorkspaceState.Untrusted)).toContain('Restricted Mode');
    expect(getWorkspaceWarningForState(WorkspaceState.Ready)).toBeNull();
  });
});
