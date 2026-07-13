/**
 * Review Panel Webview message types, DTOs, and inbound schema.
 * The Webview is an untrusted boundary. Every inbound message is validated
 * before dispatch and outbound DTOs intentionally exclude absolute paths.
 */
import { z } from 'zod';
import type { ExportFormat, ReviewScope } from '../localization';

export interface ReviewPanelFileDto {
  readonly path: string;
  readonly source: 'changed' | 'manual' | 'recommended' | 'context';
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
  readonly exportFormat: ExportFormat;
  readonly reviewScope: ReviewScope;
  readonly scopeContextCount: number;
  readonly scopeEligibleFileCount: number;
  readonly scopeEstimatedSourceBytes: number;
}

export type ReviewPanelOutboundMessage =
  | { readonly type: 'state'; readonly payload: ReviewPanelStateDto }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'copyComplete' }
  | { readonly type: 'formatUpdated'; readonly format: ExportFormat }
  | { readonly type: 'scopeUpdated'; readonly scope: ReviewScope };

const exportFormatSchema = z.enum(['markdown', 'zip', 'both']);
const reviewScopeSchema = z.enum(['changes', 'smart', 'full']);

export const ReviewPanelInboundMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createReviewPack') }).strict(),
  z.object({ type: z.literal('toggleFile'), filePath: z.string().min(1).max(1024), selected: z.boolean() }).strict(),
  z.object({ type: z.literal('addRelatedFiles') }).strict(),
  z.object({ type: z.literal('recommendTestFiles') }).strict(),
  z.object({ type: z.literal('scan') }).strict(),
  z.object({ type: z.literal('confirmWarning'), findingIds: z.array(z.string().min(1).max(256)).min(1).max(100) }).strict(),
  z.object({ type: z.literal('export') }).strict(),
  z.object({ type: z.literal('copyPrompt') }).strict(),
  z.object({ type: z.literal('updateGitignore') }).strict(),
  z.object({ type: z.literal('setExportFormat'), format: exportFormatSchema }).strict(),
  z.object({ type: z.literal('setReviewScope'), scope: reviewScopeSchema }).strict(),
  z.object({ type: z.literal('refresh') }).strict(),
]);

export type ReviewPanelInboundMessage = z.infer<typeof ReviewPanelInboundMessageSchema>;
