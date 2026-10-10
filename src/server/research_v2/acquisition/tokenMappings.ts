import type { FactUnit, PeriodType } from '../domain/types.js';

/** Acquisition tier: T1 = needed by contract questions, T2 = supporting, T3 = other, SKIP = excluded. */
export type Tier = 'T1' | 'T2' | 'T3' | 'SKIP';

/** What a provider value is anchored to when it becomes a dated fact. */
export type AnchorKind =
  | 'RESULT_QUARTER'
  | 'RESULT_YEAR'
  | 'SHAREHOLDING_QUARTER'
  | 'OBSERVATION_DATE';

/** How sure we are that the token exists with the mapped meaning. */
export type Verification = 'DISCOVERED' | 'SEEDED' | 'REVERIFY' | 'SEMANTICS_UNVERIFIED';

/** One provider token and everything needed to turn its value into a domain fact. */
export interface TokenMapping {
  token: string;
  label: string;
  /** Canonical metric, or null when the token is catalogued but not emitted as a fact. */
  metric: string | null;
  unit: FactUnit;
  /** True when the provider reports money in crore (Trendlyne money values are crore, not rupees). */
  moneyInCrore: boolean;
  tier: Tier;
  periodType: PeriodType;
  anchor: AnchorKind;
  /** Quarters (quarterly anchors) or years (annual anchor) before the anchor period. */
  offset: number;
  /** Multiplier applied to the provider value (fraction to percent). */
  scale?: number;
  verification: Verification;
  /** Extra provider labels seen in responses (matched case-insensitively). */
  aliases: string[];
  notes?: string;
}

/** The five tokens the earlier mapping used that the discovered catalogue does not contain. */
export const REVERIFY_TOKENS: readonly string[] = [
  'contingentliabilitiesa', 'currentprice', 'ebita', 'inventoriesq', 'tradereceivablesa',
];

interface SeriesSpec {
  base: string;
  label: string;
  metric: string | null;
  tier: Tier;
  unit?: FactUnit;
  periodType: PeriodType;
  anchor: AnchorKind;
  offsets: number[];
  verification?: Verification;
  scale?: number;
  notes?: string;
  extraAliases?: (offset: number) => string[];
}

/** Quarterly token for an offset: base, mq1-3, my1 (4), mq5-7, my2 (8). */
export function quarterlyToken(base: string, offset: number): string {
  if (offset === 0) return base;
  if (offset === 4) return `${base}my1`;
  if (offset === 8) return `${base}my2`;
  return `${base}mq${offset}`;
}

/** Annual token for an offset: base, my1..my5. */
export function annualToken(base: string, offset: number): string {
  return offset === 0 ? base : `${base}my${offset}`;
}

function seriesLabel(spec: SeriesSpec, offset: number): string {
  const annual = spec.anchor === 'RESULT_YEAR';
  if (offset === 0) return `${spec.label} ${annual ? 'Annual' : 'Qtr'}`;
  return annual ? `${spec.label} Annual ${offset}Y Ago` : `${spec.label} ${offset}Q Ago`;
}

