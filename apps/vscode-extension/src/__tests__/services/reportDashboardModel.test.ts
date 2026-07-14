import { describe, expect, it } from 'vitest';
import type { ReviewIssue, ReviewReport } from '@reviewlume/report-parser';
import {
  filterAndSortReportIssues,
  summarizeReport,
} from '../../services/reportDashboardModel';

function issue(overrides: Partial<ReviewIssue>): ReviewIssue {
  return {
    issueId: 'ISSUE-0000000000000001',
    ordinal: 1,
    title: 'Issue',
    description: 'Description',
    severity: 'medium',
    status: 'open',
    sourceFingerprint: 'ISSUE-0000000000000001',
    ...overrides,
  };
}

function report(issues: ReviewIssue[]): ReviewReport {
  return {
    schemaVersion: 1,
    reviewId: '20260714T010203Z-aabbccddeeff',
    sourceResponseHash: 'a'.repeat(64),
    parsedAt: '2026-07-14T00:00:00.000Z',
    parserVersion: '1.0.0',
    parseStatus: 'parsed',
    warnings: [],
    issues,
  };
}

describe('reportDashboardModel', () => {
  it('summarizes status, severity and unresolved counts', () => {
    const summary = summarizeReport(
      report([
        issue({ severity: 'critical', status: 'open' }),
        issue({ issueId: 'ISSUE-2', severity: 'high', status: 'needs-review' }),
        issue({ issueId: 'ISSUE-3', severity: 'low', status: 'fixed' }),
        issue({ issueId: 'ISSUE-4', severity: 'low', status: 'rejected' }),
      ]),
    );

    expect(summary.total).toBe(4);
    expect(summary.unresolved).toBe(2);
    expect(summary.byStatus).toEqual({
      open: 1,
      fixed: 1,
      rejected: 1,
      'needs-review': 1,
    });
    expect(summary.bySeverity).toEqual({
      critical: 1,
      high: 1,
      medium: 0,
      low: 2,
    });
  });

  it('filters by status, severity and text', () => {
    const current = report([
      issue({ title: 'SQL injection', severity: 'critical', filePath: 'src/db.ts' }),
      issue({ issueId: 'ISSUE-2', title: 'Missing test', severity: 'medium' }),
      issue({ issueId: 'ISSUE-3', title: 'Old issue', status: 'fixed' }),
    ]);

    expect(
      filterAndSortReportIssues(current, {
        statuses: ['open'],
        severities: ['critical'],
        query: 'DB.TS',
      }).map((item) => item.title),
    ).toEqual(['SQL injection']);
  });

  it('sorts by severity, status, ordinal and issue id', () => {
    const sorted = filterAndSortReportIssues(
      report([
        issue({ issueId: 'ISSUE-4', ordinal: 4, severity: 'low' }),
        issue({ issueId: 'ISSUE-3', ordinal: 3, severity: 'critical', status: 'fixed' }),
        issue({ issueId: 'ISSUE-2', ordinal: 2, severity: 'critical', status: 'open' }),
        issue({ issueId: 'ISSUE-1', ordinal: 1, severity: 'critical', status: 'open' }),
      ]),
    );

    expect(sorted.map((item) => item.issueId)).toEqual([
      'ISSUE-1',
      'ISSUE-2',
      'ISSUE-3',
      'ISSUE-4',
    ]);
  });
});
