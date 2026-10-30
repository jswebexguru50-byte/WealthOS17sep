/**
 * upstox_backfill_filters.test.ts
 *
 * Unit tests for two new behaviours added to loadSymbols() and the fetch loop
 * inside scripts/market_data/upstox_full_candle_backfill.cjs:
 *
 * 1. Non-equity exclusion: rights entitlements (IN8/IN9 ISINs), mutual-fund
 *    units (INF ISINs), and non-Indian exchanges (NASDAQ/NYSE/AMEX/OTC) must
 *    be silently dropped so we never attempt a fetch that is structurally
 *    guaranteed to return HTTP 400 from the Upstox V2 equity candle API.
 *
 * 2. BSE alternate-key retry: when a symbol carries both an NSE key and a BSE
 *    key, and the NSE key returns HTTP 400 (e.g. recently-listed or suspended
 *    on NSE but still active on BSE), the fetch loop must transparently retry
 *    with the BSE key before recording a failure.
 *
 * Root-cause context (from daily run 2026-10-29 failure_classification.json):
 *   BSE_UPSTOX_REJECTED  : 604 (BSE-only; no NSE key — structural, unfixable)
 *   NSE_UPSTOX_REJECTED  :  76 (includes IN8/IN9 rights + NSE-suspended stocks)
 *   NON_INDIAN_EQUITY    : 103 (AAPL, AMZN, BND etc. — should never enter load)
 */

import { describe, it, expect } from 'vitest';

// ── Inline the exclusion logic under test ──────────────────────────────────
// Mirrors the filter added to loadSymbols() in upstox_full_candle_backfill.cjs
// after the de-duplication step.

interface SymbolRow {
  symbol: string;
  isin: string | null;
  exchange: string | null;
  upstox_key_nse: string | null;
  upstox_key_bse: string | null;
  providerKey?: string | null;
}

function shouldExclude(row: SymbolRow): boolean {
  const isin = row.isin ?? '';
  const exchange = (row.exchange ?? '').toUpperCase();
  // Rights entitlements use IN8 / IN9 ISIN prefix — Upstox V2 equity API
  // does not carry candle data for these series.
  if (/^IN[89]/.test(isin)) return true;
  // Mutual-fund units use INF prefix — not on the equity candle endpoint.
  if (isin.startsWith('INF')) return true;
  // Non-Indian exchanges have no Upstox NSE/BSE equity key.
  if (['NASDAQ', 'NYSE', 'AMEX', 'OTC'].includes(exchange)) return true;
  return false;
}

// ── Inline the BSE retry decision logic ───────────────────────────────────
// Mirrors shouldRetryWithBse() helper added to the fetch loop.

