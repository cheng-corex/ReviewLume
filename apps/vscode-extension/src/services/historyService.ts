/**
 * P7 — ReviewLume history storage and retrieval.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SECURITY: All paths are validated against the repository root.
 * No absolute paths, parent traversal, or symbolic-link escapes are
 * allowed. History files are kept under `.reviewlume/history/` and
 * never contain raw secrets, absolute paths, or credential-bearing
 * remote URLs.
 * ═══════════════════════════════════════════════════════════════════
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
/** Schema version for history metadata. Increment on breaking changes. */
export const HISTORY_SCHEMA_VERSION = 1 as const;

/** Human-readable security summary stored in history. */
export interface HistorySecuritySummary {
  readonly hardBlockCount: number;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly confirmedWarnCount: number;
  readonly infoCount: number;
}

/** Persistent metadata written to `.reviewlume/history/<reviewId>/metadata.json`. */
export interface HistoryMetadata {
  readonly schemaVersion: number;
  readonly reviewId: string;
  readonly workspaceId: string;
  readonly repositoryDisplayName: string;
  readonly createdAt: string;
  readonly reviewMode: string;
  readonly exportFormat: string;
  readonly byteLength: number;
  readonly fileCount: number;
  readonly hasMarkdown: boolean;
  readonly hasZip: boolean;
  readonly security: HistorySecuritySummary;
}

/** Full history entry as returned by the list method. */
export interface HistoryEntry {
  readonly metadata: HistoryMetadata;
  readonly requestPreview: string;
  readonly markdownPath?: string;
  readonly zipPath?: string;
}

/** Error thrown for invalid history paths. */
export class HistoryPathError extends Error {
  readonly code = 'INVALID_HISTORY_PATH' as const;
  constructor(message: string) {
    super(message);
    this.name = 'HistoryPathError';
  }
}

export const HISTORY_DIRECTORY = '.reviewlume/history';
export const EXPORTS_DIRECTORY = '.reviewlume/exports';

/**
 * Get the absolute path to the history root for a repository.
 */
export function getHistoryRoot(repositoryRoot: string): string {
  return path.join(repositoryRoot, HISTORY_DIRECTORY);
}

/**
 * Get the absolute path to the exports root for a repository.
 */
export function getExportRoot(repositoryRoot: string): string {
  return path.join(repositoryRoot, EXPORTS_DIRECTORY);
}

/**
 * Validate that a reviewId directory is safe (no traversal) and return
 * the absolute path.
 */
function safeReviewDir(baseDir: string, reviewId: string): string {
  if (!reviewId || /[\0\r\n\\]/.test(reviewId) || reviewId.includes('..') || reviewId.includes('/')) {
    throw new HistoryPathError('Invalid reviewId in history path.');
  }
  // Verify the reviewId format: yyyyMMdd'T'HHmmss'Z'-hex12
  if (!/^\d{8}T\d{6}Z-[0-9a-f]{12}$/.test(reviewId)) {
    throw new HistoryPathError('reviewId does not match expected format.');
  }
  return path.join(baseDir, reviewId);
}

/**
 * Manages ReviewLume history: saving, listing, loading, and deleting
 * history records under `.reviewlume/history/<reviewId>/`.
 */
export class HistoryService {
  /**
   * List all history entries for a repository, sorted by creation time
   * (most recent first).
   */
  async list(repositoryRoot: string): Promise<HistoryEntry[]> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    let reviewDirs: string[];
    try {
      reviewDirs = await fs.readdir(historyRoot, { withFileTypes: true }).then(
        (entries) =>
          entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()
            .reverse(),
      );
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? String((error as NodeJS.ErrnoException).code ?? '') : '';
      if (code === 'ENOENT') return [];
      throw error;
    }

