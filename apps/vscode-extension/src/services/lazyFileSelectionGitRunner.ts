interface GitRunOptions {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly signal?: AbortSignal;
}

interface GitRunnerLike {
  run(options: GitRunOptions): Promise<{ readonly stdout: string }>;
}

/**
 * Keeps extension activation independent from the vendored Git runtime. The
 * runtime is loaded only when a manual-file ignore check or test recommendation
 * actually needs a Git command.
 */
export class LazyFileSelectionGitRunner implements GitRunnerLike {
  #runner: GitRunnerLike | undefined;

  run(options: GitRunOptions): Promise<{ readonly stdout: string }> {
    this.#runner ??= createRunner();
    return this.#runner.run(options);
  }
}

function createRunner(): GitRunnerLike {
  type GitContextRuntime = typeof import('../../../../packages/git-context/dist/index.js');
  // The extension build vendors the Git runtime beside this module as CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const runtime = require('../vendor/git-context/index.js') as GitContextRuntime;
  return new runtime.GitCommandRunner();
}
