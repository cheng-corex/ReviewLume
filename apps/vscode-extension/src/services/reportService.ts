/**
 * P8A ReportService: Manages `report.json` lifecycle.
 *
 * Handles:
 * - Creating report.json from parsed AI responses
 * - Reading report.json with hash validation
 * - Re-parsing existing response.md
 * - Atomic writes with temp files
 *
 * Path safety (realpath, symlink checks, repository boundaries) is
 * handled by HistoryService before this service touches any files.
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { type Stats } from 'node:fs';
import * as path from 'node:path';
import {
  parseReviewResponse,
  REPORT_SCHEMA_VERSION,
  validateTransition,
  type ParseContext,
  type ReviewIssue,
  type ReviewIssueStatus,
  type ReviewReport,
  type ReportReadResult,
} from '@reviewlume/report-parser';
import { logInfo } from './logService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum size of a report.json file (prevents disk abuse). */
const MAX_REPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Expected report file name. */
const REPORT_FILENAME = 'report.json';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ReportServiceError extends Error {
  readonly code = 'REPORT_SERVICE_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ReportServiceError';
  }
}

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// ReportService
// ---------------------------------------------------------------------------

export class ReportService {
  /**
   * Parse a response and create `report.json` in the review directory.
   *
   * @param reviewDirectory - Already-validated review directory path (from HistoryService).
   * @param reviewId - The review ID matching the directory.
   * @param responseText - The raw AI response text.
   * @returns The created report.
   */
  async createReport(
    reviewDirectory: string,
    reviewId: string,
    responseText: string,
  ): Promise<ReviewReport> {
    await this.#assertSafeDirectory(reviewDirectory);

    const responseHash = sha256(responseText);
    const context: ParseContext = { reviewId };

    const parseResult = parseReviewResponse(responseText, context);
    const report: ReviewReport = {
      ...parseResult.report,
      sourceResponseHash: responseHash,
    };

    await this.#atomicWriteReport(reviewDirectory, report);
    logInfo(`Report created for review ${reviewId} (${parseResult.issueCount} issues, status=${report.parseStatus})`);

    return report;
  }

  /**
   * Read `report.json` from the review directory.
   *
   * Validates:
   * - File exists and is a regular file
   * - Valid JSON
   * - Schema version supported
   * - reviewId matches
   * - response hash matches (if response.md exists)
   *
   * @param reviewDirectory - Already-validated review directory path.
   * @param reviewId - Expected review ID.
   * @param responseText - Optional current response.md content for hash validation.
   */
  async readReport(
    reviewDirectory: string,
    reviewId: string,
    responseText?: string,
  ): Promise<ReportReadResult> {
    await this.#assertSafeDirectory(reviewDirectory);

    const reportPath = path.join(reviewDirectory, REPORT_FILENAME);

    // Check if file exists
    try {
      const stat = await fs.lstat(reportPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        return { status: 'corrupt', error: 'report.json is not a regular file.' };
      }
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        return { status: 'missing' };
      }
      throw error;
    }

    // Check file size
    let stat: Stats;
    try {
      stat = await fs.stat(reportPath);
    } catch {
      return { status: 'corrupt', error: 'Cannot stat report.json.' };
    }
    if (stat.size > MAX_REPORT_FILE_BYTES) {
      return { status: 'corrupt', error: 'report.json exceeds maximum size.' };
    }

    // Read and parse
    let raw: string;
    try {
      raw = await fs.readFile(reportPath, 'utf8');
    } catch {
      return { status: 'corrupt', error: 'Cannot read report.json.' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'corrupt', error: 'report.json is not valid JSON.' };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { status: 'corrupt', error: 'report.json root must be an object.' };
    }

    const obj = parsed as Record<string, unknown>;

