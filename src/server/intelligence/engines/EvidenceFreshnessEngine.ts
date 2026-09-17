/**
 * EvidenceFreshnessEngine.ts
 *
 * FERE v3.2 Evidence Freshness & Durability Engine.
 *
 * Core Principles:
 * 1. STALE != FALSE: A stale fact remains historically true.
 * 2. Durability is policy/configuration, NOT an intrinsic property of a FinancialFact.
 * 3. Changing freshness policy parameters does NOT mutate the underlying historical fact.
 */

import { FinancialFact, MetricFamily } from '../types/FinancialFact.js';

export type EvidenceFreshnessState =
  | 'CURRENT'
  | 'AGING'
  | 'STALE'
  | 'SUPERSEDED'
  | 'UNKNOWN';

export interface EvidenceFreshnessPolicy {
  metricFamily: MetricFamily;
  agingAfterDays: number;
  staleAfterDays: number;
  eventReset?: string;
  policyVersion: string; // e.g. "1.0"
}

export const DEFAULT_FRESHNESS_POLICIES: Record<MetricFamily, EvidenceFreshnessPolicy> = {
  'ORDER_BOOK': {
    metricFamily: 'ORDER_BOOK',
    agingAfterDays: 180,
    staleAfterDays: 365,
    policyVersion: '1.0'
  },
  'DISPATCH': {
    metricFamily: 'DISPATCH',
    agingAfterDays: 90,
    staleAfterDays: 180,
    policyVersion: '1.0'
  },
  'REVENUE': {
    metricFamily: 'REVENUE',
    agingAfterDays: 120,
    staleAfterDays: 365,
    policyVersion: '1.0'
  },
  'MARGIN': {
    metricFamily: 'MARGIN',
    agingAfterDays: 120,
    staleAfterDays: 365,
    policyVersion: '1.0'
  },
  'LEVERAGE': {
    metricFamily: 'LEVERAGE',
    agingAfterDays: 90,
    staleAfterDays: 180,
    policyVersion: '1.0'
  },
  'SOLVENCY': {
    metricFamily: 'SOLVENCY',
    agingAfterDays: 90,
    staleAfterDays: 180,
    policyVersion: '1.0'
  },
  'CONCENTRATION': {
    metricFamily: 'CONCENTRATION',
    agingAfterDays: 180,
    staleAfterDays: 365,
    policyVersion: '1.0'
  },
  'CAPACITY': {
    metricFamily: 'CAPACITY',
    agingAfterDays: 180,
    staleAfterDays: 365,
    policyVersion: '1.0'
  },
  'REGULATORY': {
    metricFamily: 'REGULATORY',
    agingAfterDays: 180,
    staleAfterDays: 730,
    policyVersion: '1.0'
  },
  'DIVIDEND': {
    metricFamily: 'DIVIDEND',
    agingAfterDays: 180,
    staleAfterDays: 365,
    policyVersion: '1.0'
  }
};

export interface FreshnessEvaluationResult {
  factId: string;
  metricFamily: MetricFamily;
  observationDate: string;
  evaluationDate: string;
  ageInDays: number;
  state: EvidenceFreshnessState;
  policyApplied: EvidenceFreshnessPolicy;
  rationale: string;
}

export class EvidenceFreshnessEngine {
  private policies: Record<MetricFamily, EvidenceFreshnessPolicy>;

  constructor(customPolicies?: Partial<Record<MetricFamily, EvidenceFreshnessPolicy>>) {
    this.policies = { ...DEFAULT_FRESHNESS_POLICIES, ...customPolicies };
  }

  /**
   * Evaluates the freshness state of a fact relative to an explicit evaluation date.
   * Does NOT mutate the underlying fact.
   */
  public evaluateFreshness(
    fact: FinancialFact,
    evaluationDateStr: string
  ): FreshnessEvaluationResult {
    // If fact was already marked SUPERSEDED by Gate B, retain SUPERSEDED
    if (fact.verificationStatus === 'SUPERSEDED') {
      const policy = this.policies[fact.metricFamily] || DEFAULT_FRESHNESS_POLICIES['REVENUE'];
      return {
        factId: fact.factId,
        metricFamily: fact.metricFamily,
        observationDate: fact.asOfDate || fact.periodEnd || fact.filingDate || '2000-01-01',
        evaluationDate: evaluationDateStr,
        ageInDays: 0,
        state: 'SUPERSEDED',
        policyApplied: policy,
        rationale: 'Fact has been superseded by an amended or restated statutory disclosure.'
      };
    }

    const obsDateStr = fact.asOfDate || fact.periodEnd || fact.filingDate;
    const policy = this.policies[fact.metricFamily] || DEFAULT_FRESHNESS_POLICIES['REVENUE'];

    if (!obsDateStr) {
      return {
        factId: fact.factId,
        metricFamily: fact.metricFamily,
        observationDate: 'UNKNOWN',
        evaluationDate: evaluationDateStr,
        ageInDays: -1,
        state: 'UNKNOWN',
        policyApplied: policy,
        rationale: 'Observation date missing on financial fact.'
      };
    }

    const obsTime = new Date(obsDateStr).getTime();
    const evalTime = new Date(evaluationDateStr).getTime();
    const diffMs = evalTime - obsTime;
    const ageInDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    let state: EvidenceFreshnessState = 'CURRENT';
    let rationale = `Fact age is ${ageInDays} days, within current threshold (${policy.agingAfterDays}d).`;

    if (ageInDays > policy.staleAfterDays) {
      state = 'STALE';
      rationale = `Fact age (${ageInDays}d) exceeds staleness threshold (${policy.staleAfterDays}d). Fact is historically valid but stale for current sizing.`;
    } else if (ageInDays > policy.agingAfterDays) {
      state = 'AGING';
      rationale = `Fact age (${ageInDays}d) exceeds aging threshold (${policy.agingAfterDays}d). Freshness decaying.`;
    }

    return {
      factId: fact.factId,
      metricFamily: fact.metricFamily,
      observationDate: obsDateStr,
      evaluationDate: evaluationDateStr,
      ageInDays,
      state,
      policyApplied: policy,
      rationale
    };
  }
}
