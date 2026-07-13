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
  /** Add the automatic export directory to the repository root .gitignore */
  ADD_EXPORT_DIRECTORY_TO_GITIGNORE: 'reviewlume.addExportDirectoryToGitignore',
  /** Open review history for the current workspace */
  OPEN_REVIEW_HISTORY: 'reviewlume.openReviewHistory',
  /** Import an AI review response */
  IMPORT_REVIEW_RESPONSE: 'reviewlume.importReviewResponse',
  /** Update one structured review issue status */
  UPDATE_ISSUE_STATUS: 'reviewlume.updateIssueStatus',
  /** Open the review panel Webview (P6) */
  OPEN_REVIEW_PANEL: 'reviewlume.openReviewPanel',
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