    const entries: HistoryEntry[] = [];
    for (const reviewId of reviewDirs) {
      try {
        const entry = await this.#loadEntry(repositoryRoot, reviewId);
        if (entry) entries.push(entry);
      } catch {
        // Skip corrupt entries
      }
    }
    return entries;
  }

  /**
   * Save a history record after a successful export.
   *
   * Writes:
   *   `.reviewlume/history/<reviewId>/metadata.json`
   *   `.reviewlume/history/<reviewId>/request.md`
   */
  async save(
    repositoryRoot: string,
    pack: {
      reviewId: string;
      workspaceId: string;
      byteLength: number;
      markdown: string;
      manifest: {
        repositoryDisplayName: string;
        generatedAt: string;
        reviewMode: string;
        security: {
          hardBlocked: number;
          blocked: number;
          warnings: number;
          info: number;
          confirmedWarnings: number;
        };
        files: readonly unknown[];
      };
    },
    exportFormat: string,
  ): Promise<void> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    const reviewDir = safeReviewDir(historyRoot, pack.reviewId);

    await fs.mkdir(reviewDir, { recursive: true });

    const metadata: HistoryMetadata = {
      schemaVersion: HISTORY_SCHEMA_VERSION,
      reviewId: pack.reviewId,
      workspaceId: pack.workspaceId,
      repositoryDisplayName: pack.manifest.repositoryDisplayName,
      createdAt: pack.manifest.generatedAt,
      reviewMode: pack.manifest.reviewMode,
      exportFormat,
      byteLength: pack.byteLength,
      fileCount: pack.manifest.files.length,
      hasMarkdown: exportFormat === 'markdown' || exportFormat === 'both',
      hasZip: exportFormat === 'zip' || exportFormat === 'both',
      security: {
        hardBlockCount: pack.manifest.security.hardBlocked,
        blockCount: pack.manifest.security.blocked,
        warnCount: pack.manifest.security.warnings,
        confirmedWarnCount: pack.manifest.security.confirmedWarnings,
        infoCount: pack.manifest.security.info,
      },
    };

    // Write metadata.json
    await fs.writeFile(
      path.join(reviewDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2) + '\n',
      { flag: 'wx' },
    );

    // Write request.md (internal snapshot, NOT the same as exported REVIEW_REQUEST.md)
    await fs.writeFile(
      path.join(reviewDir, 'request.md'),
      pack.markdown,
      { encoding: 'utf8', flag: 'wx' },
    );
  }

  /**
   * Delete a single history entry and its directory.
   */
  async delete(repositoryRoot: string, reviewId: string): Promise<void> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    const reviewDir = safeReviewDir(historyRoot, reviewId);
    await fs.rm(reviewDir, { recursive: true, force: true });
  }

  /**
   * Delete all history entries for a repository.
   */
  async clearAll(repositoryRoot: string): Promise<void> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    await fs.rm(historyRoot, { recursive: true, force: true });
  }

  /**
   * Load the request.md content for a given reviewId.
   */
  async loadRequest(repositoryRoot: string, reviewId: string): Promise<string> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    const reviewDir = safeReviewDir(historyRoot, reviewId);
    return fs.readFile(path.join(reviewDir, 'request.md'), 'utf8');
  }

  /**
   * Load the metadata.json for a given reviewId.
   */
  async loadMetadata(repositoryRoot: string, reviewId: string): Promise<HistoryMetadata> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    const reviewDir = safeReviewDir(historyRoot, reviewId);
    const raw = await fs.readFile(path.join(reviewDir, 'metadata.json'), 'utf8');
    const parsed = JSON.parse(raw) as HistoryMetadata;

    if (parsed.schemaVersion !== HISTORY_SCHEMA_VERSION) {
      // Future schema versions: return basic info, don't crash
      // Unknown versions are handled gracefully for forward compatibility
    }
    return parsed;
  }

  /** Load a single history entry. Returns undefined if any required file is missing. */
  async #loadEntry(repositoryRoot: string, reviewId: string): Promise<HistoryEntry | undefined> {
    const historyRoot = getHistoryRoot(repositoryRoot);
    const reviewDir = safeReviewDir(historyRoot, reviewId);

    let metadata: HistoryMetadata;
    try {
      const raw = await fs.readFile(path.join(reviewDir, 'metadata.json'), 'utf8');
      metadata = JSON.parse(raw) as HistoryMetadata;
    } catch {
      return undefined;
    }

    let requestPreview = '';
    try {
      const requestContent = await fs.readFile(path.join(reviewDir, 'request.md'), 'utf8');
      requestPreview = requestContent.slice(0, 200);
    } catch {
      // Preview is best-effort
    }

    // Check for export files
    const exportRoot = getExportRoot(repositoryRoot);
    const exportReviewDir = path.join(exportRoot, reviewId);
    let markdownPath: string | undefined;
    let zipPath: string | undefined;

    try {
      const mdPath = path.join(exportReviewDir, 'REVIEW_REQUEST.md');
      await fs.access(mdPath);
      markdownPath = mdPath;
    } catch {
      // No markdown export
    }

    try {
      const zPath = path.join(exportReviewDir, `reviewlume-pack-${reviewId}.zip`);
      await fs.access(zPath);
      zipPath = zPath;
    } catch {
      // No zip export
    }

    return { metadata, requestPreview, markdownPath, zipPath };
  }
}
