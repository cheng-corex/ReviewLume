import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  PLAN_SCHEMA_VERSION,
  type VerificationCandidate,
  type VerificationPlan,
  type VerificationTargetMode,
} from './localVerificationTypes';

const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
const MAX_PACKAGE_ROOTS = 64;
const MAX_SCANNED_DIRECTORIES = 2_500;
const MAX_PACKAGE_DEPTH = 5;
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor',
]);
const PACKAGE_CONFIG_FILES = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
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
const ROOT_DEPENDENCY_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const;

interface PackageRoot {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly packageJsonText: string;
  readonly packageJson: Record<string, unknown>;
}

interface RunnerDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly packageName: string;
  readonly relativeRunner: string;
  readonly argsPrefix: readonly string[];
  readonly configFiles: readonly string[];
}

const RUNNER_DEFINITIONS: readonly RunnerDefinition[] = [
  {
    id: 'vitest-changed',
    label: 'Vitest changed tests',
    description: 'Run every newly added or modified Vitest-compatible test file.',
    packageName: 'vitest',
    relativeRunner: 'vitest/vitest.mjs',
    argsPrefix: ['run'],
    configFiles: [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mts',
      'vitest.config.mjs',
    ],
  },
  {
    id: 'jest-changed',
    label: 'Jest changed tests',
    description: 'Run every newly added or modified Jest-compatible test file.',
    packageName: 'jest',
    relativeRunner: 'jest/bin/jest.js',
    argsPrefix: ['--runInBand'],
    configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.cjs'],
  },
  {
    id: 'mocha-changed',
    label: 'Mocha changed tests',
    description: 'Run every newly added or modified Mocha-compatible test file.',
    packageName: 'mocha',
    relativeRunner: 'mocha/bin/mocha.js',
    argsPrefix: ['--timeout', '15000'],
    configFiles: ['.mocharc.json', '.mocharc.js', '.mocharc.cjs'],
  },
];

