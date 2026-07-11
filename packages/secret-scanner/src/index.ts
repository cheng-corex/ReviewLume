import { createHash } from 'node:crypto';
import type { SecretLevel } from '@reviewlume/core';

export type { SecretLevel } from '@reviewlume/core';

export const BUILTIN_EXCLUDE_PATTERNS: readonly string[] = [
  '.env', '.env.*', '*.pem', '*.key', '*.pfx', '*.p12', '*.keystore',
  'id_rsa*', 'credentials*', 'secrets*', '*.sqlite', '*.sqlite3', '*.db',
  '.git/', 'node_modules/', 'dist/', 'build/', 'coverage/', '_appdata/', '_db/',
];

export type FindingResolution =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'excluded'; readonly at: string }
  | { readonly kind: 'redacted'; readonly at: string }
  | { readonly kind: 'confirmed'; readonly at: string };

export interface ScanInputFile {
  readonly path: string;
  readonly content: string;
}

export interface ScanFinding {
  readonly id: string;
  readonly level: SecretLevel;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly message: string;
  readonly preview: string;
  readonly fingerprint: string;
  readonly resolution: FindingResolution;
}

export interface ScanResult {
  readonly scanId: string;
  readonly contentFingerprint: string;
  readonly createdAt: string;
  readonly findings: readonly ScanFinding[];
  readonly hardBlockCount: number;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly confirmedWarnCount: number;
  readonly hasHardBlock: boolean;
  readonly hasUnresolvedBlock: boolean;
  readonly hasUnresolvedWarn: boolean;
  readonly canExport: boolean;
}

export interface ScanResolutionInput {
  readonly findingId: string;
  readonly action: 'exclude' | 'redact' | 'confirm';
  readonly at?: string;
}

export class SecretScanPolicyError extends Error {
  readonly code = 'SECRET_SCAN_POLICY' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SecretScanPolicyError';
  }
}

interface Rule {
  readonly id: string;
  readonly level: SecretLevel;
  readonly pattern: RegExp;
  readonly message: string;
  readonly valueGroup?: number;
}

