import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

const investedSymbolsSet = new Set<string>();
const queries = [
  "SELECT DISTINCT symbol FROM PmsSummaryHoldings WHERE symbol IS NOT NULL AND symbol != ''",
  "SELECT DISTINCT symbol FROM PmsReconciliationBaselineHoldings WHERE symbol IS NOT NULL AND symbol != ''",
  "SELECT DISTINCT symbol FROM ZerodhaHoldings WHERE symbol IS NOT NULL AND symbol != ''",
  "SELECT DISTINCT symbol FROM ReconciledHoldings WHERE symbol IS NOT NULL AND symbol != ''",
  "SELECT DISTINCT symbol FROM PaperTradingPositions WHERE symbol IS NOT NULL AND symbol != ''"
];

for (const q of queries) {
  try {
    const rows = db.prepare(q).all() as { symbol: string }[];
    for (const r of rows) {
      if (r.symbol) investedSymbolsSet.add(r.symbol.trim().toUpperCase());
    }
  } catch (e: any) {}
}

const investedSymbols = Array.from(investedSymbolsSet).sort();

console.log('Invested symbols count:', investedSymbols.length);

const results = [];
for (const sym of investedSymbols) {
  const master = db.prepare("SELECT isin, company_name, sector FROM MasterTickers WHERE symbol = ?").get(sym) as any;
  const facts = (db.prepare("SELECT COUNT(*) as c FROM company_facts WHERE symbol = ?").get(sym) as any).c;
  const snapshots = (db.prepare("SELECT COUNT(*) as c FROM fundamental_endpoint_snapshots WHERE symbol = ?").get(sym) as any).c;
  const fin = (db.prepare("SELECT COUNT(*) as c FROM HistoricalFinancialStatements WHERE symbol = ?").get(sym) as any).c;
  const share = (db.prepare("SELECT COUNT(*) as c FROM HistoricalShareholdingPattern WHERE symbol = ?").get(sym) as any).c;
  const audit = db.prepare("SELECT * FROM DataQualityAuditLedger WHERE symbol = ?").get(sym) as any;

  results.push({
    symbol: sym,
    inMaster: !!master,
    companyName: master?.company_name || null,
    sector: master?.sector || null,
    facts,
    snapshots,
    financials: fin,
    shareholding: share,
    auditLedger: !!audit
  });
}

// Print symbols missing company_name or master
const missingMaster = results.filter(r => !r.inMaster);
console.log(`Missing MasterTickers (${missingMaster.length}):`, missingMaster.map(r => r.symbol).join(', '));

// Print symbols with 0 facts
const zeroFacts = results.filter(r => r.facts === 0);
console.log(`Zero company_facts (${zeroFacts.length}):`, zeroFacts.map(r => r.symbol).join(', '));

// Print symbols with 0 snapshots
const zeroSnapshots = results.filter(r => r.snapshots === 0);
console.log(`Zero snapshots (${zeroSnapshots.length}):`, zeroSnapshots.map(r => r.symbol).join(', '));

// Print symbols with 0 financials
const zeroFinancials = results.filter(r => r.financials === 0);
console.log(`Zero HistoricalFinancialStatements (${zeroFinancials.length}):`, zeroFinancials.map(r => r.symbol).join(', '));

// Print symbols with 0 shareholding
const zeroShareholding = results.filter(r => r.shareholding === 0);
console.log(`Zero HistoricalShareholdingPattern (${zeroShareholding.length}):`, zeroShareholding.map(r => r.symbol).join(', '));

console.log('\n--- Batch 1 (First 50 invested shares) ---');
console.log(investedSymbols.slice(0, 50).join(', '));

console.log('\n--- Batch 2 (Remaining 35 invested shares) ---');
console.log(investedSymbols.slice(50).join(', '));
