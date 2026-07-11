import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretScanner } from '../../../../../packages/secret-scanner/dist/index.js';
import { ReviewPackBuilder } from '../../../../../packages/review-pack/dist/index.js';
import { SecurityReviewService } from '../../services/securityReviewService';
import type { FileSelectionService } from '../../services/fileSelectionService';
import type { LazyFileSelectionGitRunner } from '../../services/lazyFileSelectionGitRunner';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture(diff: { value: string }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-security-'));
  temporaryDirectories.push(root);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'app.ts'), 'export const safe = true;');
  const entries = [{ path: 'src/app.ts', source: 'changed', changeKinds: ['modified'], exists: true, selected: true }];
  const fileSelection = {
    hasSession: true,
    repository: { root, displayName: 'fixture', hasRemote: false, remoteUrl: undefined },
    entries,
    absolutePathFor: vi.fn(() => path.join(root, 'src', 'app.ts')),
  } as unknown as FileSelectionService;
  const runner = { run: vi.fn(async () => ({ stdout: diff.value })) } as unknown as LazyFileSelectionGitRunner;
  return {
    service: new SecurityReviewService(fileSelection, runner, new SecretScanner(), new ReviewPackBuilder()),
    runner,
  };
}

describe('SecurityReviewService', () => {
  it('scans Git diff content so deleted secrets cannot bypass P4', async () => {
    const { service } = await fixture({ value: '- password=abcdefghijklmnop\n' });
    const result = await service.scan();
    expect(result.findings.some((finding) => finding.file === '@reviewlume/git-diff.patch' && finding.level === 'BLOCK')).toBe(true);
    await expect(service.buildReviewPack()).rejects.toThrow(/BLOCK/);
  });

  it('rejects export when Git diff changes after the successful scan', async () => {
    const diff = { value: '+ export const safe = true;\n' };
    const { service } = await fixture(diff);
    expect((await service.scan()).canExport).toBe(true);
    diff.value = '+ token=abcdefghijklmnopqrstuvwxyz123456\n';
    await expect(service.buildReviewPack()).rejects.toThrow(/changed after scanning/i);
  });

  it('builds a pack only from the exact content covered by the scan', async () => {
    const { service, runner } = await fixture({ value: '+ export const safe = true;\n' });
    expect((await service.scan()).canExport).toBe(true);
    const pack = await service.buildReviewPack();
    expect(pack.markdown).toContain('## Git Diff');
    expect(pack.markdown).toContain('## File: src/app.ts');
    expect(pack.manifest.security.hardBlocked).toBe(0);
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({
      args: ['diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', '--', 'src/app.ts'],
    }));
  });
});
