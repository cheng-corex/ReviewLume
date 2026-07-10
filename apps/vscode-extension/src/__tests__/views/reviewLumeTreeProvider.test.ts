import { describe, it, expect } from 'vitest';

// ReviewLumeTreeProvider extends vscode.TreeItem and vscode.TreeDataProvider
// which aren't available in plain vitest.  These tests verify module exports.

describe('reviewLumeTreeProvider module', () => {
  it('should export ReviewLumeTreeItem class', async () => {
    const mod = await import('../../views/reviewLumeTreeProvider');
    expect(mod.ReviewLumeTreeItem).toBeDefined();
    expect(typeof mod.ReviewLumeTreeItem).toBe('function');
  });

  it('should export ReviewLumeTreeProvider class', async () => {
    const mod = await import('../../views/reviewLumeTreeProvider');
    expect(mod.ReviewLumeTreeProvider).toBeDefined();
    expect(typeof mod.ReviewLumeTreeProvider).toBe('function');
  });

  it('should export registerReviewLumeTreeView as a function', async () => {
    const mod = await import('../../views/reviewLumeTreeProvider');
    expect(typeof mod.registerReviewLumeTreeView).toBe('function');
  });
});
