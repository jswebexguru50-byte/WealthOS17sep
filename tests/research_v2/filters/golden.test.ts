import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScorecard, summaryLine } from '../../../src/server/research_v2/filters/scorecard.js';
import type { ScorecardRowX } from '../../../src/server/research_v2/filters/inputs.js';
import {
  annualFacts, fact, inputFor, inst, pledge, promoter, quarterlyPats,
} from './fixtures.js';
import type { Fact } from '../../../src/server/research_v2/domain/index.js';
import type { OwnershipFixture } from './fixtures.js';

const near = (actual: number | null, expected: number, tol = 0.01): void => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= tol, `expected ${expected} +-${tol}, got ${actual}`);
};

const POSITIVE = [10, 9, 8, 7, 6, 5, 4, 3];
const derivedQuarter = (facts: Fact[]): Fact[] =>
  facts.map((f, i) => (i === 3 ? { ...f, qualityFlags: ['DERIVED_FROM_YTD'] } : f));

interface Scrip { facts: Fact[]; own: OwnershipFixture; extra?: Parameters<typeof inputFor>[2] }

const SCRIPS: Record<string, Scrip> = {
  YUKEN: {
    facts: [...quarterlyPats([5, 4, 3, null, null, null, null, 2]),
      ...annualFacts({ pbt: 40, fin: 10, pat: 21.69, equity: 561.8, cfo: 41.29, ebitda: 50.52 })],
    own: { promoter: promoter(58.04) },
    extra: { providerRoce: { value: 7.76, asOf: '2026-03-31', source: 'trendlyne' } },
  },
  BECTORFOOD: {
    facts: [...derivedQuarter(quarterlyPats(POSITIVE)),
      ...annualFacts({ pat: 110.8, equity: 1000, cfo: 217.79, ebitda: 257.66 })],
    own: {
      promoter: promoter(49.04), pledge: [pledge(0)],
      institutional: [inst('2026-06-30', 20.03, 10, 4), inst('2026-03-31', 21.61, 10, 4)],
    },
    extra: { providerRoce: { value: 13.58, asOf: '2026-03-31', source: 'trendlyne' } },
  },
  VMART: {
    facts: [...quarterlyPats([47.21, 11.28, 87.99, -8.87, 33.6, 18.51, 71.63, -56.51]),
      ...annualFacts({ pbt: 242, fin: 0, pat: 130.4, equity: 1000, cfo: 500.54, ebitda: 512.27, leasePrincipal: 150 })],
    own: { promoter: promoter(44.15) },
  },
  TATATECH: {
    facts: [...quarterlyPats([5, 5, 5]),
      ...annualFacts({ pbt: 500, fin: 50, dep: 400, oi: 97.05, pat: 388.9, equity: 2792, cfo: 775.7 })],
    own: {
      promoter: promoter(55.17), pledge: [pledge(0)],
      institutional: [inst('2026-06-30', 6.78, 2, 2), inst('2026-03-31', 5.21, 2, 2)],
    },
    extra: { providerRoce: { value: 17.57, asOf: '2026-03-31', source: 'trendlyne' } },
  },
  OPTIEMUS: {
    facts: [...quarterlyPats([5, 5]), ...annualFacts({ pbt: 118, fin: 10, pat: 85, equity: 1000, cfo: -12.15, ebitda: 97.7 })],
    own: {
      promoter: promoter(72.17),
      institutional: [inst('2026-06-30', 2.23, 1, 1), inst('2026-03-31', 2.32, 1, 1)],
    },
  },
  ARROWGREEN: {
    facts: [...derivedQuarter(quarterlyPats(POSITIVE)), ...annualFacts({ pat: 20.22, equity: 100, cfo: 43.05, ebitda: 64.58 })],
    own: {
      promoter: promoter(65.65), pledge: [pledge(0)],
      institutional: [inst('2026-06-30', 0.69, 0.3, 0.2), inst('2026-03-31', 0.49, 0.2, 0.2)],
    },
    extra: { providerRoce: { value: 27.29, asOf: '2026-03-31', source: 'trendlyne' } },
  },
};

