/**
 * Command identifiers registered by ReviewLume.
 * All commands follow the `reviewlume.*` naming convention.
 */
export const COMMANDS = {
  /** P0 verification command */
  HELLO: 'reviewlume.hello',
  /** Create a new review pack from the current workspace */
  CREATE_REVIEW_PACK: 'reviewlume.createReviewPack',
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
