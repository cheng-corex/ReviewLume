import { describe, expect, it } from 'vitest';
import {
  formatIssueStatus,
  getIssueStatusActions,
} from '../../services/issueStatusPresentation';

describe('issue status presentation', () => {
  it('only exposes valid transitions from open', () => {
    expect(getIssueStatusActions('open', 'en').map((action) => action.status)).toEqual([
      'fixed',
      'rejected',
      'needs-review',
    ]);
  });

  it('does not expose direct fixed to rejected transition', () => {
    expect(getIssueStatusActions('fixed', 'en').map((action) => action.status)).toEqual([
      'open',
      'needs-review',
    ]);
  });

  it('provides localized labels without changing status identifiers', () => {
    const actions = getIssueStatusActions('open', 'zh');
    expect(actions[0]).toMatchObject({
      status: 'fixed',
      label: '标记为已修复',
      icon: 'pass-filled',
    });
    expect(formatIssueStatus('needs-review', 'zh')).toBe('需要复核');
    expect(formatIssueStatus('needs-review', 'en')).toBe('Needs review');
  });
});
