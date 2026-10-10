/** How a metric behaves over time: FLOW accrues over a period, POINT_IN_TIME is a balance at a date. */
export type PeriodBasis = 'FLOW' | 'POINT_IN_TIME' | 'RATIO';

export interface MetricDefinition {
  metric: string;
  definition: string;
  unit: string;
  periodBasis: PeriodBasis;
  aliases: string[];
  /** When true a negative filed value is unusual: it is kept but flagged SIGN_UNUSUAL. */
  nonNegative?: boolean;
}

interface Options { aliases?: string[]; nonNegative?: boolean }

const flow = (metric: string, definition: string, options: Options = {}): MetricDefinition => ({
  metric, definition, unit: 'INR_CR', periodBasis: 'FLOW', aliases: options.aliases ?? [],
  nonNegative: options.nonNegative,
});
const balance = (metric: string, definition: string, options: Options = {}): MetricDefinition => ({
  metric, definition, unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: options.aliases ?? [],
  nonNegative: options.nonNegative,
});
const percent = (metric: string, definition: string, aliases: string[]): MetricDefinition => ({
  metric, definition, unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases,
});

/** Canonical metrics the research program uses. Money is INR crore; ownership is percent. */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  flow('revenue_from_operations', 'Revenue from operations excluding other income',
    { aliases: ['revenue', 'revenue_cr'], nonNegative: true }),
  flow('other_income', 'Other income reported for the same period', { aliases: ['other_income_cr'] }),
  flow('total_income', 'Revenue from operations plus other income',
    { aliases: ['total_revenue', 'total_rev', 'total rev', 'total rev.'] }),
  flow('materials_cost', 'Cost of materials consumed', { nonNegative: true }),
  flow('total_expenses', 'Total expenses (total income minus PBT before exceptional items)',
    { nonNegative: true }),
  flow('pbt_before_exceptional', 'Profit before tax before exceptional items',
    { aliases: ['pbt_before_exceptional_cr'] }),
  flow('exceptional_items', 'Exceptional items; positive is a gain', { aliases: ['exceptional'] }),
  flow('pbt', 'Profit before tax (after exceptional items)'),
  flow('tax_expense', 'Tax expense for the period', { aliases: ['tax'] }),
  flow('pat_total', 'Profit after tax total (including non-controlling interests)', { aliases: ['pat_cr'] }),
  flow('pat_attributable_to_owners', 'PAT attributable to owners of the parent',
    { aliases: ['pat_attributable'] }),
  flow('finance_cost', 'Finance costs', { aliases: ['interest'], nonNegative: true }),
  flow('depreciation_amortisation', 'Depreciation and amortisation', { nonNegative: true }),
  flow('ebitda_derived',
    'PBT before exceptional + finance cost + depreciation/amortisation - other income', { aliases: ['ebitda'] }),
  flow('cfo', 'Net cash flow from operating activities (after income taxes paid)',
    { aliases: ['cfo_cr', 'cash_flow_from_operating_activities'] }),
  flow('capex_cash_outflow', 'Capital expenditure cash outflow (positive = cash spent)',
    { aliases: ['capex', 'capital_expenditure'], nonNegative: true }),
  balance('lease_liabilities', 'Lease liabilities at period end', { aliases: ['lease_liability'] }),
  balance('trade_payables', 'Trade payables at period end', { aliases: ['payables'] }),
  balance('total_assets', 'Total assets at period end', { aliases: ['assets'] }),
  balance('equity_capital', 'Paid-up equity capital', { aliases: ['paid_up_capital'], nonNegative: true }),
  balance('reserves', 'Reserves and surplus excluding revaluation reserves', { aliases: ['reserves_surplus'] }),
  balance('equity_total', 'Total equity at period end', { aliases: ['equity'] }),
  balance('borrowings_total', 'Total borrowings at period end', { aliases: ['debt', 'total_debt'] }),
  balance('cash_and_equivalents', 'Cash and cash equivalents at period end', { aliases: ['cash'] }),
  balance('trade_receivables', 'Trade receivables at period end', { aliases: ['receivables'] }),
  balance('inventory', 'Inventory at period end', { aliases: ['inventories'] }),
  percent('promoter_pct', 'Promoter holding percentage', ['promoter_holding']),
  percent('promoter_pledge_pct_of_promoter', 'Pledged percentage of promoter holding', ['promoter_pledge']),
  percent('fii_pct', 'Foreign institutional ownership percentage', ['fiipct']),
  percent('dii_other_pct', 'Domestic institutional ownership excluding mutual funds', ['diipct']),
  percent('mutual_funds_pct', 'Mutual fund ownership percentage', ['mfhold']),
  percent('public_pct', 'Public ownership percentage', ['pubpct']),
];

