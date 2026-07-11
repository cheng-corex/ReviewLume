/**
 * Integration tests for GitRepositoryDiscovery.
 *
 * These tests use real temporary Git repositories to verify
 * discovery behavior in single-root, multi-root, nested,
 * and non-repo scenarios.
 */

import { mkdirSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { GitCommandRunner } from '../commandRunner.js';
import { GitRepositoryDiscovery } from '../discovery.js';
import { createTempDir, initRepo } from './helpers.js';

describe('GitRepositoryDiscovery', () => {
  let runner: GitCommandRunner;
  let discovery: GitRepositoryDiscovery;

  beforeEach(() => {
    runner = new GitCommandRunner();
    discovery = new GitRepositoryDiscovery(runner);
  });

  describe('isGitRepository', () => {
    it('should return true for a directory inside a git repo', async () => {
      const fixture = createTempDir();
      try {
        initRepo(fixture.root);
        const result = await discovery.isGitRepository(fixture.root);
        expect(result).toBe(true);
      } finally {
        fixture.cleanup();
      }
    });

    it('should return false for a directory not inside a git repo', async () => {
      const fixture = createTempDir();
      try {
        const result = await discovery.isGitRepository(fixture.root);
        expect(result).toBe(false);
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('discover — single workspace folder', () => {
    it('should find a git repository in a workspace folder', async () => {
      const fixture = createTempDir();
      try {
        initRepo(fixture.root);
        const results = await discovery.discover([fixture.root]);

        expect(results).toHaveLength(1);
        expect(results[0]!.folderPath).toContain('reviewlume-git-test-');
        expect(results[0]!.repository.displayName).toBeTruthy();
      } finally {
        fixture.cleanup();
      }
    });

    it('should return empty array for non-repo workspace folder', async () => {
      const fixture = createTempDir();
      try {
        const results = await discovery.discover([fixture.root]);
        expect(results).toHaveLength(0);
      } finally {
        fixture.cleanup();
      }
    });

    it('should handle a subdirectory of a git repo as workspace folder', async () => {
      const fixture = createTempDir();
      try {
        initRepo(fixture.root);
        const subDir = fixture.root + '/src/subdir';
        mkdirSync(subDir, { recursive: true });

        const results = await discovery.discover([subDir]);

        // The root should be the repo root, not the subdirectory
        expect(results).toHaveLength(1);
        expect(results[0]!.repository.root).toContain('reviewlume-git-test-');
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('discover — multi-root workspace', () => {
    it('should handle a single repo in multiple workspace roots', async () => {
      const fixture1 = createTempDir();
      const fixture2 = createTempDir();
      try {
        initRepo(fixture1.root);
        // fixture2 is not a repo

        const results = await discovery.discover([fixture1.root, fixture2.root]);

        expect(results).toHaveLength(1);
        expect(results[0]!.repository.root).toContain('reviewlume-git-test-');
        expect(results[0]!.folderPath).toContain('reviewlume-git-test-');
      } finally {
        fixture1.cleanup();
        fixture2.cleanup();
      }
    });

    it('should find multiple repos in multi-root workspace', async () => {
      const fixture1 = createTempDir();
      const fixture2 = createTempDir();
      try {
        initRepo(fixture1.root);
        initRepo(fixture2.root);

        const results = await discovery.discover([fixture1.root, fixture2.root]);

        expect(results).toHaveLength(2);
        // Each result should be a unique repo (different temp dirs)
        const rootSet = new Set(results.map((r) => r.repository.root));
        expect(rootSet.size).toBe(2);
        results.forEach((r) => {
          expect(r.repository.root).toContain('reviewlume-git-test-');
        });
      } finally {
        fixture1.cleanup();
        fixture2.cleanup();
      }
    });

    it('should deduplicate nested repositories', async () => {
      const fixture = createTempDir();
      try {
        initRepo(fixture.root);
        // Add both root and subdirectory as workspace folders
        const results = await discovery.discover([
          fixture.root,
          fixture.root + '/src',
        ]);

        // Should deduplicate to a single repo
        expect(results).toHaveLength(1);
      } finally {
        fixture.cleanup();
      }
    });
  });
});
