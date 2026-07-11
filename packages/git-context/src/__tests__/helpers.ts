/**
 * Test helpers for git-context integration tests.
 *
 * Creates temporary Git repositories with controlled state.
 * All tests use isolated git config (user.name, user.email) to
 * avoid depending on the developer's global git configuration.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Fixture paths returned by createTempRepo. */
export interface TempRepoFixture {
  /** Temporary directory path (the repo root). */
  root: string;
  /** Cleanup function to remove the temp directory. */
  cleanup: () => void;
}

/**
 * Create a temporary directory for use as a git repository.
 * The caller must call `cleanup()` when done.
 */
export function createTempDir(): TempRepoFixture {
  const root = mkdtempSync(join(tmpdir(), 'reviewlume-git-test-'));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Run a git command synchronously in a given directory.
 * Uses execFileSync for safety (no shell).
 */
function git(dir: string, args: string[]): string {
  const result = execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return (result ?? '').toString().trim();
}

/**
 * Initialize a new git repository in `dir` with a test user config.
 * Returns the fixture with cleanup.
 */
export function initRepo(dir: string): void {
  git(dir, ['init', '--initial-branch', 'main']);
  // Set isolated user config (required for commits, no dependency on global config)
  git(dir, ['config', 'user.name', 'ReviewLume Test']);
  git(dir, ['config', 'user.email', 'test@reviewlume.dev']);
}

/**
 * Create a file in the repo and stage it.
 */
export function createAndStageFile(repoRoot: string, filePath: string, content: string): void {
  const fullPath = join(repoRoot, filePath);
  const parentDir = resolve(fullPath, '..');
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  git(repoRoot, ['add', '--', filePath]);
}

/**
 * Create a file, stage and commit it.
 */
export function createAndCommitFile(
  repoRoot: string,
  filePath: string,
  content: string,
  message: string,
): void {
  createAndStageFile(repoRoot, filePath, content);
  git(repoRoot, ['commit', '-m', message]);
}

/**
 * Modify a file in the working tree (unstaged).
 */
export function modifyFile(repoRoot: string, filePath: string, content: string): void {
  const fullPath = join(repoRoot, filePath);
  writeFileSync(fullPath, content, 'utf-8');
}

/**
 * Stage all changes.
 */
export function stageAll(repoRoot: string): void {
  git(repoRoot, ['add', '--all']);
}

/**
 * Create an unstaged file (untracked).
 */
export function createUntrackedFile(repoRoot: string, filePath: string, content: string): void {
  const fullPath = join(repoRoot, filePath);
  const parentDir = resolve(fullPath, '..');
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}
