import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const rows = db.prepare(`
  SELECT trade_date, open, high, low, close, volume, delivery_pct, prev_close
  FROM DailyOHLCV
  WHERE UPPER(symbol) = 'RVTH' AND trade_date >= '2026-07-01'
  ORDER BY trade_date ASC
`).all();

console.log('RVTH post-June 2026 sessions count:', rows.length);
console.log('Sample rows:', rows.slice(0, 10));
console.log('Latest rows:', rows.slice(-10));

// Calculate average volume
const vols = rows.map((r: any) => r.volume).filter(Boolean);
const avgVol = vols.reduce((a: number, b: number) => a + b, 0) / (vols.length || 1);
console.log('Average volume:', avgVol);
const highVolRows = rows.filter((r: any) => r.volume > avgVol * 1.5);
console.log('High volume sessions (> 1.5x avg):', highVolRows.length, highVolRows);
