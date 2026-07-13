/** P8A report.json lifecycle and integrity checks. */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  parseReviewResponse,
  validateTransition,
  type ParseContext,
  type ReviewIssue,
  type ReviewIssueStatus,
  type ReviewReport,
  type ReportReadResult,
} from '@reviewlume/report-parser';
import { logInfo } from './logService';
import { parseStoredReviewReport } from './reportSchema';

const MAX_REPORT_FILE_BYTES = 10 * 1024 * 1024;
const REPORT_FILENAME = 'report.json';

export class ReportServiceError extends Error {
  readonly code = 'REPORT_SERVICE_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ReportServiceError';
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export class ReportService {
  static readonly #writeQueues = new Map<string, Promise<void>>();

  async createReport(
    reviewDirectory: string,
    reviewId: string,
    responseText: string,
  ): Promise<ReviewReport> {
    await this.#assertSafeDirectory(reviewDirectory, reviewId);

    const context: ParseContext = { reviewId };
    const parseResult = parseReviewResponse(responseText, context);
    const report = parseStoredReviewReport({
      ...parseResult.report,
      sourceResponseHash: sha256(responseText),
    });

    await this.#queueWrite(reviewDirectory, report);
    logInfo(
      `Report created for review ${reviewId} (${parseResult.issueCount} issues, status=${report.parseStatus})`,
    );
    return report;
  }

  async readReport(
    reviewDirectory: string,
    reviewId: string,
    responseText?: string,
  ): Promise<ReportReadResult> {
    await this.#assertSafeDirectory(reviewDirectory, reviewId);
    const reportPath = path.join(reviewDirectory, REPORT_FILENAME);

    let stat;
    try {
      stat = await fs.lstat(reportPath);
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return { status: 'missing' };
      return { status: 'corrupt', error: 'Cannot inspect report.json.' };
    }

    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { status: 'corrupt', error: 'report.json is not a regular file.' };
    }
    if (stat.size > MAX_REPORT_FILE_BYTES) {
      return { status: 'corrupt', error: 'report.json exceeds maximum size.' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    } catch {
      return { status: 'corrupt', error: 'report.json is not valid readable JSON.' };
    }

    if (isRecord(parsed) && parsed.schemaVersion !== 1) {
      return {
        status: 'unsupported-version',
        error: `Unsupported schema version: ${String(parsed.schemaVersion)}`,
      };
    }
    if (isRecord(parsed) && parsed.reviewId !== reviewId) {
      return { status: 'id-mismatch', error: 'report.json reviewId does not match directory.' };
    }

    let report: ReviewReport;
    try {
      report = parseStoredReviewReport(parsed);
    } catch {
      return { status: 'corrupt', error: 'report.json failed strict schema validation.' };
    }

    if (responseText !== undefined && report.sourceResponseHash !== sha256(responseText)) {
      return {
        status: 'stale-hash',
        error: 'report.json hash does not match current response.md.',
        report,
      };
    }

    return { status: 'valid', report };
  }

  async reparseReport(
    reviewDirectory: string,
    reviewId: string,
    responseText: string,
  ): Promise<ReviewReport> {
    return this.createReport(reviewDirectory, reviewId, responseText);
  }

  transitionIssueStatus(
    report: ReviewReport,
    issueId: string,
    newStatus: ReviewIssueStatus,
  ): ReviewReport {
    const issueIndex = report.issues.findIndex((issue) => issue.issueId === issueId);
    if (issueIndex === -1) {
      throw new ReportServiceError(`Issue not found: ${issueId}`);
    }

    const currentIssue = report.issues[issueIndex];
    validateTransition(currentIssue.status, newStatus);
    const updatedIssue: ReviewIssue = { ...currentIssue, status: newStatus };
    const updatedIssues = [...report.issues];
    updatedIssues[issueIndex] = updatedIssue;

    return parseStoredReviewReport({ ...report, issues: updatedIssues });
  }

  async updateReport(reviewDirectory: string, report: ReviewReport): Promise<void> {
    await this.#assertSafeDirectory(reviewDirectory, report.reviewId);
    const validated = parseStoredReviewReport(report);
    await this.#queueWrite(reviewDirectory, validated);
  }

  async #assertSafeDirectory(reviewDirectory: string, reviewId: string): Promise<void> {
    if (path.basename(reviewDirectory) !== reviewId) {
      throw new ReportServiceError('Review directory does not match reviewId.');
    }
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

  async #queueWrite(reviewDirectory: string, report: ReviewReport): Promise<void> {
    const key = path.resolve(reviewDirectory);
    const previous = ReportService.#writeQueues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.#atomicWriteReport(reviewDirectory, report));
    ReportService.#writeQueues.set(key, next);
    try {
      await next;
    } finally {
      if (ReportService.#writeQueues.get(key) === next) {
        ReportService.#writeQueues.delete(key);
      }
    }
  }

  async #atomicWriteReport(reviewDirectory: string, report: ReviewReport): Promise<void> {
    const reportPath = path.join(reviewDirectory, REPORT_FILENAME);
    const tempPath = path.join(reviewDirectory, `.report-${randomUUID()}.tmp`);
    const backupPath = `${tempPath}.bak`;
    const json = `${JSON.stringify(report, null, 2)}\n`;

    if (Buffer.byteLength(json, 'utf8') > MAX_REPORT_FILE_BYTES) {
      throw new ReportServiceError('Serialized report exceeds maximum size.');
    }

    await fs.writeFile(tempPath, json, { encoding: 'utf8', flag: 'wx' });
    let hasBackup = false;
    let restoreFailed = false;

    try {
      try {
        const targetStat = await fs.lstat(reportPath);
        if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
          throw new ReportServiceError('Existing report.json is not a regular file.');
        }
        await fs.rename(reportPath, backupPath);
        hasBackup = true;
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
      }

      try {
        await fs.rename(tempPath, reportPath);
      } catch (error) {
        if (hasBackup) {
          try {
            await fs.rename(backupPath, reportPath);
            hasBackup = false;
          } catch {
            restoreFailed = true;
          }
        }
        throw error;
      }

      if (hasBackup) {
        await fs.rm(backupPath, { force: true });
        hasBackup = false;
      }
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      if (hasBackup && !restoreFailed) {
        await fs.rm(backupPath, { force: true }).catch(() => undefined);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === code
  );
}
