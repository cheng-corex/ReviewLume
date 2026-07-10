/**
 * @reviewlume/report-parser
 *
 * AI review report parser for ReviewLume.
 * Parses AI responses into structured review reports and issue tracking.
 */

/** A single review issue found in an AI response. */
export interface ReviewIssue {
  id: string;
  file: string;
  line?: number;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  title: string;
  description: string;
  status: 'open' | 'fixed' | 'rejected' | 'needs-review';
}

/** A parsed review report. */
export interface ReviewReport {
  reviewId: string;
  summary: string;
  issues: ReviewIssue[];
}

/** Service for parsing AI review responses. */
export class ReportParser {
  /**
   * Parse an AI response text into a structured report.
   * P0: Returns an empty report until the full implementation.
   */
  async parse(_reviewId: string, _responseText: string): Promise<ReviewReport> {
    // TODO: P7 — implement full report parsing
    return {
      reviewId: _reviewId,
      summary: '',
      issues: [],
    };
  }
}
