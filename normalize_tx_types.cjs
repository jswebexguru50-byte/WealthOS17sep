const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function normalizeTransactionTypes() {
  console.log("=== NORMALIZING TRANSACTION TYPES IN DATABASE ===");
  
  // Standard canonical types: BUY, SELL, BONUS, SPLIT, DIVIDEND, DEPOSIT, WITHDRAWAL, TDS, TRANSFER IN, TRANSFER OUT, etc.
  const allTypes = await db.execute("SELECT DISTINCT type FROM Transactions");
  console.log("Current unique types:", allTypes.rows.map(r => r.type));

  // Update lowercase / mixed-case standard types
  const map = {
    'buy': 'BUY',
    'Buy': 'BUY',
    'sell': 'SELL',
    'Sell': 'SELL',
    'Bonus': 'BONUS',
    'Split': 'SPLIT',
    'Dividend Payout': 'DIVIDEND PAYOUT',
    'Dividend Reinvest': 'DIVIDEND REINVEST',
    'DeMerger': 'DEMERGER',
    'DeMerger (New)': 'DEMERGER (NEW)',
    'Merged': 'MERGED',
    'Merger': 'MERGER',
    'Rounding Off - Corp Action': 'ROUNDING OFF - CORP ACTION'
  };

  for (const [from, to] of Object.entries(map)) {
    const res = await db.execute({
      sql: "UPDATE Transactions SET type=? WHERE type=?",
      args: [to, from]
    });
    console.log(`Updated '${from}' -> '${to}': ${res.rowsAffected} rows affected`);
  }

  const postTypes = await db.execute("SELECT DISTINCT type, count(*) as cnt FROM Transactions GROUP BY type ORDER BY cnt DESC");
  console.log("\nNormalized Transaction Types:", postTypes.rows);
}

normalizeTransactionTypes().catch(console.error);
