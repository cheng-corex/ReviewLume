import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const MAX_PROMPT_BYTES = 800_000;
export const MAX_CLOCK_SKEW_MS = 30_000;

const REVIEW_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
const HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,256}$/;
const PAIRING_CODE_PATTERN = /^[A-Z0-9]{8}$/;

const timestampSchema = z.string().datetime({ offset: true });
const reviewIdSchema = z.string().regex(REVIEW_ID_PATTERN);
const nonceSchema = z.string().min(16).max(128).regex(TOKEN_PATTERN);
const sessionTokenSchema = z.string().min(24).max(256).regex(TOKEN_PATTERN);
const requestHashSchema = z.string().regex(HEX_64_PATTERN);

const envelopeFields = {
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  nonce: nonceSchema,
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  requestHash: requestHashSchema,
};

export const healthRequestSchema = z.object({
  ...envelopeFields,
  type: z.literal('health'),
}).strict();

export const pairingRequestSchema = z.object({
  ...envelopeFields,
  type: z.literal('pairing'),
  pairingCode: z.string().regex(PAIRING_CODE_PATTERN),
  extensionInstanceId: z.string().uuid(),
}).strict();

export const pairingResponseSchema = z.object({
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal('pairing-result'),
  requestId: z.string().uuid(),
  sessionToken: sessionTokenSchema,
  expiresAt: timestampSchema,
}).strict();

export const promptFillRequestSchema = z.object({
  ...envelopeFields,
  type: z.literal('prompt-fill'),
  sessionToken: sessionTokenSchema,
  extensionInstanceId: z.string().uuid(),
  reviewId: reviewIdSchema,
  targetSite: z.string().min(1).max(128).regex(/^[a-z0-9.-]+$/),
  prompt: z.string().min(1).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= MAX_PROMPT_BYTES,
    'Prompt exceeds maximum byte length.',
  ),
}).strict();

export const revokeRequestSchema = z.object({
  ...envelopeFields,
  type: z.literal('revoke'),
  sessionToken: sessionTokenSchema,
  extensionInstanceId: z.string().uuid(),
}).strict();

export const bridgeRequestSchema = z.discriminatedUnion('type', [
  healthRequestSchema,
  pairingRequestSchema,
  promptFillRequestSchema,
  revokeRequestSchema,
]);

export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type PairingRequest = z.infer<typeof pairingRequestSchema>;
export type PairingResponse = z.infer<typeof pairingResponseSchema>;
export type PromptFillRequest = z.infer<typeof promptFillRequestSchema>;
export type RevokeRequest = z.infer<typeof revokeRequestSchema>;

export class BridgeProtocolError extends Error {
  constructor(
    readonly code:
      | 'INVALID_MESSAGE'
      | 'EXPIRED'
      | 'NOT_YET_VALID'
      | 'HASH_MISMATCH'
      | 'REPLAYED'
      | 'REVIEW_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'BridgeProtocolError';
  }
}

function canonicalPayload(value: BridgeRequest): string {
  const { requestHash: _requestHash, ...unsigned } = value;
  return JSON.stringify(unsigned);
}

export function computeRequestHash(value: Omit<BridgeRequest, 'requestHash'>): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseBridgeRequest(input: unknown): BridgeRequest {
  const parsed = bridgeRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new BridgeProtocolError('INVALID_MESSAGE', 'Bridge message failed schema validation.');
  }
  return parsed.data;
}

export function validateBridgeRequest(
  input: unknown,
  options: {
    now?: number;
    expectedReviewId?: string;
    replayGuard?: ReplayGuard;
  } = {},
): BridgeRequest {
  const request = parseBridgeRequest(input);
  const now = options.now ?? Date.now();
  const issuedAt = Date.parse(request.issuedAt);
  const expiresAt = Date.parse(request.expiresAt);

  if (issuedAt > now + MAX_CLOCK_SKEW_MS) {
    throw new BridgeProtocolError('NOT_YET_VALID', 'Bridge message is not yet valid.');
  }
  if (expiresAt <= now || expiresAt <= issuedAt) {
    throw new BridgeProtocolError('EXPIRED', 'Bridge message has expired.');
  }

  const expectedHash = createHash('sha256').update(canonicalPayload(request), 'utf8').digest('hex');
  if (!equalHash(request.requestHash, expectedHash)) {
    throw new BridgeProtocolError('HASH_MISMATCH', 'Bridge request hash does not match payload.');
  }

  if (
    options.expectedReviewId &&
    request.type === 'prompt-fill' &&
    request.reviewId !== options.expectedReviewId
  ) {
    throw new BridgeProtocolError('REVIEW_MISMATCH', 'Bridge request reviewId mismatch.');
  }

  options.replayGuard?.consume(request.nonce, expiresAt, now);
  return request;
}

export class ReplayGuard {
  readonly #seen = new Map<string, number>();

  consume(nonce: string, expiresAt: number, now = Date.now()): void {
    this.prune(now);
    if (this.#seen.has(nonce)) {
      throw new BridgeProtocolError('REPLAYED', 'Bridge message nonce has already been used.');
    }
    this.#seen.set(nonce, expiresAt);
  }

  prune(now = Date.now()): void {
    for (const [nonce, expiry] of this.#seen) {
      if (expiry <= now) this.#seen.delete(nonce);
    }
  }

  clear(): void {
    this.#seen.clear();
  }

  get size(): number {
    return this.#seen.size;
  }
}
