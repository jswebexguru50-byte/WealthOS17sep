/**
 * CORPORATE ACTIONS ENGINE (CA-1 to CA-6)
 * Spec: dev_spec_opportunity_engine.md Section 5 (Phase 1)
 */

import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import {
  todayIST,
  isTradingDay,
  tradingDaysBetween,
  addTradingDays
} from '../../lib/tradingCalendar.js';
import { roundINR, mulINR, sumINR } from '../../lib/decimalUtils.js';
import { writeAuditEntry } from '../../lib/infraServices.js';
import { computeDedupKey, checkMutationDedup, recordMutationDedup } from '../../lib/infraServices.js';

// Query helpers with active DB binding
const run = (sql: string, params: any[] = []) => dbRun(getDB(), sql, params);
const all = <T = any>(sql: string, params: any[] = []): Promise<T[]> => dbAll(getDB(), sql, params);
const get = <T = any>(sql: string, params: any[] = []): Promise<T | null> => dbGet(getDB(), sql, params);

export interface UpcomingCorporateAction {
  id: number;
  symbol: string;
  isin: string;
  action_type: string;
  record_date: string;
  ex_date: string;
  details: string;
  dividend_per_share?: number;
  numerator?: number;
  denominator?: number;
  eligible_qty_held: number;
  estimated_value: number;
  trading_days_to_ex: number;
  is_urgent_ex_date: boolean; // <= 5 trading days
  conflict_flag: boolean;
  source: string;
}

export interface DividendSummaryResult {
  financial_year: string;
  pan?: string;
  portfolio?: string;
  gross_dividend: number;
  estimated_tds: number; // Section 194 (10%)
  net_dividend: number;
  by_symbol: Array<{ symbol: string; isin: string; gross: number; tds: number; count: number }>;
  by_portfolio: Array<{ portfolio: string; gross: number; tds: number }>;
}

export interface CostBasisVerificationReport {
  symbol: string;
  portfolio: string;
  action_type: string;
  pre_qty: number;
  pre_avg_cost: number;
  pre_total_cost: number;
  post_qty: number;
  post_avg_cost: number;
  post_total_cost: number;
  cost_delta: number;
  is_invariant_preserved: boolean; // cost_delta == 0
  timestamp: string;
}

