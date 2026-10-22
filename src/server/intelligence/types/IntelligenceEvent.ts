/**
 * IntelligenceEvent.ts
 *
 * Layer 3 Event / Fact model.
 * Captures verified corporate events from statutory filings, credit rating updates,
 * court/regulatory orders, and audited financial statements.
 * Features 18 distinct categories and a strict 4-Tier Source Hierarchy (Constitution Rule 3 & 4).
 */

// Source tier classification is based strictly on evidentiary relationship to the underlying fact:
// - TIER 1: Primary authoritative records directly establishing the legal/statutory fact (e.g., signed auditor's report regarding audit opinion, regulatory orders, stock exchange filings)
// - TIER 2: Primary corporate disclosures directly from the issuer (e.g., annual report MD&A, concalls, investor decks)
// - TIER 3: Professional secondary interpretations (e.g., credit rating agency rationale/commentary, third-party industry commentary, Tier-1 financial press analysis)
// - TIER 4: Discovery signals only (e.g., unverified news, social media, uncorroborated market rumours; cannot independently substantiate material conclusions)
export type SourceTier =
  | 'TIER_1_PRIMARY_AUTHORITATIVE'
  | 'TIER_2_PRIMARY_CORPORATE'
  | 'TIER_3_PROFESSIONAL_SECONDARY'
  | 'TIER_4_DISCOVERY';

export type EventCategory =
  | 'REGULATORY'
  | 'EXCHANGE_DISCLOSURE'
  | 'CREDIT_RATING'
  | 'AUDITOR'
  | 'LITIGATION'
  | 'GOVERNANCE'
  | 'PROMOTER'
  | 'CAPITAL_ALLOCATION'
  | 'RELATED_PARTY'
  | 'CUSTOMER_SUPPLIER'
  | 'ORDER_BOOK'
  | 'MANAGEMENT_CHANGE'
  | 'ESG_SAFETY'
  | 'INDUSTRY'
  | 'COMPETITOR'
  | 'MACRO'
  | 'REPUTABLE_NEWS'
  | 'OTHER';

export type MaterialityGrade =
  | 'INFORMATIONAL'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface IntelligenceEvent {
  eventId: string;
  issuerNseSymbol: string;
  issuerBseCode?: string;
  eventDate: string; // YYYY-MM-DD
  category: EventCategory;
  headline: string;
  description: string;
  sourceTier: SourceTier;
  sourceType: string;
  evidenceId: string; // Foreign key to EvidenceSpan
  materiality: MaterialityGrade;
  createdAt: string;
}