const rows = (name: string): ScorecardRowX[] => {
  const s = SCRIPS[name];
  return buildScorecard(inputFor(s.facts, s.own, s.extra));
};

test('every scrip yields exactly seven rows in filter order, with no overall verdict field', () => {
  for (const name of Object.keys(SCRIPS)) {
    const r = rows(name);
    assert.deepEqual(r.map(x => x.filterId), [1, 2, 3, 4, 5, 6, 7], name);
    assert.ok(!r.some(x => 'overall' in x || 'rank' in x), name);
  }
});

test('promoter holding golden values and thresholds (> 66.6)', () => {
  const expected: Record<string, [number, string]> = {
    YUKEN: [58.04, 'BELOW_THRESHOLD'], BECTORFOOD: [49.04, 'BELOW_THRESHOLD'], VMART: [44.15, 'BELOW_THRESHOLD'],
    TATATECH: [55.17, 'BELOW_THRESHOLD'], OPTIEMUS: [72.17, 'MEETS_THRESHOLD'], ARROWGREEN: [65.65, 'BELOW_THRESHOLD'],
  };
  for (const [name, [value, status]] of Object.entries(expected)) {
    const row = rows(name)[0];
    assert.equal(row.observed, value, name);
    assert.equal(row.status, status, name);
    assert.equal(row.basis, 'OFFICIAL');
    assert.equal(row.asOf, '2026-06-30');
  }
});

test('profitability: VMART has 3 consecutive profitable quarters with the loss visible', () => {
  const row = rows('VMART')[1];
  assert.equal(row.observed, 3);
  assert.equal(row.status, 'BELOW_THRESHOLD');
  assert.equal(row.quartersAvailable, 8);
  assert.deepEqual(row.quarterPats?.map(q => q.pat), [47.21, 11.28, 87.99, -8.87, 33.6, 18.51, 71.63, -56.51]);
});

test('profitability: BECTORFOOD and ARROWGREEN reach 8 with one derived quarter flagged', () => {
  for (const name of ['BECTORFOOD', 'ARROWGREEN']) {
    const row = rows(name)[1];
    assert.equal(row.observed, 8, name);
    assert.equal(row.status, 'MEETS_THRESHOLD', name);
    assert.equal(row.basis, 'DERIVED', name);
    assert.match(row.note ?? '', /derived/i);
  }
});

test('profitability: YUKEN, TATATECH and OPTIEMUS are UNVERIFIABLE with a reason, not zero', () => {
  for (const name of ['YUKEN', 'TATATECH', 'OPTIEMUS']) {
    const row = rows(name)[1];
    assert.equal(row.status, 'UNVERIFIABLE', name);
    assert.equal(row.observed, null, name);
    assert.match(row.reasonIfUnverifiable ?? '', /missing/, name);
  }
  assert.equal(rows('YUKEN')[1].quartersAvailable, 4);
});

test('ROCE: upper bounds for YUKEN, VMART, TATATECH, OPTIEMUS are BELOW (bound under 35)', () => {
  const bounds: Record<string, number> = { YUKEN: 8.9, VMART: 24.2, TATATECH: 19.7, OPTIEMUS: 12.8 };
  for (const [name, bound] of Object.entries(bounds)) {
    const row = rows(name)[2];
    near(row.observed, bound, 0.05);
    assert.equal(row.basis, 'UPPER_BOUND', name);
    assert.equal(row.status, 'BELOW_THRESHOLD', name);
  }
});

test('ROCE: provider value is a labelled cross-check when a bound exists, primary only when nothing derivable', () => {
  const yuken = rows('YUKEN')[2];
  assert.match(yuken.note ?? '', /Provider ROCE 7\.76/);
  assert.equal(yuken.crossCheck?.basis, 'PROVIDER');
  assert.notEqual(yuken.basis, 'PROVIDER');
  for (const [name, value] of [['BECTORFOOD', 13.58], ['ARROWGREEN', 27.29]] as const) {
    const row = rows(name)[2];
    assert.equal(row.observed, value, name);
    assert.equal(row.basis, 'PROVIDER', name);
    assert.equal(row.status, 'BELOW_THRESHOLD', name);
  }
});

