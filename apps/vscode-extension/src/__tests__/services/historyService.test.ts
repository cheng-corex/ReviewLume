import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPORTS_DIRECTORY,
  HISTORY_DIRECTORY,
  HISTORY_SCHEMA_VERSION,
  HistoryPathError,
  HistoryService,
  getExportRoot,
  getHistoryRoot,
} from '../../services/historyService';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-hist-'));
  temporaryDirectories.push(root);
  return root;
}

const pack = {
  reviewId: '20260711T010203Z-010203040506',
  workspaceId: 'abc123def4567890',
  byteLength: 46,
  markdown: '# Review request\n\nThis is the review content.\n',
  zip: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
  directoryName: 'reviewlume-pack-20260711T010203Z-010203040506',
  manifest: {
    repositoryDisplayName: 'test-repo',
    generatedAt: '2026-07-11T01:02:03.000Z',
    reviewMode: 'standard',
    security: {
      hardBlocked: 0,
      blocked: 0,
      warnings: 2,
      info: 3,
      confirmedWarnings: 2,
    },
    files: [
      { path: 'src/test.ts', source: 'changed', truncated: false },
      { path: 'src/test.spec.ts', source: 'recommended', truncated: true },
    ],
    excluded: [{ path: 'src/ignored.ts', reason: 'not selected' }],
    truncations: ['file:src/test.spec.ts'],
  },
};

const automaticMarkdown = {
  format: 'markdown' as const,
  mode: 'automatic' as const,
  exportDirectory: EXPORTS_DIRECTORY,
};

