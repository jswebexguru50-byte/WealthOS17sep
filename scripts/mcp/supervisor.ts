/**
 * WealthOS Universal MCP — Local Windows Process Supervisor
 * Wave 8 / Section P: Local Process Supervision & Fail-Closed Guard
 *
 * Keeps the MCP server running locally on 127.0.0.1:8787.
 * Restarts on crashes, verifies health heartbeat, and guarantees zero cloud exposure.
 */

import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const HOST = '127.0.0.1';
const PORT = 8787;
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const CHECK_INTERVAL_MS = 10000;

function checkSecrets() {
  if (!process.env.WEALTHOS_PRODUCT_KEY) {
    console.warn('[SUPERVISOR WARNING] WEALTHOS_PRODUCT_KEY is not set in environment. Product MCP plane will fail closed.');
  }
  if (!process.env.WEALTHOS_DEV_KEY) {
    console.warn('[SUPERVISOR WARNING] WEALTHOS_DEV_KEY is not set in environment. Dev/Review MCP plane will fail closed.');
  }
}

let mcpProcess: ChildProcess | null = null;
let isShuttingDown = false;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    console.log(`[SUPERVISOR] Starting WealthOS Universal MCP Server on ${HOST}:${PORT}...`);
    mcpProcess = spawn('npx', ['tsx', 'src/mcp/transports/http.ts'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        MCP_PORT: String(PORT),
        MCP_HOST: HOST
      }
    });

    mcpProcess.on('exit', (code, signal) => {
      console.log(`[SUPERVISOR] MCP server exited with code ${code}, signal ${signal}`);
      mcpProcess = null;
      if (!isShuttingDown) {
        console.log('[SUPERVISOR] Restarting in 3 seconds...');
        setTimeout(startServer, 3000);
      }
    });

    // Give it 2 seconds to bind
    setTimeout(resolve, 2000);
  });
}

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        console.warn(`[SUPERVISOR] Health check returned non-200: ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (err) => {
      console.warn(`[SUPERVISOR] Health check failed: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runSupervisor() {
  console.log('======================================================================');
  console.log('WEALTHOS UNIVERSAL MCP — LOCAL PROCESS SUPERVISOR');
  console.log(`Binding: http://${HOST}:${PORT} (LOCAL-ONLY, ZERO CLOUD EXPOSURE)`);
  console.log('======================================================================');

  checkSecrets();
  await startServer();

  setInterval(async () => {
    if (isShuttingDown) return;
    const ok = await checkHealth();
    if (!ok && mcpProcess) {
      console.error('[SUPERVISOR] Health check failing repeatedly. Cycling process...');
      mcpProcess.kill();
    }
  }, CHECK_INTERVAL_MS);
}

process.on('SIGINT', () => {
  console.log('\n[SUPERVISOR] Shutting down gracefully...');
  isShuttingDown = true;
  if (mcpProcess) mcpProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SUPERVISOR] Terminating...');
  isShuttingDown = true;
  if (mcpProcess) mcpProcess.kill();
  process.exit(0);
});

runSupervisor().catch(err => {
  console.error('[SUPERVISOR FATAL ERROR]:', err);
  process.exit(1);
});
