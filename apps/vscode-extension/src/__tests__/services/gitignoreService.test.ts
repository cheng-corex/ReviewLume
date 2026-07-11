import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureExportDirectoryIgnored,
  GitignoreUpdateError,
} from '../../services/gitignoreService';

const temporaryDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-gitignore-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('ensureExportDirectoryIgnored', () => {
  it('creates a root .gitignore when one does not exist', async () => {
    const root = await fixture();
    await expect(ensureExportDirectoryIgnored(root, '.reviewlume/exports')).resolves.toEqual({
      added: true,
      rule: '.reviewlume/exports/',
    });
    expect(await fs.readFile(path.join(root, '.gitignore'), 'utf8')).toBe(
      '.reviewlume/exports/\n',
    );
  });

  it('preserves LF, CRLF, and a missing final newline while appending', async () => {
    const lfRoot = await fixture();
    await fs.writeFile(path.join(lfRoot, '.gitignore'), 'dist/\n');
    await ensureExportDirectoryIgnored(lfRoot, 'review-output');
    expect(await fs.readFile(path.join(lfRoot, '.gitignore'), 'utf8')).toBe(
      'dist/\nreview-output/\n',
    );

    const crlfRoot = await fixture();
    await fs.writeFile(path.join(crlfRoot, '.gitignore'), 'dist/\r\nnode_modules/');
    await ensureExportDirectoryIgnored(crlfRoot, 'review-output');
    expect(await fs.readFile(path.join(crlfRoot, '.gitignore'), 'utf8')).toBe(
      'dist/\r\nnode_modules/\r\nreview-output/\r\n',
    );
  });

  it('does not duplicate equivalent rules', async () => {
    for (const existingRule of [
      '.reviewlume/exports/',
      '/.reviewlume/exports/',
      './.reviewlume/exports',
      '.reviewlume/exports/**',
    ]) {
      const root = await fixture();
      await fs.writeFile(path.join(root, '.gitignore'), `${existingRule}\n`);
      const result = await ensureExportDirectoryIgnored(root, '.reviewlume/exports');
      expect(result.added).toBe(false);
      expect((await fs.readFile(path.join(root, '.gitignore'), 'utf8')).split('\n')).toHaveLength(2);
    }
  });

  it('writes the configured repository-relative directory', async () => {
    const root = await fixture();
    await ensureExportDirectoryIgnored(root, 'artifacts/reviews');
    expect(await fs.readFile(path.join(root, '.gitignore'), 'utf8')).toBe(
      'artifacts/reviews/\n',
    );
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic-link .gitignore', async () => {
    const root = await fixture();
    const outside = await fixture();
    const target = path.join(outside, 'outside-ignore');
    await fs.writeFile(target, 'outside\n');
    await fs.symlink(target, path.join(root, '.gitignore'));

    await expect(
      ensureExportDirectoryIgnored(root, '.reviewlume/exports'),
    ).rejects.toBeInstanceOf(GitignoreUpdateError);
    expect(await fs.readFile(target, 'utf8')).toBe('outside\n');
  });
});
