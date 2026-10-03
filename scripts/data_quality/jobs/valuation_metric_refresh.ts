#!/usr/bin/env tsx
/**
 * scripts/data_quality/jobs/valuation_metric_refresh.ts
 *
 * Phase 3 Job E — Valuation Metric Refresh
 *
 * THIN WRAPPER around existing canonical Trendlyne metric planner:
 * scripts/fundamental/trendlyne_metric_pack_planner.ts
 *
 * Invariants:
 * - Refreshes market cap, PE, PB, and core valuation metrics via existing planner.
 * - Does NOT use hardcoded LIMIT 100; accepts --max-symbols and --batch-size from CLI.
 * - Logs start/end, passes safe args, records progress JSON, fails if child fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(process.cwd());
const progressDir = path.join(root, 'reports', 'data_quality', 'jobs');
const progressPath = path.join(progressDir, 'valuation_metric_refresh_progress.json');
const logPath = path.join(progressDir, 'valuation_metric_refresh.log');
const plannerScriptPath = path.join(root, 'scripts', 'fundamental', 'trendlyne_metric_pack_planner.ts');

fs.mkdirSync(progressDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(logPath, line);
}

async function main() {
  log('Starting Job: Valuation Metric Refresh (Invoking trendlyne_metric_pack_planner.ts --execute)');

  const progress: Record<string, any> = {
    jobName: 'valuation_metric_refresh',
    jobType: 'REFRESH',
    status: 'RUNNING',
    startTime: new Date().toISOString(),
    completedTime: null,
    sourceScript: 'scripts/fundamental/trendlyne_metric_pack_planner.ts',
    error: null
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  if (!fs.existsSync(plannerScriptPath)) {
    progress.status = 'SCRIPT_MISSING';
    progress.error = `Underlying planner script not found: ${plannerScriptPath}`;
    progress.completedTime = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`[ERROR] ${progress.error}`);
    process.exit(1);
  }

  // Pass through safe args: --execute, and --max-symbols / --batch-size if present
  const args = ['tsx', plannerScriptPath, '--execute'];
  const maxIdx = process.argv.indexOf('--max-symbols');
  if (maxIdx >= 0 && process.argv[maxIdx + 1]) {
    args.push('--max-symbols', process.argv[maxIdx + 1]);
  }
  const batchIdx = process.argv.indexOf('--batch-size');
  if (batchIdx >= 0 && process.argv[batchIdx + 1]) {
    args.push('--batch-size', process.argv[batchIdx + 1]);
  }

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('npx', args, {
        cwd: root,
        shell: process.platform === 'win32'
      });

      child.stdout.on('data', (d) => {
        fs.appendFileSync(logPath, d);
      });

      child.stderr.on('data', (d) => {
        fs.appendFileSync(logPath, `[STDERR] ${d}`);
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => resolve(code ?? 0));
    });

    if (exitCode !== 0) {
      throw new Error(`Child planner script exited with code ${exitCode}`);
    }

    progress.status = 'SUCCESS';
    progress.completedTime = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    log('Job completed successfully (Valuation metrics refreshed via planner).');
  } catch (err: any) {
    progress.status = 'FAILED';
    progress.completedTime = new Date().toISOString();
    progress.error = err?.message || String(err);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`Job failed: ${progress.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
