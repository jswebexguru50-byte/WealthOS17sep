import { Router } from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';

const router = Router();

// Ensure ReconciliationAuditSnapshots table exists
export async function ensureAuditTables(db: any) {
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS ReconciliationAuditSnapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      statement_date TEXT,
      portfolio TEXT NOT NULL,
      statement_filename TEXT,
      baseline_holdings_count INTEGER,
      baseline_cost REAL,
      baseline_valuation REAL,
      baseline_cash REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      holdings_snapshot TEXT,
      notes TEXT
    )
  `);

  // Seed standard baselines if empty
  const count = await dbGet(db, "SELECT COUNT(*) as c FROM ReconciliationAuditSnapshots");
  if (!count || count.c === 0) {
    const baselines = [
      {
        statement_date: '2026-08-28',
        portfolio: 'cc9',
        statement_filename: 'COMN0005_6820006_CurrentPortfolio2086GT (9).csv',
        baseline_holdings_count: 48,
        baseline_cost: 45809000,
        baseline_valuation: 73439000,
        baseline_cash: 22559.08,
        currency: 'INR',
        notes: 'Official Complete Circle PMS Statement'
      },
      {
        statement_date: '2026-08-31',
        portfolio: 'US - IBKR',
        statement_filename: 'IBKR - US ETF txn.xlsx',
        baseline_holdings_count: 4,
        baseline_cost: 18200000,
        baseline_valuation: 384988.00,
        baseline_cash: 5280.00,
        currency: 'USD',
        notes: 'Interactive Brokers 4 US ETFs + $5.28k Cash'
      },
      {
        statement_date: '2026-08-31',
        portfolio: 'Maa',
        statement_filename: 'holdings-PSI722 (16).xlsx',
        baseline_holdings_count: 21,
        baseline_cost: 136175000,
        baseline_valuation: 188186000,
        baseline_cash: 0,
        currency: 'INR',
        notes: 'Zerodha Demat Holding Statement'
      },
      {
        statement_date: '2026-08-31',
        portfolio: 'Papa',
        statement_filename: 'Demat Holding Query Stmt_1692_31-08-2026 08.10.XLS',
        baseline_holdings_count: 8,
        baseline_cost: 40042000,
        baseline_valuation: 31686000,
        baseline_cash: 0,
        currency: 'INR',
        notes: 'Demat Query Holding Statement'
      },
      {
        statement_date: '2026-09-01',
        portfolio: 'Unlisted',
        statement_filename: 'Unlisted & AIF Registry',
        baseline_holdings_count: 9,
        baseline_cost: 89820000,
        baseline_valuation: 98440000,
        baseline_cash: 0,
        currency: 'INR',
        notes: 'Solitario @ ₹11,100 + Smart Horizon AIF NAVs'
      },
      {
        statement_date: '2026-09-01',
        portfolio: 'Sarwa',
        statement_filename: 'SWI426B1F1 - Sarwa Invest (3).pdf',
        baseline_holdings_count: 6,
        baseline_cost: 495000,
        baseline_valuation: 7150.72,
        baseline_cash: 168.82,
        currency: 'USD',
        notes: 'Sarwa Monthly Statement'
      }
    ];

    for (const b of baselines) {
      await dbRun(db, `
        INSERT INTO ReconciliationAuditSnapshots (
          statement_date, portfolio, statement_filename, baseline_holdings_count,
          baseline_cost, baseline_valuation, baseline_cash, currency, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        b.statement_date, b.portfolio, b.statement_filename, b.baseline_holdings_count,
        b.baseline_cost, b.baseline_valuation, b.baseline_cash, b.currency, b.notes
      ]);
    }
  }
}

