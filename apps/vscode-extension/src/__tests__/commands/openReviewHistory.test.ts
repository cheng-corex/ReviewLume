import { describe, it, expect } from 'vitest';

describe('openReviewHistory command module', () => {
  it('should export registerOpenReviewHistory as a function', async () => {
    const mod = await import('../../commands/openReviewHistory');
    expect(typeof mod.registerOpenReviewHistory).toBe('function');
  });
});
