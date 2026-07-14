/**
 * @reviewlume/report-parser
 *
 * P8A: Structured review report parser for AI review responses.
 *
 * Provides:
 * - Data model types for ReviewReport, ReviewIssue, etc.
 * - Stable issue ID generation
 * - Status state machine validation
 * - Conservative AI response parser (JSON, Markdown, tables, lists)
 *
 * All parsing functions are pure — no file system, no VS Code API, no network.
 */

// Data model
export {
  REPORT_SCHEMA_VERSION,
  MAX_ISSUES,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_EVIDENCE_LENGTH,
  MAX_SUGGESTION_LENGTH,
  MAX_FILE_PATH_LENGTH,
  MAX_WARNING_LENGTH,
  PARSE_STATUSES,
  ISSUE_STATUSES,
  ISSUE_SEVERITIES,
  STATUS_TRANSITIONS,
  type ParseStatus,
  type ReviewIssueStatus,
  type ReviewIssueSeverity,
  type ReviewIssue,
  type ReviewReport,
  type ReportReadStatus,
  type ReportReadResult,
  type ParseContext,
} from './types.js';

// Issue ID generation
export {
  normalizePathForId,
  normalizeTextForId,
  computeFingerprint,
  generateIssueIds,
  type IssueIdInput,
} from './issueId.js';

// State machine
export {
  isValidStatus,
  canTransition,
  validateTransition,
  defaultStatus,
  allowedTransitions,
} from './stateMachine.js';

// Parser
export {
  parseReviewResponse,
  type ParseResult,
} from './compatibility.js';
