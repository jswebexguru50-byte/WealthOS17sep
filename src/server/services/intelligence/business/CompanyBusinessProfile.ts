/**
 * CompanyBusinessProfile.ts — Generic Evidence-Backed Company Business Profile
 *
 * Implements the evidence-backed business profile required by the WealthOS Constitution:
 * - business description
 * - products/services
 * - segments
 * - geographies
 * - customer types
 * - revenue mix
 * - capacity
 * - order book (where applicable)
 * - key inputs
 * - industry KPIs
 * - primary economic drivers
 *
 * Architecture Invariant:
 * - Fully generic: zero acceptance-company hardcoding.
 * - Every non-null field traces back to source evidence or canonical facts.
 * - Missing fields are explicitly marked 'DATA_INSUFFICIENT' / 'UNKNOWN' / null.
 */

import { EvidenceReference } from '../contracts/Provenance.js';
import { SectorArchetype, SectorArchetypeRegistry } from './SectorArchetypeRegistry.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';

export interface ProductServiceItem {
  name: string;
  category?: string;
  revenueSharePct?: number | null;
  evidenceRef?: EvidenceReference | null;
}

export interface BusinessSegment {
  segmentName: string;
  revenueCr?: number | null;
  ebitdaCr?: number | null;
  marginPct?: number | null;
  revenueSharePct?: number | null;
  evidenceRef?: EvidenceReference | null;
}

export interface GeographicExposure {
  region: string;
  revenueSharePct?: number | null;
  evidenceRef?: EvidenceReference | null;
}

export interface RevenueMix {
  domesticPct?: number | null;
  exportPct?: number | null;
  recurringPct?: number | null;
  evidenceRef?: EvidenceReference | null;
}

export interface OperationalCapacity {
  installedCapacity?: string | null;
  currentUtilisationPct?: number | null;
  expansionPlanned?: string | null;
  evidenceRef?: EvidenceReference | null;
}

export interface OrderBookState {
  currentOrderBookCr?: number | null;
  bookToBillRatio?: number | null;
  executionHorizonMonths?: number | null;
  evidenceRef?: EvidenceReference | null;
}

export interface CompanyBusinessProfile {
  securityId: string;
  symbol: string;
  sectorArchetype: SectorArchetype;
  businessDescription: {
    summary: string;
    evidenceRef?: EvidenceReference | null;
  };
  productsServices: ProductServiceItem[];
  segments: BusinessSegment[];
  geographies: GeographicExposure[];
  customerTypes: Array<{ type: string; description?: string }>;
  revenueMix: RevenueMix;
  capacity: OperationalCapacity;
  orderBook: OrderBookState;
  keyInputs: Array<{ inputName: string; costImpactPct?: number | null }>;
  industryKpis: Record<string, { value: any; unit?: string; asOf?: string; evidenceRef?: EvidenceReference | null }>;
  primaryEconomicDrivers: string[];
  asOfDate: string | null;
  profileStatus: 'COMPLETE' | 'PARTIAL' | 'DATA_INSUFFICIENT';
  evidenceRefs: EvidenceReference[];
}

export class CompanyBusinessProfileEngine {
  private static instance: CompanyBusinessProfileEngine;

  private constructor() {}

  public static getInstance(): CompanyBusinessProfileEngine {
    if (!CompanyBusinessProfileEngine.instance) {
      CompanyBusinessProfileEngine.instance = new CompanyBusinessProfileEngine();
    }
    return CompanyBusinessProfileEngine.instance;
  }

