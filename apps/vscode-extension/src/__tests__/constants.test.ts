import { describe, it, expect } from 'vitest';
import { COMMANDS, VIEWS, OUTPUT_CHANNEL_NAME } from '../constants';

describe('constants', () => {
  describe('COMMANDS', () => {
    it('should define the hello command', () => {
      expect(COMMANDS.HELLO).toBe('reviewlume.hello');
    });

    it('should define the createReviewPack command', () => {
      expect(COMMANDS.CREATE_REVIEW_PACK).toBe('reviewlume.createReviewPack');
    });

    it('should define the openReviewHistory command', () => {
      expect(COMMANDS.OPEN_REVIEW_HISTORY).toBe('reviewlume.openReviewHistory');
    });

    it('should define the importReviewResponse command', () => {
      expect(COMMANDS.IMPORT_REVIEW_RESPONSE).toBe('reviewlume.importReviewResponse');
    });

    it('should have all command IDs as const (no extra properties)', () => {
      const keys = Object.keys(COMMANDS);
      expect(keys).toEqual([
        'HELLO',
        'CREATE_REVIEW_PACK',
        'OPEN_REVIEW_HISTORY',
        'IMPORT_REVIEW_RESPONSE',
      ]);
    });
  });

  describe('VIEWS', () => {
    it('should define the view container ID', () => {
      expect(VIEWS.CONTAINER).toBe('reviewlume');
    });

    it('should define the main view ID', () => {
      expect(VIEWS.MAIN_VIEW).toBe('reviewlume.mainView');
    });
  });

  describe('OUTPUT_CHANNEL_NAME', () => {
    it('should be "ReviewLume"', () => {
      expect(OUTPUT_CHANNEL_NAME).toBe('ReviewLume');
    });
  });
});
