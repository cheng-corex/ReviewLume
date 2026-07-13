import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import {
  validateExportDirectory,
  type ReviewPackExportFormat,
  type ReviewPackExportMode,
} from './reviewPackExportService';

export const HISTORY_SCHEMA_VERSION = 1 as const;
export const HISTORY_DIRECTORY = '.reviewlume/history';
export const EXPORTS_DIRECTORY = '.reviewlume/exports';

const REVIEW_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
const WORKSPACE_ID_PATTERN = /^[0-9a-f]{16}$/;

const reviewIdSchema = z.string().max(64).regex(REVIEW_ID_PATTERN);
const workspaceIdSchema = z.string().regex(WORKSPACE_ID_PATTERN);
const isoTimestampSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp.');
const safeTextSchema = z
  .string()
  .max(200)
  .refine((value) => !/[\0\r\n]/.test(value), 'Control characters are not allowed.');
const repositoryRelativePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !/[\0\r\n\\]/.test(value) &&
      !value.split('/').some((part) => !part || part === '.' || part === '..'),
    'History file paths must be repository-relative.',
  );
const exportedFileNameSchema = z
  .string()
  .min(1)
  .max(260)
  .refine(
    (value) => value === path.basename(value) && !/[\0\r\n/\\]/.test(value),
    'Exported file names must not contain path separators.',
  );

const historySecuritySummarySchema = z
  .object({
    hardBlockCount: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    warnCount: z.number().int().nonnegative(),
    confirmedWarnCount: z.number().int().nonnegative(),
    infoCount: z.number().int().nonnegative(),
  })
  .strict();

const historySelectedFileSchema = z
  .object({
    path: repositoryRelativePathSchema,
    source: z.enum(['changed', 'manual', 'recommended']),
    truncated: z.boolean(),
  })
  .strict();

export const historyMetadataSchema = z
  .object({
    schemaVersion: z.literal(HISTORY_SCHEMA_VERSION),
    reviewId: reviewIdSchema,
    workspaceId: workspaceIdSchema,
    repositoryDisplayName: safeTextSchema.min(1),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    reviewMode: safeTextSchema.min(1),
    exportMode: z.enum(['automatic', 'askEveryTime']),
    exportFormat: z.enum(['markdown', 'zip', 'both']),
    exportDirectory: repositoryRelativePathSchema.optional(),
    exportedFiles: z.array(exportedFileNameSchema).max(3),
    byteLength: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
    hasMarkdown: z.boolean(),
    hasZip: z.boolean(),
    selectedFiles: z.array(historySelectedFileSchema).max(10000),
    security: historySecuritySummarySchema,
    reviewPack: z
      .object({
        markdownBytes: z.number().int().nonnegative(),
        zipBytes: z.number().int().nonnegative(),
        truncated: z.boolean(),
        excludedFileCount: z.number().int().nonnegative(),
      })
      .strict(),
    status: z.literal('exported'),
  })
  .strict();

const legacyHistoryMetadataSchema = z
  .object({
    schemaVersion: z.literal(HISTORY_SCHEMA_VERSION),
    reviewId: reviewIdSchema,
    workspaceId: workspaceIdSchema,
    repositoryDisplayName: safeTextSchema.min(1),
    createdAt: isoTimestampSchema,
    reviewMode: safeTextSchema.min(1),
    exportFormat: z.enum(['markdown', 'zip', 'both']),
    byteLength: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
    hasMarkdown: z.boolean(),
    hasZip: z.boolean(),
    security: historySecuritySummarySchema,
  })
  .strict();

export type HistorySecuritySummary = z.infer<typeof historySecuritySummarySchema>;
export type HistoryMetadata = z.infer<typeof historyMetadataSchema>;
export type HistoryIntegrity = 'valid' | 'partial' | 'corrupt';

