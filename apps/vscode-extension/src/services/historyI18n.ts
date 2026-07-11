import * as vscode from 'vscode';

/** Runtime strings for history Quick Picks and notifications. */
export function historyText(english: string, chinese: string): string {
  return vscode.env.language.toLowerCase().startsWith('zh') ? chinese : english;
}
