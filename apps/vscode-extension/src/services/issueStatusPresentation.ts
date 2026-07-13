import {
  allowedTransitions,
  type ReviewIssueStatus,
} from '@reviewlume/report-parser';

export interface IssueStatusAction {
  readonly status: ReviewIssueStatus;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

type SupportedLocale = 'en' | 'zh';

const STATUS_PRESENTATION: Readonly<
  Record<
    ReviewIssueStatus,
    {
      readonly icon: string;
      readonly en: { readonly label: string; readonly description: string };
      readonly zh: { readonly label: string; readonly description: string };
    }
  >
> = {
  open: {
    icon: 'circle-outline',
    en: { label: 'Reopen', description: 'Mark this issue as open again' },
    zh: { label: '重新打开', description: '将该问题恢复为待处理状态' },
  },
  fixed: {
    icon: 'pass-filled',
    en: { label: 'Mark Fixed', description: 'Record that the issue has been fixed' },
    zh: { label: '标记为已修复', description: '记录该问题已经完成修复' },
  },
  rejected: {
    icon: 'close',
    en: { label: 'Reject Issue', description: 'Record that the issue is not accepted' },
    zh: { label: '驳回问题', description: '记录该问题不予采纳' },
  },
  'needs-review': {
    icon: 'eye',
    en: { label: 'Needs Review', description: 'Request another verification pass' },
    zh: { label: '需要复核', description: '将该问题标记为需要再次验证' },
  },
};

export function getIssueStatusActions(
  currentStatus: ReviewIssueStatus,
  locale: SupportedLocale,
): readonly IssueStatusAction[] {
  return allowedTransitions(currentStatus).map((status) => {
    const presentation = STATUS_PRESENTATION[status];
    const text = presentation[locale];
    return {
      status,
      label: text.label,
      description: text.description,
      icon: presentation.icon,
    };
  });
}

export function formatIssueStatus(
  status: ReviewIssueStatus,
  locale: SupportedLocale,
): string {
  const labels: Readonly<Record<ReviewIssueStatus, { en: string; zh: string }>> = {
    open: { en: 'Open', zh: '待处理' },
    fixed: { en: 'Fixed', zh: '已修复' },
    rejected: { en: 'Rejected', zh: '已驳回' },
    'needs-review': { en: 'Needs review', zh: '需要复核' },
  };
  return labels[status][locale];
}
