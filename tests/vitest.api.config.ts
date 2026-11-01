import { defineConfig } from 'vitest/config';

// Self-contained API tests: no production server, global setup, or shared reports.
export default defineConfig({
  test: {
    include: ['tests/unit/api.client.test.ts', 'tests/integration/api.routes.test.ts'],
    environment: 'node',
    fileParallelism: false,
    pool: 'forks',
  },
});
