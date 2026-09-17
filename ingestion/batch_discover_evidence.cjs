/**
 * ingestion/batch_discover_evidence.cjs
 *
 * Phase 1 Task 1: Batch Evidence Discovery Runner
 * 
 * 1. Creates EvidenceInventory table in portfolio.db per schema/evidence-types.ts:
 *    - scripId (TEXT)
 *    - sourceType (TEXT: CONCALL | INVESTOR_PRESENTATION | CREDIT_RATING)
 *    - result (TEXT: FOUND | CONFIRMED_ABSENT | SEARCH_FAILED)
 *    - checkedAt (TEXT ISO)
 *    - documentId (TEXT)
 *    - discoveryMethod (TEXT)
 *    - details (TEXT JSON)
 * 2. Runs discovery across portfolio and long-tail scrips using discover_evidence.py logic
 * 3. Enforces Constitution Rule 7: Never collapses absence into ignorance.
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { spawnSync } = require('child_process');

const DB_PATH = path.resolve(__dirname, '..', 'portfolio.db');
const db = new sqlite3.Database(DB_PATH);

function allAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function runAsync(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function initTable() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS EvidenceInventory (
      scripId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      result TEXT NOT NULL,
      checkedAt TEXT,
      documentId TEXT,
      discoveryMethod TEXT NOT NULL,
      details TEXT,
      PRIMARY KEY (scripId, sourceType)
    )
  `);
  await runAsync(`CREATE INDEX IF NOT EXISTS idx_inventory_result ON EvidenceInventory(result)`);
  console.log('[OK] EvidenceInventory table initialized in portfolio.db');
}

async function runBatchDiscovery(limit = 25) {
  await initTable();

  // 1. Get scrips from SecurityDossierSnapshots
  const scrips = await allAsync(`
    SELECT DISTINCT symbol, company_name as name
    FROM SecurityDossierSnapshots
    WHERE symbol IS NOT NULL AND symbol != ''
    LIMIT ?
  `, [limit]);

  console.log(`Starting Evidence Discovery across ${scrips.length} scrips...`);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO EvidenceInventory (
      scripId, sourceType, result, checkedAt, documentId, discoveryMethod, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Load verified pilot mappings
  let pilotCodes = {};
  const mappingPath = path.resolve(__dirname, 'pilot_bse_codes.json');
  if (fs.existsSync(mappingPath)) {
    try { pilotCodes = JSON.parse(fs.readFileSync(mappingPath, 'utf8')); } catch(e) {}
  }

  let totalFound = 0;
  let totalAbsent = 0;
  let totalFailed = 0;

  for (let i = 0; i < scrips.length; i++) {
    const s = scrips[i];
    const mapping = pilotCodes[s.symbol];
    const bseCode = mapping?.bseCode;
    const nseSymbol = mapping?.nseSymbol || s.symbol;

    // CONSTITUTION RULE: Never fallback to another company's hardcoded code!
    if (!bseCode && !nseSymbol) {
      console.warn(`[WARN] No exchange identifier resolved for ${s.symbol}. Recording SEARCH_FAILED.`);
      for (const st of ['CONCALL', 'INVESTOR_PRESENTATION', 'CREDIT_RATING']) {
        totalFailed++;
        insertStmt.run([
          s.symbol,
          st,
          'SEARCH_FAILED',
          new Date().toISOString(),
          null,
          'identifier_resolution',
          JSON.stringify({ reason: 'IDENTIFIER_UNRESOLVED', symbol: s.symbol, attemptedAt: new Date().toISOString() })
        ]);
      }
      continue;
    }

    const outPath = path.resolve(__dirname, '..', 'scratch', `inv_${s.symbol}.json`);

    // Run python discover_evidence.py with verified issuer-specific identifier
    const pyArgs = [
      path.resolve(__dirname, 'discover_evidence.py'),
      '--nse-symbol', nseSymbol,
      '--start', '01/01/2024',
      '--end', '31/03/2024',
      '--out', outPath
    ];
    if (bseCode) {
      pyArgs.push('--scrip-code', String(bseCode));
    }

    const res = spawnSync('python', pyArgs, { encoding: 'utf8', timeout: 30000 });

    if (fs.existsSync(outPath)) {
      try {
        const rows = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        for (const r of rows) {
          if (r.result === 'FOUND') totalFound++;
          else if (r.result === 'CONFIRMED_ABSENT') totalAbsent++;
          else totalFailed++;

          // Provenance details with verified issuer code
          const detailsPayload = {
            issuerBseCode: bseCode || null,
            issuerNseSymbol: nseSymbol || null,
            hits: r.hits || [],
            resolvedVia: 'pilot_bse_codes.json',
            checkedAt: r.checkedAt
          };

          insertStmt.run([
            r.scripId,
            r.sourceType,
            r.result,
            r.checkedAt,
            r.hits?.[0]?.Subject ? `${r.scripId}:${r.sourceType}:${r.hits[0].Date}` : null,
            r.discoveryMethod,
            JSON.stringify(detailsPayload)
          ]);
        }
        fs.unlinkSync(outPath); // cleanup temp
      } catch (e) {
        console.error(`Error parsing output for ${s.symbol}:`, e.message);
      }
    } else {
      // Record as SEARCH_FAILED
      for (const st of ['CONCALL', 'INVESTOR_PRESENTATION', 'CREDIT_RATING']) {
        totalFailed++;
        insertStmt.run([
          s.symbol,
          st,
          'SEARCH_FAILED',
          new Date().toISOString(),
          null,
          'execution_failure',
          JSON.stringify({ error: res.stderr || 'DISCOVERY_SCRIPT_FAILED', issuerCode: bseCode })
        ]);
      }
    }

    if ((i + 1) % 5 === 0 || i === scrips.length - 1) {
      console.log(`  [${i + 1}/${scrips.length}] Discovered for ${s.symbol} | Cumulative: ${totalFound} FOUND, ${totalAbsent} CONFIRMED_ABSENT, ${totalFailed} SEARCH_FAILED`);
    }
  }

  insertStmt.finalize();
  console.log('\n--- BATCH DISCOVERY SUMMARY ---');
  console.log(`Scrips Processed: ${scrips.length}`);
  console.log(`Total Inventory Rows: ${scrips.length * 3}`);
  console.log(`FOUND: ${totalFound}`);
  console.log(`CONFIRMED_ABSENT: ${totalAbsent}`);
  console.log(`SEARCH_FAILED: ${totalFailed}`);

  db.close();
}

const limitArg = process.argv[2] ? parseInt(process.argv[2], 10) : 25;
runBatchDiscovery(limitArg).catch(err => {
  console.error('Batch discovery error:', err);
  db.close();
  process.exit(1);
});
