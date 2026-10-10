export interface MetricDefinition { metric: string; definition: string; unit: string; periodBasis: 'FLOW' | 'POINT_IN_TIME' | 'RATIO'; aliases: string[]; }

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { metric: 'revenue_from_operations', definition: 'Revenue from operations excluding other income', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['revenue', 'revenue_cr', 'sales'] },
  { metric: 'other_income', definition: 'Other income reported for the same period', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['other_income_cr'] },
  { metric: 'total_income', definition: 'Revenue from operations plus other income', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['total_revenue', 'total_rev', 'total rev', 'total rev.'] },
  { metric: 'pbt_before_exceptional', definition: 'Profit before tax before exceptional items', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['pbt_before_exceptional_cr'] },
  { metric: 'exceptional_items', definition: 'Exceptional items; positive is a gain', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['exceptional'] },
  { metric: 'pbt', definition: 'Profit before tax', unit: 'INR_CR', periodBasis: 'FLOW', aliases: [] },
  { metric: 'tax_expense', definition: 'Tax expense for the period', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['tax'] },
  { metric: 'pat_total', definition: 'Profit after tax total', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['pat', 'pat_cr'] },
  { metric: 'pat_attributable_to_owners', definition: 'PAT attributable to owners', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['pat_attributable'] },
  { metric: 'finance_cost', definition: 'Finance costs', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['interest'] },
  { metric: 'depreciation_amortisation', definition: 'Depreciation and amortisation', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['depreciation'] },
  { metric: 'ebitda_derived', definition: 'PBT before exceptional + finance cost + depreciation/amortisation − other income', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['ebitda'] },
  { metric: 'cfo', definition: 'Cash flow from operations', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['cfo_cr', 'cash_flow_from_operating_activities'] },
  { metric: 'capex_cash_outflow', definition: 'Capital expenditure cash outflow', unit: 'INR_CR', periodBasis: 'FLOW', aliases: ['capex', 'capital_expenditure'] },
  { metric: 'lease_liabilities', definition: 'Lease liabilities at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['lease_liability'] },
  { metric: 'trade_payables', definition: 'Trade payables at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['payables'] },
  { metric: 'total_assets', definition: 'Total assets at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['assets'] },
  { metric: 'equity_capital', definition: 'Paid-up equity capital', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['paid_up_capital'] },
  { metric: 'reserves', definition: 'Reserves and surplus', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['reserves_surplus'] },
  { metric: 'equity_total', definition: 'Total equity at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['equity'] },
  { metric: 'borrowings_total', definition: 'Total borrowings at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['debt', 'total_debt'] },
  { metric: 'cash_and_equivalents', definition: 'Cash and cash equivalents at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['cash'] },
  { metric: 'trade_receivables', definition: 'Trade receivables at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['receivables'] },
  { metric: 'inventory', definition: 'Inventory at period end', unit: 'INR_CR', periodBasis: 'POINT_IN_TIME', aliases: ['inventories'] },
  { metric: 'promoter_pct', definition: 'Promoter holding percentage', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['promoter_holding'] },
  { metric: 'promoter_pledge_pct_of_promoter', definition: 'Pledged percentage of promoter holding', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['promoter_pledge'] },
  { metric: 'fii_pct', definition: 'Foreign institutional ownership percentage', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['fiipct'] },
  { metric: 'dii_other_pct', definition: 'Domestic institutional ownership percentage excluding mutual funds', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['diipct'] },
  { metric: 'mutual_funds_pct', definition: 'Mutual fund ownership percentage', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['mfhold'] },
  { metric: 'public_pct', definition: 'Public ownership percentage', unit: 'PCT', periodBasis: 'POINT_IN_TIME', aliases: ['pubpct'] },
];

const ALIASES = new Map(METRIC_DEFINITIONS.flatMap(d => d.aliases.map(alias => [alias, d.metric] as const)));
export function canonicalMetric(metric: string): string { return ALIASES.get(metric.trim().toLowerCase().replace(/\s+/g, ' ')) || metric.trim().toLowerCase(); }
export function metricDefinition(metric: string): MetricDefinition | undefined { const key = canonicalMetric(metric); return METRIC_DEFINITIONS.find(d => d.metric === key); }
