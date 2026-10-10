import { describe, expect, it } from 'vitest';
import { auditRows } from '../../../scripts/research_v2/fere_promotion_dry_run.js';
describe('FERE promotion dry-run', () => {
  it('reports complete verified rows and rejects incomplete DB rows', () => {
    const r=auditRows([{isin:'INE000A01001',symbol:'YUKEN',metric:'beneish_m',value:1.2,periodStart:'2025-04-01',periodEnd:'2026-03-31',scope:'CONSOLIDATED',inputFactIds:['f1'],filingHashes:['h1'],availableAt:'2026-10-10T00:00:00Z'},{isin:'INE000A01001',symbol:'YUKEN',metric:'beneish_m',value:1.1,periodEnd:'2026-03-31'}]);
    expect(r.totals).toMatchObject({rows:2,promoted:1,rejected:1}); expect(r.symbols.find(s=>s.symbol==='YUKEN')?.rejectionReasons).toContain('INVALID_SCOPE');
  });
  it('keeps all six symbols visible when the DB has no verified rows', () => { const r=auditRows([]); expect(r.symbols).toHaveLength(6); expect(r.totals.promoted).toBe(0); });
});
