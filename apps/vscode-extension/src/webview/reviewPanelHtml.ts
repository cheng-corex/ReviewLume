import * as vscode from 'vscode';
import type { ReviewPanelStrings } from '../localization';

export function buildReviewPanelHtml(
  webview: vscode.Webview,
  nonce: string,
  strings: ReviewPanelStrings,
): string {
  const cspSource = webview.cspSource;
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(vscode.Uri.file(__dirname), 'media', 'reviewPanel.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(vscode.Uri.file(__dirname), 'media', 'reviewPanel.css'),
  );
  const themeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(vscode.Uri.file(__dirname), 'media', 'reviewPanelTheme.css'),
  );
  const serializedStrings = JSON.stringify(strings)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return /* html */ `<!DOCTYPE html>
<html lang="${strings.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource}; img-src ${cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <link rel="stylesheet" href="${themeUri}">
  <title>${strings.panelTitle}</title>
</head>
<body>
  <div id="app" class="app">
    <div id="loading" class="loading-indicator">${strings.loading}</div>
  </div>
  <script nonce="${nonce}">window.__REVIEWLUME_I18N__ = ${serializedStrings};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
