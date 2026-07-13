/**
 * P8A Issue Status State Machine.
 *
 * Pure validation functions for issue status transitions.
 * No side effects, no file system access, no VS Code API.
 */

import {
  ISSUE_STATUSES,
  STATUS_TRANSITIONS,
  type ReviewIssueStatus,
} from './types.js';

/**
 * Check if a status string is a valid ReviewIssueStatus.
 */
export function isValidStatus(value: string): value is ReviewIssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

/**
 * Validate that a status transition is allowed.
 *
 * @returns `true` if the transition is valid.
 */
export function canTransition(
  from: ReviewIssueStatus,
  to: ReviewIssueStatus,
): boolean {
  const allowed = STATUS_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Validate and apply a status transition.
 *
 * @returns The new status if valid.
 * @throws If the transition is not allowed or the statuses are invalid.
 */
export function validateTransition(
  from: ReviewIssueStatus,
  to: ReviewIssueStatus,
): ReviewIssueStatus {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid status transition: ${from} -> ${to}`,
    );
  }
  return to;
}

/**
 * Get the default status for newly parsed issues.
 */
export function defaultStatus(): ReviewIssueStatus {
  return 'open';
}

/**
 * Get all allowed transitions from a given status.
 */
export function allowedTransitions(
  from: ReviewIssueStatus,
): readonly ReviewIssueStatus[] {
  return STATUS_TRANSITIONS[from];
}
