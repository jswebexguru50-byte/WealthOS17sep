const { createClient } = require('@libsql/client');
const fs = require('fs');

async function main() {
  const dbNow = createClient({ url: 'file:./portfolio.db' });
  
  // Find backup db file
  const backupFile = fs.readdirSync('.').find(f => f.startsWith('portfolio_pre_dedup_backup_'));
  console.log(`Comparing against backup file: ${backupFile}`);
  const dbPre = createClient({ url: `file:./${backupFile}` });

  const symbols = ['APOLLO', 'BLS', 'DESCO', 'ORIANA', 'TEMBO', 'RNFI', 'KALYANICAST', 'MRPAGRO'];

  for (const sym of symbols) {
    console.log(`\n======================================================`);
    console.log(`SYMBOL: ${sym} (Portfolio: Maa)`);
    console.log(`======================================================`);
    const preTx = await dbPre.execute({ sql: "SELECT id, date, type, symbol, quantity, price, gross_amount, source FROM Transactions WHERE portfolio='Maa' AND (symbol = ? OR symbol LIKE ?)", args: [sym, `%${sym}%`] });
    const nowTx = await dbNow.execute({ sql: "SELECT id, date, type, symbol, quantity, price, gross_amount, source FROM Transactions WHERE portfolio='Maa' AND (symbol = ? OR symbol LIKE ?)", args: [sym, `%${sym}%`] });
    
    const preBuys = preTx.rows.filter(r => r.type.includes('BUY') || r.type === 'IPO / Rights').reduce((a, r) => a + Number(r.quantity), 0);
    const preSells = preTx.rows.filter(r => r.type.includes('SELL')).reduce((a, r) => a + Number(r.quantity), 0);
    const nowBuys = nowTx.rows.filter(r => r.type.includes('BUY') || r.type === 'IPO / Rights').reduce((a, r) => a + Number(r.quantity), 0);
    const nowSells = nowTx.rows.filter(r => r.type.includes('SELL')).reduce((a, r) => a + Number(r.quantity), 0);

    console.log(`Pre-Dedup: Buys = ${preBuys}, Sells = ${preSells}, Net = ${preBuys - preSells}`);
    console.log(`Now:       Buys = ${nowBuys}, Sells = ${nowSells}, Net = ${nowBuys - nowSells}`);
  }

  process.exit(0);
}

main().catch(console.error);
