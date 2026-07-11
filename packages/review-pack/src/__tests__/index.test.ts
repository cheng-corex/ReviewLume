import { describe, expect, it } from 'vitest';
import { ReviewPackBuilder, REVIEW_PACK_SCHEMA_VERSION } from '../index.js';

describe('@reviewlume/review-pack', () => {
  it('uses schema version 1', () => {
    expect(REVIEW_PACK_SCHEMA_VERSION).toBe(1);
  });

  it('builds a minimal safe Review Pack', async () => {
    const result = await new ReviewPackBuilder().build({
      repositoryIdentity: '/repo',
      repositoryDisplayName: 'repo',
      reviewMode: 'standard',
      gitBase: 'HEAD',
      gitTarget: 'WORKTREE',
      instructions: 'Review the selected changes.',
      files: [],
      security: {
        scanId: 'scan',
        contentFingerprint: 'fingerprint',
        hardBlockCount: 0,
        blockCount: 0,
        warnCount: 0,
        infoCount: 0,
        confirmedWarnCount: 0,
        hasHardBlock: false,
        hasUnresolvedBlock: false,
        hasUnresolvedWarn: false,
      },
      generatedAt: new Date('2026-07-11T00:00:00Z'),
      reviewId: '20260711T000000Z-010203040506',
    });
    expect(result.markdown).toContain('ReviewLume Review Request');
    expect(result.manifest.schemaVersion).toBe(1);
    expect(result.manifest.output.mainFile).toBe('REVIEW_REQUEST.md');
  });
});
