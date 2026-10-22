/**
 * tests/unit/forensic_engine_v2.test.ts
 * Comprehensive automated test suite for Forensic Scrip Data Engine v2.1
 * Testing: Platform Classifier, Harvester Fallback, Circuit Breaker, Budget Guard,
 * Quality Audit, Quarantine Queue, and SHA-256 Idempotency.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ListingPlatformClassifier } from '../../src/server/services/ListingPlatformClassifier.js';
import {
  SANITY_BOUNDS,
  GOVERNANCE_WEIGHT_MULTIPLIER,
  getFallbackOrder,
  REGULATORY_SEGMENT_BOUNDS
} from '../../src/server/services/ForensicExtractionSchema.js';
import { CircuitBreaker } from '../../src/server/services/CircuitBreaker.js';
import { BudgetGuard } from '../../src/server/services/BudgetGuard.js';
import { ForensicQualityAuditService } from '../../src/server/services/ForensicQualityAuditService.js';
import { StatutoryFeedPoller } from '../../src/server/services/StatutoryFeedPoller.js';

describe('Forensic Scrip Data Engine v2.1 Test Suite', () => {

  // ------------------------------------------------------------------------
  // 1. Multi-Exchange & Segment Classification (Section 11)
  // ------------------------------------------------------------------------
  describe('ListingPlatformClassifier', () => {
    const classifier = ListingPlatformClassifier.getInstance();

    it('should classify large-cap NSE equities as NSE_MAIN', async () => {
      const res = await classifier.classify('RELIANCE');
      expect(res.listingPlatform).toBe('NSE_MAIN');
      expect(res.isSmeSegment).toBe(false);
    });

    it('should classify numeric 6-digit scrip codes as BSE_MAIN', async () => {
      const res = await classifier.classify('544412');
      expect(res.listingPlatform).toBe('BSE_MAIN');
      expect(res.isSmeSegment).toBe(false);
    });

    it('should classify explicit SME tagged scrips as BSE_SME', async () => {
      const res = await classifier.classify('543346.BSE-SME');
      expect(res.listingPlatform).toBe('BSE_SME');
      expect(res.isSmeSegment).toBe(true);
    });

    it('should classify explicit SM series scrips as NSE_EMERGE', async () => {
      const res = await classifier.classify('AAATECH-SM');
      expect(res.listingPlatform).toBe('NSE_EMERGE');
      expect(res.isSmeSegment).toBe(true);
    });
  });

  // ------------------------------------------------------------------------
  // 2. Segment-Aware Fallback Harvesting Strategy (Section 11.2)
  // ------------------------------------------------------------------------
  describe('Segment-Aware Fallback Harvesting', () => {
    it('should promote ANNUAL_REPORT_MDA and omit video/audio for SME segments', () => {
      const smeFallback = getFallbackOrder('BSE_SME');
      expect(smeFallback).toContain('ANNUAL_REPORT_MDA');
      expect(smeFallback).not.toContain('YT_SUBTITLE');
      expect(smeFallback).not.toContain('AUDIO_TRANSCRIBED');

      const emergeFallback = getFallbackOrder('NSE_EMERGE');
      expect(emergeFallback).toContain('ANNUAL_REPORT_MDA');
      expect(emergeFallback).not.toContain('YT_SUBTITLE');
    });

    it('should include full standard tier ladder for Mainboard names', () => {
      const mainFallback = getFallbackOrder('NSE_MAIN');
      expect(mainFallback[0]).toBe('SCREENER_PDF');
      expect(mainFallback).toContain('BSE_FEED');
      expect(mainFallback).toContain('YT_SUBTITLE');
      expect(mainFallback).toContain('AUDIO_TRANSCRIBED');
    });
  });

  // ------------------------------------------------------------------------
  // 3. Governance Weight Multipliers & Regulatory Bounds (Section 11.1 & 11.3)
  // ------------------------------------------------------------------------
  describe('Governance Weights & Regulatory Exemptions', () => {
    it('should apply 1.4x governance multiplier for SME / Emerge', () => {
      expect(GOVERNANCE_WEIGHT_MULTIPLIER['BSE_SME']).toBe(1.4);
      expect(GOVERNANCE_WEIGHT_MULTIPLIER['NSE_EMERGE']).toBe(1.4);
      expect(GOVERNANCE_WEIGHT_MULTIPLIER['NSE_MAIN']).toBe(1.0);
      expect(GOVERNANCE_WEIGHT_MULTIPLIER['BSE_MAIN']).toBe(1.0);
    });

    it('should specify exact statutory thresholds for LODR 17-27 exemptions', () => {
      expect(REGULATORY_SEGMENT_BOUNDS.SME_LODR_EXEMPTION_PAID_UP_CAPITAL_CR).toBe(10);
      expect(REGULATORY_SEGMENT_BOUNDS.SME_LODR_EXEMPTION_NET_WORTH_CR).toBe(25);
      expect(REGULATORY_SEGMENT_BOUNDS.SME_RPT_MATERIALITY_MAX_CR).toBe(50);
      expect(REGULATORY_SEGMENT_BOUNDS.SME_RPT_MATERIALITY_TURNOVER_PCT).toBe(10);
    });
  });

  // ------------------------------------------------------------------------
  // 4. Circuit Breaker Failsafe (Section 7.1)
  // ------------------------------------------------------------------------
  describe('CircuitBreaker Resilience', () => {
    it('should stay CLOSED on successful calls', async () => {
      const cb = new CircuitBreaker('TEST_SERVICE', 3);
      const res = await cb.call(async () => 'OK', async () => 'FALLBACK');
      expect(res).toBe('OK');
      expect(cb.state).toBe('CLOSED');
    });

    it('should trip to OPEN after threshold failures and route to fallback', async () => {
      const cb = new CircuitBreaker('TEST_FAIL_SERVICE', 2);
      const failFn = async () => { throw new Error('API 503 Outage'); };
      const fallbackFn = async () => 'FALLBACK_TRIGGERED';

      const r1 = await cb.call(failFn, fallbackFn);
      expect(r1).toBe('FALLBACK_TRIGGERED');
      expect(cb.state).toBe('CLOSED');

      const r2 = await cb.call(failFn, fallbackFn);
      expect(r2).toBe('FALLBACK_TRIGGERED');
      expect(cb.state).toBe('OPEN');

      // Subsequent call immediately returns fallback without executing failFn
      const r3 = await cb.call(failFn, fallbackFn);
      expect(r3).toBe('FALLBACK_TRIGGERED');
    });
  });

  // ------------------------------------------------------------------------
  // 5. Pre-emptive Budget Guard (Section 7.2)
  // ------------------------------------------------------------------------
  describe('BudgetGuard Pre-emptive Deferral', () => {
    it('should allow calls when usage is within 85% ceiling', async () => {
      const status = await BudgetGuard.checkBudgetBeforeCall('GEMINI');
      expect(status).toBe('PROCEED');
    });

    it('should defer calls when usage reaches or exceeds 85% ceiling', async () => {
      // Simulate 1200 calls on GEMINI (ceiling 1400, 85% is 1190)
      for (let i = 0; i < 1205; i++) {
        BudgetGuard.recordCall('TEST_ENGINE');
      }
      // For GEMINI simulate threshold reach
      for (let i = 0; i < 1205; i++) {
        BudgetGuard.recordCall('GEMINI');
      }
      const status = await BudgetGuard.checkBudgetBeforeCall('GEMINI');
      expect(status).toBe('DEFER_TO_NEXT_RUN');
    });
  });

  // ------------------------------------------------------------------------
  // 6. Quality Audit & Quarantine Queue (Section 5.4 & 8)
  // ------------------------------------------------------------------------
  describe('ForensicQualityAuditService & Sanity Bounds', () => {
    it('should pass realistic industrial operational insights', async () => {
      const mockInsights = {
        orderBookVisibilityMonths: 18,
        orderBookBacklogCr: 2500,
        orderBookDetail: 'Strong order visibility for 18 months.',
        rawMaterialExposure: 'Moderate steel exposure.',
        rawMaterialPassThroughPct: 80,
        pricingPowerDetail: 'Pass-through contracts in place.',
        capacityUtilizationPct: 75,
        verbatimCitation: 'Order book stands at 2500 Cr representing 18 months of revenues.',
        confidenceScore: 0.85,
        engineUsed: 'Gemini 3.6 Flash'
      };

      const sourceText = 'Order book stands at 2500 Cr representing 18 months of revenues with stable 75% capacity.';
      const report = await ForensicQualityAuditService.auditExtraction(
        'TESTSCRIP',
        mockInsights,
        sourceText,
        'NSE_MAIN'
      );

      expect(report.isSanityPassed).toBe(true);
      expect(report.isQuarantined).toBe(false);
      expect(report.overallQualityScore).toBeGreaterThanOrEqual(70);
    });

    it('should catch sanity bound violations (e.g. order book > 60m) and quarantine', async () => {
      const invalidInsights = {
        orderBookVisibilityMonths: 120, // VIOLATION: max is 60
        orderBookBacklogCr: 2500,
        orderBookDetail: 'Impossible order book backlog.',
        rawMaterialExposure: 'None.',
        rawMaterialPassThroughPct: 80,
        pricingPowerDetail: 'Strong.',
        capacityUtilizationPct: 75,
        verbatimCitation: 'Quoted text.',
        confidenceScore: 0.9,
        engineUsed: 'Gemini'
      };

      const report = await ForensicQualityAuditService.auditExtraction(
        'TEST_OUTLIER',
        invalidInsights,
        'Some source text.',
        'NSE_MAIN'
      );

      expect(report.isSanityPassed).toBe(false);
      expect(report.isQuarantined).toBe(true);
      expect(report.flags.some(f => f.includes('outside realistic'))).toBe(true);
    });
  });

  // ------------------------------------------------------------------------
  // 7. Statutory Feed Deduplication (Section 4.1 & NFR4)
  // ------------------------------------------------------------------------
  describe('StatutoryFeedPoller Idempotency', () => {
    const poller = StatutoryFeedPoller.getInstance();

    it('should generate deterministic SHA-256 hashes for filings', () => {
      const h1 = poller.generateHash('RELIANCE', 'XBRL_NOTE', '2026-09-15', 'audited disclosures');
      const h2 = poller.generateHash('RELIANCE', 'XBRL_NOTE', '2026-09-15', 'audited disclosures');
      const h3 = poller.generateHash('RELIANCE', 'XBRL_NOTE', '2026-09-15', 'different text');

      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });
  });
});
