/**
 * CAL_020 run-specific capture.
 *
 * It evaluates the frozen cohort against a disposable copy of the current
 * production database.  It never imports pilot review outputs and never asks
 * the product pipeline to persist a snapshot.  Results are flushed after each
 * company so an interrupted run leaves auditable partial evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CompanyIntelligenceOrchestrator } from '../../../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';
import { closeDB } from '../../../../src/server/database.js';

const COHORT = [
  'AAVAS', 'ASTRAL', 'BAJFINANCE', 'CLEAN', 'DEEPAKNTR', 'DYCL', 'HDFCBANK',
  'INFY', 'LTIM', 'LT', 'PIDILITIND', 'POLYCAB', 'RAMCOIND', 'RELIANCE',
  'STYL', 'SUNPHARMA', 'TATAMOTORS', 'TATASTEEL', 'TCS', 'TITAN',
];
const outputPath = path.resolve(process.cwd(), 'reports/review/runs/FUNDAMENTAL_CAL_020/FRESH_PRODUCTION_CAPTURE.json');
const databasePath = process.env.DATABASE_URL;

if (!databasePath || !path.isAbsolute(databasePath)) {
  throw new Error('CAL_020 requires DATABASE_URL to be an absolute disposable database copy.');
}

const db = new Database(databasePath, { readonly: true });
const tableColumns = db.prepare('PRAGMA table_info(company_facts)').all() as Array<{ name: string }>;
const factColumns = new Set(tableColumns.map(column => column.name));
const selectColumns = [
  'factId', 'symbol', 'metric', 'value', 'unit', 'periodType', 'periodEnd',
  'scope', 'provider', 'sourceType', 'sourceDocumentId', 'fetchedAt',
  'asOfDate', 'availabilityStatus', 'verificationStatus', 'factType',
].filter(column => factColumns.has(column));

const capture: Record<string, unknown> = {
  reviewId: 'FUNDAMENTAL_CAL_020',
  captureMode: 'CURRENT_PRODUCTION_DB_COPY_READ_ONLY_PRODUCT_EVALUATION',
  databasePath,
  startedAt: new Date().toISOString(),
  cohort: COHORT,
  companies: {},
};

function flush() {
  fs.writeFileSync(outputPath, JSON.stringify(capture, null, 2));
}

try {
  const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
  for (const symbol of COHORT) {
    const ticker = db.prepare('SELECT symbol, name, isin, sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1').get(symbol);
    const facts = db.prepare(`SELECT ${selectColumns.join(', ')} FROM company_facts WHERE UPPER(symbol) = ? ORDER BY periodEnd DESC, fetchedAt DESC`).all(symbol);
    const response = await orchestrator.getCompanyIntelligence(
      symbol,
      ['FUNDAMENTAL', 'VALUATION', 'FERE', 'QGLP', 'MANAGEMENT', 'MARKET_CONTEXT'],
      { persist: false },
    );
    (capture.companies as Record<string, unknown>)[symbol] = {
      capturedAt: new Date().toISOString(),
      identity: ticker ?? null,
      rawCanonicalFacts: facts,
      productResponse: response,
    };
    flush();
  }
  capture.completedAt = new Date().toISOString();
  capture.status = 'COMPLETE';
  flush();
} finally {
  db.close();
  await closeDB();
}