export async function discoverVerificationCandidates(
  repositoryRoot: string,
): Promise<readonly VerificationCandidate[]> {
  const root = await realpath(repositoryRoot);
  const rootFingerprint = await fingerprintConfiguration(root, root);
  const candidates: VerificationCandidate[] = [
    candidate({
      id: 'node-check-changed',
      label: 'JavaScript syntax check for changed files',
      description:
        'Run node --check once for each changed .js, .cjs, and .mjs file without executing it.',
      executable: process.execPath,
      argsPrefix: ['--check'],
      workingDirectory: '.',
      targetMode: 'changed-javascript',
      timeoutMs: 30_000,
      configFingerprint: rootFingerprint,
      pickedByDefault: true,
    }),
  ];

  const packageRoots = await discoverPackageRoots(root);
  for (const packageRoot of packageRoots) {
    let firstTestRunnerForPackage = true;
    const configFingerprint = await fingerprintConfiguration(root, packageRoot.absolutePath);
    for (const definition of RUNNER_DEFINITIONS) {
      if (!(await packageUsesRunner(packageRoot, definition))) continue;
      const runnerPath = await resolveNodeModuleFile(
        root,
        packageRoot.absolutePath,
        definition.relativeRunner,
      );
      if (!runnerPath) continue;
      candidates.push(
        candidate({
          id: scopedCandidateId(definition.id, packageRoot.relativePath),
          label: scopedLabel(definition.label, packageRoot.relativePath),
          description: definition.description,
          executable: process.execPath,
          argsPrefix: [runnerPath, ...definition.argsPrefix],
          workingDirectory: packageRoot.relativePath,
          targetMode: 'changed-tests',
          timeoutMs: 10 * 60_000,
          configFingerprint,
          runnerFingerprint: await fingerprintFile(runnerPath),
          pickedByDefault: firstTestRunnerForPackage,
        }),
      );
      firstTestRunnerForPackage = false;
    }

    if (firstTestRunnerForPackage && containsNodeTestScript(packageRoot.packageJsonText)) {
      candidates.push(
        candidate({
          id: scopedCandidateId('node-test-changed', packageRoot.relativePath),
          label: scopedLabel('Node test runner changed tests', packageRoot.relativePath),
          description: 'Run every newly added or modified test file with node --test.',
          executable: process.execPath,
          argsPrefix: ['--test'],
          workingDirectory: packageRoot.relativePath,
          targetMode: 'changed-tests',
          timeoutMs: 10 * 60_000,
          configFingerprint,
          pickedByDefault: true,
        }),
      );
      firstTestRunnerForPackage = false;
    }

    const typeScriptConfig = await resolvePackageFile(packageRoot.absolutePath, 'tsconfig.json');
    if (typeScriptConfig) {
      const typeScriptRunner = await resolveNodeModuleFile(
        root,
        packageRoot.absolutePath,
        'typescript/bin/tsc',
      );
      if (typeScriptRunner) {
        candidates.push(
          candidate({
            id: scopedCandidateId('typescript-noemit', packageRoot.relativePath),
            label: scopedLabel('TypeScript type check', packageRoot.relativePath),
            description: 'Run the repository-local TypeScript compiler with --noEmit.',
            executable: process.execPath,
            argsPrefix: [typeScriptRunner, '--noEmit', '--pretty', 'false'],
            workingDirectory: packageRoot.relativePath,
            targetMode: 'full-suite',
            timeoutMs: 10 * 60_000,
            configFingerprint,
            runnerFingerprint: await fingerprintFile(typeScriptRunner),
            pickedByDefault: true,
          }),
        );
      }
    }
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
      workingDirectory: item.workingDirectory,
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
  if (normalizeComparablePath(plan.repositoryRoot) !== normalizeComparablePath(repositoryRoot)) {
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

async function discoverPackageRoots(root: string): Promise<readonly PackageRoot[]> {
  const found: PackageRoot[] = [];
  const queue: Array<{
    readonly absolutePath: string;
    readonly relativePath: string;
    readonly depth: number;
  }> = [{ absolutePath: root, relativePath: '.', depth: 0 }];
  let scannedDirectories = 0;

  while (queue.length > 0 && scannedDirectories < MAX_SCANNED_DIRECTORIES) {
    const current = queue.shift();
    if (!current) break;
    scannedDirectories += 1;
    let entries;
    try {
      entries = await readdir(current.absolutePath, { withFileTypes: true });
    } catch {
      continue;
    }

    const packageEntry = entries.find((entry) => entry.isFile() && entry.name === 'package.json');
    if (packageEntry && found.length < MAX_PACKAGE_ROOTS) {
      const packageJsonText = await readOptionalText(path.join(current.absolutePath, 'package.json'));
      if (packageJsonText !== undefined) {
        found.push({
          absolutePath: current.absolutePath,
          relativePath: current.relativePath,
          packageJsonText,
          packageJson: parsePackageJson(packageJsonText),
        });
      }
    }

    if (current.depth >= MAX_PACKAGE_DEPTH) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
      const relativePath =
        current.relativePath === '.'
          ? entry.name
          : `${current.relativePath}/${entry.name}`;
      queue.push({
        absolutePath: path.join(current.absolutePath, entry.name),
        relativePath: normalizeRepoPath(relativePath),
        depth: current.depth + 1,
      });
    }
  }

  return found.sort((left, right) => {
    if (left.relativePath === '.') return -1;
    if (right.relativePath === '.') return 1;
    return left.relativePath.localeCompare(right.relativePath);
  });
}

async function packageUsesRunner(
  packageRoot: PackageRoot,
  definition: RunnerDefinition,
): Promise<boolean> {
  const dependencySections = [
    packageRoot.packageJson.dependencies,
    packageRoot.packageJson.devDependencies,
    packageRoot.packageJson.optionalDependencies,
    packageRoot.packageJson.peerDependencies,
  ];
  if (
    dependencySections.some(
      (section) => isRecord(section) && typeof section[definition.packageName] === 'string',
    )
  ) {
    return true;
  }

  const scripts = packageRoot.packageJson.scripts;
  if (
    isRecord(scripts) &&
    Object.values(scripts).some(
      (value) =>
        typeof value === 'string' && containsCommandToken(value, definition.packageName),
    )
  ) {
    return true;
  }

  for (const configFile of definition.configFiles) {
    if (await resolvePackageFile(packageRoot.absolutePath, configFile)) return true;
  }
  return false;
}

function containsNodeTestScript(packageJsonText: string): boolean {
  return /(?:^|[\s"'])node\s+--test(?:[\s"']|$)/i.test(packageJsonText);
}

function containsCommandToken(value: string, token: string): boolean {
  return new RegExp(
    `(?:^|[\\s;&|"'])${escapeRegExp(token)}(?:[\\s;&|"']|$)`,
    'i',
  ).test(value);
}

function candidate(input: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly workingDirectory: string;
  readonly targetMode: VerificationTargetMode;
  readonly timeoutMs: number;
  readonly configFingerprint: string;
  readonly runnerFingerprint?: string;
  readonly pickedByDefault: boolean;
}): VerificationCandidate {
  return {
    ...input,
    argsPrefix: [...input.argsPrefix],
    approvalFingerprint: sha256(
      JSON.stringify({
        id: input.id,
        executable: input.executable,
        argsPrefix: input.argsPrefix,
        workingDirectory: input.workingDirectory,
        targetMode: input.targetMode,
        timeoutMs: input.timeoutMs,
        configFingerprint: input.configFingerprint,
        runnerFingerprint: input.runnerFingerprint,
      }),
    ),
  };
}

async function fingerprintConfiguration(root: string, packageRoot: string): Promise<string> {
  const paths = new Set<string>();
  for (const relativePath of ROOT_DEPENDENCY_FILES) {
    paths.add(path.join(root, relativePath));
  }
  for (const relativePath of PACKAGE_CONFIG_FILES) {
    paths.add(path.join(packageRoot, relativePath));
  }

  const values: string[] = [];
  for (const filePath of paths) {
    const fingerprint = await fingerprintOptionalFile(filePath);
    if (fingerprint === undefined) continue;
    values.push(`${normalizeRepoPath(path.relative(root, filePath))}:${fingerprint}`);
  }
  return sha256(values.sort().join('\n'));
}

async function fingerprintFile(filePath: string): Promise<string> {
  const fingerprint = await fingerprintOptionalFile(filePath);
  if (fingerprint === undefined) {
    throw new Error('The approved verification runner is not a readable regular file.');
  }
  return fingerprint;
}

async function fingerprintOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return undefined;
    if (fileStat.size <= MAX_CONFIG_BYTES) {
      return sha256(await readFile(filePath));
    }
    return `${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}`;
  } catch {
    return undefined;
  }
}

async function resolveNodeModuleFile(
  root: string,
  packageRoot: string,
  moduleRelativePath: string,
): Promise<string | undefined> {
  let current = packageRoot;
  while (true) {
    const candidatePath = path.join(current, 'node_modules', ...moduleRelativePath.split('/'));
    const relativePath = normalizeRepoPath(path.relative(root, candidatePath));
    const resolved = await resolveRepositoryFile(root, relativePath);
    if (resolved) return resolved;
    if (normalizeComparablePath(current) === normalizeComparablePath(root)) return undefined;
    const parent = path.dirname(current);
    if (parent === current || !isWithinRoot(root, parent)) return undefined;
    current = parent;
  }
}

async function resolvePackageFile(
  packageRoot: string,
  relativePath: string,
): Promise<string | undefined> {
  const candidatePath = path.resolve(packageRoot, normalizeRepositoryRelativePath(relativePath));
  try {
    const resolved = await realpath(candidatePath);
    const relative = path.relative(packageRoot, resolved);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Package verification file resolves outside its package root.');
    }
    const fileStat = await stat(resolved);
    return fileStat.isFile() ? resolved : undefined;
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside its package root')) throw error;
    return undefined;
  }
}

async function resolveRepositoryFile(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  const candidatePath = path.resolve(root, normalizeRepositoryRelativePath(relativePath));
  try {
    const resolved = await realpath(candidatePath);
    if (
      !isWithinRoot(root, resolved) ||
      normalizeComparablePath(root) === normalizeComparablePath(resolved)
    ) {
      throw new Error('Verification runner resolves outside the repository.');
    }
    const fileStat = await stat(resolved);
    return fileStat.isFile() ? resolved : undefined;
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

function parsePackageJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function scopedCandidateId(baseId: string, packageRelativePath: string): string {
  return packageRelativePath === '.' ? baseId : `${baseId}:${packageRelativePath}`;
}

function scopedLabel(label: string, packageRelativePath: string): string {
  return packageRelativePath === '.' ? label : `${label} (${packageRelativePath})`;
}

function normalizeRepositoryRelativePath(value: string): string {
  if (
    !value ||
    value.includes('\0') ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value)
  ) {
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

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeComparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithinRoot(root: string, candidatePath: string): boolean {
  const relative = path.relative(root, candidatePath);
  return !(
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
