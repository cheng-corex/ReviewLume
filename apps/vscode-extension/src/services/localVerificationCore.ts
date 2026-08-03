import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';

const PLAN_SCHEMA_VERSION = 1;
const MAX_CHANGED_FILES = 400;
const MAX_TARGET_FILES = 200;
const MAX_CONFIG_BYTES = 512 * 1024;
const MAX_FINGERPRINT_FILE_BYTES = 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 256 * 1024;
const PROCESS_STOP_GRACE_MS = 2_000;

const CONFIG_FILES = [
  'package.json',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vitest.config.mjs',
  'jest.config.ts',
  'jest.config.js',
  'jest.config.cjs',
  '.mocharc.json',
  '.mocharc.js',
  '.mocharc.cjs',
  'tsconfig.json',
] as const;

export interface VerificationGitRunner {
  run(options: {
    readonly cwd: string;
    readonly args: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<{ readonly stdout: string; readonly stderr?: string }>;
}

export type VerificationTargetMode = 'changed-tests' | 'changed-javascript' | 'full-suite';

export interface VerificationCandidate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly targetMode: VerificationTargetMode;
  readonly timeoutMs: number;
  readonly approvalFingerprint: string;
  readonly pickedByDefault: boolean;
}

export interface ApprovedVerificationStep {
  readonly id: string;
  readonly label: string;
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly targetMode: VerificationTargetMode;
  readonly timeoutMs: number;
  readonly approvalFingerprint: string;
}

export interface VerificationPlan {
  readonly schemaVersion: typeof PLAN_SCHEMA_VERSION;
  readonly repositoryRoot: string;
  readonly createdAt: string;
  readonly runOnConnect: true;
  readonly steps: readonly ApprovedVerificationStep[];
}

export type VerificationStepStatus =
  | 'passed'
  | 'failed'
  | 'inconclusive'
  | 'skipped'
  | 'timed-out'
  | 'cancelled';

export interface VerificationCounts {
  readonly passed?: number;
  readonly failed?: number;
  readonly skipped?: number;
  readonly total?: number;
}

export interface VerificationStepResult {
  readonly id: string;
  readonly label: string;
  readonly status: VerificationStepStatus;
  readonly executable: string;
  readonly args: readonly string[];
  readonly targetMode: VerificationTargetMode;
  readonly requestedTargets: readonly string[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly outputTruncated: boolean;
  readonly output: string;
  readonly counts: VerificationCounts;
  readonly evidence: readonly string[];
}

export type VerificationRunStatus =
  | 'passed'
  | 'failed'
  | 'inconclusive'
  | 'no-targets'
  | 'cancelled';

export interface VerificationRunResult {
  readonly schemaVersion: 1;
  readonly repository: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly status: VerificationRunStatus;
  readonly head: string;
  readonly workspaceFingerprint: string;
  readonly workspaceChangedDuringRun: boolean;
  readonly changedFiles: readonly string[];
  readonly steps: readonly VerificationStepResult[];
}

export interface WorkspaceSnapshot {
  readonly head: string;
  readonly fingerprint: string;
  readonly changedFiles: readonly string[];
}

export interface VerificationProcessRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export interface VerificationProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly durationMs: number;
  readonly output: string;
  readonly outputTruncated: boolean;
}

export interface VerificationProcessLauncher {
  run(request: VerificationProcessRequest): Promise<VerificationProcessResult>;
}

export interface RunVerificationOptions {
  readonly root: string;
  readonly repository: string;
  readonly plan: VerificationPlan;
  readonly runner: VerificationGitRunner;
  readonly launcher?: VerificationProcessLauncher;
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

export async function discoverVerificationCandidates(
  repositoryRoot: string,
): Promise<readonly VerificationCandidate[]> {
  const root = await realpath(repositoryRoot);
  const configFingerprint = await fingerprintConfiguration(root);
  const candidates: VerificationCandidate[] = [];

  candidates.push(
    candidate({
      id: 'node-check-changed',
      label: 'JavaScript syntax check for changed files',
      description: 'Run node --check for changed .js, .cjs, and .mjs files without executing them.',
      executable: process.execPath,
      argsPrefix: ['--check'],
      targetMode: 'changed-javascript',
      timeoutMs: 30_000,
      configFingerprint,
      pickedByDefault: true,
    }),
  );

  const runnerCandidates = [
    {
      id: 'vitest-changed',
      label: 'Vitest changed tests',
      description: 'Run every newly added or modified Vitest-compatible test file.',
      relativeRunner: 'node_modules/vitest/vitest.mjs',
      argsPrefix: ['run'],
    },
    {
      id: 'jest-changed',
      label: 'Jest changed tests',
      description: 'Run every newly added or modified Jest-compatible test file.',
      relativeRunner: 'node_modules/jest/bin/jest.js',
      argsPrefix: ['--runInBand'],
    },
    {
      id: 'mocha-changed',
      label: 'Mocha changed tests',
      description: 'Run every newly added or modified Mocha-compatible test file.',
      relativeRunner: 'node_modules/mocha/bin/mocha.js',
      argsPrefix: ['--timeout', '15000'],
    },
  ] as const;

  let firstTestRunner = true;
  for (const definition of runnerCandidates) {
    const runnerPath = await resolveRepositoryFile(root, definition.relativeRunner, false);
    if (!runnerPath) continue;
    candidates.push(
      candidate({
        id: definition.id,
        label: definition.label,
        description: definition.description,
        executable: process.execPath,
        argsPrefix: [runnerPath, ...definition.argsPrefix],
        targetMode: 'changed-tests',
        timeoutMs: 10 * 60_000,
        configFingerprint,
        pickedByDefault: firstTestRunner,
      }),
    );
    firstTestRunner = false;
  }

  const packageJson = await readOptionalText(path.join(root, 'package.json'));
  if (
    firstTestRunner &&
    packageJson &&
    /(?:^|[\s"'])node\s+--test(?:[\s"']|$)/i.test(packageJson)
  ) {
    candidates.push(
      candidate({
        id: 'node-test-changed',
        label: 'Node test runner changed tests',
        description: 'Run every newly added or modified test file with node --test.',
        executable: process.execPath,
        argsPrefix: ['--test'],
        targetMode: 'changed-tests',
        timeoutMs: 10 * 60_000,
        configFingerprint,
        pickedByDefault: true,
      }),
    );
  }

  const typeScriptRunner = await resolveRepositoryFile(
    root,
    'node_modules/typescript/bin/tsc',
    false,
  );
  if (typeScriptRunner) {
    candidates.push(
      candidate({
        id: 'typescript-noemit',
        label: 'TypeScript type check',
        description: 'Run the repository-local TypeScript compiler with --noEmit.',
        executable: process.execPath,
        argsPrefix: [typeScriptRunner, '--noEmit', '--pretty', 'false'],
        targetMode: 'full-suite',
        timeoutMs: 10 * 60_000,
        configFingerprint,
        pickedByDefault: true,
      }),
    );
  }

  return candidates;
}

export function createVerificationPlan(
  repositoryRoot: string,
  candidates: readonly VerificationCandidate[],
  now = new Date(),
): VerificationPlan {
  if (candidates.length === 0) {
    throw new Error('At least one verification rule must be approved.');
  }
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    repositoryRoot: path.resolve(repositoryRoot),
    createdAt: now.toISOString(),
    runOnConnect: true,
    steps: candidates.map((item) => ({
      id: item.id,
      label: item.label,
      executable: item.executable,
      argsPrefix: [...item.argsPrefix],
      targetMode: item.targetMode,
      timeoutMs: item.timeoutMs,
      approvalFingerprint: item.approvalFingerprint,
    })),
  };
}

export function validateVerificationPlan(
  plan: VerificationPlan,
  repositoryRoot: string,
  currentCandidates: readonly VerificationCandidate[],
): { readonly valid: boolean; readonly reason?: string } {
  if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) {
    return { valid: false, reason: 'The verification approval uses an unsupported schema.' };
  }
  if (path.resolve(plan.repositoryRoot) !== path.resolve(repositoryRoot)) {
    return { valid: false, reason: 'The verification approval belongs to another repository.' };
  }
  const byId = new Map(currentCandidates.map((item) => [item.id, item]));
  for (const approved of plan.steps) {
    const current = byId.get(approved.id);
    if (!current) {
      return { valid: false, reason: `${approved.label} is no longer available.` };
    }
    if (current.approvalFingerprint !== approved.approvalFingerprint) {
      return {
        valid: false,
        reason: `${approved.label} changed and must be approved again.`,
      };
    }
  }
  return { valid: true };
}

export async function runVerificationPlan(
  options: RunVerificationOptions,
): Promise<VerificationRunResult> {
  const root = await realpath(options.root);
  const startedAt = new Date();
  const before = await captureWorkspaceSnapshot(root, options.runner, options.signal);
  const changedFiles = before.changedFiles;
  const launcher = options.launcher ?? new NodeVerificationProcessLauncher();
  const results: VerificationStepResult[] = [];

  for (const step of options.plan.steps) {
    if (options.signal?.aborted) break;
    const requestedTargets = await selectTargets(root, changedFiles, step.targetMode);
    if (step.targetMode !== 'full-suite' && requestedTargets.length === 0) {
      results.push({
        id: step.id,
        label: step.label,
        status: 'skipped',
        executable: step.executable,
        args: [...step.argsPrefix],
        targetMode: step.targetMode,
        requestedTargets: [],
        exitCode: null,
        signal: null,
        durationMs: 0,
        timedOut: false,
        cancelled: false,
        outputTruncated: false,
        output: '',
        counts: {},
        evidence: ['No matching changed files were present.'],
      });
      continue;
    }

    const args = [...step.argsPrefix, ...requestedTargets];
    const processResult = await launcher.run({
      executable: step.executable,
      args,
      cwd: root,
      timeoutMs: step.timeoutMs,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES,
      signal: options.signal,
    });
    results.push(buildStepResult(step, requestedTargets, args, processResult));
  }

  const after = await captureWorkspaceSnapshot(root, options.runner);
  const finishedAt = new Date();
  return {
    schemaVersion: 1,
    repository: options.repository,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: summarizeRunStatus(results),
    head: before.head,
    workspaceFingerprint: before.fingerprint,
    workspaceChangedDuringRun: before.fingerprint !== after.fingerprint,
    changedFiles,
    steps: results,
  };
}

export async function captureWorkspaceSnapshot(
  root: string,
  runner: VerificationGitRunner,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  const safeDiffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];
  const [headResult, unstagedResult, stagedResult, untrackedResult] = await Promise.all([
    runner.run({ cwd: root, args: ['rev-parse', 'HEAD'], signal }),
    runner.run({
      cwd: root,
      args: ['diff', ...safeDiffFlags, '--binary'],
      signal,
    }),
    runner.run({
      cwd: root,
      args: ['diff', ...safeDiffFlags, '--cached', '--binary'],
      signal,
    }),
    runner.run({
      cwd: root,
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      signal,
    }),
  ]);

