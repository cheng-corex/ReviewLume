import { describe, it, expect } from 'vitest';
import { ReportParser } from '../index.js';

describe('@reviewlume/report-parser', () => {
  it('should create a ReportParser', () => {
    const parser = new ReportParser();
    expect(parser).toBeInstanceOf(ReportParser);
  });

  it('should return empty report in P0', async () => {
    const parser = new ReportParser();
    const report = await parser.parse('test-id', 'Some AI response');
    expect(report.reviewId).toBe('test-id');
    expect(report.issues).toHaveLength(0);
  });
});
