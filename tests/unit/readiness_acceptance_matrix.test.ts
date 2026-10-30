import { describe, expect, it } from 'vitest';
import { buildAcceptanceMatrix } from '../../scripts/fundamental/build_readiness_acceptance_matrix';

describe('readiness acceptance matrix', () => {
  it('classifies NSE, BSE and dual-listed cohorts deterministically', () => {
    const manifest = {
      entries: [
        { key: 'NSE:AAA', isin: 'INEAAA', listings: [{ symbol: 'AAA', exchange: 'NSE' }] },
        { key: 'BSE:500001', isin: 'INEBBB', listings: [{ symbol: '500001', exchange: 'BSE' }] },
        { key: 'NSE:CCC', isin: 'INECCC', listings: [{ symbol: 'CCC', exchange: 'NSE' }, { symbol: '500002', exchange: 'BSE' }] },
      ],
    };
    const fields = { revenue: { status: 'AVAILABLE' } };
    const result = buildAcceptanceMatrix(manifest, {
      rows: [
        { symbol: 'AAA', fields },
        { symbol: '500001', fields },
        { symbol: 'CCC', fields },
      ],
    });
    expect(result.symbols).toBe(3);
    expect(result.uniqueSymbols).toBe(3);
    expect(result.counts.NSE_ONLY.symbols).toBe(1);
    expect(result.counts.BSE_ONLY.symbols).toBe(1);
    expect(result.counts.DUAL_LISTED.symbols).toBe(1);
    expect(result.mcpUsed).toBe(false);
  });

  it('fails closed for a malformed or incomplete ledger row', () => {
    const result = buildAcceptanceMatrix(
      { symbols: ['AAA', 'BBB'] },
      { rows: [{ symbol: 'AAA' }] },
    );
    expect(result.rows.find((row) => row.symbol === 'AAA')).toMatchObject({
      status: 'MISSING', missing: ['FIELD_COVERAGE_LEDGER'],
    });
    expect(result.rows.find((row) => row.symbol === 'BBB')).toMatchObject({ status: 'MISSING' });
  });

  it('infers exchange from manifest keys and numeric BSE scrips', () => {
    const result = buildAcceptanceMatrix(
      { entries: [{ key: 'NSE:INFY', isin: 'INE009A01021' }, { key: 'BSE:500325', isin: 'INE040A01034' }] },
      { rows: [{ symbol: 'INFY', fields: { revenue: { status: 'AVAILABLE' } } }, { symbol: '500325', fields: { revenue: { status: 'AVAILABLE' } } }] },
    );
    expect(result.rows.map((row) => [row.symbol, row.cohort])).toEqual([
      ['INFY', 'NSE_ONLY'], ['500325', 'BSE_ONLY'],
    ]);
  });
});
