import type {
  ReviewIssue,
  ReviewIssueSeverity,
  ReviewIssueStatus,
  ReviewReport,
} from '@reviewlume/report-parser';

export interface ReportDashboardSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<ReviewIssueStatus, number>>;
  readonly bySeverity: Readonly<Record<ReviewIssueSeverity, number>>;
  readonly unresolved: number;
}

export interface ReportDashboardFilter {
  readonly statuses?: readonly ReviewIssueStatus[];
  readonly severities?: readonly ReviewIssueSeverity[];
  readonly query?: string;
}

const severityRank: Readonly<Record<ReviewIssueSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const statusRank: Readonly<Record<ReviewIssueStatus, number>> = {
  open: 0,
  'needs-review': 1,
  fixed: 2,
  rejected: 3,
};

export function summarizeReport(report: ReviewReport): ReportDashboardSummary {
  const byStatus: Record<ReviewIssueStatus, number> = {
    open: 0,
    fixed: 0,
    rejected: 0,
    'needs-review': 0,
  };
  const bySeverity: Record<ReviewIssueSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const issue of report.issues) {
    byStatus[issue.status] += 1;
    bySeverity[issue.severity] += 1;
  }

  return {
    total: report.issues.length,
    byStatus,
    bySeverity,
    unresolved: byStatus.open + byStatus['needs-review'],
  };
}

export function filterAndSortReportIssues(
  report: ReviewReport,
  filter: ReportDashboardFilter = {},
): readonly ReviewIssue[] {
  const statuses = filter.statuses ? new Set(filter.statuses) : undefined;
  const severities = filter.severities ? new Set(filter.severities) : undefined;
  const query = filter.query?.trim().toLocaleLowerCase();

  return report.issues
    .filter((issue) => {
      if (statuses && !statuses.has(issue.status)) return false;
      if (severities && !severities.has(issue.severity)) return false;
      if (!query) return true;

      return [issue.title, issue.description, issue.filePath ?? '', issue.issueId]
        .join('\n')
        .toLocaleLowerCase()
        .includes(query);
    })
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) return severityDelta;

      const statusDelta = statusRank[left.status] - statusRank[right.status];
      if (statusDelta !== 0) return statusDelta;

      const ordinalDelta = left.ordinal - right.ordinal;
      if (ordinalDelta !== 0) return ordinalDelta;

      return left.issueId.localeCompare(right.issueId);
    });
}
