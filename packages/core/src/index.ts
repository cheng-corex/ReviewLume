/**
 * @reviewlume/core
 *
 * Core types, utilities, and shared constants for ReviewLume.
 * This package provides the foundational types used across all other packages.
 */

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

/** Review mode for building a review pack. */
export type ReviewMode = 'quick' | 'standard' | 'high-risk';

/** Sensitivity level for secret scan results. */
export type SecretLevel = 'HARD_BLOCK' | 'BLOCK' | 'WARN' | 'INFO';

/** Language for prompt templates. */
export type ReviewLanguage = 'zh-CN' | 'en';

/** A single scan finding. */
export interface ScanFinding {
  level: SecretLevel;
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

/** Result of a secret scan. */
export interface ScanResult {
  findings: ScanFinding[];
  hardBlockCount: number;
  blockCount: number;
  warnCount: number;
  infoCount: number;
  hasHardBlock: boolean;
  hasUnresolvedBlock: boolean;
  hasUnresolvedWarn: boolean;
}

/** Review pack metadata. */
export interface ReviewMetadata {
  reviewId: string;
  workspaceId: string;
  repositoryDisplayName: string;
  generatedAt: string;
  gitBase: string;
  gitTarget: string;
  reviewMode: ReviewMode;
  schemaVersion: number;
}

/** Review task configuration. */
export interface ReviewTaskConfig {
  mode: ReviewMode;
  language: ReviewLanguage;
  includeUntracked: boolean;
  respectGitIgnore: boolean;
  maxPackSizeKb: number;
}

/** Default configuration values. */
export const DEFAULT_CONFIG: ReviewTaskConfig = {
  mode: 'standard',
  language: 'en',
  includeUntracked: false,
  respectGitIgnore: true,
  maxPackSizeKb: 1024,
};

/** Namespace for all VS Code configuration keys. */
export const CONFIG_NAMESPACE = 'reviewlume';

/** Current schema version for review packs. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Output file name for the exported review request. */
export const REVIEW_REQUEST_FILENAME = 'REVIEW_REQUEST.md';

/** Internal history file names. */
export const INTERNAL_REQUEST_FILENAME = 'request.md';
export const INTERNAL_RESPONSE_FILENAME = 'response.md';
export const INTERNAL_REPORT_FILENAME = 'review-report.md';
export const INTERNAL_RESOLUTION_FILENAME = 'resolution.md';
