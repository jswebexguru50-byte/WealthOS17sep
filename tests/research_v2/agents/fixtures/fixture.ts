import type { Bundle, CalcResult, Fact, ResearchItem, SubAnswer, SubQuestion } from '../../../../src/server/research_v2/domain/index.js';

/** Builds a fact with sensible defaults; override any field. */
export function fact(over: Partial<Fact> & Pick<Fact, 'factId' | 'metric' | 'valueCr'>): Fact {
  return {
    isin: 'INE000A01010',
    symbol: 'ALPHA',
    scope: 'CONSOLIDATED',
    periodType: 'ANNUAL',
    periodStart: '2025-04-01',
    periodEnd: '2026-03-31',
    unit: 'INR_CR',
    sourceTier: 'STATUTORY',
    source: 'XBRL',
    sourceRef: 'filing-1',
    availableAt: '2026-05-20T00:00:00Z',
    vintage: 1,
    qualityFlags: [],
    quarantined: false,
    ...over,
  };
}

function calc(over: Partial<CalcResult> & Pick<CalcResult, 'calcId' | 'value'>): CalcResult {
  return {
    name: over.calcId, unit: 'X', period: 'FY26', scope: 'CONSOLIDATED', inputs: [], formula: 'a / b',
    status: 'OK', note: '', ...over,
  };
}

const research = (over: Partial<ResearchItem> & Pick<ResearchItem, 'id'>): ResearchItem => ({
  symbol: 'ALPHA', tier: 'PRIMARY', url: 'https://example.invalid/doc', title: 't', publisher: 'p',
  publishedAt: '2026-05-01', retrievedAt: '2026-10-10', excerpt: '', subQuestionIds: [], status: 'VERIFIED', ...over,
});

/** Frozen bundle used by the agent tests. Every id below is referenced by at least one test. */
export function makeBundle(): Bundle {
  const facts = [
    fact({ factId: 'F_EBITDA', metric: 'ebitda_derived', valueCr: 852.95 }),
    fact({ factId: 'F_CFO', metric: 'cfo', valueCr: 775.7 }),
    fact({ factId: 'F_REV', metric: 'revenue_from_operations', valueCr: 5000 }),
    fact({
      factId: 'F_Q3REV', metric: 'revenue_from_operations', valueCr: 1300, periodType: 'DISCRETE_Q',
      periodStart: '2025-10-01', periodEnd: '2025-12-31',
    }),
    fact({ factId: 'F_STANDALONE_REV', metric: 'revenue_from_operations', valueCr: 4100, scope: 'STANDALONE' }),
    fact({ factId: 'F_PROMOTER', metric: 'promoter_pct', valueCr: 72.5, unit: 'PCT', periodType: 'POINT_IN_TIME',
      periodStart: '2026-03-31', periodEnd: '2026-03-31' }),
    fact({ factId: 'F_QUARANTINED', metric: 'cfo', valueCr: 10, quarantined: true }),
    fact({ factId: 'F_SIM', metric: 'cfo', valueCr: 11, sourceTier: 'SIMULATED' }),
    fact({ factId: 'F_LATEST', metric: 'cfo', valueCr: 12, sourceTier: 'PROVIDER_LATEST' }),
    fact({ factId: 'F_LEAD', metric: 'cfo', valueCr: 13, sourceTier: 'SECONDARY_LEAD' }),
    fact({ factId: 'F_RECON', metric: 'cfo', valueCr: 14, qualityFlags: ['PERIOD_RECON_FAIL'] }),
    fact({ factId: 'F_NULL', metric: 'cfo', valueCr: null }),
  ];
  const calcs = [
    calc({ calcId: 'cfo_to_ebitda|FY26|CONSOLIDATED', value: 0.909, inputs: ['F_CFO', 'F_EBITDA'], formula: '775.7/852.95' }),
    calc({ calcId: 'bad_calc', value: null, status: 'INSUFFICIENT_DATA', missing: ['x'] }),
    calc({ calcId: 'orphan_calc', value: 1.5, inputs: ['F_DOES_NOT_EXIST'] }),
    calc({ calcId: 'tainted_calc', value: 2, inputs: ['F_QUARANTINED'] }),
    calc({ calcId: 'nested_calc', value: 3, inputs: ['tainted_calc'] }),
  ];
  return {
    symbol: 'ALPHA',
    isin: 'INE000A01010',
    asOf: '2026-10-10T00:00:00Z',
    facts: Object.fromEntries(facts.map(f => [f.factId, f])),
    calcs: Object.fromEntries(calcs.map(c => [c.calcId, c])),
    scorecard: [],
    researchItems: [
      research({ id: 'R_PRIMARY', excerpt: 'Management stated the order book stood at ₹1,200 crore at year end.',
        status: 'MANAGEMENT_CLAIM' }),
      research({ id: 'R_LEAD', tier: 'SECONDARY', status: 'UNVERIFIED_LEAD', excerpt: 'Blog says margins are rising.' }),
      research({ id: 'R_REJECTED', status: 'REJECTED', excerpt: 'Wrong.' }),
    ],
    readiness: {},
    gaps: [],
    routineVersion: 'v2.0',
    bundleHash: 'abc123def456abc123def456',
  };
}

