/**
 * TAX HARVESTING & STATUTORY ADVANCE TAX ENGINE (TX-1, TX-4, TX-5, TX-6, TX-7)
 * Spec: dev_spec_opportunity_engine.md Section 4 (Phase 2)
 */

import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { roundINR, stcgRate, ltcgRate } from '../../lib/decimalUtils.js';
import { getDividendSummary } from './CorporateActionsEngine.js';

// Query helpers with active DB binding
const run = (sql: string, params: any[] = []) => dbRun(getDB(), sql, params);
const all = <T = any>(sql: string, params: any[] = []): Promise<T[]> => dbAll(getDB(), sql, params);
const get = <T = any>(sql: string, params: any[] = []): Promise<T | null> => dbGet(getDB(), sql, params);

export interface TaxHarvestSuggestion {
  symbol: string;
  isin: string;
  portfolio: string;
  pan: string;
  quantity: number;
  current_price: number;
  avg_buy_price: number;
  unrealized_loss: number;
  loss_category: 'STCL' | 'LTCL'; // holding period <= 365 days -> STCL
  offsettable_loss: number;
  estimated_tax_saved: number;
  repurchase_eligible_date: string; // +31 calendar days
  action_status: 'AVAILABLE' | 'OFFSET_EXHAUSTED' | 'ALREADY_HARVESTED';
}

export interface AdvanceTaxInstallment {
  installment_num: number;
  statutory_due_date: string; // YYYY-MM-DD
  quarter_label: string;
  cumulative_target_pct: number; // 15%, 45%, 75%, 100%
  estimated_ytd_tax_liability: number;
  cumulative_required_amount: number;
  amount_payable_this_installment: number;
  is_past_due: boolean;
  interest_234c_risk_note?: string;
}

export interface CflWaterfallItem {
  id: number;
  pan: string;
  portfolio: string;
  financial_year_origin: string;
  assessment_year_origin: string;
  loss_type: 'STCL' | 'LTCL' | 'BUSINESS_LOSS';
  original_loss_amount: number;
  absorbed_to_date: number;
  remaining_unabsorbed: number;
  expiry_assessment_year: string;
  years_remaining_to_expire: number;
  is_near_expiry: boolean; // <= 1 year
  estimated_tax_benefit_if_used: number;
}

export interface RepurchaseReminder {
  harvest_id: number;
  symbol: string;
  portfolio: string;
  pan: string;
  sold_date: string;
  loss_amount: number;
  tax_saved: number;
  repurchase_eligible_date: string;
  outcome_status: 'PENDING' | 'ELIGIBLE_FOR_REPURCHASE' | 'COMPLETED' | 'INTERVENING_CA_ALERT';
  intervening_corporate_action: boolean;
  intervening_ca_details?: string;
}

