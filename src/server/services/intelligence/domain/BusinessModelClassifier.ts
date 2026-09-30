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
 * SECONDARY HINT: known-symbol sets — applied ONLY when both sector and industry are absent.
 *   Symbol sets are a convenience bootstrap for the 5 golden companies and must NEVER override
 *   sector/industry metadata when that metadata is present.
 */
export class BusinessModelClassifier {
  // Known-symbol hints — used ONLY as a fallback when sector/industry strings are absent.
  private static readonly BANK_SYMBOLS = new Set([
    'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK',
    'INDUSINDBK', 'BANKBARODA', 'PNB', 'CANBK', 'IDFCFIRSTB',
    'AUBANK', 'FEDERALBNK', 'BANDHANBNK'
  ]);

  private static readonly NBFC_SYMBOLS = new Set([
    'BAJFINANCE', 'BAJAJFINSV', 'CHOLAFIN', 'SHRIRAMFIN',
    'MUTHOOTFIN', 'M&MFIN', 'L&TFH', 'POONAWALLA', 'MANAPPURAM'
  ]);

  private static readonly INSURANCE_SYMBOLS = new Set([
    'HDFCLIFE', 'SBILIFE', 'ICICIPRULI', 'ICICIGI', 'GICRE', 'NIACL'
  ]);

  public static classify(symbol: string, sector?: string | null, industry?: string | null): BusinessModel {
    const cleanSym = (symbol || '').toUpperCase().trim().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const cleanSector = (sector || '').toLowerCase();
    const cleanIndustry = (industry || '').toLowerCase();

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

    // ── SECONDARY HINT: symbol sets — only when sector AND industry are absent ──
    if (!sector && !industry && cleanSym) {
      if (this.BANK_SYMBOLS.has(cleanSym)) return 'BANK';
      if (this.NBFC_SYMBOLS.has(cleanSym)) return 'NBFC';
      if (this.INSURANCE_SYMBOLS.has(cleanSym)) return 'INSURANCE';
    }

    if (!sector && !industry && !cleanSym) {
      return 'UNKNOWN';
    }

    return 'NON_FINANCIAL';
  }
}

