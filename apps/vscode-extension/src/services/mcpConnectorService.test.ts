import { describe, expect, it, vi } from 'vitest';
import { createSafeToolCallObserver } from './mcpConnectorService';

describe('createSafeToolCallObserver', () => {
  it('forwards the tool name when observability is healthy', () => {
    const observer = vi.fn();
    const safeObserver = createSafeToolCallObserver(observer);

    safeObserver('repository_summary');

    expect(observer).toHaveBeenCalledWith('repository_summary');
  });

  it('does not let a disposed or failing log channel break tools/call', () => {
    const safeObserver = createSafeToolCallObserver(() => {
      throw new Error('OutputChannel has been disposed');
    });

    expect(() => safeObserver('git_status')).not.toThrow();
  });
});
