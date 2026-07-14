import type {
  ReviewIssueSeverity,
  ReviewIssueStatus,
  ReviewReport,
} from '@reviewlume/report-parser';
import {
  filterAndSortReportIssues,
  summarizeReport,
  type ReportDashboardFilter,
} from './reportDashboardModel';
import {
  buildReportIssueListItem,
  type IssueActionLocale,
  type ReportIssueListItem,
} from './reportIssueActions';

export interface ReportDashboardView {
  readonly summary: string;
  readonly filterDescription: string;
  readonly issues: readonly ReportIssueListItem[];
  readonly visibleCount: number;
  readonly totalCount: number;
}

const statusLabels: Readonly<Record<IssueActionLocale, Record<ReviewIssueStatus, string>>> = {
  en: {
    open: 'Open',
    fixed: 'Fixed',
    rejected: 'Rejected',
    'needs-review': 'Needs review',
  },
  zh: {
    open: '待处理',
    fixed: '已修复',
    rejected: '已拒绝',
    'needs-review': '待复核',
  },
};

const severityLabels: Readonly<
  Record<IssueActionLocale, Record<ReviewIssueSeverity, string>>
> = {
  en: {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    info: 'Info',
    unknown: 'Unknown',
  },
  zh: {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
    info: '信息',
    unknown: '未知',
  },
};

export function buildReportDashboardView(
  report: ReviewReport,
  filter: ReportDashboardFilter,
  locale: IssueActionLocale,
): ReportDashboardView {
  const summary = summarizeReport(report);
  const visibleIssues = filterAndSortReportIssues(report, filter);

  return {
    summary:
      locale === 'zh'
        ? `共 ${summary.total} 个 · 未处理 ${summary.unresolved} 个 · 严重 ${summary.bySeverity.critical} · 高 ${summary.bySeverity.high}`
        : `${summary.total} total · ${summary.unresolved} unresolved · ${summary.bySeverity.critical} critical · ${summary.bySeverity.high} high`,
    filterDescription: formatFilterDescription(filter, locale),
    issues: visibleIssues.map((issue) => buildReportIssueListItem(issue, locale)),
    visibleCount: visibleIssues.length,
    totalCount: summary.total,
  };
}

function formatFilterDescription(
  filter: ReportDashboardFilter,
  locale: IssueActionLocale,
): string {
  const parts: string[] = [];

  if (filter.statuses?.length) {
    parts.push(filter.statuses.map((status) => statusLabels[locale][status]).join(', '));
  }
  if (filter.severities?.length) {
    parts.push(
      filter.severities.map((severity) => severityLabels[locale][severity]).join(', '),
    );
  }
  if (filter.query?.trim()) {
    parts.push(locale === 'zh' ? `搜索：${filter.query.trim()}` : `Search: ${filter.query.trim()}`);
  }

  if (parts.length === 0) return locale === 'zh' ? '未应用筛选' : 'No filters';
  return parts.join(' · ');
}
