/**
 * WealthOS v6.6 - Decision Conflict Resolver
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Deterministic precedence policy:
 *   RISK_BLOCK > EXECUTION_BLOCK > HARD_FILTER > EXIT > SIGNAL
 * Every final decision is fully reproducible from the evidence bus.
 */

import { Evidence } from './EvidenceBus.js';

export type FinalDecisionAction = 'BUY' | 'SELL' | 'HOLD' | 'BLOCKED';

export interface ConflictResolutionResult {
  securityId: string;
  finalDecision: FinalDecisionAction;
  winningEvidenceId: string;
  precedenceRuleApplied: string;
  overriddenEvidenceIds: string[];
  reproducible: true;
}

export class DecisionConflictResolver {
  private static instance: DecisionConflictResolver;

  public static getInstance(): DecisionConflictResolver {
    if (!DecisionConflictResolver.instance) {
      DecisionConflictResolver.instance = new DecisionConflictResolver();
    }
    return DecisionConflictResolver.instance;
  }

  public resolve(securityId: string, evidenceItems: Evidence<any>[]): ConflictResolutionResult {
    return this.resolveSecurityDecisions(securityId, evidenceItems);
  }

  public resolveSecurityDecisions(
    securityId: string,
    evidenceItems: Evidence<any>[]
  ): ConflictResolutionResult {
    // 1. RULE 1: RISK_BLOCK
    const riskBlock = evidenceItems.find(
      e => (e.type === 'DRAWDOWN_PROTECTION_GATE' || e.type === 'CONCENTRATION_LIMIT' || e.type === 'LIQUIDITY_LIMIT') &&
           e.payload?.blocked === true
    );
    if (riskBlock) {
      return {
        securityId,
        finalDecision: 'BLOCKED',
        winningEvidenceId: riskBlock.id,
        precedenceRuleApplied: 'RISK_BLOCK > ALL',
        overriddenEvidenceIds: evidenceItems.filter(e => e.id !== riskBlock.id).map(e => e.id),
        reproducible: true
      };
    }

    // 2. RULE 2: EXECUTION_GATE BLOCK
    const executionGateBlock = evidenceItems.find(
      e => e.type === 'EXECUTION_ALLOCATION' && e.payload?.allocatedShares === 0 && e.payload?.reason
    );
    if (executionGateBlock) {
      return {
        securityId,
        finalDecision: 'BLOCKED',
        winningEvidenceId: executionGateBlock.id,
        precedenceRuleApplied: 'EXECUTION_BLOCK > HARD_FILTER',
        overriddenEvidenceIds: evidenceItems.filter(e => e.id !== executionGateBlock.id).map(e => e.id),
        reproducible: true
      };
    }

    // 3. RULE 3: HARD_FILTER REJECT (e.g. FERE or Quality failure)
    const hardFilterReject = evidenceItems.find(
      e => (e.type === 'FERE_QUALITY_AUDIT' || e.type === 'VALUATION_MARGIN_OF_SAFETY') &&
           e.payload?.passed === false
    );
    if (hardFilterReject) {
      return {
        securityId,
        finalDecision: 'BLOCKED',
        winningEvidenceId: hardFilterReject.id,
        precedenceRuleApplied: 'HARD_FILTER_REJECT > SIGNAL',
        overriddenEvidenceIds: evidenceItems.filter(e => e.id !== hardFilterReject.id).map(e => e.id),
        reproducible: true
      };
    }

    // 4. RULE 4: EXIT SIGNAL
    const exitSignal = evidenceItems.find(
      e => e.type === 'TECHNICAL_SIGNAL' && (e.payload?.action === 'SELL' || e.payload?.action === 'EXIT')
    );
    if (exitSignal) {
      return {
        securityId,
        finalDecision: 'SELL',
        winningEvidenceId: exitSignal.id,
        precedenceRuleApplied: 'EXIT_SIGNAL > ENTRY_SIGNAL',
        overriddenEvidenceIds: evidenceItems.filter(e => e.id !== exitSignal.id).map(e => e.id),
        reproducible: true
      };
    }

    // 5. RULE 5: BUY SIGNAL
    const buySignal = evidenceItems.find(
      e => e.type === 'TECHNICAL_SIGNAL' && e.payload?.action === 'BUY'
    );
    if (buySignal) {
      return {
        securityId,
        finalDecision: 'BUY',
        winningEvidenceId: buySignal.id,
        precedenceRuleApplied: 'VALID_BUY_SIGNAL_WITH_ALL_FILTERS_PASSED',
        overriddenEvidenceIds: evidenceItems.filter(e => e.id !== buySignal.id).map(e => e.id),
        reproducible: true
      };
    }

    // Default: HOLD
    return {
      securityId,
      finalDecision: 'HOLD',
      winningEvidenceId: evidenceItems[0]?.id || 'NONE',
      precedenceRuleApplied: 'NO_ACTIVE_SIGNALS',
      overriddenEvidenceIds: [],
      reproducible: true
    };
  }
}
