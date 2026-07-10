import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('logService', () => {
  it('throws a clear error when accessed before initialization', async () => {
    const { getLogChannel } = await import('../../services/logService');
    expect(() => getLogChannel()).toThrow('has not been initialized');
  });

  it('initializes once and writes structured log levels', async () => {
    const { getLogChannel, initLogService, logError, logInfo, logWarn } = await import(
      '../../services/logService'
    );

    const channel = initLogService();
    expect(initLogService()).toBe(channel);
    expect(vscode.window.createOutputChannel).toHaveBeenCalledTimes(1);
    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('ReviewLume');
    expect(getLogChannel()).toBe(channel);

    logInfo('started');
    logWarn('careful');
    logError('failed', new Error('boom'));

    const appendLine = vi.mocked(channel.appendLine);
    const lines = appendLine.mock.calls.map(([line]) => line);
    expect(lines.some((line) => line.includes('[INFO] started'))).toBe(true);
    expect(lines.some((line) => line.includes('[WARN] careful'))).toBe(true);
    expect(lines.some((line) => line.includes('[ERROR] failed'))).toBe(true);
    expect(lines.some((line) => line.includes('boom'))).toBe(true);
  });
});