// GET /api/audit/waterfall — Returns incremental bridge between baseline and current value
router.get('/waterfall', async (req, res) => {
  try {
    const db = getDB();
    await ensureAuditTables(db);

    const portfolio = req.query.portfolio ? String(req.query.portfolio).trim() : 'Combined';
    const isCombined = portfolio.toLowerCase() === 'combined' || portfolio === '__ALL__';

    // 1. Fetch FX rate
    const usdRateRow: any = await dbGet(db, "SELECT rate_to_inr FROM CurrencyRates WHERE currency = 'USD'");
    const usdRate = usdRateRow?.rate_to_inr || 94.94;

    // 2. Fetch baselines
    let baselines: any[] = [];
    if (isCombined) {
      baselines = await dbAll(db, "SELECT * FROM ReconciliationAuditSnapshots ORDER BY statement_date DESC");
    } else {
      baselines = await dbAll(db, "SELECT * FROM ReconciliationAuditSnapshots WHERE LOWER(portfolio) = LOWER(?) ORDER BY statement_date DESC LIMIT 1", [portfolio]);
    }

    // 3. Fetch current holdings
    let hQuery = "SELECT * FROM Holdings WHERE quantity > 0";
    const hParams: any[] = [];
    if (!isCombined) {
      hQuery += " AND LOWER(portfolio) = LOWER(?)";
      hParams.push(portfolio);
    }
    const currentHoldings = await dbAll(db, hQuery, hParams);

    // 4. Build Waterfall Bridge
    let baselineValuationINR = 0;
    let currentValuationINR = 0;
    let baselineCostINR = 0;
    let currentCostINR = 0;

    const portfolioDeltas: any[] = [];

    for (const b of baselines) {
      const pName = b.portfolio;
      const pHoldings = currentHoldings.filter((h: any) => h.portfolio.toLowerCase() === pName.toLowerCase());
      
      const isUsPort = b.currency === 'USD';
      const bValINR = isUsPort ? (b.baseline_valuation + (b.baseline_cash || 0)) * usdRate : (b.baseline_valuation + (b.baseline_cash || 0));
      const bCostINR = isUsPort ? b.baseline_cost * usdRate : b.baseline_cost;

      const curValINR = pHoldings.reduce((s: number, h: any) => s + (h.current_value || 0), 0);
      const curCostINR = pHoldings.reduce((s: number, h: any) => s + (h.total_cost || 0), 0);

      // Check transactions created after baseline statement date
      const subsequentTx = await dbAll(db, `
        SELECT date, type, symbol, isin, quantity, price, net_amount, notes
        FROM Transactions 
        WHERE LOWER(portfolio) = LOWER(?) AND date > ?
        ORDER BY date ASC
      `, [pName, b.statement_date]).catch(() => []);

      let newCapitalIn = 0;
      let newCapitalOut = 0;
      let newDividends = 0;
      const newTradesList: any[] = [];

      for (const tx of subsequentTx) {
        const tType = (tx.type || '').toUpperCase();
        if (tType === 'BUY') {
          newCapitalIn += tx.net_amount;
          newTradesList.push({ type: 'BUY', symbol: tx.symbol, date: tx.date, amount: tx.net_amount });
        } else if (tType === 'SELL') {
          newCapitalOut += tx.net_amount;
          newTradesList.push({ type: 'SELL', symbol: tx.symbol, date: tx.date, amount: tx.net_amount });
        } else if (tType.includes('DIVIDEND')) {
          newDividends += tx.net_amount;
          newTradesList.push({ type: 'DIVIDEND', symbol: tx.symbol, date: tx.date, amount: tx.net_amount });
        }
      }

      // Market price change = (Current Val - Baseline Val) - (New Capital In - New Capital Out)
      const netCapitalFlow = newCapitalIn - newCapitalOut;
      const totalDeltaINR = curValINR - bValINR;
      const marketPricePnlINR = totalDeltaINR - netCapitalFlow;

      portfolioDeltas.push({
        portfolio: pName,
        statementDate: b.statement_date,
        statementFile: b.statement_filename,
        baselinePositions: b.baseline_holdings_count,
        currentPositions: pHoldings.length,
        positionsMatch: Math.abs(pHoldings.length - (b.baseline_holdings_count + (b.baseline_cash > 0 ? 1 : 0))) <= 1,
        currency: b.currency,
        baselineValuation: b.baseline_valuation + (b.baseline_cash || 0),
        baselineValuationINR: bValINR,
        currentValuation: isUsPort ? curValINR / usdRate : curValINR,
        currentValuationINR: curValINR,
        netDeltaINR: totalDeltaINR,
        breakdown: {
          newCapitalInvested: newCapitalIn,
          newCapitalWithdrawn: newCapitalOut,
          newDividendsReceived: newDividends,
          marketPriceMovementINR: marketPricePnlINR,
          marketPriceMovementPct: bValINR > 0 ? (marketPricePnlINR / bValINR) * 100 : 0
        },
        subsequentTrades: newTradesList,
        auditStatus: Math.abs(totalDeltaINR) < 1000 ? 'EXACT_MATCH' : (newTradesList.length > 0 ? 'TRADES_RECONCILED' : 'MARKET_MOVE_ONLY')
      });

      baselineValuationINR += bValINR;
      currentValuationINR += curValINR;
      baselineCostINR += bCostINR;
      currentCostINR += curCostINR;
    }

    // Add Bank Accounts and Fixed Deposits
    const bankFDs = await dbAll(db, "SELECT * FROM BankAccountsAndFDs").catch(() => []);
    const fxMap: Record<string, number> = { INR: 1.0, USD: usdRate, AED: 25.80, EUR: 110.1, GBP: 128.56 };
    let totalBankValINR = 0;
    bankFDs.forEach((b: any) => {
      const mult = fxMap[(b.currency || 'INR').toUpperCase()] || 1.0;
      totalBankValINR += (b.balance_amount || b.principal_amount || 0) * mult;
    });

    const netWorthBaselineINR = baselineValuationINR + totalBankValINR;
    const netWorthCurrentINR = currentValuationINR + totalBankValINR;

    res.json({
      success: true,
      portfolio,
      usdRate,
      summary: {
        baselineValuationINR,
        currentValuationINR,
        totalBankFDsINR: totalBankValINR,
        netWorthBaselineINR,
        netWorthCurrentINR,
        netWorthDeltaINR: netWorthCurrentINR - netWorthBaselineINR,
        netWorthDeltaPct: netWorthBaselineINR > 0 ? ((netWorthCurrentINR - netWorthBaselineINR) / netWorthBaselineINR) * 100 : 0
      },
      portfolioDeltas
    });
  } catch (err: any) {
    console.error('Reconciliation Audit Waterfall Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Universal Data Quality Audit Endpoints ────────────────────────────────────

router.get('/data-quality-summary', async (req, res) => {
  try {
    const db = getDB();
    const rows = await dbAll<any>(db, `
      SELECT 
        COUNT(*) as total_audited,
        SUM(CASE WHEN integrity_status = 'PASSED' THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN integrity_status = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN integrity_status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        AVG(field_accuracy_score) as avg_accuracy_score,
        AVG(sum_total_pct) as avg_shareholding_sum
      FROM DataQualityAuditLedger
    `);

    const quarters = await dbAll<any>(db, `
      SELECT as_of_quarter, COUNT(*) as count 
      FROM DataQualityAuditLedger 
      GROUP BY as_of_quarter 
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      summary: rows[0] || {},
      quarterDistribution: quarters
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/data-quality-ledger', async (req, res) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit as string) || 200;
    const status = req.query.status as string;

    let query = "SELECT * FROM DataQualityAuditLedger";
    const params: any[] = [];
    if (status) {
      query += " WHERE integrity_status = ?";
      params.push(status);
    }
    query += " ORDER BY audited_at DESC LIMIT ?";
    params.push(limit);

    const rows = await dbAll<any>(db, query, params);
    res.json({
      success: true,
      count: rows.length,
      records: rows.map(r => ({
        ...r,
        violation_reasons: r.violation_reasons ? JSON.parse(r.violation_reasons) : []
      }))
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Dual-Source Consensus & Cross-Validation Routes ──────────────────────────
router.get('/sync-drift-status', async (req, res) => {
  try {
    const { DualSourceReconciliationEngine } = await import('../services/DualSourceReconciliationEngine.js');
    const summary = await DualSourceReconciliationEngine.getInstance().getSyncDriftSummary();
    res.json({
      success: true,
      ...summary
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reconcile-stock/:symbol', async (req, res) => {
  try {
    const { DualSourceReconciliationEngine } = await import('../services/DualSourceReconciliationEngine.js');
    const result = await DualSourceReconciliationEngine.getInstance().reconcileStock(req.params.symbol);
    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/run-dual-source-reconciliation', async (req, res) => {
  try {
    const { DualSourceReconciliationEngine } = await import('../services/DualSourceReconciliationEngine.js');
    const symbols = req.body?.symbols || ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'STLTECH', 'KELLTONTEC'];
    const engine = DualSourceReconciliationEngine.getInstance();
    const results = [];
    for (const sym of symbols) {
      const r = await engine.reconcileStock(sym);
      results.push(r);
    }
    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Universe Full Official Reingestion & Reconciliation Pipeline ──────────────
router.post('/trigger-universe-reingestion', async (req, res) => {
  try {
    const { UniverseOfficialReingestionService } = await import('../services/UniverseOfficialReingestionService.js');
    const service = UniverseOfficialReingestionService.getInstance();
    const customSymbols = req.body?.symbols;
    
    // Launch background reingestion asynchronously
    service.runFullUniverseReingestion(customSymbols).catch(err => {
      console.error('[UniverseReingest Route] Error during background execution:', err);
    });

    res.json({
      success: true,
      message: 'Full universe official reingestion & dual-source reconciliation job triggered successfully.',
      initialProgress: service.getProgress()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reingestion-progress', async (req, res) => {
  try {
    const { UniverseOfficialReingestionService } = await import('../services/UniverseOfficialReingestionService.js');
    const service = UniverseOfficialReingestionService.getInstance();
    const progress = service.getProgress();
    res.json({
      success: true,
      data: progress
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Historical Data Endpoints ────────────────────────────────────────────────
router.get('/historical-financials/:symbol', async (req, res) => {
  try {
    const db = getDB();
    const cleanSym = req.params.symbol.toUpperCase().replace('.NS', '').replace('.BO', '');
    const statements = await dbAll(db, `
      SELECT * FROM HistoricalFinancialStatements
      WHERE symbol = ?
      ORDER BY 
        CASE statement_type 
          WHEN 'ANNUAL_PL' THEN 1 
          WHEN 'QUARTERLY_PL' THEN 2 
          WHEN 'BALANCE_SHEET' THEN 3 
          WHEN 'CASH_FLOW' THEN 4 
          ELSE 5 
        END, period_label DESC
    `, [cleanSym]);

    res.json({
      success: true,
      symbol: cleanSym,
      count: statements.length,
      statements
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/historical-shareholding/:symbol', async (req, res) => {
  try {
    const db = getDB();
    const cleanSym = req.params.symbol.toUpperCase().replace('.NS', '').replace('.BO', '');
    const patterns = await dbAll(db, `
      SELECT * FROM HistoricalShareholdingPattern
      WHERE symbol = ?
      ORDER BY quarter_label DESC
    `, [cleanSym]);

    res.json({
      success: true,
      symbol: cleanSym,
      count: patterns.length,
      patterns
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stock-audit-card/:symbol', async (req, res) => {
  try {
    const db = getDB();
    const cleanSym = req.params.symbol.toUpperCase().replace('.NS', '').replace('.BO', '');

    const auditRow = await dbGet(db, "SELECT * FROM DataQualityAuditLedger WHERE symbol = ?", [cleanSym]);
    const driftRows = await dbAll(db, "SELECT * FROM DataSyncDriftLedger WHERE symbol = ? ORDER BY sync_status DESC, metric_name ASC", [cleanSym]);
    const histFin = await dbAll(db, "SELECT * FROM HistoricalFinancialStatements WHERE symbol = ? ORDER BY period_label DESC", [cleanSym]);
    const histShp = await dbAll(db, "SELECT * FROM HistoricalShareholdingPattern WHERE symbol = ? ORDER BY quarter_label DESC", [cleanSym]);

    res.json({
      success: true,
      symbol: cleanSym,
      auditSummary: auditRow || null,
      driftReconciliation: driftRows,
      historicalFinancials: histFin,
      historicalShareholding: histShp
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

