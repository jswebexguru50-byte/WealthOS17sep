import { DatabaseManager } from './DatabaseManager.js';
import { calculateXIRR, CashFlow } from '../xirr.js';

export interface ReportFilterOptions {
  reportType: 'CAPITAL_GAINS' | 'HOLDING_STATEMENT' | 'TRADE_BOOK' | 'PERFORMANCE_SUMMARY' | 'DIVIDEND_STATEMENT' | 'ASSET_XIRR' | 'ADVANCED_REVIEW';
  portfolio?: string;
  financialYear?: string; // e.g. '2024-2025' or 'ALL_TIME'
  startDate?: string;
  endDate?: string;
  assetClass?: string;
  includeGrandfathering?: boolean;
}

export class ReportsService {
  private static instance: ReportsService;

  private constructor() {}

  public static getInstance(): ReportsService {
    if (!ReportsService.instance) {
      ReportsService.instance = new ReportsService();
    }
    return ReportsService.instance;
  }

  /**
   * Helper to build SQL date filter clause
   */
  private buildDateFilter(options: ReportFilterOptions, dateColumn = 't.date'): { clause: string; params: any[] } {
    let clause = '';
    const params: any[] = [];

    if (options.financialYear && options.financialYear !== 'ALL_TIME') {
      const parts = options.financialYear.split('-');
      if (parts.length === 2) {
        clause += ` AND date(${dateColumn}) >= date(?) AND date(${dateColumn}) <= date(?)`;
        params.push(`${parts[0]}-04-01`, `${parts[1]}-03-31`);
      }
    } else if (options.startDate && options.endDate) {
      clause += ` AND date(${dateColumn}) >= date(?) AND date(${dateColumn}) <= date(?)`;
      params.push(options.startDate, options.endDate);
    }
    return { clause, params };
  }

  /**
   * 1. Generate Capital Gains Report with STCG / LTCG, Section 112A Grandfathering & Tax Liability
   */
  public async generateCapitalGainsReport(options: ReportFilterOptions): Promise<any> {
    const db = DatabaseManager.getInstance();
    
    // Fetch all SELL transactions with resolved ISIN and Master data
    let sellQuery = `
      SELECT t.*, COALESCE(NULLIF(t.isin, ''), NULLIF(m.isin, ''), '-') as resolved_isin, m.name as company_name, m.sector, m.fmv_31_jan_2018
      FROM Transactions t
      LEFT JOIN MasterTickers m ON (t.isin IS NOT NULL AND t.isin != '' AND t.isin = m.isin) OR (t.symbol IS NOT NULL AND t.symbol != '' AND t.symbol = m.symbol)
      WHERE UPPER(t.type) IN ('SELL', 'SALE')
    `;
    const sellParams: any[] = [];

    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      sellQuery += ` AND t.portfolio = ?`;
      sellParams.push(options.portfolio);
    }

    const { clause: dateClause, params: dateParams } = this.buildDateFilter(options, 't.date');
    sellQuery += dateClause;
    sellParams.push(...dateParams);
    sellQuery += ` ORDER BY t.date ASC`;

    const sellTxns = await db.query<any>(sellQuery, sellParams);

