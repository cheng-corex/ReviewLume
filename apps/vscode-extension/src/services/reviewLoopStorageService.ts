import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  MAX_IMPLEMENTATION_SUMMARY_LENGTH,
  MAX_REVIEW_ROUNDS,
  implementationSummarySchema,
  reviewLoopStateSchema,
  type ImplementationSummary,
  type ReviewLoopState,
  type ReviewRound,
} from './reviewLoopModel';

const STATE_FILE = 'review-loop.json';
const IMPLEMENTATION_REQUEST_FILE = 'implementation-request.md';
const IMPLEMENTATION_RESPONSE_FILE = 'implementation-response.md';
const MAX_PROMPT_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = MAX_IMPLEMENTATION_SUMMARY_LENGTH * 4;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const REVIEW_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;

export class ReviewLoopStorageError extends Error {
  constructor(
    readonly code:
      | 'INVALID_REVIEW_ID'
      | 'INVALID_DIRECTORY'
      | 'INVALID_STATE'
      | 'CONTENT_TOO_LARGE'
      | 'MISSING_STATE',
    message: string,
  ) {
    super(message);
    this.name = 'ReviewLoopStorageError';
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertReviewId(reviewId: string): void {
  if (!REVIEW_ID_PATTERN.test(reviewId)) {
    throw new ReviewLoopStorageError('INVALID_REVIEW_ID', 'Invalid reviewId.');
  }
}

async function assertReviewDirectory(reviewDirectory: string): Promise<string> {
  const stat = await fs.lstat(reviewDirectory).catch(() => undefined);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ReviewLoopStorageError('INVALID_DIRECTORY', 'Review directory is invalid.');
  }
  return fs.realpath(reviewDirectory);
}

function assertByteLimit(text: string, maximum: number): void {
  if (Buffer.byteLength(text, 'utf8') > maximum) {
    throw new ReviewLoopStorageError('CONTENT_TOO_LARGE', 'Review loop content exceeds limit.');
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const directory = path.dirname(filePath);
  const temporary = path.join(directory, `.tmp-${path.basename(filePath)}-${randomUUID()}`);
  await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readRegularFile(filePath: string): Promise<string> {
  const stat = await fs.lstat(filePath).catch(() => undefined);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new ReviewLoopStorageError('MISSING_STATE', 'Review loop file is missing.');
  }
  return fs.readFile(filePath, 'utf8');
}

export class ReviewLoopStorageService {
  async initialize(
    reviewDirectory: string,
    reviewId: string,
    baselineReportText: string,
  ): Promise<ReviewLoopState> {
    assertReviewId(reviewId);
    const directory = await assertReviewDirectory(reviewDirectory);
    const state: ReviewLoopState = {
      schemaVersion: 1,
      reviewId,
      baselineReportHash: sha256(baselineReportText),
      rounds: [],
    };
    await this.writeState(directory, state);
    return state;
  }

  async readState(reviewDirectory: string, reviewId: string): Promise<ReviewLoopState> {
    assertReviewId(reviewId);
    const directory = await assertReviewDirectory(reviewDirectory);
    const raw = await readRegularFile(path.join(directory, STATE_FILE));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review loop state is not valid JSON.');
    }
    const result = reviewLoopStateSchema.safeParse(parsed);
    if (!result.success || result.data.reviewId !== reviewId) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review loop state failed validation.');
    }
    return result.data;
  }

  async saveImplementationPrompt(reviewDirectory: string, prompt: string): Promise<string> {
    const directory = await assertReviewDirectory(reviewDirectory);
    assertByteLimit(prompt, MAX_PROMPT_BYTES);
    await atomicWrite(path.join(directory, IMPLEMENTATION_REQUEST_FILE), prompt);
    return sha256(prompt);
  }

