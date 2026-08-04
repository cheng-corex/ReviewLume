export const PLAN_SCHEMA_VERSION = 2;
export const DEFAULT_OUTPUT_BYTES = 256 * 1024;

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
  readonly workingDirectory: string;
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
  readonly workingDirectory: string;
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
