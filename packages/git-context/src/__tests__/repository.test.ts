/**
 * Tests for GitRepository model and utility functions.
 *
 * These are pure logic tests (no git subprocess needed).
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { GitRepository, deriveDisplayName, sanitizeRemoteUrl } from '../repository.js';

describe('GitRepository', () => {
  describe('constructor and accessors', () => {
    it('should store and expose repository data', () => {
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

    it('should handle repos without remote', () => {
      const repo = new GitRepository({
        root: '/home/user/local-project',
        displayName: 'local-project',
        hasRemote: false,
      });

      expect(repo.hasRemote).toBe(false);
      expect(repo.remoteUrl).toBeUndefined();
    });

    it('should sanitize remote URL with credentials', () => {
      const repo = new GitRepository({
        root: '/repo',
        displayName: 'repo',
        hasRemote: true,
        remoteUrl: 'https://user:token@github.com/owner/repo.git',
      });

      expect(repo.remoteUrl).not.toContain('token');
      expect(repo.remoteUrl).not.toContain('user');
      expect(repo.remoteUrl).toContain('https://github.com/owner/repo.git');
    });
  });

  describe('containsPath', () => {
    it('should return true for paths inside the repository', () => {
      const repo = new GitRepository({
        root: '/home/user/project',
        displayName: 'project',
        hasRemote: false,
      });

      expect(repo.containsPath('src/file.ts')).toBe(true);
      expect(repo.containsPath('/home/user/project/src/file.ts')).toBe(true);
      expect(repo.containsPath('/home/user/project')).toBe(true);
    });

    it('should return false for paths outside the repository', () => {
      const repo = new GitRepository({
        root: '/home/user/project',
        displayName: 'project',
        hasRemote: false,
      });

      expect(repo.containsPath('/home/user/other/file.ts')).toBe(false);
      expect(repo.containsPath('/home/user')).toBe(false);
      expect(repo.containsPath('/tmp')).toBe(false);
    });

    it('should reject directory traversal attempts', () => {
      const repo = new GitRepository({
        root: '/home/user/project',
        displayName: 'project',
        hasRemote: false,
      });

      expect(repo.containsPath('../other/file.ts')).toBe(false);
      expect(repo.containsPath('../../etc/passwd')).toBe(false);
      expect(repo.containsPath('src/../../other/file.ts')).toBe(false);
    });
  });

  describe('containsStrict', () => {
    it('should return false for the root path itself', () => {
      const repo = new GitRepository({
        root: '/home/user/project',
        displayName: 'project',
        hasRemote: false,
      });

      expect(repo.containsStrict('/home/user/project')).toBe(false);
      expect(repo.containsStrict('src/file.ts')).toBe(true);
    });
  });

  describe('rawRemoteUrl', () => {
    it('should expose the raw URL (for internal use only)', () => {
      const repo = new GitRepository({
        root: '/repo',
        displayName: 'repo',
        hasRemote: true,
        remoteUrl: 'https://user:token@github.com/owner/repo.git',
      });

      expect(repo.rawRemoteUrl).toBe('https://user:token@github.com/owner/repo.git');
    });
  });
});

describe('deriveDisplayName', () => {
  it('should extract name from HTTPS URL', () => {
    expect(deriveDisplayName('https://github.com/user/project.git')).toBe('project');
  });

  it('should extract name from SSH URL', () => {
    expect(deriveDisplayName('git@github.com:user/project.git')).toBe('project');
  });

  it('should extract name from URL without .git suffix', () => {
    expect(deriveDisplayName('https://github.com/user/project')).toBe('project');
  });

  it('should handle hostname-only URLs', () => {
    const name = deriveDisplayName('https://github.com/');
    expect(name).toBe('github.com');
  });
});

describe('sanitizeRemoteUrl', () => {
  it('should strip credentials from HTTPS URLs', () => {
    const result = sanitizeRemoteUrl('https://user:pass@github.com/owner/repo.git');
    expect(result).toBe('https://github.com/owner/repo.git');
    expect(result).not.toContain('user');
    expect(result).not.toContain('pass');
  });

  it('should strip only username from HTTPS URLs', () => {
    const result = sanitizeRemoteUrl('https://token@github.com/owner/repo.git');
    expect(result).toBe('https://github.com/owner/repo.git');
  });

  it('should leave SSH URLs unchanged', () => {
    const result = sanitizeRemoteUrl('git@github.com:owner/repo.git');
    expect(result).toBe('git@github.com:owner/repo.git');
  });

  it('should trim whitespace', () => {
    const result = sanitizeRemoteUrl('  https://github.com/owner/repo.git  ');
    expect(result).toBe('https://github.com/owner/repo.git');
  });

  it('should handle empty or edge cases gracefully', () => {
    // Should just return the input for invalid URLs
    const result = sanitizeRemoteUrl('');
    expect(result).toBe('');
  });
});