export interface HistoryEntry {
  readonly metadata: HistoryMetadata;
  readonly requestPreview: string;
  readonly markdownPath?: string;
  readonly zipPath?: string;
  readonly integrity: HistoryIntegrity;
  readonly issues: readonly string[];
}

export interface HistorySaveOptions {
  readonly format: ReviewPackExportFormat;
  readonly mode: ReviewPackExportMode;
  /** Repository-relative managed export directory. Omit for askEveryTime destinations. */
  readonly exportDirectory?: string;
}

export interface HistoryDeleteResult {
  readonly historyDeleted: boolean;
  readonly exportDeleted: boolean;
}

export class HistoryPathError extends Error {
  readonly code = 'INVALID_HISTORY_PATH' as const;

  constructor(message: string) {
    super(message);
    this.name = 'HistoryPathError';
  }
}

export class HistoryDataError extends Error {
  readonly code = 'INVALID_HISTORY_DATA' as const;

  constructor(message: string) {
    super(message);
    this.name = 'HistoryDataError';
  }
}

export function getHistoryRoot(repositoryRoot: string): string {
  return path.join(repositoryRoot, HISTORY_DIRECTORY);
}

export function getExportRoot(repositoryRoot: string): string {
  return path.join(repositoryRoot, EXPORTS_DIRECTORY);
}

export class HistoryService {
  async list(repositoryRoot: string): Promise<HistoryEntry[]> {
    let repositoryRealPath: string;
    try {
      repositoryRealPath = await getRepositoryRealPath(repositoryRoot);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return [];
      throw error;
    }

    const historyRoot = await resolveSafeDirectory(
      repositoryRealPath,
      HISTORY_DIRECTORY,
      false,
    );
    if (!historyRoot) return [];

    const dirents = await fs.readdir(historyRoot, { withFileTypes: true });
    const entries: HistoryEntry[] = [];

    for (const dirent of dirents) {
      if (!REVIEW_ID_PATTERN.test(dirent.name)) continue;
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      entries.push(await this.#loadEntry(repositoryRealPath, historyRoot, dirent.name));
    }

    return entries.sort((left, right) => {
      const leftTime = Date.parse(left.metadata.createdAt);
      const rightTime = Date.parse(right.metadata.createdAt);
      return rightTime - leftTime || right.metadata.reviewId.localeCompare(left.metadata.reviewId);
    });
  }

  async save(
    repositoryRoot: string,
    pack: {
      readonly reviewId: string;
      readonly workspaceId: string;
      readonly byteLength: number;
      readonly markdown: string;
      readonly zip: Uint8Array;
      readonly directoryName: string;
      readonly manifest: {
        readonly repositoryDisplayName: string;
        readonly generatedAt: string;
        readonly reviewMode: string;
        readonly security: {
          readonly hardBlocked: number;
          readonly blocked: number;
          readonly warnings: number;
          readonly info: number;
          readonly confirmedWarnings: number;
        };
        readonly files: readonly {
          readonly path: string;
          readonly source: string;
          readonly truncated: boolean;
        }[];
        readonly excluded: readonly unknown[];
        readonly truncations: readonly string[];
      };
    },
    options: HistorySaveOptions,
  ): Promise<void> {
    const reviewId = parseReviewId(pack.reviewId);
    const repositoryRealPath = await getRepositoryRealPath(repositoryRoot);
    const historyRoot = await resolveSafeDirectory(
      repositoryRealPath,
      HISTORY_DIRECTORY,
      true,
    );
    if (!historyRoot) throw new HistoryPathError('Unable to create the history directory.');

    const finalDirectory = path.join(historyRoot, reviewId);
    if (await pathExists(finalDirectory)) {
      throw Object.assign(new Error('History entry already exists.'), { code: 'EEXIST' });
    }

    const metadata = buildMetadata(pack, options);
    const temporaryDirectory = path.join(
      historyRoot,
      `.tmp-${reviewId}-${randomUUID()}`,
    );

    await fs.mkdir(temporaryDirectory, { recursive: false });
    try {
      await fs.writeFile(path.join(temporaryDirectory, 'request.md'), pack.markdown, {
        encoding: 'utf8',
        flag: 'wx',
      });
      await fs.writeFile(
        path.join(temporaryDirectory, 'metadata.json'),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      await fs.rename(temporaryDirectory, finalDirectory);
    } catch (error) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async loadRequest(repositoryRoot: string, reviewIdInput: string): Promise<string> {
    const { reviewDirectory } = await this.#resolveExistingHistoryDirectory(
      repositoryRoot,
      reviewIdInput,
    );
    const requestPath = path.join(reviewDirectory, 'request.md');
    await assertRegularFile(requestPath);
    return fs.readFile(requestPath, 'utf8');
  }

  async loadMetadata(repositoryRoot: string, reviewIdInput: string): Promise<HistoryMetadata> {
    const { reviewId, reviewDirectory } = await this.#resolveExistingHistoryDirectory(
      repositoryRoot,
      reviewIdInput,
    );
    return readMetadata(reviewDirectory, reviewId);
  }

  async saveResponse(
    repositoryRoot: string,
    reviewIdInput: string,
    responseText: string,
    overwrite: boolean,
  ): Promise<void> {
    const { reviewId, reviewDirectory } = await this.#resolveExistingHistoryDirectory(
      repositoryRoot,
      reviewIdInput,
    );
    await readMetadata(reviewDirectory, reviewId);

    const responsePath = path.join(reviewDirectory, 'response.md');
    try {
      const stat = await fs.lstat(responsePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new HistoryPathError('History response must be a regular file.');
      }
      if (!overwrite) {
        throw Object.assign(new Error('History response already exists.'), { code: 'EEXIST' });
      }
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }

    await fs.writeFile(responsePath, responseText, {
      encoding: 'utf8',
      flag: overwrite ? 'w' : 'wx',
    });
  }

