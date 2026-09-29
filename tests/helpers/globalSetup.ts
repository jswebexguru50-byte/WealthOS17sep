/**
 * Global Setup for Vitest — runs once before all test suites
 * Verifies the server is live and creates the reports directory
 */
import * as fs from 'fs';
import * as path from 'path';

export async function setup() {
  // Ensure reports directory exists
  const reportsDir = path.resolve(process.cwd(), 'tests/reports');
  const screenshotsDir = path.resolve(process.cwd(), 'tests/screenshots');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  // Quick check if external server is live (in-process tests do not require it)
  try {
    const res = await fetch('http://localhost:3000/api/healthcheck', { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      console.log('✅ WealthOS server is live at http://localhost:3000');
      return;
    }
  } catch {
    // External server not running — self-contained tests will use in-process app
  }
}

export async function teardown() {
  console.log('\n📊 Test run complete. Reports saved to tests/reports/');
}
