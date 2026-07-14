import { describe, expect, it, vi } from 'vitest';
import type { ReviewIssue, ReviewReport } from '@reviewlume/report-parser';
import type { ReportIssueStatusItem } from '../../services/reportIssueActions';
import type { ReportDashboardPickerItem } from '../../services/reportDashboardPresentation';
import type { ReportIssueStatusFlowUi } from '../../services/reportIssueStatusFlow';
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

function firstIssue(items: readonly ReportDashboardPickerItem[]) {
  return items.find((item) => item.itemType === 'issue');
}

describe('runReportIssueStatusFlow', () => {
  it('persists the selected legal status transition', async () => {
    const current = report();
    const updated: ReviewReport = {
      ...current,
      issues: [{ ...current.issues[0], status: 'fixed' }],
    };
    const transitionIssueStatusOnDisk = vi.fn().mockResolvedValue(updated);
    const issuePickerCalls: Array<{
      items: readonly ReportDashboardPickerItem[];
      summary: string;
      filterDescription: string;
      visibleCount: number;
    }> = [];
    const pickIssue: ReportIssueStatusFlowUi['pickIssue'] = async (
      items,
      _report,
      summary,
      filterDescription,
      visibleCount,
    ) => {
      issuePickerCalls.push({ items, summary, filterDescription, visibleCount });
      return firstIssue(items);
    };
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
    const issueItem = firstIssue(issuePickerCalls[0].items);
    expect(issueItem?.description).toContain('待处理');
    expect(issuePickerCalls[0].summary).toContain('共 1 个');
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

  it('applies a dashboard filter before selecting an issue', async () => {
    const current: ReviewReport = {
      ...report(),
      issues: [
        ...report().issues,
        {
          ...report().issues[0],
          issueId: 'ISSUE-2',
          ordinal: 2,
          title: 'Resolved issue',
          status: 'fixed',
          sourceFingerprint: 'ISSUE-2',
        },
      ],
    };
    const updated = {
      ...current,
      issues: [{ ...current.issues[0], status: 'fixed' }, current.issues[1]],
    };
    const transitionIssueStatusOnDisk = vi.fn().mockResolvedValue(updated);
    const pickerCalls: Array<{
      items: readonly ReportDashboardPickerItem[];
      filterDescription: string;
      visibleCount: number;
    }> = [];
    const pickIssue: ReportIssueStatusFlowUi['pickIssue'] = async (
      items,
      _report,
      _summary,
      filterDescription,
      visibleCount,
    ) => {
      pickerCalls.push({ items, filterDescription, visibleCount });
      if (pickerCalls.length === 1) {
        return items.find(
          (item) => item.itemType === 'filter' && item.preset === 'unresolved',
        );
      }
      return firstIssue(items);
    };

    await runReportIssueStatusFlow({
      report: current,
      reviewDirectory: '/review',
      reviewId: current.reviewId,
      responseText: 'response',
      language: 'en',
      reportService: { transitionIssueStatusOnDisk },
      ui: {
        pickIssue,
        pickStatus: vi.fn(
          async (_issue: ReviewIssue, items: readonly ReportIssueStatusItem[]) => items[0],
        ),
      },
    });

    expect(pickerCalls).toHaveLength(2);
    expect(pickerCalls[1].filterDescription).toBe('Open, Needs review');
    expect(pickerCalls[1].visibleCount).toBe(1);
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
        pickIssue: async (items) => firstIssue(items),
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
