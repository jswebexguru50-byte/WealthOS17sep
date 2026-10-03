#!/usr/bin/env tsx
/**
 * scripts/data_quality/jobs/ohlcv_daily_audit.ts
 *
 * Phase 3 Job A — Daily OHLCV Coverage Audit
 *
 * THIN WRAPPER around existing market data audit script:
 * scripts/market_data/audit_adjusted_ohlcv_coverage.py
 *
 * Invariants:
 * - Does NOT claim to be a refresh; this is an AUDIT of local DuckDB OHLCV store.
 * - Derives latestTradeDate directly from actual local OHLCV store via child audit.
 * - Logs start/end, passes safe args, records progress JSON, fails if child fails.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(process.cwd());
const progressDir = path.join(root, 'reports', 'data_quality', 'jobs');
const progressPath = path.join(progressDir, 'ohlcv_daily_audit_progress.json');
const logPath = path.join(progressDir, 'ohlcv_daily_audit.log');
const auditScriptPath = path.join(root, 'scripts', 'market_data', 'audit_adjusted_ohlcv_coverage.py');
const auditSummaryPath = path.join(root, 'reports', 'readiness', 'adjusted_ohlcv_coverage_summary.json');

fs.mkdirSync(progressDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(logPath, line);
}

async function main() {
  log('Starting Job: Daily OHLCV Coverage Audit (Invoking audit_adjusted_ohlcv_coverage.py)');

  const progress: Record<string, any> = {
    jobName: 'ohlcv_daily_audit',
    jobType: 'AUDIT',
    status: 'RUNNING',
    startTime: new Date().toISOString(),
    completedTime: null,
    universe: 0,
    clean10yCount: 0,
    clean10yPct: 0,
    latestTradeDate: null,
    sourceScript: 'scripts/market_data/audit_adjusted_ohlcv_coverage.py',
    error: null
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  if (!fs.existsSync(auditScriptPath)) {
    progress.status = 'SCRIPT_MISSING';
    progress.error = `Underlying audit script not found: ${auditScriptPath}`;
    progress.completedTime = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`[ERROR] ${progress.error}`);
    process.exit(1);
  }

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('python', [auditScriptPath], {
        cwd: root,
        shell: false
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
      throw new Error(`Child audit script exited with code ${exitCode}`);
    }

    // Read generated summary to derive actual store trade date and coverage counts
    if (fs.existsSync(auditSummaryPath)) {
      try {
        const summary = JSON.parse(fs.readFileSync(auditSummaryPath, 'utf8'));
        progress.universe = summary.universe || 0;
        progress.clean10yCount = summary.counts?.CLEAN_FULL_10Y || 0;
        progress.clean10yPct = summary.clean_full_10y_pct || 0;
        // Derive real latest trade date from store summary (NOT hardcoded)
        progress.latestTradeDate = summary.required_latest || null;
      } catch (err: any) {
        log(`Warning: Failed to parse audit summary: ${err?.message || err}`);
      }
    }

    progress.status = 'AUDIT_ONLY';
    progress.completedTime = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    log(`Job completed successfully (AUDIT_ONLY). Universe: ${progress.universe}, Latest Trade Date: ${progress.latestTradeDate}, Clean 10Y: ${progress.clean10yPct}%`);
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
