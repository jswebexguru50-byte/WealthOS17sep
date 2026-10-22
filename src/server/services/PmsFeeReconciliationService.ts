function dbAll(db: any, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((res, rej) => db.all(sql, params, (e: any, r: any) => e ? rej(e) : res(r || [])));
}
function dbRun(db: any, sql: string, params: any[] = []): Promise<any> {
  return new Promise((res, rej) => db.run(sql, params, function (this: any, e: any) { e ? rej(e) : res(this); }));
}
function dbGet(db: any, sql: string, params: any[] = []): Promise<any> {
  return new Promise((res, rej) => db.get(sql, params, (e: any, r: any) => e ? rej(e) : res(r)));
}

export interface FeeAuditPeriod {
  period: string; // e.g. "2024-Q1" or "2024-03"
  periodLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  avgDailyAum: number;
  expectedBaseFee: number;
  expectedGst: number;
  expectedTotalFee: number;
  actualDebit: number;
  actualBaseFee?: number;
  actualGst?: number;
  variance: number; // actualDebit - expectedTotalFee
  variancePct: number;
  status: 'MATCH' | 'OVERCHARGED' | 'UNDERCHARGED' | 'PENDING';
  transactions: Array<{
    id: number;
    date: string;
    type: string;
    symbol: string;
    net_amount: number;
    notes: string;
  }>;
}

export interface FeeAuditSummary {
  portfolio: string;
  annualFeeRate: number;
  gstRate: number;
  billingFrequency: 'monthly' | 'quarterly';
  calculationBasis: 'daily_avg' | 'month_end';
  totalAumAssessed: number;
  latestAum: number;
  totalExpectedBaseFee: number;
  totalExpectedGst: number;
  totalExpectedFee: number;
  totalActualDebited: number;
  netVariance: number;
  netVariancePct: number;
  overchargedCount: number;
  underchargedCount: number;
  matchedCount: number;
  pendingCount: number;
  periods: FeeAuditPeriod[];
  allFeeTransactions: Array<{
    id: number;
    date: string;
    type: string;
    symbol: string;
    net_amount: number;
    notes: string;
  }>;
}

export class PmsFeeReconciliationService {
  private static instance: PmsFeeReconciliationService;

  public static getInstance(): PmsFeeReconciliationService {
    if (!PmsFeeReconciliationService.instance) {
      PmsFeeReconciliationService.instance = new PmsFeeReconciliationService();
    }
    return PmsFeeReconciliationService.instance;
  }

