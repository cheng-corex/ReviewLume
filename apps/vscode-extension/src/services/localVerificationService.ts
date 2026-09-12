import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildVerificationApprovalPrompt } from './localVerificationApproval';
import {
  captureWorkspaceSnapshot,
  createVerificationPlan,
  discoverVerificationCandidates,
  runVerificationPlan,
  validateVerificationPlan,
  type VerificationCandidate,
  type VerificationPlan,
  type VerificationRunResult,
} from './localVerificationCore';
import { createReadOnlyGitRunner } from './gitRuntime';
import { logError, logInfo, logWarn } from './logService';
import type { McpGitRunner } from './mcpRepositoryTools';

const PLAN_STATE_PREFIX = 'reviewlume.localVerification.plan.';
const RESULT_DIRECTORY = 'local-verification';
const MAX_OUTPUT_LINES = 400;
const MAX_OUTPUT_BYTES = 256 * 1024;

interface VerificationQuickPickItem extends vscode.QuickPickItem {
  readonly candidate: VerificationCandidate;
}

export interface VerificationStatusPayload extends Record<string, unknown> {
  readonly configured: boolean;
  readonly mcpCanStartProcesses: false;
  readonly status: string;
}

export interface VerificationResultReader {
  getVerificationStatus(
    repositoryRoot: string,
    runner: McpGitRunner,
  ): Promise<VerificationStatusPayload>;
  readVerificationOutput(
    repositoryRoot: string,
    rawArguments: unknown,
    runner: McpGitRunner,
  ): Promise<Record<string, unknown>>;
}

/**
 * Executes only repository-local verification rules explicitly approved in VS Code.
 * MCP tools can read the resulting evidence but cannot start, alter, or retry a process.
 */
export class LocalVerificationService implements VerificationResultReader {
  readonly #context: vscode.ExtensionContext;
  readonly #runs = new Map<string, Promise<VerificationRunResult | undefined>>();

  constructor(context: vscode.ExtensionContext) {
    this.#context = context;
  }

