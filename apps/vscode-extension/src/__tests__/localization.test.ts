import { describe, expect, it } from 'vitest';
import { getReviewPanelStrings, isChineseLanguage } from '../localization';
import { ReviewPanelInboundMessageSchema } from '../webview/reviewPanelMessages';

describe('ReviewLume localization', () => {
  it('uses Chinese for Chinese VS Code locales', () => {
    expect(isChineseLanguage('zh-cn')).toBe(true);
    expect(isChineseLanguage('zh-TW')).toBe(true);
    expect(getReviewPanelStrings('zh-cn').scanSelectedFiles).toBe('扫描所选文件');
  });

  it('uses English for all non-Chinese locales', () => {
    expect(isChineseLanguage('en')).toBe(false);
    expect(isChineseLanguage('ja')).toBe(false);
    expect(getReviewPanelStrings('ja').scanSelectedFiles).toBe('Scan Selected Files');
  });
});

describe('Review Panel export format protocol', () => {
  it.each(['markdown', 'zip', 'both'] as const)('accepts %s', (format) => {
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'setExportFormat',
        format,
      }).success,
    ).toBe(true);
  });

  it('rejects unsupported formats and extra fields', () => {
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'setExportFormat',
        format: 'pdf',
      }).success,
    ).toBe(false);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'setExportFormat',
        format: 'markdown',
        command: 'workbench.action.terminal.new',
      }).success,
    ).toBe(false);
  });
});
