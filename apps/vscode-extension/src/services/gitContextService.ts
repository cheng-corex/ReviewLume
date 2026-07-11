import type {
  DiscoveryResult,
  GitRepository,
  GitStatusSnapshot,
} from '../../../../packages/git-context';

interface GitRunnerLike {
  isAvailable(signal?: AbortSignal): Promise<boolean>;
}

interface GitDiscoveryLike {
  discover(
    workspaceFolders: readonly string[],
    signal?: AbortSignal,
  ): Promise<DiscoveryResult[]>;
}

interface GitStatusCollectorLike {
  getStatus(repository: GitRepository, signal?: AbortSignal): Promise<GitStatusSnapshot>;
}

export interface GitContextDependencies {
  readonly runner: GitRunnerLike;
  readonly discovery: GitDiscoveryLike;
  readonly statusCollector: GitStatusCollectorLike;
}

export type RepositoryPicker = (
  repositories: readonly DiscoveryResult[],
) => Promise<DiscoveryResult | undefined>;

export type GitContextInspection =
  | { readonly kind: 'git-unavailable' }
  | { readonly kind: 'no-repository' }
  | { readonly kind: 'selection-cancelled' }
  | {
      readonly kind: 'ready';
      readonly repository: GitRepository;
      readonly status: GitStatusSnapshot;
    };

function createDefaultDependencies(): GitContextDependencies {
  type GitContextRuntime = typeof import('../../../../packages/git-context');
  // The extension build compiles the package beside this module as CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const runtime = require('../vendor/git-context/index.js') as GitContextRuntime;
  const runner = new runtime.GitCommandRunner();
  return {
    runner,
    discovery: new runtime.GitRepositoryDiscovery(runner),
    statusCollector: new runtime.GitStatusCollector(runner),
  };
}

/**
 * VS Code-facing orchestration for the pure Git package.
 * It never auto-selects when more than one repository is discovered.
 */
export class GitContextService {
  readonly #runner: GitRunnerLike;
  readonly #discovery: GitDiscoveryLike;
  readonly #statusCollector: GitStatusCollectorLike;

  constructor(dependencies: GitContextDependencies = createDefaultDependencies()) {
    this.#runner = dependencies.runner;
    this.#discovery = dependencies.discovery;
    this.#statusCollector = dependencies.statusCollector;
  }

  async inspect(
    workspaceFolders: readonly string[],
    pickRepository: RepositoryPicker,
    signal?: AbortSignal,
  ): Promise<GitContextInspection> {
    const available = await this.#runner.isAvailable(signal);
    if (!available) {
      return { kind: 'git-unavailable' };
    }

    const repositories = await this.#discovery.discover(workspaceFolders, signal);
    if (repositories.length === 0) {
      return { kind: 'no-repository' };
    }

    const selected =
      repositories.length === 1 ? repositories[0] : await pickRepository(repositories);

    if (!selected) {
      return { kind: 'selection-cancelled' };
    }

    const status = await this.#statusCollector.getStatus(selected.repository, signal);
    return {
      kind: 'ready',
      repository: selected.repository,
      status,
    };
  }
}
