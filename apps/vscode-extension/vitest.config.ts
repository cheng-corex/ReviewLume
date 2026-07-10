import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/vitest.setup.ts'],
    // Prevent tests from hanging when vscode APIs are unavailable
    hookTimeout: 10000,
    testTimeout: 10000,
  },
});
