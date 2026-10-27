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
  public static classify(
    symbol: string,
    sector?: string | null,
    industry?: string | null,
    companyName?: string | null
  ): BusinessModel {
    const cleanSector = (sector || '').toLowerCase().trim();
    const cleanIndustry = (industry || '').toLowerCase().trim();
    const name = (companyName || '').toLowerCase().trim();

    // ── PRIMARY: sector/industry vocabulary (canonical identity metadata) ──────
    // Identity names are a stronger discriminator than the broad
    // "Financial Services" sector (which covers both banks and NBFCs).
    if (cleanSector.includes('bank') || cleanIndustry.includes('bank') || name.includes(' bank')) {
      return 'BANK';
    }
    if (cleanSector.includes('insurance') || cleanIndustry.includes('life insurance') || cleanIndustry.includes('general insurance')) {
      return 'INSURANCE';
    }
    if (cleanSector.includes('financial') || cleanSector.includes('nbfc') || cleanIndustry.includes('housing finance') || cleanIndustry.includes('nbfc') || cleanIndustry.includes('asset management')) {
      return 'NBFC';
    }

    // If sector and industry are absent, a ticker is not business-model
    // evidence. Wait for canonical identity metadata (or a company name).
    if (!cleanSector && !cleanIndustry) {
      if (name.includes('bank') || name.includes('banking')) {
        return 'BANK';
      }
      if (name.includes('insurance') || name.includes('assurance')) {
        return 'INSURANCE';
      }
      if (
        name.includes('financiers') ||
        name.includes('finance') ||
        name.includes('financial') ||
        name.includes('finserv') ||
        name.includes('housing finance') ||
        name.includes('capital') ||
        name.includes('asset management') ||
        name.includes('securities') ||
        name.includes('investments')
      ) {
        return 'NBFC';
      }
      return 'UNKNOWN';
    }

    return 'NON_FINANCIAL';
  }
}

