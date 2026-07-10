import { describe, it, expect } from 'vitest';

// Command implementations depend on vscode.window.* APIs which are not
// available in plain vitest.  These tests verify the module structure.

describe('createReviewPack command module', () => {
  it('should export registerCreateReviewPack as a function', async () => {
    const mod = await import('../../commands/createReviewPack');
    expect(typeof mod.registerCreateReviewPack).toBe('function');
  });
});
