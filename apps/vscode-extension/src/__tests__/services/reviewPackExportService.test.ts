import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ReviewPackExportPathError,
  saveAutomaticReviewPack,
  validateExportDirectory,
} from '../../services/reviewPackExportService';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-export-'));
  temporaryDirectories.push(root);
  return root;
}

const pack = {
  reviewId: '20260711T010203Z-010203040506',
  directoryName: 'reviewlume-pack-20260711T010203Z-010203040506',
  markdown: '# Review request\n',
  zip: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true }),
  ));
});

describe('automatic Review Pack export', () => {
  it('writes Markdown to a review-specific directory', async () => {
    const root = await fixture();
    const result = await saveAutomaticReviewPack(root, '.reviewlume/exports', 'markdown', pack);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(path.join(root, '.reviewlume', 'exports', pack.reviewId, 'REVIEW_REQUEST.md'));
    expect(await fs.readFile(result.files[0], 'utf8')).toBe(pack.markdown);
  });

  it('writes ZIP and both formats without a save dialog dependency', async () => {
    const zipRoot = await fixture();
    const zip = await saveAutomaticReviewPack(zipRoot, 'out', 'zip', pack);
    expect(zip.files).toEqual([path.join(zipRoot, 'out', `${pack.directoryName}.zip`)]);

    const bothRoot = await fixture();
    const both = await saveAutomaticReviewPack(bothRoot, 'out', 'both', pack);
    expect(both.files).toHaveLength(2);
    expect(await fs.readFile(both.files[0], 'utf8')).toBe(pack.markdown);
    expect(Array.from(await fs.readFile(both.files[1]))).toEqual(Array.from(pack.zip));
  });

  it('rejects absolute paths, parent traversal, and Windows absolute paths', () => {
    expect(() => validateExportDirectory('../outside')).toThrow(ReviewPackExportPathError);
    expect(() => validateExportDirectory('/tmp/out')).toThrow(ReviewPackExportPathError);
    expect(() => validateExportDirectory('C:\\temp\\out')).toThrow(ReviewPackExportPathError);
    expect(validateExportDirectory('.reviewlume\\exports')).toBe('.reviewlume/exports');
  });

  it('never overwrites an existing export', async () => {
    const root = await fixture();
    await saveAutomaticReviewPack(root, 'out', 'markdown', pack);
    await expect(saveAutomaticReviewPack(root, 'out', 'markdown', pack)).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it.skipIf(process.platform === 'win32')('rejects symbolic-link directory escapes', async () => {
    const root = await fixture();
    const outside = await fixture();
    await fs.symlink(outside, path.join(root, 'escape'), 'dir');
    await expect(saveAutomaticReviewPack(root, 'escape/output', 'markdown', pack))
      .rejects.toBeInstanceOf(ReviewPackExportPathError);
  });
});
