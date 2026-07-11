/**
 * P6 — Generates the ReviewLume Review Panel Webview HTML with a strict
 * Content-Security-Policy. No remote scripts, fonts, or images are allowed.
 */
import * as vscode from 'vscode';

/**
 * Build the full HTML document for the review panel Webview.
 *
 * @param webview  The webview instance (used to retrieve local URIs).
 * @param nonce    A crypto nonce for the inline <script> tag.
 */
export function buildReviewPanelHtml(
  webview: vscode.Webview,
  nonce: string,
): string {
  const cspSource = webview.cspSource;
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(vscode.Uri.file(__dirname), 'media', 'reviewPanel.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(vscode.Uri.file(__dirname), 'media', 'reviewPanel.css'),
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
               script-src 'nonce-${nonce}';
               style-src 'nonce-${nonce}' ${cspSource};
               img-src ${cspSource} data:;">
  <link rel="stylesheet" nonce="${nonce}" href="${styleUri}">
  <title>ReviewLume Review Panel</title>
</head>
<body>
  <div id="app" class="app">
    <div id="loading" class="loading-indicator">Loading ReviewLume session…</div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
