const {createClient} = require('@libsql/client');
const db = createClient({url: 'file:./portfolio.db'});

async function check() {
  const ports = await db.execute("SELECT id, name, type, status, family_group FROM Portfolios");
  console.log("=== PORTFOLIOS ===");
  console.log(JSON.stringify(ports.rows, null, 2));

  const holdingCounts = await db.execute("SELECT portfolio, count(*) as count, sum(quantity) as total_qty, sum(current_value) as total_val FROM Holdings WHERE quantity > 0 GROUP BY portfolio");
  console.log("\n=== HOLDINGS SUMMARY ===");
  console.log(JSON.stringify(holdingCounts.rows, null, 2));
}

check();
