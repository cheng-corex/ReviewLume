/**
 * @reviewlume/secret-scanner
 *
 * Secret and sensitive content scanner for ReviewLume.
 * Scans files for credentials, keys, tokens, and other sensitive data.
 */

export type { SecretLevel, ScanFinding, ScanResult } from '@reviewlume/core';

/** Built-in file exclusion patterns. */
export const BUILTIN_EXCLUDE_PATTERNS: string[] = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.pfx',
  '*.p12',
  '*.keystore',
  'id_rsa*',
  'credentials*',
  'secrets*',
  '*.sqlite',
  '*.sqlite3',
  '*.db',
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '_appdata/',
  '_db/',
];

/** Service for scanning files and content for secrets. */
export class SecretScanner {
  /**
   * Scan the given file paths for secrets.
   * P0: Returns an empty result until the full implementation.
   */
  async scan(_files: string[]): Promise<{ findings: never[]; hardBlockCount: number; blockCount: number; warnCount: number; infoCount: number; hasHardBlock: boolean; hasUnresolvedBlock: boolean; hasUnresolvedWarn: boolean }> {
    // TODO: P4 — implement full secret scanning logic
    return {
      findings: [],
      hardBlockCount: 0,
      blockCount: 0,
      warnCount: 0,
      infoCount: 0,
      hasHardBlock: false,
      hasUnresolvedBlock: false,
      hasUnresolvedWarn: false,
    };
  }
}
