const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const rows = await db.execute("SELECT id, date, type, symbol, isin, quantity, price, gross_amount, net_amount, source, notes FROM Transactions WHERE portfolio='Maa' AND symbol='RNFI' AND (date = '2026-04-01' OR date = '2026-04-02') ORDER BY date, id");
  console.log('Transactions on 2026-04-01 and 2026-04-02:');
  console.log(rows.rows);
  process.exit(0);
}

main().catch(console.error);
