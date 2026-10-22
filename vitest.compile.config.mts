import { defineConfig } from 'vitest/config';

/** Compiles generated Java (javac) and TypeScript (tsc API) sources. Runs in Node. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/compile/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
