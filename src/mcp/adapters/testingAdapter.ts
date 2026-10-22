/**
 * Test Execution Plane Adapter
 * Master Developer Specification — Section Z
 *
 * Exposes controlled, allowlisted execution of test suites without allowing
 * arbitrary shell command execution.
 */

import { execSync } from 'child_process';

const ALLOWLISTED_SUITES: Record<string, string> = {
  unit: 'npx vitest run tests/unit --reporter=json',
  integration: 'npx vitest run tests/integration --reporter=json',
  strategies: 'npx vitest run tests/unit/seven_strategies_candidates.test.ts --reporter=json',
  xirr: 'npx vitest run tests/unit/xirr.test.ts --reporter=json',
  acceptance: 'npx vitest run tests/unit/v2_closure_mandate.test.ts --reporter=json',
  verification: 'npx tsx scripts/readiness/independent_verification/run_product_verification.ts'
};

export class TestingAdapter {
  static listTestSuites() {
    return Object.keys(ALLOWLISTED_SUITES).map(k => ({
      suiteId: k,
      command: ALLOWLISTED_SUITES[k],
      scope: k.toUpperCase()
    }));
  }

  static runTests(suiteId: string, options?: { filter?: string; symbols?: string[] }) {
    let baseCmd = ALLOWLISTED_SUITES[suiteId.toLowerCase()];
    if (!baseCmd) {
      throw new Error(`UNKNOWN_SUITE: Suite '${suiteId}' is not allowlisted. Available: ${Object.keys(ALLOWLISTED_SUITES).join(', ')}`);
    }

    // Strictly sanitize optional filter to alphanumeric, underscores, and dashes only
    if (options?.filter) {
      const sanitizedFilter = options.filter.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
      if (sanitizedFilter) {
        baseCmd += ` -t "${sanitizedFilter}"`;
      }
    }

    const startTime = Date.now();
    try {
      const output = execSync(baseCmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 90000 // 90s timeout
      });
      const durationMs = Date.now() - startTime;
      return {
        suiteId,
        filter: options?.filter,
        symbols: options?.symbols,
        status: 'PASS',
        durationMs,
        rawOutput: output.slice(-4000), // bounded tail output
        passed: true
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        suiteId,
        filter: options?.filter,
        symbols: options?.symbols,
        status: 'FAIL',
        durationMs,
        rawOutput: (err.stdout || err.message || '').slice(-4000),
        error: err.message,
        passed: false
      };
    }
  }
}
