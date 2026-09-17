/**
 * Capital Register Analysis & Comparison with DB
 */
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./portfolio.db' });

async function analyzeCapitalRegister() {
  console.log("=== COMPLETE CIRCLE (cc9) CAPITAL REGISTER SUMMARY ===\n");
  
  // From the official Capital Register:
  const capAtCost = 50112770.79;
  const capAtMarket = 51100340.10;
  const cashDeposits = 14000000.00; // (1.05 Cr + 15L + 10L + 10L)
  const tdsDebits = 279897.75;
  const securitiesAtCost = capAtCost - cashDeposits + tdsDebits; // before TDS deduction & merge
  const securitiesAtMarket = capAtMarket - cashDeposits + tdsDebits;

  console.log(`1. Official Complete Circle Capital Register:`);
  console.log(`   - Total Cash Deposits:             ₹${cashDeposits.toLocaleString('en-IN')}`);
  console.log(`   - In-Kind Securities (at Cost):     ₹${Math.round(securitiesAtCost).toLocaleString('en-IN')}`);
  console.log(`   - In-Kind Securities (at Market):   ₹${Math.round(securitiesAtMarket).toLocaleString('en-IN')}`);
  console.log(`   - TDS Trf to Capital A/c (Debits): -₹${tdsDebits.toLocaleString('en-IN')}`);
  console.log(`   -------------------------------------------------------------`);
  console.log(`   => Net Capital at Cost:            ₹${capAtCost.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
  console.log(`   => Net Capital at Market Value:    ₹${capAtMarket.toLocaleString('en-IN', {minimumFractionDigits: 2})}\n`);

  // DB Current State
  const dbDeposits = await db.execute("SELECT sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='DEPOSIT'");
  const dbTfrIn = await db.execute("SELECT sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='TRANSFER IN' AND source='PMS'");
  const dbTDS = await db.execute("SELECT sum(net_amount) as total FROM Transactions WHERE portfolio='cc9' AND UPPER(TRIM(type))='TDS'");
  
  console.log(`2. Current DB Representation in cc9:`);
  console.log(`   - DEPOSIT (Cash):                  ₹${Number(dbDeposits.rows[0].total).toLocaleString('en-IN')}`);
  console.log(`   - TRANSFER IN (PMS Security in):   ₹${Number(dbTfrIn.rows[0].total).toLocaleString('en-IN')} (recorded at Market Value)`);
  console.log(`   - TDS recorded in DB:              ₹${Number(dbTDS.rows[0]?.total || 0).toLocaleString('en-IN')}`);
}

analyzeCapitalRegister().catch(console.error);
