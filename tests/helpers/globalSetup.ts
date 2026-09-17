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

  // Verify server is up
  const maxAttempts = 10;
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      const res = await fetch('http://localhost:3000/api/healthcheck');
      if (res.ok) {
        console.log('✅ WealthOS server is live at http://localhost:3000');
        return;
      }
    } catch {
      // Server not ready yet
    }
    attempts++;
    await new Promise(r => setTimeout(r, 2000));
  }

  console.warn('⚠️ Server not detected at http://localhost:3000. Integration tests may fail.');
  console.warn('   Run: node dist/server.cjs  before executing tests.');
}

export async function teardown() {
  console.log('\n📊 Test run complete. Reports saved to tests/reports/');
}
