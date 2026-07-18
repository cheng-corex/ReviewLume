import { randomUUID } from 'node:crypto';
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

    const badHost = await fetch(`${address.baseUrl}/v1/health`, {
      headers: { host: 'localhost:9999' },
    });
    expect(badHost.status).toBe(403);
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
