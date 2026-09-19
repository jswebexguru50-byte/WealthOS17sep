/**
 * WealthOS v6.6 - Agent B Execution Script
 * Evaluates live database coverage for all registered requirements,
 * logs append-only events to data/v66/data_gap_ledger.jsonl,
 * and exports data/v66/engine_readiness_matrix.json.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { DataRequirementRegistry } from '../src/server/services/data/DataRequirementRegistry.js';
import { DataGapDetector, UniverseEvaluationContext } from '../src/server/services/data/DataGapDetector.js';
import { DataRecoveryPlanner } from '../src/server/services/data/DataRecoveryPlanner.js';
import { SecurityIdentityRegistry } from '../src/server/services/data/SecurityIdentityRegistry.js';

const ROOT_DIR = process.cwd();
const DB_PATH = path.join(ROOT_DIR, 'portfolio.db');

async function run() {
  console.log('--- Running Agent B Evaluation ---');
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

  const reqRegistry = DataRequirementRegistry.getInstance();
  const gapDetector = DataGapDetector.getInstance();
  const recoveryPlanner = DataRecoveryPlanner.getInstance();
  const identityRegistry = SecurityIdentityRegistry.getInstance();

  // Fetch unique trading days from HistoricalPrices
  const tradingDays: string[] = await new Promise((resolve, reject) => {
    db.all("SELECT DISTINCT DATE(date) as d FROM HistoricalPrices WHERE date >= '2020-01-01' ORDER BY d ASC LIMIT 100", (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows.map(r => r.d));
    });
  });

  // Fetch top 50 active securities
  const securities: string[] = await new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT symbol FROM MasterTickers LIMIT 50', (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows.map(r => r.symbol));
    });
  });

  console.log(`Evaluated Universe: ${securities.length} securities across ${tradingDays.length} sample sessions`);

  const context: UniverseEvaluationContext = {
    securityIds: securities,
    startDate: tradingDays[0] || '2020-01-01',
    endDate: tradingDays[tradingDays.length - 1] || '2020-06-01',
    tradingDays
  };

  // Sample observed records from HistoricalPrices
  const observedPrices: Array<{ securityId: string; date: string }> = await new Promise((resolve, reject) => {
    db.all('SELECT symbol as securityId, DATE(date) as date FROM HistoricalPrices WHERE date >= ? AND date <= ? LIMIT 50000', [context.startDate, context.endDate], (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const requirements = reqRegistry.getAllRequirements();
  const runId = `RUN_AGENT_B_${Date.now()}`;
  const gaps = [];

  for (const req of requirements) {
    // If dataset is DailyOHLCV, pass real observed records, otherwise empty to reflect real gap
    const observed = req.dataset === 'DailyOHLCV' ? observedPrices : [];
    const gap = gapDetector.evaluateCoverage(req, context, observed);
    gaps.push(gap);
  }

  recoveryPlanner.planRecovery(gaps, runId);
  console.log(`Successfully evaluated ${gaps.length} strategy requirements.`);
  console.log('Emitted events to data/v66/data_gap_ledger.jsonl');
  console.log('Generated data/v66/engine_readiness_matrix.json');

  db.close();
}

run().catch(err => {
  console.error('Agent B Evaluation Failed:', err);
  process.exit(1);
});
