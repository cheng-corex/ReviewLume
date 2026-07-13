import { z } from 'zod';
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVIDENCE_LENGTH,
  MAX_FILE_PATH_LENGTH,
  MAX_ISSUES,
  MAX_SUGGESTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_WARNING_LENGTH,
  PARSE_STATUSES,
  REPORT_SCHEMA_VERSION,
  type ReviewReport,
} from '@reviewlume/report-parser';

const REVIEW_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
const ISSUE_ID_PATTERN = /^ISSUE-[0-9a-f]{16}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const isoTimestampSchema = z
  .string()
  .max(64)
  .refine((value) => Number.isFinite(Date.parse(value)), 'Invalid ISO timestamp.');

const repositoryRelativePathSchema = z
  .string()
  .min(1)
  .max(MAX_FILE_PATH_LENGTH)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !/[\0\r\n\\]/.test(value) &&
      !value.split('/').some((part) => !part || part === '.' || part === '..'),
    'Issue file paths must be repository-relative.',
  );

const optionalPositiveLineSchema = z.number().int().positive().optional();

const reviewIssueSchema = z
  .object({
    issueId: z.string().regex(ISSUE_ID_PATTERN),
    ordinal: z.number().int().positive().max(MAX_ISSUES),
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH),
    severity: z.enum(ISSUE_SEVERITIES),
    status: z.enum(ISSUE_STATUSES),
    filePath: repositoryRelativePathSchema.optional(),
    lineStart: optionalPositiveLineSchema,
    lineEnd: optionalPositiveLineSchema,
    evidence: z.string().max(MAX_EVIDENCE_LENGTH).optional(),
    suggestion: z.string().max(MAX_SUGGESTION_LENGTH).optional(),
    sourceFingerprint: z.string().regex(SHA256_PATTERN),
  })
  .strict()
  .superRefine((issue, context) => {
    if (
      issue.lineStart !== undefined &&
      issue.lineEnd !== undefined &&
      issue.lineEnd < issue.lineStart
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineEnd'],
        message: 'lineEnd must be greater than or equal to lineStart.',
      });
    }
  });

export const reviewReportSchema = z
  .object({
    schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
    reviewId: z.string().max(64).regex(REVIEW_ID_PATTERN),
    sourceResponseHash: z.string().regex(SHA256_PATTERN),
    parsedAt: isoTimestampSchema,
    parserVersion: z.string().min(1).max(64).refine((value) => !/[\0\r\n]/.test(value)),
    parseStatus: z.enum(PARSE_STATUSES),
    issues: z.array(reviewIssueSchema).max(MAX_ISSUES),
    warnings: z.array(z.string().max(MAX_WARNING_LENGTH)).max(100),
  })
  .strict()
  .superRefine((report, context) => {
    const ids = new Set<string>();
    for (const [index, issue] of report.issues.entries()) {
      if (ids.has(issue.issueId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['issues', index, 'issueId'],
          message: 'Issue IDs must be unique within a report.',
        });
      }
      ids.add(issue.issueId);
    }
  });

export function parseStoredReviewReport(value: unknown): ReviewReport {
  return reviewReportSchema.parse(value) as ReviewReport;
}
