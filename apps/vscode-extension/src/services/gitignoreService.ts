import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validateExportDirectory } from './reviewPackExportService';

export interface GitignoreUpdateResult {
  readonly added: boolean;
  readonly rule: string;
}

export class GitignoreUpdateError extends Error {
  readonly code = 'INVALID_GITIGNORE_TARGET' as const;

  constructor(message: string) {
    super(message);
    this.name = 'GitignoreUpdateError';
  }
}

/** Ensure the active repository's root .gitignore excludes the automatic export directory. */
export async function ensureExportDirectoryIgnored(
  repositoryRoot: string,
  relativeDirectory: string,
): Promise<GitignoreUpdateResult> {
  const repositoryRealPath = await fs.realpath(repositoryRoot);
  const normalizedDirectory = validateExportDirectory(relativeDirectory);
  const rule = `${normalizedDirectory}/`;
  const gitignorePath = path.join(repositoryRealPath, '.gitignore');

  let content = '';
  let exists = false;
  try {
    const stat = await fs.lstat(gitignorePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new GitignoreUpdateError(
        'ReviewLume only updates a regular .gitignore file at the active repository root.',
      );
    }
    content = await fs.readFile(gitignorePath, 'utf8');
    exists = true;
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
  }

  if (containsEquivalentRule(content, normalizedDirectory)) {
    return { added: false, rule };
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const nextContent = content.length === 0
    ? `${rule}${newline}`
    : `${content}${content.endsWith('\n') ? '' : newline}${rule}${newline}`;

  try {
    await fs.writeFile(gitignorePath, nextContent, {
      encoding: 'utf8',
      flag: exists ? 'w' : 'wx',
    });
  } catch (error) {
    if (!exists && isNodeError(error, 'EEXIST')) {
      return ensureExportDirectoryIgnored(repositoryRealPath, normalizedDirectory);
    }
    throw error;
  }

  return { added: true, rule };
}

function containsEquivalentRule(content: string, directory: string): boolean {
  return content.split(/\r?\n/).some((line) => canonicalIgnoreRule(line) === directory);
}

function canonicalIgnoreRule(rawLine: string): string | undefined {
  let line = rawLine.trim();
  if (!line || line.startsWith('#') || line.startsWith('!')) return undefined;

  line = line.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  line = line.replace(/\/\*\*$/, '').replace(/\/+$/, '');
  return line || undefined;
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === code
  );
}
