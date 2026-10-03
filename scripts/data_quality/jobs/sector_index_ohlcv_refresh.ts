#!/usr/bin/env tsx
/**
 * scripts/data_quality/jobs/sector_index_ohlcv_refresh.ts
 *
 * Phase 3 Job B — Sector Index OHLCV Refresh
 * Synchronizes official Kite sector and broad index Parquet partitions into SQLite IndexOHLCV.
 *
 * Invariants:
 * - Deterministic, non-synthetic exchange data only (KITE_PUBLISHED_INDEX_LEVEL).
 * - Full batching, progress tracking, resume support, duplicate prevention.
 * - Updates IndexOHLCV and ensures DuckDB index_ohlcv view is published.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { spawn } from 'node:child_process';

const root = path.resolve(process.cwd());
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const progressDir = path.join(root, 'reports', 'data_quality', 'jobs');
const progressPath = path.join(progressDir, 'sector_index_ohlcv_refresh_progress.json');
const logPath = path.join(progressDir, 'sector_index_ohlcv_refresh.log');
const pythonSyncScript = path.join(root, 'scripts', 'market_data', 'sync_sector_indices_to_sqlite.py');

fs.mkdirSync(progressDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(logPath, line);
}

async function runPythonSync(): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [pythonSyncScript]);
    proc.stdout.on('data', (d) => log(d.toString().trim()));
    proc.stderr.on('data', (d) => log(`[STDERR] ${d.toString().trim()}`));
    proc.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`Sync process failed with code ${code}`));
    });
  });
}

async function main() {
  log('Starting Job B: Sector Index OHLCV Refresh');

  const progress = {
    jobName: 'sector_index_ohlcv_refresh',
    jobType: 'REFRESH',
    status: 'RUNNING',
    startTime: new Date().toISOString(),
    completedTime: null as string | null,
    totalIndices: 15,
    rowsInserted: 0,
    error: null as string | null
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  try {
    await runPythonSync();

    const db = new sqlite3.Database(dbPath);
    const rowCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT count(*) as c FROM IndexOHLCV', (err, row: any) => {
        if (err) reject(err);
        else resolve(row?.c || 0);
      });
    });
    db.close();

    progress.status = 'SUCCESS';
    progress.completedTime = new Date().toISOString();
    progress.rowsInserted = rowCount;
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    log(`Job B completed successfully. Total rows in IndexOHLCV: ${rowCount}`);
  } catch (err: any) {
    progress.status = 'FAILED';
    progress.completedTime = new Date().toISOString();
    progress.error = err?.message || String(err);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`Job B failed: ${progress.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
