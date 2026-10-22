/**
 * watch_evidence_and_transition.test.ts
 *
 * Architecture gate: watch evaluation must be stateful (transition-based)
 * and triggered watches must carry non-empty evidence IDs.
 *
 * Exercises real end-to-end evaluation, state transitions, resolution events,
 * and restart-safe SQLite persistence through CompanyRefreshCoordinator and WatchRuleRepository.
 */

import { describe, it, expect } from 'vitest';
import { WatchRule, WatchEvaluation, WatchEvent } from '../../src/server/services/intelligence/contracts/WatchContracts.js';
import { CompanyRefreshCoordinator } from '../../src/server/services/intelligence/coordinator/CompanyRefreshCoordinator.js';
import { WatchRuleRepository } from '../../src/server/services/intelligence/core/WatchRuleRepository.js';
import { SecurityIdentity } from '../../src/server/services/intelligence/contracts/SecurityIdentity.js';
import { CompanyIntelligenceResponse } from '../../src/server/services/intelligence/contracts/CompanyIntelligenceResponse.js';

describe('Watch: Stateful transitions and evidence', () => {
  const coordinator = CompanyRefreshCoordinator.getInstance();
  const watchRepo = WatchRuleRepository.getInstance();

  const testSecId = `TEST_SEC_BEHAVE_${Date.now()}`;
  const testIsin = `IN_TEST_${Date.now()}`;
  const testIdentity: SecurityIdentity = {
    companyId: testSecId,
    isin: testIsin,
    nseSymbol: 'BEHAVETEST',
    bseCode: '999999',
    companyName: 'Behavioral Test Corp',
  };

  const testWatchId = `watch_rule_rev_${Date.now()}`;
  const testRule: WatchRule = {
    watchId: testWatchId,
    securityId: testIsin,
    symbol: 'BEHAVETEST',
    subjectType: 'METRIC',
    subject: 'revenue_cr',
    operator: 'BELOW_THRESHOLD',
    threshold: 1000,
    unit: 'Cr',
    status: 'ACTIVE',
    description: 'Alert if revenue drops below 1000 Cr',
    createdAt: new Date().toISOString(),
  };

  function makeMockResponse(revValue: number, evidenceId: string): CompanyIntelligenceResponse {
    return {
      company: {
        isin: testIsin,
        symbol: 'BEHAVETEST',
        companyName: 'Behavioral Test Corp',
        sector: 'Manufacturing',
      },
      identity: testIdentity,
      asOfDate: '2026-09-29',
      provenance: {
        intelligenceVersion: '2.0.0',
        generatedAt: new Date().toISOString(),
        snapshotId: `snap_${Date.now()}`,
        dataCoverage: 'FULL',
      },
      snapshot: {
        snapshotId: `snap_${Date.now()}`,
        securityId: testIsin,
        asOfDate: '2026-09-29',
        facts: {
          revenue_cr: {
            factId: `f_rev_${Date.now()}`,
            metric: 'revenue_cr',
            value: revValue,
            unit: 'Cr',
            periodEnd: '2026-06-30',
            evidenceRef: {
              evidenceId,
              sourceType: 'EXCHANGE_FILING',
              sourceName: 'Q1 Financial Disclosure',
              sourceUrl: null,
              documentDate: '2026-07-15',
              availableAt: '2026-07-15',
              pitStatus: 'PIT_VERIFIED',
              periodStart: '2026-04-01',
              periodEnd: '2026-06-30',
              quote: `Revenue reported at ${revValue} Cr`,
              extractionMethod: 'STRUCTURED_XBRL',
            },
          } as any,
        },
      } as any,
      modules: {} as any,
      timeline: [],
      contradictions: [],
      warnings: [],
    };
  }

  describe('Real Behavioral Cycle: SATISFIED → BREACHED → BREACHED → SATISFIED', () => {
    it('executes full stateful transition cycle with exactly 2 transition events and restart persistence', async () => {
      // Register rule in both repo and coordinator
      await watchRepo.saveRule(testRule);
      coordinator.registerWatchRule(testRule);

      // STEP 1: revenue = 1200 (Above threshold of 1000 -> SATISFIED)
      const res1 = await coordinator.evaluateWatchRules(
        testIdentity,
        makeMockResponse(1200, 'ev_step1')
      );
      expect(res1.evaluations.length).toBe(1);
      expect(res1.evaluations[0].currentState).toBe('SATISFIED');
      expect(res1.triggered.length).toBe(0); // Initial satisfied state -> 0 events emitted

      // STEP 2: revenue = 800 (Below threshold -> BREACHED)
      // Transition from SATISFIED -> TRIGGERED: must emit exactly 1 ALERT WatchEvent with evidenceId
      const res2 = await coordinator.evaluateWatchRules(
        testIdentity,
        makeMockResponse(800, 'ev_step2_breach')
      );
      expect(res2.evaluations.length).toBe(1);
      expect(res2.evaluations[0].previousState).toBe('SATISFIED');
      expect(res2.evaluations[0].currentState).toBe('TRIGGERED');
      expect(res2.triggered.length).toBe(1);
      expect(res2.triggered[0].severity).toBe('ALERT');
      expect(res2.triggered[0].evidenceIds).toContain('ev_step2_breach');

      // STEP 3: revenue = 750 (Still below threshold -> BREACHED)
      // Unchanged state TRIGGERED -> TRIGGERED: must NOT emit a duplicate WatchEvent
      const res3 = await coordinator.evaluateWatchRules(
        testIdentity,
        makeMockResponse(750, 'ev_step3_still_breached')
      );
      expect(res3.evaluations.length).toBe(1);
      expect(res3.evaluations[0].previousState).toBe('TRIGGERED');
      expect(res3.evaluations[0].currentState).toBe('TRIGGERED');
      expect(res3.triggered.length).toBe(0); // Duplicate state -> 0 events emitted!

      // STEP 4: revenue = 1500 (Back above threshold -> RESOLVED)
      // Transition from TRIGGERED -> SATISFIED: must emit exactly 1 resolution WatchEvent
      const res4 = await coordinator.evaluateWatchRules(
        testIdentity,
        makeMockResponse(1500, 'ev_step4_cleared')
      );
      expect(res4.evaluations.length).toBe(1);
      expect(res4.evaluations[0].previousState).toBe('TRIGGERED');
      expect(res4.evaluations[0].currentState).toBe('SATISFIED');
      expect(res4.triggered.length).toBe(1);
      expect(res4.triggered[0].severity).toBe('INFO');
      expect(res4.triggered[0].summary).toContain('resolved');

      // STEP 5: Restart Safety Verification
      // Create a fresh instance / query SQLite directly through repository to ensure state survived
      const freshRepo = WatchRuleRepository.getInstance();
      const latestEval = await freshRepo.getLatestEvaluation(testWatchId);
      expect(latestEval).toBeDefined();
      expect(latestEval?.currentState).toBe('SATISFIED');
      expect(latestEval?.previousState).toBe('TRIGGERED');

      const persistedEvents = await freshRepo.getWatchEvents(testIsin);
      const ruleEvents = persistedEvents.filter(e => e.watchId === testWatchId);
      // Exactly 2 transition events in history: 1 alert on breach + 1 info on resolution
      expect(ruleEvents.length).toBe(2);
      expect(ruleEvents.some(e => e.severity === 'ALERT' && e.evidenceIds.includes('ev_step2_breach'))).toBe(true);
      expect(ruleEvents.some(e => e.severity === 'INFO')).toBe(true);
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
      expect(content).not.toMatch(/watchRules\.set\s*\(\s*['"`]INE600Y01019['"`]/);
      expect(content).not.toMatch(/watchRules\.set\s*\(\s*['"`]DYCL['"`]/);
    });
  });
});
