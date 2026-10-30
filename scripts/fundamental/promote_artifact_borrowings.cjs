#!/usr/bin/env node
'use strict';
/**
 * Promote borrowings facts from existing exchange artifacts to company_facts.
 * Sources:
 *   1. artifact.raw.exchange.balanceSheet.borrowings_cr → provider=SCREENER_PUBLIC
 *   2. artifact.raw.xbrl.facts[tag=Borrowings]         → provider=NSE_BSE_XBRL
 *
 * No MCP. No HTTP calls. Idempotent (INSERT OR IGNORE). O(3528) artifact reads.
 *
 * Usage:
 *   node scripts/fundamental/promote_artifact_borrowings.cjs [--apply] [--out-dir outputs/institutional29]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const root = process.cwd();
const dbPath = path.join(root, 'portfolio.db');
const apply = process.argv.includes('--apply');
const outDirIdx = process.argv.indexOf('--out-dir');
const outDirArg = outDirIdx >= 0 ? process.argv[outDirIdx + 1] : path.join(root, 'outputs', 'institutional29');

function main() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Repair rows written by the pre-v1 insert binding order. Restrict the
  // repair to timestamp-shaped providers with an explicit Screener URL; no
  // inferred or ambiguous lineage is rewritten.
  if (apply) {
    db.prepare(`UPDATE company_facts
      SET provider='SCREENER_PUBLIC', sourceType='STRUCTURED_SECONDARY'
      WHERE metric='borrowings'
        AND provider GLOB '20??-??-??T??:*'
        AND sourceUrl LIKE '%screener.in/%'`).run();
  }

  // Load existing company_ids
  const tickerMap = new Map();
  for (const r of db.prepare('SELECT UPPER(symbol) sym, id, isin FROM MasterTickers').all()) {
    tickerMap.set(r.sym, { id: r.id, isin: r.isin });
  }

  // Load already-promoted borrowings to avoid re-processing
  const alreadyPromoted = new Set();
  for (const r of db.prepare("SELECT UPPER(symbol) sym FROM company_facts WHERE metric='borrowings'").all()) {
    alreadyPromoted.add(r.sym);
  }

  const insFact = db.prepare(`
    INSERT OR IGNORE INTO company_facts
    (factId, companyId, symbol, isin, metric, value, unit, currency,
     periodType, periodEnd, asOfDate, factType, sourceType, scope,
     provider, verificationStatus, fetchedAt, availableAt, availabilityStatus,
     sourceDocumentId, providerToken, exactProviderLabel, sourceUrl, evidenceText, calculationMethod)
    VALUES
    (?, ?, ?, ?, 'borrowings', ?, 'Cr', 'INR',
     'ANNUAL', ?, ?, 'REPORTED_EXCHANGE_SNAPSHOT', 'STRUCTURED_SECONDARY', 'CONSOLIDATED',
     ?, 'VERIFIED_PARTIAL', ?, ?, 'AVAILABLE',
     ?, ?, ?, ?, ?, 'PUBLIC_EXCHANGE_SNAPSHOT_V1')
  `);

  const stats = { scanned: 0, promoted: 0, already_covered: 0, no_data: 0, errors: 0 };
  const promoted_symbols = [];

  if (!fs.existsSync(outDirArg)) {
    console.error(`Output dir not found: ${outDirArg}`);
    process.exit(1);
  }

  const symbols = fs.readdirSync(outDirArg).filter(d =>
    fs.statSync(path.join(outDirArg, d)).isDirectory()
  );

  for (const sym of symbols) {
    const artifactPath = path.join(outDirArg, sym, 'trendlyne_raw.json');
    if (!fs.existsSync(artifactPath)) continue;
    stats.scanned++;

    if (alreadyPromoted.has(sym.toUpperCase())) {
      stats.already_covered++;
      continue;
    }

    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    } catch {
      stats.errors++;
      continue;
    }

    const now = new Date().toISOString();
    const ticker = tickerMap.get(sym.toUpperCase()) || { id: sym, isin: null };
    const artifactHash = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');

    const candidates = [];

    // Source 1: balanceSheet.borrowings_cr (provider = SCREENER_PUBLIC)
    const bs = artifact?.raw?.exchange?.balanceSheet;
    const bsVal = bs?.borrowings_cr;
    const bsPeriod = bs?.latestPeriod;
    if (bsVal != null && bsPeriod) {
      candidates.push({
        value: Number(bsVal),
        periodEnd: String(bsPeriod),
        provider: 'SCREENER_PUBLIC',
        label: 'Borrowings',
        sourceUrl: artifact?.raw?.exchange?.screenerSource || null,
      });
    }

    // Source 2: xbrl.facts with tag=Borrowings (provider = NSE_BSE_XBRL)
    const xbrlFacts = Array.isArray(artifact?.raw?.xbrl?.facts) ? artifact.raw.xbrl.facts : [];
    // Group by period, keep latest
    const xbrlByPeriod = new Map();
    for (const fact of xbrlFacts) {
      if (fact?.tag !== 'Borrowings') continue;
      const val = Number(fact?.value);
      const period = String(fact?.period || '').trim();
      if (!Number.isFinite(val) || !period) continue;
      // Only accept ISO date (YYYY-MM-DD) or "Mon YYYY" format periods
      if (!/^\d{4}-\d{2}-\d{2}$/.test(period) && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(period)) continue;
      // XBRL values are always in INR; convert to Cr by dividing by 1e7
      const crVal = val / 1e7;
      if (!xbrlByPeriod.has(period) || Math.abs(xbrlByPeriod.get(period).crVal) < Math.abs(crVal)) {
        xbrlByPeriod.set(period, { crVal, rawVal: val, source: fact?.source || null });
      }
    }
    if (xbrlByPeriod.size > 0) {
      // Pick latest period
      const periods = Array.from(xbrlByPeriod.keys()).sort().reverse();
      const latestPeriod = periods[0];
      const { crVal, source } = xbrlByPeriod.get(latestPeriod);
      candidates.push({
        value: crVal,
        periodEnd: latestPeriod,
        provider: 'NSE_BSE_XBRL',
        label: 'XBRL Borrowings',
        sourceUrl: source,
      });
    }

    if (candidates.length === 0) {
      stats.no_data++;
      continue;
    }

    // Prefer SCREENER_PUBLIC (annual fiscal period) over XBRL (may be quarterly)
    const best = candidates.find(c => c.provider === 'SCREENER_PUBLIC') || candidates[0];
    const { value, periodEnd, provider, label, sourceUrl } = best;

    if (!Number.isFinite(value)) { stats.errors++; continue; }

    const periodToken = periodEnd.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'LATEST';
    const factId = `${ticker.id}_borrowings_ANNUAL_${periodToken}_CONSOLIDATED_EXCHANGE_SNAPSHOT`;
    const docId = `${provider}:${sym.toUpperCase()}:${artifactHash}`;

    if (apply) {
      const result = insFact.run(
        factId, ticker.id, sym.toUpperCase(), ticker.isin,
        String(value), periodEnd,
        now.slice(0, 10), provider, now, now,
        docId, provider, label, sourceUrl,
        JSON.stringify({ artifactHash, artifactPath, value, periodEnd, provider })
      );
      if (result.changes > 0) {
        stats.promoted++;
        promoted_symbols.push({ symbol: sym, value, periodEnd, provider });
        alreadyPromoted.add(sym.toUpperCase());
      }
    } else {
      stats.promoted++;
      promoted_symbols.push({ symbol: sym, value, periodEnd, provider });
    }
  }

  db.close();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    mcpUsed: false,
    ...stats,
    sample_promoted: promoted_symbols.slice(0, 20),
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
