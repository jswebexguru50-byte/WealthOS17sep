import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { FinancialMetricRegistry } from '../../src/server/services/FinancialMetricRegistry.js';

describe('XBRL Baseline Remediation & Deterministic Verification', () => {
  const db = new Database('portfolio.db', { readonly: true });
  const fereDb = new Database('data/fere/verified_filings/fere_evidence.db', { readonly: true });

  describe('1. Unit Typing & Scale Verification', () => {
    it('verifies per-share metrics are typed as INR_PER_SHARE and unscaled', () => {
      const rows = db.prepare(`
        SELECT metric, value, unit
        FROM company_facts
        WHERE metric IN ('eps_basic', 'eps_diluted', 'face_value')
          AND provider = 'FERE_NSE_XBRL'
        LIMIT 50
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.unit).toBe('INR_PER_SHARE');
        const val = parseFloat(r.value);
        if (r.metric === 'face_value') {
          expect(val).toBeGreaterThanOrEqual(0.0);
          expect(val).toBeLessThanOrEqual(100);
        }
        if (r.metric === 'eps_basic') {
          expect(Math.abs(val)).toBeLessThan(10000);
        }
      }
    });

    it('verifies ratio metrics are typed as RATIO and are dimensionless', () => {
      const rows = db.prepare(`
        SELECT metric, value, unit
        FROM company_facts
        WHERE metric IN ('debt_to_equity', 'dscr', 'roa')
          AND provider = 'FERE_NSE_XBRL'
        LIMIT 50
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.unit).toBe('RATIO');
      }
    });

    it('verifies ROA is represented as a decimal fraction, not percentage', () => {
      const rows = db.prepare(`
        SELECT value
        FROM company_facts
        WHERE metric = 'roa'
          AND provider = 'FERE_NSE_XBRL'
        LIMIT 100
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const val = parseFloat(r.value);
        // Typical quarterly bank ROA is between -5% (-0.05) and +5% (+0.05)
        expect(val).toBeGreaterThanOrEqual(-0.1);
        expect(val).toBeLessThanOrEqual(0.1);
      }
    });

    it('verifies monetary aggregates are scaled to INR_CR', () => {
      const rows = db.prepare(`
        SELECT metric, value, unit, derivationFormula
        FROM company_facts
        WHERE metric IN ('total_income', 'other_income', 'employee_expenses', 'cfi', 'cff')
          AND provider = 'FERE_NSE_XBRL'
        LIMIT 50
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.unit).toBe('INR_CR');
        expect(r.derivationFormula).toBe('value_in_inr / 10000000');
      }
    });
  });

  describe('2. Period Semantics', () => {
    it('verifies discrete periodType taxonomy prevents silent YTD relabeling', () => {
      const periodTypes = db.prepare(`
        SELECT DISTINCT periodType
        FROM company_facts
        WHERE symbol IN ('TCS', 'INFY', '20MICRONS') AND provider = 'FERE_NSE_XBRL'
      `).all().map((r: any) => r.periodType);

      expect(periodTypes).toContain('QUARTERLY');
      expect(periodTypes).toContain('ANNUAL');
    });

    it('verifies QUARTERLY facts have duration of approximately 90 days', () => {
      const samples = db.prepare(`
        SELECT periodStart, periodEnd, julianday(periodEnd) - julianday(periodStart) + 1 as duration
        FROM company_facts
        WHERE symbol IN ('TCS', 'INFY', '20MICRONS') AND provider = 'FERE_NSE_XBRL' AND periodType = 'QUARTERLY' AND periodStart IS NOT NULL
        LIMIT 50
      `).all() as any[];

      expect(samples.length).toBeGreaterThan(0);
      for (const s of samples) {
        expect(s.duration).toBeGreaterThanOrEqual(80);
        expect(s.duration).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('3. Scope Separation', () => {
    it('verifies CONSOLIDATED and STANDALONE facts have distinct factIds and do not collide', () => {
      const sample = db.prepare(`
        SELECT symbol, metric, periodEnd
        FROM company_facts
        WHERE symbol = '20MICRONS' AND provider = 'FERE_NSE_XBRL' AND scope = 'CONSOLIDATED'
        INTERSECT
        SELECT symbol, metric, periodEnd
        FROM company_facts
        WHERE symbol = '20MICRONS' AND provider = 'FERE_NSE_XBRL' AND scope = 'STANDALONE'
        LIMIT 5
      `).all() as any[];

      expect(sample.length).toBeGreaterThan(0);
      for (const s of sample) {
        const facts = db.prepare(`
          SELECT factId, scope, value
          FROM company_facts
          WHERE symbol = ? AND metric = ? AND periodEnd = ? AND provider = 'FERE_NSE_XBRL'
        `).all(s.symbol, s.metric, s.periodEnd) as any[];

        const scopes = facts.map(f => f.scope);
        expect(scopes).toContain('CONSOLIDATED');
        expect(scopes).toContain('STANDALONE');
        const factIds = new Set(facts.map(f => f.factId));
        expect(factIds.size).toBe(facts.length); // Distinct primary keys
      }
    });
  });

  describe('4. Available-At / Point-in-Time Integrity', () => {
    it('verifies availableAt strictly exceeds periodEnd with zero future leakage', () => {
      const rows = db.prepare(`
        SELECT periodEnd, availableAt
        FROM company_facts
        WHERE symbol IN ('TCS', 'INFY', '20MICRONS', 'HDFCBANK')
          AND provider = 'FERE_NSE_XBRL'
          AND availableAt IS NOT NULL
        LIMIT 200
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.availableAt > r.periodEnd).toBe(true);
      }
    });

    it('verifies availableAt is not substituted with periodEnd', () => {
      const rows = db.prepare(`
        SELECT periodEnd, availableAt
        FROM company_facts
        WHERE symbol IN ('TCS', 'INFY', '20MICRONS', 'HDFCBANK')
          AND provider = 'FERE_NSE_XBRL'
          AND availableAt IS NOT NULL
        LIMIT 200
      `).all() as any[];

      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.availableAt.startsWith(r.periodEnd)).toBe(false);
      }
    });
  });

  describe('5. Derived Metric Semantics', () => {
    it('verifies operating_plus_investing_cash_flow is defined as CFO + CFI', () => {
      const def = FinancialMetricRegistry['operating_plus_investing_cash_flow'];
      expect(def).toBeDefined();
      expect(def.canonical_metric).toBe('operating_plus_investing_cash_flow_derived');
      expect(def.required_inputs).toEqual(['cfo', 'cfi']);
      expect(def.formula({ cfo: 100, cfi: -40 })).toBe(60);
    });

    it('verifies net_debt_financing_flow is defined as debt_raised - debt_repaid', () => {
      const def = FinancialMetricRegistry['net_debt_financing_flow'];
      expect(def).toBeDefined();
      expect(def.canonical_metric).toBe('net_debt_financing_flow_derived');
      expect(def.required_inputs).toEqual(['debt_raised', 'debt_repaid']);
      expect(def.formula({ debt_raised: 50, debt_repaid: 30 })).toBe(20);
    });

    it('verifies fcf is NOT defined as CFO + CFI and enforces capex requirement', () => {
      const def = FinancialMetricRegistry['fcf'];
      expect(def).toBeDefined();
      expect(def.required_inputs).toContain('capex_cash_outflow');
      expect(def.required_inputs).not.toContain('cfi');
      expect(def.formula({ cfo: 100, cfi: -40 })).toBe('MISSING');
      expect(def.formula({ cfo: 100, cfi: -40, capex_cash_outflow: 25 })).toBe(75);
      expect(def.formula({ cfo: 100, capex_cash_outflow: -25 })).toBe(75);
    });

    it('verifies fcf-derived ratios compute only from verified capex, not aggregate CFI', () => {
      const margin = FinancialMetricRegistry['fcf_margin'];
      const patRatio = FinancialMetricRegistry['fcf_pat_ratio'];
      expect(margin.required_inputs).toEqual(['cfo', 'capex_cash_outflow', 'revenue']);
      expect(patRatio.required_inputs).toEqual(['cfo', 'capex_cash_outflow', 'pat']);

      expect(margin.formula({ cfo: 100, cfi: -40, revenue: 500 })).toBe('MISSING');
      expect(patRatio.formula({ cfo: 100, cfi: -40, pat: 50 })).toBe('MISSING');
      expect(margin.formula({ cfo: 100, capex_cash_outflow: 25, revenue: 500 })).toBe(15);
      expect(patRatio.formula({ cfo: 100, capex_cash_outflow: 25, pat: 50 })).toBe(1.5);
      expect(margin.formula({ cfo: 100, capex_cash_outflow: 25, revenue: 0 })).toBe('NOT_MEANINGFUL');
      expect(patRatio.formula({ cfo: 100, capex_cash_outflow: 25, pat: 0 })).toBe('NOT_MEANINGFUL');
    });

    it('verifies XBRL capex purchase fields are canonical without relabelling total CFI as capex', () => {
      const ppeRows = fereDb.prepare(`
        SELECT COUNT(*) AS count
        FROM verified_xbrl_fact
        WHERE taxonomy_field = 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'
      `).get() as any;
      const cfiRows = fereDb.prepare(`
        SELECT COUNT(*) AS count
        FROM verified_xbrl_fact
        WHERE taxonomy_field = 'CashFlowsFromUsedInInvestingActivities'
      `).get() as any;

      expect(ppeRows.count).toBeGreaterThan(0);
      expect(cfiRows.count).toBeGreaterThan(0);
      expect(FinancialMetricRegistry['fcf'].required_inputs).not.toContain('cfi');
    });
  });

  describe('6. Source-to-Canonical Traceability', () => {
    it('verifies promoted facts include full audit traceability', () => {
      const row = db.prepare(`
        SELECT sourceDocumentId, sourceUrl, evidenceText, inputFactIds, providerToken, exactProviderLabel
        FROM company_facts
        WHERE symbol = '20MICRONS' AND provider = 'FERE_NSE_XBRL' AND metric = 'total_income'
        LIMIT 1
      `).get() as any;

      expect(row).toBeDefined();
      expect(row.sourceDocumentId).toMatch(/^FERE_XBRL:/);
      expect(row.sourceUrl).toMatch(/^https:\/\/nsearchives\.nseindia\.com/);
      expect(row.exactProviderLabel).toBe('Income');
      expect(row.providerToken).toBe('xbrl_income');
      const evidence = JSON.parse(row.evidenceText);
      expect(evidence.taxonomyField).toBe('Income');
      expect(evidence.conversion).toBe('value_in_inr / 10000000');
    });
  });
});