    // Fetch all BUY transactions for FIFO cost and holding period matching
    let buyQuery = `
      SELECT t.*, COALESCE(NULLIF(t.isin, ''), NULLIF(m.isin, ''), '-') as resolved_isin, m.fmv_31_jan_2018
      FROM Transactions t
      LEFT JOIN MasterTickers m ON (t.isin IS NOT NULL AND t.isin != '' AND t.isin = m.isin) OR (t.symbol IS NOT NULL AND t.symbol != '' AND t.symbol = m.symbol)
      WHERE UPPER(t.type) IN ('BUY', 'PURCHASE', 'TRANSFER_IN', 'INFLOW')
    `;
    const buyParams: any[] = [];
    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      buyQuery += ` AND t.portfolio = ?`;
      buyParams.push(options.portfolio);
    }
    buyQuery += ` ORDER BY t.date ASC`;
    const buyTxns = await db.query<any>(buyQuery, buyParams);

    // Build FIFO buy queues per portfolio + symbol
    const buyQueues = new Map<string, Array<{ date: string; qty: number; price: number; fmv2018: number }>>();
    for (const b of buyTxns) {
      const pKey = `${b.portfolio || 'default'}__${(b.symbol || b.isin || '').toUpperCase()}`;
      if (!buyQueues.has(pKey)) buyQueues.set(pKey, []);
      buyQueues.get(pKey)!.push({
        date: b.date,
        qty: Math.abs(b.quantity || 0),
        price: b.price || (b.net_amount && b.quantity ? Math.abs(b.net_amount / b.quantity) : 0),
        fmv2018: b.fmv_31_jan_2018 || 0
      });
    }

    let totalStcg = 0;
    let totalLtcg = 0;
    let totalRealized = 0;
    let totalSaleValue = 0;
    let totalCostValue = 0;
    let totalGrandfatheredBenefit = 0;

    const rows = sellTxns.map((tx, idx) => {
      const sellQty = Math.abs(tx.quantity || 0);
      const sellPrice = tx.price || (tx.net_amount && sellQty > 0 ? Math.abs(tx.net_amount / sellQty) : 0);
      const sellAmt = Math.abs(tx.net_amount || (sellQty * sellPrice));
      const sym = (tx.symbol || tx.isin || '').toUpperCase();
      const pKey = `${tx.portfolio || 'default'}__${sym}`;
      const sellDate = new Date(tx.date);

      // FIFO matching
      let matchedCost = 0;
      let matchedQty = 0;
      let earliestBuyDate: string | null = null;
      let isEligibleForGrandfathering = false;
      let fmvJan2018 = tx.fmv_31_jan_2018 || 0;

      const queue = buyQueues.get(pKey);
      if (queue && queue.length > 0) {
        let remainingToMatch = sellQty;
        while (queue.length > 0 && remainingToMatch > 0) {
          const buySlot = queue[0];
          if (!earliestBuyDate) earliestBuyDate = buySlot.date;
          if (new Date(buySlot.date) <= new Date('2018-01-31')) {
            isEligibleForGrandfathering = true;
          }
          if (buySlot.fmv2018 > 0) fmvJan2018 = buySlot.fmv2018;

          const matchThisSlot = Math.min(buySlot.qty, remainingToMatch);
          matchedCost += matchThisSlot * buySlot.price;
          matchedQty += matchThisSlot;
          remainingToMatch -= matchThisSlot;
          buySlot.qty -= matchThisSlot;

          if (buySlot.qty <= 0.0001) {
            queue.shift();
          }
        }
      }

      // Fallback cost if FIFO queue was exhausted
      if (matchedQty < sellQty) {
        const remaining = sellQty - matchedQty;
        const estimatedUnitCost = tx.gross_amount && tx.gross_amount > 0 ? tx.gross_amount / sellQty : sellPrice * 0.75;
        matchedCost += remaining * estimatedUnitCost;
      }

      // Compute holding period in days
      let holdingDays = 400; // default to LTCG if untracked
      if (earliestBuyDate) {
        const bDate = new Date(earliestBuyDate);
        holdingDays = Math.max(1, Math.round((sellDate.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24)));
      }

      const isLtcg = holdingDays > 365;
      let deemedCost = matchedCost;
      let grandfatheredValue = 0;

      // Section 112A Grandfathering (as of 31-Jan-2018)
      if (options.includeGrandfathering && isEligibleForGrandfathering && isLtcg && fmvJan2018 > 0) {
        const unitActualCost = matchedCost / (sellQty || 1);
        const deemedUnitCost = Math.max(unitActualCost, Math.min(fmvJan2018, sellPrice));
        grandfatheredValue = deemedUnitCost * sellQty;
        if (grandfatheredValue > matchedCost) {
          totalGrandfatheredBenefit += (grandfatheredValue - matchedCost);
          deemedCost = grandfatheredValue;
        }
      }

      const rawGain = sellAmt - matchedCost;
      const taxableGain = sellAmt - deemedCost;

      totalSaleValue += sellAmt;
      totalCostValue += deemedCost;
      totalRealized += taxableGain;

      if (isLtcg) totalLtcg += taxableGain;
      else totalStcg += taxableGain;

      return {
        sNo: idx + 1,
        portfolio: tx.portfolio,
        symbol: tx.symbol || tx.isin,
        company_name: tx.company_name || tx.symbol,
        isin: tx.resolved_isin && tx.resolved_isin !== '-' ? tx.resolved_isin : (tx.isin || '-'),
        date: tx.date,
        buy_date: earliestBuyDate || 'Prior to FY',
        holding_days: holdingDays,
        quantity: sellQty,
        sale_price: sellPrice,
        sale_value: sellAmt,
        buy_cost: matchedCost,
        deemed_cost: deemedCost,
        gain_loss: taxableGain,
        raw_gain: rawGain,
        gain_type: isLtcg ? 'LTCG (12.5%)' : 'STCG (20%)',
        is_grandfathered: deemedCost > matchedCost,
        grandfathered_fmv: fmvJan2018 > 0 ? fmvJan2018 * sellQty : 0
      };
    });

    // Indian Income Tax Rates:
    // LTCG: 12.5% above ₹1,25,000 exemption
    // STCG: 20% on listed equities
    const ltcgExemption = Math.min(Math.max(0, totalLtcg), 125000);
    const taxableLtcg = Math.max(0, totalLtcg - ltcgExemption);
    const estimatedLtcgTax = taxableLtcg * 0.125;
    const estimatedStcgTax = Math.max(0, totalStcg) * 0.20;
    const totalTaxLiability = estimatedLtcgTax + estimatedStcgTax;

    return {
      success: true,
      reportType: 'CAPITAL_GAINS',
      summary: {
        totalSaleValue,
        totalCostValue,
        totalRealizedGain: totalRealized,
        totalStcg,
        totalLtcg,
        taxExemptionLtcg: ltcgExemption,
        taxableLtcg,
        estimatedLtcgTax,
        estimatedStcgTax,
        totalTaxLiability,
        grandfatheredBenefit: totalGrandfatheredBenefit,
        tradeCount: rows.length
      },
      rows
    };
  }

  /**
   * 2. Generate Detailed Holdings Statement & Scrip Inventory (Unrealized Gains)
   */
  public async generateHoldingsStatement(options: ReportFilterOptions): Promise<any> {
    const db = DatabaseManager.getInstance();
    let query = `
      SELECT h.*, COALESCE(NULLIF(h.isin, ''), NULLIF(m.isin, ''), '-') as resolved_isin, m.name as master_name, m.sector, m.segment
      FROM Holdings h
      LEFT JOIN MasterTickers m ON (h.isin IS NOT NULL AND h.isin != '' AND h.isin = m.isin) OR (h.symbol IS NOT NULL AND h.symbol != '' AND h.symbol = m.symbol)
      WHERE h.quantity > 0
    `;
    const params: any[] = [];

    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      query += ` AND h.portfolio = ?`;
      params.push(options.portfolio);
    }

    query += ` ORDER BY h.portfolio ASC, h.current_value DESC`;

    const holdings = await db.query<any>(query, params);
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalPnl = 0;

    holdings.forEach(h => {
      totalInvested += (h.total_cost || 0);
      totalCurrent += (h.current_value || 0);
      totalPnl += (h.unrealized_pnl || 0);
    });

    const rows = holdings.map((h, idx) => {
      const val = h.current_value || 0;
      const cost = h.total_cost || 0;
      const pnl = h.unrealized_pnl || (val - cost);
      const pct = cost > 0 ? (pnl / cost) * 100 : 0;
      
      const portLower = (h.portfolio || '').toLowerCase();
      const symUp = (h.symbol || '').toUpperCase();
      const isinUp = (h.resolved_isin || h.isin || '').toUpperCase();
      let assetClass = 'Equity';
      let isPostTaxNav = false;

      if (h.holding_type === 'AIF' || symUp.includes('SMART HORIZON') || symUp.includes('UL-SMART') || symUp.includes('AIF') || isinUp.includes('HORIZON')) {
        assetClass = 'AIF (Alternative Investment Fund)';
        isPostTaxNav = true;
      } else if (portLower.includes('mutual') || portLower.includes('mf') || (h.symbol && h.symbol.toLowerCase().includes('fund'))) {
        assetClass = 'Mutual Funds';
      } else if (portLower.includes('unlisted')) {
        assetClass = 'Unlisted Equity';
      } else if (portLower.includes('us') || portLower.includes('ibkr')) {
        assetClass = 'Global Equity';
      }

      return {
        sNo: idx + 1,
        portfolio: h.portfolio,
        symbol: h.symbol,
        company_name: h.master_name || h.symbol,
        isin: h.resolved_isin && h.resolved_isin !== '-' ? h.resolved_isin : (h.isin || '-'),
        asset_class: assetClass,
        is_post_tax_nav: isPostTaxNav,
        sector: h.sector || (isPostTaxNav ? 'AIF (Fund NAV post-tax)' : 'Diversified'),
        quantity: h.quantity,
        avg_cost: h.avg_buy_price || (h.quantity > 0 ? cost / h.quantity : 0),
        total_cost: cost,
        ltp: h.ltp || (h.quantity > 0 ? val / h.quantity : 0),
        current_value: val,
        unrealized_pnl: pnl,
        unrealized_pct: pct,
        weight_pct: totalCurrent > 0 ? (val / totalCurrent) * 100 : 0
      };
    });

    return {
      success: true,
      reportType: 'HOLDING_STATEMENT',
      summary: {
        totalInvested,
        totalCurrent,
        totalPnl,
        overallPct: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
        holdingCount: rows.length
      },
      rows
    };
  }

  /**
   * 3. Generate Full Trade Book / Transaction Ledger
   */
  public async generateTradeBook(options: ReportFilterOptions): Promise<any> {
    const db = DatabaseManager.getInstance();
    let query = `
      SELECT t.*, COALESCE(NULLIF(t.isin, ''), NULLIF(m.isin, ''), '-') as resolved_isin, m.name as master_name
      FROM Transactions t
      LEFT JOIN MasterTickers m ON (t.isin IS NOT NULL AND t.isin != '' AND t.isin = m.isin) OR (t.symbol IS NOT NULL AND t.symbol != '' AND t.symbol = m.symbol)
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      query += ` AND t.portfolio = ?`;
      params.push(options.portfolio);
    }

    const { clause: dateClause, params: dateParams } = this.buildDateFilter(options, 't.date');
    query += dateClause;
    params.push(...dateParams);

    query += ` ORDER BY t.date DESC`;

    const txns = await db.query<any>(query, params);
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let totalCharges = 0;

    const mappedRows = txns.map((t, idx) => {
      const type = (t.type || '').toUpperCase();
      const amt = Math.abs(t.net_amount || (t.quantity * t.price) || 0);
      const charges = (t.brokerage || 0) + (t.stt || 0) + (t.other_charges || 0);
      totalCharges += charges;

      if (type.includes('BUY') || type.includes('PURCHASE')) totalBuyVolume += amt;
      else if (type.includes('SELL') || type.includes('SALE')) totalSellVolume += amt;

      return {
        sNo: idx + 1,
        portfolio: t.portfolio,
        date: t.date,
        type: t.type,
        symbol: t.symbol || t.isin,
        company_name: t.master_name || t.symbol,
        isin: t.resolved_isin && t.resolved_isin !== '-' ? t.resolved_isin : (t.isin || '-'),
        quantity: Math.abs(t.quantity || 0),
        price: t.price || (t.quantity ? amt / Math.abs(t.quantity) : 0),
        net_amount: amt,
        brokerage: t.brokerage || 0,
        stt: t.stt || 0,
        other_charges: t.other_charges || 0,
        total_charges: charges,
        notes: t.notes || ''
      };
    });

    return {
      success: true,
      reportType: 'TRADE_BOOK',
      summary: {
        totalTrades: mappedRows.length,
        totalBuyVolume,
        totalSellVolume,
        totalCharges
      },
      rows: mappedRows
    };
  }

  /**
   * 4. Generate Annual Dividend & Income Ledger with Section 194K TDS
   */
  public async generateDividendReport(options: ReportFilterOptions): Promise<any> {
    const db = DatabaseManager.getInstance();
    let query = `
      SELECT t.*, COALESCE(NULLIF(t.isin, ''), NULLIF(m.isin, ''), '-') as resolved_isin, m.name as master_name
      FROM Transactions t
      LEFT JOIN MasterTickers m ON (t.isin IS NOT NULL AND t.isin != '' AND t.isin = m.isin) OR (t.symbol IS NOT NULL AND t.symbol != '' AND t.symbol = m.symbol)
      WHERE (t.type = 'DIVIDEND' OR t.type = 'INTEREST' OR UPPER(t.notes) LIKE '%DIVIDEND%' OR UPPER(t.notes) LIKE '%INTEREST%')
    `;
    const params: any[] = [];

    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      query += ` AND t.portfolio = ?`;
      params.push(options.portfolio);
    }

    const { clause: dateClause, params: dateParams } = this.buildDateFilter(options, 't.date');
    query += dateClause;
    params.push(...dateParams);

    query += ` ORDER BY t.date DESC`;
    const rows = await db.query<any>(query, params);

    let totalGrossIncome = 0;
    let totalEstimatedTds = 0;

    const mappedRows = rows.map((r, idx) => {
      const gross = Math.abs(r.net_amount || r.amount || 0);
      // Section 194K TDS: 10% on dividends exceeding ₹5,000 in a FY
      const tds = gross > 5000 ? gross * 0.10 : 0;
      totalGrossIncome += gross;
      totalEstimatedTds += tds;

      return {
        sNo: idx + 1,
        portfolio: r.portfolio,
        date: r.date,
        symbol: r.symbol || 'INCOME',
        company_name: r.master_name || r.symbol || r.notes || 'Dividend Payout',
        isin: r.resolved_isin && r.resolved_isin !== '-' ? r.resolved_isin : (r.isin || '-'),
        gross_amount: gross,
        estimated_tds: tds,
        net_credited: gross - tds,
        type: r.type || 'DIVIDEND',
        notes: r.notes || ''
      };
    });

    return {
      success: true,
      reportType: 'DIVIDEND_STATEMENT',
      summary: {
        totalGrossIncome,
        totalEstimatedTds,
        totalNetCredited: totalGrossIncome - totalEstimatedTds,
        recordCount: mappedRows.length
      },
      rows: mappedRows
    };
  }

  /**
   * 5. Generate Multi-Asset Allocation & Performance Attribution Summary with XIRR
   */
  public async generateAssetAllocationReport(options: ReportFilterOptions): Promise<any> {
    const holdingsResult = await this.generateHoldingsStatement(options);
    const rows = holdingsResult.rows || [];
    const totalValuation = holdingsResult.summary.totalCurrent || 1;

    const categoryMap: Record<string, { invested: number; current: number; count: number; pnl: number }> = {};

    rows.forEach((r: any) => {
      const cat = r.asset_class || 'Equity';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { invested: 0, current: 0, count: 0, pnl: 0 };
      }
      categoryMap[cat].invested += (r.total_cost || 0);
      categoryMap[cat].current += (r.current_value || 0);
      categoryMap[cat].pnl += (r.unrealized_pnl || 0);
      categoryMap[cat].count += 1;
    });

    const categories = Object.entries(categoryMap).map(([category, val], idx) => {
      const retPct = val.invested > 0 ? (val.pnl / val.invested) * 100 : 0;
      const allocPct = (val.current / totalValuation) * 100;
      return {
        sNo: idx + 1,
        category,
        holding_count: val.count,
        total_invested: val.invested,
        current_value: val.current,
        unrealized_pnl: val.pnl,
        return_pct: retPct,
        allocation_pct: allocPct
      };
    });

    return {
      success: true,
      reportType: 'PERFORMANCE_SUMMARY',
      summary: holdingsResult.summary,
      rows: categories
    };
  }

  /**
   * 6. Generate Asset-wise Dated Cash Flow XIRR Report
   */
  public async generateAssetWiseXirrReport(options: ReportFilterOptions): Promise<any> {
    const db = DatabaseManager.getInstance();
    const holdingsResult = await this.generateHoldingsStatement(options);
    const holdings = holdingsResult.rows || [];

    // Fetch transactions grouped by portfolio + symbol to compute dated XIRR
    let txQuery = `SELECT * FROM Transactions WHERE 1=1`;
    const txParams: any[] = [];
    if (options.portfolio && options.portfolio !== 'Combined' && options.portfolio !== 'all' && options.portfolio !== 'ALL') {
      txQuery += ` AND portfolio = ?`;
      txParams.push(options.portfolio);
    }
    txQuery += ` ORDER BY date ASC`;
    const allTx = await db.query<any>(txQuery, txParams);

    const txMap = new Map<string, any[]>();
    for (const t of allTx) {
      const sym = (t.symbol || t.isin || '').toUpperCase();
      const pKey = `${t.portfolio || 'default'}__${sym}`;
      if (!txMap.has(pKey)) txMap.set(pKey, []);
      txMap.get(pKey)!.push(t);
    }

    const rows = holdings.map((h: any, idx: number) => {
      const sym = (h.symbol || '').toUpperCase();
      const pKey = `${h.portfolio || 'default'}__${sym}`;
      const scripTx = txMap.get(pKey) || txMap.get(`default__${sym}`) || [];
      const flows: CashFlow[] = [];

      for (const t of scripTx) {
        const amt = Math.abs(t.net_amount || (t.quantity * t.price) || 0);
        const type = (t.type || '').toUpperCase();
        if (type.includes('BUY') || type.includes('PURCHASE') || type.includes('INFLOW')) {
          flows.push({ date: new Date(t.date), amount: -amt, type: 'tx' });
        } else if (type.includes('SELL') || type.includes('SALE') || type.includes('DIVIDEND')) {
          flows.push({ date: new Date(t.date), amount: amt, type: 'tx' });
        }
      }

      // Add terminal valuation as positive inflow today
      if (h.current_value > 0) {
        flows.push({ date: new Date(), amount: h.current_value, type: 'end' });
      }

      const xirr = flows.length >= 2 ? calculateXIRR(flows) : (h.unrealized_pct || 0);

      return {
        sNo: idx + 1,
        portfolio: h.portfolio,
        symbol: h.symbol,
        company_name: h.company_name,
        isin: h.isin || '-',
        asset_class: h.asset_class,
        total_invested: h.total_cost,
        current_value: h.current_value,
        unrealized_pnl: h.unrealized_pnl,
        absolute_return_pct: h.unrealized_pct,
        xirr_pct: xirr,
        cash_flow_count: flows.length
      };
    });

    return {
      success: true,
      reportType: 'HOLDING_STATEMENT',
      summary: holdingsResult.summary,
      rows
    };
  }
}

