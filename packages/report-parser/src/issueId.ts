/**
 * Stable Issue ID Generator for P8A.
 *
 * Generates deterministic, unique issue IDs within a single review.
 * IDs are stable across repeated parses of the same content.
 */

import { createHash } from 'node:crypto';
import type { ReviewIssueSeverity } from './types.js';

/** Prefix for all issue IDs. */
const ISSUE_PREFIX = 'ISSUE-';

/** Length of the hex portion of the issue ID. */
const HEX_LENGTH = 16;

/**
 * Normalize a file path for ID computation.
 * - Converts backslashes to forward slashes
 * - Trims leading `./`
 * - Lowercases for case-insensitive stability
 */
export function normalizePathForId(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

/**
 * Normalize a text field for ID computation.
 * - Trims whitespace
 * - Collapses internal whitespace to single spaces
 * - Lowercases
 */
export function normalizeTextForId(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Input fields used to compute a stable issue fingerprint.
 */
export interface IssueIdInput {
  readonly reviewId: string;
  readonly severity: ReviewIssueSeverity;
  readonly filePath?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly title: string;
  readonly description: string;
}

/**
 * Compute a stable, deterministic fingerprint for an issue.
 * This fingerprint is used as the basis for the issue ID.
 */
export function computeFingerprint(input: IssueIdInput): string {
  const parts: string[] = [
    input.reviewId,
    input.severity,
    input.filePath ? normalizePathForId(input.filePath) : '',
    input.lineStart?.toString() ?? '',
    input.lineEnd?.toString() ?? '',
    normalizeTextForId(input.title),
    normalizeTextForId(input.description),
  ];
  const canonical = parts.join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Generate a stable issue ID from the fingerprint.
 */
function fingerprintToId(fingerprint: string, suffix = 0): string {
  const base = suffix === 0 ? fingerprint : `${fingerprint}:${suffix}`;
  const hash = createHash('sha256').update(base).digest('hex');
  return `${ISSUE_PREFIX}${hash.slice(0, HEX_LENGTH)}`;
}

/**
 * Generate stable unique issue IDs for a batch of issues.
 *
 * Each issue gets a deterministic ID based on its normalized fields.
 * In case of duplicate fingerprints (identical issues), a deterministic
 * suffix is appended to disambiguate.
 *
 * @returns An array of IDs in the same order as the inputs.
 */
export function generateIssueIds(inputs: readonly IssueIdInput[]): string[] {
  const fingerprintCounts = new Map<string, number>();
  const ids: string[] = [];

  for (const input of inputs) {
    const fingerprint = computeFingerprint(input);
    const count = fingerprintCounts.get(fingerprint) ?? 0;
    fingerprintCounts.set(fingerprint, count + 1);
    ids.push(fingerprintToId(fingerprint, count));
  }

  return ids;
}
