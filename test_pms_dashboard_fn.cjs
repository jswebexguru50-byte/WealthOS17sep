const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

async function testPmsDash() {
  const dbAll = (sql, params) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
  const portfolio = 'IIFL360';

  const makeGroup = async (whereClause, params = []) => {
    const rows = await dbAll(
      `SELECT id, date, type, symbol, isin, quantity, price, net_amount, notes
       FROM Transactions WHERE portfolio = ? AND ${whereClause} ORDER BY date DESC`,
      [portfolio, ...params]
    );
    const total = rows.reduce((s, r) => s + Math.abs(r.net_amount || (r.quantity * r.price) || 0), 0);
    return { total, txns: rows };
  };

  const [deposits, securitiesIn, income, sellProceeds, withdrawals, securitiesOut, managementFees, tds, otherExpenses, buyCosts] = await Promise.all([
    makeGroup("type = 'DEPOSIT'"),
    makeGroup("type IN ('TRANSFER IN','SECURITY IN')"),
    makeGroup("type IN ('DIVIDEND','CASH_INCOME','INTEREST')"),
    makeGroup("type IN ('SELL','SALE','BUYBACK')"),
    makeGroup("type = 'WITHDRAWAL'"),
    makeGroup("type IN ('TRANSFER OUT','SECURITY OUT','MERGER_OUT')"),
    makeGroup("type IN ('MANAGEMENT_FEE','MANAGEMENT')"),
    makeGroup("type = 'TDS'"),
    makeGroup("type IN ('EXPENSE', 'STT_EXPENSE', 'CHARGES', 'BROKERAGE', 'ENTRY_LOAD', 'CUSTODY_CHARGES', 'AUDIT_CHARGES', 'DP_CHARGES')"),
    makeGroup("type IN ('BUY','PURCHASE')"),
  ]);

  const cashInHand = (deposits.total + income.total + sellProceeds.total)
                   - (withdrawals.total + securitiesOut.total + managementFees.total + tds.total + otherExpenses.total + buyCosts.total);

  console.log('PMS_DASH_RESULTS:', {
    deposits: deposits.total,
    income: income.total,
    sellProceeds: sellProceeds.total,
    withdrawals: withdrawals.total,
    securitiesOut: securitiesOut.total,
    managementFees: managementFees.total,
    tds: tds.total,
    otherExpenses: otherExpenses.total,
    buyCosts: buyCosts.total,
    cashInHand
  });
}

testPmsDash();
