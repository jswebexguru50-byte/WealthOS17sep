const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

async function verifyMappings() {
  const root = process.cwd();
  const ledgerPath = path.join(root, 'data/v6.5/runs/REPLAY_V65_ED18F3B9A403/v65_economic_replay_ledger.jsonl');
  const dbPath = path.join(root, 'portfolio.db');

  console.log('[Mapping Verification] Loading ledger...');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const trades = lines.map(l => JSON.parse(l));

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  const getDbSymbols = () => new Promise((resolve) => {
    db.all("SELECT DISTINCT symbol FROM DailyOHLCV", [], (err, rows) => {
      resolve(new Set(rows.map(r => r.symbol)));
    });
  });

  const dbSymbols = await getDbSymbols();
  db.close();

  console.log(`[Mapping Verification] Loaded ${dbSymbols.size} distinct symbols from DailyOHLCV in portfolio.db`);

  let uniqueIds = new Set();
  let duplicateIds = 0;
  let lookaheadCount = 0;
  let sameBarExecutionCount = 0;
  let missingDbSymbolCount = 0;
  let syntheticFlagCount = 0;

  for (const t of trades) {
    if (uniqueIds.has(t.tradeId)) {
      duplicateIds++;
    }
    uniqueIds.add(t.tradeId);

    if (t.usedSyntheticTradePrice || t.usedSyntheticExit || t.usedSyntheticRiskLevel) {
      syntheticFlagCount++;
    }

    // PIT Invariant: dataAvailableTimestamp <= decisionTimestamp
    const dt = new Date(t.decisionTimestamp).getTime();
    const at = new Date(t.dataAvailableTimestamp).getTime();
    if (at > dt) {
      lookaheadCount++;
    }

    // Next-bar invariant: entryDate > decisionDate
    const dDate = new Date(t.decisionDate).getTime();
    const eDate = new Date(t.entryDate).getTime();
    if (eDate <= dDate) {
      sameBarExecutionCount++;
    }

    if (!dbSymbols.has(t.symbol)) {
      missingDbSymbolCount++;
    }
  }

  const result = {
    totalTrades: trades.length,
    uniqueTradeIds: uniqueIds.size,
    duplicateTradeIds: duplicateIds,
    syntheticFlagsDetected: syntheticFlagCount,
    pitLookaheadViolations: lookaheadCount,
    sameBarExecutionViolations: sameBarExecutionCount,
    matchedDatabaseSymbols: trades.length - missingDbSymbolCount,
    missingDatabaseSymbols: missingDbSymbolCount
  };

  console.log('[Mapping Verification] Audit Results:', JSON.stringify(result, null, 2));

  const outDir = path.join(root, 'reports/v672/r2');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'R2_TRADE_EVIDENCE_MAPPING.json'), JSON.stringify(result, null, 2));
}

verifyMappings().catch(console.error);
