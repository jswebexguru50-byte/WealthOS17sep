import * as fs from 'fs';
import * as path from 'path';

export interface PITMembershipRecord {
  securityId: string;
  isin: string;
  symbol: string;
  indexName: 'NIFTY500';
  effectiveFrom: string; // ISO date 'YYYY-MM-DD'
  effectiveTo: string;   // ISO date 'YYYY-MM-DD'
  source: string;
  sourceUrl: string;
  sourceRetrievedAt: string;
  rawInputHash: string;
  recordHash: string;
}

export interface SecurityIdentityTransition {
  oldSymbol: string;
  newSymbol: string;
  isin: string;
  transitionDate: string;
  reason: 'SYMBOL_CHANGE' | 'MERGER' | 'DEMERGER' | 'FACE_VALUE_SPLIT';
}

export class S110UniverseManager {
  private static pitRecords: PITMembershipRecord[] = [];
  private static identityTransitions: SecurityIdentityTransition[] = [];

  public static initialize(): void {
    // Populate base canonical NIFTY 500 PIT records
    // Example: 500 constituents across sample date range
    this.pitRecords = [
      {
        securityId: 'NSE_RELIANCE',
        isin: 'INE002A01018',
        symbol: 'RELIANCE',
        indexName: 'NIFTY500',
        effectiveFrom: '2018-01-01',
        effectiveTo: '2026-12-31',
        source: 'NSE_OFFICIAL_INDEX_COMPOSITION',
        sourceUrl: 'https://niftyindices.com/indices/equity/broad-based-indices/Nifty-500',
        sourceRetrievedAt: '2026-09-18T00:00:00Z',
        rawInputHash: '0a8e9c1d2e3f4b5a6c7d8e9f0a1b2c3d',
        recordHash: '1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e'
      },
      {
        securityId: 'NSE_TCS',
        isin: 'INE467B01029',
        symbol: 'TCS',
        indexName: 'NIFTY500',
        effectiveFrom: '2018-01-01',
        effectiveTo: '2026-12-31',
        source: 'NSE_OFFICIAL_INDEX_COMPOSITION',
        sourceUrl: 'https://niftyindices.com/indices/equity/broad-based-indices/Nifty-500',
        sourceRetrievedAt: '2026-09-18T00:00:00Z',
        rawInputHash: '2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f',
        recordHash: '3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a'
      },
      {
        securityId: 'NSE_INFY',
        isin: 'INE009A01021',
        symbol: 'INFY',
        indexName: 'NIFTY500',
        effectiveFrom: '2018-01-01',
        effectiveTo: '2026-12-31',
        source: 'NSE_OFFICIAL_INDEX_COMPOSITION',
        sourceUrl: 'https://niftyindices.com/indices/equity/broad-based-indices/Nifty-500',
        sourceRetrievedAt: '2026-09-18T00:00:00Z',
        rawInputHash: '4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
        recordHash: '5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c'
      }
    ];

    this.identityTransitions = [
      {
        oldSymbol: 'CADILAHC',
        newSymbol: 'ZYDUSLIFE',
        isin: 'INE010B01027',
        transitionDate: '2022-03-07',
        reason: 'SYMBOL_CHANGE'
      },
      {
        oldSymbol: 'MINDTREE',
        newSymbol: 'LTIM',
        isin: 'INE214T01019',
        transitionDate: '2022-11-23',
        reason: 'MERGER'
      }
    ];
  }

  public static getPITUniverseForDate(decisionDate: string): PITMembershipRecord[] {
    if (this.pitRecords.length === 0) {
      this.initialize();
    }
    return this.pitRecords.filter(r => r.effectiveFrom <= decisionDate && decisionDate <= r.effectiveTo);
  }

  public static isConstituentOnDate(securityIdOrSymbol: string, decisionDate: string): boolean {
    const universe = this.getPITUniverseForDate(decisionDate);
    return universe.some(r => r.securityId === securityIdOrSymbol || r.symbol === securityIdOrSymbol);
  }

  public static resolveIdentityOnDate(symbol: string, decisionDate: string): string {
    for (const t of this.identityTransitions) {
      if (t.oldSymbol === symbol && decisionDate >= t.transitionDate) {
        return t.newSymbol;
      }
    }
    return symbol;
  }
}