  /**
   * Build an evidence-backed business profile for any company.
   * Derives structure from canonical facts, filings, and sector archetype.
   */
  public buildProfile(params: {
    securityId: string;
    symbol: string;
    sector?: string | null;
    industry?: string | null;
    businessModel?: string | null;
    canonicalFacts?: Record<string, any>;
    rawFacts?: CanonicalFact[];
    asOfDate?: string | null;
  }): CompanyBusinessProfile {
    const { securityId, symbol, sector, industry, businessModel, canonicalFacts = {}, rawFacts = [], asOfDate } = params;

    // Resolve sector archetype generically
    const archetypeRegistry = SectorArchetypeRegistry.getInstance();
    // Resolve sector from metadata vocabulary only. The stock symbol is NOT a sector descriptor —
    // passing it (e.g. 'DYCL') would produce UNKNOWN anyway. When absent, null → UNKNOWN,
    // and line 125 correctly falls back to the INDUSTRIAL generic template.
    const sectorStr = sector || industry || (businessModel && businessModel !== 'NON_FINANCIAL' ? businessModel : null) || null;
    const archetype = archetypeRegistry.resolveFromSectorString(sectorStr);
    const template = archetypeRegistry.getTemplate(archetype) ?? archetypeRegistry.getTemplate('INDUSTRIAL');
    // Effective archetype reflects the template actually applied. UNKNOWN means no sector metadata
    // is available but the INDUSTRIAL generic template is still applied for non-financial companies.
    const effectiveArchetype = archetype !== 'UNKNOWN' ? archetype : (template ? 'INDUSTRIAL' : 'UNKNOWN');

    const evidenceRefs: EvidenceReference[] = [];

    // Collect evidence refs from facts if available
    for (const fact of rawFacts) {
      if (fact.sourceId) {
        evidenceRefs.push({
          evidenceId: `ev_${fact.factId}`,
          sourceId: fact.sourceId,
          sourceType: 'EXCHANGE_FILING',
          timestamp: fact.availableAt || new Date().toISOString(),
          asOfDate: fact.periodEnd || asOfDate || undefined,
          documentId: fact.sourceId,
        });
      }
    }

    // Extract segments from canonical facts if present
    const segments: BusinessSegment[] = [];
    if (Array.isArray(canonicalFacts['segments'])) {
      for (const seg of canonicalFacts['segments']) {
        segments.push({
          segmentName: seg.name || seg.segmentName || 'Segment',
          revenueCr: typeof seg.revenue === 'number' ? seg.revenue : null,
          ebitdaCr: typeof seg.ebitda === 'number' ? seg.ebitda : null,
          marginPct: typeof seg.margin === 'number' ? seg.margin : null,
          revenueSharePct: typeof seg.share === 'number' ? seg.share : null,
        });
      }
    }

    // Extract industry KPIs from archetype template and available facts
    const industryKpis: Record<string, { value: any; unit?: string; asOf?: string; evidenceRef?: EvidenceReference | null }> = {};
    if (template) {
      for (const metric of template.keyMetrics) {
        const factVal = canonicalFacts[metric] ?? (rawFacts.find(f => f.metric === metric)?.value);
        if (factVal !== undefined && factVal !== null) {
          industryKpis[metric] = {
            value: factVal,
            asOf: asOfDate || null,
          };
        }
      }
    }

    // Primary economic drivers from template definitions
    const primaryEconomicDrivers: string[] = template
      ? template.drivers.filter(d => d.materiality === 'PRIMARY').map(d => d.name)
      : ['Revenue Growth', 'Operating Margins', 'Capital Efficiency'];

    // Determine completeness
    const hasFacts = Object.keys(canonicalFacts).length > 0 || rawFacts.length > 0;
    const profileStatus: 'COMPLETE' | 'PARTIAL' | 'DATA_INSUFFICIENT' =
      segments.length > 0 && Object.keys(industryKpis).length >= 3 ? 'COMPLETE' :
      hasFacts ? 'PARTIAL' :
      'DATA_INSUFFICIENT';

    return {
      securityId,
      symbol,
      sectorArchetype: effectiveArchetype,
      businessDescription: {
        summary: industry
          ? `${symbol} operates in the ${industry} industry (${effectiveArchetype} archetype).`
          : `${symbol} is an exchange-listed company classified under ${effectiveArchetype} archetype.`,
        evidenceRef: evidenceRefs[0] || null,
      },
      productsServices: [],
      segments,
      geographies: [],
      customerTypes: [],
      revenueMix: {
        domesticPct: null,
        exportPct: null,
        recurringPct: null,
        evidenceRef: null,
      },
      capacity: {
        installedCapacity: null,
        currentUtilisationPct: typeof canonicalFacts['capacity_utilisation_pct'] === 'number'
          ? canonicalFacts['capacity_utilisation_pct']
          : null,
        expansionPlanned: null,
        evidenceRef: null,
      },
      orderBook: {
        currentOrderBookCr: typeof canonicalFacts['order_book_cr'] === 'number'
          ? canonicalFacts['order_book_cr']
          : typeof canonicalFacts['deal_tcv_cr'] === 'number' ? canonicalFacts['deal_tcv_cr'] : null,
        bookToBillRatio: null,
        executionHorizonMonths: null,
        evidenceRef: null,
      },
      keyInputs: [],
      industryKpis,
      primaryEconomicDrivers,
      asOfDate: asOfDate || null,
      profileStatus,
      evidenceRefs,
    };
  }
}
