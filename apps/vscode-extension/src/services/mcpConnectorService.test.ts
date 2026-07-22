import { describe, expect, it, vi } from 'vitest';
import {
  addRepositoryIdentityContext,
  createSafeToolCallObserver,
} from './mcpConnectorService';
import type { McpToolCallResult } from './mcpRepositoryTools';

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

describe('addRepositoryIdentityContext', () => {
  it('distinguishes the ReviewLume connector from the current project name', () => {
    const input: McpToolCallResult = {
      content: [{ type: 'text', text: '{"repository":"NursePrep"}' }],
      structuredContent: {
        repository: 'NursePrep',
        access: 'read-only',
      },
      isError: false,
    };

    const result = addRepositoryIdentityContext(input);

    expect(result.structuredContent).toMatchObject({
      connector: 'ReviewLume',
      repository: 'NursePrep',
      repositoryRole: 'current-connected-project',
    });
    expect(result.content[0].text).toContain(
      'ReviewLume is the connector name. The repository field identifies the current connected project',
    );
    expect(result.content[0].text).not.toContain('not ReviewLume');
  });

  it('does not rewrite tool errors', () => {
    const input: McpToolCallResult = {
      content: [{ type: 'text', text: 'Git is unavailable.' }],
      isError: true,
    };

    expect(addRepositoryIdentityContext(input)).toBe(input);
  });
});
