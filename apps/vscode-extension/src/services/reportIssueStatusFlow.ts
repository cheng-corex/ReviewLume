import type { ReviewIssue, ReviewReport } from '@reviewlume/report-parser';
import type { ReportService } from './reportService';
import {
  buildIssueStatusItems,
  resolveIssueActionLocale,
  type ReportIssueStatusItem,
} from './reportIssueActions';
import {
  buildReportDashboardView,
  filterForDashboardPreset,
  type ReportDashboardPickerItem,
} from './reportDashboardPresentation';
import type { ReportDashboardFilter } from './reportDashboardModel';

export interface ReportIssueStatusFlowUi {
  pickIssue(
    items: readonly ReportDashboardPickerItem[],
    report: ReviewReport,
    summary: string,
    filterDescription: string,
    visibleCount: number,
  ): PromiseLike<ReportDashboardPickerItem | undefined>;
  pickStatus(
    issue: ReviewIssue,
    items: readonly ReportIssueStatusItem[],
  ): PromiseLike<ReportIssueStatusItem | undefined>;
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
  let filter: ReportDashboardFilter = {};
  let keepPicking = true;

  while (keepPicking) {
    const dashboard = buildReportDashboardView(options.report, filter, locale);
    const pickerItems: readonly ReportDashboardPickerItem[] = [
      ...dashboard.filters,
      ...dashboard.issues,
    ];
    if (dashboard.totalCount === 0) return undefined;

    const pickedItem = await options.ui.pickIssue(
      pickerItems,
      options.report,
      dashboard.summary,
      dashboard.filterDescription,
      dashboard.visibleCount,
    );
    if (!pickedItem) return undefined;

    if (pickedItem.itemType === 'filter') {
      filter = filterForDashboardPreset(pickedItem.preset);
      continue;
    }

    const issue = options.report.issues.find(
      (candidate) => candidate.issueId === pickedItem.issueId,
    );
    if (!issue) return undefined;

    const statusItems = buildIssueStatusItems(issue, locale);
    if (statusItems.length === 0) return undefined;

    const pickedStatus = await options.ui.pickStatus(issue, statusItems);
    if (!pickedStatus) return undefined;

    keepPicking = false;
    return options.reportService.transitionIssueStatusOnDisk(
      options.reviewDirectory,
      options.reviewId,
      issue.issueId,
      pickedStatus.status,
      options.responseText,
    );
  }

  return undefined;
}
