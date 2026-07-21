import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { McpConnectorServer } from './mcpConnectorServer';
import type { McpGitRunner } from './mcpRepositoryTools';
import { McpWritableRepositoryTools } from './mcpWritableRepositoryTools';

class FakeRunner implements McpGitRunner {
  async run(): Promise<{ readonly stdout: string }> {
    return { stdout: '' };
  }
}

describe('McpConnectorServer confirmed-write mode', () => {
  it('truthfully advertises confirmed writes and their annotations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-mcp-server-write-'));
    const tools = new McpWritableRepositoryTools({
      root,
      displayName: 'fixture',
      runner: new FakeRunner(),
      confirmWrite: async () => ({ approved: false }),
    });
    const server = new McpConnectorServer({ tools });

    try {
      const address = await server.start();
      const initialized = await postJson(address.endpointUrl, address.bearerToken, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      expect(initialized).toMatchObject({
        result: {
          serverInfo: {
            name: 'reviewlume-confirmed-write-repository',
            title: 'ReviewLume Confirmed-write Repository',
            version: '0.1.17',
          },
        },
      });
      expect(
        ((initialized.result as { instructions: string }).instructions),
      ).toContain('explicit VS Code confirmation');

      const listed = await postJson(address.endpointUrl, address.bearerToken, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });
      const definitions = (listed.result as { tools: Array<Record<string, unknown>> }).tools;
      const write = definitions.find((definition) => definition.name === 'write_files');
      expect(write?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    } finally {
      await server.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function postJson(
  endpointUrl: string,
  token: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const target = new URL(endpointUrl);
  const body = JSON.stringify(value);
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
          Authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once('error', reject);
    request.end(body);
  });
}