  async configure(
    workspaceFolder: vscode.WorkspaceFolder,
    runAfterApproval = true,
  ): Promise<VerificationPlan | undefined> {
    this.#assertTrusted();
    const runner = createReadOnlyGitRunner();
    const root = await this.#resolveRepositoryRoot(workspaceFolder, runner);
    const candidates = await discoverVerificationCandidates(root);
    if (candidates.length === 0) {
      await vscode.window.showWarningMessage(
        'ReviewLume did not find a supported repository-local verification runner. No command was executed.',
      );
      return undefined;
    }

    const items: VerificationQuickPickItem[] = candidates.map((candidate) => ({
      label: candidate.label,
      description: candidate.description,
      detail: formatCandidate(candidate, root),
      picked: candidate.pickedByDefault,
      candidate,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Approve ReviewLume Local Verification',
      placeHolder: 'Select fixed verification rules. New matching tests are added automatically.',
      canPickMany: true,
      ignoreFocusOut: true,
    });
    if (!selected || selected.length === 0) return undefined;

    const prompt = buildVerificationApprovalPrompt(
      selected.map((item) => item.candidate),
      runAfterApproval,
    );
    const approval = await vscode.window.showWarningMessage(
      prompt.message,
      { modal: true, detail: selected.map((item) => item.detail).join('\n\n') },
      prompt.action,
    );
    if (approval !== prompt.action) return undefined;

    const plan = createVerificationPlan(
      root,
      selected.map((item) => item.candidate),
    );
    await this.#context.globalState.update(planStateKey(root), plan);
    logInfo(
      `Local verification approved for ${path.basename(root)} with ${plan.steps.length} fixed rule(s)`,
    );
    if (runAfterApproval) await this.runApproved(workspaceFolder);
    return plan;
  }

  async clearApproval(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    this.#assertTrusted();
    const runner = createReadOnlyGitRunner();
    const root = await this.#resolveRepositoryRoot(workspaceFolder, runner);
    await this.#context.globalState.update(planStateKey(root), undefined);
    await rm(this.#resultPath(root), { force: true });
    logInfo(`Local verification approval cleared for ${path.basename(root)}`);
    await vscode.window.showInformationMessage(
      'ReviewLume local verification approval and stored result were removed for this repository.',
    );
  }

  async runOnConnect(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<VerificationRunResult | undefined> {
    const enabled = vscode.workspace
      .getConfiguration('reviewlume')
      .get<boolean>('verification.runOnConnect', true);
    if (!enabled) return undefined;

    this.#assertTrusted();
    const runner = createReadOnlyGitRunner();
    const root = await this.#resolveRepositoryRoot(workspaceFolder, runner);
    let plan = this.#loadPlan(root);
    if (!plan) {
      const action = await vscode.window.showInformationMessage(
        'ReviewLume can run newly added or modified tests and approved checks before connecting ChatGPT. This requires one repository-specific approval.',
        'Configure local verification',
        'Connect without verification',
      );
      if (action !== 'Configure local verification') return undefined;
      plan = await this.configure(workspaceFolder, false);
      if (!plan) return undefined;
    }

    const candidates = await discoverVerificationCandidates(root);
    const validation = validateVerificationPlan(plan, root, candidates);
    if (!validation.valid) {
      await this.#context.globalState.update(planStateKey(root), undefined);
      const action = await vscode.window.showWarningMessage(
        `${validation.reason ?? 'The local verification approval is no longer valid'} Review and approve the current rules before they run again.`,
        'Review verification rules',
        'Connect without verification',
      );
      if (action !== 'Review verification rules') return undefined;
      plan = await this.configure(workspaceFolder, false);
      if (!plan) return undefined;
    }

    return this.#run(root, path.basename(root) || 'repository', plan, runner, true);
  }

  async runApproved(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<VerificationRunResult | undefined> {
    this.#assertTrusted();
    const runner = createReadOnlyGitRunner();
    const root = await this.#resolveRepositoryRoot(workspaceFolder, runner);
    const plan = this.#loadPlan(root);
    if (!plan) {
      await this.configure(workspaceFolder, true);
      return undefined;
    }

    const candidates = await discoverVerificationCandidates(root);
    const validation = validateVerificationPlan(plan, root, candidates);
    if (!validation.valid) {
      await this.#context.globalState.update(planStateKey(root), undefined);
      await vscode.window.showWarningMessage(
        `${validation.reason ?? 'The local verification approval changed'} Re-approve it before running.`,
      );
      await this.configure(workspaceFolder, true);
      return undefined;
    }
    return this.#run(root, path.basename(root) || 'repository', plan, runner, false);
  }

  async getVerificationStatus(
    repositoryRoot: string,
    runner: McpGitRunner,
  ): Promise<VerificationStatusPayload> {
    const root = path.resolve(repositoryRoot);
    const plan = this.#loadPlan(root);
    const result = await this.#readResult(root);
    if (!plan && !result) {
      return {
        configured: false,
        mcpCanStartProcesses: false,
        status: 'not-configured',
        message:
          'No local verification plan is approved. Configure it in VS Code; MCP cannot start processes.',
      };
    }
    if (!result) {
      return {
        configured: Boolean(plan),
        mcpCanStartProcesses: false,
        status: 'never-run',
        approvedRules:
          plan?.steps.map((step) => ({
            id: step.id,
            label: step.label,
            workingDirectory: step.workingDirectory,
          })) ?? [],
      };
    }

    const current = await captureWorkspaceSnapshot(root, runner);
    const stale = result.workspaceFingerprint !== current.fingerprint;
    return {
      configured: Boolean(plan),
      mcpCanStartProcesses: false,
      status: stale ? 'stale' : result.status,
      stale,
      repository: result.repository,
      head: result.head,
      currentHead: current.head,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      workspaceChangedDuringRun: result.workspaceChangedDuringRun,
      changedFilesAtRun: result.changedFiles,
      steps: result.steps.map((step) => ({
        id: step.id,
        label: step.label,
        status: step.status,
        targetMode: step.targetMode,
        requestedTargets: step.requestedTargets,
        exitCode: step.exitCode,
        durationMs: step.durationMs,
        outputTruncated: step.outputTruncated,
        counts: step.counts,
        evidence: step.evidence,
      })),
    };
  }

  async readVerificationOutput(
    repositoryRoot: string,
    rawArguments: unknown,
    runner: McpGitRunner,
  ): Promise<Record<string, unknown>> {
    const root = path.resolve(repositoryRoot);
    const result = await this.#readResult(root);
    if (!result) {
      return {
        status: 'never-run',
        mcpCanStartProcesses: false,
        message: 'No stored local verification output is available.',
      };
    }
    const args = asObject(rawArguments);
    const requestedStep = readOptionalString(args.stepId);
    const step = requestedStep
      ? result.steps.find((item) => item.id === requestedStep)
      : result.steps.find((item) => item.status !== 'passed' && item.status !== 'skipped') ??
        result.steps.find((item) => item.status !== 'skipped') ??
        result.steps[0];
    if (!step) {
      return {
        status: result.status,
        mcpCanStartProcesses: false,
        message: 'The stored verification run did not execute any step.',
      };
    }

    const startLine = readInteger(args.startLine, 1, 1, 1_000_000);
    const endLine = readInteger(
      args.endLine,
      startLine + MAX_OUTPUT_LINES - 1,
      startLine,
      1_000_000,
    );
    const lines = step.output.split(/\r?\n/);
    const content = truncateUtf8(
      lines
        .slice(startLine - 1, Math.min(endLine, startLine + MAX_OUTPUT_LINES - 1))
        .map((line, index) => `${startLine + index}: ${line}`)
        .join('\n'),
      MAX_OUTPUT_BYTES,
    );
    const current = await captureWorkspaceSnapshot(root, runner);
    return {
      status: result.workspaceFingerprint === current.fingerprint ? step.status : 'stale',
      stale: result.workspaceFingerprint !== current.fingerprint,
      mcpCanStartProcesses: false,
      stepId: step.id,
      label: step.label,
      startLine,
      endLine: Math.min(endLine, lines.length),
      totalLines: lines.length,
      outputTruncated: step.outputTruncated,
      content,
    };
  }

  async #run(
    root: string,
    repository: string,
    plan: VerificationPlan,
    runner: McpGitRunner,
    initiatedByConnect: boolean,
  ): Promise<VerificationRunResult | undefined> {
    const existing = this.#runs.get(root);
    if (existing) return existing;

    const operation = Promise.resolve(
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `ReviewLume: verifying ${repository}`,
          cancellable: true,
        },
        async (progress, token): Promise<VerificationRunResult | undefined> => {
          progress.report({ message: 'Discovering changed tests and capturing workspace state…' });
          const controller = new AbortController();
          const cancellation = token.onCancellationRequested(() => controller.abort());
          try {
            const result = await runVerificationPlan({
              root,
              repository,
              plan,
              runner,
              signal: controller.signal,
              maxOutputBytes: vscode.workspace
                .getConfiguration('reviewlume')
                .get<number>('verification.maxOutputBytes', MAX_OUTPUT_BYTES),
            });
            await this.#writeResult(root, result);
            logInfo(
              `Local verification ${result.status} for ${repository}; ${result.steps.length} step(s), ${result.durationMs} ms`,
            );
            await this.#showRunResult(result, initiatedByConnect);
            return result;
          } catch (error) {
            logError(
              `Local verification failed to start for ${repository}`,
              error instanceof Error ? error : undefined,
            );
            await vscode.window.showErrorMessage(
              error instanceof Error
                ? `ReviewLume local verification failed: ${error.message}`
                : 'ReviewLume local verification failed.',
            );
            return undefined;
          } finally {
            cancellation.dispose();
          }
        },
      ),
    );

    this.#runs.set(root, operation);
    try {
      return await operation;
    } finally {
      this.#runs.delete(root);
    }
  }

  async #showRunResult(
    result: VerificationRunResult,
    initiatedByConnect: boolean,
  ): Promise<void> {
    const executed = result.steps.filter((step) => step.status !== 'skipped').length;
    const suffix = result.workspaceChangedDuringRun
      ? ' The repository changed during the run, so the result is already stale.'
      : initiatedByConnect
        ? ' ChatGPT can read this evidence after the connection opens.'
        : '';
    const message =
      `ReviewLume local verification: ${result.status}; ${executed} step(s) executed in ` +
      `${Math.round(result.durationMs / 1000)}s.${suffix}`;
    if (result.status === 'passed' || result.status === 'no-targets') {
      await vscode.window.showInformationMessage(message);
    } else {
      await vscode.window.showWarningMessage(message);
    }
  }

