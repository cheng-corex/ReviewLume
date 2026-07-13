import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReportService } from '../../services/reportService';
import { initLogService } from '../../services/logService';

const REVIEW_ID = '20260711T010203Z-aabbccddeeff';
const temporaryDirectories: string[] = [];
const response = `\`\`\`json
[{"title":"Concurrent status","description":"Exercise serialized transitions","severity":"high"}]
\`\`\``;

initLogService();

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('ReportService concurrent issue status updates', () => {
  it('serializes the complete read-modify-write and rejects the losing transition', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewlume-status-race-'));
    temporaryDirectories.push(root);
    const reviewDirectory = path.join(root, REVIEW_ID);
    await fs.mkdir(reviewDirectory, { recursive: true });

    const service = new ReportService();
    const report = await service.createReport(reviewDirectory, REVIEW_ID, response);
    const issueId = report.issues[0].issueId;

    const results = await Promise.allSettled([
      service.transitionIssueStatusOnDisk(
        reviewDirectory,
        REVIEW_ID,
        issueId,
        'fixed',
        response,
      ),
      new ReportService().transitionIssueStatusOnDisk(
        reviewDirectory,
        REVIEW_ID,
        issueId,
        'rejected',
        response,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const stored = await service.readReport(reviewDirectory, REVIEW_ID, response);
    expect(stored.status).toBe('valid');
    expect(['fixed', 'rejected']).toContain(stored.report?.issues[0].status);
    expect(
      (await fs.readdir(reviewDirectory)).filter((file) => file.startsWith('.report-')),
    ).toHaveLength(0);
  });
});
