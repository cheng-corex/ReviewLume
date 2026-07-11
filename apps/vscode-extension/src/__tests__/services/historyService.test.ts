import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HistoryService,
  HISTORY_DIRECTORY,
  HISTORY_SCHEMA_VERSION,
  HistoryPathError,
  getHistoryRoot,
  getExportRoot,
} from '../../services/historyService';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-hist-'));
  temporaryDirectories.push(root);
  return root;
}

const pack = {
  reviewId: '20260711T010203Z-010203040506',
  workspaceId: 'abc123def456',
  byteLength: 1234,
  markdown: '# Review request\n\nThis is the review content.',
  manifest: {
    repositoryDisplayName: 'test-repo',
    generatedAt: '2026-07-11T01:02:03Z',
    reviewMode: 'standard',
    security: {
      hardBlocked: 0,
      blocked: 1,
      warnings: 2,
      info: 3,
      confirmedWarnings: 1,
    },
    files: [{ path: 'src/test.ts', source: 'changed' }],
  },
};

const expectedMetadata = {
  schemaVersion: HISTORY_SCHEMA_VERSION,
  reviewId: '20260711T010203Z-010203040506',
  workspaceId: 'abc123def456',
  repositoryDisplayName: 'test-repo',
  createdAt: '2026-07-11T01:02:03Z',
  reviewMode: 'standard',
  exportFormat: 'markdown',
  byteLength: 1234,
  fileCount: 1,
  hasMarkdown: true,
  hasZip: false,
  security: {
    hardBlockCount: 0,
    blockCount: 1,
    warnCount: 2,
    confirmedWarnCount: 1,
    infoCount: 3,
  },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true }),
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

  describe('getHistoryRoot / getExportRoot', () => {
    it('returns paths under the repository root', () => {
      const root = repoRoot;
      expect(getHistoryRoot(root)).toBe(path.join(root, '.reviewlume/history'));
      expect(getExportRoot(root)).toBe(path.join(root, '.reviewlume/exports'));
    });
  });

  describe('save', () => {
    it('saves metadata.json and request.md', async () => {
      await service.save(repoRoot, pack, 'markdown');

      const historyDir = path.join(repoRoot, HISTORY_DIRECTORY, pack.reviewId);
      const metadataPath = path.join(historyDir, 'metadata.json');
      const requestPath = path.join(historyDir, 'request.md');

      const metadataRaw = await fs.readFile(metadataPath, 'utf8');
      expect(JSON.parse(metadataRaw)).toEqual(expectedMetadata);

      const requestContent = await fs.readFile(requestPath, 'utf8');
      expect(requestContent).toBe(pack.markdown);
    });

    it('refuses to overwrite an existing history entry', async () => {
      await service.save(repoRoot, pack, 'markdown');
      await expect(service.save(repoRoot, pack, 'markdown')).rejects.toThrow();
    });

    it('rejects an invalid reviewId', async () => {
      const badPack = { ...pack, reviewId: '../../escape' };
      await expect(service.save(repoRoot, badPack, 'markdown')).rejects.toThrow(
        HistoryPathError,
      );
    });
  });

  describe('list', () => {
    it('returns an empty list when no history exists', async () => {
      const entries = await service.list(repoRoot);
      expect(entries).toEqual([]);
    });

    it('lists saved history entries in reverse chronological order', async () => {
      const first = {
        ...pack,
        reviewId: '20260710T010203Z-aabbccddeeff',
        manifest: {
          ...pack.manifest,
          generatedAt: '2026-07-10T01:02:03Z',
        },
      };
      const second = {
        ...pack,
        reviewId: '20260711T010203Z-010203040506',
        manifest: {
          ...pack.manifest,
          generatedAt: '2026-07-11T01:02:03Z',
        },
      };

      await service.save(repoRoot, first, 'zip');
      await service.save(repoRoot, second, 'both');

      const entries = await service.list(repoRoot);
      expect(entries).toHaveLength(2);
      // Most recent first
      expect(entries[0].metadata.reviewId).toBe(second.reviewId);
      expect(entries[1].metadata.reviewId).toBe(first.reviewId);
    });
  });

  describe('delete', () => {
    it('removes a single history entry', async () => {
      await service.save(repoRoot, pack, 'markdown');
      expect(await service.list(repoRoot)).toHaveLength(1);

      await service.delete(repoRoot, pack.reviewId);
      expect(await service.list(repoRoot)).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('removes all history entries', async () => {
      await service.save(repoRoot, pack, 'markdown');
      const second = {
        ...pack,
        reviewId: '20260710T010203Z-aabbccddeeff',
        manifest: { ...pack.manifest, generatedAt: '2026-07-10T01:02:03Z' },
      };
      await service.save(repoRoot, second, 'zip');

      expect(await service.list(repoRoot)).toHaveLength(2);
      await service.clearAll(repoRoot);
      expect(await service.list(repoRoot)).toHaveLength(0);
    });
  });

  describe('loadRequest', () => {
    it('reads the saved request content', async () => {
      await service.save(repoRoot, pack, 'markdown');
      const content = await service.loadRequest(repoRoot, pack.reviewId);
      expect(content).toBe(pack.markdown);
    });
  });

  describe('loadMetadata', () => {
    it('reads the saved metadata', async () => {
      await service.save(repoRoot, pack, 'markdown');
      const metadata = await service.loadMetadata(repoRoot, pack.reviewId);
      expect(metadata).toEqual(expectedMetadata);
    });
  });
});