  #loadPlan(root: string): VerificationPlan | undefined {
    return this.#context.globalState.get<VerificationPlan>(planStateKey(root));
  }

  async #resolveRepositoryRoot(
    workspaceFolder: vscode.WorkspaceFolder,
    runner: McpGitRunner,
  ): Promise<string> {
    const root = (
      await runner.run({
        cwd: workspaceFolder.uri.fsPath,
        args: ['rev-parse', '--show-toplevel'],
      })
    ).stdout.trim();
    if (!root) throw new Error('The selected workspace folder is not inside a Git repository.');
    return path.resolve(root);
  }

  #resultPath(root: string): string {
    return path.join(
      this.#context.globalStorageUri.fsPath,
      RESULT_DIRECTORY,
      `${repositoryKey(root)}.json`,
    );
  }

  async #writeResult(root: string, result: VerificationRunResult): Promise<void> {
    const destination = this.#resultPath(root);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(result), { encoding: 'utf8', mode: 0o600 });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async #readResult(root: string): Promise<VerificationRunResult | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.#resultPath(root), 'utf8')) as unknown;
      return isVerificationRunResult(parsed) ? parsed : undefined;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') logWarn('Stored local verification result could not be read.');
      return undefined;
    }
  }

  #assertTrusted(): void {
    if (!vscode.workspace.isTrusted) {
      throw new Error('ReviewLume local verification requires a trusted VS Code workspace.');
    }
  }
}

