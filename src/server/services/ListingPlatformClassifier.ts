import sqlite3 from 'sqlite3';
import path from 'path';

export type ListingPlatform = 'BSE_MAIN' | 'NSE_MAIN' | 'BSE_SME' | 'NSE_EMERGE';

export interface PlatformClassificationResult {
  symbol: string;
  listingPlatform: ListingPlatform;
  confidence: number;
  reason: string;
  isSmeSegment: boolean;
  marketCapCr?: number;
  migratedToMainboard?: boolean;
}

export class ListingPlatformClassifier {
  private static instance: ListingPlatformClassifier;
  private db: sqlite3.Database | null = null;
  private cache: Map<string, PlatformClassificationResult> = new Map();

  private constructor() {
    const dbPath = path.resolve(process.cwd(), 'portfolio.db');
    this.db = new (sqlite3.verbose()).Database(dbPath);
  }

  public static getInstance(): ListingPlatformClassifier {
    if (!ListingPlatformClassifier.instance) {
      ListingPlatformClassifier.instance = new ListingPlatformClassifier();
    }
    return ListingPlatformClassifier.instance;
  }

  /**
   * Deterministically classifies a scrip into one of the 4 regulatory listing segments:
   * BSE_MAIN | NSE_MAIN | BSE_SME | NSE_EMERGE
   */
  public async classify(symbol: string): Promise<PlatformClassificationResult> {
    const cleanSym = symbol.replace('.NS', '').replace('.BO', '').trim().toUpperCase();

    if (this.cache.has(cleanSym)) {
      return this.cache.get(cleanSym)!;
    }

    return new Promise((resolve) => {
      if (!this.db) {
        const fallback = this.heuristicFallback(cleanSym);
        this.cache.set(cleanSym, fallback);
        return resolve(fallback);
      }

      // 1. Query MasterTickers joined with SecurityDossierSnapshots for series, exchange, and market cap
      this.db.get(
        `SELECT m.exchange, m.segment, m.series, m.name, m.lot_size, s.market_cap_cr 
         FROM MasterTickers m
         LEFT JOIN SecurityDossierSnapshots s ON s.symbol = m.symbol
         WHERE m.symbol = ? 
         LIMIT 1`,
        [cleanSym],
        (err, row: any) => {
          if (err || !row) {
            // Check SecurityDossierSnapshots directly
            this.db?.get(
              `SELECT company_name, market_cap_cr FROM SecurityDossierSnapshots WHERE symbol = ? LIMIT 1`,
              [cleanSym],
              (err2, snapRow: any) => {
                const mcap = snapRow?.market_cap_cr || undefined;
                const result = this.heuristicFallback(cleanSym, mcap);
                this.cache.set(cleanSym, result);
                resolve(result);
              }
            );
            return;
          }

          const series = (row.series || '').toUpperCase();
          const segment = (row.segment || '').toUpperCase();
          const exchange = (row.exchange || '').toUpperCase();
          const lotSize = row.lot_size || 1;
          const mcap = row.market_cap_cr || undefined;

          // Check for SME classification:
          // Criteria 1: series is 'SM' or segment is 'EMERGE' or 'SME'
          // Criteria 2: lot_size > 100 (SME lot trading rule in India)
          // Criteria 3: micro-cap with mcap <= 100 Cr and exchange is BSE -> BSE_SME
          // Criteria 4: micro-cap with mcap <= 100 Cr and exchange is NSE -> NSE_EMERGE
          const isSmallCapSme = (mcap !== undefined && mcap > 0 && mcap <= 150);

          if (series === 'SM' || segment === 'EMERGE' || (exchange === 'NSE' && isSmallCapSme && lotSize > 50)) {
            const res: PlatformClassificationResult = {
              symbol: cleanSym,
              listingPlatform: 'NSE_EMERGE',
              confidence: 0.95,
              reason: `NSE Emerge segment detected (Series: '${series}', Lot size: ${lotSize}, Mcap: ₹${mcap} Cr).`,
              isSmeSegment: true,
              marketCapCr: mcap,
              migratedToMainboard: false,
            };
            this.cache.set(cleanSym, res);
            return resolve(res);
          }

          if (segment === 'SME' || series === 'M' || series === 'MT' || (exchange === 'BSE' && isSmallCapSme)) {
            const res: PlatformClassificationResult = {
              symbol: cleanSym,
              listingPlatform: 'BSE_SME',
              confidence: 0.95,
              reason: `BSE SME platform detected (Segment: '${segment}', Series: '${series}', Mcap: ₹${mcap} Cr).`,
              isSmeSegment: true,
              marketCapCr: mcap,
              migratedToMainboard: false,
            };
            this.cache.set(cleanSym, res);
            return resolve(res);
          }

          // Mainboard classifications
          if (exchange === 'BSE' || /^\d{6}$/.test(cleanSym)) {
            const res: PlatformClassificationResult = {
              symbol: cleanSym,
              listingPlatform: 'BSE_MAIN',
              confidence: 0.95,
              reason: `Listed on BSE Main Board (${exchange}, segment ${segment || 'EQ'}, Mcap: ₹${mcap || 'N/A'} Cr).`,
              isSmeSegment: false,
              marketCapCr: mcap,
              migratedToMainboard: false,
            };
            this.cache.set(cleanSym, res);
            return resolve(res);
          }

          // Default is NSE_MAIN for regular active Indian equities
          const res: PlatformClassificationResult = {
            symbol: cleanSym,
            listingPlatform: 'NSE_MAIN',
            confidence: 0.95,
            reason: `Listed on NSE Main Board (series ${series || 'EQ'}, Mcap: ₹${mcap || 'N/A'} Cr).`,
            isSmeSegment: false,
            marketCapCr: mcap,
            migratedToMainboard: false,
          };
          this.cache.set(cleanSym, res);
          return resolve(res);
        }
      );
    });
  }

  /**
   * Fast rule-based heuristic when database rows are not available
   */
  private heuristicFallback(symbol: string, mcap?: number): PlatformClassificationResult {
    // 6-digit numeric codes are exclusively BSE
    if (/^\d{6}$/.test(symbol)) {
      return {
        symbol,
        listingPlatform: 'BSE_MAIN',
        confidence: 0.85,
        reason: 'Numeric 6-digit scrip code indicates BSE listing.',
        isSmeSegment: false,
        marketCapCr: mcap,
      };
    }

    // Explicit suffix tags
    if (symbol.endsWith('-SM') || symbol.endsWith('.EMERGE')) {
      return {
        symbol,
        listingPlatform: 'NSE_EMERGE',
        confidence: 0.99,
        reason: 'Explicit SM suffix designates NSE Emerge SME security.',
        isSmeSegment: true,
        marketCapCr: mcap,
      };
    }

    if (symbol.endsWith('-SME') || symbol.endsWith('.BSE-SME')) {
      return {
        symbol,
        listingPlatform: 'BSE_SME',
        confidence: 0.99,
        reason: 'Explicit SME suffix designates BSE SME security.',
        isSmeSegment: true,
        marketCapCr: mcap,
      };
    }

    // Default to NSE Mainboard for standard ticker symbols
    return {
      symbol,
      listingPlatform: 'NSE_MAIN',
      confidence: 0.8,
      reason: 'Standard equity ticker symbol defaulted to NSE Main Board.',
      isSmeSegment: false,
      marketCapCr: mcap,
    };
  }
}
