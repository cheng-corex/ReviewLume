import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { computeRequestHash, type PairingRequest } from '@reviewlume/bridge-protocol';
import { LocalBridgeServer } from './server.js';

const servers: LocalBridgeServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

function signedPairingRequest(
  code: string,
  extensionInstanceId: string = randomUUID(),
): PairingRequest {
  const unsigned = {
    protocolVersion: 1 as const,
    type: 'pairing' as const,
    requestId: randomUUID(),
    nonce: `nonce_${randomUUID().replaceAll('-', '')}`,
    issuedAt: new Date(Date.now() - 100).toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    pairingCode: code,
    extensionInstanceId,
  };
  return { ...unsigned, requestHash: computeRequestHash(unsigned as never) };
}

function requestStatus(
  url: string,
  headers: Record<string, string>,
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    request.end();
  });
}

describe('LocalBridgeServer', () => {
  it('binds only to IPv4 loopback on a random port', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();
    expect(address.host).toBe('127.0.0.1');
    expect(address.port).toBeGreaterThan(0);
    expect(address.baseUrl).toBe(`http://127.0.0.1:${address.port}`);
  });

  it('returns controlled JSON health responses without caching', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();
    const response = await fetch(`${address.baseUrl}/v1/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, protocolVersion: 1 });
  });

  it('serves a fragment-only handoff page without exposing the pairing code', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();
    const pairing = server.createPairingCode();

    const response = await fetch(
      `${address.baseUrl}/connect#v=1&code=${pairing.code}&site=chatgpt.com`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    const body = await response.text();
    expect(body).toContain('id="status"');
    expect(body).not.toContain(pairing.code);

    const queryAttempt = await fetch(`${address.baseUrl}/connect?code=${pairing.code}`);
    expect(queryAttempt.status).toBe(404);
    await expect(queryAttempt.json()).resolves.toEqual({ error: 'NOT_FOUND' });
  });

  it('issues one-time pairing codes and rejects replay', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();
    const pairing = server.createPairingCode();
    const request = signedPairingRequest(pairing.code);

    const first = await fetch(`${address.baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(200);
    const result = (await first.json()) as { sessionToken: string };
    expect(result.sessionToken.length).toBeGreaterThanOrEqual(24);

    const replay = await fetch(`${address.baseUrl}/v1/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...signedPairingRequest(pairing.code, request.extensionInstanceId),
      }),
    });
    expect(replay.status).toBe(401);
    await expect(replay.json()).resolves.toEqual({ error: 'PAIRING_REJECTED' });
  });

  it('rejects non-extension origins and hostile Host headers', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();

    const badOrigin = await fetch(`${address.baseUrl}/v1/health`, {
      headers: { origin: 'https://example.com' },
    });
    expect(badOrigin.status).toBe(403);

    const badHostStatus = await requestStatus(`${address.baseUrl}/v1/health`, {
      host: 'localhost:9999',
    });
    expect(badHostStatus).toBe(403);
  });

  it('returns controlled JSON for malformed and oversized bodies', async () => {
    const server = new LocalBridgeServer();
    servers.push(server);
    const address = await server.start();

    const malformed = await fetch(`${address.baseUrl}/v1/pair`, {
      method: 'POST',
      body: '{',
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'INVALID_REQUEST' });

    const oversized = await fetch(`${address.baseUrl}/v1/pair`, {
      method: 'POST',
      body: 'x'.repeat(33_000),
    });
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual({ error: 'INVALID_REQUEST' });
  });
});
