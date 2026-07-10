import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

let _channel: vscode.OutputChannel;

/**
 * Initialize the ReviewLume output channel.
 * Must be called once during extension activation.
 */
export function initLogService(): vscode.OutputChannel {
  _channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  return _channel;
}

/**
 * Return the OutputChannel instance.
 * Throws if `initLogService` was not called first.
 */
export function getLogChannel(): vscode.OutputChannel {
  return _channel;
}

/** Append an INFO-level message. */
export function logInfo(message: string): void {
  const ts = new Date().toISOString();
  _channel.appendLine(`[${ts}] [INFO] ${message}`);
}

/** Append a WARN-level message. */
export function logWarn(message: string): void {
  const ts = new Date().toISOString();
  _channel.appendLine(`[${ts}] [WARN] ${message}`);
}

/** Append an ERROR-level message with optional Error object. */
export function logError(message: string, error?: Error): void {
  const ts = new Date().toISOString();
  _channel.appendLine(`[${ts}] [ERROR] ${message}`);
  if (error?.stack) {
    _channel.appendLine(`[${ts}] [ERROR] Stack: ${error.stack}`);
  } else if (error?.message) {
    _channel.appendLine(`[${ts}] [ERROR] ${error.message}`);
  }
}
