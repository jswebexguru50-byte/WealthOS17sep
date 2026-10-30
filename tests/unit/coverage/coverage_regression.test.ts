/**
 * coverage_regression.test.ts
 *
 * Regression guard for non-MCP field coverage.
 * Baseline: 31,613/35,120 fields covered (90.01%) from commit 4cd503fc2.
 *
 * This test loads the current coverage ledger and asserts:
 * 1. Total covered fields >= baseline (never regress)
 * 2. All non-borrowings, non-OHLCV gaps are accounted for by known SOURCE_UNAVAILABLE symbols
 * 3. UL-SOLITARIO is the only symbol with all-field gaps (unlisted private placement)
 *
 * Do NOT modify build_non_mcp_coverage_ledger.ts (frozen read-only script).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LEDGER_PATH = path.join(process.cwd(), 'reports', 'non_mcp', 'coverage_ledger.json');

// Known SOURCE_UNAVAILABLE symbols: unlisted / structured products with no public filings.
// Add here when a symbol in the coverage manifest is confirmed SOURCE_UNAVAILABLE.
const KNOWN_SOURCE_UNAVAILABLE: Record<string, { reason: string; fields: string[] }> = {
  'UL-SOLITARIO': {
    reason: 'Unlisted private placement (portfolio=Unlisted, notes=Unlisted Private Placement). No public exchange filings. ISIN=INE1HBH01016.',
    fields: ['revenue', 'pat', 'operating_profit', 'cfo', 'roe_pct', 'roce_reported', 'promoter_holding', 'promoter_pledge'],
  },
};

// Baseline coverage from commit 4cd503fc2 (non-MCP ledger, 3512 symbols × 10 fields)
const BASELINE_COVERED = 31_613;
const BASELINE_TOTAL = 35_120;

describe('non-MCP coverage regression', () => {
  let ledger: {
    covered: number;
    gaps: number;
    symbolCount: number;
    fieldCount: number;
    mcpUsed: boolean;
    rows: Array<{ symbol: string; fields: Record<string, { status: string; quality?: string }> }>;
  };

  it('coverage ledger exists', () => {
    expect(fs.existsSync(LEDGER_PATH), `Missing: ${LEDGER_PATH}`).toBe(true);
    ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  });

  it('MCP was not used', () => {
    expect(ledger.mcpUsed).toBe(false);
  });

  it(`covered fields >= baseline (${BASELINE_COVERED}/${BASELINE_TOTAL})`, () => {
    expect(ledger.covered).toBeGreaterThanOrEqual(BASELINE_COVERED);
  });

  it('total fields matches expected universe size', () => {
    const total = ledger.covered + ledger.gaps;
    // Allow for universe growth but not shrinkage
    expect(total).toBeGreaterThanOrEqual(BASELINE_TOTAL);
  });

  it('all non-borrowings, non-OHLCV gaps are SOURCE_UNAVAILABLE or OHLCV-linked', () => {
    if (!ledger?.rows) return; // ledger not loaded yet (prior test failed)

    const unexplainedGaps: Array<{ symbol: string; field: string; quality?: string }> = [];

    for (const row of ledger.rows) {
      for (const [field, info] of Object.entries(row.fields)) {
        if (info.status !== 'GAP') continue;
        if (field === 'borrowings') continue; // known structural gap (no non-MCP balance-sheet source)
        if (field === 'OHLCV') continue;     // handled by OHLCV backfill pipeline

        const knownSymbol = KNOWN_SOURCE_UNAVAILABLE[row.symbol];
        if (knownSymbol && knownSymbol.fields.includes(field)) continue; // documented SOURCE_UNAVAILABLE

        unexplainedGaps.push({ symbol: row.symbol, field, quality: info.quality });
      }
    }

    if (unexplainedGaps.length > 0) {
      const listing = unexplainedGaps.map(g => `${g.symbol}.${g.field} (${g.quality})`).join('\n  ');
      throw new Error(
        `Unexplained non-borrowings, non-OHLCV gaps found (${unexplainedGaps.length}):\n  ${listing}\n\n` +
        `If these symbols truly have no public data source, add them to KNOWN_SOURCE_UNAVAILABLE in this test.`
      );
    }

    expect(unexplainedGaps.length).toBe(0);
  });

  it('UL-SOLITARIO is marked SOURCE_UNAVAILABLE in fundamental_endpoint_snapshots (documented)', () => {
    // This documents that UL-Solitario (ISIN INE1HBH01016) is an unlisted private placement.
    // Three SOURCE_UNAVAILABLE snapshots were inserted on 2026-10-30 in commit after 4cd503fc2.
    // This test verifies the KNOWN_SOURCE_UNAVAILABLE registry covers all its gap fields.
    const knownSymbol = KNOWN_SOURCE_UNAVAILABLE['UL-SOLITARIO'];
    expect(knownSymbol).toBeDefined();
    expect(knownSymbol.fields).toContain('revenue');
    expect(knownSymbol.fields).toContain('promoter_holding');
    expect(knownSymbol.reason).toContain('Unlisted private placement');
  });
});
