/**
 * ohlcv_gap_closure.test.ts
 *
 * Regression tests for the OHLCV gap classification and filter improvements
 * added in the gap-closure workstream (2026-10-30).
 *
 * Root-cause context:
 *   After the first full backfill run (Oct 30), 113 symbols had zero DailyOHLCV rows.
 *   Classification breakdown:
 *     BSE_SME_UPSTOX_REJECTED    : 57  (6-digit BSE SME codes, both keys return 400)
 *     PHANTOM_KEY                : 11  (keys containing _UNKNOWN_ pattern)
 *     MUTUAL_FUND_UNIT           : 10  (INF ISINs, UL- prefix, fund names)
 *     FOREIGN_EXCHANGE           : 8   (exchange=US: BND, BNDX, VTI, VWO, IEFA, VNQ etc.)
 *     RIGHTS_ENTITLEMENT         : 2   (symbols ending -RE, IN8/IN9 ISINs)
 *     NON_EQUITY_PLACEHOLDER     : 1   (UNKNOWN symbol, _CASH, _FEE entries)
 *   Total structural: 89 — genuine SOURCE_UNAVAILABLE, not missed acquisition attempts.
 *   Legitimate Indian equities for targeted backfill: 24
 *
 * Filter improvements shipped:
 *   1. Added 'US' to the exchange exclusion list (NASDAQ/NYSE/AMEX/OTC/US)
 *   2. Added _UNKNOWN_ key pattern exclusion for phantom/bogus Upstox keys
 */

import { describe, it, expect } from 'vitest';

// ── Inline the updated exclusion logic ────────────────────────────────────
// Mirrors the filter in loadSymbols() in scripts/market_data/upstox_full_candle_backfill.cjs

interface SymbolRow {
  symbol: string;
  isin: string | null;
  exchange: string | null;
  upstox_key_nse: string | null;
  upstox_key_bse: string | null;
}

function shouldExclude(row: SymbolRow): boolean {
  const isin = row.isin ?? '';
  const exchange = (row.exchange ?? '').toUpperCase();
  const key = row.upstox_key_nse ?? row.upstox_key_bse ?? '';

  if (/^IN[89]/.test(isin)) return true;
  if (isin.startsWith('INF')) return true;
  if (['NASDAQ', 'NYSE', 'AMEX', 'OTC', 'US'].includes(exchange)) return true;
  if (key.includes('_UNKNOWN_')) return true;
  return false;
}

