import { spawn, type ChildProcess } from 'node:child_process';
import type {
  ApprovedVerificationStep,
  VerificationCounts,
  VerificationProcessLauncher,
  VerificationProcessRequest,
  VerificationProcessResult,
  VerificationStepResult,
  VerificationStepStatus,
} from './localVerificationTypes';

const PROCESS_STOP_GRACE_MS = 2_000;

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
      let abortHandler: (() => void) | undefined;

      const append = (chunk: Buffer | string): void => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = Math.max(0, request.maxOutputBytes - outputBytes);
        if (remaining === 0) {
          outputTruncated = true;
          return;
        }
        chunks.push(buffer.length > remaining ? buffer.subarray(0, remaining) : buffer);
        outputBytes += Math.min(buffer.length, remaining);
        if (buffer.length > remaining) outputTruncated = true;
      };
      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      const terminate = (): void => {
        void terminateProcessTree(child);
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        terminate();
      }, request.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
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
        resolve({
          exitCode,
          signal: processSignal,
          timedOut,
          cancelled,
          durationMs: Date.now() - startedAt,
          output: sanitizeVerificationOutput(Buffer.concat(chunks).toString('utf8')),
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

export function buildVerificationStepResult(
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
    // VS Code's extension host may expose Electron/Code as process.execPath.
    // This makes that same trusted executable behave as Node without searching PATH.
    ELECTRON_RUN_AS_NODE: '1',
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
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function numberFromMatch(match: RegExpExecArray | null): number {
  return Number(match?.[1] ?? 0);
}
