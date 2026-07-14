import type { ReviewIssue, ReviewIssueStatus } from '@reviewlume/report-parser';
import {
  formatIssueStatus,
  getIssueStatusActions,
  type IssueStatusAction,
} from './issueStatusPresentation';

export type IssueActionLocale = 'en' | 'zh';

export interface ReportIssueListItem {
  readonly itemType: 'issue';
  readonly issueId: string;
  readonly label: string;
  readonly description: string;
  readonly detail: string;
}

export interface ReportIssueStatusItem {
  readonly itemType: 'status';
  readonly status: ReviewIssueStatus;
  readonly label: string;
  readonly description: string;
}

export function resolveIssueActionLocale(language: string): IssueActionLocale {
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function buildReportIssueListItem(
  issue: ReviewIssue,
  locale: IssueActionLocale,
): ReportIssueListItem {
  const severityIcon =
    issue.severity === 'critical'
      ? '$(error)'
      : issue.severity === 'high'
        ? '$(warning)'
        : issue.severity === 'medium'
          ? '$(info)'
          : '$(circle-outline)';
  const location = formatIssueLocation(issue, locale);

  return {
    itemType: 'issue',
    issueId: issue.issueId,
    label: `${severityIcon} [${issue.severity}] ${issue.title.slice(0, 80)}`,
    description: `${formatIssueStatus(issue.status, locale)} · ${location}`,
    detail: issue.description.slice(0, 200),
  };
}

export function buildIssueStatusItems(
  issue: ReviewIssue,
  locale: IssueActionLocale,
): readonly ReportIssueStatusItem[] {
  return getIssueStatusActions(issue.status, locale).map(
    (action: IssueStatusAction): ReportIssueStatusItem => ({
      itemType: 'status',
      status: action.status,
      label: `$(${action.icon}) ${action.label}`,
      description: action.description,
    }),
  );
}

function formatIssueLocation(issue: ReviewIssue, locale: IssueActionLocale): string {
  if (!issue.filePath) return locale === 'zh' ? '无位置' : 'No location';
  const start = issue.lineStart ? `:${issue.lineStart}` : '';
  const end =
    issue.lineEnd && issue.lineEnd !== issue.lineStart ? `-${issue.lineEnd}` : '';
  return `${issue.filePath}${start}${end}`;
}