  /**
   * Check whether a response.md exists for the given review.
   */
  async hasResponse(repositoryRoot: string, reviewIdInput: string): Promise<boolean> {
    try {
      const { reviewDirectory } = await this.#resolveExistingHistoryDirectory(
        repositoryRoot,
        reviewIdInput,
      );
      const responsePath = path.join(reviewDirectory, 'response.md');
      await assertRegularFile(responsePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load the raw response.md content for the given review.
   */
  async loadResponse(repositoryRoot: string, reviewIdInput: string): Promise<string> {
    const { reviewDirectory } = await this.#resolveExistingHistoryDirectory(
      repositoryRoot,
      reviewIdInput,
    );
    const responsePath = path.join(reviewDirectory, 'response.md');
    await assertRegularFile(responsePath);
    return fs.readFile(responsePath, 'utf8');
  }

  /**
   * Get the validated, realpath-resolved review directory for a given reviewId.
   *
   * This is the controlled entry point for ReportService — it receives an
   * already-validated directory path and handles report.json I/O internally.
   */
  async getReviewDirectory(
    repositoryRoot: string,
    reviewIdInput: string,
  ): Promise<string> {
    const { reviewDirectory } = await this.#resolveExistingHistoryDirectory(
      repositoryRoot,
      reviewIdInput,
    );
    return reviewDirectory;
  }

