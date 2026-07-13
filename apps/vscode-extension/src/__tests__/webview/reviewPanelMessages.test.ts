import { describe, expect, it } from 'vitest';
import { ReviewPanelInboundMessageSchema } from '../../webview/reviewPanelMessages';

describe('ReviewPanelInboundMessageSchema', () => {
  it('accepts fixed known messages', () => {
    expect(ReviewPanelInboundMessageSchema.safeParse({ type: 'refresh' }).success).toBe(true);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'toggleFile',
        filePath: 'src/app.ts',
        selected: true,
      }).success,
    ).toBe(true);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'setReviewScope',
        scope: 'smart',
      }).success,
    ).toBe(true);
  });

  it('rejects unknown commands, extra fields, invalid paths, and oversized IDs', () => {
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'executeCommand',
        command: 'workbench.action.terminal.new',
      }).success,
    ).toBe(false);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({ type: 'refresh', command: 'anything' }).success,
    ).toBe(false);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'toggleFile',
        filePath: '',
        selected: true,
      }).success,
    ).toBe(false);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'confirmWarning',
        findingIds: Array.from({ length: 101 }, (_, index) => `finding-${index}`),
      }).success,
    ).toBe(false);
    expect(
      ReviewPanelInboundMessageSchema.safeParse({
        type: 'setReviewScope',
        scope: 'full',
        path: '../outside',
      }).success,
    ).toBe(false);
  });
});
