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

  it('validates an implementation summary before creating its response file', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');

    await expect(
      service.saveImplementationSummary(directory, reviewId, {
        importedAt: 'not-a-date',
        sourceHash: 'not-a-hash',
        issueIds: ['ISSUE-0000000000000001'],
        text: 'invalid summary',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    await expect(
      fs.stat(path.join(directory, 'implementation-response.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await service.readState(directory, reviewId)).implementationSummary).toBeUndefined();
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

  it('does not create a new round while an earlier re-review is pending', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');
    await service.saveReReviewPrompt(directory, reviewId, 1, '# first re-review');

    await expect(
      service.saveReReviewPrompt(directory, reviewId, 2, '# overlapping re-review'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });

    const state = await service.readState(directory, reviewId);
    expect(state.rounds).toHaveLength(1);
    await expect(
      fs.stat(path.join(directory, 're-review-request-2.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists and verifies a completed re-review result', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');
    await service.saveReReviewPrompt(directory, reviewId, 1, '# re-review');

    const responseText = 'review response';
    const reportText = '{"schemaVersion":1}\n';
    const state = await service.saveReReviewResult(
      directory,
      reviewId,
      1,
      responseText,
      reportText,
    );

    expect(state.rounds[0]).toMatchObject({
      round: 1,
      responseHash: sha256(responseText),
      reportHash: sha256(reportText),
    });
    expect(await service.readReReviewReportText(directory, reviewId, 1)).toBe(reportText);
    await expect(
      service.saveReReviewResult(directory, reviewId, 1, responseText, reportText),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('detects tampered re-review reports', async () => {
    const directory = await createReviewDirectory();
    const service = new ReviewLoopStorageService();
    await service.initialize(directory, reviewId, 'baseline');
    await service.saveReReviewPrompt(directory, reviewId, 1, '# re-review');
    await service.saveReReviewResult(directory, reviewId, 1, 'response', '{"ok":true}\n');
    await fs.writeFile(path.join(directory, 're-review-report-1.json'), '{"ok":false}\n');

    await expect(service.readReReviewReportText(directory, reviewId, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
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
