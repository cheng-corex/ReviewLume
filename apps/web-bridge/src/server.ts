import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeProtocolError,
  ReplayGuard,
  computeRequestHash,
  pairingRequestSchema,
  promptTakeRequestSchema,
  revokeRequestSchema,
  validateBridgeRequest,
  type PromptFillRequest,
} from '@reviewlume/bridge-protocol';

const LOOPBACK_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 32_000;
const PAIRING_TTL_MS = 2 * 60_000;
const SESSION_TTL_MS = 15 * 60_000;
const PROMPT_TTL_MS = 30_000;

interface PairingRecord {
  readonly expiresAt: number;
  used: boolean;
}

interface SessionRecord {
  readonly extensionInstanceId: string;
  readonly expiresAt: number;
  revoked: boolean;
}

export interface BridgeServerAddress {
  readonly host: typeof LOOPBACK_HOST;
  readonly port: number;
  readonly baseUrl: string;
}

export interface PromptPublishInput {
  readonly reviewId: string;
  readonly targetSite: string;
  readonly prompt: string;
}

export class LocalBridgeServer {
  readonly #pairingCodes = new Map<string, PairingRecord>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #replayGuard = new ReplayGuard();
  readonly #pendingPrompts = new Map<string, PromptFillRequest[]>();
  #server: Server | undefined;
  #address: BridgeServerAddress | undefined;

