import { defineConfig } from 'vitest/config';

/** Dedicated integration runner: avoids Vitest treating a directory or a
 * shell-expanded list of files as intersecting filters. */
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 30_000,
    hookTimeout: 10_000,
    fileParallelism: false,
    pool: 'forks',
    environment: 'node',
    globalSetup: 'tests/helpers/globalSetup.ts',
    reporter: ['verbose', 'json'],
    outputFile: { json: 'tests/reports/vitest-integration-results.json' },
  },
  resolve: {
    alias: {
      '../database.js': '../database.ts',
      '../../lib/decimalUtils.js': '../../lib/decimalUtils.ts',
    },
  },
});