export async function initTaxHarvestingTables(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS harvest_tracking (
      harvest_id INTEGER PRIMARY KEY AUTOINCREMENT,
      pan TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT NOT NULL,
      quantity REAL NOT NULL,
      sold_date TEXT NOT NULL,
      loss_amount REAL NOT NULL,
      tax_saved REAL NOT NULL,
      repurchase_eligible_date TEXT NOT NULL,
      outcome_status TEXT NOT NULL DEFAULT 'PENDING',
      repurchase_actual_date TEXT,
      intervening_corporate_action INTEGER DEFAULT 0,
      intervening_ca_details TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

/**
 * TX-1: Tax Loss Harvesting Recommendations Panel
 *
 * Implements the Indian IT Act Statutory Offset Waterfall:
 * 1. STCL first offsets STCG
 * 2. Remaining STCL can offset LTCG
 * 3. LTCL can ONLY offset LTCG
 *
 * Sourced with date-aware rates from decimalUtils.ts
 * Allocates shared offset pool across symbols without double-counting.
 */
export async function getTaxHarvestingRecommendations(pan?: string, fy?: string): Promise<{
  suggestions: TaxHarvestSuggestion[];
  realized_stcg_pool: number;
  realized_ltcg_pool: number;
  total_potential_tax_saved: number;
  disclaimer: string;
}> {
  // 1. Get realized gains pool for this PAN / FY
  let realizedQuery = `
    SELECT
      COALESCE(P.pan, 'AQCPS7204G') as pan,
      SUM(CASE WHEN R.tax_category = 'STCG' AND COALESCE(R.taxable_pnl, R.realized_pnl, 0) > 0 THEN COALESCE(R.taxable_pnl, R.realized_pnl, 0) ELSE 0 END) as total_stcg_gains,
      SUM(CASE WHEN R.tax_category = 'LTCG' AND COALESCE(R.taxable_pnl, R.realized_pnl, 0) > 0 THEN COALESCE(R.taxable_pnl, R.realized_pnl, 0) ELSE 0 END) as total_ltcg_gains
    FROM RealizedGains R
    LEFT JOIN Portfolios P ON R.portfolio = P.name
    WHERE 1=1
  `;
  const realizedParams: any[] = [];
  if (pan && pan !== 'ALL') {
    realizedQuery += ` AND P.pan = ?`;
    realizedParams.push(pan);
  }
  if (fy && fy !== 'ALL') {
    const startYear = parseInt(fy.split('-')[0], 10);
    if (!isNaN(startYear)) {
      realizedQuery += ` AND R.sell_date >= ? AND R.sell_date <= ?`;
      realizedParams.push(`${startYear}-04-01`, `${startYear + 1}-03-31`);
    }
  }
  realizedQuery += ` GROUP BY P.pan`;

  const poolRow = await get<any>(realizedQuery, realizedParams);
  let remainingStcgPool = poolRow ? Number(poolRow.total_stcg_gains || 0) : 0;
  let remainingLtcgPool = poolRow ? Number(poolRow.total_ltcg_gains || 0) : 0;

  // 2. Query active unrealized loss positions
  let holdingsQuery = `
    SELECT H.*, COALESCE(P.pan, 'AQCPS7204G') as pan
    FROM Holdings H
    JOIN Portfolios P ON H.portfolio = P.name
    WHERE H.quantity > 0 AND H.unrealized_pnl < -100
  `;
  const holdingsParams: any[] = [];
  if (pan && pan !== 'ALL') {
    holdingsQuery += ` AND P.pan = ?`;
    holdingsParams.push(pan);
  }
  holdingsQuery += ` ORDER BY H.unrealized_pnl ASC`; // Largest losses first

  const lossPositions = await all<any>(holdingsQuery, holdingsParams);

  // 3. Check already actioned harvests to avoid duplicate suggestions
  const activeHarvests = await all<{ symbol: string; portfolio: string }>(`
    SELECT symbol, portfolio FROM harvest_tracking
    WHERE outcome_status IN ('PENDING', 'ELIGIBLE_FOR_REPURCHASE')
  `);
  const activeHarvestSet = new Set(activeHarvests.map(h => `${h.portfolio}_${h.symbol}`.toUpperCase()));

  const suggestions: TaxHarvestSuggestion[] = [];
  let totalSaved = 0;
  const todayStr = new Date().toISOString().split('T')[0];

  // 31-calendar-day heuristic date per TX-1 spec
  const repDate = new Date();
  repDate.setDate(repDate.getDate() + 31);
  const repurchaseEligibleDate = repDate.toISOString().split('T')[0];

  for (const pos of lossPositions) {
    const lossKey = `${pos.portfolio}_${pos.symbol}`.toUpperCase();
    if (activeHarvestSet.has(lossKey)) {
      continue;
    }

    const unLoss = Math.abs(pos.unrealized_pnl);
    // Determine category based on holding type / period (default to STCL for equity unless > 365 days)
    const category: 'STCL' | 'LTCL' = pos.holding_period_days > 365 ? 'LTCL' : 'STCL';
    let offsettable = 0;
    let rate = 0.20;

    if (category === 'STCL') {
      rate = stcgRate(todayStr);
      // STCL offsets STCG pool first
      if (remainingStcgPool > 0) {
        offsettable = Math.min(unLoss, remainingStcgPool);
        remainingStcgPool -= offsettable;
      } else if (remainingLtcgPool > 0) {
        // Remaining STCL can offset LTCG pool
        offsettable = Math.min(unLoss, remainingLtcgPool);
        remainingLtcgPool -= offsettable;
      }
    } else {
      rate = ltcgRate(todayStr);
      // LTCL can ONLY offset LTCG pool
      if (remainingLtcgPool > 0) {
        offsettable = Math.min(unLoss, remainingLtcgPool);
        remainingLtcgPool -= offsettable;
      }
    }

    const taxSaved = roundINR(offsettable * rate);
    totalSaved += taxSaved;

    suggestions.push({
      symbol: pos.symbol,
      isin: pos.isin,
      portfolio: pos.portfolio,
      pan: pos.pan,
      quantity: pos.quantity,
      current_price: pos.ltp,
      avg_buy_price: pos.avg_buy_price,
      unrealized_loss: roundINR(pos.unrealized_pnl),
      loss_category: category,
      offsettable_loss: roundINR(offsettable),
      estimated_tax_saved: taxSaved,
      repurchase_eligible_date: repurchaseEligibleDate,
      action_status: offsettable > 0 ? 'AVAILABLE' : 'OFFSET_EXHAUSTED'
    });
  }

  return {
    suggestions,
    realized_stcg_pool: roundINR(poolRow ? Number(poolRow.total_stcg_gains || 0) : 0),
    realized_ltcg_pool: roundINR(poolRow ? Number(poolRow.total_ltcg_gains || 0) : 0),
    total_potential_tax_saved: roundINR(totalSaved),
    disclaimer: 'The 31-day repurchase rule is a common precautionary buffer to mitigate sham-transaction scrutiny under General Anti-Avoidance Rules (GAAR), not a statutory Indian tax requirement. Confirm your tax harvesting strategy with a Chartered Accountant before execution.'
  };
}

/**
 * TX-1 Action: Record a tax loss harvesting execution
 */
export async function recordHarvestAction(params: {
  pan: string;
  portfolio: string;
  symbol: string;
  isin: string;
  quantity: number;
  lossAmount: number;
  taxSaved: number;
  soldDate?: string;
}): Promise<{ success: boolean; repurchase_eligible_date: string }> {
  const now = new Date().toISOString();
  const soldDate = now.split('T')[0];

  const repDate = new Date();
  repDate.setDate(repDate.getDate() + 31);
  const repurchaseEligibleDate = repDate.toISOString().split('T')[0];

  await run(`
    INSERT INTO harvest_tracking
    (pan, portfolio, symbol, isin, quantity, sold_date, loss_amount, tax_saved, repurchase_eligible_date, outcome_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `, [
    params.pan,
    params.portfolio,
    params.symbol,
    params.isin,
    params.quantity,
    params.soldDate || soldDate,
    params.lossAmount,
    params.taxSaved,
    repurchaseEligibleDate,
    now
  ]);

  return { success: true, repurchase_eligible_date: repurchaseEligibleDate };
}

/**
 * TX-4: Advance Tax Planner & Installment Schedule
 * Statutory Indian Calendar Deadlines under Section 208/211:
 * - June 15: 15% of annual liability
 * - September 15: 45% of annual liability
 * - December 15: 75% of annual liability
 * - March 15: 100% of annual liability
 */
export function computeAdvanceTaxSchedule(
  annualEstimatedTax: number,
  fyYearStart: number = 2024
): AdvanceTaxInstallment[] {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const installments = [
    { num: 1, date: `${fyYearStart}-06-15`, label: 'Q1 (Jun 15)', targetPct: 0.15 },
    { num: 2, date: `${fyYearStart}-09-15`, label: 'Q2 (Sep 15)', targetPct: 0.45 },
    { num: 3, date: `${fyYearStart}-12-15`, label: 'Q3 (Dec 15)', targetPct: 0.75 },
    { num: 4, date: `${fyYearStart + 1}-03-15`, label: 'Q4 (Mar 15)', targetPct: 1.00 }
  ];

  let previousCumulativeAmount = 0;

  return installments.map(inst => {
    const isPastDue = todayStr > inst.date;
    const cumulativeRequired = roundINR(annualEstimatedTax * inst.targetPct);
    const payableThisInstallment = roundINR(Math.max(0, cumulativeRequired - previousCumulativeAmount));
    previousCumulativeAmount = cumulativeRequired;

    return {
      installment_num: inst.num,
      statutory_due_date: inst.date,
      quarter_label: inst.label,
      cumulative_target_pct: inst.targetPct * 100,
      estimated_ytd_tax_liability: roundINR(annualEstimatedTax),
      cumulative_required_amount: cumulativeRequired,
      amount_payable_this_installment: payableThisInstallment,
      is_past_due: isPastDue,
      interest_234c_risk_note: isPastDue
        ? 'Shortfall in this installment attracts simple interest @ 1% per month for 3 months under Section 234C.'
        : undefined
    };
  });
}

/**
 * TX-5: Carried Forward Losses (CFL) 8-Year Waterfall Table
 * Indian IT Act Section 70/74: Losses can be carried forward for 8 Assessment Years.
 */
export async function getCflWaterfall(pan?: string): Promise<CflWaterfallItem[]> {
  let query = `
    SELECT
      C.id,
      C.portfolio,
      COALESCE(C.pan, P.pan, 'AQCPS7204G') as pan,
      C.financial_year,
      C.assessment_year,
      C.stcl_amount,
      C.ltcl_amount
    FROM CarriedForwardLosses C
    LEFT JOIN Portfolios P ON C.portfolio = P.name
    WHERE 1=1
  `;
  const params: any[] = [];
  if (pan && pan !== 'ALL') {
    query += ` AND (C.pan = ? OR P.pan = ?)`;
    params.push(pan, pan);
  }

  const rows = await all<any>(query, params);
  const currentAyStartYear = new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear();

  const results: CflWaterfallItem[] = [];

  for (const r of rows) {
    const match = (r.assessment_year || '').match(/(\d{4})/) || (r.financial_year || '').match(/(\d{4})/);
    const originAyNum = match ? parseInt(match[1], 10) : 2024;
    const expiryAyNum = originAyNum + 8;
    const yearsRemaining = Math.max(0, expiryAyNum - currentAyStartYear);

    if (r.stcl_amount && Number(r.stcl_amount) > 0) {
      const amt = Number(r.stcl_amount);
      results.push({
        id: r.id,
        pan: r.pan,
        portfolio: r.portfolio,
        financial_year_origin: r.financial_year || `${originAyNum - 1}-${originAyNum}`,
        assessment_year_origin: r.assessment_year || `${originAyNum}-${originAyNum + 1}`,
        loss_type: 'STCL',
        original_loss_amount: amt,
        absorbed_to_date: 0,
        remaining_unabsorbed: amt,
        expiry_assessment_year: `AY ${expiryAyNum}-${String(expiryAyNum + 1).slice(-2)}`,
        years_remaining_to_expire: yearsRemaining,
        is_near_expiry: yearsRemaining <= 1,
        estimated_tax_benefit_if_used: roundINR(amt * 0.20)
      });
    }

    if (r.ltcl_amount && Number(r.ltcl_amount) > 0) {
      const amt = Number(r.ltcl_amount);
      results.push({
        id: r.id,
        pan: r.pan,
        portfolio: r.portfolio,
        financial_year_origin: r.financial_year || `${originAyNum - 1}-${originAyNum}`,
        assessment_year_origin: r.assessment_year || `${originAyNum}-${originAyNum + 1}`,
        loss_type: 'LTCL',
        original_loss_amount: amt,
        absorbed_to_date: 0,
        remaining_unabsorbed: amt,
        expiry_assessment_year: `AY ${expiryAyNum}-${String(expiryAyNum + 1).slice(-2)}`,
        years_remaining_to_expire: yearsRemaining,
        is_near_expiry: yearsRemaining <= 1,
        estimated_tax_benefit_if_used: roundINR(amt * 0.125)
      });
    }
  }

  // Sort by years remaining ascending (soonest to expire first per spec)
  return results.sort((a, b) => a.years_remaining_to_expire - b.years_remaining_to_expire);
}

/**
 * TX-7: Repurchase Timing Follow-Up Tracker
 * Scans harvest_tracking and checks for intervening corporate actions.
 */
export async function getRepurchaseFollowUpReminders(pan?: string): Promise<RepurchaseReminder[]> {
  let query = `SELECT * FROM harvest_tracking WHERE outcome_status IN ('PENDING', 'ELIGIBLE_FOR_REPURCHASE')`;
  const params: any[] = [];
  if (pan && pan !== 'ALL') {
    query += ` AND pan = ?`;
    params.push(pan);
  }

  const rows = await all<any>(query, params);
  const todayStr = new Date().toISOString().split('T')[0];
  const reminders: RepurchaseReminder[] = [];

  for (const r of rows) {
    const isEligible = todayStr >= r.repurchase_eligible_date;

    // Check for intervening corporate actions on this symbol between sold_date and today
    const caRows = await all<any>(`
      SELECT * FROM CorporateActions
      WHERE symbol = ? AND record_date >= ?
    `, [r.symbol, r.sold_date]);

    const hasInterveningCa = caRows.length > 0;
    const caDetails = hasInterveningCa
      ? `${caRows[0].action_type} declared on ${caRows[0].record_date} (${caRows[0].details || 'Ratio change'})`
      : undefined;

    let status: 'PENDING' | 'ELIGIBLE_FOR_REPURCHASE' | 'COMPLETED' | 'INTERVENING_CA_ALERT' = 'PENDING';
    if (hasInterveningCa) {
      status = 'INTERVENING_CA_ALERT';
    } else if (isEligible) {
      status = 'ELIGIBLE_FOR_REPURCHASE';
    }

    reminders.push({
      harvest_id: r.harvest_id,
      symbol: r.symbol,
      portfolio: r.portfolio,
      pan: r.pan,
      sold_date: r.sold_date,
      loss_amount: r.loss_amount,
      tax_saved: r.tax_saved,
      repurchase_eligible_date: r.repurchase_eligible_date,
      outcome_status: status,
      intervening_corporate_action: hasInterveningCa,
      intervening_ca_details: caDetails
    });
  }

  return reminders;
}
