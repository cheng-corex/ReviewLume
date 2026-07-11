import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { GitRepository, deriveDisplayName, sanitizeRemoteUrl } from '../repository.js';

describe('GitRepository', () => {
  it('stores normalized repository data', () => {
    const root = resolve('/home/user/project');
    const repo = new GitRepository({
      root,
      displayName: 'project',
      hasRemote: true,
      remoteUrl: 'https://github.com/user/project.git',
    });

    expect(repo.root).toBe(root);
    expect(repo.displayName).toBe('project');
    expect(repo.hasRemote).toBe(true);
    expect(repo.remoteUrl).toBe('https://github.com/user/project.git');
  });

  it('does not retain credential-bearing remote user info', () => {
    const repo = new GitRepository({
      root: '/repo',
      displayName: 'repo',
      hasRemote: true,
      remoteUrl: 'https://user:token@github.com/owner/repo.git',
    });

    expect(repo.remoteUrl).toBe('https://github.com/owner/repo.git');
    expect('rawRemoteUrl' in repo).toBe(false);
  });

  it('handles repositories without a remote', () => {
    const repo = new GitRepository({
      root: '/home/user/local-project',
      displayName: 'local-project',
      hasRemote: false,
    });
    expect(repo.remoteUrl).toBeUndefined();
  });

  describe('path boundaries', () => {
    const repo = new GitRepository({
      root: '/home/user/project',
      displayName: 'project',
      hasRemote: false,
    });

    it('accepts paths inside the repository', () => {
      expect(repo.containsPath('src/file.ts')).toBe(true);
      expect(repo.containsPath('/home/user/project/src/file.ts')).toBe(true);
      expect(repo.containsPath('/home/user/project')).toBe(true);
    });

    it('rejects outside and traversal paths', () => {
      expect(repo.containsPath('/home/user/other/file.ts')).toBe(false);
      expect(repo.containsPath('../other/file.ts')).toBe(false);
      expect(repo.containsPath('../../etc/passwd')).toBe(false);
      expect(repo.containsPath('src/../../other/file.ts')).toBe(false);
    });

    it('requires a strict child for file-level checks', () => {
      expect(repo.containsStrict('/home/user/project')).toBe(false);
      expect(repo.containsStrict('src/file.ts')).toBe(true);
    });
  });
});

describe('deriveDisplayName', () => {
  it('extracts names from HTTPS and SSH remotes', () => {
    expect(deriveDisplayName('https://github.com/user/project.git')).toBe('project');
    expect(deriveDisplayName('git@github.com:user/project.git')).toBe('project');
    expect(deriveDisplayName('ssh://git@github.com/user/project.git')).toBe('project');
  });

  it('falls back to the hostname when no path is present', () => {
    expect(deriveDisplayName('https://github.com/')).toBe('github.com');
  });
});

describe('sanitizeRemoteUrl', () => {
  it('strips HTTPS credentials and surrounding whitespace', () => {
    expect(
      sanitizeRemoteUrl('  https://user:pass@github.com/owner/repo.git  '),
    ).toBe('https://github.com/owner/repo.git');
  });

  it('normalizes SCP-style remotes without retaining the user component', () => {
    const result = sanitizeRemoteUrl('git@github.com:owner/repo.git');
    expect(result).toBe('ssh://github.com/owner/repo.git');
    expect(result).not.toContain('git@');
  });

  it('handles empty input', () => {
    expect(sanitizeRemoteUrl('')).toBe('');
  });
});
