const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  for (const sym of ['JTLIND', 'TIMETECHNO', 'ITCHOTELS', 'GROWW', 'BGVL', 'LT', 'LARSEN AND TOUBRO LTD']) {
    console.log(`\n=== TRANSACTIONS FOR ${sym} ===`);
    const r = await db.execute({
      sql: "SELECT id, date, type, symbol, quantity, price, net_amount, source, batch_id, notes FROM Transactions WHERE portfolio='cc9' AND (symbol=? OR symbol LIKE ?) ORDER BY date, id",
      args: [sym, `%${sym}%`]
    });
    r.rows.forEach(row => console.log(JSON.stringify(row)));
  }
}

main().catch(console.error);
