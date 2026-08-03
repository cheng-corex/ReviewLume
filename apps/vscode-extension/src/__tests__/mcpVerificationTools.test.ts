import { describe, expect, it } from 'vitest';
import {
  RepositoryIdentityTools,
  VERIFICATION_TOOL_DEFINITIONS,
} from '../services/mcpConnectorService';
import type { VerificationResultReader } from '../services/localVerificationService';
import type { McpGitRunner } from '../services/mcpRepositoryTools';

const runner: McpGitRunner = {
  async run(): Promise<{ readonly stdout: string }> {
    return { stdout: '' };
  },
};

const verification: VerificationResultReader = {
  async getVerificationStatus() {
    return {
      configured: true,
      mcpCanStartProcesses: false,
      status: 'passed',
      steps: [{ id: 'mocha-changed', status: 'passed' }],
    };
  },
  async readVerificationOutput() {
    return {
      status: 'passed',
      stale: false,
      mcpCanStartProcesses: false,
      stepId: 'mocha-changed',
      content: '1: 24 passing',
    };
  },
};

describe('MCP local verification evidence', () => {
  it('adds two read-only evidence tools without exposing process execution', async () => {
    const tools = new RepositoryIdentityTools({
      root: process.cwd(),
      displayName: 'fixture',
      runner,
      verification,
    });

    expect(VERIFICATION_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      'verification_status',
      'read_verification_output',
    ]);
    expect(tools.definitions).toHaveLength(9);
    for (const definition of VERIFICATION_TOOL_DEFINITIONS) {
      expect(definition.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(definition.description).toContain('cannot start');
    }

    const status = await tools.call('verification_status', {});
    expect(status.isError).toBe(false);
    expect(status.structuredContent).toMatchObject({
      configured: true,
      mcpCanStartProcesses: false,
      status: 'passed',
    });

    const output = await tools.call('read_verification_output', { stepId: 'mocha-changed' });
    expect(output.isError).toBe(false);
    expect(output.structuredContent).toMatchObject({
      stepId: 'mocha-changed',
      content: '1: 24 passing',
    });
  });
});
