import { describe, expect, it } from 'vitest';
import {
  ReviewPackBuilder,
  ReviewPackPolicyError,
  createReviewId,
  createUniqueReviewId,
  createWorkspaceId,
  normalizeRepositoryIdentity,
} from '../index.js';

const safeSecurity = {
  scanId: 'scan-1',
  contentFingerprint: 'fingerprint',
  hardBlockCount: 0,
  blockCount: 0,
  warnCount: 1,
  infoCount: 0,
  confirmedWarnCount: 1,
  hasHardBlock: false,
  hasUnresolvedBlock: false,
  hasUnresolvedWarn: false,
};

describe('review pack identifiers', () => {
  it('normalizes credential-bearing remotes before hashing', () => {
    expect(normalizeRepositoryIdentity('https://user:secret@GitHub.com/Owner/Repo.git/'))
      .toBe('https://github.com/Owner/Repo');
    expect(createWorkspaceId('https://user:secret@GitHub.com/Owner/Repo.git/'))
      .toBe(createWorkspaceId('https://github.com/Owner/Repo'));
  });

  it('creates schema-v1 review IDs and retries collisions', async () => {
    const random = () => Uint8Array.from([1, 2, 3, 4, 5, 6]);
    expect(createReviewId(new Date('2026-07-11T01:02:03Z'), random))
      .toBe('20260711T010203Z-010203040506');

    let calls = 0;
    const unique = await createUniqueReviewId(async () => calls++ === 0, new Date('2026-07-11T01:02:03Z'), (size) => {
      expect(size).toBe(6);
      return Uint8Array.from([calls, 2, 3, 4, 5, 6]);
    });
    expect(unique).toMatch(/^20260711T010203Z-[0-9a-f]{12}$/);
  });
});

describe('ReviewPackBuilder', () => {
  it('builds schema v1 markdown, a privacy-safe manifest and a ZIP', async () => {
    const result = await new ReviewPackBuilder().build({
      repositoryIdentity: 'https://user:secret@github.com/cheng-corex/ReviewLume.git',
      repositoryDisplayName: 'ReviewLume',
      reviewMode: 'standard',
      gitBase: 'abc',
      gitTarget: 'def',
      security: safeSecurity,
      instructions: 'Review correctness and security.',
      requirements: 'Must remain read-only.',
      implementationReport: 'Implemented P4 and P5.',
      diff: '+safe change',
      files: [{ path: 'src/app.ts', content: 'export const ok = true;', source: 'changed' }],
      excluded: [{ path: 'src/ignored.ts', reason: 'user excluded' }],
      generatedAt: new Date('2026-07-11T01:02:03Z'),
      reviewId: '20260711T010203Z-010203040506',
    });

    expect(result.markdown).toContain('schemaVersion: 1');
    expect(result.markdown).toContain('## File: src/app.ts');
    expect(result.manifest.output.mainFile).toBe('REVIEW_REQUEST.md');
    expect(result.directoryName).toBe('reviewlume-pack-20260711T010203Z-010203040506');
    expect(JSON.stringify(result.manifest)).not.toContain('user:secret');
    expect(Buffer.from(result.zip).readUInt32LE(0)).toBe(0x04034b50);
    expect(Buffer.from(result.zip).toString('utf8')).toContain('REVIEW_REQUEST.md');
    expect(Buffer.from(result.zip).toString('utf8')).toContain('manifest.json');
  });

  it('rejects every unsafe security gate state', async () => {
    const base = {
      repositoryIdentity: '/repo', repositoryDisplayName: 'repo', reviewMode: 'standard' as const,
      gitBase: 'a', gitTarget: 'b', instructions: 'x', files: [],
    };
    const builder = new ReviewPackBuilder();
    await expect(builder.build({ ...base, security: { ...safeSecurity, hardBlockCount: 1, hasHardBlock: true } }))
      .rejects.toThrow(/HARD_BLOCK/);
    await expect(builder.build({ ...base, security: { ...safeSecurity, hasUnresolvedBlock: true } }))
      .rejects.toThrow(/BLOCK/);
    await expect(builder.build({ ...base, security: { ...safeSecurity, hasUnresolvedWarn: true } }))
      .rejects.toThrow(/WARN/);
  });

  it('enforces repository-relative file paths and size budget', async () => {
    const builder = new ReviewPackBuilder();
    await expect(builder.build({
      repositoryIdentity: '/repo', repositoryDisplayName: 'repo', reviewMode: 'standard',
      gitBase: 'a', gitTarget: 'b', security: safeSecurity, instructions: 'x',
      files: [{ path: '../outside.ts', content: 'x' }],
    })).rejects.toBeInstanceOf(ReviewPackPolicyError);

    const result = await builder.build({
      repositoryIdentity: '/repo', repositoryDisplayName: 'repo', reviewMode: 'standard',
      gitBase: 'a', gitTarget: 'b', security: safeSecurity, instructions: 'x',
      diff: 'x'.repeat(200_000), files: [{ path: 'src/a.ts', content: 'y'.repeat(200_000) }],
      maxSizeKb: 64,
      reviewId: '20260711T010203Z-010203040506',
      generatedAt: new Date('2026-07-11T01:02:03Z'),
    });
    expect(result.byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(result.manifest.truncations.length).toBeGreaterThan(0);
  });
});