  async reexportMarkdown(
    repositoryRoot: string,
    reviewIdInput: string,
  ): Promise<string> {
    const reviewId = parseReviewId(reviewIdInput);
    const repositoryRealPath = await getRepositoryRealPath(repositoryRoot);
    const metadata = await this.loadMetadata(repositoryRealPath, reviewId);
    const request = await this.loadRequest(repositoryRealPath, reviewId);
    const exportDirectory = metadata.exportDirectory ?? EXPORTS_DIRECTORY;
    const exportRoot = await resolveSafeDirectory(
      repositoryRealPath,
      validateExportDirectory(exportDirectory),
      true,
    );
    if (!exportRoot) throw new HistoryPathError('Unable to create the export directory.');

    const reviewDirectory = await ensureSafeReviewDirectory(exportRoot, reviewId, true);
    const markdownPath = path.join(reviewDirectory, 'REVIEW_REQUEST.md');
    await fs.writeFile(markdownPath, request, { encoding: 'utf8', flag: 'wx' });

    const nextFiles = Array.from(new Set([...metadata.exportedFiles, 'REVIEW_REQUEST.md']));
    const updated: HistoryMetadata = historyMetadataSchema.parse({
      ...metadata,
      updatedAt: new Date().toISOString(),
      exportDirectory: validateExportDirectory(exportDirectory),
      exportedFiles: nextFiles,
      exportFormat: metadata.hasZip ? 'both' : 'markdown',
      hasMarkdown: true,
    });
    await replaceMetadata(repositoryRealPath, reviewId, updated);
    return markdownPath;
  }

  async delete(
    repositoryRoot: string,
    reviewIdInput: string,
  ): Promise<HistoryDeleteResult> {
    const reviewId = parseReviewId(reviewIdInput);
    const repositoryRealPath = await getRepositoryRealPath(repositoryRoot);
    const historyRoot = await resolveSafeDirectory(
      repositoryRealPath,
      HISTORY_DIRECTORY,
      false,
    );
    if (!historyRoot) return { historyDeleted: false, exportDeleted: false };

    let exportDirectory = EXPORTS_DIRECTORY;
    try {
      const metadata = await readMetadata(path.join(historyRoot, reviewId), reviewId);
      exportDirectory = metadata.exportDirectory ?? EXPORTS_DIRECTORY;
    } catch {
      // Corrupt records can still be deleted safely; only the default managed export is inferred.
    }

    const historyDeleted = await removeSafeReviewDirectory(historyRoot, reviewId);
    const exportRoot = await resolveSafeDirectory(
      repositoryRealPath,
      validateExportDirectory(exportDirectory),
      false,
    );
    const exportDeleted = exportRoot
      ? await removeSafeReviewDirectory(exportRoot, reviewId)
      : false;

    return { historyDeleted, exportDeleted };
  }

