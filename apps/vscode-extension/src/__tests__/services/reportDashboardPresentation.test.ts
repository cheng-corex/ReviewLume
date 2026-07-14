import { describe, expect, it } from 'vitest';
import type { ReviewReport } from '@reviewlume/report-parser';
import { buildReportDashboardView } from '../../services/reportDashboardPresentation';

const report: ReviewReport = {
  schemaVersion: 1,
  reviewId: '20260714T010203Z-aabbccddeeff',
  sourceResponseHash: 'a'.repeat(64),
  parsedAt: '2026-07-14T00:00:00.000Z',
  parserVersion: '1.0.0',
  parseStatus: 'parsed',
  warnings: [],
  issues: [
    {
      issueId: 'ISSUE-1',
      ordinal: 1,
      title: 'Critical open issue',
      description: 'Description',
      severity: 'critical',
      status: 'open',
      sourceFingerprint: 'ISSUE-1',
    },
    {
      issueId: 'ISSUE-2',
      ordinal: 2,
      title: 'Fixed issue',
      description: 'Description',
      severity: 'high',
      status: 'fixed',
      sourceFingerprint: 'ISSUE-2',
    },
  ],
};

describe('reportDashboardPresentation', () => {
  it('builds a Chinese summary and filtered issue list', () => {
    const view = buildReportDashboardView(
      report,
      { statuses: ['open'], severities: ['critical'], query: 'critical' },
      'zh',
    );

    expect(view.summary).toBe('共 2 个 · 未处理 1 个 · 严重 1 · 高 1');
    expect(view.filterDescription).toBe('待处理 · 严重 · 搜索：critical');
    expect(view.visibleCount).toBe(1);
    expect(view.totalCount).toBe(2);
    expect(view.issues[0].issueId).toBe('ISSUE-1');
  });

  it('shows the empty English filter state', () => {
    const view = buildReportDashboardView(report, {}, 'en');

    expect(view.summary).toBe('2 total · 1 unresolved · 1 critical · 1 high');
    expect(view.filterDescription).toBe('No filters');
    expect(view.visibleCount).toBe(2);
  });
});
