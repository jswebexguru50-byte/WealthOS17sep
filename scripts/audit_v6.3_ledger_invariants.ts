import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sqlite3 from 'sqlite3';
import { extractTradingDate } from '../src/server/services/research/ExecutionSimulator.js';
import type { TradeIdentityLedger } from '../src/server/services/research/types.js';

interface LedgerInvariantAudit {
  runId: string;
  ledgerPath: string;
  ledgerSha256: string;
  totalTrades: number;
  auditedTrades: number;
  sameSessionViolations: number;
  nonNextSessionViolations: number;
  rawEntryOpenMismatches: number;
  invalidEntryPrices: number;
  missingEntryBars: number;
  duplicateTradeIds: number;
  signalAfterEntryViolations: number;
  missingSignalAvailability: number;
  futureDataViolations: number;
  validationStatus: "PASS" | "FAIL";
  promotionStatus: "NOT_AUTHORIZED";
  firstTradeId?: string;
  lastTradeId?: string;
  auditedAt: string;
}

async function auditLedgerInvariants() {
  console.log('================================================================');
  console.log('   AUTOMATED LEDGER INVARIANT AUDIT (v6.3 REMEDIATED PIPELINE) ');
  console.log('================================================================\n');

  const dataDir = path.resolve(process.cwd(), 'data');
  const canonicalRunId = "v6.3_REAL_T1_EXECUTION_REMEDIATED_1789650500000";

  const ledgerPath = fs.existsSync(path.join(dataDir, 'v6.3_REAL_trade_identity_ledger.jsonl'))
    ? path.join(dataDir, 'v6.3_REAL_trade_identity_ledger.jsonl')
    : path.join(dataDir, 'v6.3_trade_identity_ledger.jsonl');

  if (!fs.existsSync(ledgerPath)) {
    throw new Error(`Ledger file not found at: ${ledgerPath}`);
  }

  const ledgerBytes = fs.readFileSync(ledgerPath);
  const ledgerSha256 = crypto.createHash('sha256').update(ledgerBytes).digest('hex');

  const lines = ledgerBytes.toString('utf8').trim().split('\n').filter(Boolean);
  const trades: TradeIdentityLedger[] = lines.map(line => JSON.parse(line));

  console.log(`Loaded ${trades.length} trades from ${path.basename(ledgerPath)} (SHA-256: ${ledgerSha256.slice(0, 16)}...)`);

  const dbPath = process.env.RESEARCH_DB_PATH 
    || (fs.existsSync(path.join(process.cwd(), 'portfolio.db')) ? path.join(process.cwd(), 'portfolio.db') : path.join(dataDir, 'portfolio_v6.3_research_subset.db'));

  let db: sqlite3.Database | null = null;
  if (fs.existsSync(dbPath)) {
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  }

  let sameSessionViolations = 0;
  let nonNextSessionViolations = 0;
  let rawEntryOpenMismatches = 0;
  let invalidEntryPrices = 0;
  let missingEntryBars = 0;
  let duplicateTradeIds = 0;
  let signalAfterEntryViolations = 0;
  let missingSignalAvailability = 0;
  let futureDataViolations = 0;

  const seenTradeIds = new Set<string>();

  for (const trade of trades) {
    // 1. Duplicate Trade IDs
    if (seenTradeIds.has(trade.tradeId)) {
      duplicateTradeIds++;
    }
    seenTradeIds.add(trade.tradeId);

    // 2. Missing Entry Bars
    if (!trade.entryTimestamp || !trade.signalTimestamp) {
      missingEntryBars++;
      continue;
    }

    const signalDate = trade.signalDate || extractTradingDate(trade.signalTimestamp);
    const entryDate = trade.entryDate || extractTradingDate(trade.entryTimestamp);

    // 3. Signal Availability & Future Data
    if (!trade.signalAvailableAt) {
      missingSignalAvailability++;
    } else if (trade.signalAvailableAt > trade.entryTimestamp) {
      futureDataViolations++;
    }

    // 4. Signal After Entry / Same Session
    if (trade.signalTimestamp >= trade.entryTimestamp || signalDate >= entryDate) {
      sameSessionViolations++;
    }

    if (trade.signalTimestamp > trade.entryTimestamp) {
      signalAfterEntryViolations++;
    }

    // 5. Invalid Entry Prices
    if (!Number.isFinite(trade.rawEntryPrice) || trade.rawEntryPrice! <= 0 || !Number.isFinite(trade.actualEntryPrice) || trade.actualEntryPrice! <= 0) {
      invalidEntryPrices++;
    }

    // 6. DB Verification (if DB is open and trade provenance indicates real DB source)
    const isRealDbTrade = Array.isArray(trade.provenance) && trade.provenance.includes("REAL_HISTORICAL_FULL_DATABASE");
    if (db && isRealDbTrade) {
      const bars: Array<{ trade_date: string; open: number }> = await new Promise((resolve, reject) => {
        db!.all(
          `SELECT trade_date, open FROM DailyOHLCV WHERE symbol = ? AND trade_date >= ? ORDER BY trade_date ASC LIMIT 5`,
          [trade.symbol, signalDate],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows as any);
          }
        );
      });

      if (bars && bars.length >= 2) {
        const expectedNextBar = bars.find(b => b.trade_date > signalDate);
        if (expectedNextBar) {
          if (expectedNextBar.trade_date !== entryDate) {
            nonNextSessionViolations++;
          }
          if (Math.abs(expectedNextBar.open - trade.rawEntryPrice!) > 1e-3) {
            rawEntryOpenMismatches++;
          }
        }
      }
    }
  }

  if (db) {
    db.close();
  }

  const violations =
    sameSessionViolations +
    nonNextSessionViolations +
    rawEntryOpenMismatches +
    invalidEntryPrices +
    missingEntryBars +
    duplicateTradeIds +
    signalAfterEntryViolations +
    missingSignalAvailability +
    futureDataViolations;

  const auditSummary: LedgerInvariantAudit = {
    runId: canonicalRunId,
    ledgerPath: path.basename(ledgerPath),
    ledgerSha256,
    totalTrades: trades.length,
    auditedTrades: trades.length,
    sameSessionViolations,
    nonNextSessionViolations,
    rawEntryOpenMismatches,
    invalidEntryPrices,
    missingEntryBars,
    duplicateTradeIds,
    signalAfterEntryViolations,
    missingSignalAvailability,
    futureDataViolations,
    validationStatus: (violations === 0 && trades.length > 0) ? "PASS" : "FAIL",
    promotionStatus: "NOT_AUTHORIZED",
    firstTradeId: trades[0]?.tradeId,
    lastTradeId: trades[trades.length - 1]?.tradeId,
    auditedAt: new Date().toISOString()
  };

  console.log('--- AUDIT RESULTS ---');
  console.log(`runId:                      ${auditSummary.runId}`);
  console.log(`totalTrades:                ${auditSummary.totalTrades}`);
  console.log(`auditedTrades:              ${auditSummary.auditedTrades}`);
  console.log(`ledgerSha256:               ${auditSummary.ledgerSha256}`);
  console.log(`sameSessionViolations:      ${sameSessionViolations}`);
  console.log(`nonNextSessionViolations:   ${nonNextSessionViolations}`);
  console.log(`rawEntryOpenMismatches:     ${rawEntryOpenMismatches}`);
  console.log(`invalidEntryPrices:         ${invalidEntryPrices}`);
  console.log(`missingEntryBars:           ${missingEntryBars}`);
  console.log(`duplicateTradeIds:          ${duplicateTradeIds}`);
  console.log(`signalAfterEntryViolations: ${signalAfterEntryViolations}`);
  console.log(`missingSignalAvailability:  ${missingSignalAvailability}`);
  console.log(`futureDataViolations:       ${futureDataViolations}`);
  console.log('---------------------');
  console.log(`VALIDATION_STATUS:          ${auditSummary.validationStatus}`);
  console.log(`PROMOTION:                  ${auditSummary.promotionStatus}\n`);

  fs.writeFileSync(
    path.join(dataDir, 'v6.3_REAL_ledger_audit_summary.json'),
    JSON.stringify(auditSummary, null, 2),
    'utf8'
  );

  if (auditSummary.validationStatus === "FAIL") {
    console.error("VALIDATION_STATUS: FAIL");
    console.error("PROMOTION: NOT_AUTHORIZED");
    process.exit(2);
  }

  console.log("VALIDATION_STATUS: PASS");
  console.log("PROMOTION: NOT_AUTHORIZED");
}

auditLedgerInvariants().catch(err => {
  console.error('Audit script failed:', err);
  process.exit(2);
});