async function createManagedExport(
  root: string,
  reviewId = pack.reviewId,
  includeMarkdown = true,
  includeZip = false,
): Promise<string> {
  const directory = path.join(root, EXPORTS_DIRECTORY, reviewId);
  await fs.mkdir(directory, { recursive: true });
  if (includeMarkdown) {
    await fs.writeFile(path.join(directory, 'REVIEW_REQUEST.md'), pack.markdown);
  }
  if (includeZip) {
    await fs.writeFile(
      path.join(directory, `reviewlume-pack-${reviewId}.zip`),
      pack.zip,
    );
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('HistoryService', () => {
  let service: HistoryService;
  let repoRoot: string;

  beforeEach(async () => {
    service = new HistoryService();
    repoRoot = await fixture();
  });

  it('returns repository-bound history and export roots', () => {
    expect(getHistoryRoot(repoRoot)).toBe(path.join(repoRoot, HISTORY_DIRECTORY));
    expect(getExportRoot(repoRoot)).toBe(path.join(repoRoot, EXPORTS_DIRECTORY));
  });

  it('atomically saves validated metadata and the exact request snapshot', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);

    const historyDirectory = path.join(repoRoot, HISTORY_DIRECTORY, pack.reviewId);
    const metadata = JSON.parse(
      await fs.readFile(path.join(historyDirectory, 'metadata.json'), 'utf8'),
    );
    expect(metadata).toMatchObject({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      reviewId: pack.reviewId,
      workspaceId: pack.workspaceId,
      exportMode: 'automatic',
      exportFormat: 'markdown',
      exportDirectory: EXPORTS_DIRECTORY,
      exportedFiles: ['REVIEW_REQUEST.md'],
      selectedFiles: pack.manifest.files,
      hasMarkdown: true,
      hasZip: false,
      reviewPack: {
        markdownBytes: pack.byteLength,
        zipBytes: pack.zip.byteLength,
        truncated: true,
        excludedFileCount: 1,
      },
    });
    expect(await fs.readFile(path.join(historyDirectory, 'request.md'), 'utf8')).toBe(
      pack.markdown,
    );
    expect((await fs.readdir(path.join(repoRoot, HISTORY_DIRECTORY))).some((name) =>
      name.startsWith('.tmp-'),
    )).toBe(false);
  });

  it('refuses to overwrite an existing history entry', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);
    await expect(service.save(repoRoot, pack, automaticMarkdown)).rejects.toMatchObject({
      code: 'EEXIST',
    });
  });

  it('rejects invalid review IDs and repository traversal', async () => {
    await expect(
      service.save(repoRoot, { ...pack, reviewId: '../../escape' }, automaticMarkdown),
    ).rejects.toBeInstanceOf(HistoryPathError);
    await expect(service.loadRequest(repoRoot, '../escape')).rejects.toBeInstanceOf(
      HistoryPathError,
    );
  });

  it('lists valid entries in reverse chronological order', async () => {
    const first = {
      ...pack,
      reviewId: '20260710T010203Z-aabbccddeeff',
      directoryName: 'reviewlume-pack-20260710T010203Z-aabbccddeeff',
      manifest: { ...pack.manifest, generatedAt: '2026-07-10T01:02:03.000Z' },
    };
    await service.save(repoRoot, first, {
      format: 'zip',
      mode: 'askEveryTime',
    });
    await service.save(repoRoot, pack, {
      format: 'both',
      mode: 'askEveryTime',
    });

    const entries = await service.list(repoRoot);
    expect(entries.map((entry) => entry.metadata.reviewId)).toEqual([
      pack.reviewId,
      first.reviewId,
    ]);
    expect(entries.every((entry) => entry.integrity === 'valid')).toBe(true);
  });

  it('surfaces corrupt metadata instead of silently dropping the entry', async () => {
    const historyDirectory = path.join(repoRoot, HISTORY_DIRECTORY, pack.reviewId);
    await fs.mkdir(historyDirectory, { recursive: true });
    await fs.writeFile(path.join(historyDirectory, 'metadata.json'), '{broken');
    await fs.writeFile(path.join(historyDirectory, 'request.md'), pack.markdown);

    const entries = await service.list(repoRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].integrity).toBe('corrupt');
    expect(entries[0].issues).toContain('INVALID_METADATA');
  });

  it('marks missing managed exports as partial', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);
    const entries = await service.list(repoRoot);
    expect(entries[0].integrity).toBe('partial');
    expect(entries[0].issues).toContain('MARKDOWN_EXPORT_MISSING');
  });

  it('recognizes a complete managed export and checks its size', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);
    await createManagedExport(repoRoot);
    const entries = await service.list(repoRoot);
    expect(entries[0].integrity).toBe('valid');
    expect(entries[0].markdownPath).toBe(
      path.join(
        await fs.realpath(repoRoot),
        EXPORTS_DIRECTORY,
        pack.reviewId,
        'REVIEW_REQUEST.md',
      ),
    );
  });

  it('re-exports the exact Markdown snapshot and updates metadata', async () => {
    await service.save(repoRoot, pack, {
      format: 'zip',
      mode: 'askEveryTime',
    });
    const markdownPath = await service.reexportMarkdown(repoRoot, pack.reviewId);
    expect(await fs.readFile(markdownPath, 'utf8')).toBe(pack.markdown);
    const metadata = await service.loadMetadata(repoRoot, pack.reviewId);
    expect(metadata.hasMarkdown).toBe(true);
    expect(metadata.exportFormat).toBe('both');
    expect(metadata.exportDirectory).toBe(EXPORTS_DIRECTORY);
  });

  it('deletes the history entry and its managed export directory', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);
    const exportDirectory = await createManagedExport(repoRoot);

    const result = await service.delete(repoRoot, pack.reviewId);
    expect(result).toEqual({ historyDeleted: true, exportDeleted: true });
    await expect(fs.access(path.join(repoRoot, HISTORY_DIRECTORY, pack.reviewId))).rejects.toThrow();
    await expect(fs.access(exportDirectory)).rejects.toThrow();
  });

  it('saves and deliberately overwrites response text through the validated history path', async () => {
    await service.save(repoRoot, pack, automaticMarkdown);
    await service.saveResponse(repoRoot, pack.reviewId, '# First', false);
    await expect(
      service.saveResponse(repoRoot, pack.reviewId, '# Second', false),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    await service.saveResponse(repoRoot, pack.reviewId, '# Second', true);
    expect(
      await fs.readFile(
        path.join(repoRoot, HISTORY_DIRECTORY, pack.reviewId, 'response.md'),
        'utf8',
      ),
    ).toBe('# Second');
  });

  it.skipIf(process.platform === 'win32')('rejects symbolic-link history roots', async () => {
    const outside = await fixture();
    await fs.mkdir(path.join(repoRoot, '.reviewlume'), { recursive: true });
    await fs.symlink(outside, path.join(repoRoot, HISTORY_DIRECTORY), 'dir');
    await expect(service.save(repoRoot, pack, automaticMarkdown)).rejects.toBeInstanceOf(
      HistoryPathError,
    );
  });
});