const CONTENT_RULES: readonly Rule[] = [
  { id: 'private-key', level: 'HARD_BLOCK', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, message: 'Private key material detected.' },
  { id: 'authorization', level: 'HARD_BLOCK', pattern: /\b(?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+([^\s"']+)/gi, valueGroup: 1, message: 'Complete authorization credential detected.' },
  { id: 'cookie-session', level: 'HARD_BLOCK', pattern: /\b(?:cookie|set-cookie|session(?:id|_id|token)?)\s*[:=]\s*([^\r\n;]{12,})/gi, valueGroup: 1, message: 'Session credential detected.' },
  { id: 'github-token', level: 'BLOCK', pattern: /\b((?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}))\b/g, valueGroup: 1, message: 'GitHub token detected.' },
  { id: 'aws-access-key', level: 'BLOCK', pattern: /\b((?:AKIA|ASIA)[A-Z0-9]{16})\b/g, valueGroup: 1, message: 'AWS access key detected.' },
  { id: 'generic-secret', level: 'BLOCK', pattern: /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret)\s*[:=]\s*["']?([^\s"',;]{12,})/gi, valueGroup: 1, message: 'Likely credential value detected.' },
  { id: 'database-url', level: 'BLOCK', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"']+/gi, message: 'Database or service connection string detected.' },
  { id: 'jwt', level: 'WARN', pattern: /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, valueGroup: 1, message: 'JWT-like value detected.' },
  { id: 'high-entropy-assignment', level: 'WARN', pattern: /\b[A-Za-z][A-Za-z0-9_.-]{2,}\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{32,})/g, valueGroup: 1, message: 'High-entropy assigned value detected.' },
  { id: 'internal-address', level: 'INFO', pattern: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g, message: 'Private network address detected.' },
];

const FILE_RULES: ReadonlyArray<{ id: string; level: SecretLevel; pattern: RegExp; message: string }> = [
  { id: 'private-key-file', level: 'HARD_BLOCK', pattern: /(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|key|pfx|p12|keystore))$/i, message: 'Private key or certificate container filename detected.' },
  { id: 'environment-file', level: 'BLOCK', pattern: /(?:^|\/)\.env(?:\..+)?$/i, message: 'Environment file detected.' },
  { id: 'credential-file', level: 'BLOCK', pattern: /(?:^|\/)(?:credentials?|secrets?)(?:\.[^/]*)?$/i, message: 'Credential-bearing filename detected.' },
  { id: 'database-file', level: 'BLOCK', pattern: /\.(?:sqlite3?|db)$/i, message: 'Database file detected.' },
];

export function redactSecret(value: string): string {
  if (value.length <= 4) return '[REDACTED]';
  const start = value.slice(0, 2);
  const end = value.slice(-2);
  return `${start}…${end} [REDACTED:${value.length}]`;
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').some((part) => part === '..')) {
    throw new SecretScanPolicyError('Scan paths must be repository-relative and cannot escape the repository.');
  }
  return normalized;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function location(content: string, index: number): { line: number; column: number; lineText: string } {
  const before = content.slice(0, index);
  const line = before.split('\n').length;
  const lineStart = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const lineEnd = content.indexOf('\n', index);
  return {
    line,
    column: index - lineStart + 1,
    lineText: content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd),
  };
}

function finding(params: Omit<ScanFinding, 'id' | 'fingerprint' | 'resolution'> & { rawValue: string }): ScanFinding {
  const fingerprint = digest(`${params.file}\0${params.rule}\0${params.line}\0${params.rawValue}`);
  return {
    id: fingerprint.slice(0, 24),
    fingerprint,
    level: params.level,
    file: params.file,
    line: params.line,
    column: params.column,
    rule: params.rule,
    message: params.message,
    preview: params.preview,
    resolution: { kind: 'unresolved' },
  };
}

function summarize(findings: readonly ScanFinding[], contentFingerprint: string, createdAt: string): ScanResult {
  const hardBlockCount = findings.filter((item) => item.level === 'HARD_BLOCK').length;
  const blockCount = findings.filter((item) => item.level === 'BLOCK').length;
  const warnCount = findings.filter((item) => item.level === 'WARN').length;
  const infoCount = findings.filter((item) => item.level === 'INFO').length;
  const confirmedWarnCount = findings.filter((item) => item.level === 'WARN' && item.resolution.kind === 'confirmed').length;
  const hasUnresolvedBlock = findings.some((item) => item.level === 'BLOCK' && item.resolution.kind === 'unresolved');
  const hasUnresolvedWarn = findings.some((item) => item.level === 'WARN' && item.resolution.kind !== 'confirmed' && item.resolution.kind !== 'excluded' && item.resolution.kind !== 'redacted');
  return {
    scanId: digest(`${contentFingerprint}\0${createdAt}`).slice(0, 24),
    contentFingerprint,
    createdAt,
    findings,
    hardBlockCount,
    blockCount,
    warnCount,
    infoCount,
    confirmedWarnCount,
    hasHardBlock: hardBlockCount > 0,
    hasUnresolvedBlock,
    hasUnresolvedWarn,
    canExport: hardBlockCount === 0 && !hasUnresolvedBlock && !hasUnresolvedWarn,
  };
}

export class SecretScanner {
  scan(files: readonly ScanInputFile[], now = new Date()): ScanResult {
    const normalizedFiles = files.map((file) => ({ path: normalizePath(file.path), content: file.content }));
    const contentFingerprint = digest(normalizedFiles
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => `${file.path}\0${digest(file.content)}`)
      .join('\0'));
    const findings: ScanFinding[] = [];

    for (const file of normalizedFiles) {
      for (const rule of FILE_RULES) {
        if (!rule.pattern.test(file.path)) continue;
        findings.push(finding({
          level: rule.level, file: file.path, line: 1, column: 1, rule: rule.id,
          message: rule.message, preview: `[SENSITIVE FILE: ${file.path.split('/').pop() ?? 'file'}]`, rawValue: file.path,
        }));
      }

      for (const rule of CONTENT_RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of file.content.matchAll(rule.pattern)) {
          const index = match.index ?? 0;
          const rawValue = match[rule.valueGroup ?? 0] ?? match[0];
          const at = location(file.content, index);
          const safeLine = at.lineText.replace(rawValue, redactSecret(rawValue)).slice(0, 240);
          findings.push(finding({
            level: rule.level, file: file.path, line: at.line, column: at.column,
            rule: rule.id, message: rule.message, preview: safeLine, rawValue,
          }));
        }
      }
    }

    return summarize(findings, contentFingerprint, now.toISOString());
  }

  resolve(result: ScanResult, resolutions: readonly ScanResolutionInput[]): ScanResult {
    const byId = new Map(resolutions.map((item) => [item.findingId, item]));
    const findings = result.findings.map((item): ScanFinding => {
      const requested = byId.get(item.id);
      if (!requested) return item;
      if (item.level === 'HARD_BLOCK') {
        throw new SecretScanPolicyError('HARD_BLOCK findings cannot be overridden, confirmed, excluded, or redacted in-place. Remove the file or secret and rescan.');
      }
      if (item.level === 'BLOCK' && requested.action === 'confirm') {
        throw new SecretScanPolicyError('BLOCK findings cannot be confirmed. Exclude or redact the content, then rescan.');
      }
      if (item.level !== 'WARN' && requested.action === 'confirm') {
        throw new SecretScanPolicyError('Only WARN findings can be explicitly confirmed.');
      }
      const kind = requested.action === 'exclude' ? 'excluded' : requested.action === 'redact' ? 'redacted' : 'confirmed';
      return { ...item, resolution: { kind, at: requested.at ?? new Date().toISOString() } };
    });
    return summarize(findings, result.contentFingerprint, result.createdAt);
  }

  assertExportAllowed(result: ScanResult, currentContentFingerprint?: string): void {
    if (currentContentFingerprint && currentContentFingerprint !== result.contentFingerprint) {
      throw new SecretScanPolicyError('Selected content changed after scanning. Run the sensitive-content scan again.');
    }
    if (result.hasHardBlock) throw new SecretScanPolicyError('Export is blocked by a HARD_BLOCK finding.');
    if (result.hasUnresolvedBlock) throw new SecretScanPolicyError('Export is blocked by an unresolved BLOCK finding.');
    if (result.hasUnresolvedWarn) throw new SecretScanPolicyError('Export is blocked until every WARN finding is confirmed, excluded, or redacted.');
  }
}
