/**
 * CompanyEvent.ts — Constitution Article C6 (Timeline Ledger)
 *
 * Real, verifiable corporate event in the company's timeline ledger.
 */

import { EvidenceRef } from './EvidenceRef.js';

export type CompanyEventType =
  | 'FINANCIAL_RESULT'
  | 'MANAGEMENT_GUIDANCE'
  | 'ORDER_WIN'
  | 'CAPEX_ANNOUNCEMENT'
  | 'MANAGEMENT_CHANGE'
  | 'INSIDER_TRANSACTION'
  | 'SHAREHOLDING_CHANGE'
  | 'CORPORATE_ACTION'
  | 'CREDIT_RATING_CHANGE'
  | 'REGULATORY_COMPLIANCE'
  | 'MATERIAL_PRICE_MOVE'
  | 'AUDITOR_ACTION';

export type EventMateriality = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CompanyEvent {
  eventId: string;
  securityId: string;
  eventType: CompanyEventType;
  occurredAt: string;         // ISO date when event actually took place
  availableAt: string;        // ISO timestamp when disclosed to public
  materiality: EventMateriality;
  title: string;
  description: string;
  evidenceRefs: EvidenceRef[];
  affectedDomains: Array<'FUNDAMENTALS' | 'MANAGEMENT' | 'VALUATION' | 'TECHNICAL' | 'GOVERNANCE'>;
  metricImpact?: {
    metric: string;
    previousValue?: number | string | null;
    newValue?: number | string | null;
  };
}
