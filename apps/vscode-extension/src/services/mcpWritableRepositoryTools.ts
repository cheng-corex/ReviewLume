import { createHash, randomBytes } from 'node:crypto';
import * as path from 'node:path';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  McpRepositoryTools,
  type McpGitRunner,
  type McpToolCallResult,
  type McpToolDefinition,
} from './mcpRepositoryTools';

const MAX_WRITE_FILES = 20;
const MAX_EDIT_FILE_BYTES = 512 * 1024;
const MAX_WRITE_TOTAL_BYTES = 768 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export interface McpWriteConfirmationFile {
  readonly path: string;
  readonly absolutePath: string;
  readonly action: 'create' | 'replace';
  readonly oldBytes: number;
  readonly newBytes: number;
}

export interface McpWriteConfirmationRequest {
  readonly repository: string;
  readonly reason?: string;
  readonly files: readonly McpWriteConfirmationFile[];
}

export interface McpWriteDecision {
  readonly approved: boolean;
  readonly message?: string;
}

interface WritableRepositoryToolsOptions {
  readonly root: string;
  readonly displayName: string;
  readonly runner: McpGitRunner;
  readonly maxResultBytes?: number;
  readonly confirmWrite: (request: McpWriteConfirmationRequest) => Promise<McpWriteDecision>;
}

interface RequestedChange {
  readonly path: string;
  readonly expectedSha256: string | null;
  readonly content: string;
}

interface PreparedChange {
  readonly path: string;
  readonly absolutePath: string;
  readonly expectedSha256: string | null;
  readonly contentBuffer: Buffer;
  readonly originalBuffer: Buffer | undefined;
  readonly oldSha256: string | null;
  readonly newSha256: string;
  readonly action: 'create' | 'replace';
}

interface RuntimeToolDefinition extends Omit<McpToolDefinition, 'annotations'> {
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly openWorldHint: boolean;
  };
}

const WRITE_TOOL_DEFINITIONS = [
  {
    name: 'read_file_for_edit',
    title: 'Read complete file for editing',
    description:
      'Read one complete bounded text file and return its raw content plus a SHA-256 concurrency token. Use this before write_files when replacing an existing file.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'write_files',
    title: 'Write confirmed repository files',
    description:
      'Create or completely replace up to 20 bounded text files inside the bound repository. Existing files require the exact SHA-256 returned by read_file_for_edit. Every effective batch requires explicit VS Code confirmation. This tool cannot delete files, access .git, escape the repository, execute commands, or perform Git operations.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: { type: 'string', maxLength: 500 },
        changes: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_WRITE_FILES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string' },
              expectedSha256: { type: ['string', 'null'] },
              content: { type: 'string' },
            },
            required: ['path', 'expectedSha256', 'content'],
          },
        },
      },
      required: ['changes'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
] as unknown as readonly McpToolDefinition[];

export class McpWritableRepositoryTools extends McpRepositoryTools {
  readonly accessMode = 'confirmed-write' as const;
  readonly #root: string;
  readonly #displayName: string;
  readonly #confirmWrite: WritableRepositoryToolsOptions['confirmWrite'];
  #realRoot: string | undefined;

  constructor(options: WritableRepositoryToolsOptions) {
    super(options);
    this.#root = path.resolve(options.root);
    this.#displayName = options.displayName;
    this.#confirmWrite = options.confirmWrite;
  }

  override get definitions(): readonly McpToolDefinition[] {
    return [...super.definitions, ...WRITE_TOOL_DEFINITIONS];
  }

  override async call(
    name: string,
    rawArguments: unknown,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    try {
      if (name === 'read_file_for_edit') {
        return await this.#readFileForEdit(asObject(rawArguments));
      }
      if (name === 'write_files') {
        return await this.#writeFiles(asObject(rawArguments));
      }
      return await super.call(name, rawArguments, signal);
    } catch (error) {
      return toolError(toSafeErrorMessage(error));
    }
  }

