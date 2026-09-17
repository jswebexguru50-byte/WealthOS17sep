const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function checkMaaExtra() {
  for (const sym of ['SJLOGISTIC', 'TEMBO', 'MUFIN']) {
    const tx = await db.execute({
      sql: "SELECT id, date, type, symbol, isin, quantity, price, net_amount, source FROM Transactions WHERE portfolio='Maa' AND symbol=? ORDER BY date ASC",
      args: [sym]
    });
    console.log(`\n=== Transactions for ${sym} in Maa (${tx.rows.length}) ===`);
    tx.rows.forEach(r => console.log(JSON.stringify(r)));
  }
}
checkMaaExtra();
