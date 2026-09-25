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
  private static instance: SecurityIdentityRegistry;
  private identities: Map<string, SecurityIdentityRecord> = new Map();
  private symbolIndex: Map<string, string> = new Map(); // symbol -> securityId
  private isinIndex: Map<string, string> = new Map();   // isin -> securityId
  private isLoadedFromDb: boolean = false;

  constructor() {
    this.seedCanonicalIdentities();
  }

  public static getInstance(): SecurityIdentityRegistry {
    if (!SecurityIdentityRegistry.instance) {
      SecurityIdentityRegistry.instance = new SecurityIdentityRegistry();
    }
    return SecurityIdentityRegistry.instance;
  }

  public isReady(): boolean {
    return this.identities.size > 0;
  }

  public registerIdentity(record: SecurityIdentityRecord): void {
    this.identities.set(record.securityId, record);
    if (record.currentSymbol) {
      this.symbolIndex.set(record.currentSymbol.toUpperCase(), record.securityId);
    }
    if (record.primaryIsin) {
      this.isinIndex.set(record.primaryIsin.toUpperCase(), record.securityId);
    }
    for (const alt of record.historicalSymbols || []) {
      if (alt.symbol) {
        this.symbolIndex.set(alt.symbol.toUpperCase(), record.securityId);
      }
    }
    for (const isin of record.historicalIsins || []) {
      if (isin) {
        this.isinIndex.set(isin.toUpperCase(), record.securityId);
      }
    }
  }

  public populateFromRecords(
    records: Array<{ isin?: string; symbol?: string; name?: string; exchange?: string; segment?: string }>
  ): number {
    let count = 0;
    for (const r of records) {
      const sym = (r.symbol || '').trim().toUpperCase();
      const isin = (r.isin || '').trim().toUpperCase();
      if (!sym && !isin) continue;

      const ex = (r.exchange || 'NSE').trim().toUpperCase();
      const entityType: SecurityIdentityRecord['entityType'] =
        r.segment === 'MF' ? 'MF' : (ex === 'BSE' ? 'BSE' : (ex === 'NASDAQ' || ex === 'NYSE' ? 'US' : 'NSE'));
      const secId = `SEC_${isin || sym}_${ex}`;

      this.registerIdentity({
        securityId: secId,
        primaryIsin: isin,
        historicalIsins: [],
        currentSymbol: sym,
        historicalSymbols: [],
        entityType,
        exchange: ex,
        listingDate: '',
        delistingDate: null,
        status: 'ACTIVE',
        faceValue: 10
      });
      count++;
    }
    return count;
  }

  public async populateFromDatabase(db?: any): Promise<number> {
    try {
      const { getDB, dbAll } = await import('../../database.js');
      const activeDb = db || getDB();
      if (!activeDb) return 0;

      const rows = await dbAll<any>(
        activeDb,
        `SELECT isin, symbol, name, exchange, segment FROM MasterTickers WHERE (isin IS NOT NULL AND isin != '') OR (symbol IS NOT NULL AND symbol != '')`
      );
      if (rows && rows.length > 0) {
        const count = this.populateFromRecords(rows);
        this.isLoadedFromDb = true;
        return count;
      }
    } catch (e: any) {
      console.warn('[SecurityIdentityRegistry] DB population notice:', e.message);
    }
    return 0;
  }

  public resolveSecurityId(identifier: string): string | null {
    if (!identifier) return null;
    const clean = identifier.trim().toUpperCase();
    if (this.identities.has(clean)) return clean;
    if (this.symbolIndex.has(clean)) return this.symbolIndex.get(clean)!;
    if (this.isinIndex.has(clean)) return this.isinIndex.get(clean)!;

    // If not found and not yet loaded from DB, schedule async load
    if (!this.isLoadedFromDb) {
      this.populateFromDatabase().catch(() => {});
    }

    // Dynamic fallback generation if canonical structure is evident
    if (/^[A-Z]{3}[0-9A-Z]{9}$/.test(clean)) {
      // It's a standard ISIN format (e.g. INE...)
      const secId = `SEC_${clean}_NSE`;
      this.registerIdentity({
        securityId: secId,
        primaryIsin: clean,
        historicalIsins: [],
        currentSymbol: '',
        historicalSymbols: [],
        entityType: 'NSE',
        exchange: 'NSE',
        listingDate: '',
        delistingDate: null,
        status: 'ACTIVE',
        faceValue: 10
      });
      return secId;
    }

    return null;
  }

  public resolveBySymbol(symbol: string): SecurityIdentityRecord | undefined {
    if (!symbol) return undefined;
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
    // Dynamic loader will populate from MasterTickers once DB connection is established.
    // Asynchronous background pre-population hook:
    setImmediate(() => {
      this.populateFromDatabase().catch(() => {});
    });
  }
}
