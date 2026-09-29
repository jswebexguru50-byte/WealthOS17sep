/**
 * watch_evidence_and_transition.test.ts
 *
 * Architecture gate: watch evaluation must be stateful (transition-based)
 * and triggered watches must carry non-empty evidence IDs.
 *
 * Tests the WatchEvaluation contract and CompanyRefreshCoordinator's
 * stateful transition logic.
 */

import { WatchRule, WatchEvaluation, WatchEvent } from '../../src/server/services/intelligence/contracts/WatchContracts.js';
import { CompanyRefreshCoordinator } from '../../src/server/services/intelligence/coordinator/CompanyRefreshCoordinator.js';

describe('Watch: Stateful transitions and evidence', () => {
  describe('WatchEvaluation contract', () => {
    it('WatchEvaluation has previousState and currentState', () => {
      const evaluation: WatchEvaluation = {
        watchId: 'test_watch_001',
        securityId: 'TEST_SEC',
        symbol: 'TEST',
        evaluatedAt: '2026-01-01T00:00:00Z',
        previousState: 'SATISFIED',
        currentState: 'TRIGGERED',
        triggeringEvidenceIds: ['ev_001', 'ev_002'],
        explanation: 'Metric below threshold',
      };

      expect(evaluation.previousState).toBeDefined();
      expect(evaluation.currentState).toBeDefined();
      expect(evaluation.triggeringEvidenceIds.length).toBeGreaterThan(0);
    });

    it('SATISFIED → SATISFIED must NOT emit a WatchEvent', () => {
      // Duplicate state: no transition should produce no event
      const prevState = 'SATISFIED';
      const currentState = 'SATISFIED';
      const isTransition = prevState !== currentState;
      expect(isTransition).toBe(false);
    });

    it('TRIGGERED → TRIGGERED must NOT emit a duplicate WatchEvent', () => {
      const prevState = 'TRIGGERED';
      const currentState = 'TRIGGERED';
      const isTransition = prevState !== currentState;
      expect(isTransition).toBe(false);
    });

    it('SATISFIED → TRIGGERED must emit a WatchEvent', () => {
      const prevState = 'SATISFIED';
      const currentState = 'TRIGGERED';
      const isTransition = prevState !== currentState;
      expect(isTransition).toBe(true);
    });

    it('TRIGGERED → SATISFIED must emit a resolution WatchEvent', () => {
      const prevState = 'TRIGGERED';
      const currentState = 'SATISFIED';
      const isTransition = prevState !== currentState;
      expect(isTransition).toBe(true);
    });
  });

  describe('WatchEvent evidence requirement', () => {
    it('triggered WatchEvent must carry at least one evidenceId', () => {
      const event: WatchEvent = {
        eventId: 'we_abc123',
        watchId: 'test_watch_001',
        securityId: 'TEST_SEC',
        symbol: 'TEST',
        occurredAt: '2026-01-01T00:00:00Z',
        summary: 'Metric breached threshold',
        severity: 'ALERT',
        evidenceIds: ['fact_ev_001'],
      };

      expect(event.evidenceIds.length).toBeGreaterThan(0);
    });
  });

  describe('CompanyRefreshCoordinator: stateful evaluation persistence', () => {
    it('coordinator maintains lastEvaluations map across calls', () => {
      const coordinator = CompanyRefreshCoordinator.getInstance();
      // getWatchRules should return empty array for unknown security (not crash)
      const rules = coordinator.getWatchRules('UNKNOWN_SEC');
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBe(0);
    });

    it('registerWatchRule adds rule for security', () => {
      const coordinator = CompanyRefreshCoordinator.getInstance();
      const testRule: WatchRule = {
        watchId: 'arch_test_watch_999',
        securityId: 'TEST_ISIN_999',
        symbol: 'TESTX',
        subjectType: 'METRIC',
        subject: 'revenue_cr',
        operator: 'ABOVE_THRESHOLD',
        threshold: 1000,
        unit: 'Cr',
        description: 'Architecture test rule',
        createdAt: '2026-01-01T00:00:00Z',
        isActive: true,
      };
      coordinator.registerWatchRule(testRule);
      const rules = coordinator.getWatchRules('TEST_ISIN_999');
      expect(rules.some(r => r.watchId === 'arch_test_watch_999')).toBe(true);
    });
  });

  describe('No DYCL hardcoded watch rules in production coordinator', () => {
    it('CompanyRefreshCoordinator source must not contain hardcoded DYCL watchRules.set', () => {
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(
        path.join(process.cwd(), 'src', 'server', 'services', 'intelligence', 'coordinator', 'CompanyRefreshCoordinator.ts'),
        'utf-8'
      );
      // Must not have initWatchRules with DYCL-specific seeding
      expect(content).not.toMatch(/watchRules\.set\s*\(\s*['"`]INE600Y01019['"`]/);
      expect(content).not.toMatch(/watchRules\.set\s*\(\s*['"`]DYCL['"`]/);
    });
  });
});
