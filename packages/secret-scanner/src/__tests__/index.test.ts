import { describe, it, expect } from 'vitest';
import { SecretScanner, BUILTIN_EXCLUDE_PATTERNS } from '../index.js';

describe('@reviewlume/secret-scanner', () => {
  it('should have built-in exclude patterns', () => {
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('.env');
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('*.pem');
    expect(BUILTIN_EXCLUDE_PATTERNS).toContain('node_modules/');
  });

  it('should create a SecretScanner', () => {
    const scanner = new SecretScanner();
    expect(scanner).toBeInstanceOf(SecretScanner);
  });

  it('should return empty scan result in P0', async () => {
    const scanner = new SecretScanner();
    const result = await scanner.scan(['test.txt']);
    expect(result.findings).toHaveLength(0);
    expect(result.hasHardBlock).toBe(false);
  });
});
