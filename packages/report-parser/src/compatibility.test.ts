import { describe, expect, it } from 'vitest';
import { parseReviewResponse } from './compatibility.js';

const context = { reviewId: '20260714T010203Z-aabbccddeeff' };

describe('report parser compatibility entry', () => {
  it('parses a whole-response JSON object without a Markdown fence', () => {
    const response = JSON.stringify({
      issues: [
        {
          title: 'SQL injection risk',
          description: 'User input is concatenated into a query.',
          severity: 'critical',
          filePath: 'src/db.ts',
          line: 42,
        },
      ],
    });

    const result = parseReviewResponse(response, context);

    expect(result.issueCount).toBe(1);
    expect(result.report.parseStatus).toBe('parsed');
    expect(result.report.issues[0]).toMatchObject({
      title: 'SQL injection risk',
      severity: 'critical',
      filePath: 'src/db.ts',
      lineStart: 42,
    });
  });

  it('maps Chinese severity prefixes in numbered Markdown issues', () => {
    const response = [
      '1. 严重：SQL 注入风险',
      '用户输入未经处理直接拼接到 SQL 查询中。',
      '',
      '2. 高：缺少权限校验',
      '接口未检查当前用户是否有操作权限。',
      '',
      '3. 中：测试覆盖不足',
      '相关异常分支没有单元测试。',
      '',
      '4. 低：错误信息不清晰',
      '错误提示无法帮助用户定位问题。',
    ].join('\n');

    const result = parseReviewResponse(response, context);

    expect(result.issueCount).toBe(4);
    expect(result.report.issues.map((issue) => issue.severity)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
    ]);
  });

  it('does not reinterpret invalid JSON as structured JSON', () => {
    const result = parseReviewResponse('{"issues":[}', context);

    expect(result.issueCount).toBe(0);
    expect(result.report.parseStatus).toBe('unstructured');
  });
});
