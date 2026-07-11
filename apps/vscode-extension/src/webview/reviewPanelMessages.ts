/**
 * P6 — Review Panel Webview message types, DTOs, and inbound schema.
 * The Webview is an untrusted boundary. Every inbound message is validated
 * before dispatch and outbound DTOs intentionally exclude absolute paths.
 */
import { z } from 'zod';

export interface ReviewPanelFileDto {
  readonly path: string;
  readonly source: 'changed' | 'manual' | 'recommended';
  readonly changeKinds: readonly string[];
  readonly exists: boolean;
  readonly selected: boolean;
}

export interface ReviewPanelFindingDto {
  readonly id: string;
  readonly level: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: string;
  readonly message: string;
  readonly preview: string;
  readonly confirmed: boolean;
}

export interface ReviewPanelStateDto {
  readonly hasSession: boolean;
  readonly repositoryDisplayName: string;
  readonly files: readonly ReviewPanelFileDto[];
  readonly selectedCount: number;
  readonly totalCount: number;
  readonly findings: readonly ReviewPanelFindingDto[];
  readonly hardBlockCount: number;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly confirmedWarnCount: number;
  readonly canExport: boolean;
  readonly hasScanResult: boolean;
  readonly reviewPackPreview: string;
  readonly reviewPackByteLength: number;
  readonly reviewPackCharLength: number;
  readonly reviewPackTruncated: boolean;
  readonly truncationMessages: readonly string[];
  readonly estimatedTokens: number;
}

export type ReviewPanelOutboundMessage =
  | { readonly type: 'state'; readonly payload: ReviewPanelStateDto }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'scanComplete'; readonly payload: ReviewPanelStateDto }
  | { readonly type: 'copyComplete' };

const emptyMessage = <T extends string>(type: T) =>
  z.object({ type: z.literal(type) }).strict();

export const ReviewPanelInboundMessageSchema = z.discriminatedUnion('type', [
  emptyMessage('createReviewPack'),
  z
    .object({
      type: z.literal('toggleFile'),
      filePath: z.string().min(1).max(1024),
      selected: z.boolean(),
    })
    .strict(),
  emptyMessage('addRelatedFiles'),
  emptyMessage('recommendTestFiles'),
  emptyMessage('scan'),
  z
    .object({
      type: z.literal('confirmWarning'),
      findingIds: z.array(z.string().min(1).max(256)).min(1).max(100),
    })
    .strict(),
  emptyMessage('export'),
  emptyMessage('copyPrompt'),
  emptyMessage('updateGitignore'),
  emptyMessage('refresh'),
]);

export type ReviewPanelInboundMessage = z.infer<typeof ReviewPanelInboundMessageSchema>;
