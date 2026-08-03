import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  PLAN_SCHEMA_VERSION,
  type VerificationCandidate,
  type VerificationPlan,
  type VerificationTargetMode,
} from './localVerificationTypes';

const MAX_CONFIG_BYTES = 512 * 1024;
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

export async function discoverVerificationCandidates(
  repositoryRoot: string,
): Promise<readonly VerificationCandidate[]> {
  const root = await realpath(repositoryRoot);
  const configFingerprint = await fingerprintConfiguration(root);
  const candidates: VerificationCandidate[] = [candidate({
    id: 'node-check-changed',
    label: 'JavaScript syntax check for changed files',
    description: 'Run node --check once for each changed .js, .cjs, and .mjs file without executing it.',
    executable: process.execPath,
    argsPrefix: ['--check'],
    targetMode: 'changed-javascript',
    timeoutMs: 30_000,
    configFingerprint,
    pickedByDefault: true,
  })];

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
    const runnerPath = await resolveRepositoryFile(root, definition.relativeRunner);
    if (!runnerPath) continue;
    candidates.push(candidate({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      executable: process.execPath,
      argsPrefix: [runnerPath, ...definition.argsPrefix],
      targetMode: 'changed-tests',
      timeoutMs: 10 * 60_000,
      configFingerprint,
      pickedByDefault: firstTestRunner,
    }));
    firstTestRunner = false;
  }

  const packageJson = await readOptionalText(path.join(root, 'package.json'));
  if (
    firstTestRunner &&
    packageJson &&
    /(?:^|[\s"'])node\s+--test(?:[\s"']|$)/i.test(packageJson)
  ) {
    candidates.push(candidate({
      id: 'node-test-changed',
      label: 'Node test runner changed tests',
      description: 'Run every newly added or modified test file with node --test.',
      executable: process.execPath,
      argsPrefix: ['--test'],
      targetMode: 'changed-tests',
      timeoutMs: 10 * 60_000,
      configFingerprint,
      pickedByDefault: true,
    }));
  }

  const typeScriptRunner = await resolveRepositoryFile(root, 'node_modules/typescript/bin/tsc');
  if (typeScriptRunner) {
    candidates.push(candidate({
      id: 'typescript-noemit',
      label: 'TypeScript type check',
      description: 'Run the repository-local TypeScript compiler with --noEmit.',
      executable: process.execPath,
      argsPrefix: [typeScriptRunner, '--noEmit', '--pretty', 'false'],
      targetMode: 'full-suite',
      timeoutMs: 10 * 60_000,
      configFingerprint,
      pickedByDefault: true,
    }));
  }

  return candidates;
}

export function createVerificationPlan(
  repositoryRoot: string,
  candidates: readonly VerificationCandidate[],
  now = new Date(),
): VerificationPlan {
  if (candidates.length === 0) throw new Error('At least one verification rule must be approved.');
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
    if (!current) return { valid: false, reason: `${approved.label} is no longer available.` };
    if (current.approvalFingerprint !== approved.approvalFingerprint) {
      return { valid: false, reason: `${approved.label} changed and must be approved again.` };
    }
  }
  return { valid: true };
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
    ...input,
    argsPrefix: [...input.argsPrefix],
    approvalFingerprint: sha256(JSON.stringify({
      id: input.id,
      executable: input.executable,
      argsPrefix: input.argsPrefix,
      targetMode: input.targetMode,
      timeoutMs: input.timeoutMs,
      configFingerprint: input.configFingerprint,
    })),
  };
}

async function fingerprintConfiguration(root: string): Promise<string> {
  const values: string[] = [];
  for (const relativePath of CONFIG_FILES) {
    const content = await readOptionalText(path.join(root, relativePath));
    if (content !== undefined) values.push(`${relativePath}:${sha256(content)}`);
  }
  return sha256(values.sort().join('\n'));
}

async function resolveRepositoryFile(root: string, relativePath: string): Promise<string | undefined> {
  const candidatePath = path.resolve(root, normalizeRepositoryRelativePath(relativePath));
  try {
    const resolved = await realpath(candidatePath);
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Verification runner resolves outside the repository.');
    }
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside the repository')) throw error;
    return undefined;
  }
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

function normalizeRepositoryRelativePath(value: string): string {
  if (!value || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new Error('Verification paths must be repository-relative.');
  }
  const normalized = path.posix.normalize(normalizeRepoPath(value));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized === '.git' || normalized.startsWith('.git/')) {
    throw new Error('Verification path escapes the repository boundary.');
  }
  return normalized;
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
