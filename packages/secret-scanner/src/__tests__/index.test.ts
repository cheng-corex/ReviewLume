import { describe, expect, it } from 'vitest';
import { SecretScanner, BUILTIN_EXCLUDE_PATTERNS } from '../index.js';

describe('@reviewlume/secret-scanner', () => {
  it('exposes built-in sensitive filename patterns', () => {
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('.env');
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('*.pem');
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('node_modules/');
  });

  it('scans repository-relative content instead of accepting raw filesystem paths', () => {
    const scanner = new SecretScanner();
    const result = scanner.scan([{ path: 'test.txt', content: 'plain text' }]);
    expect(result.findings).toHaveLength(0);
    expect(result.hasHardBlock).toBe(false);
    expect(result.canExport).toBe(true);
  });
});
