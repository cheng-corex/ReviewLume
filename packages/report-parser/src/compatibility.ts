import {
  parseReviewResponse as parseBaseReviewResponse,
  type ParseResult,
} from './parser.js';
import type { ParseContext } from './types.js';

const CHINESE_SEVERITY_ALIASES: Readonly<Record<string, string>> = {
  严重: 'critical',
  致命: 'critical',
  高: 'high',
  中: 'medium',
  低: 'low',
  信息: 'info',
  提示: 'info',
};

/**
 * Public parser entry with conservative compatibility normalization.
 *
 * It only rewrites two unambiguous response shapes before delegating to the
 * core parser:
 * - the entire response is a valid JSON object/array;
 * - a numbered Markdown item starts with a known Chinese severity label.
 */
export function parseReviewResponse(
  response: string,
  context: ParseContext,
): ParseResult {
  return parseBaseReviewResponse(normalizeCompatibleResponse(response), context);
}

export type { ParseResult } from './parser.js';

function normalizeCompatibleResponse(response: string): string {
  const rawJson = wrapWholeResponseJson(response);
  if (rawJson) return rawJson;
  return normalizeChineseSeverityPrefixes(response);
}

function wrapWholeResponseJson(response: string): string | undefined {
  const trimmed = response.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return undefined;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return `\`\`\`json\n${trimmed}\n\`\`\``;
  } catch {
    return undefined;
  }
}

function normalizeChineseSeverityPrefixes(response: string): string {
  return response.replace(
    /^(\s*\d+[.)]\s*)(严重|致命|高|中|低|信息|提示)\s*[：:]\s*(.+)$/gm,
    (_match, prefix: string, rawSeverity: string, remainder: string) =>
      `${prefix}[${CHINESE_SEVERITY_ALIASES[rawSeverity]}] ${remainder}`,
  );
}
