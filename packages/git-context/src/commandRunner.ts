/**
 * @reviewlume/git-context — Git command runner
 *
 * Executes Git subprocesses using `child_process.execFile` with parameter
 * arrays — never shell string concatenation.
 *
 * Security guarantees:
 * - No `shell: true` or equivalent.
 * - Arguments are passed as an array, never concatenated into a string.
 * - Timeout and cancellation via AbortSignal.
 * - Non-zero exit codes throw typed errors — the extension never crashes.
 */

import { execFile } from 'node:child_process';
import {
  GitNotAvailableError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
} from './errors.js';

/** Maximum buffer size for git stdout/stderr (100 MiB). */
const MAX_BUFFER = 100 * 1024 * 1024;

/** Default timeout for git commands (30 seconds). */
const DEFAULT_TIMEOUT = 30_000;

/** Result of a successful git command execution. */
export interface GitResult {
  /** Standard output. */
  readonly stdout: string;
  /** Standard error. */
  readonly stderr: string;
  /** Exit code (0 for success). */
  readonly exitCode: number;
}

/** Options for running a git command. */
export interface GitCommandOptions {
  /** Working directory for the git command. */
  cwd: string;
  /** Arguments to pass to git (not including the git executable). */
  args: string[];
  /** Timeout in milliseconds (default: 30000, 0 = no timeout). */
  timeout?: number;
  /** Signal to cancel the operation. */
  signal?: AbortSignal;
}

/**
 * Safe, typed Git command runner.
 *
 * Uses `child_process.execFile` with parameter arrays.
 * Never uses shell string concatenation.
 */
export class GitCommandRunner {
  /**
   * @param gitPath Path to the git executable (default: `"git"`).
   */
  constructor(private readonly gitPath: string = 'git') {}

  /**
   * Check whether the git executable is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.run({ cwd: process.cwd(), args: ['--version'] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the git version string.
   */
  async getVersion(): Promise<string> {
    const result = await this.run({ cwd: process.cwd(), args: ['--version'] });
    return result.stdout.trim();
  }

  /**
   * Execute a git command safely.
   *
   * @throws {GitNotAvailableError}  Git executable not found.
   * @throws {GitCommandError}       Git process returned non-zero exit code.
   * @throws {GitTimeoutError}       Command exceeded time limit.
   * @throws {GitCancelledError}     Command was cancelled via AbortSignal.
   */
  async run(options: GitCommandOptions): Promise<GitResult> {
    const { cwd, args, signal } = options;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    return new Promise<GitResult>((resolve, reject) => {
      let completed = false;

      const child = execFile(
        this.gitPath,
        args,
        {
          cwd,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (completed) return;
          completed = true;

          if (error) {
            const nodeError = error as NodeJS.ErrnoException;

            // Git executable not found
            if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOEXEC') {
              reject(new GitNotAvailableError(this.gitPath));
              return;
            }

            // Non-zero exit
            const exitCode =
              typeof nodeError.code === 'number'
                ? nodeError.code
                : typeof (error as Record<string, unknown>).status === 'number'
                  ? (error as Record<string, unknown>).status as number
                  : 1;

            reject(
              new GitCommandError(
                `Git command failed: git ${args.join(' ')}`,
                exitCode,
                stderr || error.message,
              ),
            );
            return;
          }

          resolve({ stdout, stderr, exitCode: 0 });
        },
      );

      child.on('error', (err) => {
        if (completed) return;
        completed = true;
        reject(
          new GitCommandError(
            `Git process error: ${err.message}`,
            -1,
            err.message,
          ),
        );
      });

      // --- Timeout handling ---
      if (timeout > 0) {
        const timer = setTimeout(() => {
          if (completed) return;
          completed = true;
          child.kill('SIGTERM');
          // Also try SIGKILL on Windows after a short delay
          if (process.platform === 'win32') {
            setTimeout(() => {
              try { child.kill('SIGKILL'); } catch { /* ignore */ }
            }, 1000);
          }
          reject(new GitTimeoutError(timeout));
        }, timeout);

        child.on('exit', () => clearTimeout(timer));
      }

      // --- Cancellation handling ---
      if (signal) {
        if (signal.aborted) {
          completed = true;
          child.kill('SIGTERM');
          reject(new GitCancelledError());
          return;
        }

        const onAbort = (): void => {
          if (completed) return;
          completed = true;
          child.kill('SIGTERM');
          reject(new GitCancelledError());
        };

        signal.addEventListener('abort', onAbort, { once: true });
        child.on('exit', () => signal.removeEventListener('abort', onAbort));
      }
    });
  }
}
