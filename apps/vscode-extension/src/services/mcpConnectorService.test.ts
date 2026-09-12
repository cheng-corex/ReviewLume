import { describe, expect, it, vi } from 'vitest';
import {
  addRepositoryIdentityContext,
  createSafeToolCallObserver,
  StableProjectTools,
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
  it('distinguishes the ReviewLume connector from the current Git Project name', () => {
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
      project: 'NursePrep',
      projectKind: 'git',
      repository: 'NursePrep',
      repositoryRole: 'current-connected-project',
    });
    expect(result.content[0].text).toContain(
      'ReviewLume is the connector name. The repository field identifies the current connected Git Project',
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

describe('StableProjectTools', () => {
  const runner = {
    run: vi.fn(async () => ({ stdout: '' })),
  };

  it('advertises one identical tool contract for Git and Folder projects', () => {
    const gitTools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'repo',
      runner,
      projectKind: 'git',
    });
    const folderTools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'folder',
      runner,
      projectKind: 'folder',
    });

    const expectedNames = [
      'project_summary',
      'list_git_repositories',
      'repository_summary',
      'git_status',
      'recent_commits',
      'get_diff',
      'list_files',
      'read_file',
      'search_code',
      'verification_status',
      'read_verification_output',
    ];

    expect(gitTools.definitions.map((definition) => definition.name)).toEqual(expectedNames);
    expect(folderTools.definitions).toEqual(gitTools.definitions);
  });

  it('reports the stable capability set from Folder project_summary', async () => {
    const tools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'folder',
      runner,
      projectKind: 'folder',
    });

    const result = await tools.call('project_summary', {});

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      project: 'folder',
      projectKind: 'folder',
      nestedGitRepositoriesAvailable: true,
      localVerificationAvailable: false,
      capabilities: tools.definitions.map((definition) => definition.name),
    });
  });

  it('keeps repository selectors optional in the stable public schema', () => {
    const tools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'folder',
      runner,
      projectKind: 'folder',
    });
    const summary = tools.definitions.find((definition) => definition.name === 'repository_summary');

    expect(summary?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        repository: { type: 'string' },
      },
    });
    expect(summary?.inputSchema).not.toHaveProperty('required');
  });

  it('rejects Local Verification calls in Folder mode without invoking a process', async () => {
    const tools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'folder',
      runner,
      projectKind: 'folder',
    });

    const result = await tools.call('verification_status', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available for a Folder Project');
  });

  it('does not require nested repository discovery for a directly connected Git Project', async () => {
    const tools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'repo',
      runner,
      projectKind: 'git',
    });

    const result = await tools.call('list_git_repositories', {});

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      project: 'repo',
      projectKind: 'git',
      repositories: [],
      truncated: false,
    });
  });

  it('rejects a Folder repository selector when the current project is already Git', async () => {
    const tools = new StableProjectTools({
      root: process.cwd(),
      displayName: 'repo',
      runner,
      projectKind: 'git',
    });

    const result = await tools.call('git_status', { repository: 'child' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('only used for Folder Projects');
  });
});
