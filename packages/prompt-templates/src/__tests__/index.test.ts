import { describe, it, expect } from 'vitest';
import { PromptTemplateService } from '../index.js';

describe('@reviewlume/prompt-templates', () => {
  it('should create a PromptTemplateService', () => {
    const service = new PromptTemplateService();
    expect(service).toBeInstanceOf(PromptTemplateService);
  });

  it('should return empty templates list in P0', async () => {
    const service = new PromptTemplateService();
    const templates = await service.getTemplates();
    expect(templates).toHaveLength(0);
  });
});