  async #resolveExistingHistoryDirectory(
    repositoryRoot: string,
    reviewIdInput: string,
  ): Promise<{ reviewId: string; reviewDirectory: string }> {
    const reviewId = parseReviewId(reviewIdInput);
    const repositoryRealPath = await getRepositoryRealPath(repositoryRoot);
    const historyRoot = await resolveSafeDirectory(
      repositoryRealPath,
      HISTORY_DIRECTORY,
      false,
    );
    if (!historyRoot) throw Object.assign(new Error('History entry not found.'), { code: 'ENOENT' });
    const reviewDirectory = await ensureSafeReviewDirectory(historyRoot, reviewId, false);
    return { reviewId, reviewDirectory };
  }

  async #loadEntry(
    repositoryRealPath: string,
    historyRoot: string,
    reviewId: string,
  ): Promise<HistoryEntry> {
    const issues: string[] = [];
    const reviewDirectory = path.join(historyRoot, reviewId);

    try {
      const stat = await fs.lstat(reviewDirectory);
      if (stat.isSymbolicLink()) {
        return corruptEntry(reviewId, ['SYMLINK_HISTORY_ENTRY']);
      }
      if (!stat.isDirectory()) {
        return corruptEntry(reviewId, ['NOT_A_DIRECTORY']);
      }
    } catch {
      return corruptEntry(reviewId, ['HISTORY_DIRECTORY_MISSING']);
    }

    let metadata: HistoryMetadata;
    try {
      metadata = await readMetadata(reviewDirectory, reviewId);
    } catch {
      return corruptEntry(reviewId, ['INVALID_METADATA']);
    }

    let requestPreview = '';
    try {
      const requestPath = path.join(reviewDirectory, 'request.md');
      await assertRegularFile(requestPath);
      requestPreview = (await fs.readFile(requestPath, 'utf8')).slice(0, 200);
    } catch {
      issues.push('REQUEST_MISSING_OR_INVALID');
    }

    let markdownPath: string | undefined;
    let zipPath: string | undefined;
    if (metadata.exportDirectory) {
      let exportRoot: string | undefined;
      try {
        exportRoot = await resolveSafeDirectory(
          repositoryRealPath,
          metadata.exportDirectory,
          false,
        );
      } catch {
        issues.push('EXPORT_DIRECTORY_INVALID');
      }

      if (exportRoot) {
        try {
          const exportReviewDirectory = await ensureSafeReviewDirectory(
            exportRoot,
            reviewId,
            false,
          );
          if (metadata.hasMarkdown) {
            const candidate = path.join(exportReviewDirectory, 'REVIEW_REQUEST.md');
            await assertRegularFile(candidate);
            markdownPath = candidate;
            const stat = await fs.stat(candidate);
            if (stat.size !== metadata.reviewPack.markdownBytes) {
              issues.push('MARKDOWN_SIZE_MISMATCH');
            }
          }
          if (metadata.hasZip) {
            const candidate = path.join(
              exportReviewDirectory,
              `reviewlume-pack-${reviewId}.zip`,
            );
            await assertRegularFile(candidate);
            zipPath = candidate;
            const stat = await fs.stat(candidate);
            if (metadata.reviewPack.zipBytes > 0 && stat.size !== metadata.reviewPack.zipBytes) {
              issues.push('ZIP_SIZE_MISMATCH');
            }
          }
        } catch {
          if (metadata.hasMarkdown && !markdownPath) issues.push('MARKDOWN_EXPORT_MISSING');
          if (metadata.hasZip && !zipPath) issues.push('ZIP_EXPORT_MISSING');
        }
      } else {
        if (metadata.hasMarkdown) issues.push('MARKDOWN_EXPORT_MISSING');
        if (metadata.hasZip) issues.push('ZIP_EXPORT_MISSING');
      }
    }

    return {
      metadata,
      requestPreview,
      markdownPath,
      zipPath,
      integrity: issues.length > 0 ? 'partial' : 'valid',
      issues,
    };
  }
}

function buildMetadata(
  pack: Parameters<HistoryService['save']>[1],
  options: HistorySaveOptions,
): HistoryMetadata {
  const hasMarkdown = options.format === 'markdown' || options.format === 'both';
  const hasZip = options.format === 'zip' || options.format === 'both';
  const exportedFiles = [
    ...(hasMarkdown ? ['REVIEW_REQUEST.md'] : []),
    ...(hasZip ? [`${pack.directoryName}.zip`] : []),
  ];
  const exportDirectory = options.exportDirectory
    ? validateExportDirectory(options.exportDirectory)
    : undefined;

  return historyMetadataSchema.parse({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    reviewId: pack.reviewId,
    workspaceId: pack.workspaceId,
    repositoryDisplayName: pack.manifest.repositoryDisplayName,
    createdAt: pack.manifest.generatedAt,
    updatedAt: pack.manifest.generatedAt,
    reviewMode: pack.manifest.reviewMode,
    exportMode: options.mode,
    exportFormat: options.format,
    exportDirectory,
    exportedFiles,
    byteLength: pack.byteLength,
    fileCount: pack.manifest.files.length,
    hasMarkdown,
    hasZip,
    selectedFiles: pack.manifest.files.map((file) => ({
      path: file.path,
      source:
        file.source === 'manual' || file.source === 'recommended'
          ? file.source
          : 'changed',
      truncated: file.truncated,
    })),
    security: {
      hardBlockCount: pack.manifest.security.hardBlocked,
      blockCount: pack.manifest.security.blocked,
      warnCount: pack.manifest.security.warnings,
      confirmedWarnCount: pack.manifest.security.confirmedWarnings,
      infoCount: pack.manifest.security.info,
    },
    reviewPack: {
      markdownBytes: pack.byteLength,
      zipBytes: pack.zip.byteLength,
      truncated: pack.manifest.truncations.length > 0,
      excludedFileCount: pack.manifest.excluded.length,
    },
    status: 'exported',
  });
}

