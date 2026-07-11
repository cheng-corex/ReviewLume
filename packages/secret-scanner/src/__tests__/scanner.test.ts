import { describe, expect, it } from 'vitest';
import { SecretScanner, SecretScanPolicyError, redactSecret } from '../index.js';

describe('SecretScanner', () => {
  const scanner = new SecretScanner();

  it('detects filename, private key, token, connection string, JWT and internal address rules', () => {
    const result = scanner.scan([
      { path: '.env.production', content: 'API_KEY=abcdefghijklmnop\n' },
      { path: 'keys/server.pem', content: '-----BEGIN PRIVATE KEY-----\nabc\n' },
      { path: 'src/config.ts', content: 'const url="postgres://user:pass@example/db";\nconst jwt="eyJabcdefgh.abcdefgh.abcdefgh";\nconst ip="192.168.1.20";' },
    ], new Date('2026-07-11T00:00:00.000Z'));
    expect(result.findings.map((item) => item.rule)).toEqual(expect.arrayContaining([
      'environment-file', 'private-key-file', 'private-key', 'generic-secret', 'database-url', 'jwt', 'internal-address',
    ]));
    expect(result.hasHardBlock).toBe(true);
    expect(result.canExport).toBe(false);
    expect(JSON.stringify(result)).not.toContain('abcdefghijklmnop');
    expect(JSON.stringify(result)).not.toContain('postgres://user:pass@example/db');
  });

  it('redacts every secret present on the preview line', () => {
    const first = 'abcdefghijklmnop';
    const second = 'qrstuvwxyzABCDEF';
    const result = scanner.scan([{ path: 'src/config.ts', content: `apiKey=${first}; password=${second}` }]);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    for (const finding of result.findings) {
      expect(finding.preview).not.toContain(first);
      expect(finding.preview).not.toContain(second);
    }
    expect(JSON.stringify(result)).not.toContain(first);
    expect(JSON.stringify(result)).not.toContain(second);
  });

  it('permits only WARN confirmation; BLOCK and HARD_BLOCK require a fresh scan', () => {
    const hard = scanner.scan([{ path: 'private.key', content: '-----BEGIN PRIVATE KEY-----' }]);
    expect(() => scanner.resolve(hard, [{ findingId: hard.findings[0].id, action: 'confirm' }])).toThrow(SecretScanPolicyError);
    const block = scanner.scan([{ path: 'src/a.ts', content: 'apiKey=abcdefghijklmnop' }]);
    const finding = block.findings.find((item) => item.level === 'BLOCK')!;
    expect(() => scanner.resolve(block, [{ findingId: finding.id, action: 'confirm' }])).toThrow(/fresh scan/i);
  });

  it('allows export only after WARN confirmation and detects stale scans', () => {
    const result = scanner.scan([{ path: 'src/a.ts', content: 'value=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' }]);
    const warn = result.findings.find((item) => item.level === 'WARN')!;
    expect(() => scanner.assertExportAllowed(result)).toThrow(/WARN/);
    const resolved = scanner.resolve(result, [{ findingId: warn.id, action: 'confirm', at: '2026-07-11T00:00:00Z' }]);
    expect(resolved.canExport).toBe(true);
    expect(() => scanner.assertExportAllowed(resolved)).not.toThrow();
    expect(() => scanner.assertExportAllowed(resolved, 'different')).toThrow(/changed after scanning/i);
  });

  it('requires repository-relative paths while preserving legal POSIX backslashes', () => {
    expect(() => scanner.scan([{ path: '../outside.txt', content: 'x' }])).toThrow(/repository-relative/);
    expect(() => scanner.scan([{ path: '/absolute.txt', content: 'x' }])).toThrow(/repository-relative/);
    const result = scanner.scan([{ path: 'src/name\\with-backslash.ts', content: 'plain' }]);
    expect(result.findings).toHaveLength(0);
  });

  it('redacts without returning the original value', () => {
    const value = 'super-secret-token-value';
    const preview = redactSecret(value);
    expect(preview).not.toContain(value);
    expect(preview).toContain('[REDACTED:');
  });
});
