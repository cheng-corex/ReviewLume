import { realpath } from 'node:fs/promises';
import {
  createVerificationPlan,
  discoverVerificationCandidates,
  isJavaScriptFile,
  isTestFile,
  validateVerificationPlan,
} from './localVerificationDiscovery';
import {
  buildVerificationStepResult,
  detectNoTests,
  NodeVerificationProcessLauncher,
  parseVerificationCounts,
  sanitizeVerificationOutput,
} from './localVerificationExecution';
import {
  captureWorkspaceSnapshot,
  collectChangedFiles,
  resolveVerificationWorkingDirectory,
  selectVerificationTargets,
} from './localVerificationWorkspace';
import {
  DEFAULT_OUTPUT_BYTES,
  type RunVerificationOptions,
  type VerificationRunResult,
  type VerificationRunStatus,
  type VerificationStepResult,
} from './localVerificationTypes';

export {
  captureWorkspaceSnapshot,
  collectChangedFiles,
  createVerificationPlan,
  detectNoTests,
  discoverVerificationCandidates,
  isJavaScriptFile,
  isTestFile,
  NodeVerificationProcessLauncher,
  parseVerificationCounts,
  sanitizeVerificationOutput,
  validateVerificationPlan,
};
export type {
  ApprovedVerificationStep,
  RunVerificationOptions,
  VerificationCandidate,
  VerificationCounts,
  VerificationGitRunner,
  VerificationPlan,
  VerificationProcessLauncher,
  VerificationProcessRequest,
  VerificationProcessResult,
  VerificationRunResult,
  VerificationRunStatus,
  VerificationStepResult,
  VerificationStepStatus,
  VerificationTargetMode,
  WorkspaceSnapshot,
} from './localVerificationTypes';

export async function runVerificationPlan(
  options: RunVerificationOptions,
): Promise<VerificationRunResult> {
  const root = await realpath(options.root);
  const startedAt = new Date();
  const before = await captureWorkspaceSnapshot(root, options.runner, options.signal);
  const launcher = options.launcher ?? new NodeVerificationProcessLauncher();
  const results: VerificationStepResult[] = [];

  for (const step of options.plan.steps) {
    if (options.signal?.aborted) break;
    const workingDirectory = await resolveVerificationWorkingDirectory(
      root,
      step.workingDirectory,
    );
    const requestedTargets = await selectVerificationTargets(
      root,
      before.changedFiles,
      step.targetMode,
      step.workingDirectory,
    );
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
        evidence: ['No matching changed files were present in this package root.'],
      });
      continue;
    }

    if (step.targetMode === 'changed-javascript') {
      for (const target of requestedTargets) {
        if (options.signal?.aborted) break;
        const args = [...step.argsPrefix, target];
        const processResult = await launcher.run({
          executable: step.executable,
          args,
          cwd: workingDirectory,
          timeoutMs: step.timeoutMs,
          maxOutputBytes: options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES,
          signal: options.signal,
        });
        results.push(
          buildVerificationStepResult(
            {
              ...step,
              id: `${step.id}:${target}`,
              label: `${step.label}: ${target}`,
            },
            [target],
            args,
            processResult,
          ),
        );
      }
      continue;
    }

    const args = [...step.argsPrefix, ...requestedTargets];
    const processResult = await launcher.run({
      executable: step.executable,
      args,
      cwd: workingDirectory,
      timeoutMs: step.timeoutMs,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES,
      signal: options.signal,
    });
    results.push(buildVerificationStepResult(step, requestedTargets, args, processResult));
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
    changedFiles: before.changedFiles,
    steps: results,
  };
}

function summarizeRunStatus(
  results: readonly VerificationStepResult[],
): VerificationRunStatus {
  if (results.some((item) => item.status === 'cancelled')) return 'cancelled';
  if (results.some((item) => item.status === 'failed' || item.status === 'timed-out')) {
    return 'failed';
  }
  if (results.some((item) => item.status === 'inconclusive')) return 'inconclusive';
  if (results.every((item) => item.status === 'skipped')) return 'no-targets';
  return 'passed';
}