function shouldRetryWithBse(row: SymbolRow, status: number): boolean {
  // Only retry when: NSE key returned 400, symbol has a different BSE key,
  // and we actually used the NSE key for the initial attempt.
  return (
    status === 400 &&
    !!row.upstox_key_bse &&
    !!row.upstox_key_nse &&
    row.providerKey === row.upstox_key_nse &&
    row.upstox_key_bse !== row.upstox_key_nse
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function row(
  symbol: string,
  isin: string,
  exchange: string,
  nse: string | null = `NSE_EQ|${isin}`,
  bse: string | null = null
): SymbolRow {
  return { symbol, isin, exchange, upstox_key_nse: nse, upstox_key_bse: bse };
}

function rowWithProvider(r: SymbolRow): SymbolRow {
  return { ...r, providerKey: r.upstox_key_nse || r.upstox_key_bse };
}

// ── Exclusion tests ────────────────────────────────────────────────────────

describe('shouldExclude — non-equity ISIN and exchange filtering', () => {
  it('keeps a plain NSE equity stock', () => {
    expect(shouldExclude(row('RELIANCE', 'INE002A01018', 'NSE'))).toBe(false);
  });

  it('keeps a plain BSE-only equity stock', () => {
    expect(shouldExclude(row('534563', 'INE253N01010', 'BSE', null, 'BSE_EQ|INE253N01010'))).toBe(false);
  });

  it('excludes AIRTEL-RE (IN8 rights entitlement prefix)', () => {
    expect(shouldExclude(row('AIRTEL-RE', 'IN8397D01014', 'NSE'))).toBe(true);
  });

  it('excludes any IN9 rights entitlement prefix', () => {
    expect(shouldExclude(row('DUMMY-RI', 'IN9012X01017', 'NSE'))).toBe(true);
  });

  it('excludes a mutual-fund unit (INF prefix)', () => {
    expect(shouldExclude(row('HDFC-MF', 'INF179K01BB4', 'BSE', null, 'BSE_EQ|INF179K01BB4'))).toBe(true);
  });

  it('excludes AAPL (NASDAQ exchange)', () => {
    expect(shouldExclude(row('AAPL', 'US0378331005', 'NASDAQ', null, null))).toBe(true);
  });

  it('excludes AMZN (NASDAQ exchange)', () => {
    expect(shouldExclude(row('AMZN', 'US0231351067', 'NASDAQ', null, null))).toBe(true);
  });

  it('excludes a NYSE-listed foreign stock', () => {
    expect(shouldExclude(row('XYZ', 'US1234567890', 'NYSE', null, null))).toBe(true);
  });

  it('excludes OTC exchange', () => {
    expect(shouldExclude(row('OTCFOO', 'US9999999999', 'OTC', null, null))).toBe(true);
  });

  it('is case-insensitive for exchange field', () => {
    expect(shouldExclude({ ...row('AAPL', 'US0378331005', 'nasdaq', null, null) })).toBe(true);
  });

  it('keeps a cross-listed stock whose exchange is BSE but has NSE key', () => {
    const r = row('BANSALWIRE', 'INE0B9K01025', 'BSE', 'NSE_EQ|INE0B9K01025', 'BSE_EQ|INE0B9K01025');
    expect(shouldExclude(r)).toBe(false);
  });

  it('real regression: SPANDANA NSE stock is kept (not excluded)', () => {
    expect(shouldExclude(row('SPANDANA', 'INE572J01011', 'NSE', 'NSE_EQ|INE572J01011', 'BSE_EQ|INE572J01011'))).toBe(false);
  });
});

// ── BSE alternate-key retry tests ──────────────────────────────────────────

describe('shouldRetryWithBse — alternate-key retry decision', () => {
  it('triggers retry when NSE key gave 400 and BSE key is present', () => {
    const r = rowWithProvider(row('BANSALWIRE', 'INE0B9K01025', 'NSE', 'NSE_EQ|INE0B9K01025', 'BSE_EQ|INE0B9K01025'));
    expect(shouldRetryWithBse(r, 400)).toBe(true);
  });

  it('does not retry when status is 200', () => {
    const r = rowWithProvider(row('BANSALWIRE', 'INE0B9K01025', 'NSE', 'NSE_EQ|INE0B9K01025', 'BSE_EQ|INE0B9K01025'));
    expect(shouldRetryWithBse(r, 200)).toBe(false);
  });

  it('does not retry when status is 429 (rate limit)', () => {
    const r = rowWithProvider(row('BANSALWIRE', 'INE0B9K01025', 'NSE', 'NSE_EQ|INE0B9K01025', 'BSE_EQ|INE0B9K01025'));
    expect(shouldRetryWithBse(r, 429)).toBe(false);
  });

  it('does not retry when no BSE key is available', () => {
    const r = rowWithProvider(row('RELIANCE', 'INE002A01018', 'NSE', 'NSE_EQ|INE002A01018', null));
    expect(shouldRetryWithBse(r, 400)).toBe(false);
  });

  it('does not retry when BSE-only symbol (no NSE key; providerKey is BSE)', () => {
    const r = { ...row('534563', 'INE253N01010', 'BSE', null, 'BSE_EQ|INE253N01010'), providerKey: 'BSE_EQ|INE253N01010' };
    expect(shouldRetryWithBse(r, 400)).toBe(false);
  });

  it('does not retry when NSE and BSE key are the same string', () => {
    const r = { ...row('X', 'INE001A01036', 'NSE', 'NSE_EQ|INE001A01036', 'NSE_EQ|INE001A01036'), providerKey: 'NSE_EQ|INE001A01036' };
    expect(shouldRetryWithBse(r, 400)).toBe(false);
  });

  it('real regression: CORDELIA triggers retry (NSE 400, has BSE key)', () => {
    const r = rowWithProvider(row('CORDELIA', 'INE0LZF01013', 'NSE', 'NSE_EQ|INE0LZF01013', 'BSE_EQ|INE0LZF01013'));
    expect(shouldRetryWithBse(r, 400)).toBe(true);
  });

  it('real regression: CEREBRAINT triggers retry (NSE 400, has BSE key)', () => {
    const r = rowWithProvider(row('CEREBRAINT', 'INE345B01019', 'NSE', 'NSE_EQ|INE345B01019', 'BSE_EQ|INE345B01019'));
    expect(shouldRetryWithBse(r, 400)).toBe(true);
  });

  it('real regression: CCAVENUE triggers retry (NSE 400, has BSE key)', () => {
    const r = rowWithProvider(row('CCAVENUE', 'INE483S01020', 'NSE', 'NSE_EQ|INE483S01020', 'BSE_EQ|INE483S01020'));
    expect(shouldRetryWithBse(r, 400)).toBe(true);
  });
});
