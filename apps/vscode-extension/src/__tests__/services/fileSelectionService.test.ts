import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GitRepository,
  GitStatusSnapshot,
} from '../../../../../packages/git-context/dist/index.js';
import {
  FileSelectionError,
  FileSelectionService,
  ReviewLumeIgnoreMatcher,
} from '../../services/fileSelectionService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository(): Promise<{ root: string; repository: GitRepository }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-p3-'));
  temporaryDirectories.push(root);
  return {
    root,
    repository: {
      root,
      displayName: 'fixture',
      hasRemote: false,
      remoteUrl: undefined,
    } as unknown as GitRepository,
  };
}

function status(
  repository: GitRepository,
  options: Partial<GitStatusSnapshot> = {},
): GitStatusSnapshot {
  return {
    repository,
    staged: [],
    unstaged: [],
    untracked: [],
    hasChanges: false,
    ...options,
  };
}

function gitRunner(options?: {
  ignored?: readonly string[];
  files?: readonly string[];
}) {
  const ignored = new Set(options?.ignored ?? []);
  const files = options?.files ?? [];
  return {
    run: vi.fn(async ({ args }: { args: readonly string[] }) => {
      if (args[0] === 'check-ignore') {
        const relativePath = args.at(-1) ?? '';
        if (ignored.has(relativePath)) return { stdout: '' };
        throw Object.assign(new Error('not ignored'), {
          code: 'GIT_COMMAND_ERROR',
          exitCode: 1,
        });
      }
      if (args[0] === 'ls-files') {
        return { stdout: files.length > 0 ? `${files.join('\0')}\0` : '' };
      }
      throw new Error(`Unexpected Git command: ${args.join(' ')}`);
    }),
  };
}

describe('ReviewLumeIgnoreMatcher', () => {
  it('supports root patterns, recursive globs, comments, and negation', () => {
    const matcher = new ReviewLumeIgnoreMatcher([
      '# comment',
      '/generated/',
      '**/*.secret',
      '!safe/keep.secret',
      '*.log',
    ]);

    expect(matcher.isIgnored('generated/file.ts')).toBe(true);
    expect(matcher.isIgnored('src/generated/file.ts')).toBe(false);
    expect(matcher.isIgnored('src/private.secret')).toBe(true);
    expect(matcher.isIgnored('safe/keep.secret')).toBe(false);
    expect(matcher.isIgnored('logs/app.log')).toBe(true);
    expect(matcher.isIgnored('src/app.ts')).toBe(false);
  });
});

