/**
 * ForensicExtractionSchema.ts (Spec & Design v2.1 - Section 5 & 11)
 * Comprehensive 20-field forensic extraction schema across 6 signal categories
 * with Multi-Exchange & Listing-Segment Customization (BSE Main, NSE Main, BSE SME, NSE Emerge)
 */

export type ListingPlatform = 'BSE_MAIN' | 'NSE_MAIN' | 'BSE_SME' | 'NSE_EMERGE';

export interface ForensicExtraction {
  // --- Growth & Demand ---
  orderBookVisibilityMonths?: number; // 1 to 60
  orderBookCitation?: string;
  demandCommentaryTone?: 'strong' | 'stable' | 'muted' | 'deteriorating';
  demandCommentaryCitation?: string;
  marketShareDirection?: 'gaining' | 'stable' | 'losing' | 'not_discussed';
  marketShareCitation?: string;

  // --- Cost & Margin ---
  rawMaterialsNamed?: string[];
  passThroughPct?: number; // 0 to 100
  passThroughCitation?: string;
  pricingPowerEvidence?: string;
  hedgingPolicyDisclosed?: boolean;
  oneOffItemFlag: boolean;
  oneOffItemDescription?: string;

  // --- Capacity & Capex ---
  capacityUtilizationPct?: number; // 20 to 100
  capacityCitation?: string;
  capexGuidanceThisCallCr?: number;

  // --- Cross-Quarter Derived Fields (requires prior-context injection) ---
  capexGuidancePriorQuarterCr?: number;
  capexDeltaFlag?: 'on_track' | 'delayed' | 'accelerated' | 'not_comparable';
  revenueGuidanceThisCall?: string;
  revenueGuidancePriorQuarter?: string;
  guidanceAccuracyFlag?: 'beat' | 'met' | 'missed' | 'not_comparable';

  // --- Capital Allocation ---
  capitalAllocationStance?: string;

  // --- Metadata (always populated) ---
  scripCode: string;
  listingPlatform: ListingPlatform;
  quarter: string;
  sourceTierUsed: 'SCREENER_PDF' | 'BSE_FEED' | 'YT_SUBTITLE' | 'AUDIO_TRANSCRIBED' | 'ANNUAL_REPORT_MDA' | 'STATUTORY_FALLBACK';
  engineUsed: 'gemini' | 'groq' | 'openrouter' | 'heuristic';
  extractionTimestamp: string;
  citationVeracityScore?: number;
  confidenceScore?: number;
}

export const SANITY_BOUNDS: Record<string, [number, number]> = {
  orderBookVisibilityMonths: [1, 60],
  passThroughPct: [0, 100],
  capacityUtilizationPct: [20, 100],
};

export const CITATION_REQUIRED_FIELDS = [
  'orderBookVisibilityMonths',
  'demandCommentaryTone',
  'marketShareDirection',
  'passThroughPct',
  'capacityUtilizationPct',
];

export const FORENSIC_BM25_QUERIES = {
  growth_and_demand: 'order book backlog, revenue visibility, demand outlook, and order inflow trend',
  cost_and_pricing: 'raw material cost inflation, pass-through ability, and pricing power versus customers',
  capacity_and_capex: 'capacity utilization, brownfield expansion, and capex plans',
  guidance: 'revenue and margin guidance for the year',
  one_off_and_hedging: 'one-time exceptional items and hedging of raw material or currency exposure',
  capital_allocation: 'dividend, buyback, and debt repayment priorities',
  competitive_position: 'market share versus competitors and competitive positioning',
};

/**
 * Section 11.3: Governance Weight Multipliers by Listing Platform
 * SME/Emerge entities have thinner analyst coverage and higher asymmetric risk,
 * so Tier 0 statutory governance signals carry 1.4x weight in composite views.
 */
export const GOVERNANCE_WEIGHT_MULTIPLIER: Record<ListingPlatform, number> = {
  BSE_MAIN: 1.0,
  NSE_MAIN: 1.0,
  BSE_SME: 1.4,
  NSE_EMERGE: 1.4,
};

/**
 * Section 11.1: Regulatory Difference Constants
 */
export const REGULATORY_SEGMENT_BOUNDS = {
  SME_LODR_EXEMPTION_PAID_UP_CAPITAL_CR: 10,
  SME_LODR_EXEMPTION_NET_WORTH_CR: 25,
  SME_MIGRATION_THRESHOLD_CR: 25,
  SME_RPT_MATERIALITY_MAX_CR: 50,
  SME_RPT_MATERIALITY_TURNOVER_PCT: 10,
};

/**
 * Section 11.2: Segment-Aware Fallback Order
 * For SME / Emerge, where concalls are rare, promote Annual Report MD&A and exchange filings
 * ahead of video/audio transcription.
 */
export function getFallbackOrder(platform: ListingPlatform): Array<'SCREENER_PDF' | 'ANNUAL_REPORT_MDA' | 'BSE_FEED' | 'YT_SUBTITLE' | 'AUDIO_TRANSCRIBED' | 'STATUTORY_FALLBACK'> {
  if (platform === 'BSE_SME' || platform === 'NSE_EMERGE') {
    return ['SCREENER_PDF', 'ANNUAL_REPORT_MDA', 'BSE_FEED', 'STATUTORY_FALLBACK'];
  }
  return ['SCREENER_PDF', 'BSE_FEED', 'YT_SUBTITLE', 'AUDIO_TRANSCRIBED', 'ANNUAL_REPORT_MDA', 'STATUTORY_FALLBACK'];
}
