import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BridgeProtocolError,
  MAX_PROMPT_BYTES,
  ReplayGuard,
  computeRequestHash,
  parseBridgeRequest,
  validateBridgeRequest,
} from './index';

const now = Date.parse('2026-07-18T00:00:00.000Z');

function promptRequest(overrides: Record<string, unknown> = {}) {
  const unsigned = {
    protocolVersion: 1 as const,
    type: 'prompt-fill' as const,
    requestId: randomUUID(),
    nonce: 'nonce_123456789012345678901234',
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    sessionToken: 'session_123456789012345678901234',
    extensionInstanceId: randomUUID(),
    reviewId: '20260718T000000Z-aabbccddeeff',
    targetSite: 'chat.example.com',
    prompt: 'Review this change.',
    ...overrides,
  };
  return { ...unsigned, requestHash: computeRequestHash(unsigned as never) };
}

describe('bridge protocol', () => {
  it('accepts a valid prompt-fill request', () => {
    const request = promptRequest();
    expect(validateBridgeRequest(request, { now })).toMatchObject({
      type: 'prompt-fill',
      reviewId: '20260718T000000Z-aabbccddeeff',
    });
  });

  it('rejects unknown fields through strict schemas', () => {
    expect(() => parseBridgeRequest({ ...promptRequest(), cookie: 'secret' })).toThrow(
      BridgeProtocolError,
    );
  });

  it('rejects expired requests', () => {
    const request = promptRequest({ expiresAt: new Date(now - 1).toISOString() });
    expect(() => validateBridgeRequest(request, { now })).toThrowError(
      expect.objectContaining({ code: 'EXPIRED' }),
    );
  });

  it('rejects payload tampering through request hash verification', () => {
    const request = { ...promptRequest(), prompt: 'Tampered prompt.' };
    expect(() => validateBridgeRequest(request, { now })).toThrowError(
      expect.objectContaining({ code: 'HASH_MISMATCH' }),
    );
  });

  it('rejects replayed nonces', () => {
    const guard = new ReplayGuard();
    const request = promptRequest();
    validateBridgeRequest(request, { now, replayGuard: guard });
    expect(() => validateBridgeRequest(request, { now, replayGuard: guard })).toThrowError(
      expect.objectContaining({ code: 'REPLAYED' }),
    );
  });

  it('rejects cross-review requests', () => {
    expect(() =>
      validateBridgeRequest(promptRequest(), {
        now,
        expectedReviewId: '20260718T000001Z-112233445566',
      }),
    ).toThrowError(expect.objectContaining({ code: 'REVIEW_MISMATCH' }));
  });

  it('enforces the prompt byte limit', () => {
    const request = promptRequest({ prompt: 'a'.repeat(MAX_PROMPT_BYTES + 1) });
    expect(() => parseBridgeRequest(request)).toThrowError(
      expect.objectContaining({ code: 'INVALID_MESSAGE' }),
    );
  });

  it('allows an expired nonce to be pruned and reused only after its request lifetime', () => {
    const guard = new ReplayGuard();
    guard.consume('nonce_123456789012345678901234', now + 1, now);
    guard.prune(now + 2);
    expect(guard.size).toBe(0);
  });
});
