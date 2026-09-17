const { createClient } = require('@libsql/client');

function calculateXIRR(cashFlows) {
  if (cashFlows.length < 2) return 0;

  const dateToAmount = new Map();
  for (const cf of cashFlows) {
    if (Math.abs(cf.amount) < 0.01) continue;
    const year = cf.date.getFullYear();
    const month = String(cf.date.getMonth() + 1).padStart(2, '0');
    const day = String(cf.date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    dateToAmount.set(dateKey, (dateToAmount.get(dateKey) || 0) + cf.amount);
  }

  const activeFlows = Array.from(dateToAmount.entries()).map(([dateStr, amount]) => ({
    date: new Date(dateStr),
    amount
  })).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (activeFlows.length < 2) return 0;
  const hasPositive = activeFlows.some(cf => cf.amount > 0);
  const hasNegative = activeFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return 0;

  const firstDate = activeFlows[0].date.getTime();

  const f = (rate) => {
    let sum = 0;
    const rSafe = rate <= -0.999 ? -0.999 : rate;
    for (const cf of activeFlows) {
      const fractionOfYears = (cf.date.getTime() - firstDate) / (365 * 24 * 60 * 60 * 1000);
      sum += cf.amount / Math.pow(1 + rSafe, fractionOfYears);
    }
    return sum;
  };

  const df = (rate) => {
    let sum = 0;
    const rSafe = rate <= -0.999 ? -0.999 : rate;
    for (const cf of activeFlows) {
      const fractionOfYears = (cf.date.getTime() - firstDate) / (365 * 24 * 60 * 60 * 1000);
      sum += -cf.amount * fractionOfYears * Math.pow(1 + rSafe, -fractionOfYears - 1);
    }
    return sum;
  };

  let guess = 0.1;
  let maxIterations = 100;
  let precision = 1e-6;
  let resultRate = NaN;

  for (let i = 0; i < maxIterations; i++) {
    const val = f(guess);
    const deriv = df(guess);
    if (Math.abs(deriv) < 1e-12) break;
    let nextGuess = guess - val / deriv;
    if (nextGuess <= -0.999) nextGuess = -0.99;
    if (Math.abs(nextGuess - guess) < precision) {
      if (!isNaN(nextGuess) && isFinite(nextGuess)) resultRate = nextGuess;
      break;
    }
    guess = nextGuess;
  }

  const finalRate = !isNaN(resultRate) ? resultRate : guess;
  return finalRate * 100;
}

async function main() {
  const db = createClient({ url: 'file:./portfolio.db' });

  // 1. Fetch current Valuation of cc9
  const hRes = await db.execute("SELECT sum(current_value) as total_val FROM Holdings WHERE portfolio='cc9'");
  const currentVal = Number(hRes.rows[0].total_val || 0);

  // 2. Fetch all cash deposits & withdrawals for cc9
  const txDeposits = await db.execute("SELECT date, net_amount, type FROM Transactions WHERE portfolio='cc9' AND type IN ('DEPOSIT', 'WITHDRAWAL')");

  // 3. Fetch all TRANSFER IN rows for cc9
  const txTransfers = await db.execute("SELECT date, symbol, quantity, price, net_amount FROM Transactions WHERE portfolio='cc9' AND type IN ('TRANSFER IN', 'SECURITY IN')");

  // Map of Capital Register Costs
  const capitalRegisterCosts = {
    'AEGISLOG': 369.70, 'AFFLE': 1095.00, 'ALKYLAMINE': 3485.94, 'ARE&M': 674.65,
    'AMRUTANJAN': 818.70, 'APLAPOLLO': 1296.40, 'ASIANPAINT': 3109.73, 'BAJFINANCE': 6952.37,
    'BALAMINES': 2347.50, 'BANKBARODA': 167.87, 'BERGEPAINT': 682.72, 'BLS': 207.08,
    'BCG': 25.07, 'CANBK': 318.48, 'CCL': 647.40, 'CDSL': 1410.62,
    'CLEDUCATE': 75.00, 'DEEPAKNTR': 2200.77, 'DELTACORP': 199.87, 'DIVISLAB': 3258.04,
    'EKI': 718.44, 'FEDERALBNK': 129.00, 'GARFIBRES': 3309.37, 'HDFCBANK': 1500.71,
    'HDFCLIFE': 589.47, 'HFCL': 76.91, 'HAL': 1113.00, 'IDBI': 70.50,
    'IDFCFIRSTB': 63.62, 'IIFLCAPS': 97.35, 'IEX': 157.22, 'IRCTC': 725.92,
    'JUBLFOOD': 518.00, 'KOTAKBANK': 1859.20, 'LICHSGFIN': 423.02, 'LUXIND': 1730.00,
    'LTTS': 4044.43, 'MAZDOCK': 1855.02, 'MIRZAINT': 286.96, 'MODISONLTD': 85.96,
    'MTARTECH': 2368.11, 'MUTHOOTFIN': 1296.87, 'OLECTRA': 1120.89, 'PAGEIND': 48465.00,
    'PIDILITIND': 2406.88, 'RELAXO': 1118.09, 'MOTHERSON': 86.00, 'SBICARD': 926.41,
    'SEPC': 14.65, 'SFL': 1216.25, 'SRF': 2160.00, 'TCS': 3385.00,
    'TATAELXSI': 6569.77, 'TATAMOTORS': 507.32, 'TATAMTRDVR': 318.27, 'TATAPOWER': 222.45,
    'TITAN': 3032.35, 'UNOMINDA': 612.95, 'VINSYS': 252.50, 'WIPRO': 442.52,
    'AARTIIND': 967.00, 'AAVAS': 1835.00
  };

  const today = new Date('2026-08-27');

  // --- FLOWS 1: Standard PMS XIRR (Transfer-Date Market Value Basis) ---
  const flowsMkt = [];
  
  for (const d of txDeposits.rows) {
    const amt = Number(d.net_amount);
    if (d.type === 'DEPOSIT') {
      flowsMkt.push({ date: new Date(d.date), amount: -amt });
    } else if (d.type === 'WITHDRAWAL') {
      flowsMkt.push({ date: new Date(d.date), amount: amt });
    }
  }

  let totalMktIn = 0;
  for (const t of txTransfers.rows) {
    const amt = Number(t.net_amount);
    totalMktIn += amt;
    flowsMkt.push({ date: new Date(t.date), amount: -amt });
  }

  flowsMkt.push({ date: today, amount: currentVal });
  const pmsXIRR = calculateXIRR(flowsMkt);

  // --- FLOWS 2: Investor True XIRR (Original Purchase Cost Basis) ---
  const flowsCost = [];

  for (const d of txDeposits.rows) {
    const amt = Number(d.net_amount);
    if (d.type === 'DEPOSIT') {
      flowsCost.push({ date: new Date(d.date), amount: -amt });
    } else if (d.type === 'WITHDRAWAL') {
      flowsCost.push({ date: new Date(d.date), amount: amt });
    }
  }

  let totalCostIn = 0;
  for (const t of txTransfers.rows) {
    const sym = t.symbol;
    const qty = Number(t.quantity);
    const origCostPerSh = capitalRegisterCosts[sym] || Number(t.price);
    const costAmt = qty * origCostPerSh;
    totalCostIn += costAmt;
    flowsCost.push({ date: new Date(t.date), amount: -costAmt });
  }

  flowsCost.push({ date: today, amount: currentVal });
  const investorCostXIRR = calculateXIRR(flowsCost);

  console.log('====================================================================');
  console.log('                 COMPLETE CIRCLE (CC9) DUAL XIRR ANALYSIS           ');
  console.log('====================================================================');
  console.log(`Current Total Portfolio Valuation : ₹${Math.round(currentVal).toLocaleString('en-IN')}`);
  console.log(`Total Cash Deposits Invested       : ₹1,40,00,000 (1.40 Cr)`);
  console.log('--------------------------------------------------------------------');
  console.log(`1. PMS Manager Performance XIRR (Market Value on Transfer Date):`);
  console.log(`   - In-Kind Capital at Market     : ₹${Math.round(totalMktIn).toLocaleString('en-IN')}`);
  console.log(`   - Total Capital Contributed     : ₹${Math.round(14000000 + totalMktIn).toLocaleString('en-IN')}`);
  console.log(`   - PMS Performance XIRR          : ${pmsXIRR.toFixed(2)}% p.a.`);
  console.log('--------------------------------------------------------------------');
  console.log(`2. Investor Lifetime Inception XIRR (Original Purchase Price Basis):`);
  console.log(`   - In-Kind Capital at Cost       : ₹${Math.round(totalCostIn).toLocaleString('en-IN')}`);
  console.log(`   - Total Capital Contributed     : ₹${Math.round(14000000 + totalCostIn).toLocaleString('en-IN')}`);
  console.log(`   - Investor True Cost XIRR       : ${investorCostXIRR.toFixed(2)}% p.a.`);
  console.log('====================================================================\n');

  process.exit(0);
}

main().catch(console.error);