  async saveReReviewPrompt(
    reviewDirectory: string,
    reviewId: string,
    round: number,
    issueIds: readonly string[],
    prompt: string,
  ): Promise<ReviewLoopState> {
    const directory = await assertReviewDirectory(reviewDirectory);
    const state = await this.readState(directory, reviewId);
    const pendingRound = state.rounds.find((item) => !item.responseHash && !item.reportHash);
    if (pendingRound) {
      throw new ReviewLoopStorageError(
        'INVALID_STATE',
        `Re-review round ${pendingRound.round} is still pending.`,
      );
    }
    if (
      !Number.isInteger(round) ||
      round < 1 ||
      round > MAX_REVIEW_ROUNDS ||
      round !== state.rounds.length + 1
    ) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review round must be sequential and in range.');
    }
    if (issueIds.length === 0 || new Set(issueIds).size !== issueIds.length) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review round issue scope is invalid.');
    }
    assertByteLimit(prompt, MAX_PROMPT_BYTES);

    const requestPath = path.join(directory, `re-review-request-${round}.md`);
    const requestHash = sha256(prompt);
    await atomicWrite(requestPath, prompt);
    try {
      return await this.appendRound(directory, reviewId, {
        round,
        createdAt: new Date().toISOString(),
        requestHash,
        issueIds: [...issueIds],
      });
    } catch (error) {
      await fs.rm(requestPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async saveReReviewResult(
    reviewDirectory: string,
    reviewId: string,
    round: number,
    responseText: string,
    reportText: string,
  ): Promise<ReviewLoopState> {
    const directory = await assertReviewDirectory(reviewDirectory);
    assertByteLimit(responseText, MAX_RESPONSE_BYTES);
    assertByteLimit(reportText, MAX_REPORT_BYTES);
    const state = await this.readState(directory, reviewId);
    const index = round - 1;
    const existing = state.rounds[index];
    if (!existing || existing.round !== round || existing.responseHash || existing.reportHash) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review round is missing or already completed.');
    }

    const responsePath = path.join(directory, `re-review-response-${round}.md`);
    const reportPath = path.join(directory, `re-review-report-${round}.json`);
    const completed: ReviewRound = {
      ...existing,
      responseHash: sha256(responseText),
      reportHash: sha256(reportText),
    };
    const rounds = [...state.rounds];
    rounds[index] = completed;
    const next: ReviewLoopState = { ...state, rounds };

    await atomicWrite(responsePath, responseText);
    try {
      await atomicWrite(reportPath, reportText);
      await this.writeState(directory, next);
    } catch (error) {
      await Promise.all([
        fs.rm(responsePath, { force: true }).catch(() => undefined),
        fs.rm(reportPath, { force: true }).catch(() => undefined),
      ]);
      throw error;
    }
    return next;
  }

  async readReReviewReportText(
    reviewDirectory: string,
    reviewId: string,
    round: number,
  ): Promise<string> {
    const directory = await assertReviewDirectory(reviewDirectory);
    const state = await this.readState(directory, reviewId);
    const storedRound = state.rounds[round - 1];
    if (!storedRound || storedRound.round !== round || !storedRound.reportHash) {
      throw new ReviewLoopStorageError('MISSING_STATE', 'Completed re-review report is missing.');
    }
    const text = await readRegularFile(path.join(directory, `re-review-report-${round}.json`));
    if (sha256(text) !== storedRound.reportHash) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Re-review report hash does not match state.');
    }
    return text;
  }

  async saveImplementationSummary(
    reviewDirectory: string,
    reviewId: string,
    summary: ImplementationSummary,
  ): Promise<ReviewLoopState> {
    assertByteLimit(summary.text, MAX_RESPONSE_BYTES);
    const summaryResult = implementationSummarySchema.safeParse(summary);
    if (!summaryResult.success) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Implementation summary failed validation.');
    }
    const directory = await assertReviewDirectory(reviewDirectory);
    const state = await this.readState(directory, reviewId);
    const next: ReviewLoopState = { ...state, implementationSummary: summaryResult.data };
    const nextResult = reviewLoopStateSchema.safeParse(next);
    if (!nextResult.success) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review loop state failed validation.');
    }
    await atomicWrite(path.join(directory, IMPLEMENTATION_RESPONSE_FILE), summaryResult.data.text);
    await this.writeState(directory, nextResult.data);
    return nextResult.data;
  }

  async appendRound(
    reviewDirectory: string,
    reviewId: string,
    round: ReviewRound,
  ): Promise<ReviewLoopState> {
    const directory = await assertReviewDirectory(reviewDirectory);
    const state = await this.readState(directory, reviewId);
    if (round.round !== state.rounds.length + 1) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review round must be sequential.');
    }
    const next: ReviewLoopState = { ...state, rounds: [...state.rounds, round] };
    await this.writeState(directory, next);
    return next;
  }

  private async writeState(reviewDirectory: string, state: ReviewLoopState): Promise<void> {
    const result = reviewLoopStateSchema.safeParse(state);
    if (!result.success) {
      throw new ReviewLoopStorageError('INVALID_STATE', 'Review loop state failed validation.');
    }
    await atomicWrite(path.join(reviewDirectory, STATE_FILE), `${JSON.stringify(result.data, null, 2)}\n`);
  }
}
