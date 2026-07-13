import { describe, it, expect } from 'vitest';
import {
  parseReviewResponse,
  generateIssueIds,
  computeFingerprint,
  isValidStatus,
  canTransition,
  defaultStatus,
  type ParseContext,
} from '../index.js';

describe('@reviewlume/report-parser', () => {
  const context: ParseContext = { reviewId: '20260711T010203Z-aabbccddeeff' };

  describe('parseReviewResponse', () => {
    it('returns unstructured for empty input', () => {
      const result = parseReviewResponse('', context);
      expect(result.report.parseStatus).toBe('unstructured');
      expect(result.report.issues).toHaveLength(0);
      expect(result.issueCount).toBe(0);
    });

    it('returns unstructured for non-issue text', () => {
      const result = parseReviewResponse('This is just some random text.', context);
      expect(result.report.parseStatus).toBe('unstructured');
      expect(result.issueCount).toBe(0);
    });

    it('parses JSON issues from a fenced block', () => {
      const json = JSON.stringify([
        {
          title: 'SQL Injection',
          description: 'Unsanitized input in query',
          severity: 'critical',
          filePath: 'src/db.ts',
          line: 42,
        },
      ]);
      const response = `Here is my review:\n\n\`\`\`json\n${json}\n\`\`\``;
      const result = parseReviewResponse(response, context);
      expect(result.report.parseStatus).toBe('parsed');
      expect(result.issueCount).toBe(1);
      expect(result.report.issues[0].title).toBe('SQL Injection');
      expect(result.report.issues[0].severity).toBe('critical');
      expect(result.report.issues[0].filePath).toBe('src/db.ts');
      expect(result.report.issues[0].lineStart).toBe(42);
      expect(result.report.issues[0].status).toBe('open');
    });

    it('rejects absolute paths in JSON', () => {
      const json = JSON.stringify([
        {
          title: 'Path issue',
          description: 'Test',
          severity: 'low',
          filePath: '/etc/passwd',
        },
      ]);
      const result = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result.report.parseStatus).toBe('partial');
      expect(result.report.issues[0].filePath).toBeUndefined();
      expect(result.report.warnings.length).toBeGreaterThan(0);
    });

    it('parses JSON with issues wrapper', () => {
      const json = JSON.stringify({
        issues: [
          { title: 'Issue 1', description: 'Desc 1', severity: 'high' },
          { title: 'Issue 2', description: 'Desc 2', severity: 'medium' },
        ],
      });
      const result = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result.issueCount).toBe(2);
      expect(result.report.issues[0].severity).toBe('high');
      expect(result.report.issues[1].severity).toBe('medium');
    });

    it('parses Markdown severity sections', () => {
      const response = `## Critical

### SQL Injection Risk

- File: src/db.ts
- Line: 42
- Description: User input is not sanitized
- Suggestion: Use parameterized queries

## Medium

### Missing Error Handling

- File: src/api.ts
- Line: 100
- Description: No try-catch around async call`;
      const result = parseReviewResponse(response, context);
      expect(result.issueCount).toBeGreaterThanOrEqual(2);
      const criticalIssues = result.report.issues.filter((i) => i.severity === 'critical');
      expect(criticalIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('maps severity aliases', () => {
      const json = JSON.stringify([
        { title: 'T1', severity: 'CRITICAL' },
        { title: 'T2', severity: 'Crit' },
        { title: 'T3', severity: 'informational' },
        { title: 'T4', severity: 'unknown-value' },
      ]);
      const result = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result.report.issues[0].severity).toBe('critical');
      expect(result.report.issues[1].severity).toBe('critical');
      expect(result.report.issues[2].severity).toBe('info');
      expect(result.report.issues[3].severity).toBe('unknown');
    });

    it('generates unique stable issue IDs', () => {
      const json = JSON.stringify([
        { title: 'Issue A', description: 'Desc A', severity: 'high', filePath: 'src/a.ts', line: 10 },
        { title: 'Issue B', description: 'Desc B', severity: 'high', filePath: 'src/b.ts', line: 20 },
      ]);
      const result = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result.report.issues[0].issueId).toMatch(/^ISSUE-[0-9a-f]{16}$/);
      expect(result.report.issues[1].issueId).toMatch(/^ISSUE-[0-9a-f]{16}$/);
      expect(result.report.issues[0].issueId).not.toBe(result.report.issues[1].issueId);
    });

    it('generates stable IDs across repeated parses', () => {
      const json = JSON.stringify([
        { title: 'Same Issue', description: 'Same description', severity: 'medium', filePath: 'src/x.ts', line: 5 },
      ]);
      const result1 = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      const result2 = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result1.report.issues[0].issueId).toBe(result2.report.issues[0].issueId);
    });

    it('handles duplicate issues with different IDs', () => {
      const json = JSON.stringify([
        { title: 'Dup', description: 'Same', severity: 'low' },
        { title: 'Dup', description: 'Same', severity: 'low' },
      ]);
      const result = parseReviewResponse(`\`\`\`json\n${json}\n\`\`\``, context);
      expect(result.report.issues).toHaveLength(2);
      expect(result.report.issues[0].issueId).not.toBe(result.report.issues[1].issueId);
    });

    it('respects MAX_ISSUES limit', () => {
      const issues = Array.from({ length: 600 }, (_, i) => ({
        title: `Issue ${i}`,
        description: `Description ${i}`,
        severity: 'low',
      }));
      const result = parseReviewResponse(`\`\`\`json\n${JSON.stringify(issues)}\n\`\`\``, context);
      expect(result.report.issues.length).toBeLessThanOrEqual(500);
      expect(result.report.warnings.some((w) => w.includes('maximum'))).toBe(true);
    });
  });

  describe('issue ID generation', () => {
    it('generates deterministic IDs', () => {
      const inputs = [
        { reviewId: 'test-1', severity: 'high' as const, title: 'Issue', description: 'Desc', filePath: 'a.ts', lineStart: 1 },
      ];
      const ids1 = generateIssueIds(inputs);
      const ids2 = generateIssueIds(inputs);
      expect(ids1).toEqual(ids2);
    });

    it('generates unique IDs for different inputs', () => {
      const inputs = [
        { reviewId: 'test-1', severity: 'high' as const, title: 'Issue 1', description: 'Desc 1' },
        { reviewId: 'test-1', severity: 'high' as const, title: 'Issue 2', description: 'Desc 2' },
      ];
      const ids = generateIssueIds(inputs);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('generates different IDs for duplicate issues', () => {
      const inputs = [
        { reviewId: 'test-1', severity: 'low' as const, title: 'Same', description: 'Same' },
        { reviewId: 'test-1', severity: 'low' as const, title: 'Same', description: 'Same' },
      ];
      const ids = generateIssueIds(inputs);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('state machine', () => {
    it('default status is open', () => {
      expect(defaultStatus()).toBe('open');
    });

    it('validates known statuses', () => {
      expect(isValidStatus('open')).toBe(true);
      expect(isValidStatus('fixed')).toBe(true);
      expect(isValidStatus('rejected')).toBe(true);
      expect(isValidStatus('needs-review')).toBe(true);
      expect(isValidStatus('invalid')).toBe(false);
    });

    it('allows valid transitions', () => {
      expect(canTransition('open', 'fixed')).toBe(true);
      expect(canTransition('open', 'rejected')).toBe(true);
      expect(canTransition('open', 'needs-review')).toBe(true);
      expect(canTransition('fixed', 'open')).toBe(true);
      expect(canTransition('fixed', 'needs-review')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(canTransition('open', 'open')).toBe(false);
      expect(canTransition('fixed', 'rejected')).toBe(false);
      expect(canTransition('rejected', 'fixed')).toBe(false);
      expect(canTransition('needs-review', 'needs-review')).toBe(false);
    });
  });

  describe('fingerprint', () => {
    it('is case-insensitive for paths', () => {
      const f1 = computeFingerprint({
        reviewId: 'test', severity: 'high', title: 'Issue', description: 'Desc',
        filePath: 'SRC/File.ts',
      });
      const f2 = computeFingerprint({
        reviewId: 'test', severity: 'high', title: 'Issue', description: 'Desc',
        filePath: 'src/file.ts',
      });
      expect(f1).toBe(f2);
    });

    it('normalizes backslashes in paths', () => {
      const f1 = computeFingerprint({
        reviewId: 'test', severity: 'high', title: 'Issue', description: 'Desc',
        filePath: 'src\\sub\\file.ts',
      });
      const f2 = computeFingerprint({
        reviewId: 'test', severity: 'high', title: 'Issue', description: 'Desc',
        filePath: 'src/sub/file.ts',
      });
      expect(f1).toBe(f2);
    });
  });
});
