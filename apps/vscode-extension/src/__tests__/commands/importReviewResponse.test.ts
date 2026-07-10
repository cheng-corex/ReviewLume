import { describe, it, expect } from 'vitest';

describe('importReviewResponse command module', () => {
  it('should export registerImportReviewResponse as a function', async () => {
    const mod = await import('../../commands/importReviewResponse');
    expect(typeof mod.registerImportReviewResponse).toBe('function');
  });
});