  const changedFiles = await collectChangedFiles(root, runner, signal);
  const untracked = splitZeroSeparated(untrackedResult.stdout).slice(0, MAX_CHANGED_FILES);
  const untrackedDigests: string[] = [];
  for (const relativePath of untracked) {
    const resolved = await resolveRepositoryFile(root, relativePath, false);
    if (!resolved) continue;
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) continue;
    if (fileStat.size <= MAX_FINGERPRINT_FILE_BYTES) {
      untrackedDigests.push(
        `${normalizeRepoPath(relativePath)}:${sha256(await readFile(resolved))}`,
      );
    } else {
      untrackedDigests.push(
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
    runner.run({
      cwd: root,
      args: ['diff', ...safeDiffFlags, '--name-only', '-z'],
      signal,
    }),
    runner.run({
      cwd: root,
      args: ['diff', ...safeDiffFlags, '--cached', '--name-only', '-z'],
      signal,
    }),
    runner.run({
      cwd: root,
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      signal,
    }),
  ]);

  return [...new Set([
    ...splitZeroSeparated(unstaged.stdout),
    ...splitZeroSeparated(staged.stdout),
    ...splitZeroSeparated(untracked.stdout),
  ].map((item) => normalizeRepositoryRelativePath(item)))].sort().slice(0, MAX_CHANGED_FILES);
}

export function isTestFile(relativePath: string): boolean {
  const normalized = normalizeRepoPath(relativePath);
  const name = path.posix.basename(normalized);
  return (
    /(^|\/)(?:test|tests|__tests__)\//i.test(normalized) ||
    /\.(?:test|spec)\.(?:[cm]?[jt]sx?|vue|svelte)$/i.test(name) ||
    /^test_.*\.py$/i.test(name) ||
    /_test\.(?:py|go)$/i.test(name) ||
    /(?:Test|Tests)\.(?:java|kt|cs)$/i.test(name)
  );
}

export function isJavaScriptFile(relativePath: string): boolean {
  return /\.(?:js|cjs|mjs)$/i.test(normalizeRepoPath(relativePath));
}

export function sanitizeVerificationOutput(value: string): string {
  return stripAnsi(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(authorization\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|private[_-]?key)\b(\s*[:=]\s*)([^\s,;]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_OPENAI_KEY]')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]{8,}\.){2}[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]');
}

export function detectNoTests(output: string): boolean {
  return /(?:no tests? found|no test files? found|no matching tests?|collected\s+0\s+items|\b0\s+passing\b|\b0\s+tests?\b)/i.test(
    output,
  );
}

export function parseVerificationCounts(output: string): VerificationCounts {
  const mochaPassing = /\b(\d+)\s+passing\b/i.exec(output);
  const mochaFailing = /\b(\d+)\s+failing\b/i.exec(output);
  const mochaPending = /\b(\d+)\s+pending\b/i.exec(output);
  if (mochaPassing || mochaFailing || mochaPending) {
    const passed = numberFromMatch(mochaPassing);
    const failed = numberFromMatch(mochaFailing);
    const skipped = numberFromMatch(mochaPending);
    return { passed, failed, skipped, total: passed + failed + skipped };
  }

  const jestLine = /Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i.exec(
    output,
  );
  if (jestLine) {
    return {
      failed: Number(jestLine[1] ?? 0),
      skipped: Number(jestLine[2] ?? 0),
      passed: Number(jestLine[3] ?? 0),
      total: Number(jestLine[4] ?? 0),
    };
  }

  const vitestLine = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+skipped\s*\|\s*)?(\d+)\s+passed/i.exec(
    output,
  );
  if (vitestLine) {
    const failed = Number(vitestLine[1] ?? 0);
    const skipped = Number(vitestLine[2] ?? 0);
    const passed = Number(vitestLine[3] ?? 0);
    return { failed, skipped, passed, total: failed + skipped + passed };
  }

