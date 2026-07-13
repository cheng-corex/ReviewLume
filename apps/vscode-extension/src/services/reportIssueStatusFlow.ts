import type { ReviewIssue, ReviewReport } from '@reviewlume/report-parser';
import type { ReportService } from './reportService';
import {
  buildIssueStatusItems,
  buildReportIssueListItem,
  resolveIssueActionLocale,
  type ReportIssueListItem,
  type ReportIssueStatusItem,
} from './reportIssueActions';

export interface ReportIssueStatusFlowUi {
  pickIssue(
    items: readonly ReportIssueListItem[],
    report: ReviewReport,
  ): Promise<ReportIssueListItem | undefined>;
  pickStatus(
    issue: ReviewIssue,
    items: readonly ReportIssueStatusItem[],
  ): Promise<ReportIssueStatusItem | undefined>;
}

export interface RunReportIssueStatusFlowOptions {
  readonly report: ReviewReport;
  readonly reviewDirectory: string;
  readonly reviewId: string;
  readonly responseText: string;
  readonly language: string;
  readonly reportService: Pick<ReportService, 'transitionIssueStatusOnDisk'>;
  readonly ui: ReportIssueStatusFlowUi;
}

export async function runReportIssueStatusFlow(
  options: RunReportIssueStatusFlowOptions,
): Promise<ReviewReport | undefined> {
  const locale = resolveIssueActionLocale(options.language);
  const issueItems = options.report.issues.map((issue) =>
    buildReportIssueListItem(issue, locale),
  );
  if (issueItems.length === 0) return undefined;

  const pickedIssueItem = await options.ui.pickIssue(issueItems, options.report);
  if (!pickedIssueItem) return undefined;

  const issue = options.report.issues.find(
    (candidate) => candidate.issueId === pickedIssueItem.issueId,
  );
  if (!issue) return undefined;

  const statusItems = buildIssueStatusItems(issue, locale);
  if (statusItems.length === 0) return undefined;

  const pickedStatus = await options.ui.pickStatus(issue, statusItems);
  if (!pickedStatus) return undefined;

  return options.reportService.transitionIssueStatusOnDisk(
    options.reviewDirectory,
    options.reviewId,
    issue.issueId,
    pickedStatus.status,
    options.responseText,
  );
}