describe('FileSelectionService', () => {
  it('builds a deduplicated changed-file selection and keeps deleted paths', async () => {
    const { root, repository } = await createRepository();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true;');
    await fs.writeFile(path.join(root, 'blocked.secret'), 'blocked');
    await fs.writeFile(path.join(root, 'safe.secret'), 'safe');
    await fs.writeFile(
      path.join(root, '.reviewlumeignore'),
      '*.secret\n!safe.secret\n',
    );

    const service = new FileSelectionService(gitRunner());
    await service.initialize(
      repository,
      status(repository, {
        staged: [{ path: 'src/app.ts', status: 'modified' }],
        unstaged: [
          { path: 'src/app.ts', status: 'modified' },
          { path: 'removed.ts', status: 'deleted' },
        ],
        untracked: [
          { path: 'blocked.secret', status: 'untracked' },
          { path: 'safe.secret', status: 'untracked' },
        ],
        hasChanges: true,
      }),
    );

    expect(service.entries).toEqual([
      {
        path: 'removed.ts',
        source: 'changed',
        changeKinds: ['deleted'],
        exists: false,
        selected: true,
      },
      {
        path: 'safe.secret',
        source: 'changed',
        changeKinds: ['untracked'],
        exists: true,
        selected: true,
      },
      {
        path: 'src/app.ts',
        source: 'changed',
        changeKinds: ['modified'],
        exists: true,
        selected: true,
      },
    ]);
    expect(service.selectedCount).toBe(3);
  });

  it('enforces Git ignore and .reviewlumeignore for manual files', async () => {
    const { root, repository } = await createRepository();
    await fs.writeFile(path.join(root, '.reviewlumeignore'), '*.tmp\n');
    await fs.writeFile(path.join(root, 'related.md'), 'related');
    await fs.writeFile(path.join(root, 'ignored.log'), 'ignored');
    await fs.writeFile(path.join(root, 'blocked.tmp'), 'blocked');

    const runner = gitRunner({ ignored: ['ignored.log'] });
    const service = new FileSelectionService(runner);
    await service.initialize(repository, status(repository));

    const result = await service.addManualFiles([
      path.join(root, 'related.md'),
      path.join(root, 'ignored.log'),
      path.join(root, 'blocked.tmp'),
    ]);

    expect(result.added).toEqual(['related.md']);
    expect(result.skipped).toEqual([
      { path: 'ignored.log', reason: 'gitignore' },
      { path: 'blocked.tmp', reason: 'reviewlumeignore' },
    ]);
    expect(service.entries).toMatchObject([
      { path: 'related.md', source: 'manual', selected: true },
    ]);
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['check-ignore', '-q', '--', 'related.md'] }),
    );
  });

  it('rejects manual files from another repository', async () => {
    const { root, repository } = await createRepository();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-outside-'));
    temporaryDirectories.push(outside);
    await fs.writeFile(path.join(outside, 'outside.ts'), 'outside');

    const service = new FileSelectionService(gitRunner());
    await service.initialize(repository, status(repository));

    await expect(service.addManualFiles([path.join(outside, 'outside.ts')])).rejects.toMatchObject({
      code: 'CROSS_REPOSITORY',
    });
    expect(service.entries).toHaveLength(0);
    expect(root).not.toBe(outside);
  });

  const symlinkTest = process.platform === 'win32' ? it.skip : it;
  symlinkTest('rejects a symbolic link that escapes the repository', async () => {
    const { root, repository } = await createRepository();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-link-target-'));
    temporaryDirectories.push(outside);
    await fs.writeFile(path.join(outside, 'secret.ts'), 'secret');
    await fs.symlink(path.join(outside, 'secret.ts'), path.join(root, 'linked.ts'));

    const service = new FileSelectionService(gitRunner());
    await service.initialize(repository, status(repository));

    await expect(service.addManualFiles([path.join(root, 'linked.ts')])).rejects.toBeInstanceOf(
      FileSelectionError,
    );
    await expect(service.addManualFiles([path.join(root, 'linked.ts')])).rejects.toMatchObject({
      code: 'SYMLINK_ESCAPE',
    });
  });

  it('recommends matching tests as unchecked candidates', async () => {
    const { root, repository } = await createRepository();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(path.join(root, 'tests'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'widget.ts'), 'widget');
    await fs.writeFile(path.join(root, 'src', 'widget.test.ts'), 'test');
    await fs.writeFile(path.join(root, 'tests', 'other.test.ts'), 'other');

    const service = new FileSelectionService(
      gitRunner({ files: ['src/widget.ts', 'src/widget.test.ts', 'tests/other.test.ts'] }),
    );
    await service.initialize(
      repository,
      status(repository, {
        unstaged: [{ path: 'src/widget.ts', status: 'modified' }],
        hasChanges: true,
      }),
    );

    await expect(service.recommendTests()).resolves.toEqual(['src/widget.test.ts']);
    expect(service.entries).toEqual([
      {
        path: 'src/widget.test.ts',
        source: 'recommended',
        changeKinds: [],
        exists: true,
        selected: false,
      },
      {
        path: 'src/widget.ts',
        source: 'changed',
        changeKinds: ['modified'],
        exists: true,
        selected: true,
      },
    ]);

    service.setSelected('src/widget.test.ts', true);
    expect(service.selectedCount).toBe(2);
  });
});
