import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewLoopStorageService, ReviewLoopStorageError, sha256 } from '../../services/reviewLoopStorageService';

const reviewId = '20260714T010203Z-aabbccddeeff';
const roots: string[] = [];

async function createReviewDirectory(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-loop-'));
  roots.push(root);
  const directory = path.join(root, reviewId);
  await fs.mkdir(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('ReviewLoopStorageService', () => {
  it('initializes and reads validated state', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();

    const created = await service.initialize(directory, reviewId, '{"report":1}');
    const loaded = await service.readState(directory, reviewId);

    expect(created.baselineReportHash).toBe(sha256('{"report":1}'));
    expect(loaded).toEqual(created);
  });

  it('stores implementation prompt and summary in the same review directory', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');

    const promptHash = await service.saveImplementationPrompt(directory, '# task');
    const text = 'Fixed ISSUE-0000000000000001';
    const state = await service.saveImplementationSummary(directory, reviewId, {
      importedAt: '2026-07-14T01:02:03.000Z',
      sourceHash: sha256(text),
      issueIds: ['ISSUE-0000000000000001'],
      text,
    });

    expect(promptHash).toBe(sha256('# task'));
    expect(state.implementationSummary?.text).toBe(text);
    expect(await fs.readFile(path.join(directory, 'implementation-request.md'), 'utf8')).toBe('# task');
    expect(await fs.readFile(path.join(directory, 'implementation-response.md'), 'utf8')).toBe(text);
  });

  it('only accepts sequential review rounds', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');

    await expect(
      service.appendRound(directory, reviewId, {
        round: 2,
        createdAt: '2026-07-14T01:02:03.000Z',
        requestHash: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const state = await service.appendRound(directory, reviewId, {
      round: 1,
      createdAt: '2026-07-14T01:02:03.000Z',
      requestHash: 'a'.repeat(64),
    });
    expect(state.rounds).toHaveLength(1);
  });

  it('rejects invalid review IDs and symlinked review directories', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();

    await expect(service.initialize(directory, '../bad', 'baseline')).rejects.toBeInstanceOf(
      ReviewLoopStorageError,
    );

    if (process.platform !== 'win32') {
      const link = `${directory}-link`;
      await fs.symlink(directory, link, 'dir');
      await expect(service.initialize(link, reviewId, 'baseline')).rejects.toMatchObject({
        code: 'INVALID_DIRECTORY',
      });
    }
  });

  it('rejects oversized implementation content', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');

    await expect(service.saveImplementationPrompt(directory, 'x'.repeat(1_000_001))).rejects.toMatchObject({
      code: 'CONTENT_TOO_LARGE',
    });
  });
});
