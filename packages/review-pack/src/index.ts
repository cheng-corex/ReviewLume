import { createHash, randomBytes } from 'node:crypto';
import type { ReviewMode } from '@reviewlume/core';

export const REVIEW_PACK_SCHEMA_VERSION = 1 as const;
export const REVIEW_REQUEST_FILENAME = 'REVIEW_REQUEST.md' as const;
export const REVIEW_PACK_DIRECTORY_PREFIX = 'reviewlume-pack-';

export interface ReviewPackSecuritySummary {
  readonly scanId: string;
  readonly contentFingerprint: string;
  readonly hardBlockCount: number;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly confirmedWarnCount: number;
  readonly hasHardBlock: boolean;
  readonly hasUnresolvedBlock: boolean;
  readonly hasUnresolvedWarn: boolean;
}
export interface ReviewPackFile {
  readonly path: string;
  readonly content: string;
  readonly source?: 'changed' | 'manual' | 'recommended';
}
export interface ReviewPackBuildInput {
  readonly repositoryIdentity: string;
  readonly repositoryDisplayName: string;
  readonly reviewMode: ReviewMode;
  readonly gitBase: string;
  readonly gitTarget: string;
  readonly security: ReviewPackSecuritySummary;
  readonly instructions: string;
  readonly requirements?: string;
  readonly implementationReport?: string;
  readonly diff?: string;
  readonly files: readonly ReviewPackFile[];
  readonly excluded?: readonly { path: string; reason: string }[];
  readonly maxSizeKb?: number;
  readonly generatedAt?: Date;
  readonly reviewId?: string;
}
export interface ReviewPackManifest {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly reviewId: string;
  readonly repositoryDisplayName: string;
  readonly generatedAt: string;
  readonly reviewMode: ReviewMode;
  readonly git: { readonly base: string; readonly target: string };
  readonly security: {
    readonly scanId: string;
    readonly hardBlocked: number;
    readonly blocked: number;
    readonly warnings: number;
    readonly info: number;
    readonly confirmedWarnings: number;
  };
  readonly files: readonly { readonly path: string; readonly source: string; readonly truncated: boolean }[];
  readonly excluded: readonly { readonly path: string; readonly reason: string }[];
  readonly truncations: readonly string[];
  readonly output: { readonly mainFile: typeof REVIEW_REQUEST_FILENAME; readonly directory: string };
}
export interface ReviewPackBuildResult {
  readonly markdown: string;
  readonly manifest: ReviewPackManifest;
  readonly workspaceId: string;
  readonly reviewId: string;
  readonly directoryName: string;
  readonly byteLength: number;
  readonly zip: Uint8Array;
}

export class ReviewPackPolicyError extends Error {
  readonly code = 'REVIEW_PACK_POLICY' as const;
  constructor(message: string) { super(message); this.name = 'ReviewPackPolicyError'; }
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function normalizeRepositoryIdentity(identity: string): string {
  const value = identity.trim();
  if (!value) throw new ReviewPackPolicyError('Repository identity is required.');
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\\/g, '/').replace(/\/+$/, '');
  }
}
export function createWorkspaceId(repositoryIdentity: string): string {
  return sha256(normalizeRepositoryIdentity(repositoryIdentity)).slice(0, 16);
}
function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function createReviewId(date = new Date(), random: (size: number) => Uint8Array = randomBytes): string {
  return `${timestamp(date)}-${Buffer.from(random(6)).toString('hex')}`;
}
export async function createUniqueReviewId(
  exists: (reviewId: string) => boolean | Promise<boolean>,
  date = new Date(),
  random: (size: number) => Uint8Array = randomBytes,
  attempts = 20,
): Promise<string> {
  for (let index = 0; index < attempts; index += 1) {
    const candidate = createReviewId(date, random);
    if (!(await exists(candidate))) return candidate;
  }
  throw new ReviewPackPolicyError('Unable to allocate a unique reviewId after repeated collisions.');
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized) || /[\0\r\n]/.test(normalized) || normalized.split('/').some((part) => part === '..')) {
    throw new ReviewPackPolicyError('Review Pack paths must be repository-relative and free of control characters.');
  }
  return normalized;
}
function safeText(value: string, maxLength: number): string {
  return value.replace(/[\0\r\n]+/g, ' ').trim().slice(0, maxLength);
}
function assertSecurityGate(security: ReviewPackSecuritySummary): void {
  if (security.hasHardBlock || security.hardBlockCount > 0) throw new ReviewPackPolicyError('Review Pack export is blocked by HARD_BLOCK findings.');
  if (security.hasUnresolvedBlock || security.blockCount > 0) throw new ReviewPackPolicyError('Review Pack export is blocked by BLOCK findings.');
  if (security.hasUnresolvedWarn || security.confirmedWarnCount < security.warnCount) throw new ReviewPackPolicyError('Review Pack export is blocked until every WARN finding is confirmed.');
}
function section(title: string, body: string | undefined): string {
  return body?.trim() ? `\n## ${title}\n\n${body.trim()}\n` : '';
}
function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { value, truncated: false };
  const suffix = '\n\n> [TRUNCATED BY REVIEWLUME SIZE BUDGET]\n';
  const slice = bytes.subarray(0, Math.max(0, maxBytes - Buffer.byteLength(suffix)));
  let output = slice.toString('utf8');
  while (Buffer.byteLength(output + suffix) > maxBytes && output.length > 0) output = output.slice(0, -1);
  return { value: output + suffix, truncated: true };
}
function yamlString(value: string): string { return JSON.stringify(value); }
function frontMatter(manifest: ReviewPackManifest): string {
  return [
    '---', `schemaVersion: ${manifest.schemaVersion}`, `workspaceId: ${manifest.workspaceId}`,
    `reviewId: ${manifest.reviewId}`, `repository: ${yamlString(manifest.repositoryDisplayName)}`,
    `generatedAt: ${yamlString(manifest.generatedAt)}`, `reviewMode: ${manifest.reviewMode}`,
    `gitBase: ${yamlString(manifest.git.base)}`, `gitTarget: ${yamlString(manifest.git.target)}`, '---', '',
  ].join('\n');
}

