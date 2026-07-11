/**
 * @reviewlume/git-context — Git command runner
 *
 * Executes Git subprocesses with `child_process.execFile` and argument arrays.
 * The runner enforces a narrow read-only command policy before a process is
 * created, disables terminal prompts and optional index locks, and supports
 * timeout/cancellation without invoking a shell.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  GitNotAvailableError,
  GitUnsafeCommandError,
  GitCommandError,
  GitTimeoutError,
  GitCancelledError,
} from './errors.js';

const MAX_BUFFER = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30_000;

const READ_ONLY_COMMANDS = new Set([
  'rev-parse',
  'diff',
  'ls-files',
  'check-ignore',
  'log',
  'merge-base',
]);

export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface GitCommandOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

export function redactGitDiagnostic(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/(authorization\s*:\s*)\S+/gi, '$1[REDACTED]');
}

export function assertReadOnlyGitCommand(args: readonly string[]): void {
  if (args.length === 1 && args[0] === '--version') {
    return;
  }

  const command = args[0] ?? '';

  if (command === 'remote' && args[1] === 'get-url') {
    return;
  }

  if (
    command === 'cat-file' &&
    (args[1] === '--batch' || args[1] === '--batch-check') &&
    args.length === 2
  ) {
    return;
  }

  if (!READ_ONLY_COMMANDS.has(command)) {
    throw new GitUnsafeCommandError(command);
  }

  if (args.some((arg) => arg === '--output' || arg.startsWith('--output='))) {
    throw new GitUnsafeCommandError(`${command} --output`);
  }

  if (
    command === 'diff' &&
    (!args.includes('--no-ext-diff') || !args.includes('--no-textconv'))
  ) {
    throw new GitUnsafeCommandError('diff without --no-ext-diff/--no-textconv');
  }
}

export class GitCommandRunner {
  constructor(private readonly gitPath: string = 'git') {}

  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.run({ cwd: process.cwd(), args: ['--version'], signal });
      return true;
    } catch (error) {
      if (error instanceof GitNotAvailableError) {
        return false;
      }
      throw error;
    }
  }

  async getVersion(signal?: AbortSignal): Promise<string> {
    const result = await this.run({ cwd: process.cwd(), args: ['--version'], signal });
    return result.stdout.trim();
  }

  async run(options: GitCommandOptions): Promise<GitResult> {
    const { cwd, args, signal } = options;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    assertReadOnlyGitCommand(args);

    if (signal?.aborted) {
      throw new GitCancelledError();
    }

    if (!existsSync(cwd)) {
      throw new GitCommandError('Git working directory is unavailable.', -1, '');
    }

    return new Promise<GitResult>((resolve, reject) => {
      let completed = false;
      let timer: NodeJS.Timeout | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
          onAbort = undefined;
        }
      };

      const finish = (action: () => void): void => {
        if (completed) return;
        completed = true;
        cleanup();
        action();
      };

      const commandName = args[0] ?? '<empty>';
      const child = execFile(
        this.gitPath,
        [...args],
        {
          cwd,
          encoding: 'utf8',
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
          env: {
            ...process.env,
            GIT_OPTIONAL_LOCKS: '0',
            GIT_TERMINAL_PROMPT: '0',
            GIT_PAGER: 'cat',
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOEXEC') {
              finish(() => reject(new GitNotAvailableError(this.gitPath)));
              return;
            }

            const exitCode = typeof nodeError.code === 'number' ? nodeError.code : 1;
            const safeStderr = redactGitDiagnostic(stderr || error.message);
            finish(() =>
              reject(
                new GitCommandError(
                  `Git command "${commandName}" failed.`,
                  exitCode,
                  safeStderr,
                ),
              ),
            );
            return;
          }

          finish(() => resolve({ stdout, stderr, exitCode: 0 }));
        },
      );

      child.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOEXEC') {
          finish(() => reject(new GitNotAvailableError(this.gitPath)));
          return;
        }
        finish(() =>
          reject(
            new GitCommandError(
              `Git process "${commandName}" failed to start.`,
              -1,
              redactGitDiagnostic(error.message),
            ),
          ),
        );
      });

      child.once('exit', () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          if (completed) return;
          child.kill('SIGTERM');
          finish(() => reject(new GitTimeoutError(timeout)));
        }, timeout);
      }

      if (signal) {
        onAbort = () => {
          if (completed) return;
          child.kill('SIGTERM');
          finish(() => reject(new GitCancelledError()));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}
