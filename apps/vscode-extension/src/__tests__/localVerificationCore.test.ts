import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  captureWorkspaceSnapshot,
  createVerificationPlan,
  detectNoTests,
  discoverVerificationCandidates,
  isTestFile,
  parseVerificationCounts,
  runVerificationPlan,
  sanitizeVerificationOutput,
  validateVerificationPlan,
  type VerificationGitRunner,
  type VerificationProcessLauncher,
  type VerificationProcessRequest,
  type VerificationProcessResult,
} from '../services/localVerificationCore';

class FakeGitRunner implements VerificationGitRunner {
  readonly changed: string[];

  constructor(changed: string[]) {
    this.changed = changed;
  }

  async run(options: { readonly args: readonly string[] }): Promise<{ readonly stdout: string }> {
    const args = options.args;
    if (args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` };
    if (args[0] === 'ls-files') return { stdout: '' };
    if (args[0] === 'diff' && args.includes('--name-only')) {
      return { stdout: args.includes('--cached') ? '' : `${this.changed.join('\0')}\0` };
    }
    if (args[0] === 'diff') {
      return { stdout: args.includes('--cached') ? '' : 'M\0src/current.js\0' };
    }
    throw new Error(`Unexpected Git call: ${args.join(' ')}`);
  }
}

class FakeLauncher implements VerificationProcessLauncher {
  readonly requests: VerificationProcessRequest[] = [];
  result: VerificationProcessResult = {
    exitCode: 0,
    signal: null,
    timedOut: false,
    cancelled: false,
    durationMs: 10,
    output: '  2 passing\n',
    outputTruncated: false,
  };

  async run(request: VerificationProcessRequest): Promise<VerificationProcessResult> {
    this.requests.push(request);
    return this.result;
  }
}

describe('local verification core', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-verification-'));
    await mkdir(path.join(root, 'node_modules', 'mocha', 'bin'), { recursive: true });
    await mkdir(path.join(root, 'test', 'runtime'), { recursive: true });
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', devDependencies: { mocha: '^11.0.0' } }),
    );
    await writeFile(path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js'), '');
    await writeFile(
      path.join(root, 'test', 'runtime', 'first.test.js'),
      'it("first", () => {});\n',
    );
    await writeFile(
      path.join(root, 'test', 'runtime', 'second.test.js'),
      'it("second", () => {});\n',
    );
    await writeFile(path.join(root, 'src', 'current.js'), 'module.exports = 1;\n');
    await writeFile(path.join(root, 'src', 'second.js'), 'module.exports = 2;\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('automatically passes every new or modified matching test to the approved runner', async () => {
    const candidates = await discoverVerificationCandidates(root);
    const mocha = candidates.find((candidate) => candidate.id === 'mocha-changed');
    expect(mocha).toBeDefined();
    const plan = createVerificationPlan(root, [mocha!]);
    const launcher = new FakeLauncher();

    const result = await runVerificationPlan({
      root,
      repository: 'fixture',
      plan,
      runner: new FakeGitRunner([
        'test/runtime/first.test.js',
        'test/runtime/second.test.js',
        'src/current.js',
      ]),
      launcher,
    });

    expect(result.status).toBe('passed');
    expect(launcher.requests).toHaveLength(1);
    expect(launcher.requests[0]?.args).toEqual(
      expect.arrayContaining([
        'test/runtime/first.test.js',
        'test/runtime/second.test.js',
      ]),
    );
    expect(launcher.requests[0]?.args).not.toContain('src/current.js');
    expect(result.steps[0]?.requestedTargets).toHaveLength(2);
    expect(result.steps[0]?.counts).toMatchObject({ passed: 2, failed: 0, total: 2 });
  });

  it('checks each changed JavaScript file in a separate node process', async () => {
    const candidates = await discoverVerificationCandidates(root);
    const syntax = candidates.find((candidate) => candidate.id === 'node-check-changed');
    expect(syntax).toBeDefined();
    const launcher = new FakeLauncher();
    launcher.result = { ...launcher.result, output: '' };

    const result = await runVerificationPlan({
      root,
      repository: 'fixture',
      plan: createVerificationPlan(root, [syntax!]),
      runner: new FakeGitRunner(['src/current.js', 'src/second.js']),
      launcher,
    });

    expect(result.status).toBe('passed');
    expect(launcher.requests.map((request) => request.args)).toEqual([
      ['--check', 'src/current.js'],
      ['--check', 'src/second.js'],
    ]);
    expect(result.steps.map((step) => step.requestedTargets)).toEqual([
      ['src/current.js'],
      ['src/second.js'],
    ]);
  });

  it('uses the real no-shell launcher and catches a syntax error in the second changed file', async () => {
    await writeFile(path.join(root, 'src', 'second.js'), 'module.exports = ;\n');
    const candidates = await discoverVerificationCandidates(root);
    const syntax = candidates.find((candidate) => candidate.id === 'node-check-changed');

    const result = await runVerificationPlan({
      root,
      repository: 'fixture',
      plan: createVerificationPlan(root, [syntax!]),
      runner: new FakeGitRunner(['src/current.js', 'src/second.js']),
    });

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.status).toBe('passed');
    expect(result.steps[1]?.status).toBe('failed');
    expect(result.steps[1]?.output).toMatch(/SyntaxError|Unexpected token/i);
  });

  it('changes the workspace fingerprint when changed file content changes', async () => {
    const runner = new FakeGitRunner(['src/current.js']);
    const before = await captureWorkspaceSnapshot(root, runner);
    await writeFile(path.join(root, 'src', 'current.js'), 'module.exports = 99;\n');
    const after = await captureWorkspaceSnapshot(root, runner);

    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.changedFiles).toEqual(['src/current.js']);
  });

  it('keeps approval valid when tests are added but invalidates it when runner configuration changes', async () => {
    const initial = await discoverVerificationCandidates(root);
    const mocha = initial.find((candidate) => candidate.id === 'mocha-changed');
    const plan = createVerificationPlan(root, [mocha!]);

    await writeFile(
      path.join(root, 'test', 'runtime', 'third.test.js'),
      'it("third", () => {});\n',
    );
    const afterTestAdded = await discoverVerificationCandidates(root);
    expect(validateVerificationPlan(plan, root, afterTestAdded)).toEqual({ valid: true });

    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', devDependencies: { mocha: '^12.0.0' } }),
    );
    const afterConfigurationChanged = await discoverVerificationCandidates(root);
    expect(validateVerificationPlan(plan, root, afterConfigurationChanged)).toMatchObject({
      valid: false,
    });
  });

  it('does not report success when a runner explicitly reports zero tests', async () => {
    const candidates = await discoverVerificationCandidates(root);
    const mocha = candidates.find((candidate) => candidate.id === 'mocha-changed');
    const launcher = new FakeLauncher();
    launcher.result = { ...launcher.result, output: '0 passing\n' };

    const result = await runVerificationPlan({
      root,
      repository: 'fixture',
      plan: createVerificationPlan(root, [mocha!]),
      runner: new FakeGitRunner(['test/runtime/first.test.js']),
      launcher,
    });

    expect(result.status).toBe('inconclusive');
    expect(result.steps[0]?.status).toBe('inconclusive');
    expect(detectNoTests('No test files found')).toBe(true);
  });

  it('recognizes common test paths and redacts secrets from stored output', () => {
    expect(isTestFile('test/runtime/example.test.js')).toBe(true);
    expect(isTestFile('src/example.spec.ts')).toBe(true);
    expect(isTestFile('tests/test_health.py')).toBe(true);
    expect(isTestFile('src/example.ts')).toBe(false);

    const sanitized = sanitizeVerificationOutput(
      'Authorization: Bearer abc.def.ghi\napi_key=secret-value\nhttps://user:pass@example.com/x\n',
    );
    expect(sanitized).not.toContain('abc.def.ghi');
    expect(sanitized).not.toContain('secret-value');
    expect(sanitized).not.toContain('user:pass');
  });

  it('parses representative Mocha and Jest counts', () => {
    expect(parseVerificationCounts('24 passing\n1 failing\n2 pending')).toEqual({
      passed: 24,
      failed: 1,
      skipped: 2,
      total: 27,
    });
    expect(parseVerificationCounts('Tests: 1 failed, 2 skipped, 18 passed, 21 total')).toEqual({
      failed: 1,
      skipped: 2,
      passed: 18,
      total: 21,
    });
  });
});
