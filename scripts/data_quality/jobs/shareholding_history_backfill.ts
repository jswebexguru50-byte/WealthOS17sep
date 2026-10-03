#!/usr/bin/env tsx
/**
 * scripts/data_quality/jobs/shareholding_history_backfill.ts
 *
 * Phase 3 Job D — Shareholding History Backfill
 * Ingests historical shareholding patterns (promoter, FII, DII, public)
 * from verified FERE shareholding snapshots to compute institutional trends.
 *
 * Invariants:
 * - Deterministic facts only.
 * - Strict verification that source database and table exist.
 * - If source table is missing or empty, returns DATA_INSUFFICIENT (never falsely reports SUCCESS).
 * - Preserves null/unavailable values; NEVER derives synthetic free float.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const root = path.resolve(process.cwd());
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const progressDir = path.join(root, 'reports', 'data_quality', 'jobs');
const progressPath = path.join(progressDir, 'shareholding_history_backfill_progress.json');
const logPath = path.join(progressDir, 'shareholding_history_backfill.log');
const fereDbPath = path.join(root, 'data', 'fere', 'verified_filings', 'fere_evidence.db');

fs.mkdirSync(progressDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(logPath, line);
}

async function main() {
  log('Starting Job: Shareholding History Backfill');

  const progress: Record<string, any> = {
    jobName: 'shareholding_history_backfill',
    jobType: 'BACKFILL',
    status: 'RUNNING',
    startTime: new Date().toISOString(),
    completedTime: null,
    totalSymbols: 0,
    recordsSynced: 0,
    error: null
  };
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  // 1. Confirm source DB exists
  if (!fs.existsSync(fereDbPath)) {
    progress.status = 'DATA_INSUFFICIENT';
    progress.completedTime = new Date().toISOString();
    progress.error = `DATA_INSUFFICIENT: Source database not found: ${fereDbPath}`;
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`[ERROR] ${progress.error}`);
    process.exit(1);
  }

  const fereDb = new sqlite3.Database(fereDbPath);
  const db = new sqlite3.Database(dbPath);

  try {
    // 2. Confirm source table exists in FERE evidence DB
    const tableCheck = await new Promise<boolean>((resolve) => {
      fereDb.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='shareholding_snapshot'",
        (err, row: any) => {
          if (err || !row) resolve(false);
          else resolve(true);
        }
      );
    });

    if (!tableCheck) {
      progress.status = 'DATA_INSUFFICIENT';
      progress.completedTime = new Date().toISOString();
      progress.error = 'DATA_INSUFFICIENT: Source table shareholding_snapshot does not exist in FERE database.';
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      log(`[ERROR] ${progress.error}`);
      fereDb.close();
      db.close();
      process.exit(1);
    }

    // 3. Query source rows
    const shRows = await new Promise<any[]>((resolve, reject) => {
      fereDb.all(
        `SELECT symbol, isin, period_end, promoter_pct, fii_pct, dii_pct, public_pct, promoter_pledge, available_at
         FROM shareholding_snapshot
         ORDER BY symbol, period_end DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    fereDb.close();

    if (shRows.length === 0) {
      progress.status = 'DATA_INSUFFICIENT';
      progress.completedTime = new Date().toISOString();
      progress.error = 'DATA_INSUFFICIENT: Source table shareholding_snapshot is empty (0 records).';
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      log(`[ERROR] ${progress.error}`);
      db.close();
      process.exit(1);
    }

    log(`Found ${shRows.length} verified shareholding snapshot rows in FERE evidence DB.`);

    let synced = 0;
    const uniqueSymbols = new Set<string>();

    for (const sh of shRows) {
      if (!sh.symbol || !sh.period_end) continue;
      uniqueSymbols.add(sh.symbol);
      const qLabel = sh.period_end;

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO HistoricalShareholdingPattern
           (symbol, isin, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sh.symbol,
            sh.isin || null,
            qLabel,
            sh.period_end,
            sh.promoter_pct != null && !isNaN(Number(sh.promoter_pct)) ? Number(sh.promoter_pct) : null,
            sh.fii_pct != null && !isNaN(Number(sh.fii_pct)) ? Number(sh.fii_pct) : null,
            sh.dii_pct != null && !isNaN(Number(sh.dii_pct)) ? Number(sh.dii_pct) : null,
            sh.public_pct != null && !isNaN(Number(sh.public_pct)) ? Number(sh.public_pct) : null
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });
      synced++;
    }

    progress.totalSymbols = uniqueSymbols.size;
    progress.recordsSynced = synced;
    progress.status = 'SUCCESS';
    progress.completedTime = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

    log(`Job completed successfully. Synced ${synced} shareholding records across ${uniqueSymbols.size} symbols.`);
  } catch (err: any) {
    progress.status = 'FAILED';
    progress.completedTime = new Date().toISOString();
    progress.error = err?.message || String(err);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    log(`Job failed: ${progress.error}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);