test('ROE golden values (PAT / closing equity) flagged CLOSING_BALANCE', () => {
  const expected: Record<string, number> = {
    YUKEN: 3.86, BECTORFOOD: 11.08, VMART: 13.04, TATATECH: 13.93, OPTIEMUS: 8.5, ARROWGREEN: 20.22,
  };
  for (const [name, value] of Object.entries(expected)) {
    const row = rows(name)[3];
    near(row.observed, value, 0.01);
    assert.equal(row.status, 'BELOW_THRESHOLD', name);
    assert.ok(row.flags?.includes('CLOSING_BALANCE'), name);
  }
});

test('pledge: 0.0 meets, unknown is UNVERIFIABLE', () => {
  for (const name of ['BECTORFOOD', 'TATATECH', 'ARROWGREEN']) {
    const row = rows(name)[4];
    assert.equal(row.observed, 0, name);
    assert.equal(row.status, 'MEETS_THRESHOLD', name);
  }
  for (const name of ['YUKEN', 'VMART', 'OPTIEMUS']) {
    const row = rows(name)[4];
    assert.equal(row.observed, null, name);
    assert.equal(row.status, 'UNVERIFIABLE', name);
  }
});

test('institutional: level plus QoQ change (info comparator, quarter-end points)', () => {
  const expected: Record<string, [number, number]> = {
    BECTORFOOD: [34.03, -1.58], TATATECH: [10.78, 1.57], OPTIEMUS: [4.23, -0.09], ARROWGREEN: [1.19, 0.3],
  };
  for (const [name, [level, qoq]] of Object.entries(expected)) {
    const row = rows(name)[5];
    near(row.observed, level, 0.001);
    near(row.qoqChange ?? null, qoq, 0.001);
    assert.equal(row.comparator, 'info', name);
    assert.equal(row.gap, null, name);
  }
  for (const name of ['YUKEN', 'VMART']) assert.equal(rows(name)[5].status, 'UNVERIFIABLE', name);
});

test('CFO / EBITDA golden ratios', () => {
  const expected: Record<string, number> = {
    YUKEN: 0.817, BECTORFOOD: 0.845, VMART: 0.977, TATATECH: 0.909, OPTIEMUS: -0.12, ARROWGREEN: 0.667,
  };
  for (const [name, value] of Object.entries(expected)) {
    near(rows(name)[6].observed, value, name === "OPTIEMUS" ? 0.005 : 0.001);
  }
  assert.equal(rows('OPTIEMUS')[6].status, 'BELOW_THRESHOLD');
  assert.equal(rows('TATATECH')[6].status, 'MEETS_THRESHOLD');
});

test('TATATECH EBITDA is derived before exceptional items (852.95), not 745.22', () => {
  const s = SCRIPS.TATATECH;
  const withExceptional = [...s.facts, fact('exceptional_items', 'ANNUAL', '2026-03-31', -107.73)];
  const row = buildScorecard(inputFor(withExceptional, s.own, s.extra))[6];
  assert.match(row.note ?? '', /EBITDA 852\.95/);
  assert.doesNotMatch(row.note ?? '', /745/);
});

test('VMART shows the Ind AS 116-adjusted ratio next to the unadjusted one', () => {
  const row = rows('VMART')[6];
  near(row.leaseAdjustedRatio ?? null, (500.54 - 150) / 512.27, 0.001);
  assert.match(row.note ?? '', /Ind AS 116/);
});

test('summaryLine is descriptive and counts evaluable checks and unverifiable rows', () => {
  const line = summaryLine(rows('ARROWGREEN'));
  assert.match(line, /^\d+ of \d+ evaluable checks meet their thresholds; \d+ unverifiable$/);
  assert.equal(line, '3 of 6 evaluable checks meet their thresholds; 0 unverifiable');
});
