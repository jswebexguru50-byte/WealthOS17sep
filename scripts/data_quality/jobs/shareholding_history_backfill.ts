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
  try { fs.appendFileSync(logPath, line); } catch {}
}

function writeProgress(progress: Record<string, any>) {
  try {
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  } catch (err: any) {
    console.warn(`[shareholding_history_backfill] progress write skipped: ${err?.message || String(err)}`);
  }
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
  writeProgress(progress);

  // 1. Confirm source DB exists
  if (!fs.existsSync(fereDbPath)) {
    progress.status = 'DATA_INSUFFICIENT';
    progress.completedTime = new Date().toISOString();
    progress.error = `DATA_INSUFFICIENT: Source database not found: ${fereDbPath}`;
    writeProgress(progress);
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
      writeProgress(progress);
      log(`[ERROR] ${progress.error}`);
      fereDb.close();
      db.close();
      process.exit(1);
    }

    // 3. Query source rows
    const sourceColumns = await new Promise<string[]>((resolve, reject) => {
      fereDb.all(`PRAGMA table_info(shareholding_snapshot)`, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve((rows || []).map((r) => r.name));
      });
    });
    const has = (column: string) => sourceColumns.includes(column);
    if (!has('fii_pct') || !has('dii_pct')) {
      progress.status = 'DATA_INSUFFICIENT';
      progress.completedTime = new Date().toISOString();
      progress.error = 'DATA_INSUFFICIENT: FERE shareholding_snapshot lacks fii_pct/dii_pct required by HistoricalShareholdingPattern; no synthetic zeros written.';
      writeProgress(progress);
      log(`[WARN] ${progress.error}`);
      fereDb.close();
      db.close();
      return;
    }
    const promoterExpr = has('promoter_pct') ? 'promoter_pct' : (has('promoter_holding') ? 'promoter_holding AS promoter_pct' : 'NULL AS promoter_pct');
    const publicExpr = has('public_pct') ? 'public_pct' : (has('public_holding') ? 'public_holding AS public_pct' : 'NULL AS public_pct');
    const fiiExpr = has('fii_pct') ? 'fii_pct' : 'NULL AS fii_pct';
    const diiExpr = has('dii_pct') ? 'dii_pct' : 'NULL AS dii_pct';
    const pledgeExpr = has('promoter_pledge') ? 'promoter_pledge' : 'NULL AS promoter_pledge';
    const availableExpr = has('available_at') ? 'available_at' : 'NULL AS available_at';

    const shRows = await new Promise<any[]>((resolve, reject) => {
      fereDb.all(
        `SELECT symbol, isin, period_end, ${promoterExpr}, ${fiiExpr}, ${diiExpr}, ${publicExpr}, ${pledgeExpr}, ${availableExpr}
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
      writeProgress(progress);
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
           (symbol, quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct, primary_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'FERE_VERIFIED_SHAREHOLDING_SNAPSHOT')`,
          [
            sh.symbol,
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
    writeProgress(progress);

    log(`Job completed successfully. Synced ${synced} shareholding records across ${uniqueSymbols.size} symbols.`);
  } catch (err: any) {
    progress.status = 'FAILED';
    progress.completedTime = new Date().toISOString();
    progress.error = err?.message || String(err);
    writeProgress(progress);
    log(`Job failed: ${progress.error}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);
