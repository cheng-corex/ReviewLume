/**
 * P8A Report Parser: Conservative AI response parser.
 *
 * Pure functions — no file system, no VS Code API, no network.
 * Parses AI review responses into structured issue lists.
 */

import { generateIssueIds, type IssueIdInput } from './issueId.js';
import {
  defaultStatus,
} from './stateMachine.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_EVIDENCE_LENGTH,
  MAX_FILE_PATH_LENGTH,
  MAX_ISSUES,
  MAX_SUGGESTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_WARNING_LENGTH,
  REPORT_SCHEMA_VERSION,
  type ParseContext,
  type ParseStatus,
  type ReviewIssue,
  type ReviewIssueSeverity,
  type ReviewReport,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARSER_VERSION = '1.0.0';

/** Maximum response size to parse (5 MB). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Maximum size of a single JSON code block to parse. */
const MAX_JSON_BLOCK_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

const SEVERITY_ALIASES: Record<string, ReviewIssueSeverity> = {
  critical: 'critical',
  crit: 'critical',
  high: 'high',
  medium: 'medium',
  med: 'medium',
  low: 'low',
  info: 'info',
  informational: 'info',
  note: 'info',
  suggestion: 'info',
  unknown: 'unknown',
};

function mapSeverity(raw: string): ReviewIssueSeverity {
  const key = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  return SEVERITY_ALIASES[key] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a file path to repository-relative format.
 * Returns undefined if the path is absolute or invalid.
 */
function normalizeFilePath(raw: string): string | undefined {
  let normalized = raw.trim();

  // Reject empty
  if (!normalized) return undefined;

  // Reject absolute paths
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    return undefined;
  }

  // Normalize backslashes to forward slashes
  normalized = normalized.replace(/\\/g, '/');

  // Remove leading ./
  normalized = normalized.replace(/^\.\//, '');

  // Reject path traversal
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..' || p === '.' || !p)) {
    return undefined;
  }

  if (normalized.length > MAX_FILE_PATH_LENGTH) {
    return undefined;
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

function sanitizeText(raw: string, maxLength: number): string {
  return raw.replace(/[\0\r]/g, '').trim().slice(0, maxLength);
}

function sanitizeLineNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// JSON Parser
// ---------------------------------------------------------------------------

interface JsonIssueCandidate {
  title?: unknown;
  description?: unknown;
  severity?: unknown;
  filePath?: unknown;
  lineStart?: unknown;
  lineEnd?: unknown;
  evidence?: unknown;
  suggestion?: unknown;
  status?: unknown;
  issueId?: unknown;
  file?: unknown;
  line?: unknown;
  path?: unknown;
}

function parseJsonBlock(jsonText: string, _context: ParseContext): {
  issues: ReviewIssue[];
  warnings: string[];
} {
  const issues: ReviewIssue[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    warnings.push('JSON block contains invalid JSON.');
    return { issues, warnings };
  }

  // Handle top-level array of issues
  let candidates: JsonIssueCandidate[] = [];
  if (Array.isArray(parsed)) {
    candidates = parsed.filter(
      (item): item is JsonIssueCandidate =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    );
  } else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    // Handle { "issues": [...] } wrapper
    if (Array.isArray(obj.issues)) {
      candidates = (obj.issues as unknown[]).filter(
        (item): item is JsonIssueCandidate =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    } else if (Array.isArray(obj.findings)) {
      candidates = (obj.findings as unknown[]).filter(
        (item): item is JsonIssueCandidate =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
    } else {
      // Single object — treat as one issue if it has a title
      if (typeof obj.title === 'string' || typeof obj.description === 'string') {
        candidates = [obj as JsonIssueCandidate];
      }
    }
  }

  for (const candidate of candidates) {
    if (issues.length >= MAX_ISSUES) {
      warnings.push(`Reached maximum of ${MAX_ISSUES} issues; remaining items ignored.`);
      break;
    }

    const title = typeof candidate.title === 'string'
      ? sanitizeText(candidate.title, MAX_TITLE_LENGTH)
      : '';
    const description = typeof candidate.description === 'string'
      ? sanitizeText(candidate.description, MAX_DESCRIPTION_LENGTH)
      : '';

    if (!title && !description) {
      warnings.push('Skipped JSON issue entry with no title or description.');
      continue;
    }

    const rawSeverity = typeof candidate.severity === 'string' ? candidate.severity : '';
    const severity = mapSeverity(rawSeverity);

    // Resolve file path: accept filePath, file, or path
    const rawPath = (
      typeof candidate.filePath === 'string' ? candidate.filePath :
      typeof candidate.file === 'string' ? candidate.file :
      typeof candidate.path === 'string' ? candidate.path :
      undefined
    );
    const filePath = rawPath ? normalizeFilePath(rawPath) : undefined;
    if (rawPath && !filePath) {
      warnings.push(`Rejected absolute or invalid file path in JSON: ${String(rawPath).slice(0, 80)}`);
    }

    const lineStart = sanitizeLineNumber(candidate.lineStart ?? candidate.line);
    const lineEndRaw = sanitizeLineNumber(candidate.lineEnd);
    const lineEnd = lineEndRaw && lineStart && lineEndRaw >= lineStart
      ? lineEndRaw
      : undefined;

    const evidence = typeof candidate.evidence === 'string'
      ? sanitizeText(candidate.evidence, MAX_EVIDENCE_LENGTH)
      : undefined;
    const suggestion = typeof candidate.suggestion === 'string'
      ? sanitizeText(candidate.suggestion, MAX_SUGGESTION_LENGTH)
      : undefined;

    issues.push({
      issueId: '', // filled in later
      ordinal: 0, // filled in later
      title: title || description.slice(0, MAX_TITLE_LENGTH),
      description: description || title,
      severity,
      status: defaultStatus(),
      filePath,
      lineStart,
      lineEnd,
      evidence: evidence || undefined,
      suggestion: suggestion || undefined,
      sourceFingerprint: '', // filled in later
    });
  }

  return { issues, warnings };
}

// ---------------------------------------------------------------------------
// Markdown Parser
// ---------------------------------------------------------------------------

interface MarkdownIssueCandidate {
  title: string;
  description: string;
  severity: ReviewIssueSeverity;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  evidence?: string;
  suggestion?: string;
}

/**
 * Parse a Markdown-formatted AI response.
 *
 * Supports:
 * 1. `## Severity` headers with `### Title` sub-headers
 * 2. `- File: path`, `- Line: N`, `- Description: ...` list items
 * 3. Numbered lists like `1. [High] path:line description`
 * 4. Table rows
 */
function parseMarkdown(markdown: string, _context: ParseContext): {
  issues: ReviewIssue[];
  warnings: string[];
} {
  const issues: ReviewIssue[] = [];
  const warnings: string[] = [];
  const candidates: MarkdownIssueCandidate[] = [];

  // Strategy 1: Severity headers with sub-headers

  // Strategy 2: Numbered list items like "1. [Severity] path:line desc"
  // (Parsed in parseNumberedList function)

  // Strategy 3: Table rows with severity, file, line, description

  // First, try to find structured severity sections
  const sections = extractSeveritySections(markdown);
  for (const section of sections) {
    const sectionCandidates = parseSection(section.severity, section.body);
    candidates.push(...sectionCandidates);
  }

  // If no structured sections found, try numbered list
  if (candidates.length === 0) {
    const numberedCandidates = parseNumberedList(markdown);
    candidates.push(...numberedCandidates);
  }

  // If still nothing, try table parsing
  if (candidates.length === 0) {
    const tableCandidates = parseTable(markdown);
    candidates.push(...tableCandidates);
  }

  // If still nothing, try loose list item parsing
  if (candidates.length === 0) {
    const looseCandidates = parseLooseListItems(markdown);
    candidates.push(...looseCandidates);
  }

  for (const candidate of candidates) {
    if (issues.length >= MAX_ISSUES) {
      warnings.push(`Reached maximum of ${MAX_ISSUES} issues; remaining items ignored.`);
      break;
    }

    issues.push({
      issueId: '',
      ordinal: 0,
      title: candidate.title || candidate.description.slice(0, MAX_TITLE_LENGTH),
      description: candidate.description || candidate.title,
      severity: candidate.severity,
      status: defaultStatus(),
      filePath: candidate.filePath,
      lineStart: candidate.lineStart,
      lineEnd: candidate.lineEnd,
      evidence: candidate.evidence,
      suggestion: candidate.suggestion,
      sourceFingerprint: '',
    });
  }

  return { issues, warnings };
}

interface SeveritySection {
  severity: ReviewIssueSeverity;
  body: string;
}

function extractSeveritySections(markdown: string): SeveritySection[] {
  const sections: SeveritySection[] = [];

  // Match "## SeverityName" headers and capture content until next ## header or end
  const headerRegex = /^##\s+(.+)$/gm;
  const matches: { severity: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(markdown)) !== null) {
    matches.push({
      severity: match[1].trim(),
      start: match.index + match[0].length,
      end: 0,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    matches[i].end = i + 1 < matches.length
      ? matches[i + 1].start - matches[i + 1].severity.length - 4 // back to ##
      : markdown.length;
  }

  for (const m of matches) {
    const severity = mapSeverity(m.severity);
    const body = markdown.slice(m.start, m.end).trim();
    if (body) {
      sections.push({ severity, body });
    }
  }

  return sections;
}

function parseSection(
  defaultSeverity: ReviewIssueSeverity,
  body: string,
): MarkdownIssueCandidate[] {
  const candidates: MarkdownIssueCandidate[] = [];

  // Split by ### sub-headers (issue titles)
  const subParts = body.split(/^###\s+/gm);
  // First part is content before any ### header
  const preamble = subParts[0]?.trim();

  // Try to extract issues from preamble (before any ###)
  if (preamble) {
    const fromPreamble = parseIssueBlock(defaultSeverity, preamble);
    candidates.push(...fromPreamble);
  }

  // Process ### sections as individual issues
  for (let i = 1; i < subParts.length; i++) {
    const part = subParts[i];
    const newlineIdx = part.indexOf('\n');
    const title = newlineIdx > 0
      ? sanitizeText(part.slice(0, newlineIdx), MAX_TITLE_LENGTH)
      : sanitizeText(part, MAX_TITLE_LENGTH);
    const rest = newlineIdx > 0 ? part.slice(newlineIdx + 1).trim() : '';

    const blocks = parseIssueBlock(defaultSeverity, rest);
    if (blocks.length > 0) {
      for (const block of blocks) {
        candidates.push({
          ...block,
          title: title || block.title,
        });
      }
    } else if (title) {
      candidates.push({
        title,
        description: rest.slice(0, MAX_DESCRIPTION_LENGTH),
        severity: defaultSeverity,
        filePath: extractField(rest, 'file'),
        lineStart: extractLineNumber(rest),
        evidence: extractField(rest, 'evidence'),
        suggestion: extractField(rest, 'suggestion'),
      });
    }
  }

  return candidates;
}

function parseIssueBlock(
  defaultSeverity: ReviewIssueSeverity,
  text: string,
): MarkdownIssueCandidate[] {
  // Split by **bold headers** or numbered sub-items
  const blocks = text.split(/\n(?=\*\*|(?:\d+\.\s))/);
  const results: MarkdownIssueCandidate[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Try to extract a bold title like **Title**
    const boldMatch = /^\*\*(.+?)\*\*/.exec(trimmed);
    const title = boldMatch
      ? sanitizeText(boldMatch[1], MAX_TITLE_LENGTH)
      : sanitizeText(trimmed.split('\n')[0], MAX_TITLE_LENGTH);

    const filePath = extractField(trimmed, 'file');
    const lineStart = extractLineNumber(trimmed);
    const description = extractField(trimmed, 'description')
      || extractFreeText(trimmed, MAX_DESCRIPTION_LENGTH);
    const evidence = extractField(trimmed, 'evidence');
    const suggestion = extractField(trimmed, 'suggestion');

    // Try to extract severity override from the block
    const sevMatch = /\[(critical|high|medium|low|info)\]/i.exec(trimmed);
    const severity = sevMatch ? mapSeverity(sevMatch[1]) : defaultSeverity;

    if (title || description) {
      results.push({
        title,
        description,
        severity,
        filePath,
        lineStart,
        evidence,
        suggestion,
      });
    }
  }

  return results;
}

function extractField(text: string, field: string): string | undefined {
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*[-*]\\s*(?:\\*\\*)?${field}(?:\\*\\*)?\\s*:\\s*(.+)$`, 'gim'),
    new RegExp(`(?:^|\\n)\\s*${field}\\s*:\\s*(.+)$`, 'gim'),
  ];

  for (const pattern of patterns) {
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      results.push(match[1].trim());
    }
    if (results.length > 0) {
      // For file, prefer the first one
      return sanitizeText(results[0], field === 'file' ? MAX_FILE_PATH_LENGTH : MAX_DESCRIPTION_LENGTH) || undefined;
    }
  }
  return undefined;
}

function extractLineNumber(text: string): number | undefined {
  const patterns = [
    /(?:^|\n)\s*[-*]\s*(?:\*\*)?(?:line|Line)(?:\*\*)?\s*:\s*(\d+)/im,
    /(?:^|\n)\s*(?:line|Line)\s*:\s*(\d+)/im,
    /:(\d+)(?:\s*[-–]\s*(\d+))?/m,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const line = Number.parseInt(match[1], 10);
      if (Number.isFinite(line) && line > 0) return line;
    }
  }
  return undefined;
}

function extractFreeText(text: string, maxLength: number): string {
  // Remove common field lines and get the remaining description
  const cleaned = text
    .replace(/^[-*]\s*(?:\*\*)?(?:file|line|evidence|suggestion|severity|status)(?:\*\*)?\s*:.*$/gim, '')
    .replace(/\[(?:critical|high|medium|low|info)\]/gi, '')
    .trim();
  return sanitizeText(cleaned, maxLength);
}

function parseNumberedList(markdown: string): MarkdownIssueCandidate[] {
  const candidates: MarkdownIssueCandidate[] = [];

  // Pattern: "1. [Severity] path:line description"
  // Matches: "1. [High] src/file.ts:42 Description text"
  const pattern = /^(\d+)\.\s*(?:\[([^\]]+)\]\s*)?(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const sevRaw = match[2]?.trim() ?? '';
    const severity = sevRaw ? mapSeverity(sevRaw) : 'unknown';
    const rest = match[3]?.trim() ?? '';

    // Try to extract file:line pattern from rest
    const fileLineMatch = /^`?([^`\n:]+?)`?\s*:(\d+)(?:\s*(?:-|–)\s*(\d+))?\s*(?:-|–|:)\s*(.+)$/s.exec(rest);

    let filePath: string | undefined;
    let lineStart: number | undefined;
    let lineEnd: number | undefined;
    let description: string;

    if (fileLineMatch) {
      const rawPath = fileLineMatch[1]?.trim();
      filePath = rawPath ? normalizeFilePath(rawPath) : undefined;
      lineStart = sanitizeLineNumber(fileLineMatch[2]);
      const lineEndRaw = sanitizeLineNumber(fileLineMatch[3]);
      lineEnd = lineEndRaw && lineStart && lineEndRaw >= lineStart ? lineEndRaw : undefined;
      description = sanitizeText(fileLineMatch[4], MAX_DESCRIPTION_LENGTH);
    } else {
      description = sanitizeText(rest, MAX_DESCRIPTION_LENGTH);
    }

    if (description) {
      candidates.push({
        title: description.slice(0, MAX_TITLE_LENGTH),
        description,
        severity,
        filePath,
        lineStart,
        lineEnd,
      });
    }
  }

  // Simpler pattern: "1. description"
  if (candidates.length === 0) {
    const simplePattern = /^(\d+)\.\s+(.+)$/gm;
    while ((match = simplePattern.exec(markdown)) !== null) {
      const desc = sanitizeText(match[2], MAX_DESCRIPTION_LENGTH);
      if (desc && desc.length > 10) { // Skip very short items that are likely not issues
        candidates.push({
          title: desc.slice(0, MAX_TITLE_LENGTH),
          description: desc,
          severity: 'unknown',
        });
      }
    }
  }

  return candidates;
}

function parseTable(markdown: string): MarkdownIssueCandidate[] {
  const candidates: MarkdownIssueCandidate[] = [];

  // Find markdown tables
  const tablePattern = /\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g;
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(markdown)) !== null) {
    const headerRow = match[1];
    const bodyRows = match[2];

    const headers = headerRow.split('|').map((h) => h.trim().toLowerCase()).filter(Boolean);

    const rows = bodyRows.split('\n').filter((row) => row.trim());
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);

      const getCell = (name: string): string | undefined => {
        const idx = headers.findIndex((h) => h.includes(name));
        return idx >= 0 && idx < cells.length ? cells[idx] : undefined;
      };

      const title = getCell('title') ?? getCell('issue') ?? getCell('problem') ?? cells[0] ?? '';
      const description = getCell('description') ?? getCell('detail') ?? '';
      const sevRaw = getCell('severity') ?? getCell('level') ?? getCell('risk') ?? '';
      const severity = sevRaw ? mapSeverity(sevRaw) : 'unknown';
      const rawPath = getCell('file') ?? getCell('path') ?? getCell('location');
      const filePath = rawPath ? normalizeFilePath(rawPath) : undefined;
      const lineStart = sanitizeLineNumber(getCell('line'));
      const suggestion = getCell('suggestion') ?? getCell('fix') ?? getCell('recommendation');

      if (title || description) {
        candidates.push({
          title: sanitizeText(title, MAX_TITLE_LENGTH),
          description: sanitizeText(description || title, MAX_DESCRIPTION_LENGTH),
          severity,
          filePath,
          lineStart,
          suggestion: suggestion ? sanitizeText(suggestion, MAX_SUGGESTION_LENGTH) : undefined,
        });
      }
    }
  }

  return candidates;
}

function parseLooseListItems(markdown: string): MarkdownIssueCandidate[] {
  const candidates: MarkdownIssueCandidate[] = [];

  // Look for bullet points that look like issues
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const items: string[] = [];

  while ((match = bulletPattern.exec(markdown)) !== null) {
    items.push(match[1].trim());
  }

  for (const item of items) {
    // Only treat as issue if it has some substance
    if (item.length < 20) continue;

    // Try to extract severity from brackets
    const sevMatch = /^\[(critical|high|medium|low|info)\]/i.exec(item);
    const severity = sevMatch ? mapSeverity(sevMatch[1]) : 'unknown';
    const text = sevMatch ? item.slice(sevMatch[0].length).trim() : item;

    candidates.push({
      title: sanitizeText(text, MAX_TITLE_LENGTH),
      description: sanitizeText(text, MAX_DESCRIPTION_LENGTH),
      severity,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of parsing an AI review response.
 */
export interface ParseResult {
  /** The structured report. */
  readonly report: ReviewReport;
  /** Whether any issues were successfully parsed. */
  readonly issueCount: number;
}

/**
 * Parse an AI review response into a structured report.
 *
 * This is a pure function:
 * - No file system access
 * - No VS Code API
 * - No network calls
 * - Conservative — won't fabricate issues from noise
 *
 * Parse strategy (in priority order):
 * 1. JSON fenced code blocks
 * 2. Structured Markdown with severity headers
 * 3. Numbered lists
 * 4. Tables
 * 5. Falls back to `unstructured` if nothing reliable is found
 */
export function parseReviewResponse(
  response: string,
  context: ParseContext,
): ParseResult {
  const warnings: string[] = [];

  // Check size limit
  if (Buffer.byteLength(response, 'utf8') > MAX_RESPONSE_BYTES) {
    return {
      report: {
        schemaVersion: REPORT_SCHEMA_VERSION,
        reviewId: context.reviewId,
        sourceResponseHash: '',
        parsedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
        parseStatus: 'unstructured',
        issues: [],
        warnings: ['Response exceeds maximum size of 5 MB.'],
      },
      issueCount: 0,
    };
  }

  let issues: ReviewIssue[] = [];
  let parseStatus: ParseStatus = 'unstructured';

  // Strategy 1: Try JSON blocks
  const jsonBlockPattern = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let jsonMatch: RegExpExecArray | null;
  let parsedJson = false;

  while ((jsonMatch = jsonBlockPattern.exec(response)) !== null) {
    const jsonText = jsonMatch[1];
    if (Buffer.byteLength(jsonText, 'utf8') > MAX_JSON_BLOCK_BYTES) {
      warnings.push('JSON block exceeds maximum size; skipping.');
      continue;
    }

    const result = parseJsonBlock(jsonText, context);
    if (result.issues.length > 0) {
      issues.push(...result.issues);
      warnings.push(...result.warnings);
      parsedJson = true;
    }
  }

  if (parsedJson) {
    parseStatus = warnings.length > 0 ? 'partial' : 'parsed';
  } else {
    // Strategy 2-5: Try Markdown-based parsing
    const mdResult = parseMarkdown(response, context);
    if (mdResult.issues.length > 0) {
      issues.push(...mdResult.issues);
      warnings.push(...mdResult.warnings);
      parseStatus = mdResult.warnings.length > 0 ? 'partial' : 'parsed';
    } else {
      warnings.push('No structured issues could be reliably parsed from the response.');
    }
  }

  // Truncate to MAX_ISSUES
  if (issues.length > MAX_ISSUES) {
    issues = issues.slice(0, MAX_ISSUES);
    warnings.push(`Truncated to ${MAX_ISSUES} issues.`);
  }

  // Assign stable IDs and ordinals
  const idInputs: IssueIdInput[] = issues.map((issue) => ({
    reviewId: context.reviewId,
    severity: issue.severity,
    filePath: issue.filePath,
    lineStart: issue.lineStart,
    lineEnd: issue.lineEnd,
    title: issue.title,
    description: issue.description,
  }));

  const ids = generateIssueIds(idInputs);

  const finalIssues: ReviewIssue[] = issues.map((issue, index) => ({
    ...issue,
    issueId: ids[index],
    ordinal: index + 1,
    sourceFingerprint: ids[index],
  }));

  // Sanitize warnings
  const sanitizedWarnings = warnings
    .map((w) => sanitizeText(w, MAX_WARNING_LENGTH))
    .filter(Boolean);

  const report: ReviewReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reviewId: context.reviewId,
    sourceResponseHash: '', // filled in by ReportService
    parsedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    parseStatus,
    issues: finalIssues,
    warnings: sanitizedWarnings,
  };

  return { report, issueCount: finalIssues.length };
}
