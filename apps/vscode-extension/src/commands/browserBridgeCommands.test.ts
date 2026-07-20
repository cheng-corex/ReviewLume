import { describe, expect, it } from 'vitest';
import { createPairingHandoffUrl } from './browserBridgeCommands';

describe('createPairingHandoffUrl', () => {
  it('keeps one-time pairing data in the URL fragment only', () => {
    const value = createPairingHandoffUrl(
      'http://127.0.0.1:1072',
      'A1B2C3D4',
      'chatgpt.com',
    );
    const parsed = new URL(value);

    expect(parsed.origin).toBe('http://127.0.0.1:1072');
    expect(parsed.pathname).toBe('/connect');
    expect(parsed.search).toBe('');

    const fragment = new URLSearchParams(parsed.hash.slice(1));
    expect(fragment.get('v')).toBe('1');
    expect(fragment.get('code')).toBe('A1B2C3D4');
    expect(fragment.get('site')).toBe('chatgpt.com');
  });
});
