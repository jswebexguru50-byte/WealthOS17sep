import * as crypto from 'crypto';

export interface SecurityIdentityRecord {
  securityId: string;
  primaryIsin: string;
  historicalIsins: string[];
  currentSymbol: string;
  historicalSymbols: { symbol: string; validFrom: string; validTo: string | null }[];
  exchange: 'NSE' | 'BSE';
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

  public getIdentity(securityId: string): SecurityIdentityRecord | undefined {
    return this.identities.get(securityId);
  }

  public getAllIdentities(): SecurityIdentityRecord[] {
    return Array.from(this.identities.values());
  }

  private seedCanonicalIdentities(): void {
    // Seed primary representative securities across Indian equity segments
    const seedList: { sym: string; isin: string; listDate: string; status: 'ACTIVE' | 'DELISTED' }[] = [
      { sym: 'RELIANCE', isin: 'INE002A01018', listDate: '1995-11-29', status: 'ACTIVE' },
      { sym: 'TCS', isin: 'INE467B01029', listDate: '2004-08-25', status: 'ACTIVE' },
      { sym: 'HDFCBANK', isin: 'INE040A01034', listDate: '1995-05-19', status: 'ACTIVE' },
      { sym: 'ICICIBANK', isin: 'INE090A01021', listDate: '1997-09-17', status: 'ACTIVE' },
      { sym: 'INFY', isin: 'INE009A01021', listDate: '1993-06-14', status: 'ACTIVE' },
      { sym: 'ITC', isin: 'INE154A01025', listDate: '1995-11-01', status: 'ACTIVE' },
      { sym: 'SBIN', isin: 'INE062A01020', listDate: '1995-03-01', status: 'ACTIVE' },
      { sym: 'BHARTIARTL', isin: 'INE397D01024', listDate: '2002-02-15', status: 'ACTIVE' },
      { sym: 'KOTAKBANK', isin: 'INE237A01028', listDate: '1996-01-03', status: 'ACTIVE' },
      { sym: 'LT', isin: 'INE018A01030', listDate: '2004-06-23', status: 'ACTIVE' },
      { sym: 'HINDUNILVR', isin: 'INE030A01027', listDate: '1995-01-01', status: 'ACTIVE' },
      { sym: 'AXISBANK', isin: 'INE238A01034', listDate: '1998-11-16', status: 'ACTIVE' },
      { sym: 'TATAMOTORS', isin: 'INE155A01022', listDate: '1995-01-01', status: 'ACTIVE' },
      { sym: 'TATASTEEL', isin: 'INE081A01020', listDate: '1995-01-01', status: 'ACTIVE' },
      { sym: 'MARUTI', isin: 'INE585B01010', listDate: '2003-07-09', status: 'ACTIVE' },
      { sym: 'SUNPHARMA', isin: 'INE044A01036', listDate: '1995-02-08', status: 'ACTIVE' },
      { sym: 'BAJFINANCE', isin: 'INE296A01024', listDate: '2003-01-29', status: 'ACTIVE' },
      { sym: 'ADANIENT', isin: 'INE423A01024', listDate: '1997-06-04', status: 'ACTIVE' },
      { sym: 'TITAN', isin: 'INE280A01028', listDate: '1995-01-01', status: 'ACTIVE' },
      { sym: 'WIPRO', isin: 'INE075A01022', listDate: '1995-11-08', status: 'ACTIVE' }
    ];

    for (const item of seedList) {
      const secId = `SEC_${item.isin}`;
      this.registerIdentity({
        securityId: secId,
        primaryIsin: item.isin,
        historicalIsins: [],
        currentSymbol: item.sym,
        historicalSymbols: [{ symbol: item.sym, validFrom: item.listDate, validTo: null }],
        exchange: 'NSE',
        listingDate: item.listDate,
        delistingDate: item.status === 'DELISTED' ? '2023-01-01' : null,
        status: item.status === 'ACTIVE' ? 'ACTIVE' : 'DELISTED',
        faceValue: 1.0
      });
    }
  }
}
