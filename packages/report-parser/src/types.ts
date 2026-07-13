/**
 * P8A Data Model: Structured review report and issue types.
 *
 * These types define the schema for `report.json` stored alongside
 * `response.md` in the history directory.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REPORT_SCHEMA_VERSION = 1 as const;

/** Maximum issues allowed in a single report. */
export const MAX_ISSUES = 500;

/** Maximum length for individual text fields in an issue. */
export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_EVIDENCE_LENGTH = 5000;
export const MAX_SUGGESTION_LENGTH = 5000;
export const MAX_FILE_PATH_LENGTH = 4096;

/** Maximum length for a warning string. */
export const MAX_WARNING_LENGTH = 500;

/** Allowed parse statuses. */
export const PARSE_STATUSES = ['parsed', 'partial', 'unstructured'] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Issue Types
// ---------------------------------------------------------------------------

export const ISSUE_STATUSES = ['open', 'fixed', 'rejected', 'needs-review'] as const;
export type ReviewIssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'unknown',
] as const;
export type ReviewIssueSeverity = (typeof ISSUE_SEVERITIES)[number];

/**
 * Allowed status transitions.
 * Each key maps to the set of statuses it can transition to.
 */
export const STATUS_TRANSITIONS: Readonly<
  Record<ReviewIssueStatus, readonly ReviewIssueStatus[]>
> = {
  open: ['fixed', 'rejected', 'needs-review'],
  fixed: ['open', 'needs-review'],
  rejected: ['open', 'needs-review'],
  'needs-review': ['open', 'fixed', 'rejected'],
};

/**
 * A single structured review issue.
 */
export interface ReviewIssue {
  /** Stable unique ID within the review (ISSUE-xxxxxxxxxxxx). */
  readonly issueId: string;
  /** 1-based ordinal position in the parsed result. */
  readonly ordinal: number;
  /** Short title of the issue. */
  readonly title: string;
  /** Detailed description. */
  readonly description: string;
  /** Severity level. */
  readonly severity: ReviewIssueSeverity;
  /** Current status (always 'open' on first parse). */
  readonly status: ReviewIssueStatus;
  /** Repository-relative file path (if identified). */
  readonly filePath?: string;
  /** 1-based start line (if identified). */
  readonly lineStart?: number;
  /** 1-based end line (if identified). */
  readonly lineEnd?: number;
  /** Evidence / code snippet. */
  readonly evidence?: string;
  /** Suggested fix. */
  readonly suggestion?: string;
  /** Deterministic fingerprint for ID stability. */
  readonly sourceFingerprint: string;
}

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

/**
 * The structured review report stored in `report.json`.
 */
export interface ReviewReport {
  /** Schema version for forward compatibility. */
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
  /** Must match the directory-bound reviewId. */
  readonly reviewId: string;
  /** SHA-256 of the source `response.md` content. */
  readonly sourceResponseHash: string;
  /** ISO 8601 UTC timestamp of when parsing occurred. */
  readonly parsedAt: string;
  /** Parser version identifier. */
  readonly parserVersion: string;
  /** Parse result status. */
  readonly parseStatus: ParseStatus;
  /** Parsed issues. */
  readonly issues: readonly ReviewIssue[];
  /** Non-secret, non-PII warnings about the parse process. */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Service Result Types
// ---------------------------------------------------------------------------

/** Possible states when reading a report. */
export type ReportReadStatus =
  | 'valid'
  | 'missing'
  | 'corrupt'
  | 'stale-hash'
  | 'unsupported-version'
  | 'id-mismatch';

/** Result of reading a report from disk. */
export interface ReportReadResult {
  readonly status: ReportReadStatus;
  readonly report?: ReviewReport;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Parser Context
// ---------------------------------------------------------------------------

/**
 * Context provided to the parser by the caller.
 * The parser itself does NOT access the file system or VS Code APIs.
 */
export interface ParseContext {
  /** The reviewId this response belongs to. */
  readonly reviewId: string;
}
