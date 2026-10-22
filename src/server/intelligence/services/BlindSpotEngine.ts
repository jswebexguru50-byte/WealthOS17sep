/**
 * BlindSpotEngine.ts
 *
 * Layer 5 Blind Spot & Unknown Engine Service.
 * Implements FR-09: Explicit distinction between unknown states.
 * Enforces Article 12: A high-trust system must be capable of saying "I don't know"
 * rather than fabricating false certainty.
 */

import { ImportantUnknown, UnknownState } from '../types/ThesisDefinition.js';

export class BlindSpotEngine {
  /**
   * Generates the baseline blind-spot checklist for an issuer.
   */
  public generateBaselineChecklist(symbol: string): ImportantUnknown[] {
    return [
      {
        domain: 'RELATED_PARTY',
        question: 'Are there undisclosed related-party loans, advances, or inter-corporate deposits?',
        state: 'NOT_YET_CHECKED',
        decisionImpact: 'HIGH'
      },
      {
        domain: 'OFF_BALANCE_SHEET',
        question: 'Are there contingent liabilities or bank guarantees exceeding 25% of net worth?',
        state: 'NOT_YET_CHECKED',
        decisionImpact: 'HIGH'
      },
      {
        domain: 'LITIGATION',
        question: 'Are there promoter personal insolvency or corporate criminal proceedings pending?',
        state: 'NOT_YET_CHECKED',
        decisionImpact: 'HIGH'
      },
      {
        domain: 'CAPEX_PROGRESS',
        question: 'Has commercial commissioning of announced greenfield capex been physically verified?',
        state: 'NOT_YET_CHECKED',
        decisionImpact: 'MEDIUM'
      },
      {
        domain: 'CUSTOMER_CONCENTRATION',
        question: 'Does a single customer account for more than 30% of trailing annual revenues?',
        state: 'NOT_YET_CHECKED',
        decisionImpact: 'MEDIUM'
      }
    ];
  }

  /**
   * Updates an unknown item based on empirical search evidence.
   */
  public updateUnknownState(
    item: ImportantUnknown,
    newState: UnknownState,
    searchSummary: string
  ): ImportantUnknown {
    return {
      ...item,
      state: newState,
      lastSearchedAt: new Date().toISOString(),
      searchSummary
    };
  }

  /**
   * Filters only actionable/material blind spots (states that are NOT confirmed absent or not applicable).
   */
  public getActiveBlindSpots(items: ImportantUnknown[]): ImportantUnknown[] {
    return items.filter(i => i.state !== 'CONFIRMED_ABSENT' && i.state !== 'NOT_APPLICABLE');
  }
}
