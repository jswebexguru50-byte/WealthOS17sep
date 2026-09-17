const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function checkUnlisted() {
  const h = await db.execute("SELECT * FROM Holdings WHERE portfolio='Unlisted'");
  console.log("Holdings in Unlisted:", h.rows);
  const tx = await db.execute("SELECT * FROM Transactions WHERE portfolio='Unlisted'");
  console.log("\nTransactions in Unlisted:", tx.rows);
}
checkUnlisted();
