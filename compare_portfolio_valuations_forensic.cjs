const { createClient } = require('@libsql/client');
const fs = require('fs');

async function main() {
  const dbNow = createClient({ url: 'file:./portfolio.db' });
  const dbBackup = createClient({ url: 'file:./portfolio_persistent_backup.db' });

  console.log("==========================================================================================");
  console.log("             FORENSIC VALUATION COMPARISON: MORNING VS CURRENT                            ");
  console.log("==========================================================================================\n");

  // 1. Portfolio level sum comparison
  const sumNow = await dbNow.execute("SELECT portfolio, count(*) as count, sum(current_value) as total_val, sum(total_cost) as total_cost FROM Holdings GROUP BY portfolio ORDER BY portfolio");
  const sumPre = await dbBackup.execute("SELECT portfolio, count(*) as count, sum(current_value) as total_val, sum(total_cost) as total_cost FROM Holdings GROUP BY portfolio ORDER BY portfolio");

  const mapPre = new Map();
  sumPre.rows.forEach(r => mapPre.set(r.portfolio, r));

  console.log("=== 1. PORTFOLIO-BY-PORTFOLIO VALUATION COMPARISON ===");
  console.log("| Portfolio | Morning Value (₹) | Current Value (₹) | Change in Value (₹) | Morning Count | Current Count |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: |");

  let totalMorningVal = 0;
  let totalCurrentVal = 0;

  const allPortfolios = new Set([...sumNow.rows.map(r => r.portfolio), ...sumPre.rows.map(r => r.portfolio)]);

  for (const p of Array.from(allPortfolios).sort()) {
    const pre = mapPre.get(p) || { total_val: 0, count: 0 };
    const now = sumNow.rows.find(r => r.portfolio === p) || { total_val: 0, count: 0 };
    const preVal = Number(pre.total_val || 0);
    const nowVal = Number(now.total_val || 0);
    const diff = nowVal - preVal;

    totalMorningVal += preVal;
    totalCurrentVal += nowVal;

    console.log(`| ${p.padEnd(20)} | ₹${preVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} | ₹${nowVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} | ₹${diff.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} | ${String(pre.count).padStart(13)} | ${String(now.count).padStart(13)} |`);
  }

  const grandDiff = totalCurrentVal - totalMorningVal;
  console.log("------------------------------------------------------------------------------------------");
  console.log(`| TOTAL COMBINED VALUATION | ₹${totalMorningVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} | ₹${totalCurrentVal.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} | ₹${grandDiff.toLocaleString('en-IN', { maximumFractionDigits: 2 }).padStart(15)} |`);
  console.log("==========================================================================================\n");

  // 2. Line-by-line stock differences
  const hNow = await dbNow.execute("SELECT portfolio, symbol, isin, quantity, ltp, current_value FROM Holdings ORDER BY portfolio, symbol");
  const hPre = await dbBackup.execute("SELECT portfolio, symbol, isin, quantity, ltp, current_value FROM Holdings ORDER BY portfolio, symbol");

  const preStockMap = new Map();
  hPre.rows.forEach(r => preStockMap.set(`${r.portfolio}|||${r.symbol}`, r));

  console.log("=== 2. EXACT STOCK-BY-STOCK HOLDING & VALUATION DIFFERENCES ===");
  console.log("| Portfolio | Symbol | Morning Qty | Current Qty | Qty Diff | Morning Val (₹) | Current Val (₹) | Value Diff (₹) | Reason / Explanation |");
  console.log("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |");

  const processedKeys = new Set();

  for (const hn of hNow.rows) {
    const key = `${hn.portfolio}|||${hn.symbol}`;
    processedKeys.add(key);
    const hp = preStockMap.get(key);

    const qPre = hp ? Number(hp.quantity) : 0;
    const qNow = Number(hn.quantity);
    const vPre = hp ? Number(hp.current_value) : 0;
    const vNow = Number(hn.current_value);
    const qDiff = qNow - qPre;
    const vDiff = vNow - vPre;

    if (Math.abs(vDiff) > 100 || Math.abs(qDiff) > 0.001) {
      let explanation = 'Price movement';
      if (qDiff !== 0) explanation = `Quantity changed (${qPre} -> ${qNow})`;
      console.log(`| ${hn.portfolio.padEnd(10)} | ${hn.symbol.padEnd(14)} | ${String(qPre).padStart(11)} | ${String(qNow).padStart(11)} | ${String(qDiff).padStart(8)} | ₹${vPre.toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | ₹${vNow.toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | ₹${vDiff.toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | ${explanation} |`);
    }
  }

  // Check positions that existed in morning but removed now
  for (const hp of hPre.rows) {
    const key = `${hp.portfolio}|||${hp.symbol}`;
    if (!processedKeys.has(key)) {
      const qPre = Number(hp.quantity);
      const vPre = Number(hp.current_value);
      console.log(`| ${hp.portfolio.padEnd(10)} | ${hp.symbol.padEnd(14)} | ${String(qPre).padStart(11)} | ${String(0).padStart(11)} | ${String(-qPre).padStart(8)} | ₹${vPre.toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | ₹${(0).toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | ₹${(-vPre).toLocaleString('en-IN', { maximumFractionDigits: 0 }).padStart(12)} | Position Closed / Exited |`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
