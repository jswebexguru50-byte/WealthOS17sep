/**
 * Global Setup for Vitest — runs once before all test suites
 *
 * Starts the WealthOS Express server as a child process on port 3000
 * (matching the hardcoded BASE URLs in integration tests), waits until
 * it responds to /api/healthcheck, then tears it down after all tests.
 *
 * If a server is already running on port 3000 (e.g. the developer ran
 * `npm run dev` or `npm start` before running tests), the setup skips
 * spawning and teardown is a no-op.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import BetterSqlite3 from 'better-sqlite3';

let serverProcess: ChildProcess | null = null;
let serverWasAlreadyRunning = false;
let isolatedDbPath: string | null = null;

const PORT = 3000;
const HEALTH_URL = `http://localhost:${PORT}/api/healthcheck`;
const MAX_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

async function isServerReady(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`WealthOS server did not become ready within ${MAX_WAIT_MS / 1000}s`);
}

export async function setup() {
  // Ensure reports/screenshots directories exist
  const reportsDir = path.resolve(process.cwd(), 'tests/reports');
  const screenshotsDir = path.resolve(process.cwd(), 'tests/screenshots');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  if (process.env.ISOLATED_TEST_DB === '1') {
    const tempDir = path.resolve(process.cwd(), 'tests/.tmp');
    fs.mkdirSync(tempDir, { recursive: true });
    isolatedDbPath = path.join(tempDir, `portfolio-${process.pid}.db`);
    const source = process.env.DATABASE_URL || path.resolve(process.cwd(), 'portfolio.db');
    if (fs.existsSync(source)) fs.copyFileSync(source, isolatedDbPath);
    else fs.closeSync(fs.openSync(isolatedDbPath, 'w'));
    process.env.DATABASE_URL = isolatedDbPath;
    const db = new BetterSqlite3(isolatedDbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT);
      CREATE TABLE IF NOT EXISTS company_check_result (symbol TEXT, check_id TEXT, status TEXT, details TEXT, created_at TEXT);`);
    db.close();
    console.log(`[globalSetup] isolated test database: ${isolatedDbPath}`);
  }

  // Check if server already running (developer has it up)
  if (await isServerReady()) {
    if (process.env.ISOLATED_TEST_DB === '1') {
      throw new Error('ISOLATED_TEST_DB=1 requires port 3000 to be free; stop the running WealthOS server before coverage/integration tests.');
    }
    console.log(`[globalSetup] WealthOS server already live at http://localhost:${PORT} — skipping spawn`);
    serverWasAlreadyRunning = true;
    return;
  }

  console.log(`[globalSetup] Spawning WealthOS server on port ${PORT}…`);

  const cwd = process.cwd();
  // Use tsx to run server.ts directly (same as `npm run dev` but without Vite)
  // tsx is available because it is a dev dependency used by the dev script.
  serverProcess = spawn(
    'npx',
    ['tsx', 'server.ts'],
    {
      cwd,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        // Suppress integrity check to speed up startup (see CLAUDE.md)
        SKIP_INTEGRITY_CHECK: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) process.stdout.write(`[server] ${line}\n`);
  });

  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) process.stderr.write(`[server:err] ${line}\n`);
  });

  serverProcess.on('error', (err) => {
    console.error('[globalSetup] Failed to spawn server:', err.message);
  });

  try {
    await waitForServer();
    console.log(`[globalSetup] ✅ WealthOS server ready at http://localhost:${PORT}`);
  } catch (err) {
    // Kill the process if it never became ready
    serverProcess?.kill('SIGTERM');
    serverProcess = null;
    throw err;
  }
}

export async function teardown() {
  if (serverWasAlreadyRunning || !serverProcess) {
    console.log('[globalSetup] teardown: server was pre-existing or not spawned — skipping shutdown');
    return;
  }

  console.log('[globalSetup] Shutting down test server…');
  serverProcess.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess?.kill('SIGKILL');
      resolve();
    }, 5_000);

    serverProcess!.on('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  console.log('[globalSetup] Test server stopped.');
  if (isolatedDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(`${isolatedDbPath}${suffix}`, { force: true }); } catch { /* best effort */ }
    }
  }
}