function expandSeries(spec: SeriesSpec): TokenMapping[] {
  const annual = spec.anchor === 'RESULT_YEAR';
  return spec.offsets.map(offset => ({
    token: annual ? annualToken(spec.base, offset) : quarterlyToken(spec.base, offset),
    label: seriesLabel(spec, offset),
    metric: spec.metric,
    unit: spec.unit ?? 'INR_CR',
    moneyInCrore: (spec.unit ?? 'INR_CR') === 'INR_CR',
    tier: spec.tier,
    periodType: spec.periodType,
    anchor: spec.anchor,
    offset,
    scale: spec.scale,
    verification: spec.verification ?? 'DISCOVERED',
    aliases: spec.extraAliases ? spec.extraAliases(offset) : [],
    notes: spec.notes,
  }));
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const Q8 = range(0, 8);
const Y5 = range(0, 5);

const QUARTER_FLOW: Omit<SeriesSpec, 'base' | 'label' | 'metric' | 'tier' | 'offsets'> =
  { periodType: 'DISCRETE_Q', anchor: 'RESULT_QUARTER' };
const ANNUAL_FLOW: Omit<SeriesSpec, 'base' | 'label' | 'metric' | 'tier' | 'offsets'> =
  { periodType: 'ANNUAL', anchor: 'RESULT_YEAR' };
const ANNUAL_STOCK: Omit<SeriesSpec, 'base' | 'label' | 'metric' | 'tier' | 'offsets'> =
  { periodType: 'POINT_IN_TIME', anchor: 'RESULT_YEAR' };

const UNVERIFIED_PAT = 'Provider "Net Profit" may be attributable-to-owners or total; confirm against reportedpatq/XBRL';
const SERIES: SeriesSpec[] = [
  // Quarterly P&L. "Operating Revenue" is revenue from operations; "Total Revenue" is total income.
  { ...QUARTER_FLOW, base: 'srq', label: 'Operating Revenue', metric: 'revenue_from_operations', tier: 'T1', offsets: Q8 },
  { ...QUARTER_FLOW, base: 'totalsrq', label: 'Total Revenue', metric: 'total_income', tier: 'T1', offsets: range(0, 4) },
  { ...QUARTER_FLOW, base: 'opq', label: 'Operating Profit', metric: 'operating_profit', tier: 'T1', offsets: Q8 },
  {
    ...QUARTER_FLOW, base: 'npq', label: 'Net Profit', metric: 'pat_attributable_to_owners', tier: 'T1', offsets: Q8,
    verification: 'SEMANTICS_UNVERIFIED', notes: UNVERIFIED_PAT,
  },
  { ...QUARTER_FLOW, base: 'pbtq', label: 'Profit Before Tax', metric: 'pbt', tier: 'T1', offsets: [0, 1, 4] },
  { ...QUARTER_FLOW, base: 'oiq', label: 'Other Income', metric: 'other_income', tier: 'T1', offsets: [0, 1, 3] },
  {
    ...QUARTER_FLOW, base: 'intq', label: 'Interest', metric: 'finance_cost', tier: 'T1', offsets: [0, 1, 3],
    verification: 'SEMANTICS_UNVERIFIED', notes: 'Provider interest may exclude lease interest; confirm against XBRL finance cost',
  },
  { ...QUARTER_FLOW, base: 'depreciationandamortizationq', label: 'Depreciation & Amortization',
    metric: 'depreciation_amortisation', tier: 'T1', offsets: [0] },
  { ...QUARTER_FLOW, base: 'exceptionalitemsq', label: 'Exceptional Items', metric: 'exceptional_items', tier: 'T1', offsets: [0] },
  { ...QUARTER_FLOW, base: 'extraordinaryitemq', label: 'ExtraOrdinary Items', metric: null, tier: 'T2', offsets: [0] },
  // Annual P&L and cash flow. "Total Revenue Annual" is total income; operating revenue annual is separate.
  {
    ...ANNUAL_FLOW, base: 'sra', label: 'Total Revenue', metric: 'total_income', tier: 'T1', offsets: Y5,
    extraAliases: offset => (offset >= 2 ? [`Revenue Annual ${offset}Y Ago`] : []),
  },
  { ...ANNUAL_FLOW, base: 'opa', label: 'Operating Profit', metric: 'operating_profit', tier: 'T1', offsets: Y5 },
  {
    ...ANNUAL_FLOW, base: 'npa', label: 'Net Profit', metric: 'pat_attributable_to_owners', tier: 'T1', offsets: Y5,
    verification: 'SEMANTICS_UNVERIFIED', notes: UNVERIFIED_PAT,
  },
  { ...ANNUAL_FLOW, base: 'pbta', label: 'Profit Before Tax', metric: 'pbt', tier: 'T1', offsets: [0, 1] },
  { ...ANNUAL_FLOW, base: 'taxa', label: 'Tax', metric: 'tax_expense', tier: 'T1', offsets: [0, 1] },
  { ...ANNUAL_FLOW, base: 'inta', label: 'Interest', metric: 'finance_cost', tier: 'T1', offsets: Y5,
    verification: 'SEMANTICS_UNVERIFIED', notes: 'Provider interest may exclude lease interest; confirm against XBRL finance cost' },
  { ...ANNUAL_FLOW, base: 'depa', label: 'Depreciation', metric: 'depreciation_amortisation', tier: 'T1', offsets: [1, 2, 4] },
  { ...ANNUAL_FLOW, base: 'oia', label: 'Other Income', metric: 'other_income', tier: 'T1', offsets: [0, 1] },
  { ...ANNUAL_FLOW, base: 'cfoa', label: 'Cash from Operating Activity', metric: 'cfo', tier: 'T1', offsets: Y5 },
  { ...ANNUAL_FLOW, base: 'cfia', label: 'Cash from Investing Activity', metric: 'cash_from_investing', tier: 'T2', offsets: Y5 },
  { ...ANNUAL_FLOW, base: 'cfaa', label: 'Cash from Financing Activity', metric: 'cash_from_financing', tier: 'T2', offsets: [1] },
  { ...ANNUAL_FLOW, base: 'ncfa', label: 'Net Cash Flow', metric: 'net_cash_flow', tier: 'T2', offsets: Y5 },
  {
    ...ANNUAL_FLOW, base: 'capitalexpenditurea', label: 'Capital Expenditure', metric: 'capex_cash_outflow', tier: 'T1',
    offsets: [0], verification: 'SEMANTICS_UNVERIFIED',
    notes: 'Sign and PPE-only versus total capex unverified; confirm against XBRL cash-flow lines',
  },
  { ...ANNUAL_FLOW, base: 'oexpnsa', label: 'Operating Expenses', metric: null, tier: 'T3', offsets: [0, 1, 4] },
  // Annual balance sheet (point in time at the fiscal year end).
  { ...ANNUAL_STOCK, base: 'borrowingsa', label: 'Borrowings', metric: 'borrowings_total', tier: 'T1', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'shorttermborrowingsa', label: 'Short Term Debt', metric: null, tier: 'T2', offsets: [0, 1] },
  { ...ANNUAL_STOCK, base: 'longtermborrowingsa', label: 'Long Term Debt', metric: null, tier: 'T2', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'cashandcashequivalentsa', label: 'Cash and Cash Equivalents', metric: 'cash_and_equivalents',
    tier: 'T1', offsets: [0], verification: 'SEEDED' },
  { ...ANNUAL_STOCK, base: 'tradepayablesa', label: 'Trade Payables', metric: 'trade_payables', tier: 'T1',
    offsets: [0], verification: 'SEEDED' },
  { ...ANNUAL_STOCK, base: 'tradereceivablesa', label: 'Trade Receivables', metric: 'trade_receivables', tier: 'T1',
    offsets: [0], verification: 'REVERIFY', notes: 'Absent from discovered catalogue; re-verify before relying on it' },
  { ...ANNUAL_STOCK, base: 'inventoriesa', label: 'Inventories', metric: 'inventory', tier: 'T1', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'taa', label: 'Total Assets', metric: 'total_assets', tier: 'T1', offsets: [1] },
  { ...ANNUAL_STOCK, base: 'totalshareholdersfundsa', label: 'Total ShareHolders Funds', metric: 'equity_total',
    tier: 'T1', offsets: [0, 1], verification: 'SEEDED' },
  { ...ANNUAL_STOCK, base: 'commonstocka', label: 'Common Stock', metric: 'equity_capital', tier: 'T1', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'contingentliabilitiesa', label: 'Contingent Liabilities', metric: 'contingent_liabilities',
    tier: 'T1', offsets: [0], verification: 'REVERIFY', notes: 'Absent from discovered catalogue; re-verify before relying on it' },
  { ...ANNUAL_STOCK, base: 'currentdebtcapleaseobligationa', label: 'Current Debt and Capital Lease Obligation',
    metric: null, tier: 'T2', offsets: [0], verification: 'SEEDED', notes: 'Not the lease liability total; not emitted' },
  { ...ANNUAL_STOCK, base: 'fixedassetsa', label: 'Fixed Assets', metric: 'fixed_assets', tier: 'T2', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'capitalworkinprogressa', label: 'Capital Work In Progress', metric: 'capital_work_in_progress',
    tier: 'T2', offsets: [0, 1] },
  { ...ANNUAL_STOCK, base: 'investmentsa', label: 'Investments', metric: 'investments', tier: 'T2', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'netdebta', label: 'Net Debt', metric: 'net_debt', tier: 'T2', offsets: [0] },
  { ...ANNUAL_STOCK, base: 'caa', label: 'Total Current Assets', metric: 'total_current_assets', tier: 'T2', offsets: [1] },
  { ...ANNUAL_STOCK, base: 'cla', label: 'Total Current Liabilities', metric: 'total_current_liabilities', tier: 'T2', offsets: [1] },
  { ...ANNUAL_STOCK, base: 'inventoriesq', label: 'Inventories', metric: 'inventory', tier: 'T1', offsets: [0],
    periodType: 'POINT_IN_TIME', anchor: 'RESULT_QUARTER', verification: 'REVERIFY',
    notes: 'Absent from discovered catalogue; re-verify before relying on it' },
  { ...ANNUAL_STOCK, base: 'ebita', label: 'EBITA', metric: null, tier: 'T2', offsets: [0], verification: 'REVERIFY',
    notes: 'Absent from discovered catalogue; EBITA is not EBITDA; not emitted' },
];

interface RatioSpec {
  base: string; label: string; metric: string; unit: FactUnit; offsets: number[]; tier?: Tier;
}

function ratioSeries(spec: RatioSpec): TokenMapping[] {
  return expandSeries({
    ...ANNUAL_FLOW, base: spec.base, label: spec.label, metric: spec.metric, tier: spec.tier ?? 'T2',
    unit: spec.unit, offsets: spec.offsets,
  });
}

const RATIOS: TokenMapping[] = [
  ...ratioSeries({ base: 'roea', label: 'ROE', metric: 'roe_pct', unit: 'PCT', offsets: Y5 }),
  ...ratioSeries({ base: 'rocea', label: 'ROCE', metric: 'roce_pct', unit: 'PCT', offsets: [0, 1] }),
  ...ratioSeries({ base: 'roica', label: 'ROIC', metric: 'roic_pct', unit: 'PCT', offsets: [0] }),
  ...ratioSeries({ base: 'roaa', label: 'RoA', metric: 'roa_pct', unit: 'PCT', offsets: [0, 1, 3] }),
  ...ratioSeries({ base: 'debtcea', label: 'Total Debt to Total Equity', metric: 'debt_to_equity', unit: 'RATIO', offsets: [0] }),
  ...ratioSeries({ base: 'ltdea', label: 'Long Term Debt To Equity', metric: 'long_term_debt_to_equity', unit: 'RATIO', offsets: [0, 1] }),
  ...ratioSeries({ base: 'cratioa', label: 'Current Ratio', metric: 'current_ratio', unit: 'RATIO', offsets: [0] }),
  ...ratioSeries({ base: 'ica', label: 'Interest Coverage Ratio', metric: 'interest_coverage', unit: 'X', offsets: [0] })
    .map(m => ({ ...m, verification: 'SEEDED' as const })),
  ...ratioSeries({ base: 'opmpcta', label: 'Operating Profit Margin', metric: 'operating_margin_pct', unit: 'PCT', offsets: [0, 1] }),
];

/** Builds a mapping for a single token that is not part of a series. */
function single(spec: Partial<TokenMapping> & Pick<TokenMapping, 'token' | 'label' | 'metric' | 'unit'>): TokenMapping {
  return {
    moneyInCrore: spec.unit === 'INR_CR',
    tier: 'T1',
    periodType: 'POINT_IN_TIME',
    anchor: 'OBSERVATION_DATE',
    offset: 0,
    verification: 'DISCOVERED',
    aliases: [],
    ...spec,
  };
}

const SH = { periodType: 'POINT_IN_TIME', anchor: 'SHAREHOLDING_QUARTER' } as const;
const OBS = { periodType: 'POINT_IN_TIME', anchor: 'OBSERVATION_DATE' } as const;
const TTM = { periodType: 'TTM', anchor: 'RESULT_QUARTER' } as const;

const SINGLES: TokenMapping[] = [
  // Priced-date valuation inputs: the provider observation date is the priced date.
  single({ token: 'currentprice', label: 'Current Price', metric: 'current_price', unit: 'INR_PER_SHARE', ...OBS,
    aliases: ['LTP'], verification: 'REVERIFY', notes: 'Absent from discovered catalogue; response label is LTP' }),
  single({ token: 'mcapq', label: 'Market Capitalization', metric: 'market_cap', unit: 'INR_CR', ...OBS, aliases: ['Market Cap'] }),
  single({ token: 'freefloatmcapq', label: 'Free Float Market Cap', metric: 'free_float_market_cap', unit: 'INR_CR', tier: 'T2', ...OBS }),
  single({ token: 'pettm', label: 'PE TTM Price to Earnings', metric: 'pe_ttm', unit: 'RATIO', ...OBS, aliases: ['PE TTM'] }),
  single({ token: 'pbva', label: 'Price to Book Value Adjusted', metric: 'pb_ratio', unit: 'RATIO', ...OBS }),
  single({ token: 'pegttm', label: 'PEG TTM PE to Growth', metric: 'peg_ttm', unit: 'RATIO', tier: 'T2', ...OBS }),
  single({ token: 'psttm', label: 'Price to Sales TTM', metric: 'ps_ttm', unit: 'RATIO', tier: 'T2', ...OBS }),
  single({ token: 'bvshq', label: 'Book Value Per Share Latest', metric: 'book_value_per_share', unit: 'INR_PER_SHARE',
    ...OBS, aliases: ['BVSH Latest'] }),
  single({ token: 'epsttm', label: 'Basic EPS TTM', metric: 'eps_ttm', unit: 'INR_PER_SHARE', ...TTM }),
  single({ token: 'peavg3y', label: 'PE 3Yr Average', metric: 'pe_avg_3y', unit: 'RATIO', tier: 'T2', ...OBS }),
  single({ token: 'peavg5y', label: 'PE 5Yr Average', metric: 'pe_avg_5y', unit: 'RATIO', tier: 'T2', ...OBS }),
  single({ token: 'peavg10y', label: 'PE 10Yr Average', metric: 'pe_avg_10y', unit: 'RATIO', tier: 'T2', ...OBS }),
  single({ token: 'cepsa', label: 'Cash EPS Annual', metric: 'cash_eps', unit: 'INR_PER_SHARE', tier: 'T2', ...ANNUAL_FLOW }),
  single({ token: 'dividendpersharea', label: 'Dividend Per Share Annual', metric: 'dividend_per_share',
    unit: 'INR_PER_SHARE', tier: 'T2', ...ANNUAL_FLOW }),
  // Dividend payout scale: the TTM token is already percent; the annual NP token is a fraction.
  single({ token: 'dividendpayout', label: 'Dividend payout ratio TTM %', metric: 'dividend_payout_pct', unit: 'PCT', ...TTM }),
  single({ token: 'dividendpayoutnpa', label: 'Dividend Payout to NP Annual', metric: 'dividend_payout_pct', unit: 'PCT',
    ...ANNUAL_FLOW, scale: 100, notes: 'Provider value is a fraction (0.07 = 7%); scaled by 100' }),
  single({ token: 'opma', label: 'Operting Profit Margin Annual %', metric: 'operating_margin_pct', unit: 'PCT', tier: 'T2',
    ...ANNUAL_FLOW, aliases: ['OPM Ann. %', 'Operating Profit Margin Annual %'] }),
  single({ token: 'opmpctq', label: 'Operating Profit Margin Qtr %', metric: 'operating_margin_pct', unit: 'PCT', tier: 'T2',
    ...QUARTER_FLOW }),
  single({ token: 'cfoagrowth', label: 'Operating Cash Flow YoY Growth %', metric: null, unit: 'PCT', tier: 'T2', ...ANNUAL_FLOW }),
  // Ownership levels, anchored to the shareholding quarter (never to the results quarter).
  single({ token: 'prompct', label: 'Promoter holding latest %', metric: 'promoter_pct', unit: 'PCT', ...SH }),
  single({ token: 'prompledge', label: 'Promoter holding pledge percentage % Qtr', metric: 'promoter_pledge_pct_of_promoter',
    unit: 'PCT', ...SH, verification: 'SEMANTICS_UNVERIFIED',
    notes: 'Confirm that the provider reports pledge as a percentage of promoter holding, not of total shares' }),
  single({ token: 'fiihold', label: 'FII holding current Qtr %', metric: 'fii_pct', unit: 'PCT', ...SH }),
  single({ token: 'instihold', label: 'Institutional holding current Qtr %', metric: 'institutional_pct', unit: 'PCT', ...SH,
    notes: 'Institutional aggregate; not relabelled as DII' }),
  single({ token: 'mfhold', label: 'MF holding current Qtr %', metric: 'mutual_funds_pct', unit: 'PCT', ...SH }),
  single({ token: 'pubpct', label: 'Public holding current Qtr %', metric: 'public_pct', unit: 'PCT', ...SH }),
  // Ownership change series: catalogued, not emitted (derive changes from dated levels).
  ...['prompct1q', 'prompct4q', 'prompct8q', 'prompledge1q', 'fiipct1q', 'fiipct4q', 'fiipct8q', 'mfpct1q', 'mfpct8q',
    'instipct1q', 'pubpct1q', 'pubpct8q'].map(token => single({
    token, label: token, metric: null, unit: 'PCT', tier: 'T2', ...SH, notes: 'Change series; derived from dated levels',
  })),
  single({ token: 'wcq', label: 'Working Capital Quarter', metric: null, unit: 'INR_CR', tier: 'T2', periodType: 'POINT_IN_TIME',
    anchor: 'RESULT_QUARTER' }),
];

/** All explicit token mappings (series expanded). */
export const TOKEN_MAPPINGS: readonly TokenMapping[] = [...SERIES.flatMap(expandSeries), ...RATIOS, ...SINGLES];

const BY_TOKEN = new Map(TOKEN_MAPPINGS.map(m => [m.token, m]));
if (BY_TOKEN.size !== TOKEN_MAPPINGS.length) throw new Error('TOKEN_MAPPINGS contains duplicate tokens');

/** Mapping for a token, if any. */
export function mappingFor(token: string): TokenMapping | undefined {
  return BY_TOKEN.get(token);
}

/** Tokens that are proprietary scores/recommendations, excluded from analysis. */
const PROPRIETARY = /\b(dvm|durability|reco(mmendation)?|target price|piotroski|score|rank)\b/i;
const TECHNICAL = /\b(rsi|sma|ema|macd|dma|atr|delivery|volume|vol|high|low|close|change %|prev day|two day|52w|half yr|beta|pivot|support|resistance)\b/i;

/** Tier and reason for a catalogue token without an explicit mapping, from its label. */
export function classifyUnmapped(token: string, label: string): { tier: Tier; notes: string } {
  const text = `${token} ${label}`;
  if (PROPRIETARY.test(text)) return { tier: 'SKIP', notes: 'Provider proprietary score or recommendation (excluded)' };
  if (TECHNICAL.test(label)) return { tier: 'SKIP', notes: 'Out of scope: technical/price-action (fundamental analysis only)' };
  return { tier: 'T3', notes: 'Discovered, not mapped to a canonical metric' };
}

/** Unit inferred from a catalogue label (unmapped tokens only). UNKNOWN when the label gives no hint. */
export function inferUnit(label: string): { unit: string; moneyInCrore: boolean } {
  if (/%/.test(label)) return { unit: 'PCT', moneyInCrore: false };
  if (/\b(ratio|to equity|pe |peg|price to)\b/i.test(label)) return { unit: 'RATIO', moneyInCrore: false };
  if (/\bper share|eps\b/i.test(label)) return { unit: 'INR_PER_SHARE', moneyInCrore: false };
  if (/\b(annual|qtr|quarter|ttm|ago)\b/i.test(label)) return { unit: 'INR_CR', moneyInCrore: true };
  return { unit: 'UNKNOWN', moneyInCrore: false };
}