async function readMetadata(
  reviewDirectory: string,
  expectedReviewId: string,
): Promise<HistoryMetadata> {
  const metadataPath = path.join(reviewDirectory, 'metadata.json');
  await assertRegularFile(metadataPath);
  const raw = await fs.readFile(metadataPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HistoryDataError('History metadata is not valid JSON.');
  }

  const current = historyMetadataSchema.safeParse(parsed);
  if (current.success) {
    if (current.data.reviewId !== expectedReviewId) {
      throw new HistoryDataError('History metadata reviewId does not match its directory.');
    }
    return current.data;
  }

  const legacy = legacyHistoryMetadataSchema.safeParse(parsed);
  if (!legacy.success || legacy.data.reviewId !== expectedReviewId) {
    throw new HistoryDataError('History metadata does not match a supported schema.');
  }

  const hasMarkdown = legacy.data.hasMarkdown;
  const hasZip = legacy.data.hasZip;
  return historyMetadataSchema.parse({
    ...legacy.data,
    updatedAt: legacy.data.createdAt,
    exportMode: 'automatic',
    exportDirectory: EXPORTS_DIRECTORY,
    exportedFiles: [
      ...(hasMarkdown ? ['REVIEW_REQUEST.md'] : []),
      ...(hasZip ? [`reviewlume-pack-${expectedReviewId}.zip`] : []),
    ],
    selectedFiles: [],
    reviewPack: {
      markdownBytes: legacy.data.byteLength,
      zipBytes: 0,
      truncated: false,
      excludedFileCount: 0,
    },
    status: 'exported',
  });
}

async function replaceMetadata(
  repositoryRoot: string,
  reviewIdInput: string,
  metadata: HistoryMetadata,
): Promise<void> {
  const reviewId = parseReviewId(reviewIdInput);
  const historyRoot = await resolveSafeDirectory(
    repositoryRoot,
    HISTORY_DIRECTORY,
    false,
  );
  if (!historyRoot) throw Object.assign(new Error('History entry not found.'), { code: 'ENOENT' });
  const reviewDirectory = await ensureSafeReviewDirectory(historyRoot, reviewId, false);
  const metadataPath = path.join(reviewDirectory, 'metadata.json');
  await assertRegularFile(metadataPath);
  const temporaryPath = path.join(reviewDirectory, `.metadata-${randomUUID()}.tmp`);
  await fs.writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  try {
    await fs.rename(metadataPath, `${temporaryPath}.bak`);
    try {
      await fs.rename(temporaryPath, metadataPath);
      await fs.rm(`${temporaryPath}.bak`, { force: true });
    } catch (error) {
      await fs.rename(`${temporaryPath}.bak`, metadataPath).catch(() => undefined);
      throw error;
    }
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    await fs.rm(`${temporaryPath}.bak`, { force: true }).catch(() => undefined);
  }
}

async function getRepositoryRealPath(repositoryRoot: string): Promise<string> {
  const repositoryRealPath = await fs.realpath(repositoryRoot);
  const stat = await fs.stat(repositoryRealPath);
  if (!stat.isDirectory()) throw new HistoryPathError('Repository root is not a directory.');
  return repositoryRealPath;
}

