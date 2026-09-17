const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  await db.execute("DELETE FROM Transactions WHERE portfolio='cc9' AND symbol='JTLIND' AND type IN ('SPLIT', 'BONUS')");
  await db.execute(`
    INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes, batch_id, is_ca, is_cash_flow)
    VALUES ('2024-11-14', 'cc9', 'SPLIT', 'INE391J01032', 'JTLIND', 3300, 0, 0, 0, 'System-CA', 'JTL Industries 2:1 Stock Split (1:1 Bonus)', 'PMS-RECON-1786807141134', 1, 0)
  `);
  console.log('Updated JTLIND corporate action to exactly 3,300 split shares.');
  process.exit(0);
}

main().catch(console.error);
