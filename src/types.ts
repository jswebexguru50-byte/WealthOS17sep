export interface Holding {
  portfolio: string;
  isin: string;
  symbol: string;
  company_name: string;
  sector: string;
  quantity: number;
  avg_buy_price: number;
  total_cost: number;
  ltp: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  day_change: number;
  day_change_pct: number;
  data_source: string;
  data_status?: string;
  last_update: string | null;
  is_sold: boolean;
  currency?: string;
  rate_to_inr?: number;
  inr_valuation?: number;
  native_ltp?: number;
  native_current_value?: number;
  native_total_cost?: number;
  native_avg_buy_price?: number;
  native_unrealized_pnl?: number;
  xirr?: number | null;
  bench_xirr?: number | null;
  portfolio_breakdown?: Holding[];
  holding_type?: string;
  is_post_tax_nav?: boolean;
}

export interface Transaction {
  id: number;
  date: string;
  portfolio: string;
  type: string;
  isin: string;
  symbol: string;
  company_name?: string;
  quantity: number;
  price: number;
  gross_amount: number;
  brokerage: number;
  net_amount: number;
  source: string;
  broker_name?: string;
  account_number?: string;
  folio?: string;
  notes?: string;
  currency?: string;
  rate_to_inr?: number;
}

export interface CorporateAction {
  id: number;
  record_date: string;
  ex_date?: string;
  isin: string;
  symbol: string;
  company_name?: string;
  action_type: string;
  details?: string;
  numerator?: number;
  denominator?: number;
  dividend_per_share?: number;
  source?: string;
  applied: number;
  applied_date?: string;
  holding_qty_on_record_date?: number;
  is_eligible?: boolean;
  notes?: string;
}

export interface RealizedGain {
  match_id: number;
  portfolio: string;
  pan?: string;
  owner_name?: string;
  isin: string;
  symbol: string;
  company_name?: string;
  buy_date: string;
  buy_price: number;
  matched_qty: number;
  sell_date: string;
  sell_price: number;
  buy_cost: number;
  sell_proceeds: number;
  realized_pnl: number;
  holding_days: number;
  tax_category: string;
  fmv_31_jan_2018: number;
  grandfathered_cost: number;
  taxable_pnl: number;
}

export interface TaxSummaryRow {
  financial_year: string;
  portfolio: string;
  stcg_gains: number;
  stcg_tax: number;
  ltcg_gains: number;
  ltcg_exemption: number;
  ltcg_taxable: number;
  ltcg_tax: number;
  total_tax: number;
  dividends: number;
  total_realized_pnl: number;
  gross_tax?: number;
  stcl_bf?: number;
  ltcl_bf?: number;
  stcl_utilized?: number;
  ltcl_utilized?: number;
  stcl_remaining?: number;
  ltcl_remaining?: number;
  tax_saved_cfl?: number;
}

export interface PanRealizedSummary {
  pan: string;
  owner_name: string;
  portfolios?: string[];
  total_realized_pnl: number;
  stcg_gains: number;
  stcg_losses: number;
  net_stcg: number;
  ltcg_gains: number;
  ltcg_losses: number;
  net_ltcg: number;
  gross_tax?: number;
  estimated_tax: number;
  trade_count: number;
  stcl_bf?: number;
  ltcl_bf?: number;
  stcl_utilized?: number;
  ltcl_utilized?: number;
  stcl_remaining?: number;
  ltcl_remaining?: number;
  post_taxable_stcg?: number;
  post_taxable_ltcg?: number;
  tax_saved_cfl?: number;
}

export interface CarriedForwardLossRecord {
  id?: number;
  portfolio: string;
  pan?: string;
  owner_name?: string;
  financial_year: string;
  stcl_amount: number;
  ltcl_amount: number;
  assessment_year?: string;
  notes?: string;
  updated_at?: string;
}

export interface MasterTicker {
  id: number;
  isin: string;
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  sector?: string;
  manual_ltp?: number;
  manual_ltp_date?: string;
  fmv_31_jan_2018?: number;
}

export interface ActionHistoryLog {
  id: number;
  timestamp: string;
  action_type: string;
  description: string;
  batch_id: string;
}

