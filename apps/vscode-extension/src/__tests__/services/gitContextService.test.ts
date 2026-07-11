import { describe, expect, it, vi } from 'vitest';
import {
  GitContextService,
  type GitContextDependencies,
} from '../../services/gitContextService';
import type {
  DiscoveryResult,
  GitRepository,
  GitStatusSnapshot,
} from '../../../../../packages/git-context/dist/index.js';

function repository(name: string): GitRepository {
  return {
    root: `/${name}`,
    displayName: name,
    hasRemote: false,
    remoteUrl: undefined,
    containsPath: vi.fn(),
    containsStrict: vi.fn(),
  } as unknown as GitRepository;
}

function discoveryResult(name: string): DiscoveryResult {
  return { folderPath: `/${name}`, repository: repository(name) };
}

function status(repo: GitRepository): GitStatusSnapshot {
  return {
    repository: repo,
    staged: [],
    unstaged: [],
    untracked: [],
    hasChanges: false,
  };
}

function createService(options?: {
  available?: boolean;
  repositories?: DiscoveryResult[];
  statusError?: Error;
}): {
  service: GitContextService;
  dependencies: {
    runner: { isAvailable: ReturnType<typeof vi.fn> };
    discovery: { discover: ReturnType<typeof vi.fn> };
    statusCollector: { getStatus: ReturnType<typeof vi.fn> };
  };
} {
  const repositories = options?.repositories ?? [];
  const dependencies = {
    runner: {
      isAvailable: vi.fn().mockResolvedValue(options?.available ?? true),
    },
    discovery: {
      discover: vi.fn().mockResolvedValue(repositories),
    },
    statusCollector: {
      getStatus: options?.statusError
        ? vi.fn().mockRejectedValue(options.statusError)
        : vi.fn(async (repo: GitRepository) => status(repo)),
    },
  };

  return {
    service: new GitContextService(dependencies as GitContextDependencies),
    dependencies,
  };
}

describe('GitContextService', () => {
  it('stops before discovery when Git is unavailable', async () => {
    const { service, dependencies } = createService({ available: false });

    await expect(service.inspect(['/workspace'], vi.fn())).resolves.toEqual({
      kind: 'git-unavailable',
    });
    expect(dependencies.discovery.discover).not.toHaveBeenCalled();
  });

  it('returns no-repository for an empty discovery result', async () => {
    const { service } = createService({ repositories: [] });
    await expect(service.inspect(['/workspace'], vi.fn())).resolves.toEqual({
      kind: 'no-repository',
    });
  });

  it('automatically uses the only discovered repository', async () => {
    const only = discoveryResult('only');
    const picker = vi.fn();
    const { service, dependencies } = createService({ repositories: [only] });

    const result = await service.inspect(['/workspace'], picker);

    expect(result.kind).toBe('ready');
    expect(picker).not.toHaveBeenCalled();
    expect(dependencies.statusCollector.getStatus).toHaveBeenCalledWith(
      only.repository,
      undefined,
    );
  });

  it('requires explicit selection when multiple repositories are found', async () => {
    const first = discoveryResult('first');
    const second = discoveryResult('second');
    const picker = vi.fn().mockResolvedValue(second);
    const { service, dependencies } = createService({ repositories: [first, second] });

    const result = await service.inspect(['/workspace'], picker);

    expect(picker).toHaveBeenCalledWith([first, second]);
    expect(result).toMatchObject({ kind: 'ready', repository: second.repository });
    expect(dependencies.statusCollector.getStatus).toHaveBeenCalledWith(
      second.repository,
      undefined,
    );
  });

  it('does not inspect status when repository selection is cancelled', async () => {
    const { service, dependencies } = createService({
      repositories: [discoveryResult('first'), discoveryResult('second')],
    });

    await expect(service.inspect(['/workspace'], vi.fn())).resolves.toEqual({
      kind: 'selection-cancelled',
    });
    expect(dependencies.statusCollector.getStatus).not.toHaveBeenCalled();
  });

  it('propagates status failures instead of returning a clean snapshot', async () => {
    const failure = new Error('status failed');
    const { service } = createService({
      repositories: [discoveryResult('only')],
      statusError: failure,
    });

    await expect(service.inspect(['/workspace'], vi.fn())).rejects.toBe(failure);
  });
});
