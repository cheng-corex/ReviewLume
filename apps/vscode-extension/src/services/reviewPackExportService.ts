import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type ReviewPackExportMode = 'automatic' | 'askEveryTime';
export type ReviewPackExportFormat = 'markdown' | 'zip' | 'both';

export interface ReviewPackExportPayload {
  readonly reviewId: string;
  readonly directoryName: string;
  readonly markdown: string;
  readonly zip: Uint8Array;
}

export interface AutomaticExportResult {
  readonly files: readonly string[];
  readonly directory: string;
}

export class ReviewPackExportPathError extends Error {
  readonly code = 'INVALID_EXPORT_DIRECTORY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ReviewPackExportPathError';
  }
}

export function validateExportDirectory(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new ReviewPackExportPathError('ReviewLume export directory must be a repository-relative path without parent traversal.');
  }
  return normalized;
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function ensureSafeDirectory(repositoryRoot: string, relativeDirectory: string): Promise<string> {
  const repositoryRealPath = await fs.realpath(repositoryRoot);
  const parts = validateExportDirectory(relativeDirectory).split('/');
  let current = repositoryRealPath;

  for (const part of parts) {
    const next = path.join(current, part);
    try {
      const stat = await fs.lstat(next);
      if (stat.isSymbolicLink()) {
        throw new ReviewPackExportPathError('ReviewLume export directory cannot traverse a symbolic link.');
      }
      if (!stat.isDirectory()) {
        throw new ReviewPackExportPathError('ReviewLume export path contains a non-directory component.');
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
      if (code !== 'ENOENT') throw error;
      await fs.mkdir(next);
    }
    current = next;
  }

  const finalRealPath = await fs.realpath(current);
  if (!isInside(repositoryRealPath, finalRealPath)) {
    throw new ReviewPackExportPathError('ReviewLume export directory escapes the active repository.');
  }
  return finalRealPath;
}

async function ensureReviewDirectory(exportRoot: string, reviewId: string): Promise<string> {
  const reviewDirectory = path.join(exportRoot, reviewId);
  await fs.mkdir(reviewDirectory, { recursive: false }).catch((error: unknown) => {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
    if (code !== 'EEXIST') throw error;
  });
  return reviewDirectory;
}

export async function saveAutomaticReviewPack(
  repositoryRoot: string,
  relativeDirectory: string,
  format: ReviewPackExportFormat,
  pack: ReviewPackExportPayload,
): Promise<AutomaticExportResult> {
  const exportRoot = await ensureSafeDirectory(repositoryRoot, relativeDirectory);
  const files: string[] = [];

  if (format === 'markdown') {
    const reviewDirectory = await ensureReviewDirectory(exportRoot, pack.reviewId);
    const markdownPath = path.join(reviewDirectory, 'REVIEW_REQUEST.md');
    await fs.writeFile(markdownPath, Buffer.from(pack.markdown, 'utf8'), { flag: 'wx' });
    files.push(markdownPath);
  }

  if (format === 'zip') {
    const zipPath = path.join(exportRoot, `${pack.directoryName}.zip`);
    await fs.writeFile(zipPath, Buffer.from(pack.zip), { flag: 'wx' });
    files.push(zipPath);
  }

  if (format === 'both') {
    const reviewDirectory = await ensureReviewDirectory(exportRoot, pack.reviewId);
    const markdownPath = path.join(reviewDirectory, 'REVIEW_REQUEST.md');
    const zipPath = path.join(reviewDirectory, `${pack.directoryName}.zip`);

    await Promise.all([
      fs.access(markdownPath).then(
        () => Promise.reject(Object.assign(new Error('Review Pack output already exists.'), { code: 'EEXIST' })),
        () => undefined,
      ),
      fs.access(zipPath).then(
        () => Promise.reject(Object.assign(new Error('Review Pack output already exists.'), { code: 'EEXIST' })),
        () => undefined,
      ),
    ]);

    await fs.writeFile(markdownPath, Buffer.from(pack.markdown, 'utf8'), { flag: 'wx' });
    try {
      await fs.writeFile(zipPath, Buffer.from(pack.zip), { flag: 'wx' });
    } catch (error) {
      await fs.rm(markdownPath, { force: true });
      throw error;
    }
    files.push(markdownPath, zipPath);
  }

  return { files, directory: exportRoot };
}
