import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpConnectorServer } from './mcpConnectorServer';
import { McpRepositoryTools, type McpGitRunner } from './mcpRepositoryTools';

class FakeRunner implements McpGitRunner {
  async run(options: {
    readonly args: readonly string[];
  }): Promise<{ readonly stdout: string }> {
    if (options.args[0] === 'log') {
      return {
        stdout:
          '0123456789012345678901234567890123456789\tDev\t2026-07-21T00:00:00Z\tTest',
      };
    }
    if (options.args[0] === 'status') return { stdout: '## main\n' };
    if (options.args[0] === 'rev-parse' && options.args.includes('--abbrev-ref')) {
      return { stdout: 'main\n' };
    }
    if (options.args[0] === 'rev-parse') {
      return { stdout: '0123456789012345678901234567890123456789\n' };
    }
    if (options.args[0] === 'remote') throw new Error('No remote');
    if (options.args[0] === 'ls-files') return { stdout: '' };
    if (options.args[0] === 'diff') return { stdout: '' };
    throw new Error(`Unexpected Git call: ${options.args.join(' ')}`);
  }
}

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: http.IncomingHttpHeaders;
}

type AuthenticationMode = 'bearer' | 'tunnel';

describe('McpConnectorServer', () => {
  let root: string;
  let server: McpConnectorServer;
  let endpointUrl: string;
  let bearerToken: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'reviewlume-mcp-server-'));
    const tools = new McpRepositoryTools({
      root,
      displayName: 'fixture',
      runner: new FakeRunner(),
      contentGuard: { hasSensitiveContent: () => false },
    });
    server = new McpConnectorServer({ tools });
    const address = await server.start();
    endpointUrl = address.endpointUrl;
    bearerToken = address.bearerToken;
  });

  afterEach(async () => {
    await server.stop();
    await rm(root, { recursive: true, force: true });
  });

  it('allows the unauthenticated GET reachability probe without advertising OAuth', async () => {
    const result = await requestJson(endpointUrl, 'GET');
    expect(result.status).toBe(405);
    expect(result.headers['www-authenticate']).toBeUndefined();
    expect(result.body).toEqual({
      error: 'This stateless MCP endpoint does not expose SSE.',
    });
  });

  it.each([
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-protected-resource',
  ])('exposes minimal non-OAuth protected resource metadata at %s', async (metadataPath) => {
    const metadataUrl = new URL(metadataPath, endpointUrl);
    const result = await requestJson(metadataUrl.toString(), 'GET');
    expect(result.status).toBe(200);
    expect(result.headers['www-authenticate']).toBeUndefined();
    expect(result.body).toEqual({ resource: endpointUrl });
    expect(result.body).not.toHaveProperty('authorization_servers');
  });

  it('requires the random bearer or dedicated tunnel token for JSON-RPC', async () => {
    const result = await postJson(endpointUrl, undefined, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    });
    expect(result.status).toBe(401);
  });

  it('accepts the dedicated Secure MCP Tunnel header', async () => {
    const result = await postJson(
      endpointUrl,
      bearerToken,
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      'tunnel',
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('negotiates MCP and exposes only read-only repository tools', async () => {
    const initialized = await postJson(endpointUrl, bearerToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { version: '0.1.11' },
      },
    });

    const listed = await postJson(endpointUrl, bearerToken, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const result = listed.body.result as {
      readonly tools: Array<Record<string, unknown>>;
    };
    expect(result.tools.map((tool) => tool.name)).toContain('repository_summary');
    expect(
      result.tools.every((tool) => {
        const annotations = tool.annotations as Record<string, unknown>;
        return annotations.readOnlyHint === true && annotations.destructiveHint === false;
      }),
    ).toBe(true);
  });

  it('lets the model call repository tools after connection', async () => {
    const called = await postJson(endpointUrl, bearerToken, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'recent_commits', arguments: { count: 1 } },
    });
    expect(called.status).toBe(200);
    expect(called.body).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: {
        isError: false,
        structuredContent: {
          repository: 'fixture',
          commits: [{ subject: 'Test' }],
        },
      },
    });
  });
});

async function postJson(
  endpointUrl: string,
  token: string | undefined,
  value: unknown,
  authenticationMode: AuthenticationMode = 'bearer',
): Promise<HttpResult> {
  return requestJson(endpointUrl, 'POST', token, value, authenticationMode);
}

async function requestJson(
  endpointUrl: string,
  method: 'GET' | 'POST',
  token?: string,
  value?: unknown,
  authenticationMode: AuthenticationMode = 'bearer',
): Promise<HttpResult> {
  const target = new URL(endpointUrl);
  const body = value === undefined ? undefined : JSON.stringify(value);
  return new Promise<HttpResult>((resolve, reject) => {
    const tokenHeader = token
      ? authenticationMode === 'tunnel'
        ? { 'X-ReviewLume-Token': token }
        : { Authorization: `Bearer ${token}` }
      : {};
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body, 'utf8'),
              }),
          ...tokenHeader,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode ?? 0,
              body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
              headers: response.headers,
            });
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
