import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const rows = db.prepare(`
  SELECT s.sector, s.industry, count(*) as cnt 
  FROM MasterTickers m
  JOIN FundamentalSnapshots s ON UPPER(m.symbol) = UPPER(s.symbol)
  WHERE m.sector IS NULL
  GROUP BY s.sector, s.industry 
  ORDER BY cnt DESC 
  LIMIT 30
`).all();
console.log('FundamentalSnapshots for null MasterTickers.sector:');
console.log(rows);

const basicMaterialsSample = db.prepare(`
  SELECT m.symbol, m.name, s.sector, s.industry
  FROM MasterTickers m
  LEFT JOIN FundamentalSnapshots s ON UPPER(m.symbol) = UPPER(s.symbol)
  WHERE m.sector = 'Basic Materials'
  LIMIT 20
`).all();
console.log('Basic Materials sample:', basicMaterialsSample);
