import { describe, it, expect } from 'vitest';
import { COMMANDS, VIEWS, OUTPUT_CHANNEL_NAME } from '../constants';

describe('constants', () => {
  describe('COMMANDS', () => {
    it('defines every ReviewLume command ID', () => {
      expect(COMMANDS).toEqual({
        HELLO: 'reviewlume.hello',
        CREATE_REVIEW_PACK: 'reviewlume.createReviewPack',
        ADD_RELATED_FILES: 'reviewlume.addRelatedFiles',
        RECOMMEND_TEST_FILES: 'reviewlume.recommendTestFiles',
        SCAN_SELECTED_FILES: 'reviewlume.scanSelectedFiles',
        EXPORT_REVIEW_PACK: 'reviewlume.exportReviewPack',
        ADD_EXPORT_DIRECTORY_TO_GITIGNORE: 'reviewlume.addExportDirectoryToGitignore',
        OPEN_REVIEW_HISTORY: 'reviewlume.openReviewHistory',
        IMPORT_REVIEW_RESPONSE: 'reviewlume.importReviewResponse',
        UPDATE_ISSUE_STATUS: 'reviewlume.updateIssueStatus',
        GENERATE_IMPLEMENTATION_PROMPT: 'reviewlume.generateImplementationPrompt',
        IMPORT_IMPLEMENTATION_SUMMARY: 'reviewlume.importImplementationSummary',
        GENERATE_RE_REVIEW_PROMPT: 'reviewlume.generateReReviewPrompt',
        OPEN_REVIEW_PANEL: 'reviewlume.openReviewPanel',
      });
    });
  });

  describe('VIEWS', () => {
    it('defines the view IDs', () => {
      expect(VIEWS.CONTAINER).toBe('reviewlume');
      expect(VIEWS.MAIN_VIEW).toBe('reviewlume.mainView');
    });
  });

  it('uses the ReviewLume output channel name', () => {
    expect(OUTPUT_CHANNEL_NAME).toBe('ReviewLume');
  });
});
