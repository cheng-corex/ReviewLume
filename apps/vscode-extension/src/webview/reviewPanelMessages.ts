/**
 * P6 — Review Panel Webview message types, DTOs, and inbound schema.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SECURITY: The Webview is an untrusted boundary. Every inbound
 * message MUST be validated with Zod before dispatch. The DTOs below
 * are the ONLY shape of data sent to the Webview.
 * ═══════════════════════════════════════════════════════════════════
 */
import { z } from 'zod';

// ─── Outbound DTOs (Extension → Webview) ──────────────────────────

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
  readonly repositoryRoot: string;
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
  | { readonly type: 'exportComplete'; readonly reviewId: string }
  | { readonly type: 'exportError'; readonly message: string }
  | { readonly type: 'copyComplete' };

// ─── Inbound messages (Webview → Extension) ───────────────────────

export const ReviewPanelInboundMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('createReviewPack'),
  }),
  z.object({
    type: z.literal('toggleFile'),
    filePath: z.string().min(1).max(1024),
    selected: z.boolean(),
  }),
  z.object({
    type: z.literal('addRelatedFiles'),
  }),
  z.object({
    type: z.literal('recommendTestFiles'),
  }),
  z.object({
    type: z.literal('scan'),
  }),
  z.object({
    type: z.literal('confirmWarning'),
    findingIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal('export'),
  }),
  z.object({
    type: z.literal('copyPrompt'),
  }),
  z.object({
    type: z.literal('updateGitignore'),
  }),
  z.object({
    type: z.literal('refresh'),
  }),
]);

export type ReviewPanelInboundMessage = z.infer<typeof ReviewPanelInboundMessageSchema>;
