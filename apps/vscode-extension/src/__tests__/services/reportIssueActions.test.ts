import { describe, expect, it } from 'vitest';
import type { ReviewIssue } from '@reviewlume/report-parser';
import {
  buildIssueStatusItems,
  buildReportIssueListItem,
  resolveIssueActionLocale,
} from '../../services/reportIssueActions';

const issue: ReviewIssue = {
  issueId: 'ISSUE-0000000000000001',
  ordinal: 1,
  title: 'SQL Injection Risk',
  description: 'User input is concatenated into SQL.',
  severity: 'critical',
  status: 'open',
  filePath: 'src/db.ts',
  lineStart: 42,
  lineEnd: 44,
  sourceFingerprint: 'ISSUE-0000000000000001',
};

describe('reportIssueActions', () => {
  it('resolves Chinese and English locales', () => {
    expect(resolveIssueActionLocale('zh-cn')).toBe('zh');
    expect(resolveIssueActionLocale('en')).toBe('en');
  });

  it('builds a localized report issue list item', () => {
    expect(buildReportIssueListItem(issue, 'zh')).toEqual({
      itemType: 'issue',
      issueId: issue.issueId,
      label: '$(error) [critical] SQL Injection Risk',
      description: '待处理 · src/db.ts:42-44',
      detail: issue.description,
    });
  });

  it('exposes only legal status transitions', () => {
    expect(buildIssueStatusItems(issue, 'en').map((item) => item.status)).toEqual([
      'fixed',
      'rejected',
      'needs-review',
    ]);
  });

  it('formats issues without a source location', () => {
    const item = buildReportIssueListItem(
      { ...issue, filePath: undefined, lineStart: undefined, lineEnd: undefined },
      'en',
    );
    expect(item.description).toBe('Open · No location');
  });
});