import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  BridgeProtocolError,
  ReplayGuard,
  pairingRequestSchema,
  revokeRequestSchema,
  validateBridgeRequest,
  type PromptFillRequest,
} from '@reviewlume/bridge-protocol';

const LOOPBACK_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 32_000;
const PAIRING_TTL_MS = 2 * 60_000;
const SESSION_TTL_MS = 15 * 60_000;

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

  publishPrompt(request: PromptFillRequest, now = Date.now()): void {
    validateBridgeRequest(request, {
      now,
      expectedReviewId: request.reviewId,
      replayGuard: this.#replayGuard,
    });
    const session = this.#requireSession(
      request.sessionToken,
      request.extensionInstanceId,
      now,
    );
    if (session.revoked) throw new BridgeProtocolError('INVALID_MESSAGE', 'Session is revoked.');
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
        this.#json(response, 403, { error: 'FORBIDDEN' });
        return;
      }
      if (request.method === 'GET' && request.url === '/v1/health') {
        this.#json(response, 200, { ok: true, protocolVersion: 1 });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/pair') {
        const input = await this.#readJson(request);
        const parsed = pairingRequestSchema.parse(input);
        validateBridgeRequest(parsed, { replayGuard: this.#replayGuard });
        const record = this.#pairingCodes.get(parsed.pairingCode);
        const now = Date.now();
        if (!record || record.used || record.expiresAt <= now) {
          this.#json(response, 401, { error: 'PAIRING_REJECTED' });
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
        this.#json(response, 200, {
          protocolVersion: 1,
          type: 'pairing-result',
          requestId: parsed.requestId,
          sessionToken,
          expiresAt: new Date(expiresAt).toISOString(),
        });
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
        this.#json(response, 200, { ok: true });
        return;
      }
      this.#json(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error instanceof BridgeProtocolError ? 400 : 400;
      this.#json(response, status, {
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

  #json(response: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  }
}
