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

export type ReportDashboardPreset =
  | 'all'
  | 'unresolved'
  | 'open'
  | 'needs-review'
  | 'critical-high';

export interface ReportDashboardFilterItem {
  readonly itemType: 'filter';
  readonly preset: ReportDashboardPreset;
  readonly label: string;
  readonly description: string;
  readonly detail: string;
}

export type ReportDashboardPickerItem = ReportDashboardFilterItem | ReportIssueListItem;

export interface ReportDashboardView {
  readonly summary: string;
  readonly filterDescription: string;
  readonly filters: readonly ReportDashboardFilterItem[];
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
  const counts = summarizeReport(report);
  const visibleIssues = filterAndSortReportIssues(report, filter);
  const filterDescription = formatFilterDescription(filter, locale);
  const summary =
    locale === 'zh'
      ? `共 ${counts.total} 个 · 未处理 ${counts.unresolved} 个 · 严重 ${counts.bySeverity.critical} · 高 ${counts.bySeverity.high}`
      : `${counts.total} total · ${counts.unresolved} unresolved · ${counts.bySeverity.critical} critical · ${counts.bySeverity.high} high`;

  return {
    summary,
    filterDescription,
    filters: buildFilterItems(locale, summary, filterDescription),
    issues: visibleIssues.map((issue) => buildReportIssueListItem(issue, locale)),
    visibleCount: visibleIssues.length,
    totalCount: counts.total,
  };
}

export function filterForDashboardPreset(
  preset: ReportDashboardPreset,
): ReportDashboardFilter {
  switch (preset) {
    case 'unresolved':
      return { statuses: ['open', 'needs-review'] };
    case 'open':
      return { statuses: ['open'] };
    case 'needs-review':
      return { statuses: ['needs-review'] };
    case 'critical-high':
      return { severities: ['critical', 'high'] };
    case 'all':
      return {};
  }
}

function buildFilterItems(
  locale: IssueActionLocale,
  summary: string,
  currentFilter: string,
): readonly ReportDashboardFilterItem[] {
  const zh = locale === 'zh';
  const detail = zh
    ? `${summary} · 当前：${currentFilter}`
    : `${summary} · Current: ${currentFilter}`;
  return [
    {
      itemType: 'filter',
      preset: 'all',
      label: zh ? '$(list-flat) 显示全部问题' : '$(list-flat) Show all issues',
      description: zh ? '清除状态和严重级别筛选' : 'Clear status and severity filters',
      detail,
    },
    {
      itemType: 'filter',
      preset: 'unresolved',
      label: zh ? '$(circle-large-outline) 仅看未处理' : '$(circle-large-outline) Unresolved only',
      description: zh ? '待处理 + 待复核' : 'Open + needs review',
      detail,
    },
    {
      itemType: 'filter',
      preset: 'open',
      label: zh ? '$(issues) 仅看待处理' : '$(issues) Open only',
      description: zh ? '仅显示尚未处理的问题' : 'Only issues that are still open',
      detail,
    },
    {
      itemType: 'filter',
      preset: 'needs-review',
      label: zh ? '$(eye) 仅看待复核' : '$(eye) Needs review only',
      description: zh ? '仅显示需要再次确认的问题' : 'Only issues requiring another review',
      detail,
    },
    {
      itemType: 'filter',
      preset: 'critical-high',
      label: zh ? '$(flame) 仅看严重和高等级' : '$(flame) Critical and high only',
      description: zh ? '聚焦最优先处理的问题' : 'Focus on the highest-priority issues',
      detail,
    },
  ];
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
