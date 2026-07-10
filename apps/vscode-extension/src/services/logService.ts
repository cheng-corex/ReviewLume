import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

let _channel: vscode.OutputChannel | undefined;

/**
 * Initialize the ReviewLume output channel.
 * Safe to call more than once during the same extension-host session.
 */
export function initLogService(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return _channel;
}

/**
 * Return the OutputChannel instance.
 * Throws if `initLogService` was not called first.
 */
export function getLogChannel(): vscode.OutputChannel {
  if (!_channel) {
    throw new Error('ReviewLume log service has not been initialized.');
  }
  return _channel;
}

function append(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  getLogChannel().appendLine(`[${ts}] [${level}] ${message}`);
}

/** Append an INFO-level message. */
export function logInfo(message: string): void {
  append('INFO', message);
}

/** Append a WARN-level message. */
export function logWarn(message: string): void {
  append('WARN', message);
}

/** Append an ERROR-level message with optional Error object. */
export function logError(message: string, error?: Error): void {
  append('ERROR', message);
  if (error?.stack) {
    append('ERROR', `Stack: ${error.stack}`);
  } else if (error?.message) {
    append('ERROR', error.message);
  }
}
