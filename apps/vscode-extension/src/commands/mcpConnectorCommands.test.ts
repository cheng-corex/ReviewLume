import { describe, expect, it } from 'vitest';
import { isCancellationError } from './mcpConnectorCommands';

describe('isCancellationError', () => {
  it.each([
    new Error('Canceled'),
    new Error('Cancelled'),
    { name: 'Canceled' },
    { name: 'CancellationError' },
    { name: 'AbortError' },
    { code: 'ERR_CANCELED' },
    { code: 'ERR_CANCELLED' },
    'operation canceled',
  ])('accepts expected cancellation shape %#', (error) => {
    expect(isCancellationError(error)).toBe(true);
  });

  it.each([
    new Error('Proxy connection failed'),
    { name: 'Error', message: 'Canceled while validating a real configuration error' },
    { code: 'ECONNRESET' },
    undefined,
    null,
  ])('does not hide operational failure %#', (error) => {
    expect(isCancellationError(error)).toBe(false);
  });
});