/** One raw verified_xbrl_fact.metric name mapped to a canonical metric, with how it was verified. */
export interface RawMetricMapping { raw: string; canonical: string; evidence: string }

const YUKEN = 'YUKEN FY26 (FourD, 2026-03-31, CONSOLIDATED)';
const TATATECH = 'TATATECH FY26';

/**
 * Raw -> canonical mapping for the FERE verified_xbrl_fact table. Verified read-only on 2026-10-10 against
 * the real table (taxonomy_field column) for YUKEN and TATATECH. Anything not listed is out of scope and
 * is reported in the rejection report, never silently accepted.
 */
export const RAW_METRIC_MAP: readonly RawMetricMapping[] = [
  {
    raw: 'sales', canonical: 'revenue_from_operations',
    evidence: `taxonomy RevenueFromOperations. ${YUKEN} 462.17 Cr vs xbrl_income 466.18 Cr; ${TATATECH} 5505.57.`,
  },
  {
    raw: 'xbrl_income', canonical: 'total_income',
    evidence: `taxonomy Income = revenue + other income. ${YUKEN} 466.18 = 462.17 + 4.01; ${TATATECH} `
      + '5680.12 = 5505.57 + 174.55.',
  },
  {
    raw: 'xbrl_other_income', canonical: 'other_income',
    evidence: `taxonomy OtherIncome. ${YUKEN} 4.01 Cr; ${TATATECH} 174.55 Cr.`,
  },
  {
    raw: 'materials_cost', canonical: 'materials_cost',
    evidence: `taxonomy CostOfMaterialsConsumed. ${YUKEN} 196.64 Cr; ${TATATECH} 0.00 (services company).`,
  },
  {
    raw: 'total_expenses', canonical: 'total_expenses',
    evidence: `taxonomy Expenses. ${YUKEN} 466.18 - 443.75 = 22.43 = PBT before exceptional; ${TATATECH} `
      + '5680.12 - 4831.69 = 848.43.',
  },
  {
    raw: 'xbrl_profit_before_exceptional_items_and_tax', canonical: 'pbt_before_exceptional',
    evidence: `taxonomy ProfitBeforeExceptionalItemsAndTax. ${TATATECH} 848.43 Cr; ${YUKEN} 22.43 Cr.`,
  },
  {
    raw: 'xbrl_exceptional_items_before_tax', canonical: 'exceptional_items',
    evidence: `taxonomy ExceptionalItemsBeforeTax; positive = gain. ${TATATECH} -107.73: 848.43 - 107.73 `
      + '= 740.70 = pbt.',
  },
  {
    raw: 'pbt', canonical: 'pbt',
    evidence: `taxonomy ProfitBeforeTax, after exceptional items. ${TATATECH} 740.70 Cr; ${YUKEN} 22.43 Cr.`,
  },
  {
    raw: 'xbrl_tax_expense', canonical: 'tax_expense',
    evidence: `taxonomy TaxExpense. ${TATATECH} 740.70 - 218.13 = 522.57 = profit from continuing operations.`,
  },
  {
    raw: 'pat', canonical: 'pat_total',
    evidence: `taxonomy ProfitLossForPeriod (total, includes non-controlling interest). ${YUKEN} 14.39 vs `
      + `owners 14.47; ${TATATECH} 546.59.`,
  },
  {
    raw: 'xbrl_profit_or_loss_attributable_to_owners_of_parent', canonical: 'pat_attributable_to_owners',
    evidence: `taxonomy ProfitOrLossAttributableToOwnersOfParent. ${YUKEN} 14.47 Cr; ${TATATECH} 546.59 Cr.`,
  },
  {
    raw: 'finance_costs', canonical: 'finance_cost',
    evidence: `taxonomy FinanceCosts. ${TATATECH} 34.12 Cr; ${YUKEN} 10.76 Cr.`,
  },
  {
    raw: 'depreciation', canonical: 'depreciation_amortisation',
    evidence: `taxonomy DepreciationDepletionAndAmortisationExpense. ${TATATECH} 144.95 Cr; ${YUKEN} 21.34 Cr.`,
  },
  {
    raw: 'cfo', canonical: 'cfo',
    evidence: `taxonomy CashFlowsFromUsedInOperatingActivities (net of tax). ${TATATECH} 775.70 = 953.69 `
      + '(CashFlowsFromUsedInOperations) - 177.99 (income taxes paid). Raw OneD rows are all six-month '
      + 'spans and are rejected by the duration guard.',
  },
  {
    raw: 'xbrl_purchase_of_property_plant_and_equipment_classified_as_investing_activities',
    canonical: 'capex_cash_outflow',
    evidence: 'taxonomy PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities, filed positive '
      + `as an outflow. ${YUKEN} 83.03 Cr; ${TATATECH} 33.59 Cr.`,
  },
  {
    raw: 'equity_capital', canonical: 'equity_capital',
    evidence: `taxonomy PaidUpValueOfEquityShareCapital. ${YUKEN} 13.58 Cr; ${TATATECH} 81.20 Cr. 355 raw `
      + 'rows exceed 1e12 INR: a known scale defect, caught by the magnitude guard.',
  },
  {
    raw: 'xbrl_reserve_excluding_revaluation_reserves', canonical: 'reserves',
    evidence: `taxonomy ReserveExcludingRevaluationReserves. ${YUKEN} 359.54 Cr; ${TATATECH} 3842.17 Cr. `
      + '44 rows carry unit "pure" and are rejected as UNIT_UNSUPPORTED.',
  },
];

