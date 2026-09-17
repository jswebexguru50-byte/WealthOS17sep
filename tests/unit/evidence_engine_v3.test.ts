import { describe, it, expect } from 'vitest';
import { verifyCitation } from '../../pipeline/citation-verifier.cjs';
import { runQualityGate, partitionByQualityGate, CONFIDENCE_CAPS } from '../../pipeline/quality-gate.cjs';
import { isolateMdaSection, buildAssertion } from '../../pipeline/mda-extractor.cjs';

describe('Forensic Scrip Evidence Engine v3 — Phase 1 Pipeline & Constitution Tests', () => {

  describe('Citation Verifier Graded Matching', () => {
    it('should label verbatim substring as EXACT with similarity 1.0', () => {
      const quoted = 'domestic demand expanded by 18% during the fiscal';
      const source = 'The management notes that domestic demand expanded by 18% during the fiscal year under review.';
      const res = verifyCitation(quoted, source);
      expect(res.label).toBe('EXACT');
      expect(res.similarityScore).toBe(1.0);
      expect(res.matchedSpan).toBe(quoted);
    });

    it('should label minor typos/rephrasing as MINOR_MISMATCH', () => {
      const quoted = 'domestic demand expanded by 18 percent during the fiscal';
      const source = 'The management notes that domestic demand expanded by 18% during the fiscal year under review.';
      const res = verifyCitation(quoted, source);
      expect(['EXACT', 'MINOR_MISMATCH']).toContain(res.label);
      expect(res.similarityScore).toBeGreaterThanOrEqual(0.70);
    });

    it('should label empty or whitespace quotes as FABRICATED', () => {
      const res = verifyCitation('', 'Any source text');
      expect(res.label).toBe('FABRICATED');
      expect(res.similarityScore).toBe(0);
    });

    it('should label missing source text as UNVERIFIABLE', () => {
      const res = verifyCitation('Some quote', '');
      expect(res.label).toBe('UNVERIFIABLE');
      expect(res.similarityScore).toBe(0);
    });
  });

  describe('Quality Gate Structural Chokepoint & Anti-Drift', () => {
    it('should pass valid verified assertion with evidence pointer and capped confidence', () => {
      const assertion = {
        scripId: 'RELIANCE',
        field: 'demandTone',
        value: 'Resilient retail and telecom demand',
        status: 'VERIFIED',
        evidenceIds: ['doc-001:demandTone'],
        confidence: 0.70,
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0'
      };
      const gate = runQualityGate(assertion);
      expect(gate.pass).toBe(true);
      expect(gate.reason).toBeNull();
    });

    it('should reject single-source LLM assertion exceeding confidence cap of 0.70', () => {
      const assertion = {
        scripId: 'RELIANCE',
        field: 'demandTone',
        value: 'Resilient demand',
        status: 'VERIFIED',
        evidenceIds: ['doc-001:demandTone'],
        confidence: 0.85, // Exceeds 0.70 cap
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0'
      };
      const gate = runQualityGate(assertion);
      expect(gate.pass).toBe(false);
      expect(gate.reason).toContain('exceeds single-source LLM cap');
    });

    it('should reject confidence of 1.00 for external sources', () => {
      const assertion = {
        scripId: 'RELIANCE',
        field: 'capexPlans',
        value: '₹75,000 Cr planned capex',
        status: 'VERIFIED',
        evidenceIds: ['doc-001:capex'],
        confidence: 1.0, // Never 1.00
        sourceCount: 2,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0'
      };
      const gate = runQualityGate(assertion);
      expect(gate.pass).toBe(false);
      expect(gate.reason).toContain('confidence must never be 1.0');
    });

    it('should reject non-missing assertions with empty evidenceIds (Rule 1: No evidence = no conclusion)', () => {
      const assertion = {
        scripId: 'RELIANCE',
        field: 'growthDrivers',
        value: 'Digital services expansion',
        status: 'VERIFIED',
        evidenceIds: [], // Empty!
        confidence: 0.70,
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0'
      };
      const gate = runQualityGate(assertion);
      expect(gate.pass).toBe(false);
      expect(gate.reason).toContain('evidenceIds is empty');
    });

    it('should enforce that MISSING status must have null value and null confidence', () => {
      const validMissing = {
        scripId: 'RELIANCE',
        field: 'competitivePosition',
        value: null,
        status: 'MISSING',
        evidenceIds: [],
        confidence: null,
        sourceCount: 0,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0'
      };
      expect(runQualityGate(validMissing).pass).toBe(true);

      const invalidMissing = { ...validMissing, value: 'Inferred leadership' };
      expect(runQualityGate(invalidMissing).pass).toBe(false);
    });

    it('should cleanly partition batches into passed and quarantined sets', () => {
      const assertions = [
        {
          scripId: 'TCS', field: 'demandTone', value: 'Steady BFSI demand',
          status: 'VERIFIED', evidenceIds: ['ev-1'], confidence: 0.70,
          extractionMethod: 'LLM', methodologyVersion: 'v1'
        },
        {
          scripId: 'TCS', field: 'capexPlans', value: 'Data center capex',
          status: 'VERIFIED', evidenceIds: [], confidence: 0.70, // Missing evidence!
          extractionMethod: 'LLM', methodologyVersion: 'v1'
        }
      ];
      const { passed, quarantined } = partitionByQualityGate(assertions);
      expect(passed.length).toBe(1);
      expect(quarantined.length).toBe(1);
      expect(quarantined[0].reason).toContain('evidenceIds is empty');
    });
  });

  describe('MD&A Section Isolator & Assertion Builder', () => {
    it('should isolate text window under Management Discussion and Analysis heading', () => {
      const sampleAnnualReport = `
        CORPORATE OVERVIEW
        Some preliminary text here...
        
        MANAGEMENT DISCUSSION AND ANALYSIS
        The fiscal year saw strong operating leverage and demand revival across industrial automation...
        Financial highlights follow...
      `;
      const isolated = isolateMdaSection(sampleAnnualReport);
      expect(isolated).not.toBeNull();
      expect(isolated).toContain('MANAGEMENT DISCUSSION AND ANALYSIS');
      expect(isolated).toContain('demand revival across industrial automation');
    });

    it('should return null when neither MD&A nor Directors Report heading is found', () => {
      const documentWithoutMda = 'Table of Contents\nBalance Sheet\nAuditor Report';
      expect(isolateMdaSection(documentWithoutMda)).toBeNull();
    });

    it('should build assertion with MISSING status when fieldResult is null', () => {
      const assertion = buildAssertion('INFY', 'costPressures', null, 'doc-123');
      expect(assertion.status).toBe('MISSING');
      expect(assertion.value).toBeNull();
      expect(assertion.confidence).toBeNull();
      expect(assertion.evidenceIds).toEqual([]);
    });
  });
});
