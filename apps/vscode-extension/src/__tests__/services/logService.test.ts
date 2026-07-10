import { describe, it, expect } from 'vitest';

// logService depends on vscode.window.createOutputChannel which is not
// available in plain vitest.  These tests verify the module structure.

describe('logService module structure', () => {
  it('should export initLogService as a function', async () => {
    const mod = await import('../../services/logService');
    expect(typeof mod.initLogService).toBe('function');
  });

  it('should export getLogChannel as a function', async () => {
    const mod = await import('../../services/logService');
    expect(typeof mod.getLogChannel).toBe('function');
  });

  it('should export logInfo as a function', async () => {
    const mod = await import('../../services/logService');
    expect(typeof mod.logInfo).toBe('function');
  });

  it('should export logWarn as a function', async () => {
    const mod = await import('../../services/logService');
    expect(typeof mod.logWarn).toBe('function');
  });

  it('should export logError as a function', async () => {
    const mod = await import('../../services/logService');
    expect(typeof mod.logError).toBe('function');
  });
});
