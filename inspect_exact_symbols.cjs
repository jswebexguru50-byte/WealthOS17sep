const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  for (const sym of ['JTLIND', 'TIMETECHNO', 'ITCHOTELS', 'GROWW', 'BGVL']) {
    console.log(`\n=== EXACT TRANSACTIONS FOR ${sym} ===`);
    const r = await db.execute({
      sql: "SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id, notes FROM Transactions WHERE portfolio='cc9' AND symbol=? ORDER BY date, id",
      args: [sym]
    });
    r.rows.forEach(row => console.log(JSON.stringify(row)));
  }
}

main().catch(console.error);
