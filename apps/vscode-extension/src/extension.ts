import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { initLogService, logInfo } from './services/logService';
import { registerCreateReviewPack } from './commands/createReviewPack';
import { registerFileSelectionCommands } from './commands/fileSelectionCommands';
import { registerOpenReviewHistory } from './commands/openReviewHistory';
import { registerImportReviewResponse } from './commands/importReviewResponse';
import { FileSelectionService } from './services/fileSelectionService';
import { LazyFileSelectionGitRunner } from './services/lazyFileSelectionGitRunner';
import { registerReviewLumeTreeView } from './views/reviewLumeTreeProvider';

/** Activates the ReviewLume VS Code extension. */
export function activate(context: vscode.ExtensionContext): void {
  const channel = initLogService();
  context.subscriptions.push(channel);
  logInfo('ReviewLume extension activating');

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.HELLO, () => {
      vscode.window.showInformationMessage('ReviewLume extension is active!');
      logInfo('hello command invoked');
    }),
  );

  const fileSelectionService = new FileSelectionService(new LazyFileSelectionGitRunner());
  const treeProvider = registerReviewLumeTreeView(context, fileSelectionService);

  registerCreateReviewPack(
    context,
    undefined,
    fileSelectionService,
    () => treeProvider.refresh(),
  );
  registerFileSelectionCommands(context, fileSelectionService, () => treeProvider.refresh());
  registerOpenReviewHistory(context);
  registerImportReviewResponse(context);

  logInfo('ReviewLume extension activated');
}

export function deactivate(): void {
  // VS Code disposes all resources registered on the extension context.
}
