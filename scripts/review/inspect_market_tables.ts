import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
console.log('DailyOHLCV schema:', db.prepare("PRAGMA table_info(DailyOHLCV)").all().map((c: any) => c.name));
console.log('DailyOHLCV sample RVTH:', db.prepare("SELECT * FROM DailyOHLCV WHERE UPPER(symbol) = 'RVTH' ORDER BY trade_date DESC LIMIT 5").all());

console.log('NseBhavcopy schema:', db.prepare("PRAGMA table_info(NseBhavcopy)").all().map((c: any) => c.name));
console.log('NseBhavcopy sample RVTH:', db.prepare("SELECT * FROM NseBhavcopy WHERE UPPER(symbol) = 'RVTH' ORDER BY trade_date DESC LIMIT 5").all());

console.log('HistoricalShareholdingPattern schema:', db.prepare("PRAGMA table_info(HistoricalShareholdingPattern)").all().map((c: any) => c.name));
console.log('HistoricalShareholdingPattern RVTH:', db.prepare("SELECT * FROM HistoricalShareholdingPattern WHERE UPPER(symbol) = 'RVTH' ORDER BY as_of_date DESC LIMIT 5").all());

console.log('InstitutionalDeals schema:', db.prepare("PRAGMA table_info(InstitutionalDeals)").all().map((c: any) => c.name));
console.log('InstitutionalDeals sample:', db.prepare("SELECT * FROM InstitutionalDeals LIMIT 3").all());

// Check if any other deal/sast/insider tables exist
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
const dealLike = allTables.filter((t: string) => /sast|insider|bulk|block|shareholder|promoter|pledge/i.test(t));
console.log('Deal-like / disclosure-like tables:', dealLike);
for (const t of dealLike) {
  const c = db.prepare(`SELECT count(*) as c FROM "${t}"`).get() as any;
  console.log(`  ${t}: ${c.c} rows`);
}