  const pytestLine = /(?:^|\s)(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/i.exec(
    output,
  );
  if (pytestLine) {
    const passed = Number(pytestLine[1] ?? 0);
    const failed = Number(pytestLine[2] ?? 0);
    const skipped = Number(pytestLine[3] ?? 0);
    return { passed, failed, skipped, total: passed + failed + skipped };
  }

  return {};
}

export class NodeVerificationProcessLauncher implements VerificationProcessLauncher {
  async run(request: VerificationProcessRequest): Promise<VerificationProcessResult> {
    if (request.signal?.aborted) {
      return {
        exitCode: null,
        signal: null,
        timedOut: false,
        cancelled: true,
        durationMs: 0,
        output: '',
        outputTruncated: false,
      };
    }

    return new Promise<VerificationProcessResult>((resolve, reject) => {
      const startedAt = Date.now();
      let child: ChildProcess;
      try {
        child = spawn(request.executable, [...request.args], {
          cwd: request.cwd,
          shell: false,
          windowsHide: true,
          detached: process.platform !== 'win32',
          env: buildVerificationEnvironment(process.env),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let outputBytes = 0;
      let outputTruncated = false;
      const chunks: Buffer[] = [];
      let timeout: NodeJS.Timeout | undefined;
      let abortHandler: (() => void) | undefined;

      const append = (chunk: Buffer | string): void => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = Math.max(0, request.maxOutputBytes - outputBytes);
        if (remaining === 0) {
          outputTruncated = true;
          return;
        }
        if (buffer.length > remaining) {
          chunks.push(buffer.subarray(0, remaining));
          outputBytes += remaining;
          outputTruncated = true;
          return;
        }
        chunks.push(buffer);
        outputBytes += buffer.length;
      };

      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      const cleanup = (): void => {
        if (timeout) clearTimeout(timeout);
        if (request.signal && abortHandler) {
          request.signal.removeEventListener('abort', abortHandler);
        }
      };

      const finish = (
        exitCode: number | null,
        processSignal: NodeJS.Signals | null,
      ): void => {
        if (settled) return;
        settled = true;
        cleanup();
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({
          exitCode,
          signal: processSignal,
          timedOut,
          cancelled,
          durationMs: Date.now() - startedAt,
          output: sanitizeVerificationOutput(raw),
          outputTruncated,
        });
      };

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      child.once('close', finish);

      const terminate = (): void => {
        void terminateProcessTree(child);
      };

      timeout = setTimeout(() => {
        timedOut = true;
        terminate();
      }, request.timeoutMs);

      if (request.signal) {
        abortHandler = () => {
          cancelled = true;
          terminate();
        };
        request.signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }
}

async function selectTargets(
  root: string,
  changedFiles: readonly string[],
  targetMode: VerificationTargetMode,
): Promise<readonly string[]> {
  if (targetMode === 'full-suite') return [];
  const predicate = targetMode === 'changed-tests' ? isTestFile : isJavaScriptFile;
  const selected: string[] = [];
  for (const relativePath of changedFiles) {
    if (!predicate(relativePath)) continue;
    const resolved = await resolveRepositoryFile(root, relativePath, false);
    if (!resolved) continue;
    const fileStat = await stat(resolved);
    if (!fileStat.isFile()) continue;
    selected.push(normalizeRepoPath(relativePath));
    if (selected.length >= MAX_TARGET_FILES) break;
  }
  return selected;
}

function buildStepResult(
  step: ApprovedVerificationStep,
  requestedTargets: readonly string[],
  args: readonly string[],
  processResult: VerificationProcessResult,
): VerificationStepResult {
  const evidence: string[] = [];
  const counts = parseVerificationCounts(processResult.output);
  let status: VerificationStepStatus;
  if (processResult.cancelled) {
    status = 'cancelled';
    evidence.push('The user or extension cancelled the process.');
  } else if (processResult.timedOut) {
    status = 'timed-out';
    evidence.push(`The process exceeded its ${step.timeoutMs} ms timeout.`);
  } else if (processResult.exitCode !== 0) {
    status = 'failed';
    evidence.push(`The process exited with code ${String(processResult.exitCode)}.`);
  } else if (step.targetMode === 'changed-tests' && detectNoTests(processResult.output)) {
    status = 'inconclusive';
    evidence.push('The runner reported zero or no matching tests.');
  } else {
    status = 'passed';
    evidence.push('The approved process exited successfully.');
    if (requestedTargets.length > 0) {
      evidence.push(`${requestedTargets.length} explicit changed target(s) were passed to the runner.`);
    }
  }
  if (processResult.outputTruncated) evidence.push('Output was truncated by ReviewLume.');

  return {
    id: step.id,
    label: step.label,
    status,
    executable: step.executable,
    args,
    targetMode: step.targetMode,
    requestedTargets,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    durationMs: processResult.durationMs,
    timedOut: processResult.timedOut,
    cancelled: processResult.cancelled,
    outputTruncated: processResult.outputTruncated,
    output: processResult.output,
    counts,
    evidence,
  };
}

function summarizeRunStatus(results: readonly VerificationStepResult[]): VerificationRunStatus {
  if (results.some((item) => item.status === 'cancelled')) return 'cancelled';
  if (results.some((item) => item.status === 'failed' || item.status === 'timed-out')) {
    return 'failed';
  }
  if (results.some((item) => item.status === 'inconclusive')) return 'inconclusive';
  if (results.every((item) => item.status === 'skipped')) return 'no-targets';
  return 'passed';
}

function candidate(input: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly targetMode: VerificationTargetMode;
  readonly timeoutMs: number;
  readonly configFingerprint: string;
  readonly pickedByDefault: boolean;
}): VerificationCandidate {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    executable: input.executable,
    argsPrefix: [...input.argsPrefix],
    targetMode: input.targetMode,
    timeoutMs: input.timeoutMs,
    approvalFingerprint: sha256(
      JSON.stringify({
        id: input.id,
        executable: input.executable,
        argsPrefix: input.argsPrefix,
        targetMode: input.targetMode,
        timeoutMs: input.timeoutMs,
        configFingerprint: input.configFingerprint,
      }),
    ),
    pickedByDefault: input.pickedByDefault,
  };
}

async function fingerprintConfiguration(root: string): Promise<string> {
  const values: string[] = [];
  for (const relativePath of CONFIG_FILES) {
    const absolutePath = path.join(root, relativePath);
    const content = await readOptionalText(absolutePath);
    if (content === undefined) continue;
    values.push(`${relativePath}:${sha256(content.slice(0, MAX_CONFIG_BYTES))}`);
  }
  return sha256(values.sort().join('\n'));
}

async function resolveRepositoryFile(
  root: string,
  relativePath: string,
  throwWhenMissing: boolean,
): Promise<string | undefined> {
  const normalized = normalizeRepositoryRelativePath(relativePath);
  const candidatePath = path.resolve(root, normalized);
  let resolved: string;
  try {
    resolved = await realpath(candidatePath);
  } catch (error) {
    if (throwWhenMissing) throw error;
    return undefined;
  }
  const relative = path.relative(root, resolved);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Verification target resolves outside the repository.');
  }
  return resolved;
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

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size > MAX_CONFIG_BYTES) return undefined;
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function buildVerificationEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'HOME',
    'USERPROFILE',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
  ] as const;
  const env: NodeJS.ProcessEnv = {
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    NODE_ENV: 'test',
  };
  for (const name of allowed) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  return env;
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    child.kill('SIGTERM');
    return;
  }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    await new Promise<void>((resolve) => killer.once('close', () => resolve()));
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolve) => setTimeout(resolve, PROCESS_STOP_GRACE_MS));
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function numberFromMatch(match: RegExpExecArray | null): number {
  return Number(match?.[1] ?? 0);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
