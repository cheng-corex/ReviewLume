import type * as GitContextModule from '@reviewlume/git-context';

// The build copies @reviewlume/git-context/dist beside this compiled shim.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtime = require('./git-context/index.js') as typeof GitContextModule;

export const GitCommandRunner = runtime.GitCommandRunner;
export const GitRepositoryDiscovery = runtime.GitRepositoryDiscovery;
export const GitStatusCollector = runtime.GitStatusCollector;
export const GitCancelledError = runtime.GitCancelledError;
export const GitCommandError = runtime.GitCommandError;
export const GitTimeoutError = runtime.GitTimeoutError;
export const GitNotAvailableError = runtime.GitNotAvailableError;

export type {
  DiscoveryResult,
  GitRepository,
  GitStatusSnapshot,
} from '@reviewlume/git-context';
