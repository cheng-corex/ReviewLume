import { describe, it, expect } from 'vitest';
import { WorkspaceState } from '../../services/workspaceService';

describe('WorkspaceState enum', () => {
  it('should have the expected states', () => {
    expect(WorkspaceState.NoWorkspace).toBe('no-workspace');
    expect(WorkspaceState.Untrusted).toBe('untrusted');
    expect(WorkspaceState.NoGit).toBe('no-git');
    expect(WorkspaceState.Ready).toBe('ready');
  });

  it('should have exactly 4 states', () => {
    const keys = Object.keys(WorkspaceState).filter(
      (k) => typeof WorkspaceState[k as keyof typeof WorkspaceState] === 'string',
    );
    expect(keys).toHaveLength(4);
    expect(keys).toContain('NoWorkspace');
    expect(keys).toContain('Untrusted');
    expect(keys).toContain('NoGit');
    expect(keys).toContain('Ready');
  });
});