/** Sub-questions: Q2.a answered, Q3.a peer section, Q5.a premise-bearing, Q1.a out of scope. */
export const SUBS: SubQuestion[] = [
  sub('Q1.a', 1, 'OUT_OF_SCOPE', null, 'Out of scope: fundamental analysis only (deferred)'),
  sub('Q2.a', 2, 'FUNDAMENTAL', null),
  sub('Q3.a', 3, 'FUNDAMENTAL', null),
  sub('Q5.a', 5, 'FUNDAMENTAL', { test: 'has_order_book', ifFalse: 'NOT_APPLICABLE' }),
];

function sub(
  id: string, question: number, appliesIn: SubQuestion['appliesIn'], premise: SubQuestion['premise'],
  outOfScopeReason?: string,
): SubQuestion {
  return {
    id, question, text: `Question ${id}`, requiredMetrics: [], calcIds: [], sourceNeeds: [], premise, appliesIn,
    outOfScopeReason,
  };
}

/** A fully valid draft for SUBS against makeBundle(). */
export function goodAnswers(): SubAnswer[] {
  return [
    {
      subQuestionId: 'Q1.a', state: 'NOT_APPLICABLE', claims: [],
      narrative: 'Out of scope: fundamental analysis only (deferred).',
      premiseCheck: { holds: false, note: 'Out of scope: fundamental analysis only (deferred)' },
    },
    {
      subQuestionId: 'Q2.a', state: 'ANSWERED',
      narrative: 'Consolidated EBITDA was ₹852.95 Cr in FY26 and operating cash flow was 775.7 Cr, '
        + 'a cash conversion of 0.909x.',
      claims: [
        { claimId: 'c1', text: 'EBITDA FY26 consolidated', value: 852.95, unit: 'INR_CR', period: 'FY26',
          scope: 'CONSOLIDATED', refs: ['F_EBITDA'], kind: 'FACT' },
        { claimId: 'c2', text: 'Operating cash flow FY26', value: 775.7, unit: 'Cr', period: 'FY2026',
          scope: 'CONSOLIDATED', refs: ['F_CFO'], kind: 'FACT' },
        { claimId: 'c3', text: 'CFO to EBITDA', value: 0.909, unit: 'x', period: 'FY26', scope: 'CONSOLIDATED',
          refs: ['cfo_to_ebitda|FY26|CONSOLIDATED'], kind: 'CALC' },
      ],
    },
    {
      subQuestionId: 'Q3.a', state: 'PARTIAL', claims: [],
      narrative: 'Peer comparison is limited; BETA Industries is the closest listed peer.',
      gap: 'Peer multiples are missing from the bundle', nextAction: 'Fetch peer shareholding and filings',
    },
    {
      subQuestionId: 'Q5.a', state: 'NOT_APPLICABLE', claims: [],
      narrative: 'The company reports no order book, so conversion cannot be assessed.',
      premiseCheck: { holds: false, note: 'No order book disclosed in the filings searched' },
    },
  ];
}

/** Structured-clone helper so tests can mutate drafts safely. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
