/**
 * Command identifiers registered by ReviewLume.
 * All commands follow the `reviewlume.*` naming convention.
 */
export const COMMANDS = {
  /** P0 verification command */
  HELLO: 'reviewlume.hello',
  /** Create a new review pack from the current workspace */
  CREATE_REVIEW_PACK: 'reviewlume.createReviewPack',
  /** Add repository-local related files to the active review */
  ADD_RELATED_FILES: 'reviewlume.addRelatedFiles',
  /** Discover likely test files for the active selection */
  RECOMMEND_TEST_FILES: 'reviewlume.recommendTestFiles',
  /** Scan selected files for sensitive content */
  SCAN_SELECTED_FILES: 'reviewlume.scanSelectedFiles',
  /** Export a security-gated Review Pack */
  EXPORT_REVIEW_PACK: 'reviewlume.exportReviewPack',
  /** Open review history for the current workspace */
  OPEN_REVIEW_HISTORY: 'reviewlume.openReviewHistory',
  /** Import an AI review response */
  IMPORT_REVIEW_RESPONSE: 'reviewlume.importReviewResponse',
} as const;

/** View and view-container identifiers. */
export const VIEWS = {
  /** Activity Bar view container ID */
  CONTAINER: 'reviewlume',
  /** Main tree view shown in the Activity Bar */
  MAIN_VIEW: 'reviewlume.mainView',
} as const;

/** Output channel display name. */
export const OUTPUT_CHANNEL_NAME = 'ReviewLume';
