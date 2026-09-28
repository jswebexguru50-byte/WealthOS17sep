export type BusinessModel =
  | 'NON_FINANCIAL'
  | 'BANK'
  | 'NBFC'
  | 'INSURANCE'
  | 'UNKNOWN';

export class BusinessModelClassifier {
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

    if (this.BANK_SYMBOLS.has(cleanSym)) {
      return 'BANK';
    }
    if (this.NBFC_SYMBOLS.has(cleanSym)) {
      return 'NBFC';
    }
    if (this.INSURANCE_SYMBOLS.has(cleanSym)) {
      return 'INSURANCE';
    }

    if (cleanSector.includes('bank') || cleanIndustry.includes('bank')) {
      return 'BANK';
    }
    if (cleanSector.includes('insurance') || cleanIndustry.includes('life insurance') || cleanIndustry.includes('general insurance')) {
      return 'INSURANCE';
    }
    if (cleanSector.includes('financial') || cleanSector.includes('nbfc') || cleanIndustry.includes('housing finance') || cleanIndustry.includes('nbfc') || cleanIndustry.includes('asset management')) {
      return 'NBFC';
    }

    if (!sector && !industry && !cleanSym) {
      return 'UNKNOWN';
    }

    return 'NON_FINANCIAL';
  }
}
