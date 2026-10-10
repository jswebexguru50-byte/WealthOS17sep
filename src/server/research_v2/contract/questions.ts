import type { AppliesIn, Premise, QuestionContract, SourceNeed, SubQuestion } from '../domain/contract.js';

/** Reason recorded for every sub-question of an out-of-scope question. */
export const OUT_OF_SCOPE_REASON = 'Out of scope: fundamental analysis only (deferred)';

/** Question numbers deferred by the owner (technical, price-action and liquidity analysis). */
const OUT_OF_SCOPE_QUESTIONS: ReadonlySet<number> = new Set([1, 28, 29]);

/** Shorthand source-need groups used by the table below. */
type SourceGroup = 'STATUTORY' | 'PROVIDER' | 'DOCUMENTS' | 'SHAREHOLDING' | 'WEB_PRIMARY';

const SOURCE_GROUPS: Record<SourceGroup, SourceNeed[]> = {
  STATUTORY: ['XBRL_FACTS'],
  PROVIDER: ['PROVIDER_FUNDAMENTALS'],
  DOCUMENTS: ['FILING_DOCUMENT', 'ANNUAL_REPORT', 'CONCALL'],
  SHAREHOLDING: ['SHAREHOLDING'],
  // MCA, NCLT, court, SEBI and rating-agency records (spec section 6.1 source ladder).
  WEB_PRIMARY: ['WEB_PRIMARY'],
};

/** Compact row spec for a sub-question; letter and parent are added by the builder. */
interface SubSpec {
  text: string;
  metrics: string[];
  calcs: string[];
  sources: SourceGroup[];
  premise?: Premise;
}

interface QuestionSpec {
  id: number;
  topic: string;
  question: string;
  premise?: Premise;
  subs: SubSpec[];
}

/**
 * Builds a compact sub-question spec.
 * @param text sub-question wording
 * @param sources source groups the gap planner may request
 * @param metrics metrics that must exist before the sub-question can be READY
 * @param calcs calculator ids the sub-question names
 */
const S = (text: string, sources: SourceGroup[], metrics: string[] = [], calcs: string[] = []): SubSpec => ({
  text,
  sources,
  metrics,
  calcs,
});

const FLOW_PNL = ['revenue_from_operations', 'pbt_before_exceptional', 'pat_total'];
// materials_cost is the cost-of-goods proxy for DIO, DPO and gross margin (no purchases metric exists).
const WC_METRICS = [
  'trade_receivables', 'inventory', 'trade_payables', 'revenue_from_operations', 'materials_cost',
];
const RETURN_INPUTS = [
  'pbt_before_exceptional', 'finance_cost', 'equity_total', 'borrowings_total', 'pat_total',
];
const QTR_PNL = ['revenue_from_operations', 'ebitda_derived', 'pat_total'];
const MULTIPLE_INPUTS = [
  'pat_total', 'equity_total', 'ebitda_derived', 'borrowings_total', 'cash_and_equivalents',
];
const MARGIN_RETURN_INPUTS = [
  ...FLOW_PNL, 'ebitda_derived', 'finance_cost', 'equity_total', 'borrowings_total',
];

const ORDER_BOOK_PREMISE: Premise = { test: 'has_order_book', ifFalse: 'ANSWER_UNDERLYING_QUESTION' };

