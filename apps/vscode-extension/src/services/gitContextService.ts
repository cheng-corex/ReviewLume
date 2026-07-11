import {
  GitCommandRunner,
  GitRepositoryDiscovery,
  GitStatusCollector,
} from '../vendor/gitContextRuntime';
import type {
  DiscoveryResult,
  GitRepository,
  GitStatusSnapshot,
} from '../vendor/gitContextRuntime';

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

/**
 * VS Code-facing orchestration for the pure @reviewlume/git-context package.
 * It never auto-selects when more than one repository is discovered.
 */
export class GitContextService {
  constructor(
    private readonly runner: InstanceType<typeof GitCommandRunner> = new GitCommandRunner(),
    private readonly discovery: InstanceType<typeof GitRepositoryDiscovery> =
      new GitRepositoryDiscovery(runner),
    private readonly statusCollector: InstanceType<typeof GitStatusCollector> =
      new GitStatusCollector(runner),
  ) {}

  async inspect(
    workspaceFolders: readonly string[],
    pickRepository: RepositoryPicker,
    signal?: AbortSignal,
  ): Promise<GitContextInspection> {
    const available = await this.runner.isAvailable(signal);
    if (!available) {
      return { kind: 'git-unavailable' };
    }

    const repositories = await this.discovery.discover(workspaceFolders, signal);
    if (repositories.length === 0) {
      return { kind: 'no-repository' };
    }

    const selected =
      repositories.length === 1 ? repositories[0] : await pickRepository(repositories);

    if (!selected) {
      return { kind: 'selection-cancelled' };
    }

    const status = await this.statusCollector.getStatus(selected.repository, signal);
    return {
      kind: 'ready',
      repository: selected.repository,
      status,
    };
  }
}