/**
 * Canonical metrics the program needs for which the raw table holds NO balance-sheet line (checked on
 * 2026-10-10 by listing every distinct raw metric: only cash-flow adjustment lines match these words).
 * They must come from provider data; the XBRL path never invents them.
 */
export const RAW_METRICS_ABSENT: readonly string[] = [
  'borrowings_total', 'trade_receivables', 'inventory', 'trade_payables', 'total_assets', 'lease_liabilities',
];

const normalizeName = (metric: string): string => metric.trim().toLowerCase().replace(/\s+/g, ' ');

const NAME_TO_CANONICAL = new Map<string, string>([
  ...METRIC_DEFINITIONS.flatMap(d => d.aliases.map(alias => [alias, d.metric] as [string, string])),
  ...RAW_METRIC_MAP.map(m => [m.raw, m.canonical] as [string, string]),
]);

/** Maps a raw or alias name to its canonical metric name; unknown names are returned lower-cased. */
export function canonicalMetric(metric: string): string {
  const name = normalizeName(metric);
  return NAME_TO_CANONICAL.get(name) ?? name;
}

/** Returns the definition for a raw/alias/canonical name, or undefined when the metric is out of scope. */
export function metricDefinition(metric: string): MetricDefinition | undefined {
  const canonical = canonicalMetric(metric);
  return METRIC_DEFINITIONS.find(d => d.metric === canonical);
}