function formatCandidate(candidate: VerificationCandidate, root: string): string {
  const displayExecutable = path.relative(root, candidate.executable) || candidate.executable;
  const displayArgs = candidate.argsPrefix.map((arg) => {
    const relative = path.isAbsolute(arg) ? path.relative(root, arg) : arg;
    return quoteArgument(relative || arg);
  });
  const target =
    candidate.targetMode === 'changed-tests'
      ? '<new-or-modified-test-files>'
      : candidate.targetMode === 'changed-javascript'
        ? '<new-or-modified-js-files>'
        : '';
  const command = [quoteArgument(displayExecutable), ...displayArgs, target]
    .filter(Boolean)
    .join(' ');
  const cwd =
    candidate.workingDirectory === '.' ? '<repository-root>' : candidate.workingDirectory;
  return `[cwd: ${cwd}] ${command}`;
}

function quoteArgument(value: string): string {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value;
}

function planStateKey(root: string): string {
  return `${PLAN_STATE_PREFIX}${repositoryKey(root)}`;
}

function repositoryKey(root: string): string {
  const normalized =
    process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
  return createHash('sha256').update(normalized).digest('hex');
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Verification output arguments must be an object.');
  }
  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('stepId must be a string.');
  return value.trim() || undefined;
}

function readInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value)) throw new Error('Expected an integer value.');
  return Math.min(maximum, Math.max(minimum, value as number));
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), 'utf8') <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return `${value.slice(0, low)}\n[TRUNCATED BY REVIEWLUME]`;
}

function isVerificationRunResult(value: unknown): value is VerificationRunResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<VerificationRunResult>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.repository === 'string' &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.finishedAt === 'string' &&
    typeof candidate.workspaceFingerprint === 'string' &&
    Array.isArray(candidate.steps)
  );
}