  public async ensureSchema(db: any): Promise<void> {
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS PmsFeeConfigurations (
        portfolio TEXT PRIMARY KEY,
        annual_fee_rate REAL DEFAULT 1.0,
        gst_rate REAL DEFAULT 18.0,
        billing_frequency TEXT DEFAULT 'quarterly',
        calculation_basis TEXT DEFAULT 'daily_avg',
        include_expenses INTEGER DEFAULT 0,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async getFeeConfig(db: any, portfolio: string): Promise<any> {
    await this.ensureSchema(db);
    const row = await dbGet(db, `SELECT * FROM PmsFeeConfigurations WHERE portfolio = ?`, [portfolio]);
    if (row) return row;
    return {
      portfolio,
      annual_fee_rate: 1.0,
      gst_rate: 18.0,
      billing_frequency: 'quarterly',
      calculation_basis: 'daily_avg',
      include_expenses: 0
    };
  }

  public async saveFeeConfig(db: any, config: {
    portfolio: string;
    annual_fee_rate: number;
    gst_rate: number;
    billing_frequency: string;
    calculation_basis: string;
    include_expenses?: number;
    notes?: string;
  }): Promise<void> {
    await this.ensureSchema(db);
    await dbRun(db, `
      INSERT INTO PmsFeeConfigurations (
        portfolio, annual_fee_rate, gst_rate, billing_frequency, calculation_basis, include_expenses, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(portfolio) DO UPDATE SET
        annual_fee_rate = excluded.annual_fee_rate,
        gst_rate = excluded.gst_rate,
        billing_frequency = excluded.billing_frequency,
        calculation_basis = excluded.calculation_basis,
        include_expenses = excluded.include_expenses,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      config.portfolio,
      config.annual_fee_rate || 1.0,
      config.gst_rate ?? 18.0,
      config.billing_frequency || 'quarterly',
      config.calculation_basis || 'daily_avg',
      config.include_expenses ? 1 : 0,
      config.notes || ''
    ]);
  }

  public async runFeeAudit(db: any, options: {
    portfolio: string;
    annualFeeRate?: number;
    gstRate?: number;
    billingFrequency?: 'monthly' | 'quarterly';
    calculationBasis?: 'daily_avg' | 'month_end';
    includeExpenses?: boolean;
  }): Promise<FeeAuditSummary> {
    const { portfolio } = options;
    const storedConfig = await this.getFeeConfig(db, portfolio);

    const annualFeeRate = options.annualFeeRate ?? storedConfig.annual_fee_rate ?? 1.0;
    const gstRate = options.gstRate ?? storedConfig.gst_rate ?? 18.0;
    const billingFrequency = options.billingFrequency ?? storedConfig.billing_frequency ?? 'quarterly';
    const calculationBasis = options.calculationBasis ?? storedConfig.calculation_basis ?? 'daily_avg';
    const includeExpenses = options.includeExpenses ?? (storedConfig.include_expenses === 1);

    // 1. Fetch transactions for portfolio
    const txns = await dbAll(db, `
      SELECT id, date, symbol, isin, type, quantity, price, net_amount, notes, is_cash_flow
      FROM Transactions
      WHERE portfolio = ?
      ORDER BY date ASC, id ASC
    `, [portfolio]);

    if (!txns || txns.length === 0) {
      return {
        portfolio,
        annualFeeRate,
        gstRate,
        billingFrequency,
        calculationBasis,
        totalAumAssessed: 0,
        latestAum: 0,
        totalExpectedBaseFee: 0,
        totalExpectedGst: 0,
        totalExpectedFee: 0,
        totalActualDebited: 0,
        netVariance: 0,
        netVariancePct: 0,
        overchargedCount: 0,
        underchargedCount: 0,
        matchedCount: 0,
        pendingCount: 0,
        periods: [],
        allFeeTransactions: []
      };
    }

    // 2. Fetch historical close prices and current Holdings LTP
    const rawPrices = await dbAll(db, `SELECT symbol, date, close_price FROM HistoricalPrices ORDER BY date ASC`);
    const pricesMap: Record<string, Record<string, number>> = {};
    for (const r of rawPrices as any[]) {
      if (!pricesMap[r.symbol]) pricesMap[r.symbol] = {};
      pricesMap[r.symbol][r.date] = r.close_price;
    }

    const holdingsRows = await dbAll(db, `SELECT symbol, ltp FROM Holdings WHERE portfolio = ?`, [portfolio]);
    const ltpMap: Record<string, number> = {};
    (holdingsRows as any[]).forEach(h => { if (h.symbol) ltpMap[h.symbol] = h.ltp; });

    // 3. Identify and classify actual fee debits in the bank book / transactions
    const allFeeTransactions: any[] = [];
    const feeTxnsByPeriod: Record<string, any[]> = {};

    for (const t of txns as any[]) {
      const ty = String(t.type || '').toUpperCase();
      const sym = String(t.symbol || '').toUpperCase();
      const notes = String(t.notes || '').toUpperCase();

      const isMgmtFee = ty === 'MANAGEMENT_FEE' || sym.includes('MANAGEMENT_FEE') || notes.includes('MANAGEMENT FEE');
      const isOtherExpense = includeExpenses && (
        ty === 'EXPENSE' || sym.includes('EXPENSE') || sym.includes('CUSTODY') || sym.includes('FUND ACCOUNTING') ||
        notes.includes('CUSTODY') || notes.includes('FUND ACCOUNTING') || notes.includes('OPERATING EXPENSES')
      );

      if (isMgmtFee || isOtherExpense) {
        allFeeTransactions.push(t);
        const d = new Date(t.date);
        let pKey = '';
        if (billingFrequency === 'monthly') {
          pKey = t.date.slice(0, 7); // YYYY-MM
        } else {
          pKey = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
        }
        if (!feeTxnsByPeriod[pKey]) feeTxnsByPeriod[pKey] = [];
        feeTxnsByPeriod[pKey].push(t);
      }
    }

    // 4. Simulate daily portfolio holdings & cash to calculate daily AUM
    const validDates = (txns as any[]).map(t => t.date).filter(Boolean);
    const startDate = new Date(validDates[0]);
    const endDate = new Date();

    let cur = new Date(startDate);
    const holdings: Record<string, number> = {};
    let currentCash = 0;
    const lastKnownPrice: Record<string, number> = {};
    let txIdx = 0;

    const dailyRecords: Record<string, { aum: number; cash: number; equity: number }> = {};

    while (cur <= endDate) {
      const dStr = cur.toISOString().slice(0, 10);

      while (txIdx < txns.length && (txns[txIdx] as any).date <= dStr) {
        const t = txns[txIdx] as any;
        const ty = String(t.type || '').toUpperCase();
        const sym = t.symbol || 'CASH';
        const qty = t.quantity || 0;
        const netAmt = t.net_amount || (qty * (t.price || 0)) || 0;

        if (!sym.startsWith('CASH:')) {
          if (['BUY', 'PURCHASE', 'TRANSFER IN', 'SECURITY IN', 'BONUS', 'ALLOTMENT'].includes(ty)) {
            holdings[sym] = (holdings[sym] || 0) + qty;
            if (t.price > 0) lastKnownPrice[sym] = t.price;
          } else if (['SELL', 'SALE', 'TRANSFER OUT', 'SECURITY OUT'].includes(ty)) {
            holdings[sym] = (holdings[sym] || 0) - qty;
            if (t.price > 0) lastKnownPrice[sym] = t.price;
          }
        }

        if (ty === 'DEPOSIT' || ty === 'CASH_INCOME' || ty.includes('DIVIDEND') || ty.includes('INTEREST')) {
          currentCash += netAmt;
        } else if (ty === 'WITHDRAWAL' || ty === 'MANAGEMENT_FEE' || ty === 'EXPENSE' || ty === 'TDS' || ty.includes('FEE')) {
          currentCash -= netAmt;
        } else if (sym.startsWith('CASH:') && (ty === 'BUY' || ty === 'PURCHASE')) {
          currentCash -= netAmt;
        } else if (sym.startsWith('CASH:') && (ty === 'SELL' || ty === 'SALE')) {
          currentCash += netAmt;
        }

        txIdx++;
      }

      for (const s in holdings) {
        if (pricesMap[s] && pricesMap[s][dStr]) {
          lastKnownPrice[s] = pricesMap[s][dStr];
        } else if (ltpMap[s] && !lastKnownPrice[s]) {
          lastKnownPrice[s] = ltpMap[s];
        }
      }

      let eqVal = 0;
      for (const s in holdings) {
        if (holdings[s] > 0.001) {
          eqVal += holdings[s] * (lastKnownPrice[s] || 0);
        }
      }

      const dailyAum = Math.max(0, currentCash) + eqVal;
      dailyRecords[dStr] = { aum: dailyAum, cash: currentCash, equity: eqVal };

      cur.setDate(cur.getDate() + 1);
    }

    // 5. Aggregate daily records into Periods (Monthly or Quarterly)
    const periodsMap: Record<string, { days: number; aumSum: number; dates: string[]; endAum: number }> = {};
    for (const [dStr, rec] of Object.entries(dailyRecords)) {
      const d = new Date(dStr);
      let pKey = '';
      if (billingFrequency === 'monthly') {
        pKey = dStr.slice(0, 7);
      } else {
        pKey = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      }

      if (!periodsMap[pKey]) {
        periodsMap[pKey] = { days: 0, aumSum: 0, dates: [], endAum: 0 };
      }
      periodsMap[pKey].days++;
      periodsMap[pKey].aumSum += rec.aum;
      periodsMap[pKey].dates.push(dStr);
      periodsMap[pKey].endAum = rec.aum;
    }

    const periods: FeeAuditPeriod[] = [];
    let grandExpBase = 0;
    let grandExpGst = 0;
    let grandExpTotal = 0;
    let grandActual = 0;
    let totalAumSum = 0;
    let totalDays = 0;

    let overchargedCount = 0;
    let underchargedCount = 0;
    let matchedCount = 0;
    let pendingCount = 0;

    const sortedPeriodKeys = Object.keys(periodsMap).sort();

    for (const pKey of sortedPeriodKeys) {
      const m = periodsMap[pKey];
      const avgDailyAum = calculationBasis === 'month_end' ? m.endAum : (m.aumSum / m.days);
      const expectedBaseFee = avgDailyAum * (annualFeeRate / 100) * (m.days / 365);
      const expectedGst = expectedBaseFee * (gstRate / 100);
      const expectedTotalFee = expectedBaseFee + expectedGst;

      const pTxns = feeTxnsByPeriod[pKey] || [];
      const actualDebit = pTxns.reduce((s: number, tx: any) => s + (tx.net_amount || 0), 0);

      const variance = actualDebit > 0 ? (actualDebit - expectedTotalFee) : 0;
      const variancePct = actualDebit > 0 && expectedTotalFee > 0 ? (variance / expectedTotalFee) * 100 : 0;

      let status: 'MATCH' | 'OVERCHARGED' | 'UNDERCHARGED' | 'PENDING' = 'PENDING';
      if (actualDebit > 0) {
        if (Math.abs(variancePct) <= 3.0) {
          status = 'MATCH';
          matchedCount++;
        } else if (variance > 0) {
          status = 'OVERCHARGED';
          overchargedCount++;
        } else {
          status = 'UNDERCHARGED';
          underchargedCount++;
        }
      } else {
        pendingCount++;
      }

      grandExpBase += expectedBaseFee;
      grandExpGst += expectedGst;
      grandExpTotal += expectedTotalFee;
      grandActual += actualDebit;
      totalAumSum += m.aumSum;
      totalDays += m.days;

      let periodLabel = pKey;
      if (billingFrequency === 'quarterly') {
        const parts = pKey.split('-Q');
        periodLabel = `Q${parts[1]} FY${parts[0].slice(2)}`;
      } else {
        const dObj = new Date(pKey + '-01');
        periodLabel = dObj.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      }

      periods.push({
        period: pKey,
        periodLabel,
        startDate: m.dates[0],
        endDate: m.dates[m.dates.length - 1],
        days: m.days,
        avgDailyAum,
        expectedBaseFee,
        expectedGst,
        expectedTotalFee,
        actualDebit,
        variance,
        variancePct,
        status,
        transactions: pTxns
      });
    }

    const totalAumAssessed = totalDays > 0 ? totalAumSum / totalDays : 0;
    const latestDate = Object.keys(dailyRecords).pop();
    const latestAum = latestDate ? dailyRecords[latestDate].aum : 0;

    const netVariance = grandActual - grandExpTotal;
    const netVariancePct = grandExpTotal > 0 ? (netVariance / grandExpTotal) * 100 : 0;

    return {
      portfolio,
      annualFeeRate,
      gstRate,
      billingFrequency,
      calculationBasis,
      totalAumAssessed,
      latestAum,
      totalExpectedBaseFee: grandExpBase,
      totalExpectedGst: grandExpGst,
      totalExpectedFee: grandExpTotal,
      totalActualDebited: grandActual,
      netVariance,
      netVariancePct,
      overchargedCount,
      underchargedCount,
      matchedCount,
      pendingCount,
      periods,
      allFeeTransactions
    };
  }
}
