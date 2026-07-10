import { describe, it, expect } from 'vitest';
import { GitContextService } from '../index.js';

describe('@reviewlume/git-context', () => {
  it('should create a GitContextService', () => {
    const service = new GitContextService();
    expect(service).toBeInstanceOf(GitContextService);
  });

  it('should return null for getRepositoryInfo in P0', async () => {
    const service = new GitContextService();
    const result = await service.getRepositoryInfo('/fake/path');
    expect(result).toBeNull();
  });

  it('should return null for getStagedDiff in P0', async () => {
    const service = new GitContextService();
    const result = await service.getStagedDiff('/fake/repo');
    expect(result).toBeNull();
  });
});
