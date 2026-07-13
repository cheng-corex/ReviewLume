import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReportService } from '../../services/reportService';
import { initLogService } from '../../services/logService';

const REVIEW_ID = '20260713T010203Z-aabbccddeeff';
const temporaryDirectories: string[] = [];

const originalResponse = `\`\`\`json
[
  {"title":"Persistent issue","description":"This issue remains after reparse","severity":"high","filePath":"src/a.ts","lineStart":10},
  {"title":"Removed issue","description":"This issue disappears","severity":"medium","filePath":"src/b.ts","lineStart":20}
]
\`\`\``;

const changedResponse = `\`\`\`json
[
  {"title":"Persistent issue","description":"This issue remains after reparse","severity":"high","filePath":"src/a.ts","lineStart":10},
  {"title":"New issue","description":"This issue was introduced later","severity":"low","filePath":"src/c.ts","lineStart":30}
]
\`\`\``;

initLogService();

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('ReportService reparse status preservation', () => {
  let reviewDirectory: string;
  let service: ReportService;

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-reparse-'));
    temporaryDirectories.push(root);
    reviewDirectory = path.join(root, REVIEW_ID);
    await fs.mkdir(reviewDirectory, { recursive: true });
    service = new ReportService();
  });

  it('preserves an existing status, opens new issues, and drops removed issues', async () => {
    const original = await service.createReport(reviewDirectory, REVIEW_ID, originalResponse);
    await service.transitionIssueStatusOnDisk(
      reviewDirectory,
      REVIEW_ID,
      original.issues[0].issueId,
      'fixed',
      originalResponse,
    );

    const reparsed = await service.reparseReport(
      reviewDirectory,
      REVIEW_ID,
      changedResponse,
    );

    expect(reparsed.issues.map((issue) => issue.title)).toEqual([
      'Persistent issue',
      'New issue',
    ]);
    expect(reparsed.issues[0].status).toBe('fixed');
    expect(reparsed.issues[1].status).toBe('open');
    expect(reparsed.issues.some((issue) => issue.title === 'Removed issue')).toBe(false);
    expect((await service.readReport(reviewDirectory, REVIEW_ID, changedResponse)).status).toBe(
      'valid',
    );
  });

  it('uses sourceFingerprint as a compatibility fallback', async () => {
    const original = await service.createReport(reviewDirectory, REVIEW_ID, originalResponse);
    const fixed = service.transitionIssueStatus(original, original.issues[0].issueId, 'fixed');
    const compatibilityReport = {
      ...fixed,
      issues: fixed.issues.map((issue, index) =>
        index === 0 ? { ...issue, issueId: 'ISSUE-1111111111111111' } : issue,
      ),
    };
    await service.updateReport(reviewDirectory, compatibilityReport);

    const reparsed = await service.reparseReport(
      reviewDirectory,
      REVIEW_ID,
      originalResponse,
    );

    expect(reparsed.issues[0].issueId).toBe(original.issues[0].issueId);
    expect(reparsed.issues[0].status).toBe('fixed');
  });

  it('does not inherit status from a corrupt stored report', async () => {
    await fs.writeFile(path.join(reviewDirectory, 'report.json'), '{invalid', 'utf8');

    const reparsed = await service.reparseReport(
      reviewDirectory,
      REVIEW_ID,
      originalResponse,
    );

    expect(reparsed.issues.every((issue) => issue.status === 'open')).toBe(true);
    expect((await service.readReport(reviewDirectory, REVIEW_ID, originalResponse)).status).toBe(
      'valid',
    );
  });

  it('does not inherit status from an unsupported stored report', async () => {
    const original = await service.createReport(reviewDirectory, REVIEW_ID, originalResponse);
    const unsupported = {
      ...original,
      schemaVersion: 999,
      issues: [{ ...original.issues[0], status: 'fixed' }],
    };
    await fs.writeFile(
      path.join(reviewDirectory, 'report.json'),
      JSON.stringify(unsupported),
      'utf8',
    );

    const reparsed = await service.reparseReport(
      reviewDirectory,
      REVIEW_ID,
      originalResponse,
    );

    expect(reparsed.issues[0].status).toBe('open');
  });
});
