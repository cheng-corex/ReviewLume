import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  CURRENT_SCHEMA_VERSION,
  REVIEW_REQUEST_FILENAME,
  CONFIG_NAMESPACE,
} from '../index.js';

describe('@reviewlume/core', () => {
  it('should have a default config', () => {
    expect(DEFAULT_CONFIG.mode).toBe('standard');
    expect(DEFAULT_CONFIG.language).toBe('en');
    expect(DEFAULT_CONFIG.maxPackSizeKb).toBe(1024);
  });

  it('should have a current schema version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it('should have a review request filename', () => {
    expect(REVIEW_REQUEST_FILENAME).toBe('REVIEW_REQUEST.md');
  });

  it('should have a config namespace', () => {
    expect(CONFIG_NAMESPACE).toBe('reviewlume');
  });
});
