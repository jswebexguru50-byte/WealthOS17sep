#!/usr/bin/env tsx
/**
 * scripts/data_quality/jobs/valuation_metric_refresh.ts
 *
 * Phase 3 Job E — Valuation Metric Refresh
 *
 * Rationale:
 * Convenience wrapper around scripts/fundamental/trendlyne_metric_pack_planner.ts --execute
 * providing structured CLI argument pass-through (--max-symbols, --batch-size) and
 * job-level progress tracking under reports/data_quality/jobs/valuation_metric_refresh_progress.json.
 *
 * Invariants:
 * - Refreshes market cap, PE, PB, and core valuation metrics via existing canonical planner.
 * - Does NOT use hardcoded LIMIT 100; accepts --max-symbols and --batch-size from CLI.
 * - Does NOT reintroduce shell quoting risks; uses structured args array.
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

  const startTimeIso = new Date().toISOString();
  const progress: Record<string, any> = {
    jobName: 'valuation_metric_refresh',
    jobType: 'REFRESH',
    status: 'RUNNING',
    startedAt: startTimeIso,
    startTime: startTimeIso,
    completedAt: null,
    completedTime: null,
    sourceScript: 'scripts/fundamental/trendlyne_metric_pack_planner.ts',
    error: null
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  if (!fs.existsSync(plannerScriptPath)) {
    const nowIso = new Date().toISOString();
    progress.status = 'SCRIPT_MISSING';
    progress.error = `Underlying planner script not found: ${plannerScriptPath}`;
    progress.completedAt = nowIso;
    progress.completedTime = nowIso;
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`[ERROR] ${progress.error}`);
    process.exit(1);
  }

  // Pass through safe args: --execute, and --max-symbols / --batch-size / --allow-partial-final-batch if present
  const args = ['tsx', plannerScriptPath, '--execute'];
  const maxIdx = process.argv.indexOf('--max-symbols');
  if (maxIdx >= 0 && process.argv[maxIdx + 1]) {
    args.push('--max-symbols', process.argv[maxIdx + 1]);
  }
  const batchIdx = process.argv.indexOf('--batch-size');
  if (batchIdx >= 0 && process.argv[batchIdx + 1]) {
    args.push('--batch-size', process.argv[batchIdx + 1]);
  }
  if (process.argv.includes('--allow-partial-final-batch')) {
    args.push('--allow-partial-final-batch');
  }

  try {
    const tsxDistCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    let execBinary = 'npx';
    let execArgs = args;
    let useShell = false;

    if (args[0] === 'tsx' && fs.existsSync(tsxDistCli)) {
      execBinary = process.execPath;
      execArgs = [tsxDistCli, ...args.slice(1)];
      useShell = false;
    } else if (process.platform === 'win32') {
      useShell = true;
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(execBinary, execArgs, {
        cwd: root,
        shell: useShell
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

    let childStatus = 'SUCCESS';
    let childError: string | null = null;
    try {
      if (fs.existsSync(progressPath)) {
        const existing = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        if (existing.status) childStatus = existing.status;
        if (existing.error) childError = existing.error;
      }
    } catch {}

    const nowIso = new Date().toISOString();
    if (
      childStatus === 'DATA_INSUFFICIENT' ||
      childStatus === 'PARTIAL_BATCH_NOT_EXECUTED' ||
      childStatus === 'SUCCESS_WITH_NO_FACTS'
    ) {
      progress.status = 'DATA_INSUFFICIENT';
    } else if (childStatus === 'SUCCESS') {
      progress.status = 'SUCCESS';
    } else {
      progress.status = childStatus || 'SUCCESS';
    }
    progress.completedAt = nowIso;
    progress.completedTime = nowIso;
    if (childError) progress.error = childError;
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    log(`Job completed with status: ${progress.status} (Valuation metrics refresh handler).`);
  } catch (err: any) {
    const nowIso = new Date().toISOString();
    progress.status = 'FAILED';
    progress.completedAt = nowIso;
    progress.completedTime = nowIso;
    progress.error = err?.message || String(err);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`Job failed: ${progress.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
