/**
 * Deterministic, read-only evidence-acquisition planner.
 *
 * It never calls a provider and never changes either database.  It identifies
 * which current facts are already backed by a fresh Trendlyne snapshot, which
 * dated financial facts exist in the FERE archive, and the next authoritative
 * source required for the remainder.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

type Row = Record<string, unknown>;
const root = process.cwd();
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifestIndex = process.argv.indexOf('--manifest');
const maxIndex = process.argv.indexOf('--max-symbols');
const manifestPath = manifestIndex >= 0
  ? path.resolve(root, process.argv[manifestIndex + 1])
  : path.join(dataDir, 'full_population_manifest.json');
const maxSymbols = maxIndex >= 0 ? Math.max(0, Number(process.argv[maxIndex + 1])) : 230;
const outputPath = path.join(dataDir, 'fundamental_evidence_gap_manifest_230.json');
const reportPath = path.join(dataDir, 'fundamental_evidence_gap_manifest_230.md');
const portfolioPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const ferePath = path.join(root, 'data', 'fere', 'verified_filings', 'fere_evidence.db');

const CURRENT_METRICS = [
  'revenue', 'operating_profit', 'pat', 'cfo', 'debt_to_equity_reported',
  'roce_reported', 'roe', 'market_cap', 'pe_ratio', 'promoter_holding',
  'promoter_pledge', 'fii_holding', 'inst_holding',
];
const DATED_FINANCIAL_METRICS = ['revenue', 'operating_profit', 'pat', 'cfo', 'capex_cash_outflow'];
const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
const hasValue = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';

async function tableExists(db: sqlite3.Database, table: string) {
  return (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table])).length > 0;
}

async function main() {
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let symbols = [...new Set((parsed.symbols || []).map((v: unknown) => String(v).trim().toUpperCase()).filter(Boolean))];
  if (maxSymbols > 0) symbols = symbols.slice(0, maxSymbols);

  const db = new sqlite3.Database(portfolioPath, sqlite3.OPEN_READONLY);
  const fere = fs.existsSync(ferePath) ? new sqlite3.Database(ferePath, sqlite3.OPEN_READONLY) : null;
  try {
    const placeholders = symbols.map(() => '?').join(',');
    const snapshotRows = await all(db, `SELECT symbol,status,fetched_at,response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP' AND endpoint='parameters' AND upper(symbol) IN (${placeholders})`, symbols);
    const factRows = await all(db, `SELECT symbol,isin,metric,value,periodEnd,sourceDocumentId,availableAt,
      verificationStatus,availabilityStatus,fetchedAt
      FROM company_facts WHERE upper(symbol) IN (${placeholders})`, symbols);
    const snapshotBySymbol = new Map(snapshotRows.map(row => [String(row.symbol).toUpperCase(), row]));
    const factsBySymbol = new Map<string, Row[]>();
    for (const fact of factRows) {
      const symbol = String(fact.symbol).toUpperCase();
      factsBySymbol.set(symbol, [...(factsBySymbol.get(symbol) || []), fact]);
    }

    let fereDocumentsBySymbol = new Map<string, number>();
    let fereFactsByIsin = new Map<string, number>();
    if (fere && await tableExists(fere, 'filing_document')) {
      const docs = await all(fere, `SELECT upper(symbol) AS symbol, count(*) AS count
        FROM filing_document WHERE upper(symbol) IN (${placeholders}) AND sha256 IS NOT NULL
        GROUP BY upper(symbol)`, symbols);
      fereDocumentsBySymbol = new Map(docs.map(row => [String(row.symbol), Number(row.count)]));
    }
    if (fere && await tableExists(fere, 'verified_xbrl_fact')) {
      const facts = await all(fere, 'SELECT upper(isin) AS isin, count(*) AS count FROM verified_xbrl_fact GROUP BY upper(isin)');
      fereFactsByIsin = new Map(facts.map(row => [String(row.isin), Number(row.count)]));
    }

    const records = symbols.map(symbol => {
      const snapshot = snapshotBySymbol.get(symbol);
      const facts = factsBySymbol.get(symbol) || [];
      const canonicalCurrent = new Set(facts.filter(f =>
        CURRENT_METRICS.includes(String(f.metric)) && hasValue(f.value) &&
        String(f.availabilityStatus) === 'AVAILABLE' && /^VERIFIED/.test(String(f.verificationStatus)),
      ).map(f => String(f.metric)));
      const datedFacts = new Set(facts.filter(f =>
        DATED_FINANCIAL_METRICS.includes(String(f.metric)) && hasValue(f.value) &&
        String(f.periodEnd) !== 'LATEST' && hasValue(f.periodEnd) && hasValue(f.sourceDocumentId) && hasValue(f.availableAt),
      ).map(f => String(f.metric)));
      const isin = facts.find(f => hasValue(f.isin))?.isin;
      const fereDocuments = fereDocumentsBySymbol.get(symbol) || 0;
      const fereFacts = isin ? (fereFactsByIsin.get(String(isin).toUpperCase()) || 0) : 0;
      const missingCurrent = CURRENT_METRICS.filter(metric => !canonicalCurrent.has(metric));
      const missingDated = DATED_FINANCIAL_METRICS.filter(metric => !datedFacts.has(metric));
      const actions: Array<{ priority: number; source: string; reason: string; fields: string[] }> = [];
      if (snapshot?.status !== 'SUCCESS') actions.push({ priority: 1, source: 'TRENDLYNE_P0', reason: 'No successful fresh parameter snapshot persisted.', fields: CURRENT_METRICS });
      else if (missingCurrent.length) actions.push({ priority: 1, source: 'CANONICAL_MAPPING_REVIEW', reason: 'Raw Trendlyne snapshot exists but its verified values are not yet present as canonical facts.', fields: missingCurrent });
      if (missingDated.length) actions.push({
        priority: 2,
        source: fereFacts || fereDocuments ? 'EXISTING_FERE_EVIDENCE' : 'NSE_BSE_OFFICIAL_FILINGS',
        reason: fereFacts || fereDocuments ? 'Use already archived official evidence before downloading any filing.' : 'No local official filing evidence for the required dated financial facts.',
        fields: missingDated,
      });
      actions.push({ priority: 3, source: 'TARGETED_TRENDLYNE_DOCUMENTS', reason: 'Only after quantitative evidence: retrieve cited business drivers, risks, capacity, management commentary or governance context if a dossier needs it.', fields: ['business_context', 'risks', 'management_guidance'] });
      return {
        symbol, isin: isin || null,
        trendlyneParameters: { status: snapshot?.status || 'SOURCE_UNAVAILABLE', fetchedAt: snapshot?.fetched_at || null },
        canonicalCurrent: { available: [...canonicalCurrent].sort(), missing: missingCurrent },
        datedFinancialEvidence: { available: [...datedFacts].sort(), missing: missingDated },
        fere: { archivedDocuments: fereDocuments, verifiedXbrlFacts: fereFacts },
        actions,
      };
    });
    const count = (predicate: (record: typeof records[number]) => boolean) => records.filter(predicate).length;
    const payload = {
      generatedAt: new Date().toISOString(), mode: 'READ_ONLY_NO_PROVIDER_CALLS', requested: records.length,
      currentSnapshotSuccess: count(r => r.trendlyneParameters.status === 'SUCCESS'),
      canonicalCurrentComplete: count(r => r.canonicalCurrent.missing.length === 0),
      datedFinancialComplete: count(r => r.datedFinancialEvidence.missing.length === 0),
      fereEvidencePresent: count(r => r.fere.archivedDocuments > 0 || r.fere.verifiedXbrlFacts > 0),
      records,
      policy: 'Existing FERE evidence precedes any NSE/BSE download. Trendlyne relative history is not promoted as dated history without a verified period-end.',
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    const markdown = [
      '# Fundamental evidence gap manifest — 230-symbol cohort', '',
      `Generated: ${payload.generatedAt}`, '',
      `- Successful current Trendlyne snapshots: ${payload.currentSnapshotSuccess}/${payload.requested}`,
      `- Canonical current profile complete: ${payload.canonicalCurrentComplete}/${payload.requested}`,
      `- Dated financial profile complete: ${payload.datedFinancialComplete}/${payload.requested}`,
      `- Existing FERE evidence present: ${payload.fereEvidencePresent}/${payload.requested}`, '',
      'This is read-only. It schedules no provider calls and makes no database changes.',
      'For each company, existing FERE evidence must be reviewed before an official NSE/BSE filing is retrieved.',
    ].join('\n');
    fs.writeFileSync(reportPath, `${markdown}\n`);
    console.log(JSON.stringify({ outputPath, reportPath, ...payload }, null, 2));
  } finally {
    await close(db);
    if (fere) await close(fere);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
