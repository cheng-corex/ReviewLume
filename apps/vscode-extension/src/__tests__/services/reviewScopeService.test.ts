import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GitRepository,
  GitStatusSnapshot,
} from '../../../../../packages/git-context/dist/index.js';
import { FileSelectionService } from '../../services/fileSelectionService';
import {
  ReviewScopeError,
  ReviewScopeService,
} from '../../services/reviewScopeService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createRepository(files: Record<string, string | Buffer>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-scope-'));
  temporaryDirectories.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }
  const repository = {
    root,
    displayName: 'scope-fixture',
    hasRemote: false,
    remoteUrl: undefined,
  } as unknown as GitRepository;
  const listedFiles = Object.keys(files);
  const runner = {
    run: vi.fn(async ({ args }: { args: readonly string[] }) => {
      if (args[0] === 'ls-files') {
        return { stdout: `${listedFiles.join('\0')}\0` };
      }
      if (args[0] === 'check-ignore') {
        throw Object.assign(new Error('not ignored'), {
          code: 'GIT_COMMAND_ERROR',
          exitCode: 1,
        });
      }
      throw new Error(`Unexpected Git command: ${args.join(' ')}`);
    }),
  };
  const service = new FileSelectionService(runner);
  const status: GitStatusSnapshot = {
    repository,
    staged: [],
    unstaged: [{ path: 'src/app.ts', status: 'modified' }],
    untracked: [],
    hasChanges: true,
  };
  await service.initialize(repository, status);
  return { root, service, runner };
}

describe('ReviewScopeService', () => {
  it('selects direct dependencies, callers, tests, and project context in smart mode', async () => {
    const { service } = await createRepository({
      'src/app.ts': "import { helper } from './helper';\nexport const app = helper();\n",
      'src/helper.ts': 'export const helper = () => true;\n',
      'src/caller.ts': "import { app } from './app';\nexport const caller = app;\n",
      'src/app.spec.ts': "import { app } from './app';\ndescribe('app', () => app);\n",
      'src/unrelated.ts': 'export const unrelated = true;\n',
      'package.json': '{"name":"fixture"}\n',
      '.reviewlume/exports/old.txt': 'must not be included',
      'assets/image.png': Buffer.from([0, 1, 2, 3]),
    });
    const scope = new ReviewScopeService(service);

    const summary = await scope.apply('smart');
    const selected = service.entries.filter((entry) => entry.selected);

    expect(summary.mode).toBe('smart');
    expect(selected.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'src/app.ts',
        'src/helper.ts',
        'src/caller.ts',
        'src/app.spec.ts',
        'package.json',
      ]),
    );
    expect(selected.find((entry) => entry.path === 'src/helper.ts')?.source).toBe('context');
    expect(selected.some((entry) => entry.path === 'src/unrelated.ts')).toBe(false);
    expect(selected.some((entry) => entry.path.startsWith('.reviewlume/'))).toBe(false);
    expect(selected.some((entry) => entry.path === 'assets/image.png')).toBe(false);
  });

  it('recomputes smart context after an explicit seed is deselected', async () => {
    const { service } = await createRepository({
      'src/app.ts': "import './helper';\n",
      'src/helper.ts': 'export const helper = true;\n',
      'package.json': '{"name":"fixture"}\n',
    });
    const scope = new ReviewScopeService(service);

    await scope.apply('smart');
    expect(service.entries.some((entry) => entry.source === 'context')).toBe(true);

    service.setSelected('src/app.ts', false);
    const summary = await scope.refreshSmartContext();

    expect(summary.contextFileCount).toBe(0);
    expect(service.entries).toEqual([
      expect.objectContaining({ path: 'src/app.ts', source: 'changed', selected: false }),
    ]);
  });

  it('removes automatic context when switching back to changes only', async () => {
    const { service } = await createRepository({
      'src/app.ts': "import './helper';\n",
      'src/helper.ts': 'export const helper = true;\n',
    });
    const scope = new ReviewScopeService(service);

    await scope.apply('smart');
    expect(service.entries.some((entry) => entry.source === 'context')).toBe(true);
    await scope.apply('changes');

    expect(service.entries).toEqual([
      expect.objectContaining({ path: 'src/app.ts', source: 'changed', selected: true }),
    ]);
  });

  it('includes every eligible text file in full mode without including generated or binary files', async () => {
    const { service } = await createRepository({
      'src/app.ts': 'export const app = true;\n',
      'src/helper.ts': 'export const helper = true;\n',
      'README.md': '# Fixture\n',
      '.reviewlume/history/old/request.md': 'generated',
      'data.sqlite': Buffer.from([0, 1, 2]),
    });
    const scope = new ReviewScopeService(service);

    const summary = await scope.apply('full');
    const selected = service.entries.filter((entry) => entry.selected).map((entry) => entry.path);

    expect(summary.mode).toBe('full');
    expect(selected).toEqual(expect.arrayContaining(['src/app.ts', 'src/helper.ts', 'README.md']));
    expect(selected.some((filePath) => filePath.startsWith('.reviewlume/'))).toBe(false);
    expect(selected).not.toContain('data.sqlite');
  });

  it('blocks full repository mode before applying a context overlay when source bytes exceed the limit', async () => {
    const large = 'a'.repeat(800 * 1024);
    const { service } = await createRepository({
      'src/app.ts': 'export const app = true;\n',
      'docs/a.md': large,
      'docs/b.md': large,
    });
    const scope = new ReviewScopeService(service);

    await expect(scope.apply('full')).rejects.toBeInstanceOf(ReviewScopeError);
    await expect(scope.apply('full')).rejects.toMatchObject({
      code: 'FULL_REPOSITORY_TOO_LARGE',
    });
    expect(service.entries).toEqual([
      expect.objectContaining({ path: 'src/app.ts', source: 'changed' }),
    ]);
  });
});
