import type { McpGitRunner } from './mcpRepositoryTools';

/** Load the packaged or workspace Git runner without widening its read-only allowlist. */
export function createReadOnlyGitRunner(): McpGitRunner {
  type GitContextRuntime = typeof import('../../../../packages/git-context/dist/index.js');
  try {
    // Packaged VSIX runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const runtime = require('../vendor/git-context/index.js') as GitContextRuntime;
    return new runtime.GitCommandRunner();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'MODULE_NOT_FOUND') throw error;
    // Workspace test/development runtime before the vendor build has run.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const runtime = require('../../../../packages/git-context/src/index') as GitContextRuntime;
    return new runtime.GitCommandRunner();
  }
}
