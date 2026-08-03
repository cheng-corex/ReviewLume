import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { isJavaScriptFile, isTestFile } from './localVerificationDiscovery';
import type {
  VerificationGitRunner,
  VerificationTargetMode,
  WorkspaceSnapshot,
} from './localVerificationTypes';

const MAX_CHANGED_FILES = 400;
const MAX_TARGET_FILES = 200;
const MAX_FINGERPRINT_FILE_BYTES = 1024 * 1024;

export async function captureWorkspaceSnapshot(
  root: string,
  runner: VerificationGitRunner,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
  const [headResult, unstagedResult, stagedResult, untrackedResult] = await Promise.all([
    runner.run({ cwd: root, args: ['rev-parse', 'HEAD'], signal }),
    runner.run({ cwd: root, args: ['diff', ...safeDiffFlags, '--binary'], signal }),
    runner.run({ cwd: root, args: ['diff', ...safeDiffFlags, '--cached', '--binary'], signal }),
    runner.run({ cwd: root, args: ['ls-files', '--others', '--exclude-standard', '-z'], signal }),
  ]);

  const changedFiles = await collectChangedFiles(root, runner, signal);
  const untracked = splitZeroSeparated(untrackedResult.stdout).slice(0, MAX_CHANGED_FILES);
  const untrackedDigests: string[] = [];
  for (const relativePath of untracked) {
    const resolved = await resolveRepositoryFile(root, relativePath);
    if (!resolved) continue;
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) continue;
    untrackedDigests.push(
      fileStat.size <= MAX_FINGERPRINT_FILE_BYTES
        ? `${normalizeRepoPath(relativePath)}:${sha256(await readFile(resolved))}`
        : `${normalizeRepoPath(relativePath)}:${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}`,
    );
  }

  const head = headResult.stdout.trim();
  return {
    head,
    changedFiles,
    fingerprint: sha256(
      JSON.stringify({
        head,
        unstaged: unstagedResult.stdout,
        staged: stagedResult.stdout,
        untracked: untrackedDigests.sort(),
      }),
    ),
  };
}

export async function collectChangedFiles(
  root: string,
  runner: VerificationGitRunner,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
  const [unstaged, staged, untracked] = await Promise.all([
    runner.run({ cwd: root, args: ['diff', ...safeDiffFlags, '--name-only', '-z'], signal }),
    runner.run({ cwd: root, args: ['diff', ...safeDiffFlags, '--cached', '--name-only', '-z'], signal }),
    runner.run({ cwd: root, args: ['ls-files', '--others', '--exclude-standard', '-z'], signal }),
  ]);
  return [
    ...new Set(
      [
        ...splitZeroSeparated(unstaged.stdout),
        ...splitZeroSeparated(staged.stdout),
        ...splitZeroSeparated(untracked.stdout),
      ].map(normalizeRepositoryRelativePath),
    ),
  ]
    .sort()
    .slice(0, MAX_CHANGED_FILES);
}

export async function selectVerificationTargets(
  root: string,
  changedFiles: readonly string[],
  targetMode: VerificationTargetMode,
): Promise<readonly string[]> {
  if (targetMode === 'full-suite') return [];
  const predicate = targetMode === 'changed-tests' ? isTestFile : isJavaScriptFile;
  const selected: string[] = [];
  for (const relativePath of changedFiles) {
    if (!predicate(relativePath)) continue;
    const resolved = await resolveRepositoryFile(root, relativePath);
    if (!resolved) continue;
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) continue;
    selected.push(normalizeRepoPath(relativePath));
    if (selected.length >= MAX_TARGET_FILES) break;
  }
  return selected;
}

async function resolveRepositoryFile(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  const candidatePath = path.resolve(root, normalizeRepositoryRelativePath(relativePath));
  try {
    const resolved = await realpath(candidatePath);
    const relative = path.relative(root, resolved);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Verification target resolves outside the repository.');
    }
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside the repository')) throw error;
    return undefined;
  }
}

function normalizeRepositoryRelativePath(value: string): string {
  if (!value || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('Verification paths must be repository-relative.');
  }
  const normalized = path.posix.normalize(normalizeRepoPath(value));
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized === '.git' ||
    normalized.startsWith('.git/')
  ) {
    throw new Error('Verification path escapes the repository boundary.');
  }
  return normalized;
}

function splitZeroSeparated(value: string): string[] {
  return value.split('\0').filter(Boolean);
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
