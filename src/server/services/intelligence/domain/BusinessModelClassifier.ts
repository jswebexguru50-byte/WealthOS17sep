export type BusinessModel =
  | 'NON_FINANCIAL'
  | 'BANK'
  | 'NBFC'
  | 'INSURANCE'
  | 'UNKNOWN';

/**
 * BusinessModelClassifier — classifies a company's business model for engine routing.
 *
 * PRIMARY: sector and industry strings from canonical identity metadata (NSE/BSE master data).
 * ZERO ticker-guessing: if sector and industry are absent, returns UNKNOWN.
 */
export class BusinessModelClassifier {
  public static classify(symbol: string, sector?: string | null, industry?: string | null): BusinessModel {
    const cleanSector = (sector || '').toLowerCase().trim();
    const cleanIndustry = (industry || '').toLowerCase().trim();

    // ── PRIMARY: sector/industry vocabulary (canonical identity metadata) ──────
    if (cleanSector.includes('bank') || cleanIndustry.includes('bank')) {
      return 'BANK';
    }
    if (cleanSector.includes('insurance') || cleanIndustry.includes('life insurance') || cleanIndustry.includes('general insurance')) {
      return 'INSURANCE';
    }
    if (cleanSector.includes('financial') || cleanSector.includes('nbfc') || cleanIndustry.includes('housing finance') || cleanIndustry.includes('nbfc') || cleanIndustry.includes('asset management')) {
      return 'NBFC';
    }

    // If both sector and industry are absent, return UNKNOWN (zero ticker guessing)
    if (!cleanSector && !cleanIndustry) {
      return 'UNKNOWN';
    }

    return 'NON_FINANCIAL';
  }
}

