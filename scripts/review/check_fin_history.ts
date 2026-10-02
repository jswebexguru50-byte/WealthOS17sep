import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

// Check HistoricalFinancialStatements periods
const finPeriods = db.prepare(`
  SELECT symbol, count(*) as period_count 
  FROM HistoricalFinancialStatements 
  GROUP BY symbol 
  ORDER BY period_count ASC 
  LIMIT 25
`).all();
console.log('Fewest periods in HistoricalFinancialStatements:', finPeriods);

// Check income-statement history length in fundamental_endpoint_snapshots
const incSnaps = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'income-statement' LIMIT 200").all() as any[];
const shortIncHist: Array<{ symbol: string; historyLen: number }> = [];
for (const s of incSnaps) {
  try {
    const json = JSON.parse(s.response_json);
    const hist = json.data?.income_statement?.[0]?.history;
    if (Array.isArray(hist) && hist.length <= 2) {
      shortIncHist.push({ symbol: s.symbol, historyLen: hist.length });
    }
  } catch {}
}
console.log('Short income-statement history (<= 2 periods):', shortIncHist.length, shortIncHist.slice(0, 15));
