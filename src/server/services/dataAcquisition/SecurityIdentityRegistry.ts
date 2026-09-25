import * as crypto from 'crypto';

export interface SecurityIdentityRecord {
  securityId: string;
  primaryIsin: string;
  historicalIsins: string[];
  currentSymbol: string;
  historicalSymbols: { symbol: string; validFrom: string; validTo: string | null }[];
  entityType: 'NSE' | 'BSE' | 'MF' | 'ETF' | 'US' | 'NASDAQ' | 'NYSE' | 'UNLISTED' | 'AIF';
  exchange: string;
  listingDate: string;
  delistingDate: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
  faceValue: number;
}

export class SecurityIdentityRegistry {
  private identities: Map<string, SecurityIdentityRecord> = new Map();
  private symbolIndex: Map<string, string> = new Map(); // symbol -> securityId
  private isinIndex: Map<string, string> = new Map();   // isin -> securityId

  constructor() {
    this.seedCanonicalIdentities();
  }

  public registerIdentity(record: SecurityIdentityRecord): void {
    this.identities.set(record.securityId, record);
    this.symbolIndex.set(record.currentSymbol, record.securityId);
    this.isinIndex.set(record.primaryIsin, record.securityId);
    for (const alt of record.historicalSymbols) {
      this.symbolIndex.set(alt.symbol, record.securityId);
    }
    for (const isin of record.historicalIsins) {
      this.isinIndex.set(isin, record.securityId);
    }
  }

  public resolveSecurityId(identifier: string): string | null {
    if (this.identities.has(identifier)) return identifier;
    if (this.symbolIndex.has(identifier)) return this.symbolIndex.get(identifier)!;
    if (this.isinIndex.has(identifier)) return this.isinIndex.get(identifier)!;
    return null;
  }

  public resolveBySymbol(symbol: string): SecurityIdentityRecord | undefined {
    const secId = this.resolveSecurityId(symbol);
    return secId ? this.getIdentity(secId) : undefined;
  }

  public getIdentity(securityId: string): SecurityIdentityRecord | undefined {
    return this.identities.get(securityId);
  }

  public getAllIdentities(): SecurityIdentityRecord[] {
    return Array.from(this.identities.values());
  }

  private seedCanonicalIdentities(): void {
    // ZFA Phase 1: Removed hardcoded seed list. 
    // Identity must now be populated dynamically from an authoritative master database.
  }
}
