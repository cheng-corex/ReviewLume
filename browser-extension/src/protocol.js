const PROTOCOL_VERSION = 1;
const REQUEST_TTL_MS = 30_000;

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function createRequest(type, fields = {}) {
  const issuedAt = new Date();
  const unsigned = {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: crypto.randomUUID(),
    nonce: randomToken(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + REQUEST_TTL_MS).toISOString(),
    ...fields,
  };
  return {
    ...unsigned,
    requestHash: await sha256Hex(stableStringify(unsigned)),
  };
}

export function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password) {
    throw new Error('桥接地址必须是 http://127.0.0.1:<随机端口>。');
  }
  if (!parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('桥接地址格式无效。');
  }
  return parsed.origin;
}

export function assertPairingCode(value) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) throw new Error('配对码必须是 8 位大写字母或数字。');
  return normalized;
}
