import { describe, expect, it, vi } from 'vitest';
import type { ReviewIssue, ReviewReport } from '@reviewlume/report-parser';
import type {
  ReportIssueListItem,
  ReportIssueStatusItem,
} from '../../services/reportIssueActions';
import { runReportIssueStatusFlow } from '../../services/reportIssueStatusFlow';

function report(): ReviewReport {
  return {
    schemaVersion: 1,
    reviewId: '20260713T010203Z-aabbccddeeff',
    sourceResponseHash: 'a'.repeat(64),
    parsedAt: '2026-07-13T00:00:00.000Z',
    parserVersion: '1.0.0',
    parseStatus: 'parsed',
    warnings: [],
    issues: [
      {
        issueId: 'ISSUE-0000000000000001',
        ordinal: 1,
        title: 'Unsafe query',
        description: 'SQL input is concatenated directly.',
        severity: 'critical',
        status: 'open',
        filePath: 'src/db.ts',
        lineStart: 42,
        sourceFingerprint: 'ISSUE-0000000000000001',
      },
    ],
  };
}

describe('runReportIssueStatusFlow', () => {
  it('persists the selected legal status transition', async () => {
    const current = report();
    const updated: ReviewReport = {
      ...current,
      issues: [{ ...current.issues[0], status: 'fixed' }],
    };
    const transitionIssueStatusOnDisk = vi.fn().mockResolvedValue(updated);
    const pickIssue = vi.fn(async (items: readonly ReportIssueListItem[]) => items[0]);
    const pickStatus = vi.fn(
      async (_issue: ReviewIssue, items: readonly ReportIssueStatusItem[]) =>
        items.find((item) => item.status === 'fixed'),
    );

    const result = await runReportIssueStatusFlow({
      report: current,
      reviewDirectory: '/repo/.reviewlume/reviews/20260713T010203Z-aabbccddeeff',
      reviewId: current.reviewId,
      responseText: 'response',
      language: 'zh-cn',
      reportService: { transitionIssueStatusOnDisk },
      ui: { pickIssue, pickStatus },
    });

    expect(result).toBe(updated);
    expect(pickIssue.mock.calls[0][0][0].description).toContain('待处理');
    expect(pickStatus.mock.calls[0][1].map((item) => item.status)).toEqual([
      'fixed',
      'rejected',
      'needs-review',
    ]);
    expect(transitionIssueStatusOnDisk).toHaveBeenCalledWith(
      '/repo/.reviewlume/reviews/20260713T010203Z-aabbccddeeff',
      current.reviewId,
      'ISSUE-0000000000000001',
      'fixed',
      'response',
    );
  });

  it('does not write when issue selection is cancelled', async () => {
    const transitionIssueStatusOnDisk = vi.fn();

    const result = await runReportIssueStatusFlow({
      report: report(),
      reviewDirectory: '/review',
      reviewId: report().reviewId,
      responseText: 'response',
      language: 'en',
      reportService: { transitionIssueStatusOnDisk },
      ui: {
        pickIssue: vi.fn().mockResolvedValue(undefined),
        pickStatus: vi.fn(),
      },
    });

    expect(result).toBeUndefined();
    expect(transitionIssueStatusOnDisk).not.toHaveBeenCalled();
  });

  it('does not write when status selection is cancelled', async () => {
    const transitionIssueStatusOnDisk = vi.fn();

    const result = await runReportIssueStatusFlow({
      report: report(),
      reviewDirectory: '/review',
      reviewId: report().reviewId,
      responseText: 'response',
      language: 'en',
      reportService: { transitionIssueStatusOnDisk },
      ui: {
        pickIssue: vi.fn(async (items: readonly ReportIssueListItem[]) => items[0]),
        pickStatus: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(result).toBeUndefined();
    expect(transitionIssueStatusOnDisk).not.toHaveBeenCalled();
  });

  it('returns without prompting for an empty report', async () => {
    const empty = { ...report(), issues: [] };
    const pickIssue = vi.fn();

    const result = await runReportIssueStatusFlow({
      report: empty,
      reviewDirectory: '/review',
      reviewId: empty.reviewId,
      responseText: 'response',
      language: 'en',
      reportService: { transitionIssueStatusOnDisk: vi.fn() },
      ui: { pickIssue, pickStatus: vi.fn() },
    });

    expect(result).toBeUndefined();
    expect(pickIssue).not.toHaveBeenCalled();
  });
});