const SPECS: QuestionSpec[] = [
  {
    id: 1,
    topic: 'Short-Term Market Drivers',
    question: 'What factors are driving the recent short-term price move?',
    premise: { test: 'price_direction_is_bullish', ifFalse: 'ANSWER_UNDERLYING_QUESTION' },
    subs: [
      S('1/5/20-day returns and returns versus sector and index', ['PROVIDER'], [], ['return_1d_5d_20d']),
      S('Volume and delivery abnormality', ['PROVIDER'], [], ['volume_and_delivery_abnormality']),
      S('Announcements, results, orders, deals and insider activity with timestamps', ['DOCUMENTS', 'SHAREHOLDING']),
      S('News and sentiment', ['PROVIDER', 'DOCUMENTS']),
      S('Is the premise (price direction) correct?', ['PROVIDER']),
    ],
  },
  {
    id: 2,
    topic: 'Core Product Utility',
    question:
      'What core products/services drive the majority of revenue (and of the order book, where one '
      + 'is reported) and what problem do they solve?',
    premise: ORDER_BOOK_PREMISE,
    subs: [
      S('Products and services and segment mix', ['DOCUMENTS', 'STATUTORY']),
      S('Use cases and the customer problem solved', ['DOCUMENTS']),
      S('Geography of operations and sales', ['DOCUMENTS', 'STATUTORY']),
      S('Installed capacity and utilisation', ['DOCUMENTS']),
      { ...S('Order-book composition, if reported', ['DOCUMENTS']), premise: ORDER_BOOK_PREMISE },
    ],
  },
  {
    id: 3,
    topic: 'Core Strengths & Competitive Advantage',
    question: 'What are the fundamental prospects, primary strengths and sustainable competitive advantages?',
    subs: [
      S('Moat evidence: IP, certifications, switching costs, cost position, distribution, share', ['DOCUMENTS']),
      S(
        'Margin and return evidence versus peers',
        ['STATUTORY', 'PROVIDER'],
        MARGIN_RETURN_INPUTS,
        ['ebitda_margin', 'roce', 'roe'],
      ),
      S('Sustainability of the advantage and what could erode it', ['DOCUMENTS']),
      S('Peer comparison (allowed here)', ['PROVIDER', 'STATUTORY'], FLOW_PNL, ['peer_margin_return_table']),
    ],
  },
  {
    id: 4,
    topic: 'Customer Concentration Risk',
    question: 'Who are the major customers and how concentrated is revenue or the order book?',
    premise: ORDER_BOOK_PREMISE,
    subs: [
      S('Named top customers', ['DOCUMENTS']),
      S('Revenue or order-book share with exact excerpt, period and denominator; top-1 and top-5', ['DOCUMENTS']),
      S('Contract duration and renewal risk', ['DOCUMENTS']),
      { ...S('Premise check: does an order book exist?', ['DOCUMENTS']), premise: ORDER_BOOK_PREMISE },
    ],
  },
  {
    id: 5,
    topic: 'Supplier & Vendor Concentration',
    question: 'How concentrated is the supplier base and can raw-material cost increases be passed through?',
    subs: [
      S('Major suppliers and single-source inputs', ['DOCUMENTS']),
      S('Import and commodity exposure', ['DOCUMENTS', 'STATUTORY']),
      S('Contractual pass-through evidence', ['DOCUMENTS']),
      S(
        'Margin behaviour when input costs moved',
        ['STATUTORY'],
        ['revenue_from_operations', 'inventory', 'ebitda_derived', 'materials_cost'],
        ['ebitda_margin'],
      ),
    ],
  },
  {
    id: 6,
    topic: 'Total Addressable Market',
    question: 'Is future growth constrained by overall market size or an industry ceiling?',
    subs: [
      S('Served market and geography', ['DOCUMENTS']),
      S('Industry growth and source methodology', ['DOCUMENTS']),
      S('Company share and penetration', ['DOCUMENTS', 'STATUTORY'], ['revenue_from_operations']),
      S('Headroom versus capacity', ['DOCUMENTS']),
    ],
  },
  {
    id: 7,
    topic: 'Reinvestment Runway',
    question: 'What is the scope for reinvesting surplus operating cash flow into the core business?',
    subs: [
      S('CFO and FCF history', ['STATUTORY'], ['cfo', 'capex_cash_outflow', 'pat_total'], ['fcf', 'cfo_to_pat']),
      S(
        'Maintenance versus growth capex',
        ['STATUTORY', 'DOCUMENTS'],
        ['capex_cash_outflow', 'depreciation_amortisation'],
      ),
      S('Announced projects, utilisation and funding', ['DOCUMENTS']),
      S('Incremental margins and returns', ['STATUTORY'], FLOW_PNL, ['reinvestment_rate', 'incremental_roic']),
    ],
  },
  {
    id: 8,
    topic: 'Capital Allocation Efficiency',
    question: 'Can the company consistently deploy incremental capital at high returns?',
    subs: [
      S('ROIC, ROCE and ROE history', ['STATUTORY'], RETURN_INPUTS, ['roic', 'roce', 'roe']),
      S(
        'Incremental ROIC and reinvestment rate',
        ['STATUTORY'],
        ['cfo', 'capex_cash_outflow'],
        ['incremental_roic', 'reinvestment_rate'],
      ),
      S('Returns versus cost of capital', ['STATUTORY', 'PROVIDER'], [], ['roic_vs_wacc']),
      S('Performance of acquisitions', ['DOCUMENTS']),
    ],
  },
  {
    id: 9,
    topic: 'Overall Outlook & Catalysts',
    question: 'What is the business outlook, financial health, upcoming growth catalysts and competitive positioning?',
    subs: [
      S('Management guidance and outlook', ['DOCUMENTS']),
      S(
        'Balance-sheet condition',
        ['STATUTORY'],
        ['borrowings_total', 'cash_and_equivalents', 'equity_total', 'ebitda_derived'],
        ['net_debt_to_ebitda'],
      ),
      S('Dated catalysts', ['DOCUMENTS', 'PROVIDER']),
      S('Constraints on growth', ['DOCUMENTS']),
      S('Bull, base and bear framing from verified drivers', ['STATUTORY', 'DOCUMENTS']),
    ],
  },
  {
    id: 10,
    topic: 'Revenue Growth Quality',
    question: 'Is revenue expansion real, consistent and broad-based?',
    subs: [
      S(
        'Annual and 8-quarter revenue history',
        ['STATUTORY'],
        ['revenue_from_operations'],
        ['revenue_cagr_3y', 'revenue_cagr_5y', 'quarterly_growth'],
      ),
      S('Organic versus inorganic growth', ['DOCUMENTS']),
      S('Volume, price and mix', ['DOCUMENTS']),
      S('Breadth by segment and geography', ['DOCUMENTS', 'STATUTORY']),
      S(
        'Receivable quality',
        ['STATUTORY'],
        ['trade_receivables', 'revenue_from_operations'],
        ['receivables_vs_revenue', 'dso'],
      ),
    ],
  },
  {
    id: 11,
    topic: 'Segment Revenue Drivers',
    question: 'Which products or segments are leading the top-line recovery?',
    subs: [
      S('Segment revenue and growth', ['STATUTORY', 'DOCUMENTS'], ['revenue_from_operations'], ['segment_growth']),
      S('Segment margin', ['STATUTORY', 'DOCUMENTS'], [], ['segment_margin']),
      S('Segment order book and capacity', ['DOCUMENTS']),
      S('Which segments lead and why', ['DOCUMENTS', 'STATUTORY']),
    ],
  },
  {
    id: 12,
    topic: 'Sequential Bottoming Trends',
    question: 'Do quarterly revenue trends indicate that an operational bottom has formed?',
    subs: [
      S('8-quarter revenue, EBITDA and PAT', ['STATUTORY'], QTR_PNL, ['quarterly_growth']),
      S('Year-on-year and sequential inflection tests', ['STATUTORY'], QTR_PNL, ['inflection_tests']),
      S('Working-capital indicators', ['STATUTORY'], WC_METRICS, ['dso', 'dio', 'dpo']),
      S('Conclusion anchored to quarter-end dates', ['STATUTORY'], ['revenue_from_operations', 'pat_total']),
    ],
  },
  {
    id: 13,
    topic: 'Margin Trajectory',
    question: 'Are gross and operating margins expanding or under pressure?',
    subs: [
      S(
        'Gross, EBITDA, operating and PAT margins over 8 quarters and 5 years',
        ['STATUTORY'],
        [...QTR_PNL, 'materials_cost'],
        ['ebitda_margin', 'pat_margin', 'gross_margin'],
      ),
      S('Drivers: input cost, mix, operating leverage', ['DOCUMENTS', 'STATUTORY']),
      S(
        'Direction of margins and pressure points',
        ['STATUTORY'],
        ['ebitda_derived', 'revenue_from_operations'],
        ['ebitda_margin'],
      ),
    ],
  },
  {
    id: 14,
    topic: 'Quality of Earnings (One-offs)',
    question: 'Are profits affected by exceptional gains or driven by core operations?',
    subs: [
      S('Exceptional items and other income by period', ['STATUTORY'], ['exceptional_items', 'other_income']),
      S(
        'Direction of effect on PBT',
        ['STATUTORY', 'DOCUMENTS'],
        ['exceptional_items', 'pbt', 'pbt_before_exceptional'],
      ),
      S(
        'Reported to normalised PAT bridge',
        ['STATUTORY'],
        ['pat_total', 'exceptional_items', 'tax_expense'],
        ['normalised_pat_bridge'],
      ),
      S(
        'Core versus non-core share of profit',
        ['STATUTORY'],
        ['other_income', 'pbt_before_exceptional'],
        ['non_core_share'],
      ),
    ],
  },
  {
    id: 15,
    topic: 'Cash Flow vs. Profitability Gap',
    question: 'Is the company generating real cash flow and is there a structural PAT-CFO gap?',
    subs: [
      S('CFO to PAT by year and rolling', ['STATUTORY'], ['cfo', 'pat_total'], ['cfo_to_pat']),
      S('Accruals', ['STATUTORY'], ['cfo', 'pat_total', 'total_assets'], ['accrual_ratio']),
      S(
        'Receivable and inventory growth',
        ['STATUTORY'],
        ['trade_receivables', 'inventory'],
        ['working_capital_drag'],
      ),
      S('Structural versus timing gap', ['STATUTORY', 'DOCUMENTS'], ['cfo', 'pat_total']),
      S('Free cash flow', ['STATUTORY'], ['cfo', 'capex_cash_outflow'], ['fcf']),
    ],
  },
  {
    id: 16,
    topic: 'Capital Deployment & Utilization',
    question: 'Is ROCE attractive and how is spare operating cash deployed?',
    subs: [
      S('ROCE bridge', ['STATUTORY'], ['pbt_before_exceptional', 'finance_cost', 'total_assets'], ['roce']),
      S(
        'Capex, acquisitions, debt repayment, dividends and buybacks',
        ['STATUTORY', 'DOCUMENTS'],
        ['capex_cash_outflow'],
        ['uses_of_cash_bridge'],
      ),
      S('Cash accumulation', ['STATUTORY'], ['cash_and_equivalents']),
      S('Uses-of-cash table', ['STATUTORY'], ['cfo', 'capex_cash_outflow'], ['uses_of_cash_bridge']),
    ],
  },
  {
    id: 17,
    topic: 'Relative Valuation Multiples',
    question: 'How do valuation multiples compare with direct peers?',
    subs: [
      S(
        'Current and historical P/E, P/B, EV/EBITDA, PEG and FCF yield',
        ['PROVIDER', 'STATUTORY'],
        MULTIPLE_INPUTS,
        ['pe', 'pb', 'ev_ebitda', 'peg', 'fcf_yield'],
      ),
      S('Direct peers (allowed here)', ['PROVIDER'], [], ['peer_multiple_table']),
      S('Growth and return-normalised comparison', ['PROVIDER', 'STATUTORY'], FLOW_PNL, ['peer_multiple_table']),
      S('Reverse-DCF assumptions', ['PROVIDER', 'STATUTORY'], ['cfo', 'capex_cash_outflow'], ['reverse_dcf']),
      S(
        'Percentile versus own history, only from a dated multiple series',
        ['PROVIDER'],
        [],
        ['historical_valuation_percentile'],
      ),
    ],
  },
  {
    id: 18,
    topic: 'Management & Legal Verification',
    question: 'What is the promoter/management track record and are there active legal disputes?',
    subs: [
      S('Promoter and director background and track record', ['DOCUMENTS']),
      S('Prior entities, resignations, disqualifications', ['DOCUMENTS', 'WEB_PRIMARY']),
      S('Enforcement and litigation', ['DOCUMENTS', 'PROVIDER', 'WEB_PRIMARY']),
      S('Active disputes and exposure', ['DOCUMENTS', 'WEB_PRIMARY']),
    ],
  },
  {
    id: 19,
    topic: 'Governance History',
    question: 'Have there been governance issues, accounting red flags or integrity concerns?',
    subs: [
      S('Audit qualifications, restatements and auditor changes', ['DOCUMENTS']),
      S('Regulatory actions', ['DOCUMENTS', 'PROVIDER', 'WEB_PRIMARY']),
      S('Promoter pledges', ['SHAREHOLDING'], ['promoter_pledge_pct_of_promoter']),
      S('Related-party transaction concerns', ['DOCUMENTS'], [], ['rpt_materiality']),
      S('Capital-allocation failures and anomalies', ['STATUTORY', 'DOCUMENTS']),
    ],
  },
  {
    id: 20,
    topic: 'Promoter Holding Trends',
    question: 'How has promoter holding evolved and have insiders been buying?',
    subs: [
      S(
        'Promoter, FII, DII, MF and public holding by quarter',
        ['SHAREHOLDING'],
        ['promoter_pct', 'fii_pct', 'dii_other_pct', 'mutual_funds_pct', 'public_pct'],
      ),
      S('Pledge trend', ['SHAREHOLDING'], ['promoter_pledge_pct_of_promoter']),
      S('Insider and SAST trades', ['SHAREHOLDING', 'PROVIDER']),
      S('Bulk and block deals', ['PROVIDER']),
      S('Holder-level changes', ['SHAREHOLDING'], [], ['holder_level_qoq_diff']),
    ],
  },
  {
    id: 21,
    topic: 'Audits, Quality & Board Independence',
    question: 'Who is the statutory auditor and is oversight provided by qualified independent directors?',
    subs: [
      S('Auditor name, tenure, fees and qualifications', ['DOCUMENTS']),
      S('Audit committee', ['DOCUMENTS']),
      S('Board composition, independence, attendance and skills', ['DOCUMENTS']),
      S('Remuneration', ['DOCUMENTS']),
    ],
  },
  {
    id: 22,
    topic: 'Business Model Risks',
    question: 'What are the key structural business-model risks?',
    subs: [
      S('Demand and disruption', ['DOCUMENTS']),
      S('Concentration', ['DOCUMENTS']),
      S('Regulation', ['DOCUMENTS']),
      S('Cyclicality', ['DOCUMENTS', 'STATUTORY'], ['revenue_from_operations']),
      S('Currency and input costs', ['DOCUMENTS']),
      S(
        'Execution, leverage and dilution',
        ['DOCUMENTS', 'STATUTORY'],
        ['borrowings_total', 'cash_and_equivalents', 'ebitda_derived', 'equity_capital'],
        ['net_debt_to_ebitda'],
      ),
    ],
  },
  {
    id: 23,
    topic: 'Critical Risk Watchlist',
    question: 'Which fundamental variables belong on the critical monitoring watchlist?',
    subs: [
      S(
        'Monitored fundamental variables with deterministic thresholds from the verified baseline',
        ['STATUTORY'],
        [],
        ['watchlist_thresholds'],
      ),
      S('Owner source and review frequency per variable', ['STATUTORY', 'DOCUMENTS']),
      S('Trigger actions', ['STATUTORY']),
    ],
  },
  {
    id: 24,
    topic: 'Interest Rate Sensitivity',
    question: 'What is the PAT impact of a 25-bps increase in interest rates?',
    premise: { test: 'floating_rate_debt_disclosed', ifFalse: 'ANSWER_UNDERLYING_QUESTION' },
    subs: [
      // No floating-rate metric exists yet and borrowings_total must never stand in for it (spec: never total
      // debt), so Q24.a and Q24.c rest on the floating_rate_debt_disclosed premise plus document evidence.
      S('Floating-rate debt', ['DOCUMENTS', 'STATUTORY']),
      S('Average borrowing cost', ['STATUTORY'], ['finance_cost', 'borrowings_total'], ['average_borrowing_cost']),
      S('Pre-tax impact of 25 bps', ['DOCUMENTS', 'STATUTORY'], [], ['rate_sensitivity_25bp']),
      S(
        'After-tax impact with evidenced or labelled tax rate',
        ['STATUTORY'],
        ['tax_expense', 'pbt'],
        ['rate_sensitivity_25bp'],
      ),
      S('Refinancing and maturity effects', ['DOCUMENTS']),
    ],
  },
  {
    id: 25,
    topic: 'Working Capital Cycle',
    question: 'What are CCC, inventory days and DSO, and is working capital stretching?',
    subs: [
      S('DSO, DIO, DPO and CCC by aligned period', ['STATUTORY'], WC_METRICS, ['dso', 'dio', 'dpo', 'ccc']),
      S('Trend of the cycle', ['STATUTORY'], WC_METRICS, ['ccc']),
      S('Is it stretching and why', ['STATUTORY', 'DOCUMENTS'], WC_METRICS, ['ccc', 'working_capital_drag']),
    ],
  },
  {
    id: 26,
    topic: 'Balance Sheet Leverage & Coverage',
    question: 'What are net debt/EBITDA and interest coverage?',
    subs: [
      S(
        'Gross debt, cash and leases',
        ['STATUTORY'],
        ['borrowings_total', 'cash_and_equivalents', 'lease_liabilities'],
      ),
      S(
        'Net debt/EBITDA and coverage history',
        ['STATUTORY'],
        ['borrowings_total', 'cash_and_equivalents', 'ebitda_derived', 'finance_cost'],
        ['net_debt_to_ebitda', 'interest_coverage'],
      ),
      S('Maturities and covenants', ['DOCUMENTS']),
    ],
  },
  {
    id: 27,
    topic: 'Related Party Transactions',
    question: 'Are there material transactions with promoter-linked or unlisted affiliates?',
    subs: [
      S('RPT sales, purchases, loans and guarantees by counterparty', ['DOCUMENTS']),
      S('Balances and terms', ['DOCUMENTS']),
      S(
        'Materiality versus revenue, assets and net worth',
        ['DOCUMENTS', 'STATUTORY'],
        ['revenue_from_operations', 'total_assets', 'equity_total'],
        ['rpt_materiality'],
      ),
      S('Change over time', ['DOCUMENTS']),
    ],
  },
  {
    id: 28,
    topic: 'Institutional Liquidity & Trading Volume',
    question: 'What is ADTV and how many days are required to enter or exit a target position?',
    subs: [
      S('ADTV 20/60-day by value and volume', ['PROVIDER'], [], ['adtv_20d_60d']),
      S('Free float', ['SHAREHOLDING'], ['public_pct']),
      S(
        'Days to enter or exit at stated size and participation rate',
        ['PROVIDER'],
        [],
        ['exit_days_at_participation_rate'],
      ),
      S('Market depth where available', ['PROVIDER']),
    ],
  },
  {
    id: 29,
    topic: 'Technical Support Levels',
    question: 'Where are the structural support zones for establishing a long-term position?',
    subs: [
      S('Swing pivots and volume-at-price', ['PROVIDER'], [], ['swing_pivots', 'volume_at_price']),
      S('ATR bands and 20/50/200 averages', ['PROVIDER'], [], ['atr_bands', 'ema_sma_20_50_200']),
      S('52-week levels', ['PROVIDER'], [], ['week52_levels']),
      S('Invalidation level', ['PROVIDER']),
      S('Price date and adjustment basis', ['PROVIDER']),
    ],
  },
];

