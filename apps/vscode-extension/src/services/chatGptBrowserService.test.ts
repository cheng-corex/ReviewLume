import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserPreferenceLabel,
  normalizeBrowserPreference,
  resolveBrowserLaunchCommands,
} from './chatGptBrowserService';

describe('ChatGptBrowserService helpers', () => {
  it('normalizes only supported persisted browser choices', () => {
    expect(normalizeBrowserPreference('default')).toBe('default');
    expect(normalizeBrowserPreference('edge')).toBe('edge');
    expect(normalizeBrowserPreference('chrome')).toBe('chrome');
    expect(normalizeBrowserPreference('firefox')).toBeUndefined();
    expect(normalizeBrowserPreference(undefined)).toBeUndefined();
  });

  it('prefers an installed Windows Edge executable and keeps the URL as one argument', () => {
    const programFiles = 'C:\\Program Files (x86)';
    const executable = path.join(
      programFiles,
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    );
    const commands = resolveBrowserLaunchCommands(
      'edge',
      'win32',
      { 'PROGRAMFILES(X86)': programFiles },
      (value) => value === executable,
      'https://chatgpt.com/',
    );

    expect(commands[0]).toEqual({
      command: executable,
      args: ['https://chatgpt.com/'],
    });
    expect(commands.at(-1)).toEqual({
      command: 'msedge.exe',
      args: ['https://chatgpt.com/'],
    });
  });

  it('uses the macOS application launcher without a shell', () => {
    expect(
      resolveBrowserLaunchCommands(
        'chrome',
        'darwin',
        {},
        () => false,
        'https://chatgpt.com/',
      ),
    ).toEqual([
      {
        command: '/usr/bin/open',
        args: ['-a', 'Google Chrome', 'https://chatgpt.com/'],
      },
    ]);
  });

  it('provides Linux command fallbacks for explicit browser selection', () => {
    expect(
      resolveBrowserLaunchCommands(
        'edge',
        'linux',
        {},
        () => false,
        'https://chatgpt.com/',
      ).map((candidate) => candidate.command),
    ).toEqual(['microsoft-edge', 'microsoft-edge-stable']);
    expect(browserPreferenceLabel('chrome')).toBe('Google Chrome');
  });
});