    // Validate schema version
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion !== REPORT_SCHEMA_VERSION) {
      return { status: 'unsupported-version', error: `Unsupported schema version: ${String(obj.schemaVersion)}` };
    }

    // Validate reviewId
    if (typeof obj.reviewId !== 'string' || obj.reviewId !== reviewId) {
      return { status: 'id-mismatch', error: 'report.json reviewId does not match directory.' };
    }

    // Check hash if responseText provided
    if (responseText !== undefined) {
      const expectedHash = sha256(responseText);
      if (
        typeof obj.sourceResponseHash === 'string' &&
        obj.sourceResponseHash !== expectedHash
      ) {
        return {
          status: 'stale-hash',
          error: 'report.json hash does not match current response.md.',
          report: obj as unknown as ReviewReport, // still return the report so caller can inspect
        };
      }
    }

    // Basic structural validation
    if (!Array.isArray(obj.issues)) {
      return { status: 'corrupt', error: 'report.json issues is not an array.' };
    }

    return { status: 'valid', report: obj as unknown as ReviewReport };
  }

  /**
   * Re-parse an existing `response.md` and atomically replace `report.json`.
   *
   * @returns The new report.
   */
  async reparseReport(
    reviewDirectory: string,
    reviewId: string,
    responseText: string,
  ): Promise<ReviewReport> {
    // This is essentially the same as createReport but with explicit "reparse" semantics.
    // The caller (HistoryService) handles the overwrite decision.
    return this.createReport(reviewDirectory, reviewId, responseText);
  }

  /**
   * Validate and apply a status transition for a single issue.
   *
   * @param report - The current report.
   * @param issueId - The issue to update.
   * @param newStatus - The target status.
   * @returns A new report with the updated issue status.
   * @throws If the issue doesn't exist or the transition is invalid.
   */
  transitionIssueStatus(
    report: ReviewReport,
    issueId: string,
    newStatus: ReviewIssueStatus,
  ): ReviewReport {
    const issueIndex = report.issues.findIndex((i) => i.issueId === issueId);
    if (issueIndex === -1) {
      throw new ReportServiceError(`Issue not found: ${issueId}`);
    }

    const currentIssue = report.issues[issueIndex];
    validateTransition(currentIssue.status, newStatus);

    const updatedIssue: ReviewIssue = {
      ...currentIssue,
      status: newStatus,
    };

    const updatedIssues = [...report.issues];
    updatedIssues[issueIndex] = updatedIssue;

    return {
      ...report,
      issues: updatedIssues,
    };
  }

  /**
   * Atomically write a report to the review directory.
   */
  async updateReport(
    reviewDirectory: string,
    report: ReviewReport,
  ): Promise<void> {
    await this.#assertSafeDirectory(reviewDirectory);
    await this.#atomicWriteReport(reviewDirectory, report);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  async #assertSafeDirectory(reviewDirectory: string): Promise<void> {
    try {
      const stat = await fs.lstat(reviewDirectory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new ReportServiceError('Review directory is not a safe directory.');
      }
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        throw new ReportServiceError('Review directory does not exist.');
      }
      throw error;
    }
  }

  async #atomicWriteReport(
    reviewDirectory: string,
    report: ReviewReport,
  ): Promise<void> {
    const reportPath = path.join(reviewDirectory, REPORT_FILENAME);
    const tempPath = path.join(
      reviewDirectory,
      `.report-${randomUUID()}.tmp`,
    );

    const json = `${JSON.stringify(report, null, 2)}\n`;

    // Write to temp file
    await fs.writeFile(tempPath, json, { encoding: 'utf8', flag: 'wx' });

    try {
      // If existing report exists, back it up
      let hasBackup = false;
      try {
        await fs.rename(reportPath, `${tempPath}.bak`);
        hasBackup = true;
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        // No existing file — that's fine, proceed
      }

      try {
        // Atomically replace the target
        await fs.rename(tempPath, reportPath);
        // Clean up backup
        if (hasBackup) {
          await fs.rm(`${tempPath}.bak`, { force: true });
        }
      } catch (error) {
        // Restore backup if rename failed
        if (hasBackup) {
          await fs.rename(`${tempPath}.bak`, reportPath).catch(() => undefined);
        }
        throw error;
      }
    } finally {
      // Always clean up temp files
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      await fs.rm(`${tempPath}.bak`, { force: true }).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === code
  );
}
