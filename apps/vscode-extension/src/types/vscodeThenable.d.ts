import 'vscode';

declare module 'vscode' {
  namespace window {
    function showQuickPick<T extends QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: QuickPickOptions,
      token?: CancellationToken,
    ): Promise<T | undefined>;
  }
}
