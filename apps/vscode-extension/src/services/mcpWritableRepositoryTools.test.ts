import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpGitRunner, McpToolCallResult } from './mcpRepositoryTools';
import {
  McpWritableRepositoryTools,
  type McpWriteConfirmationRequest,
  type McpWriteDecision,
} from './mcpWritableRepositoryTools';

class FakeRunner implements McpGitRunner {
  async run(): Promise<{ readonly stdout: string }> {
    return { stdout: '' };
  }
}

function structured<T extends Record<string, unknown>>(result: McpToolCallResult): T {
  if (!result.structuredContent) throw new Error('Expected structured MCP content.');
  return result.structuredContent as T;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createConfirmationMock() {
  return vi.fn(
    async (_request: McpWriteConfirmationRequest): Promise<McpWriteDecision> => ({
      approved: true,
    }),
  );
}

describe('McpWritableRepositoryTools', () => {
  let root: string;
  let confirmWrite: ReturnType<typeof createConfirmationMock>;
  let tools: McpWritableRepositoryTools;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-mcp-write-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'example.ts'), 'export const value = 1;\n');
    confirmWrite = createConfirmationMock();
    tools = new McpWritableRepositoryTools({
      root,
      displayName: 'fixture',
      runner: new FakeRunner(),
      confirmWrite,
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('advertises explicit read-for-edit and confirmed write annotations', () => {
    const read = tools.definitions.find((definition) => definition.name === 'read_file_for_edit');
    const write = tools.definitions.find((definition) => definition.name === 'write_files');

    expect(read?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(write?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it('returns raw editable content with a SHA-256 concurrency token', async () => {
    const result = await tools.call('read_file_for_edit', { path: 'src/example.ts' });

    expect(result.isError).toBe(false);
    expect(structured<{ content: string; sha256: string; byteLength: number }>(result)).toEqual({
      repository: 'fixture',
      path: 'src/example.ts',
      content: 'export const value = 1;\n',
      sha256: digest('export const value = 1;\n'),
      byteLength: Buffer.byteLength('export const value = 1;\n'),
    });
  });

  it('replaces and creates files only after confirmation', async () => {
    const result = await tools.call('write_files', {
      reason: 'Update implementation and add its test fixture.',
      changes: [
        {
          path: 'src/example.ts',
          expectedSha256: digest('export const value = 1;\n'),
          content: 'export const value = 2;\n',
        },
        {
          path: 'src/new.ts',
          expectedSha256: null,
          content: 'export const created = true;\n',
        },
      ],
    });

    expect(result.isError).toBe(false);
    expect(structured<{ applied: boolean }>(result).applied).toBe(true);
    expect(await readFile(path.join(root, 'src', 'example.ts'), 'utf8')).toBe(
      'export const value = 2;\n',
    );
    expect(await readFile(path.join(root, 'src', 'new.ts'), 'utf8')).toBe(
      'export const created = true;\n',
    );
    expect(confirmWrite).toHaveBeenCalledTimes(1);
    expect(confirmWrite.mock.calls[0]?.[0]).toMatchObject({
      repository: 'fixture',
      reason: 'Update implementation and add its test fixture.',
      files: [
        { path: 'src/example.ts', action: 'replace' },
        { path: 'src/new.ts', action: 'create' },
      ],
    });
  });

  it('leaves disk unchanged when the user declines', async () => {
    confirmWrite.mockResolvedValueOnce({ approved: false });
    const result = await tools.call('write_files', {
      changes: [
        {
          path: 'src/example.ts',
          expectedSha256: digest('export const value = 1;\n'),
          content: 'export const value = 3;\n',
        },
      ],
    });

    expect(result.isError).toBe(false);
    expect(structured<{ applied: boolean; declined: boolean }>(result)).toMatchObject({
      applied: false,
      declined: true,
    });
    expect(await readFile(path.join(root, 'src', 'example.ts'), 'utf8')).toBe(
      'export const value = 1;\n',
    );
  });

  it('fails closed before confirmation when the expected hash is stale', async () => {
    const result = await tools.call('write_files', {
      changes: [
        {
          path: 'src/example.ts',
          expectedSha256: '0'.repeat(64),
          content: 'export const value = 4;\n',
        },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('changed since it was read');
    expect(confirmWrite).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, 'src', 'example.ts'), 'utf8')).toBe(
      'export const value = 1;\n',
    );
  });

  it('rejects repository escapes, .git, and duplicate paths', async () => {
    const cases = [
      tools.call('write_files', {
        changes: [{ path: '../outside.ts', expectedSha256: null, content: 'x' }],
      }),
      tools.call('write_files', {
        changes: [{ path: '.git/config', expectedSha256: null, content: 'x' }],
      }),
      tools.call('write_files', {
        changes: [
          { path: 'src/a.ts', expectedSha256: null, content: 'a' },
          { path: 'src/a.ts', expectedSha256: null, content: 'b' },
        ],
      }),
    ];

    const results = await Promise.all(cases);
    expect(results.every((result) => result.isError)).toBe(true);
    expect(confirmWrite).not.toHaveBeenCalled();
  });

  it('rejects symbolic-link writes that escape the repository', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-mcp-outside-'));
    try {
      await symlink(
        outside,
        path.join(root, 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const result = await tools.call('write_files', {
        changes: [
          {
            path: 'linked/escaped.ts',
            expectedSha256: null,
            content: 'export const escaped = true;\n',
          },
        ],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Symbolic links');
      expect(confirmWrite).not.toHaveBeenCalled();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('does not prompt for an exact no-op replacement', async () => {
    const result = await tools.call('write_files', {
      changes: [
        {
          path: 'src/example.ts',
          expectedSha256: digest('export const value = 1;\n'),
          content: 'export const value = 1;\n',
        },
      ],
    });

    expect(result.isError).toBe(false);
    expect(structured<{ noOp: boolean }>(result).noOp).toBe(true);
    expect(confirmWrite).not.toHaveBeenCalled();
  });
});
