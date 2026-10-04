import { describe, it, expect } from 'vitest';
import {
  resolveSmartMoneyClassification,
  resolveWalkTheTalk,
  resolveRiskRating,
  resolveFcf,
  resolveOpm
} from '../../scripts/fundamental/generate_restored_8sheet_dossier.js';

describe('Exporter Purity — Zero Ticker-Specific Analytical Logic', () => {
  const testSymbols = ['AETHER', 'GLOBALPET', 'CAPILLARY', 'RRKABEL', 'TATASTEEL', 'RANDOM_CO'];

  describe('Smart Money Classification Purity', () => {
    it('returns strictly identical VERIFIED_NAMED_ACCUMULATION for any symbol with named institutional deals', () => {
      const deals = [
        { client_name: 'SBI MUTUAL FUND', deal_type: 'BUY', quantity: 100000, trade_price: 500 }
      ];
      const techSnapshot = { latestClose: { value: 500 }, stockMomentumStatus: { value: 'BULLISH' } };

      const baseline = resolveSmartMoneyClassification('BASELINE', techSnapshot, deals);
      expect(baseline.status).toBe('VERIFIED_NAMED_ACCUMULATION');

      for (const sym of testSymbols) {
        const res = resolveSmartMoneyClassification(sym, techSnapshot, deals);
        expect(res.status).toBe(baseline.status);
        expect(res.rationale).toBe(baseline.rationale);
      }
    });

    it('returns strictly identical SUPPORTIVE_MARKET_ACTIVITY for any symbol with bullish momentum and positive 20D return', () => {
      const deals: any[] = [];
      const techSnapshot = {
        latestClose: { value: 500 },
        stockMomentumStatus: { value: 'BULLISH_CONVERGENCE' },
        stockReturn20D: { value: 12.5 }
      };

      const baseline = resolveSmartMoneyClassification('BASELINE', techSnapshot, deals);
      expect(baseline.status).toBe('SUPPORTIVE_MARKET_ACTIVITY');

      for (const sym of testSymbols) {
        const res = resolveSmartMoneyClassification(sym, techSnapshot, deals);
        expect(res.status).toBe(baseline.status);
        expect(res.rationale).toBe(baseline.rationale);
      }
    });

    it('returns strictly identical NO_VERIFIED_RECENT_ACCUMULATION_EVIDENCE for any symbol with ordinary volume and no deals', () => {
      const deals: any[] = [];
      const techSnapshot = {
        latestClose: { value: 500 },
        stockMomentumStatus: { value: 'NEUTRAL' },
        stockReturn20D: { value: -2.0 }
      };

      const baseline = resolveSmartMoneyClassification('BASELINE', techSnapshot, deals);
      expect(baseline.status).toBe('NO_VERIFIED_RECENT_ACCUMULATION_EVIDENCE');

      for (const sym of testSymbols) {
        const res = resolveSmartMoneyClassification(sym, techSnapshot, deals);
        expect(res.status).toBe(baseline.status);
        expect(res.rationale).toBe(baseline.rationale);
      }
    });

    it('returns strictly identical DATA_INSUFFICIENT for any symbol when technical snapshot is empty', () => {
      const deals: any[] = [];
      const techSnapshot = {};

      const baseline = resolveSmartMoneyClassification('BASELINE', techSnapshot, deals);
      expect(baseline.status).toBe('DATA_INSUFFICIENT');

      for (const sym of testSymbols) {
        const res = resolveSmartMoneyClassification(sym, techSnapshot, deals);
        expect(res.status).toBe(baseline.status);
        expect(res.rationale).toBe(baseline.rationale);
      }
    });
  });

  describe('Walk-the-Talk Classification Purity', () => {
    it('returns strictly identical DELIVERED for any symbol with met statutory commitments', () => {
      const commitments = [{ status: 'MET', statement_date: '2025-03-31', category: 'CAPEX' }];
      const baseline = resolveWalkTheTalk('BASELINE', commitments);
      expect(baseline.verdict).toBe('DELIVERED');

      for (const sym of testSymbols) {
        const res = resolveWalkTheTalk(sym, commitments);
        expect(res.verdict).toBe(baseline.verdict);
        expect(res.note).toBe(baseline.note);
      }
    });

    it('returns strictly identical MISSED for any symbol with missed commitments', () => {
      const commitments = [{ status: 'MISSED', statement_date: '2025-03-31', category: 'REVENUE' }];
      const baseline = resolveWalkTheTalk('BASELINE', commitments);
      expect(baseline.verdict).toBe('MISSED');

      for (const sym of testSymbols) {
        const res = resolveWalkTheTalk(sym, commitments);
        expect(res.verdict).toBe(baseline.verdict);
        expect(res.note).toBe(baseline.note);
      }
    });

    it('returns strictly identical NOT_VERIFIABLE for any symbol with no commitments', () => {
      const commitments: any[] = [];
      const baseline = resolveWalkTheTalk('BASELINE', commitments);
      expect(baseline.verdict).toBe('NOT_VERIFIABLE');

      for (const sym of testSymbols) {
        const res = resolveWalkTheTalk(sym, commitments);
        expect(res.verdict).toBe(baseline.verdict);
        expect(res.note).toBe(baseline.note);
      }
    });
  });

  describe('Risk Rating Semantics Purity (Directive 6)', () => {
    it('sets Business Risk to NOT_ASSESSED regardless of missing data checklist size or symbol', () => {
      const riskSnapshotManyGaps = {
        missingDataChecklist: ['PE', 'PEG', 'CFO', 'CAPEX', 'OPM', 'ROCE'],
        actionReadiness: { canBacktest: { enabled: true }, canPaperTrade: { enabled: false } }
      };

      const baseline = resolveRiskRating(riskSnapshotManyGaps);
      expect(baseline.businessRisk).toBe('NOT_ASSESSED');
      expect(baseline.actionReadinessNote).toContain('Can Backtest: YES | Can Paper Trade: NO');
      expect(baseline.actionReadinessNote).toContain('Business Risk: NOT_ASSESSED');

      // Even with 0 gaps, business risk is NOT fabricated into LOW/MEDIUM/HIGH
      const riskSnapshotZeroGaps = {
        missingDataChecklist: [],
        actionReadiness: { canBacktest: { enabled: true }, canPaperTrade: { enabled: true } }
      };
      const resZero = resolveRiskRating(riskSnapshotZeroGaps);
      expect(resZero.businessRisk).toBe('NOT_ASSESSED');
    });
  });

  describe('Cash Flow and Profitability Purity (Zero Synthetic Values)', () => {
    it('resolves FCF numerically when both CFO and Capex exist', () => {
      const res = resolveFcf(100.5, 30.2);
      expect(res.fcfCellVal).toBe(70.3);
      expect(res.fcfText).toBe('₹70.30 Cr');
    });

    it('preserves DATA_INSUFFICIENT without synthesizing Capex to zero when Capex is missing', () => {
      const res = resolveFcf(100.5, null);
      expect(res.fcfCellVal).toBe('DATA_INSUFFICIENT (Capex Missing)');
      expect(res.fcfText).toContain('zero synthetic FCF applied');
    });

    it('preserves DATA_INSUFFICIENT when both CFO and Capex are missing', () => {
      const res = resolveFcf(null, null);
      expect(res.fcfCellVal).toBe('DATA_INSUFFICIENT');
      expect(res.fcfText).toBe('DATA_INSUFFICIENT (CFO & Capex Missing)');
    });

    it('resolves OPM percentage and cell values without ticker branching', () => {
      const resReported = resolveOpm(22.5, 20.0);
      expect(resReported.opmLatestCell).toBe(0.225);
      expect(resReported.opm1QAgoCell).toBe(0.200);
      expect(resReported.opmText).toBe('Operating Margin: 22.50%');

      const resNull = resolveOpm(null, null);
      expect(resNull.opmLatestCell).toBe('DATA_INSUFFICIENT');
      expect(resNull.opmText).toContain('DATA_INSUFFICIENT');
    });
  });
});