  async start(): Promise<BridgeServerAddress> {
    if (this.#address) return this.#address;
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, LOOPBACK_HOST, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Bridge server did not receive a TCP address.');
    }
    this.#server = server;
    this.#address = {
      host: LOOPBACK_HOST,
      port: address.port,
      baseUrl: `http://${LOOPBACK_HOST}:${address.port}`,
    };
    return this.#address;
  }

  createPairingCode(now = Date.now()): { code: string; expiresAt: string } {
    this.#prune(now);
    let code: string;
    do {
      code = randomBytes(5).toString('hex').slice(0, 8).toUpperCase();
    } while (this.#pairingCodes.has(code));
    const expiresAt = now + PAIRING_TTL_MS;
    this.#pairingCodes.set(code, { expiresAt, used: false });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  getPairedExtensions(now = Date.now()): readonly string[] {
    this.#prune(now);
    return [...new Set(
      [...this.#sessions.values()]
        .filter((session) => !session.revoked && session.expiresAt > now)
        .map((session) => session.extensionInstanceId),
    )];
  }

  publishPromptForExtension(
    extensionInstanceId: string,
    input: PromptPublishInput,
    now = Date.now(),
  ): PromptFillRequest {
    this.#prune(now);
    const sessionEntry = [...this.#sessions.entries()].find(
      ([, session]) =>
        !session.revoked &&
        session.expiresAt > now &&
        session.extensionInstanceId === extensionInstanceId,
    );
    if (!sessionEntry) {
      throw new BridgeProtocolError('INVALID_MESSAGE', 'No active paired session exists.');
    }
    const [sessionToken] = sessionEntry;
    const unsigned = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: 'prompt-fill' as const,
      requestId: randomUUID(),
      nonce: randomBytes(24).toString('base64url'),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(Math.min(now + PROMPT_TTL_MS, sessionEntry[1].expiresAt)).toISOString(),
      sessionToken,
      extensionInstanceId,
      reviewId: input.reviewId,
      targetSite: input.targetSite,
      prompt: input.prompt,
    };
    const request: PromptFillRequest = {
      ...unsigned,
      requestHash: computeRequestHash(unsigned),
    };
    this.publishPrompt(request, now);
    return request;
  }

  publishPrompt(request: PromptFillRequest, now = Date.now()): void {
    validateBridgeRequest(request, {
      now,
      expectedReviewId: request.reviewId,
      replayGuard: this.#replayGuard,
    });
    this.#requireSession(request.sessionToken, request.extensionInstanceId, now);
    const queue = this.#pendingPrompts.get(request.extensionInstanceId) ?? [];
    queue.push(request);
    this.#pendingPrompts.set(request.extensionInstanceId, queue);
  }

  takePendingPrompt(extensionInstanceId: string): PromptFillRequest | undefined {
    const queue = this.#pendingPrompts.get(extensionInstanceId);
    const next = queue?.shift();
    if (queue && queue.length === 0) this.#pendingPrompts.delete(extensionInstanceId);
    return next;
  }

  revokeAll(): void {
    for (const session of this.#sessions.values()) session.revoked = true;
    this.#pendingPrompts.clear();
    this.#pairingCodes.clear();
    this.#replayGuard.clear();
  }

  async stop(): Promise<void> {
    this.revokeAll();
    const server = this.#server;
    this.#server = undefined;
    this.#address = undefined;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.#isAllowedRequest(request)) {
        this.#json(request, response, 403, { error: 'FORBIDDEN' });
        return;
      }
      if (request.method === 'OPTIONS') {
        this.#empty(request, response, 204);
        return;
      }
      if (request.method === 'GET' && request.url === '/v1/health') {
        this.#json(request, response, 200, { ok: true, protocolVersion: 1 });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/pair') {
        const input = await this.#readJson(request);
        const parsed = pairingRequestSchema.parse(input);
        validateBridgeRequest(parsed, { replayGuard: this.#replayGuard });
        const record = this.#pairingCodes.get(parsed.pairingCode);
        const now = Date.now();
        if (!record || record.used || record.expiresAt <= now) {
          this.#json(request, response, 401, { error: 'PAIRING_REJECTED' });
          return;
        }
        record.used = true;
        const sessionToken = randomBytes(32).toString('base64url');
        const expiresAt = now + SESSION_TTL_MS;
        this.#sessions.set(sessionToken, {
          extensionInstanceId: parsed.extensionInstanceId,
          expiresAt,
          revoked: false,
        });
        this.#json(request, response, 200, {
          protocolVersion: 1,
          type: 'pairing-result',
          requestId: parsed.requestId,
          sessionToken,
          expiresAt: new Date(expiresAt).toISOString(),
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/prompt/take') {
        const input = await this.#readJson(request);
        const parsed = promptTakeRequestSchema.parse(input);
        validateBridgeRequest(parsed, { replayGuard: this.#replayGuard });
        this.#requireSession(parsed.sessionToken, parsed.extensionInstanceId, Date.now());
        const prompt = this.takePendingPrompt(parsed.extensionInstanceId);
        if (!prompt) {
          this.#empty(request, response, 204);
          return;
        }
        this.#json(request, response, 200, prompt);
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/revoke') {
        const input = await this.#readJson(request);
        const parsed = revokeRequestSchema.parse(input);
        validateBridgeRequest(parsed, { replayGuard: this.#replayGuard });
        const session = this.#requireSession(
          parsed.sessionToken,
          parsed.extensionInstanceId,
          Date.now(),
        );
        session.revoked = true;
        this.#pendingPrompts.delete(parsed.extensionInstanceId);
        this.#json(request, response, 200, { ok: true });
        return;
      }
      this.#json(request, response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      this.#json(request, response, 400, {
        error: error instanceof BridgeProtocolError ? error.code : 'INVALID_REQUEST',
      });
    }
  }

  #isAllowedRequest(request: IncomingMessage): boolean {
    const host = request.headers.host;
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) return false;
    const origin = request.headers.origin;
    return !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  }

  async #readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }

  #requireSession(token: string, extensionInstanceId: string, now: number): SessionRecord {
    this.#prune(now);
    const session = this.#sessions.get(token);
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= now ||
      session.extensionInstanceId !== extensionInstanceId
    ) {
      throw new BridgeProtocolError('INVALID_MESSAGE', 'Session is invalid.');
    }
    return session;
  }

  #prune(now: number): void {
    for (const [code, record] of this.#pairingCodes) {
      if (record.expiresAt <= now || record.used) this.#pairingCodes.delete(code);
    }
    for (const [token, session] of this.#sessions) {
      if (session.expiresAt <= now || session.revoked) this.#sessions.delete(token);
    }
    this.#replayGuard.prune(now);
  }

  #headers(request: IncomingMessage): Record<string, string> {
    const headers: Record<string, string> = {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    };
    const origin = request.headers.origin;
    if (origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers.vary = 'Origin';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'content-type';
    }
    return headers;
  }

  #empty(request: IncomingMessage, response: ServerResponse, status: number): void {
    response.writeHead(status, this.#headers(request));
    response.end();
  }

  #json(
    request: IncomingMessage,
    response: ServerResponse,
    status: number,
    payload: unknown,
  ): void {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      ...this.#headers(request),
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body).toString(),
    });
    response.end(body);
  }
}