export interface DashboardMetrics {
  total_invested: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  realized_pnl: number;
  dividends: number;
  xirr: number | null;
  bench_xirr: number | null;
  unpriced_holdings: number;
  day_change: number;
  day_change_pct: number;
  pms_cash_in_hand?: number;
  bank_fd_inr_valuation?: number;
  india_bank_fd_valuation?: number;
  uae_bank_fd_valuation?: number;
  total_net_worth?: number;
  fx_rates?: Record<string, number>;
  portfolio_currency?: string;
  is_foreign_portfolio?: boolean;
  native_currency?: string;
  native_current_value?: number;
  native_total_invested?: number;
  native_unrealized_pnl?: number;
  native_dividends?: number;
  native_gross_dividends?: number;
  native_withheld_tax?: number;
  inr_current_value?: number;
  inr_total_invested?: number;
  inr_unrealized_pnl?: number;
  inr_dividends?: number;
  inr_gross_dividends?: number;
  inr_withheld_tax?: number;
  usd_rate?: number;
  inr_xirr?: number | null;
  gold_xirr?: number | null;
  sp500_xirr?: number | null;
  twr?: number | null;
  exchange_rate?: number;
  // PMS-specific injected security/cash fields
  pms_injected_cash?: number;
  pms_injected_securities?: number;
  pms_total_corpus?: number;
  // Post-Tax XIRR & Tax Provision fields
  post_tax_xirr?: number | null;
  tax_drag_pct?: number | null;
  tax_provision_details?: any;
}

// ============================================================================
// QUANTITATIVE, TECHNICAL & FUNDAMENTAL ANALYSIS ENGINE v5.0 TYPES
// ============================================================================

// --- MACRO REGIME & VOLATILITY TYPES ---
export type MacroRegimeV5 = 
  | 'BULLISH_EXPANSION'
  | 'HIGH_BETA_VOLATILITY_EXPANSION'
  | 'SIDEWAYS_RANGE'
  | 'BEARISH_CORRECTION'
  | 'SYSTEMIC_TAIL_RISK_CRISIS';

export interface MacroLiquidityMetrics {
  nifty50: number;
  nifty50Ema50: number;
  nifty50Sma200: number;
  breadthAbove200SmaPct: number; // e.g. 68.5 for 68.5%
  advanceDeclineRatio: number; // e.g. 1.25
  indiaVix: number;
  vixTermStructure: 'CONTANGO' | 'BACKWARDATION';
  fiiNetFlow10DayCr: number; // Net flow in Crores
  us10YRealYieldPct: number;
  macroLiquidityIndex: number; // Normalized MLI score (-100 to +100)
}

export interface MacroRegimeState {
  currentRegime: MacroRegimeV5;
  activeStrategyIds: string[];
  maxPortfolioEquityExposurePct: number;
  hedgingRequired: boolean;
  metrics: MacroLiquidityMetrics;
  updatedAt: string;
}

// --- POSITION SIZING & RISK TYPES ---
export interface PositionSizingInput {
  portfolioEquity: number;
  entryPrice: number;
  atr14: number;
  historicalWinRatePct: number; // e.g. 62.5
  rewardToRiskRatio: number; // e.g. 2.2
  stopLossDistancePrice: number;
}

export interface PositionSizingOutput {
  fractionalKellyFactor: number;
  recommendedShares: number;
  totalCapitalAllocation: number;
  capitalAllocationPct: number;
  maxRiskAmount: number;
  riskPctOfEquity: number;
  atrStopLossPrice: number;
}

// --- VALUATION & EPV TYPES ---
export interface EPVValuationInput {
  ticker: string;
  currentMarketCapCr: number;
  ebitCr: number;
  taxRatePct: number; // e.g. 25
  depreciationCr: number;
  maintenanceCapexCr: number;
  sbcExpenseCr: number;
  operatingLeaseCommitments7YrCr: number;
  netDebtCr: number;
  waccPct: number; // e.g. 11.5
  dcfIntrinsicValuePerShare: number;
  totalSharesOutstandingCr: number;
  currentStockPrice: number;
}

export interface EPVValuationOutput {
  ticker: string;
  adjustedNopatCr: number;
  earningPowerValueCr: number;
  epvPerShare: number;
  capitalizedLeaseLiabilityCr: number;
  adjustedEnterpriseValueCr: number;
  dcfIntrinsicValuePerShare: number;
  growthValuePremiumPct: number; // (DCF - EPV) / DCF * 100
  valuationGateStatus: 'EPV_MOAT_BUY' | 'SPECULATIVE_GROWTH_WARNING' | 'OVERVALUED_TRAP';
  piotroskiFScore: number;
  altmanZScore: number;
  beneishMScore: number;
}

// --- MICROSTRUCTURE & OBI TYPES ---
export interface Level2OrderBook {
  bids: { price: number; quantity: number }[]; // Top 5 depth
  asks: { price: number; quantity: number }[]; // Top 5 depth
}

export interface OrderBookImbalanceOutput {
  totalBidVolume: number;
  totalAskVolume: number;
  obiRatio: number; // Ranges from -1.0 to +1.0
  isInstitutionalBuyAggression: boolean; // True if OBI >= +0.35
  passMicrostructureGate: boolean;
}

// --- STRATEGY S12 EPISODIC PIVOT TYPES ---
export interface EpisodicPivotInput {
  ticker: string;
  gapUpPct: number; // Must be >= 4.5%
  opening5MinVolume: number;
  average50DayVolume: number;
  opening5MinHigh: number;
  opening5MinLow: number;
  currentPrice: number;
  hasPositiveEarningsOrCapexSurprise: boolean;
}

