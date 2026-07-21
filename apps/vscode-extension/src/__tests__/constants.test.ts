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
        IMPORT_RE_REVIEW_RESPONSE: 'reviewlume.importReReviewResponse',
        VIEW_RE_REVIEW_COMPARISON: 'reviewlume.viewReReviewComparison',
        OPEN_REVIEW_PANEL: 'reviewlume.openReviewPanel',
        MCP_CONNECTOR_MENU: 'reviewlume.mcpConnectorMenu',
        CONNECT_SECURE_MCP_TUNNEL: 'reviewlume.connectSecureMcpTunnel',
        CONFIGURE_SECURE_MCP_TUNNEL: 'reviewlume.configureSecureMcpTunnel',
        OPEN_SECURE_MCP_TUNNEL_UI: 'reviewlume.openSecureMcpTunnelUi',
        START_MCP_CONNECTOR: 'reviewlume.startMcpConnector',
        COPY_MCP_CONNECTION_INFO: 'reviewlume.copyMcpConnectionInfo',
        STOP_MCP_CONNECTOR: 'reviewlume.stopMcpConnector',
        BROWSER_BRIDGE_MENU: 'reviewlume.browserBridgeMenu',
        START_BROWSER_BRIDGE: 'reviewlume.startBrowserBridge',
        PAIR_BROWSER_EXTENSION: 'reviewlume.pairBrowserExtension',
        REVOKE_BROWSER_SESSIONS: 'reviewlume.revokeBrowserSessions',
        SEND_PROMPT_TO_BROWSER: 'reviewlume.sendPromptToBrowser',
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
