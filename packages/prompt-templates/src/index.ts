/**
 * @reviewlume/prompt-templates
 *
 * Prompt template management for ReviewLume.
 * Manages review prompt templates in multiple languages and modes.
 */

export type { ReviewMode, ReviewLanguage } from '@reviewlume/core';

/** A single prompt template. */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  content: string;
}

/** Service for managing prompt templates. */
export class PromptTemplateService {
  private templates: PromptTemplate[] = [];

  /**
   * Get available templates.
   * P0: Returns an empty list until the full implementation.
   */
  async getTemplates(): Promise<PromptTemplate[]> {
    // TODO: P5 — implement template loading
    return this.templates;
  }

  /**
   * Render a template with the given variables.
   * P0: Returns an empty string until the full implementation.
   */
  async render(_templateId: string, _variables: Record<string, string>): Promise<string> {
    // TODO: P5 — implement template rendering
    return '';
  }
}
