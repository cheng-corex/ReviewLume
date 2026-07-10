/**
 * @reviewlume/review-pack
 *
 * Review Pack builder and schema for ReviewLume.
 * Constructs the structured review pack Markdown and manifest.
 */

/** Schema version for the review pack format. */
export const REVIEW_PACK_SCHEMA_VERSION = 1;

/** Placeholder for the ReviewPackBuilder class. */
export class ReviewPackBuilder {
  /**
   * Build a review pack from the given content.
   * P0: Returns an empty object until the full implementation.
   */
  async build(_content: unknown): Promise<{ markdown: string; manifest: Record<string, unknown> }> {
    // TODO: P5 — implement full review pack building
    return {
      markdown: '',
      manifest: {
        schemaVersion: REVIEW_PACK_SCHEMA_VERSION,
      },
    };
  }
}
