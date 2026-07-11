import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    // Integration tests create temp git repos; allow ample time
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Retry flaky tests in CI
    retry: process.env.CI ? 2 : 0,
  },
});
