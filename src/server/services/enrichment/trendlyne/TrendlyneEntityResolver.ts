/**
 * TrendlyneEntityResolver.ts — Resolves canonical security identities to Trendlyne stock codes
 * WealthOS V2 Mandatory Amendment
 */

import { SecurityIdentity } from '../../intelligence/contracts/SecurityIdentity.js';

export interface ResolvedTrendlyneStock {
  securityId: string;
  symbol: string;
  trendlyneCode: string;
  source: 'NSE' | 'BSE' | 'ISIN';
}

export class TrendlyneEntityResolver {
  private static instance: TrendlyneEntityResolver;

  private constructor() {}

  public static getInstance(): TrendlyneEntityResolver {
    if (!TrendlyneEntityResolver.instance) {
      TrendlyneEntityResolver.instance = new TrendlyneEntityResolver();
    }
    return TrendlyneEntityResolver.instance;
  }

  /**
   * Resolves security identity to the preferred Trendlyne identifier (preferring NSE symbol).
   */
  public resolve(identity: SecurityIdentity): ResolvedTrendlyneStock {
    const symbol = identity.nseSymbol || identity.bseCode || 'UNKNOWN';

    if (identity.nseSymbol) {
      return {
        securityId: identity.isin,
        symbol: identity.nseSymbol,
        trendlyneCode: identity.nseSymbol,
        source: 'NSE',
      };
    }

    if (identity.bseCode) {
      return {
        securityId: identity.isin,
        symbol: identity.bseCode,
        trendlyneCode: identity.bseCode,
        source: 'BSE',
      };
    }

    return {
      securityId: identity.isin,
      symbol,
      trendlyneCode: identity.isin,
      source: 'ISIN',
    };
  }
}