  async #readFileForEdit(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const target = await this.#resolveTarget(readString(args.path, 'path'));
    if (!target.exists) throw new Error('Requested file does not exist.');
    const fileStat = await stat(target.absolutePath);
    if (!fileStat.isFile()) throw new Error('Only regular files can be edited.');
    if (fileStat.size > MAX_EDIT_FILE_BYTES) {
      throw new Error(`File exceeds the ${MAX_EDIT_FILE_BYTES}-byte edit limit.`);
    }
    const buffer = await readFile(target.absolutePath);
    if (looksBinary(buffer)) throw new Error('Binary files cannot be edited.');
    return toolSuccess({
      repository: this.#displayName,
      path: target.path,
      content: buffer.toString('utf8'),
      sha256: sha256(buffer),
      byteLength: buffer.length,
    });
  }

  async #writeFiles(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const prepared = await this.#prepareChanges(readChanges(args.changes));
    const effective = prepared.filter(
      (change) => !change.originalBuffer?.equals(change.contentBuffer),
    );
    if (effective.length === 0) {
      return toolSuccess({
        repository: this.#displayName,
        applied: false,
        noOp: true,
        files: prepared.map((change) => change.path),
      });
    }

    const decision = await this.#confirmWrite({
      repository: this.#displayName,
      reason: readOptionalReason(args.reason),
      files: effective.map((change) => ({
        path: change.path,
        absolutePath: change.absolutePath,
        action: change.action,
        oldBytes: change.originalBuffer?.length ?? 0,
        newBytes: change.contentBuffer.length,
      })),
    });
    if (!decision.approved) {
      return toolSuccess({
        repository: this.#displayName,
        applied: false,
        declined: true,
        message: decision.message ?? 'The user declined this write request.',
        files: effective.map((change) => change.path),
      });
    }

    await this.#revalidateChanges(effective);
    const applied: PreparedChange[] = [];
    try {
      for (const change of effective) {
        await this.#applyChange(change);
        applied.push(change);
      }
    } catch (error) {
      const rollbackFailures = await this.#rollback(applied);
      const originalMessage = toSafeErrorMessage(error);
      if (rollbackFailures.length > 0) {
        throw new Error(
          `Write failed and rollback was incomplete for ${rollbackFailures.join(', ')}. ` +
            `Inspect git status before continuing. Original error: ${originalMessage}`,
        );
      }
      throw new Error(`Write failed; all applied files were rolled back: ${originalMessage}`);
    }

    return toolSuccess({
      repository: this.#displayName,
      applied: true,
      files: effective.map((change) => ({
        path: change.path,
        action: change.action,
        oldSha256: change.oldSha256,
        newSha256: change.newSha256,
        byteLength: change.contentBuffer.length,
      })),
      nextStep: 'Call get_diff with scope working to inspect the actual repository changes.',
    });
  }

  async #prepareChanges(requested: readonly RequestedChange[]): Promise<PreparedChange[]> {
    const prepared: PreparedChange[] = [];
    const seen = new Set<string>();
    let totalBytes = 0;
    for (const request of requested) {
      const target = await this.#resolveTarget(request.path);
      if (seen.has(target.path)) throw new Error(`Duplicate write path: ${target.path}`);
      seen.add(target.path);
      const contentBuffer = Buffer.from(request.content, 'utf8');
      if (contentBuffer.includes(0)) throw new Error(`Binary content is not allowed: ${target.path}`);
      if (contentBuffer.length > MAX_EDIT_FILE_BYTES) {
        throw new Error(`${target.path} exceeds the ${MAX_EDIT_FILE_BYTES}-byte edit limit.`);
      }
      totalBytes += contentBuffer.length;
      if (totalBytes > MAX_WRITE_TOTAL_BYTES) {
        throw new Error(`Write batch exceeds the ${MAX_WRITE_TOTAL_BYTES}-byte limit.`);
      }

      let originalBuffer: Buffer | undefined;
      let oldSha256: string | null = null;
      if (target.exists) {
        const fileStat = await stat(target.absolutePath);
        if (!fileStat.isFile()) throw new Error(`Only regular files can be replaced: ${target.path}`);
        if (fileStat.size > MAX_EDIT_FILE_BYTES) {
          throw new Error(`${target.path} exceeds the ${MAX_EDIT_FILE_BYTES}-byte edit limit.`);
        }
        originalBuffer = await readFile(target.absolutePath);
        if (looksBinary(originalBuffer)) throw new Error(`Binary files cannot be replaced: ${target.path}`);
        oldSha256 = sha256(originalBuffer);
        if (!request.expectedSha256 || !SHA256_PATTERN.test(request.expectedSha256)) {
          throw new Error(`Existing file requires a valid expectedSha256: ${target.path}`);
        }
        if (request.expectedSha256.toLowerCase() !== oldSha256) {
          throw new Error(`File changed since it was read; read it again before writing: ${target.path}`);
        }
      } else if (request.expectedSha256 !== null) {
        throw new Error(`New file must use expectedSha256: null: ${target.path}`);
      }

      prepared.push({
        path: target.path,
        absolutePath: target.absolutePath,
        expectedSha256: request.expectedSha256,
        contentBuffer,
        originalBuffer,
        oldSha256,
        newSha256: sha256(contentBuffer),
        action: target.exists ? 'replace' : 'create',
      });
    }
    return prepared;
  }

  async #revalidateChanges(changes: readonly PreparedChange[]): Promise<void> {
    for (const change of changes) await this.#revalidateChange(change);
  }

  async #revalidateChange(change: PreparedChange): Promise<void> {
    const target = await this.#resolveTarget(change.path);
    if (change.action === 'create') {
      if (target.exists) throw new Error(`File appeared before write confirmation completed: ${change.path}`);
      return;
    }
    if (!target.exists) throw new Error(`File disappeared before write confirmation completed: ${change.path}`);
    const current = await readFile(target.absolutePath);
    if (sha256(current) !== change.expectedSha256?.toLowerCase()) {
      throw new Error(`File changed while awaiting confirmation: ${change.path}`);
    }
  }

  async #applyChange(change: PreparedChange): Promise<void> {
    await mkdir(path.dirname(change.absolutePath), { recursive: true });
    const target = await this.#resolveTarget(change.path);
    if (target.absolutePath !== change.absolutePath || target.exists !== (change.action === 'replace')) {
      throw new Error(`Path changed during write validation: ${change.path}`);
    }
    await this.#revalidateChange(change);
    if (change.action === 'create') {
      const temporaryPath = createTemporaryPath(change.absolutePath, 'new');
      try {
        await writeFile(temporaryPath, change.contentBuffer, { flag: 'wx' });
        await rename(temporaryPath, change.absolutePath);
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
      return;
    }
    await this.#replaceAtomically(change.absolutePath, change.contentBuffer);
  }

  async #replaceAtomically(targetPath: string, content: Buffer): Promise<void> {
    const newPath = createTemporaryPath(targetPath, 'new');
    const backupPath = createTemporaryPath(targetPath, 'backup');
    await writeFile(newPath, content, { flag: 'wx' });
    let targetMoved = false;
    try {
      await rename(targetPath, backupPath);
      targetMoved = true;
      await rename(newPath, targetPath);
      await rm(backupPath, { force: true });
    } catch (error) {
      if (targetMoved) {
        await rm(targetPath, { force: true }).catch(() => undefined);
        await rename(backupPath, targetPath).catch(() => undefined);
      }
      throw error;
    } finally {
      await rm(newPath, { force: true }).catch(() => undefined);
      await rm(backupPath, { force: true }).catch(() => undefined);
    }
  }

  async #rollback(changes: readonly PreparedChange[]): Promise<string[]> {
    const failures: string[] = [];
    for (const change of [...changes].reverse()) {
      try {
        if (change.originalBuffer) await this.#replaceAtomically(change.absolutePath, change.originalBuffer);
        else await rm(change.absolutePath, { force: true });
      } catch {
        failures.push(change.path);
      }
    }
    return failures;
  }

  async #resolveTarget(relativePath: string): Promise<{
    readonly path: string;
    readonly absolutePath: string;
    readonly exists: boolean;
  }> {
    const normalized = normalizeRepositoryRelativePath(relativePath, 'File path');
    const realRoot = (this.#realRoot ??= await realpath(this.#root));
    const absolutePath = path.resolve(realRoot, normalized);
    assertInsideRepository(realRoot, absolutePath);

    let current = realRoot;
    const parts = normalized.split('/');
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index] ?? '');
      try {
        const entry = await lstat(current);
        if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be written through MCP.');
        if (index < parts.length - 1 && !entry.isDirectory()) {
          throw new Error(`Parent path is not a directory: ${parts.slice(0, index + 1).join('/')}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
    }

    try {
      const realCandidate = await realpath(absolutePath);
      assertInsideRepository(realRoot, realCandidate);
      return { path: normalized, absolutePath: realCandidate, exists: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    let existingParent = path.dirname(absolutePath);
    let parentFound = false;
    for (let depth = 0; depth <= parts.length; depth += 1) {
      try {
        const realParent = await realpath(existingParent);
        assertInsideRepository(realRoot, realParent);
        parentFound = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const next = path.dirname(existingParent);
        if (next === existingParent) break;
        existingParent = next;
      }
    }
    if (!parentFound) throw new Error('Writable parent directory was not found.');
    return { path: normalized, absolutePath, exists: false };
  }
}

function readChanges(value: unknown): readonly RequestedChange[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_WRITE_FILES) {
    throw new Error(`changes must contain between 1 and ${MAX_WRITE_FILES} files.`);
  }
  return value.map((entry, index) => {
    const item = asObject(entry);
    if (!Object.prototype.hasOwnProperty.call(item, 'expectedSha256')) {
      throw new Error(`changes[${index}].expectedSha256 is required.`);
    }
    if (item.expectedSha256 !== null && typeof item.expectedSha256 !== 'string') {
      throw new Error(`changes[${index}].expectedSha256 must be a SHA-256 string or null.`);
    }
    if (typeof item.content !== 'string') throw new Error(`changes[${index}].content must be a string.`);
    return {
      path: readString(item.path, `changes[${index}].path`),
      expectedSha256: item.expectedSha256,
      content: item.content,
    };
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object.');
  return value as Record<string, unknown>;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function readOptionalReason(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('reason must be a string.');
  const normalized = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? ' ' : character;
    })
    .join('')
    .trim();
  if (normalized.length > 500) throw new Error('reason must not exceed 500 characters.');
  return normalized || undefined;
}

function createTemporaryPath(targetPath: string, kind: 'new' | 'backup'): string {
  return path.join(
    path.dirname(targetPath),
    `.reviewlume-write-${kind}-${randomBytes(12).toString('hex')}.tmp`,
  );
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isAbsoluteLike(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    path.posix.isAbsolute(normalizeRepoPath(value)) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value)
  );
}

function normalizeRepositoryRelativePath(value: string, label: string): string {
  if (isAbsoluteLike(value) || value.includes('\0')) throw new Error(`${label} must be repository-relative.`);
  const normalized = path.posix.normalize(normalizeRepoPath(value));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${label} resolves outside the repository.`);
  }
  if (normalized === '.git' || normalized.startsWith('.git/')) {
    throw new Error('The .git directory is not writable through MCP.');
  }
  return normalized;
}

function assertInsideRepository(realRoot: string, candidate: string): void {
  const boundary = path.relative(realRoot, candidate);
  if (boundary === '..' || boundary.startsWith(`..${path.sep}`) || path.isAbsolute(boundary)) {
    throw new Error('Path resolves outside the repository.');
  }
}

function looksBinary(value: Buffer): boolean {
  return value.subarray(0, Math.min(value.length, 8_192)).includes(0);
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function toolSuccess(value: Record<string, unknown>): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

function toolError(message: string): McpToolCallResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function toSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
}
