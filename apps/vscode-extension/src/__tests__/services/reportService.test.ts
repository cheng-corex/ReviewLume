import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReviewReport } from '@reviewlume/report-parser';
import { ReportService, ReportServiceError } from '../../services/reportService';
import { initLogService } from '../../services/logService';

const temporaryDirectories: string[] = [];
const REVIEW_ID = '20260711T010203Z-aabbccddeeff';
const HASH = 'a'.repeat(64);

const sampleResponse = `## Critical

### SQL Injection Risk

- File: src/db.ts
- Line: 42
- Description: Unsanitized user input in SQL query
- Suggestion: Use parameterized queries

## Medium

### Missing Error Handling

- File: src/api.ts
- Line: 100
- Description: No try-catch around async call`;

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-report-'));
  temporaryDirectories.push(root);
  return root;
}

function validReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    schemaVersion: 1,
    reviewId: REVIEW_ID,
    sourceResponseHash: HASH,
    parsedAt: new Date().toISOString(),
    parserVersion: '1.0.0',
    parseStatus: 'parsed',
    issues: [],
    warnings: [],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

initLogService();

describe('ReportService', () => {
  let service: ReportService;
  let reviewDir: string;

  beforeEach(async () => {
    service = new ReportService();
    const root = await fixture();
    reviewDir = path.join(root, REVIEW_ID);
    await fs.mkdir(reviewDir, { recursive: true });
  });

  it('creates and reads a valid report', async () => {
    const report = await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    expect(report.schemaVersion).toBe(1);
    expect(report.reviewId).toBe(REVIEW_ID);
    expect(report.sourceResponseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report.issues.length).toBeGreaterThanOrEqual(2);

    const result = await service.readReport(reviewDir, REVIEW_ID, sampleResponse);
    expect(result.status).toBe('valid');
    expect(result.report?.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('creates an unstructured report for an empty response', async () => {
    const report = await service.createReport(reviewDir, REVIEW_ID, '');
    expect(report.parseStatus).toBe('unstructured');
    expect(report.issues).toHaveLength(0);
  });

  it('does not leave temporary files after successful writes', async () => {
    await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    const files = await fs.readdir(reviewDir);
    expect(files).toContain('report.json');
    expect(files.filter((file) => file.startsWith('.report-'))).toHaveLength(0);
  });

  it('rejects a directory whose basename does not match reviewId', async () => {
    const wrongDirectory = path.join(path.dirname(reviewDir), 'other');
    await fs.mkdir(wrongDirectory);
    await expect(
      service.createReport(wrongDirectory, REVIEW_ID, sampleResponse),
    ).rejects.toBeInstanceOf(ReportServiceError);
  });

  it('returns missing when report.json does not exist', async () => {
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('missing');
  });

  it('returns corrupt for invalid JSON and non-object roots', async () => {
    await fs.writeFile(path.join(reviewDir, 'report.json'), '{bad', 'utf8');
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('corrupt');

    await fs.writeFile(path.join(reviewDir, 'report.json'), '[]', 'utf8');
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('corrupt');
  });

  it('distinguishes unsupported schema versions and reviewId mismatches', async () => {
    await fs.writeFile(
      path.join(reviewDir, 'report.json'),
      JSON.stringify({ ...validReport(), schemaVersion: 999 }),
      'utf8',
    );
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe(
      'unsupported-version',
    );

    await fs.writeFile(
      path.join(reviewDir, 'report.json'),
      JSON.stringify({ ...validReport(), reviewId: '20260710T010203Z-001122334455' }),
      'utf8',
    );
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('id-mismatch');
  });

  it('strictly rejects invalid nested issue data and unknown fields', async () => {
    const invalidIssue = {
      issueId: 'ISSUE-0000000000000001',
      ordinal: 1,
      title: 'Unsafe path',
      description: 'test',
      severity: 'medium',
      status: 'invented-status',
      filePath: '../../outside.txt',
      sourceFingerprint: HASH,
    };
    await fs.writeFile(
      path.join(reviewDir, 'report.json'),
      JSON.stringify({ ...validReport(), issues: [invalidIssue], injected: true }),
      'utf8',
    );

    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('corrupt');
  });

  it('rejects duplicate issue IDs', async () => {
    const issue = {
      issueId: 'ISSUE-0000000000000001',
      ordinal: 1,
      title: 'Duplicate',
      description: 'test',
      severity: 'medium' as const,
      status: 'open' as const,
      sourceFingerprint: HASH,
    };
    await fs.writeFile(
      path.join(reviewDir, 'report.json'),
      JSON.stringify({ ...validReport(), issues: [issue, { ...issue, ordinal: 2 }] }),
      'utf8',
    );

    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('corrupt');
  });

  it('returns stale-hash only after the stored report passes schema validation', async () => {
    await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    const result = await service.readReport(reviewDir, REVIEW_ID, 'different response');
    expect(result.status).toBe('stale-hash');
    expect(result.report).toBeDefined();
  });

  it('reparses and replaces the previous report', async () => {
    await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    const response =
      '```json\n[{"title":"New Issue","description":"New desc","severity":"high"}]\n```';
    const report = await service.reparseReport(reviewDir, REVIEW_ID, response);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].title).toBe('New Issue');
    expect((await service.readReport(reviewDir, REVIEW_ID, response)).status).toBe('valid');
  });

  it('validates status transitions and the resulting report', async () => {
    const response =
      '```json\n[{"title":"Issue","description":"Desc","severity":"medium"}]\n```';
    const report = await service.createReport(reviewDir, REVIEW_ID, response);
    const issueId = report.issues[0].issueId;
    expect(service.transitionIssueStatus(report, issueId, 'fixed').issues[0].status).toBe(
      'fixed',
    );
    expect(() => service.transitionIssueStatus(report, issueId, 'open')).toThrow();
    expect(() => service.transitionIssueStatus(report, 'ISSUE-0000000000000000', 'fixed')).toThrow(
      ReportServiceError,
    );
  });

  it('persists a valid issue status transition', async () => {
    const report = await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    const issueId = report.issues[0].issueId;

    const updated = await service.transitionIssueStatusOnDisk(
      reviewDir,
      REVIEW_ID,
      issueId,
      'fixed',
      sampleResponse,
    );

    expect(updated.issues[0].status).toBe('fixed');
    const stored = await service.readReport(reviewDir, REVIEW_ID, sampleResponse);
    expect(stored.status).toBe('valid');
    expect(stored.report?.issues[0].status).toBe('fixed');
  });

  it('does not overwrite stale reports during status updates', async () => {
    const original = await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    await expect(
      service.transitionIssueStatusOnDisk(
        reviewDir,
        REVIEW_ID,
        original.issues[0].issueId,
        'fixed',
        'changed response',
      ),
    ).rejects.toThrow(/stale-hash/);

    const stored = await service.readReport(reviewDir, REVIEW_ID);
    expect(stored.report?.issues[0].status).toBe('open');
  });

  it('rejects invalid and missing issue transitions without modifying disk', async () => {
    const original = await service.createReport(reviewDir, REVIEW_ID, sampleResponse);
    const issueId = original.issues[0].issueId;

    await expect(
      service.transitionIssueStatusOnDisk(
        reviewDir,
        REVIEW_ID,
        issueId,
        'open',
        sampleResponse,
      ),
    ).rejects.toThrow();
    await expect(
      service.transitionIssueStatusOnDisk(
        reviewDir,
        REVIEW_ID,
        'ISSUE-0000000000000000',
        'fixed',
        sampleResponse,
      ),
    ).rejects.toThrow(ReportServiceError);

    const stored = await service.readReport(reviewDir, REVIEW_ID, sampleResponse);
    expect(stored.report?.issues[0].status).toBe('open');
  });

  it('serializes concurrent writes without corrupting report.json', async () => {
    const response =
      '```json\n[{"title":"Concurrent","description":"second payload","severity":"low"}]\n```';
    await Promise.all([
      service.createReport(reviewDir, REVIEW_ID, sampleResponse),
      new ReportService().createReport(reviewDir, REVIEW_ID, response),
    ]);

    const result = await service.readReport(reviewDir, REVIEW_ID);
    expect(result.status).toBe('valid');
    expect(['SQL Injection Risk', 'Concurrent']).toContain(result.report?.issues[0]?.title);
    expect((await fs.readdir(reviewDir)).filter((file) => file.startsWith('.report-'))).toHaveLength(0);
  });

  it('rejects invalid reports before updating disk', async () => {
    const report = validReport({ sourceResponseHash: 'bad' });
    await expect(service.updateReport(reviewDir, report)).rejects.toThrow();
    expect((await service.readReport(reviewDir, REVIEW_ID)).status).toBe('missing');
  });
});
