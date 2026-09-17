import sqlite3 from 'sqlite3';

async function main() {
  const db = new sqlite3.Database('portfolio.db', sqlite3.OPEN_READONLY);
  const getSql = (q: string): Promise<any> => new Promise((res, rej) => db.get(q, (e, r) => e ? rej(e) : res(r)));
  const allSql = (q: string): Promise<any[]> => new Promise((res, rej) => db.all(q, (e, r) => e ? rej(e) : res(r)));

  console.log('BacktestResultsCache sample:');
  const btcSample = await allSql('SELECT * FROM BacktestResultsCache LIMIT 3');
  console.log(btcSample);

  console.log('FnoDataCache sample:');
  const fnoSample = await allSql('SELECT * FROM FnoDataCache LIMIT 3');
  console.log(fnoSample);

  db.close();
}

main().catch(console.error);
