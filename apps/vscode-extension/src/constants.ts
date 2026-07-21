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
  /** Generate a bounded implementation prompt from selected review issues */
  GENERATE_IMPLEMENTATION_PROMPT: 'reviewlume.generateImplementationPrompt',
  /** Import a human-controlled implementation summary */
  IMPORT_IMPLEMENTATION_SUMMARY: 'reviewlume.importImplementationSummary',
  /** Generate a bounded re-review prompt linked to the same review session */
  GENERATE_RE_REVIEW_PROMPT: 'reviewlume.generateReReviewPrompt',
  /** Import and persist a re-review response for the active review round */
  IMPORT_RE_REVIEW_RESPONSE: 'reviewlume.importReReviewResponse',
  /** Open a read-only comparison of baseline and completed re-review findings */
  VIEW_RE_REVIEW_COMPARISON: 'reviewlume.viewReReviewComparison',
  /** Open the review panel Webview (P6) */
  OPEN_REVIEW_PANEL: 'reviewlume.openReviewPanel',
  /** Open the primary read-only MCP action menu. */
  MCP_CONNECTOR_MENU: 'reviewlume.mcpConnectorMenu',
  /** Start a loopback-only MCP endpoint bound to one Git repository. */
  START_MCP_CONNECTOR: 'reviewlume.startMcpConnector',
  /** Copy endpoint and bearer-token information for Secure MCP Tunnel setup. */
  COPY_MCP_CONNECTION_INFO: 'reviewlume.copyMcpConnectionInfo',
  /** Stop the MCP endpoint and invalidate its bearer token. */
  STOP_MCP_CONNECTOR: 'reviewlume.stopMcpConnector',
  /** Legacy P9 prototype: open the browser bridge action menu. */
  BROWSER_BRIDGE_MENU: 'reviewlume.browserBridgeMenu',
  /** Legacy P9 prototype: start the loopback browser bridge. */
  START_BROWSER_BRIDGE: 'reviewlume.startBrowserBridge',
  /** Legacy P9 prototype: create a browser-extension pairing code. */
  PAIR_BROWSER_EXTENSION: 'reviewlume.pairBrowserExtension',
  /** Legacy P9 prototype: revoke browser-extension sessions. */
  REVOKE_BROWSER_SESSIONS: 'reviewlume.revokeBrowserSessions',
  /** Legacy P9 prototype: queue a prompt for a browser extension. */
  SEND_PROMPT_TO_BROWSER: 'reviewlume.sendPromptToBrowser',
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