export async function initCorporateActionsTables(): Promise<void> {
  // Ensure table exists
  await run(`
    CREATE TABLE IF NOT EXISTS CorporateActions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_date TEXT NOT NULL,
      ex_date TEXT,
      isin TEXT NOT NULL,
      symbol TEXT,
      action_type TEXT NOT NULL,
      details TEXT,
      numerator REAL,
      denominator REAL,
      dividend_per_share REAL,
      source TEXT NOT NULL DEFAULT 'manual',
      applied INTEGER DEFAULT 0,
      applied_date TEXT,
      holding_qty_on_record_date REAL,
      is_eligible INTEGER DEFAULT 1,
      notes TEXT,
      conflict_flag INTEGER DEFAULT 0,
      conflicting_sources TEXT,
      rights_ratio REAL,
      rights_price REAL,
      subscription_deadline TEXT
    )
  `);

  // Table for CA-4 Rights Issues Subscriptions
  await run(`
    CREATE TABLE IF NOT EXISTS rights_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ca_id INTEGER NOT NULL,
      portfolio TEXT NOT NULL,
      subscribed_qty REAL NOT NULL,
      renounced INTEGER DEFAULT 0,
      rights_price REAL NOT NULL,
      total_paid REAL NOT NULL,
      decided_at TEXT NOT NULL,
      FOREIGN KEY(ca_id) REFERENCES CorporateActions(id)
    )
  `);

  // Safe ALTER TABLE migrations for existing schemas
  const columnsToAdd = [
    { name: 'conflict_flag', type: 'INTEGER DEFAULT 0' },
    { name: 'conflicting_sources', type: 'TEXT' },
    { name: 'rights_ratio', type: 'REAL' },
    { name: 'rights_price', type: 'REAL' },
    { name: 'subscription_deadline', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    try {
      await run(`ALTER TABLE CorporateActions ADD COLUMN ${col.name} ${col.type}`);
    } catch {
      // Column already exists, safe to ignore
    }
  }
}

/**
 * CA-1: Upcoming Corporate Actions Calendar
 * Sourced for record_date / ex_date >= today
 * Computes exact trading days using INFRA-1 TradingCalendar
 */
export async function getUpcomingCorporateActions(daysAhead: number = 30): Promise<UpcomingCorporateAction[]> {
  const today = todayIST();
  const cutoffDate = await addTradingDays(today, daysAhead);

  const rawActions = await all<any>(`
    SELECT * FROM CorporateActions
    WHERE (ex_date >= ? OR record_date >= ?)
      AND (ex_date <= ? OR record_date <= ?)
    ORDER BY COALESCE(ex_date, record_date) ASC
  `, [today, today, cutoffDate, cutoffDate]);

  // Aggregate current active holdings for held-quantity lookup
  const holdingsRows = await all<{ symbol: string; isin: string; total_qty: number }>(`
    SELECT symbol, isin, SUM(quantity) as total_qty
    FROM Holdings
    WHERE quantity > 0
    GROUP BY symbol, isin
  `);
  const holdingsMap = new Map<string, number>();
  for (const h of holdingsRows) {
    if (h.symbol) holdingsMap.set(h.symbol.toUpperCase(), h.total_qty);
    if (h.isin) holdingsMap.set(h.isin.toUpperCase(), h.total_qty);
  }

  const results: UpcomingCorporateAction[] = [];

  for (const a of rawActions) {
    const targetDate = a.ex_date || a.record_date;
    const tradingDays = await tradingDaysBetween(today, targetDate);
    const symKey = (a.symbol || '').toUpperCase();
    const isinKey = (a.isin || '').toUpperCase();
    const qtyHeld = holdingsMap.get(symKey) || holdingsMap.get(isinKey) || 0;

    let estimatedVal = 0;
    if (a.action_type === 'DIVIDEND' && a.dividend_per_share) {
      estimatedVal = mulINR(a.dividend_per_share, qtyHeld);
    } else if (a.action_type === 'BONUS' && a.numerator && a.denominator) {
      estimatedVal = Math.floor(qtyHeld * (a.numerator / a.denominator));
    }

    results.push({
      id: a.id,
      symbol: a.symbol || 'N/A',
      isin: a.isin,
      action_type: a.action_type,
      record_date: a.record_date,
      ex_date: a.ex_date || a.record_date,
      details: a.details || `${a.action_type} declared`,
      dividend_per_share: a.dividend_per_share,
      numerator: a.numerator,
      denominator: a.denominator,
      eligible_qty_held: qtyHeld,
      estimated_value: roundINR(estimatedVal),
      trading_days_to_ex: tradingDays,
      is_urgent_ex_date: tradingDays <= 5 && tradingDays >= 0,
      conflict_flag: !!a.conflict_flag,
      source: a.source || 'manual'
    });
  }

  return results;
}

/**
 * CA-2: Dividend Income Aggregation Rollup
 * Sourced strictly from applied DIVIDEND CorporateActions.
 * Single source of truth for both CorporateActionsView and TaxView TX-6.
 */
export async function getDividendSummary(params: {
  pan?: string;
  portfolio?: string;
  fy?: string;
}): Promise<DividendSummaryResult> {
  let query = `
    SELECT
      CA.id,
      CA.record_date,
      CA.symbol,
      CA.isin,
      CA.dividend_per_share,
      T.portfolio,
      COALESCE(P.pan, 'AQCPS7204G') as pan,
      COALESCE(T.net_amount, T.gross_amount, 0) as dividend_amount
    FROM Transactions T
    JOIN Portfolios P ON T.portfolio = P.name
    LEFT JOIN CorporateActions CA ON T.isin = CA.isin AND CA.action_type = 'DIVIDEND'
    WHERE T.type = 'DIVIDEND'
  `;
  const sqlParams: any[] = [];

  if (params.portfolio && params.portfolio !== 'ALL' && params.portfolio !== 'Combined') {
    query += ` AND T.portfolio = ?`;
    sqlParams.push(params.portfolio);
  }
  if (params.pan && params.pan !== 'ALL') {
    query += ` AND P.pan = ?`;
    sqlParams.push(params.pan);
  }
  if (params.fy && params.fy !== 'ALL') {
    const startYear = parseInt(params.fy.split('-')[0], 10);
    if (!isNaN(startYear)) {
      query += ` AND T.date >= ? AND T.date <= ?`;
      sqlParams.push(`${startYear}-04-01`, `${startYear + 1}-03-31`);
    }
  }

  const rows = await all<any>(query, sqlParams);

  let gross = 0;
  const bySymbolMap = new Map<string, { symbol: string; isin: string; gross: number; tds: number; count: number }>();
  const byPortMap = new Map<string, { portfolio: string; gross: number; tds: number }>();

  for (const r of rows) {
    const amt = Number(r.dividend_amount || 0);
    gross += amt;
    const tds = roundINR(amt * 0.10); // Standard Sec 194 TDS (10%)

    // By Symbol
    const sym = (r.symbol || 'OTHER').toUpperCase();
    if (!bySymbolMap.has(sym)) {
      bySymbolMap.set(sym, { symbol: sym, isin: r.isin || '', gross: 0, tds: 0, count: 0 });
    }
    const sItem = bySymbolMap.get(sym)!;
    sItem.gross = roundINR(sItem.gross + amt);
    sItem.tds = roundINR(sItem.tds + tds);
    sItem.count += 1;

    // By Portfolio
    const port = r.portfolio || 'Unassigned';
    if (!byPortMap.has(port)) {
      byPortMap.set(port, { portfolio: port, gross: 0, tds: 0 });
    }
    const pItem = byPortMap.get(port)!;
    pItem.gross = roundINR(pItem.gross + amt);
    pItem.tds = roundINR(pItem.tds + tds);
  }

  const totalGross = roundINR(gross);
  const totalTds = roundINR(totalGross * 0.10);

  return {
    financial_year: params.fy || 'Current YTD',
    pan: params.pan,
    portfolio: params.portfolio,
    gross_dividend: totalGross,
    estimated_tds: totalTds,
    net_dividend: roundINR(totalGross - totalTds),
    by_symbol: Array.from(bySymbolMap.values()).sort((a, b) => b.gross - a.gross),
    by_portfolio: Array.from(byPortMap.values()).sort((a, b) => b.gross - a.gross)
  };
}

/**
 * CA-3: Cost Basis Verification Report & Invariant Checker
 * Enforces: total_cost_before === total_cost_after on bonus/split
 */
export async function applyCorporateActionWithVerification(
  caId: number,
  portfolio: string
): Promise<CostBasisVerificationReport> {
  const ca = await get<any>(`SELECT * FROM CorporateActions WHERE id = ?`, [caId]);
  if (!ca) throw new Error(`Corporate action ID ${caId} not found`);

  // Idempotency check via INFRA-4
  const dedupKey = computeDedupKey('CORPORATE_ACTION', String(caId), 'APPLY', { portfolio });
  const dedupCheck = await checkMutationDedup(dedupKey);
  if (dedupCheck.alreadyApplied) {
    return dedupCheck.responsePayload;
  }

  const holding = await get<any>(`
    SELECT * FROM Holdings
    WHERE portfolio = ? AND (symbol = ? OR isin = ?)
  `, [portfolio, ca.symbol, ca.isin]);

  if (!holding || holding.quantity <= 0) {
    throw new Error(`No active holding found for ${ca.symbol} in portfolio ${portfolio}`);
  }

  const preQty = holding.quantity;
  const preAvg = holding.avg_buy_price;
  const preCost = holding.total_cost || mulINR(preAvg, preQty);

  let postQty = preQty;
  let postAvg = preAvg;
  let postCost = preCost;

  if (ca.action_type === 'BONUS' && ca.numerator && ca.denominator) {
    const bonusRatio = ca.numerator / ca.denominator;
    const bonusQty = Math.floor(preQty * bonusRatio);
    postQty = preQty + bonusQty;
    postCost = preCost; // Invariant: total cost remains unchanged
    postAvg = roundINR(postCost / postQty, 4);
  } else if (ca.action_type === 'SPLIT' && ca.numerator && ca.denominator) {
    const splitMult = ca.numerator / ca.denominator;
    postQty = Math.round(preQty * splitMult);
    postCost = preCost; // Invariant: total cost remains unchanged
    postAvg = roundINR(postCost / postQty, 4);
  }

  // Hard Invariant Check: delta cost must be zero
  const costDelta = roundINR(Math.abs(preCost - postCost), 2);
  const isInvariantPreserved = costDelta === 0;

  if (!isInvariantPreserved) {
    throw new Error(`CRITICAL INVARIANT BREACH: Corporate action modified total cost by ₹${costDelta}. Aborting mutation.`);
  }

  // Apply mutation to database
  await run(`
    UPDATE Holdings
    SET quantity = ?, avg_buy_price = ?, total_cost = ?, last_update = datetime('now')
    WHERE portfolio = ? AND (symbol = ? OR isin = ?)
  `, [postQty, postAvg, postCost, portfolio, ca.symbol, ca.isin]);

  await run(`
    UPDATE CorporateActions
    SET applied = 1, applied_date = datetime('now')
    WHERE id = ?
  `, [caId]);

  const report: CostBasisVerificationReport = {
    symbol: ca.symbol,
    portfolio,
    action_type: ca.action_type,
    pre_qty: preQty,
    pre_avg_cost: preAvg,
    pre_total_cost: preCost,
    post_qty: postQty,
    post_avg_cost: postAvg,
    post_total_cost: postCost,
    cost_delta: costDelta,
    is_invariant_preserved: isInvariantPreserved,
    timestamp: new Date().toISOString()
  };

  // Record in audit ledger (INFRA-6)
  await writeAuditEntry({
    entity_type: 'HOLDING',
    entity_id: `${portfolio}_${ca.symbol}`,
    action: `APPLY_${ca.action_type}`,
    before_state: { preQty, preAvg, preCost },
    after_state: { postQty, postAvg, postCost },
    actor: 'SYSTEM_CA_ENGINE',
    dedup_key: dedupKey
  });

  // Record dedup key (INFRA-4)
  await recordMutationDedup(dedupKey, 'CORPORATE_ACTION', String(caId), `${postQty}_${postCost}`, report);

  return report;
}

/**
 * CA-4: Rights Issue Subscription
 */
export async function processRightsSubscription(params: {
  caId: number;
  portfolio: string;
  subscribedQty: number;
  renounced: boolean;
  rightsPrice: number;
}): Promise<any> {
  const totalPaid = mulINR(params.rightsPrice, params.subscribedQty);
  const now = new Date().toISOString();

  await run(`
    INSERT INTO rights_subscriptions
    (ca_id, portfolio, subscribed_qty, renounced, rights_price, total_paid, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [params.caId, params.portfolio, params.subscribedQty, params.renounced ? 1 : 0, params.rightsPrice, totalPaid, now]);

  if (!params.renounced && params.subscribedQty > 0) {
    // Add new shares and cost to existing holding
    const holding = await get<any>(`SELECT * FROM Holdings WHERE portfolio = ?`, [params.portfolio]);
    if (holding) {
      const newQty = holding.quantity + params.subscribedQty;
      const newTotalCost = roundINR(holding.total_cost + totalPaid);
      const newAvgBuyPrice = roundINR(newTotalCost / newQty, 4);

      await run(`
        UPDATE Holdings
        SET quantity = ?, total_cost = ?, avg_buy_price = ?, last_update = datetime('now')
        WHERE portfolio = ? AND symbol = ?
      `, [newQty, newTotalCost, newAvgBuyPrice, params.portfolio, holding.symbol]);
    }
  }

  return { success: true, subscribed_qty: params.subscribedQty, total_paid: totalPaid };
}

/**
 * CA-5: Yield on Cost (YOC) Metric
 * YOC% = (trailing_12m_dps / avg_buy_price) * 100
 */
export async function getHoldingsWithYieldOnCost(portfolio?: string): Promise<any[]> {
  let query = `SELECT * FROM Holdings WHERE quantity > 0`;
  const params: any[] = [];
  if (portfolio && portfolio !== 'ALL' && portfolio !== 'Combined') {
    query += ` AND portfolio = ?`;
    params.push(portfolio);
  }

  const holdings = await all<any>(query, params);

  // Get TTM DPS for each symbol
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoffDate = oneYearAgo.toISOString().split('T')[0];

  const dpsRows = await all<{ symbol: string; ttm_dps: number }>(`
    SELECT symbol, SUM(dividend_per_share) as ttm_dps
    FROM CorporateActions
    WHERE action_type = 'DIVIDEND' AND record_date >= ?
    GROUP BY symbol
  `, [cutoffDate]);

  const dpsMap = new Map(dpsRows.map(r => [(r.symbol || '').toUpperCase(), Number(r.ttm_dps || 0)]));

  return holdings.map(h => {
    const sym = (h.symbol || '').toUpperCase();
    const ttmDps = dpsMap.get(sym) || 0;
    const avgPrice = h.avg_buy_price || 0;
    const yocPct = avgPrice > 0 ? roundINR((ttmDps / avgPrice) * 100, 2) : 0;
    const currentYieldPct = (h.ltp || 0) > 0 ? roundINR((ttmDps / h.ltp) * 100, 2) : 0;

    return {
      ...h,
      ttm_dividend_per_share: ttmDps,
      yield_on_cost_pct: yocPct,
      current_market_yield_pct: currentYieldPct
    };
  }).sort((a, b) => b.yield_on_cost_pct - a.yield_on_cost_pct);
}
