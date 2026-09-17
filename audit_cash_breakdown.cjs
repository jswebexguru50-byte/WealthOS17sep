const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  // Exclude duplicate SECURITY IN/OUT
  const txs = await db.execute(`
    SELECT id, date, type, symbol, quantity, price, gross_amount, net_amount, notes, source, batch_id, is_ca, is_cash_flow
    FROM Transactions
    WHERE portfolio='cc9'
      AND NOT (batch_id='PMS-1787815999863' AND UPPER(type) IN ('SECURITY IN', 'SECURITY OUT'))
    ORDER BY date ASC, id ASC
  `);

  let deposits = 0;
  let inKindSecIn = 0;
  let inKindSecOut = 0;
  let withdrawals = 0;
  let dividends = 0;
  let sellProceeds = 0;
  let buyCosts = 0;
  let mgmtFees = 0;
  let tds = 0;
  let otherExpenses = 0;

  txs.rows.forEach(t => {
    const type = (t.type || '').toUpperCase().trim();
    const amt = Math.abs(Number(t.net_amount || (t.quantity * t.price) || 0));

    if (type === 'DEPOSIT') {
      deposits += amt;
    } else if (['SECURITY IN', 'TRANSFER IN'].includes(type)) {
      if (!t.is_ca) inKindSecIn += amt;
    } else if (['SECURITY OUT', 'TRANSFER OUT'].includes(type)) {
      if (!t.is_ca) inKindSecOut += amt;
    } else if (type === 'WITHDRAWAL') {
      withdrawals += amt;
    } else if (['DIVIDEND', 'CASH_INCOME', 'INTEREST'].includes(type)) {
      dividends += amt;
    } else if (['SELL', 'SALE', 'BUYBACK'].includes(type)) {
      sellProceeds += amt;
    } else if (['BUY', 'PURCHASE'].includes(type)) {
      buyCosts += amt;
    } else if (['MANAGEMENT_FEE', 'MANAGEMENT'].includes(type)) {
      mgmtFees += amt;
    } else if (type === 'TDS') {
      tds += amt;
    } else if (['EXPENSE', 'STT_EXPENSE', 'CHARGES', 'BROKERAGE', 'ENTRY_LOAD', 'CUSTODY_CHARGES', 'AUDIT_CHARGES', 'DP_CHARGES'].includes(type)) {
      otherExpenses += amt;
    }
  });

  console.log('=== CC9 CASH & CAPITAL BREAKDOWN ===');
  console.log(`1. Cash Deposits (BANKBOOK)          : ₹${deposits.toLocaleString('en-IN')}`);
  console.log(`2. In-Kind Securities In (PMS)       : ₹${inKindSecIn.toLocaleString('en-IN')}`);
  console.log(`3. Total Capital Contributed (1 + 2) : ₹${(deposits + inKindSecIn).toLocaleString('en-IN')}`);
  console.log(`4. Cash Withdrawals (Returned)       : ₹${withdrawals.toLocaleString('en-IN')}`);
  console.log(`5. In-Kind Securities Out            : ₹${inKindSecOut.toLocaleString('en-IN')}`);
  console.log(`----------------------------------------------------------------`);
  console.log(`6. Gross Trading Sells               : ₹${sellProceeds.toLocaleString('en-IN')}`);
  console.log(`7. Gross Trading Buys                : ₹${buyCosts.toLocaleString('en-IN')}`);
  console.log(`8. Net Trading Cash (Sells - Buys)   : ₹${(sellProceeds - buyCosts).toLocaleString('en-IN')}`);
  console.log(`9. Dividends & Cash Income           : ₹${dividends.toLocaleString('en-IN')}`);
  console.log(`10. Management Fees Paid             : ₹${mgmtFees.toLocaleString('en-IN')}`);
  console.log(`11. TDS Deducted                     : ₹${tds.toLocaleString('en-IN')}`);
  console.log(`12. Operating & Other Expenses       : ₹${otherExpenses.toLocaleString('en-IN')}`);
  console.log(`----------------------------------------------------------------`);
  
  const cashInHand = (deposits + dividends + sellProceeds) - (withdrawals + buyCosts + mgmtFees + tds + otherExpenses);
  console.log(`Reconstructed Cash in Hand           : ₹${Math.round(cashInHand).toLocaleString('en-IN')}`);
  console.log(`Statement Cash Balance (23/08/2026)  : ₹85,335`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
