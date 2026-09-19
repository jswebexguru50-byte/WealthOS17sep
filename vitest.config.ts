/**
 * Vitest Configuration — WealthOS Unit & Integration Tests
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/reference/**/*.test.ts',
      'tests/v67/**/*.test.ts',
      'tests/v672/**/*.test.ts',
    ],
    exclude: [
      'tests/e2e/**',
      'src/server/__tests__/**', // Separate existing test suite
      'node_modules/**',
    ],

    // Global timeout: 30s for integration tests (live server)
    testTimeout: 30_000,
    hookTimeout: 10_000,

    // Run in sequence to avoid DB lock and HTTP port contention
    fileParallelism: false,
    pool: 'forks',

    // Reporters
    reporter: ['verbose', 'json'],
    outputFile: {
      json: 'tests/reports/vitest-results.json',
    },

    // Environment
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'tests/reports/coverage',
      include: [
        'src/server/fifoEngine.ts',
        'src/server/xirr.ts',
        'src/server/services/TaxHarvestingEngine.ts',
        'src/server/services/CorporateActionsEngine.ts',
        'src/server/services/OpportunityEnginePhase4to6.ts',
        'src/lib/decimalUtils.ts',
        'src/lib/tradingCalendar.ts',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },

    // Global setup / teardown
    globalSetup: 'tests/helpers/globalSetup.ts',
  },

  resolve: {
    // Handle .js extensions in TypeScript imports
    alias: {
      '../database.js': '../database.ts',
      '../../lib/decimalUtils.js': '../../lib/decimalUtils.ts',
    },
  },
});
