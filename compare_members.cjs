const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.serialize(() => {
  db.all(`
    SELECT DISTINCT name FROM Portfolios 
    WHERE (member_id = 1 OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = 1))
      AND status != 'ARCHIVED'
  `, (err, member1Ports) => {
    const pNames = member1Ports.map(p => p.name);
    console.log('Member 1 (Gopal) Allowed Portfolios:', pNames);

    const placeholders = pNames.map(() => '?').join(',');
    db.get(`SELECT ROUND(SUM(current_value)) as val, ROUND(SUM(total_cost)) as cost, ROUND(SUM(day_change)) as day_chg FROM Holdings WHERE quantity > 0 AND portfolio IN (${placeholders})`, pNames, (err, hM1) => {
      console.log('Holdings for Member 1 (Gopal):', hM1);
    });

    db.get('SELECT ROUND(SUM(current_value)) as val, ROUND(SUM(total_cost)) as cost, ROUND(SUM(day_change)) as day_chg FROM Holdings WHERE quantity > 0', (err, hAll) => {
      console.log('Holdings for ALL Portfolios (Combined):', hAll);
    });

    db.get(`SELECT ROUND(SUM(current_value)) as val, ROUND(SUM(total_cost)) as cost FROM Holdings WHERE quantity > 0 AND portfolio IN ('Brother - Equity', 'Brother - Mutual Funds', 'Pooja MF')`, (err, hBro) => {
      console.log('Brother Portfolios Holdings:', hBro);
    });

    // Check PmsReconciliationBaseline for cc9
    db.all('SELECT * FROM PmsReconciliationBaseline', (err, pmsRows) => {
      console.log('PmsReconciliationBaseline:', pmsRows);
    });

    // Check Bank & FDs
    db.all('SELECT SUM(balance_amount) as total_bal FROM BankAccountsAndFDs', (err, bRows) => {
      console.log('Bank & FDs Raw Balance Sum:', bRows);
      db.close();
    });
  });
});