export interface EpisodicPivotOutput {
  isSetupValid: boolean;
  entryTriggerPrice: number;
  stopLossPrice: number;
  targetPrice1: number; // 1:2 R:R
  recommendedShares: number;
  reason: string;
}

// ============================================================================
// --- V6.0 INSTITUTIONAL ENGINE ENHANCEMENT TYPES ---
// ============================================================================

export interface LimitPullbackEntryConfig {
  trancheAAllocationPct: number; // 35% on breakout
  trancheBAllocationPct: number; // 65% on base retest
  retestTolerancePct: number; // +/- 0.3%
  mansfieldRsThreshold: number; // > 0
  fastBreakevenTriggerPct: number; // +5.0%
}

export interface LimitPullbackEntryResult {
  trancheAPrice: number;
  trancheBPrice: number;
  blendedEntryPrice: number;
  mansfieldRsScore: number;
  mansfieldRsPassed: boolean;
  fastBreakevenPrice: number;
  dynamicTargetLadder: {
    t1: number; // 1.8 * ATR
    t2: number; // 3.2 * ATR
    t3TrailingEma: number; // 21 EMA trailing
  };
}

export interface DisplacementQualityScore {
  bodyToAtrRatio: number; // Must be >= 1.8
  volumeToSmaRatio: number; // Must be >= 2.2
  htfOrderBlockConfluence: boolean;
  displacementScore: number; // 0-100
  isInstitutionalGrade: boolean;
}

export interface OrderBlockDecayModel {
  originalQuality: number;
  creationDate: string;
  daysActive: number;
  decayedFreshnessScore: number; // 100 * exp(-0.025 * days)
  isExpired: boolean; // True if < 40
  isMitigated: boolean;
  flippedIntoBreaker: boolean;
  breakerLevel?: {
    top: number;
    bottom: number;
    meanThreshold: number;
    polarity: 'BULLISH_BREAKER' | 'BEARISH_BREAKER';
  };
}

export interface S13EarningsAccelerationInput {
  symbol: string;
  currentPatYoYGrowthPct: number; // >= +25%
  priorQuarterPatYoYGrowthPct: number;
  qoqAccelerationBps: number; // >= +500 bps
  revenueGrowthYoYPct: number;
  grossMarginDeltaBps: number; // >= +100 bps
  pegRatio: number; // < 1.2
  fiiDiiCombinedStakeChangePct: number; // >= +1.5%
  priceAboveEma50: boolean;
  ema50AboveEma200: boolean;
}

export interface S13EarningsAccelerationResult {
  symbol: string;
  qualified: boolean;
  accelerationScore: number; // 0-100
  reratingTarget1: number; // Sector median PE
  reratingTarget2: number; // 1.5 PEG
  invalidationCriteria: string;
  holdingHorizonMonths: number; // 3-9 months
  suitability: 'INVESTMENT_COMPOUNDER' | 'TACTICAL_SWING' | 'DISQUALIFIED';
}

export interface StatefulAlertRecord {
  id: string;
  alertCode: string;
  category: 'TRADING_INTEL' | 'INVESTMENT_INTEL' | 'MACRO_GOVERNANCE';
  priority: 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_NORMAL';
  symbol: string;
  portfolio?: string;
  title: string;
  message: string;
  payload: Record<string, any>;
  state: 'ARMED' | 'TRIGGERED' | 'COOLDOWN' | 'INVALIDATED';
  timestamp: string;
  cooldownUntil: string;
  acknowledged: boolean;
  actionableRecommendation: string;
}

export interface DataQualityGateCheck {
  gateId: 'GATE_1_OHLC_BOUNDS' | 'GATE_2_SPIKE_FILTER' | 'GATE_3_CIRCUIT_LIMIT' | 'GATE_4_LIQUIDITY_TRAP' | 'GATE_5_RECONCILIATION';
  gateName: string;
  passed: boolean;
  detail: string;
  severity: 'PASS' | 'WARNING' | 'QUARANTINE';
}

export interface BacktestComparisonRow {
  version: 'v4.2_BASELINE' | 'v5.0_MACRO_KELLY' | 'v6.0_INSTITUTIONAL_ENHANCED';
  totalTrades: number;
  winRatePct: number;
  payoffRatio: number;
  grossReturnPct: number;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  calmarRatio: number;
  sharpeRatio: number;
  regimeAlpha: {
    bullishExpansionNetPct: number;
    bearishCorrectionNetPct: number;
    sidewaysConsolidationNetPct: number;
  };
}

// ─── Forensic Intelligence Layer (v2.1) ──────────────────────────────────────
export * from './types/forensic.js';



