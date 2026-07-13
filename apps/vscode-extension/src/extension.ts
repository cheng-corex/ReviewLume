import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { initLogService, logInfo } from './services/logService';
import { registerCreateReviewPack } from './commands/createReviewPack';
import { registerFileSelectionCommands } from './commands/fileSelectionCommands';
import { registerSecurityReviewCommands } from './commands/securityReviewCommands';
import { registerOpenReviewHistory } from './commands/openReviewHistory';
import { registerOpenReviewPanel } from './commands/openReviewPanel';
import { registerImportReviewResponse } from './commands/importReviewResponse';
import { FileSelectionService } from './services/fileSelectionService';
import { LazyFileSelectionGitRunner } from './services/lazyFileSelectionGitRunner';
import { ReviewScopeService } from './services/reviewScopeService';
import { SecurityReviewService } from './services/securityReviewService';
import {
  registerReviewLumeTreeView,
  type ReviewLumeTreeProvider,
} from './views/reviewLumeTreeProvider';
import { refreshReviewPanel } from './webview/reviewPanel';

/** Activates the ReviewLume VS Code extension. */
export function activate(context: vscode.ExtensionContext): void {
  const channel = initLogService();
  context.subscriptions.push(channel);
  logInfo('ReviewLume extension activating');

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.HELLO, () => {
      void vscode.window.showInformationMessage('ReviewLume extension is active!');
      logInfo('hello command invoked');
    }),
  );

  const gitRunner = new LazyFileSelectionGitRunner();
  const fileSelectionService = new FileSelectionService(gitRunner);
  const reviewScopeService = new ReviewScopeService(fileSelectionService);
  const securityReviewService = new SecurityReviewService(
    fileSelectionService,
    gitRunner,
    undefined,
    undefined,
    reviewScopeService,
  );

  let treeProvider: ReviewLumeTreeProvider;
  const refreshViews = (): void => {
    treeProvider.refresh();
    refreshReviewPanel();
  };
  const selectionChanged = (): void => {
    securityReviewService.invalidate();
    refreshViews();
  };
  const treeSelectionChanged = async (refreshSmartContext: boolean): Promise<void> => {
    if (refreshSmartContext) await reviewScopeService.refreshSmartContext();
    selectionChanged();
  };

  treeProvider = registerReviewLumeTreeView(
    context,
    fileSelectionService,
    treeSelectionChanged,
  );

  registerCreateReviewPack(
    context,
    undefined,
    fileSelectionService,
    selectionChanged,
    reviewScopeService,
  );
  registerFileSelectionCommands(
    context,
    fileSelectionService,
    selectionChanged,
    reviewScopeService,
  );
  registerSecurityReviewCommands(context, securityReviewService, refreshViews);
  registerOpenReviewHistory(context, fileSelectionService);
  registerOpenReviewPanel(
    context,
    fileSelectionService,
    securityReviewService,
    reviewScopeService,
  );
  registerImportReviewResponse(context, fileSelectionService);

  logInfo('ReviewLume extension activated');
}

export function deactivate(): void {
  // VS Code disposes all resources registered on the extension context.
}