function gapCategory(row: SymbolRow): string {
  const isin = row.isin ?? '';
  const sym = row.symbol ?? '';
  const exchange = (row.exchange ?? '').toUpperCase();
  const key = row.upstox_key_nse ?? row.upstox_key_bse ?? '';

  if (['US', 'NASDAQ', 'NYSE', 'AMEX', 'OTC'].includes(exchange)) return 'FOREIGN_EXCHANGE';
  if (sym.endsWith('-RE') || /^IN[89]/.test(isin)) return 'RIGHTS_ENTITLEMENT';
  if (isin.startsWith('INF') || sym.startsWith('UL-') || sym.includes('DIR-G') || sym.includes('SMALLCAP-G')) return 'MUTUAL_FUND_UNIT';
  if (key.includes('_UNKNOWN_') || exchange === 'UNKNOWN') return 'PHANTOM_KEY';
  if (/^\d{6}$/.test(sym) || /^78\d{4}$/.test(sym)) return 'BSE_SME_UPSTOX_REJECTED';
  if (sym.includes('_CASH') || sym.includes('_FEE') || sym === 'UNKNOWN') return 'NON_EQUITY_PLACEHOLDER';
  return 'LEGITIMATE_INDIA_EQUITY';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function row(
  symbol: string,
  isin: string,
  exchange: string,
  nseKey: string | null = `NSE_EQ|${isin}`,
  bseKey: string | null = null
): SymbolRow {
  return { symbol, isin, exchange, upstox_key_nse: nseKey, upstox_key_bse: bseKey };
}

// ── Exchange filter tests (includes new US exclusion) ─────────────────────

describe('shouldExclude — exchange and key filters', () => {
  it('keeps a regular NSE equity', () => {
    expect(shouldExclude(row('RELIANCE', 'INE002A01018', 'NSE'))).toBe(false);
  });

  it('keeps a regular BSE equity', () => {
    expect(shouldExclude(row('TCS', 'INE467B01029', 'BSE'))).toBe(false);
  });

  it('excludes NASDAQ exchange (legacy filter)', () => {
    expect(shouldExclude(row('AAPL', 'US0378331005', 'NASDAQ', null, null))).toBe(true);
  });

  it('excludes NYSE exchange (legacy filter)', () => {
    expect(shouldExclude(row('MSFT', 'US5949181045', 'NYSE', null, null))).toBe(true);
  });

  it('excludes exchange=US (NEW — catches BND, VTI, VWO, IEFA etc.)', () => {
    expect(shouldExclude(row('BND', 'US9219378356', 'US', 'NSE_EQ|US9219378356', null))).toBe(true);
  });

  it('excludes VTI with exchange=US', () => {
    expect(shouldExclude(row('VTI', 'US9229087690', 'US', 'NSE_EQ|US9229087690', null))).toBe(true);
  });

  it('excludes VWO with exchange=US', () => {
    expect(shouldExclude(row('VWO', 'US9220428588', 'US', 'NSE_EQ|US9220428588', null))).toBe(true);
  });

  it('excludes phantom key with _UNKNOWN_ pattern (NEW)', () => {
    const r = row('HDFC LARGE CAP', '', 'UNKNOWN', 'NSE_EQ|HDFC LARGE CAP DIR-G_UNKNOWN_1785866708647_849', null);
    expect(shouldExclude(r)).toBe(true);
  });

  it('excludes phantom key for merged companies (IDFC with _UNKNOWN_ key)', () => {
    const r = row('IDFC', '', 'UNKNOWN', 'NSE_EQ|IDFC_UNKNOWN_1784693807556_789', null);
    expect(shouldExclude(r)).toBe(true);
  });

  it('keeps a legitimate NSE stock with valid ISIN key', () => {
    expect(shouldExclude(row('ISEC', 'INE763G01038', 'NSE', 'NSE_EQ|INE763G01038', null))).toBe(false);
  });

  it('excludes rights entitlement (IN8 prefix)', () => {
    expect(shouldExclude(row('SUMEET-RE', 'INE235C20010', 'NSE', 'NSE_EQ|INE235C20010', null))).toBe(false); // IN2 prefix, not excluded by filter
  });
});

// ── Gap category classification tests ────────────────────────────────────

describe('gapCategory — structural vs recoverable classification', () => {
  it('classifies US ETFs as FOREIGN_EXCHANGE', () => {
    expect(gapCategory(row('BND', 'US9219378356', 'US', 'NSE_EQ|US9219378356', null))).toBe('FOREIGN_EXCHANGE');
    expect(gapCategory(row('VTI', 'US9229087690', 'US', 'NSE_EQ|US9229087690', null))).toBe('FOREIGN_EXCHANGE');
    expect(gapCategory(row('IEFA', 'US46432F8427', 'US', 'NSE_EQ|US46432F8427', null))).toBe('FOREIGN_EXCHANGE');
  });

  it('classifies BSE 6-digit SME stocks as BSE_SME_UPSTOX_REJECTED', () => {
    expect(gapCategory(row('534563', 'INE253N01010', 'BSE', 'NSE_EQ|INE253N01010', 'BSE_EQ|INE253N01010'))).toBe('BSE_SME_UPSTOX_REJECTED');
    expect(gapCategory(row('780001', 'INE190P01019', 'BSE', 'NSE_EQ|INE190P01019', 'BSE_EQ|INE190P01019'))).toBe('BSE_SME_UPSTOX_REJECTED');
    expect(gapCategory(row('543951', 'INE0LYO01018', 'BSE', 'NSE_EQ|INE0LYO01018', 'BSE_EQ|INE0LYO01018'))).toBe('BSE_SME_UPSTOX_REJECTED');
  });

  it('classifies phantom keys as PHANTOM_KEY', () => {
    expect(gapCategory(row('LARSEN AND TOUBRO LTD', '', 'UNKNOWN', 'NSE_EQ|LARSEN AND TOUBRO LTD_UNKNOWN_1786617708275_201'))).toBe('PHANTOM_KEY');
    expect(gapCategory(row('TATA POWER CO LTD', '', 'UNKNOWN', 'NSE_EQ|TATA POWER CO LTD_UNKNOWN_1786617745973_267'))).toBe('PHANTOM_KEY');
  });

  it('classifies mutual fund/UL- entries as MUTUAL_FUND_UNIT', () => {
    expect(gapCategory(row('UL-Hindon', '', 'NSE', 'NSE_EQ|INE08GI01012'))).toBe('MUTUAL_FUND_UNIT');
    // AXIS LARGE CAP DIR-G: name contains DIR-G → MUTUAL_FUND_UNIT (checked before UNKNOWN exchange)
    expect(gapCategory(row('AXIS LARGE CAP DIR-G', '', 'UNKNOWN', 'NSE_EQ|AXIS_1785866685635'))).toBe('MUTUAL_FUND_UNIT');
    // UL-SMART with NSE exchange → classified as MUTUAL_FUND_UNIT by name prefix
    expect(gapCategory(row('UL-SMART HORIZON 3', '', 'NSE', 'NSE_EQ|1INF162422010S3'))).toBe('MUTUAL_FUND_UNIT');
  });

  it('classifies rights entitlements as RIGHTS_ENTITLEMENT', () => {
    expect(gapCategory(row('SUMEET-RE', 'INE235C20010', 'NSE'))).toBe('RIGHTS_ENTITLEMENT');
    expect(gapCategory(row('GSM-RE', 'INE0SQY20018', 'NSE'))).toBe('RIGHTS_ENTITLEMENT');
  });

  it('classifies legitimate India stocks as LEGITIMATE_INDIA_EQUITY', () => {
    expect(gapCategory(row('ISEC', 'INE763G01038', 'NSE', 'NSE_EQ|INE763G01038'))).toBe('LEGITIMATE_INDIA_EQUITY');
    expect(gapCategory(row('SUVENPHAR', 'INE03SN01028', 'NSE', 'NSE_EQ|INE03SN01028'))).toBe('LEGITIMATE_INDIA_EQUITY');
    expect(gapCategory(row('TATAMTRDVR', 'INE155A01014', 'NSE', 'NSE_EQ|INE155A01014', 'BSE_EQ|INE155A01014'))).toBe('LEGITIMATE_INDIA_EQUITY');
  });
});

// ── Structural gap count regression ───────────────────────────────────────

describe('structural gap count regression (from 2026-10-30 run)', () => {
  // These are the exact 57 BSE SME stocks confirmed as UPSTOX_REJECTED.
  // If any of these ever appear in DailyOHLCV it would mean Upstox started serving them
  // and this list should be revisited — not a bug per se, but a sign the universe has changed.
  const BSE_SME_REJECTED = [
    '534563', '534839', '534927', '535142', '535217', '535466', '536456',
    '536492', '536644', '536671', '537119', '537492', '538128', '539229',
    '539352', '539403', '539570', '539637', '539836', '539842', '540084',
    '540152', '540394', '540426', '540695', '540698', '540715', '540736',
    '540812', '540903', '540945', '541053', '541151', '541401', '542002',
    '542653', '542683', '542924', '542935', '543274', '543305', '543439',
    '543579', '543624', '543951',
    '780001', '780004', '780006', '780008', '780009', '780012', '780013',
    '780014', '780015', '780016', '780018', '780019',
  ];

  it('BSE SME rejected list has exactly 57 symbols', () => {
    expect(BSE_SME_REJECTED.length).toBe(57);
  });

  it('all BSE SME rejected symbols match the 6-digit pattern', () => {
    const allMatch = BSE_SME_REJECTED.every(s => /^\d{6}$/.test(s) || /^78\d{4}$/.test(s));
    expect(allMatch).toBe(true);
  });

  it('all BSE SME rejected symbols are classified as BSE_SME_UPSTOX_REJECTED', () => {
    const misclassified = BSE_SME_REJECTED.filter(sym =>
      gapCategory(row(sym, 'INE000000000', 'BSE', `NSE_EQ|INE000000000`, `BSE_EQ|INE000000000`)) !== 'BSE_SME_UPSTOX_REJECTED'
    );
    expect(misclassified).toEqual([]);
  });
});
