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
const MAX_FINGERPRINT_TOTAL_BYTES = 8 * 1024 * 1024;

export async function captureWorkspaceSnapshot(
  root: string,
  runner: VerificationGitRunner,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  const repositoryRoot = await realpath(root);
  const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
  const [headResult, unstagedStatus, stagedStatus] = await Promise.all([
    runner.run({ cwd: repositoryRoot, args: ['rev-parse', 'HEAD'], signal }),
    runner.run({
      cwd: repositoryRoot,
      args: ['diff', ...safeDiffFlags, '--name-status', '-z'],
      signal,
    }),
    runner.run({
      cwd: repositoryRoot,
      args: ['diff', ...safeDiffFlags, '--cached', '--name-status', '-z'],
      signal,
    }),
  ]);

  const changedFiles = await collectChangedFiles(repositoryRoot, runner, signal);
  const fileFingerprints: string[] = [];
  let remainingContentBudget = MAX_FINGERPRINT_TOTAL_BYTES;
  for (const relativePath of changedFiles) {
    const resolved = await resolveRepositoryFile(repositoryRoot, relativePath);
    if (!resolved) {
      fileFingerprints.push(`${normalizeRepoPath(relativePath)}:missing`);
      continue;
    }
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) {
      fileFingerprints.push(`${normalizeRepoPath(relativePath)}:not-file`);
      continue;
    }
    if (
      fileStat.size <= MAX_FINGERPRINT_FILE_BYTES &&
      fileStat.size <= remainingContentBudget
    ) {
      fileFingerprints.push(
        `${normalizeRepoPath(relativePath)}:${sha256(await readFile(resolved))}`,
      );
      remainingContentBudget -= fileStat.size;
    } else {
      fileFingerprints.push(
        `${normalizeRepoPath(relativePath)}:${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}`,
      );
    }
  }

  const head = headResult.stdout.trim();
  return {
    head,
    changedFiles,
    fingerprint: sha256(
      JSON.stringify({
        head,
        unstagedStatus: unstagedStatus.stdout,
        stagedStatus: stagedStatus.stdout,
        fileFingerprints,
      }),
    ),
  };
}

export async function collectChangedFiles(
  root: string,
  runner: VerificationGitRunner,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const repositoryRoot = await realpath(root);
  const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
  const [unstaged, staged, untracked] = await Promise.all([
    runner.run({
      cwd: repositoryRoot,
      args: ['diff', ...safeDiffFlags, '--name-only', '-z'],
      signal,
    }),
    runner.run({
      cwd: repositoryRoot,
      args: ['diff', ...safeDiffFlags, '--cached', '--name-only', '-z'],
      signal,
    }),
    runner.run({
      cwd: repositoryRoot,
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      signal,
    }),
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
  workingDirectory = '.',
): Promise<readonly string[]> {
  if (targetMode === 'full-suite') return [];
  const repositoryRoot = await realpath(root);
  const executionRoot = await resolveVerificationWorkingDirectory(
    repositoryRoot,
    workingDirectory,
  );
  const normalizedWorkingDirectory = normalizeWorkingDirectory(workingDirectory);
  const predicate = targetMode === 'changed-tests' ? isTestFile : isJavaScriptFile;
  const selected: string[] = [];

  for (const repositoryRelativePath of changedFiles) {
    const normalizedRepositoryPath = normalizeRepositoryRelativePath(repositoryRelativePath);
    const executionRelativePath = relativeToWorkingDirectory(
      normalizedRepositoryPath,
      normalizedWorkingDirectory,
    );
    if (!executionRelativePath || !predicate(executionRelativePath)) continue;

    const resolved = await resolveRepositoryFile(repositoryRoot, normalizedRepositoryPath);
    if (!resolved || !isWithinRoot(executionRoot, resolved)) continue;
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) continue;
    selected.push(executionRelativePath);
    if (selected.length >= MAX_TARGET_FILES) break;
  }
  return selected;
}

export async function resolveVerificationWorkingDirectory(
  canonicalRoot: string,
  workingDirectory: string,
): Promise<string> {
  const normalized = normalizeWorkingDirectory(workingDirectory);
  const candidatePath =
    normalized === '.'
      ? canonicalRoot
      : path.resolve(canonicalRoot, ...normalized.split('/'));
  const resolved = await realpath(candidatePath);
  if (!isWithinRoot(canonicalRoot, resolved)) {
    throw new Error('Verification working directory resolves outside the repository.');
  }
  const directoryStat = await stat(resolved);
  if (!directoryStat.isDirectory()) {
    throw new Error('Verification working directory is not a directory.');
  }
  return resolved;
}

async function resolveRepositoryFile(
  canonicalRoot: string,
  relativePath: string,
): Promise<string | undefined> {
  const candidatePath = path.resolve(
    canonicalRoot,
    normalizeRepositoryRelativePath(relativePath),
  );
  try {
    const resolved = await realpath(candidatePath);
    if (!isWithinRoot(canonicalRoot, resolved) || samePath(canonicalRoot, resolved)) {
      throw new Error('Verification target resolves outside the repository.');
    }
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside the repository')) throw error;
    return undefined;
  }
}

function relativeToWorkingDirectory(
  repositoryRelativePath: string,
  workingDirectory: string,
): string | undefined {
  if (workingDirectory === '.') return repositoryRelativePath;
  const prefix = `${workingDirectory}/`;
  if (!repositoryRelativePath.startsWith(prefix)) return undefined;
  const relativePath = repositoryRelativePath.slice(prefix.length);
  return relativePath ? normalizeRepositoryRelativePath(relativePath) : undefined;
}

function normalizeWorkingDirectory(value: string): string {
  if (value === '.') return '.';
  return normalizeRepositoryRelativePath(value);
}

function normalizeRepositoryRelativePath(value: string): string {
  if (!value || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('Verification paths must be repository-relative.');
  }
  const normalized = path.posix.normalize(normalizeRepoPath(value));
  if (
    !normalized ||
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

function isWithinRoot(root: string, candidatePath: string): boolean {
  const relative = path.relative(root, candidatePath);
  return !(
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
