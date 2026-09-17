const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });
  const schema = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Transactions'");
  console.log('=== TRANSACTIONS SCHEMA ===');
  console.log(schema.rows[0].sql);

  const sample = await db.execute("SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes, source FROM Transactions WHERE portfolio='cc9' AND type IN ('TRANSFER IN', 'SECURITY IN') LIMIT 5");
  console.log('\n=== SAMPLE TRANSFER IN ROWS ===');
  sample.rows.forEach(r => console.log(JSON.stringify(r)));

  const rgSchema = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='RealizedGains'");
  console.log('\n=== REALIZEDGAINS SCHEMA ===');
  console.log(rgSchema.rows[0].sql);

  const hSchema = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Holdings'");
  console.log('\n=== HOLDINGS SCHEMA ===');
  console.log(hSchema.rows[0].sql);

  process.exit(0);
}

main().catch(console.error);