async function resolveSafeDirectory(
  repositoryRealPath: string,
  relativeDirectory: string,
  create: boolean,
): Promise<string | undefined> {
  const normalized = validateExportDirectory(relativeDirectory);
  let current = repositoryRealPath;

  for (const part of normalized.split('/')) {
    const next = path.join(current, part);
    try {
      const stat = await fs.lstat(next);
      if (stat.isSymbolicLink()) {
        throw new HistoryPathError('ReviewLume history paths cannot traverse symbolic links.');
      }
      if (!stat.isDirectory()) {
        throw new HistoryPathError('ReviewLume history path contains a non-directory component.');
      }
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      if (!create) return undefined;
      try {
        await fs.mkdir(next);
      } catch (mkdirError) {
        if (!isNodeError(mkdirError, 'EEXIST')) throw mkdirError;
        const stat = await fs.lstat(next);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new HistoryPathError('ReviewLume history path is not a safe directory.');
        }
      }
    }
    current = next;
  }

  const finalRealPath = await fs.realpath(current);
  if (!isInside(repositoryRealPath, finalRealPath)) {
    throw new HistoryPathError('ReviewLume history path escapes the active repository.');
  }
  return finalRealPath;
}

async function ensureSafeReviewDirectory(
  baseDirectory: string,
  reviewIdInput: string,
  create: boolean,
): Promise<string> {
  const reviewId = parseReviewId(reviewIdInput);
  const reviewDirectory = path.join(baseDirectory, reviewId);
  try {
    const stat = await fs.lstat(reviewDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new HistoryPathError('Review history entry is not a safe directory.');
    }
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
    if (!create) throw error;
    await fs.mkdir(reviewDirectory, { recursive: false });
  }

  const realPath = await fs.realpath(reviewDirectory);
  if (!isInside(baseDirectory, realPath)) {
    throw new HistoryPathError('Review history entry escapes its managed directory.');
  }
  return realPath;
}

async function removeSafeReviewDirectory(
  baseDirectory: string,
  reviewIdInput: string,
): Promise<boolean> {
  const reviewId = parseReviewId(reviewIdInput);
  const reviewDirectory = path.join(baseDirectory, reviewId);
  let stat;
  try {
    stat = await fs.lstat(reviewDirectory);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false;
    throw error;
  }

  if (stat.isSymbolicLink()) {
    await fs.unlink(reviewDirectory);
    return true;
  }
  if (!stat.isDirectory()) {
    throw new HistoryPathError('Managed review entry is not a directory.');
  }

  const realPath = await fs.realpath(reviewDirectory);
  if (!isInside(baseDirectory, realPath)) {
    throw new HistoryPathError('Managed review entry escapes its directory.');
  }
  await fs.rm(reviewDirectory, { recursive: true, force: false });
  return true;
}

async function assertRegularFile(filePath: string): Promise<void> {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new HistoryPathError('History content must be a regular file.');
  }
}

function parseReviewId(value: string): string {
  const result = reviewIdSchema.safeParse(value);
  if (!result.success) throw new HistoryPathError('reviewId does not match schema v1.');
  return result.data;
}

function corruptEntry(reviewId: string, issues: readonly string[]): HistoryEntry {
  const timestamp = /^([0-9]{8}T[0-9]{6}Z)-/.exec(reviewId)?.[1] ?? '19700101T000000Z';
  const createdAt = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.000Z`;
  return {
    metadata: historyMetadataSchema.parse({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      reviewId,
      workspaceId: '0000000000000000',
      repositoryDisplayName: 'Corrupt history entry',
      createdAt,
      updatedAt: createdAt,
      reviewMode: 'unknown',
      exportMode: 'automatic',
      exportFormat: 'markdown',
      exportDirectory: EXPORTS_DIRECTORY,
      exportedFiles: [],
      byteLength: 0,
      fileCount: 0,
      hasMarkdown: false,
      hasZip: false,
      selectedFiles: [],
      security: {
        hardBlockCount: 0,
        blockCount: 0,
        warnCount: 0,
        confirmedWarnCount: 0,
        infoCount: 0,
      },
      reviewPack: {
        markdownBytes: 0,
        zipBytes: 0,
        truncated: false,
        excludedFileCount: 0,
      },
      status: 'exported',
    }),
    requestPreview: '',
    integrity: 'corrupt',
    issues,
  };
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false;
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === code
  );
}
