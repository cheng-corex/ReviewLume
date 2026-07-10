import { describe, it, expect } from 'vitest';
import { ReviewPackBuilder, REVIEW_PACK_SCHEMA_VERSION } from '../index.js';

describe('@reviewlume/review-pack', () => {
  it('should have a schema version', () => {
    expect(REVIEW_PACK_SCHEMA_VERSION).toBe(1);
  });

  it('should create a ReviewPackBuilder', () => {
    const builder = new ReviewPackBuilder();
    expect(builder).toBeInstanceOf(ReviewPackBuilder);
  });

  it('should return placeholder content in P0', async () => {
    const builder = new ReviewPackBuilder();
    const result = await builder.build({ test: true });
    expect(result.markdown).toBe('');
    expect(result.manifest.schemaVersion).toBe(1);
  });
});