export class ReviewPackBuilder {
  async build(input: ReviewPackBuildInput): Promise<ReviewPackBuildResult> {
    assertSecurityGate(input.security);
    const generatedAt = input.generatedAt ?? new Date();
    const workspaceId = createWorkspaceId(input.repositoryIdentity);
    const reviewId = input.reviewId ?? createReviewId(generatedAt);
    if (!/^\d{8}T\d{6}Z-[0-9a-f]{12}$/.test(reviewId)) throw new ReviewPackPolicyError('reviewId does not match schema v1.');
    const repositoryDisplayName = safeText(input.repositoryDisplayName, 200);
    if (!repositoryDisplayName) throw new ReviewPackPolicyError('Repository display name is required.');
    const files = input.files.map((file) => ({ ...file, path: safeRelativePath(file.path) }));
    const excluded = (input.excluded ?? []).map((item) => ({ path: safeRelativePath(item.path), reason: safeText(item.reason, 200) }));
    const maxBytes = Math.max(64, input.maxSizeKb ?? 2048) * 1024;
    const directoryName = `${REVIEW_PACK_DIRECTORY_PREFIX}${reviewId}`;
    const truncations: string[] = [];

    const baseManifest: ReviewPackManifest = {
      schemaVersion: 1, workspaceId, reviewId, repositoryDisplayName, generatedAt: generatedAt.toISOString(),
      reviewMode: input.reviewMode, git: { base: safeText(input.gitBase, 200), target: safeText(input.gitTarget, 200) },
      security: {
        scanId: input.security.scanId, hardBlocked: input.security.hardBlockCount,
        blocked: input.security.blockCount, warnings: input.security.warnCount,
        info: input.security.infoCount, confirmedWarnings: input.security.confirmedWarnCount,
      },
      files: [], excluded, truncations, output: { mainFile: REVIEW_REQUEST_FILENAME, directory: directoryName },
    };
    const initialFrontMatter = frontMatter(baseManifest);
    let markdown = initialFrontMatter + '# ReviewLume Review Request\n' +
      section('Review Instructions', input.instructions) +
      section('Security Summary', `Scan: \`${input.security.scanId}\`\n\nHARD_BLOCK: 0 · BLOCK: 0 · WARN: ${input.security.warnCount} (${input.security.confirmedWarnCount} confirmed) · INFO: ${input.security.infoCount}`) +
      section('Requirements', input.requirements) + section('Implementation Report', input.implementationReport);

    const appendBudgeted = (label: string, body: string): boolean => {
      const remaining = maxBytes - Buffer.byteLength(markdown, 'utf8');
      if (remaining <= 0) { truncations.push(label); return true; }
      const limited = truncateUtf8(body, remaining);
      markdown += limited.value;
      if (limited.truncated) truncations.push(label);
      return limited.truncated;
    };
    if (input.diff?.trim()) appendBudgeted('diff', `\n## Git Diff\n\n\`\`\`diff\n${input.diff.trim()}\n\`\`\`\n`);

    const manifestFiles: Array<{ path: string; source: string; truncated: boolean }> = [];
    for (const file of files) {
      const language = file.path.split('.').pop()?.replace(/[^A-Za-z0-9_-]/g, '') ?? '';
      const truncated = appendBudgeted(`file:${file.path}`, `\n## File: ${file.path}\n\nSource: ${file.source ?? 'changed'}\n\n\`\`\`${language}\n${file.content}\n\`\`\`\n`);
      manifestFiles.push({ path: file.path, source: file.source ?? 'changed', truncated });
      if (Buffer.byteLength(markdown, 'utf8') >= maxBytes) break;
    }

    let manifest: ReviewPackManifest = { ...baseManifest, files: manifestFiles, truncations: [...truncations] };
    markdown = frontMatter(manifest) + markdown.slice(initialFrontMatter.length);
    if (Buffer.byteLength(markdown, 'utf8') > maxBytes) {
      markdown = truncateUtf8(markdown, maxBytes).value;
      if (!truncations.includes('pack')) truncations.push('pack');
      manifest = { ...manifest, truncations: [...truncations] };
    }
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
    const zip = createZip([
      { name: `${directoryName}/${REVIEW_REQUEST_FILENAME}`, data: Buffer.from(markdown, 'utf8') },
      { name: `${directoryName}/manifest.json`, data: Buffer.from(manifestJson, 'utf8') },
    ]);
    return { markdown, manifest, workspaceId, reviewId, directoryName, byteLength: Buffer.byteLength(markdown, 'utf8'), zip };
  }
}

interface ZipEntry { readonly name: string; readonly data: Buffer }
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(0, 10); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.data.length, 20); directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
