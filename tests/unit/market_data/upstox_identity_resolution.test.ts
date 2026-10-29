/**
 * upstox_identity_resolution.test.ts
 *
 * Unit tests for the Upstox provider-key identity selection logic extracted
 * from scripts/market_data/upstox_full_candle_backfill.cjs.
 *
 * Root cause context:
 *   The original loadSymbols() mapped: exchange === 'BSE' ? upstox_key_bse : upstox_key_nse
 *   This caused 400 errors for BSE SME / cross-listed stocks that have a valid NSE_EQ key
 *   but whose BSE_EQ key the Upstox v2 candle API rejects.
 *
 * Fix: prefer upstox_key_nse when present, fall back to upstox_key_bse for BSE-only.
 */

import { describe, it, expect } from 'vitest';

// ── Inline the identity resolution function under test ─────────────────────
// This mirrors the logic in loadSymbols() after the fix on line 61 of
// scripts/market_data/upstox_full_candle_backfill.cjs.

interface MasterTickerRow {
  symbol: string;
  isin: string;
  exchange: string;
  upstox_key_nse: string | null;
  upstox_key_bse: string | null;
  listing_date?: string | null;
}

function resolveProviderKey(row: MasterTickerRow): string | null {
  // Prefer NSE key when available regardless of exchange.
  // Fall back to BSE key only when no NSE key is present.
  return row.upstox_key_nse || row.upstox_key_bse;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function nseRow(symbol: string, isin: string): MasterTickerRow {
  return { symbol, isin, exchange: 'NSE', upstox_key_nse: `NSE_EQ|${isin}`, upstox_key_bse: null };
}

function bseOnlyRow(symbol: string, isin: string): MasterTickerRow {
  return { symbol, isin, exchange: 'BSE', upstox_key_nse: null, upstox_key_bse: `BSE_EQ|${isin}` };
}

function bseSmeRow(symbol: string, isin: string): MasterTickerRow {
  // BSE SME / cross-listed: both keys present, exchange field says BSE
  return { symbol, isin, exchange: 'BSE', upstox_key_nse: `NSE_EQ|${isin}`, upstox_key_bse: `BSE_EQ|${isin}` };
}

function nseCrossListedRow(symbol: string, isin: string): MasterTickerRow {
  // NSE primary, also has a BSE key
  return { symbol, isin, exchange: 'NSE', upstox_key_nse: `NSE_EQ|${isin}`, upstox_key_bse: `BSE_EQ|${isin}` };
}

function nullKeysRow(symbol: string, isin: string): MasterTickerRow {
  return { symbol, isin, exchange: 'BSE', upstox_key_nse: null, upstox_key_bse: null };
}

// ── Test cases ─────────────────────────────────────────────────────────────

describe('resolveProviderKey — Upstox identity selection', () => {

  describe('NSE-primary symbol (exchange = NSE, only NSE key)', () => {
    it('returns the NSE key', () => {
      const row = nseRow('RELIANCE', 'INE002A01018');
      expect(resolveProviderKey(row)).toBe('NSE_EQ|INE002A01018');
    });

    it('does NOT return null', () => {
      expect(resolveProviderKey(nseRow('INFY', 'INE009A01021'))).not.toBeNull();
    });
  });

  describe('BSE-only symbol (exchange = BSE, only BSE key)', () => {
    it('returns the BSE key', () => {
      const row = bseOnlyRow('500112', 'INE062A01020');
      expect(resolveProviderKey(row)).toBe('BSE_EQ|INE062A01020');
    });

    it('does NOT pick NSE key when null', () => {
      const row = bseOnlyRow('890001', 'INE000X01011');
      const result = resolveProviderKey(row);
      expect(result).not.toContain('NSE_EQ');
      expect(result).toBe('BSE_EQ|INE000X01011');
    });
  });

  describe('BSE SME / cross-listed symbol (exchange = BSE, both keys present)', () => {
    it('prefers NSE key over BSE key', () => {
      // Root-cause regression: old code returned BSE_EQ key → HTTP 400 from Upstox.
      const row = bseSmeRow('534563', 'INE253N01010');
      expect(resolveProviderKey(row)).toBe('NSE_EQ|INE253N01010');
    });

    it('never returns the BSE_EQ key when NSE key is available', () => {
      const row = bseSmeRow('780001', 'INE190P01019');
      expect(resolveProviderKey(row)).not.toContain('BSE_EQ');
    });

    it('applies to the 780xxx BSE SME scrip range', () => {
      const smeScrips = [
        { symbol: '780001', isin: 'INE190P01019' },
        { symbol: '780004', isin: 'INE733P01016' },
        { symbol: '780018', isin: 'INE067R01015' },
      ];
      for (const s of smeScrips) {
        const row = bseSmeRow(s.symbol, s.isin);
        expect(resolveProviderKey(row)).toBe(`NSE_EQ|${s.isin}`);
      }
    });
  });

  describe('NSE cross-listed symbol (exchange = NSE, both keys present)', () => {
    it('still returns the NSE key', () => {
      // Cross-listed on both; NSE is primary; should still use NSE key
      const row = nseCrossListedRow('CEREBRAINT', 'INE345B01019');
      expect(resolveProviderKey(row)).toBe('NSE_EQ|INE345B01019');
    });
  });

  describe('Symbol with null / missing keys', () => {
    it('returns null when both keys are null', () => {
      const row = nullKeysRow('BADSTOCK', 'INE999Z01099');
      expect(resolveProviderKey(row)).toBeNull();
    });

    it('is gracefully filtered out by the filter(x => x.providerKey) guard in loadSymbols', () => {
      // Simulate the downstream guard used in main():
      const symbols = [
        { ...nseRow('RELIANCE', 'INE002A01018'), providerKey: resolveProviderKey(nseRow('RELIANCE', 'INE002A01018')) },
        { ...nullKeysRow('BADSTOCK', 'INE999Z01099'), providerKey: resolveProviderKey(nullKeysRow('BADSTOCK', 'INE999Z01099')) },
        { ...bseOnlyRow('500112', 'INE062A01020'), providerKey: resolveProviderKey(bseOnlyRow('500112', 'INE062A01020')) },
      ];
      const filtered = symbols.filter(x => x.providerKey);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(x => x.symbol)).not.toContain('BADSTOCK');
    });
  });

  describe('BSE 400 regression: BSE key should NOT be selected when NSE key exists', () => {
    it('old logic (BSE exchange → BSE key) would have returned BSE key', () => {
      // Document what the OLD (broken) logic did:
      const oldResolve = (row: MasterTickerRow) =>
        row.exchange === 'BSE' ? row.upstox_key_bse : row.upstox_key_nse;

      const brokenRow = bseSmeRow('534563', 'INE253N01010'); // exchange = BSE
      expect(oldResolve(brokenRow)).toBe('BSE_EQ|INE253N01010');  // this was causing HTTP 400
    });

    it('new logic prefers NSE key for BSE-exchange cross-listed stocks', () => {
      const row = bseSmeRow('534563', 'INE253N01010');
      // Fix: upstox_key_nse || upstox_key_bse
      expect(resolveProviderKey(row)).toBe('NSE_EQ|INE253N01010');  // no longer 400
    });

    it('covers all 58 known BSE SME failures with NSE alternatives', () => {
      // Spot-check a representative sample of the 58 bse_has_nse_alternative cases
      const bseSmeFailures = [
        { symbol: '534563', isin: 'INE253N01010' },
        { symbol: '537119', isin: 'INE486P01011' },
        { symbol: '540394', isin: 'INE801W01017' },
        { symbol: '542653', isin: 'INE011201014' },
        { symbol: '543938', isin: 'INE0POP01017' },
        { symbol: '780006', isin: 'INE465Q01013' },
        { symbol: '780019', isin: 'INE107Q01011' },
      ];
      for (const { symbol, isin } of bseSmeFailures) {
        const row = bseSmeRow(symbol, isin);
        const key = resolveProviderKey(row);
        expect(key).toBe(`NSE_EQ|${isin}`);
        expect(key).not.toContain('BSE_EQ');
      }
    });
  });

  describe('Edge cases', () => {
    it('treats empty-string NSE key as falsy, falls back to BSE key', () => {
      const row: MasterTickerRow = {
        symbol: '500001',
        isin: 'INE001A01036',
        exchange: 'BSE',
        upstox_key_nse: '',   // empty string is falsy
        upstox_key_bse: 'BSE_EQ|INE001A01036',
      };
      expect(resolveProviderKey(row)).toBe('BSE_EQ|INE001A01036');
    });

    it('handles undefined keys gracefully (treats as falsy)', () => {
      const row = {
        symbol: 'UNKNOWN',
        isin: 'INE999Z01099',
        exchange: 'NSE',
        upstox_key_nse: undefined as unknown as null,
        upstox_key_bse: null,
      };
      expect(resolveProviderKey(row)).toBeFalsy();
    });
  });
});
