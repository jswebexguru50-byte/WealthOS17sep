import { StopTheLineError } from './StopTheLineRegistry';

export interface PITEvidence {
  decisionId: string;
  securityId: string;

  factType: string;

  asOfDate: string;
  availableAt: string;

  value: unknown;
  unit?: string;

  sourceId: string;
  sourceVersion?: string;

  rawInputHash: string;
  normalizedHash: string;

  identityHash: string;
  provenanceHash: string;

  pitValid: boolean;
}

export interface DecisionContext {
  decisionId: string;
  decisionDate: string;
  decisionTimestamp: string;
}

export interface PITValidationResult {
  status: 'PASS' | 'FAIL';
  reason?: string;
}

export class PITDecisionEvidenceValidator {
  public validatePITFact(fact: PITEvidence, decision: DecisionContext, expectedIdentityHash: string): PITValidationResult {
    // Prevent lookahead: Must be available at or before decision timestamp
    if (fact.availableAt > decision.decisionTimestamp) {
      return { status: 'FAIL', reason: 'LOOKAHEAD' };
    }

    if (fact.identityHash !== expectedIdentityHash) {
      return { status: 'FAIL', reason: 'IDENTITY_MISMATCH' };
    }

    if (!fact.sourceId) {
      return { status: 'FAIL', reason: 'MISSING_PROVENANCE' };
    }

    if (!fact.rawInputHash) {
      return { status: 'FAIL', reason: 'MISSING_RAW_HASH' };
    }

    return { status: 'PASS' };
  }

  public assertNoCurrentUniverseFallback(usedFallback: boolean, context: string): void {
    if (usedFallback) {
      throw new StopTheLineError('CURRENT_UNIVERSE_FALLBACK', `Fallback to current universe detected in ${context}`);
    }
  }

  public validateEvidenceCollection(
    facts: PITEvidence[], 
    decisions: DecisionContext[], 
    identityMap: Map<string, string>
  ) {
    let validRequiredFacts = 0;
    let lookaheadFacts = 0;
    let identityFailures = 0;
    let provenanceFailures = 0;

    for (const fact of facts) {
      const decision = decisions.find(d => d.decisionId === fact.decisionId);
      if (!decision) continue;

      const expectedIdentity = identityMap.get(fact.securityId) || '';
      const result = this.validatePITFact(fact, decision, expectedIdentity);

      if (result.status === 'PASS') {
        validRequiredFacts++;
        fact.pitValid = true;
      } else {
        fact.pitValid = false;
        if (result.reason === 'LOOKAHEAD') lookaheadFacts++;
        if (result.reason === 'IDENTITY_MISMATCH') identityFailures++;
        if (result.reason === 'MISSING_PROVENANCE' || result.reason === 'MISSING_RAW_HASH') provenanceFailures++;
        
        throw new StopTheLineError(`PIT_${result.reason}` as any, `PIT fact failed validation for decision ${decision.decisionId}`);
      }
    }

    const coveragePct = facts.length > 0 ? (validRequiredFacts / facts.length) * 100 : 0;

    return {
      requiredFacts: facts.length,
      validFacts: validRequiredFacts,
      lookaheadFacts,
      identityFailures,
      provenanceFailures,
      coveragePct
    };
  }
}