/** Recursively freezes objects and arrays so the shared contract cannot be mutated. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) deepFreeze(child);
  }
  return value;
}

function buildSubQuestion(spec: SubSpec, question: number, index: number, appliesIn: AppliesIn): SubQuestion {
  const base: SubQuestion = {
    id: `Q${question}.${String.fromCharCode(97 + index)}`,
    question,
    text: spec.text,
    requiredMetrics: [...spec.metrics],
    calcIds: [...spec.calcs],
    sourceNeeds: [...new Set(spec.sources.flatMap(group => SOURCE_GROUPS[group]))],
    premise: spec.premise ?? null,
    appliesIn,
  };
  return appliesIn === 'OUT_OF_SCOPE' ? { ...base, outOfScopeReason: OUT_OF_SCOPE_REASON } : base;
}

function buildQuestion(spec: QuestionSpec): QuestionContract {
  const appliesIn: AppliesIn = OUT_OF_SCOPE_QUESTIONS.has(spec.id) ? 'OUT_OF_SCOPE' : 'FUNDAMENTAL';
  return {
    id: spec.id,
    topic: spec.topic,
    question: spec.question,
    subQuestions: spec.subs.map((sub, i) => buildSubQuestion(sub, spec.id, i, appliesIn)),
    premise: spec.premise ?? null,
    appliesIn,
  };
}

/** The 29-question contract (ids 1..29). Q1, Q28 and Q29 are OUT_OF_SCOPE (deferred). */
export const QUESTIONS: QuestionContract[] = deepFreeze(SPECS.map(buildQuestion));

/** Returns the question with the given number, or undefined when it does not exist. */
export function getQuestion(id: number): QuestionContract | undefined {
  return QUESTIONS.find(question => question.id === id);
}

/** Every sub-question across all 29 questions, in question then letter order. */
export function allSubQuestions(): SubQuestion[] {
  return QUESTIONS.flatMap(question => question.subQuestions);
}

/** Ids of sub-questions that resolve to NOT_APPLICABLE because the question is out of scope. */
export function outOfScopeSubQuestionIds(): string[] {
  return allSubQuestions()
    .filter(sub => sub.appliesIn === 'OUT_OF_SCOPE')
    .map(sub => sub.id);
}
