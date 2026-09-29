import * as crypto from 'crypto';

export type SecuritySegment =
  | 'NSE'
  | 'BSE'
  | 'ETF'
  | 'MF'
  | 'Index'
  | 'US equity'
  | 'NASDAQ'
  | 'NYSE'
  | 'AIF'
  | 'unlisted';

export interface SecurityIdentityRecord {
  securityId: string;
  isin: string | null;
  nseSymbol: string | null;
  bseCode: string | null;
  exchange: string;
  segment: SecuritySegment;
  instrumentType: string;
  provider?: string | null;
  providerInstrumentId?: string | null;
  validFrom: string;
  validTo: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
  verifiedAt: string;

  // Compatibility aliases
  primaryIsin?: string;
  historicalIsins?: string[];
  currentSymbol?: string;
  historicalSymbols?: { symbol: string; validFrom: string; validTo: string | null }[];
  entityType?: 'NSE' | 'BSE' | 'MF' | 'ETF' | 'US' | 'NASDAQ' | 'NYSE' | 'UNLISTED' | 'AIF';
  listingDate?: string;
  delistingDate?: string | null;
  faceValue?: number;
}

export type IdentityResolution =
  | { status: 'VERIFIED'; securityId: string; record?: SecurityIdentityRecord }
  | { status: 'IDENTITY_REVIEW'; identifier: string; reason: string };

export class SecurityIdentityRegistry {
  private static instance: SecurityIdentityRegistry;
  private identities: Map<string, SecurityIdentityRecord> = new Map();
  private symbolIndex: Map<string, string> = new Map(); // symbol -> securityId
  private isinIndex: Map<string, string> = new Map();   // isin -> securityId
  private providerIndex: Map<string, string> = new Map(); // provider:id -> securityId
  private isLoadedFromDb: boolean = false;
  private loadPromise: Promise<number> | null = null;

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

  public async ensureLoaded(db?: any): Promise<number> {
    if (this.isLoadedFromDb && this.identities.size > 0) {
      return this.identities.size;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.populateFromDatabase(db);
    return this.loadPromise;
  }

  public registerIdentity(record: SecurityIdentityRecord): void {
    this.identities.set(record.securityId, record);
    
    if (record.nseSymbol) {
      this.symbolIndex.set(record.nseSymbol.toUpperCase(), record.securityId);
    }
    if (record.currentSymbol) {
      this.symbolIndex.set(record.currentSymbol.toUpperCase(), record.securityId);
    }
    if (record.isin) {
      this.isinIndex.set(record.isin.toUpperCase(), record.securityId);
    }
    if (record.primaryIsin) {
      this.isinIndex.set(record.primaryIsin.toUpperCase(), record.securityId);
    }
    if (record.provider && record.providerInstrumentId) {
      this.providerIndex.set(`${record.provider.toUpperCase()}:${record.providerInstrumentId.toUpperCase()}`, record.securityId);
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
    records: Array<{ 
      id?: string;
      isin?: string; 
      symbol?: string; 
      name?: string; 
      exchange?: string; 
      segment?: string;
      bse_code?: string;
      nse_symbol?: string;
      instrument_type?: string;
      provider?: string;
      provider_instrument_id?: string;
      upstox_key_nse?: string;
      upstox_key_bse?: string;
      verified_at?: string;
      status?: string;
    }>
  ): number {
    let count = 0;
    for (const r of records) {
      const sym = (r.nse_symbol || r.symbol || '').trim().toUpperCase();
      const isin = (r.isin || '').trim().toUpperCase();
      const bseCode = (r.bse_code || (r.exchange === 'BSE' ? r.symbol : '') || '').trim();
      if (!sym && !isin && !bseCode && !r.id) continue;

      const ex = (r.exchange || (bseCode && !sym ? 'BSE' : 'NSE')).trim().toUpperCase();
      
      // Determine canonical segment
      let segment: SecuritySegment = 'NSE';
      const rawSeg = (r.segment || '').trim().toUpperCase();
      if (rawSeg === 'MF' || rawSeg === 'MUTUAL_FUND') segment = 'MF';
      else if (rawSeg === 'ETF') segment = 'ETF';
      else if (rawSeg === 'INDEX') segment = 'Index';
      else if (rawSeg === 'AIF') segment = 'AIF';
      else if (ex === 'BSE') segment = 'BSE';
      else if (ex === 'NASDAQ') segment = 'NASDAQ';
      else if (ex === 'NYSE') segment = 'NYSE';
      else if (ex === 'US' || ex === 'USA') segment = 'US equity';
      else if (rawSeg === 'UNLISTED') segment = 'unlisted';
      else segment = 'NSE';

      // Canonical securityId: prioritize ISIN, then verified MasterTicker ID, never synthetic SEC_sym_NSE
      const secId = isin && isin.length === 12
        ? isin
        : (r.id || (ex && sym ? `${ex}:${sym}` : sym || bseCode));

      const entityType: SecurityIdentityRecord['entityType'] =
        segment === 'MF' ? 'MF' : (segment === 'ETF' ? 'ETF' : (segment === 'BSE' ? 'BSE' : (segment === 'NASDAQ' || segment === 'NYSE' || segment === 'US equity' ? 'US' : 'NSE')));

      const provider = r.provider || (r.upstox_key_nse ? 'UPSTOX' : null);
      const providerInstrumentId = r.provider_instrument_id || r.upstox_key_nse || r.upstox_key_bse || null;

      this.registerIdentity({
        securityId: secId,
        isin: isin || null,
        nseSymbol: sym || null,
        bseCode: bseCode || null,
        exchange: ex,
        segment,
        instrumentType: r.instrument_type || 'EQUITY',
        provider,
        providerInstrumentId,
        validFrom: '',
        validTo: null,
        status: (r.status as any) || 'ACTIVE',
        verifiedAt: r.verified_at || new Date().toISOString(),

        // Compatibility aliases
        primaryIsin: isin,
        historicalIsins: [],
        currentSymbol: sym,
        historicalSymbols: [],
        entityType,
        listingDate: '',
        delistingDate: null,
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
        `SELECT id, isin, symbol, name, exchange, segment, upstox_key_nse, upstox_key_bse, status 
         FROM MasterTickers 
         WHERE (isin IS NOT NULL AND isin != '') OR (symbol IS NOT NULL AND symbol != '')`
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

  public resolveSecurityId(identifier: string): IdentityResolution {
    if (!identifier) {
      return {
        status: 'IDENTITY_REVIEW',
        identifier: '',
        reason: 'Empty identifier provided',
      };
    }
    const clean = identifier.trim().toUpperCase();
    
    // Check direct securityId, symbolIndex, isinIndex, or providerIndex
    const securityId = 
      this.identities.has(clean) ? clean :
      this.symbolIndex.get(clean) ??
      this.isinIndex.get(clean) ??
      this.providerIndex.get(clean);

    if (securityId) {
      const record = this.identities.get(securityId);
      return { status: 'VERIFIED', securityId, record };
    }

    // Schedule background load if not yet populated
    if (!this.isLoadedFromDb && !this.loadPromise) {
      this.ensureLoaded().catch(() => {});
    }

    return {
      status: 'IDENTITY_REVIEW',
      identifier: clean,
      reason: 'No authoritative symbol/ISIN/provider mapping exists in canonical registry',
    };
  }

  public async resolveSecurityIdAsync(identifier: string): Promise<IdentityResolution> {
    if (!this.isLoadedFromDb) {
      await this.ensureLoaded();
    }
    return this.resolveSecurityId(identifier);
  }

  public resolveBySymbol(symbol: string): SecurityIdentityRecord | undefined {
    if (!symbol) return undefined;
    const resolution = this.resolveSecurityId(symbol);
    return resolution.status === 'VERIFIED' ? this.getIdentity(resolution.securityId) : undefined;
  }

  public getIdentity(securityId: string): SecurityIdentityRecord | undefined {
    return this.identities.get(securityId);
  }

  public getAllIdentities(): SecurityIdentityRecord[] {
    return Array.from(this.identities.values());
  }

  private seedCanonicalIdentities(): void {
    const ACCEPTANCE_SEEDS: Array<{ secId: string; isin: string; nse: string; bse: string }> = [
      { secId: 'INE002A01018', isin: 'INE002A01018', nse: 'RELIANCE', bse: '500325' },
      { secId: 'INE467B01029', isin: 'INE467B01029', nse: 'TCS', bse: '532540' },
      { secId: 'INE040A01034', isin: 'INE040A01034', nse: 'HDFCBANK', bse: '500180' },
      { secId: 'INE155A01022', isin: 'INE155A01022', nse: 'TATAMOTORS', bse: '500570' },
      { secId: 'INE081A01020', isin: 'INE081A01020', nse: 'TATASTEEL', bse: '500470' },
      { secId: 'INE009A01021', isin: 'INE009A01021', nse: 'INFY', bse: '500209' },
      { secId: 'INE090A01021', isin: 'INE090A01021', nse: 'ICICIBANK', bse: '532174' },
      { secId: 'INE044A01036', isin: 'INE044A01036', nse: 'SUNPHARMA', bse: '524715' },
      { secId: 'INE280A01028', isin: 'INE280A01028', nse: 'TITAN', bse: '500114' },
      { secId: 'INE263A01024', isin: 'INE263A01024', nse: 'BEL', bse: '500049' },
      { secId: 'INE600Y01019', isin: 'INE600Y01019', nse: 'DYCL', bse: '540795' },
    ];

    for (const s of ACCEPTANCE_SEEDS) {
      this.registerIdentity({
        securityId: s.secId,
        isin: s.isin,
        primaryIsin: s.isin,
        nseSymbol: s.nse,
        currentSymbol: s.nse,
        bseCode: s.bse,
        exchange: 'NSE',
        segment: 'NSE',
        instrumentType: 'EQUITY',
        validFrom: '',
        validTo: null,
        status: 'ACTIVE',
        verifiedAt: new Date().toISOString(),
      });
    }

    // Dynamic loader will also populate the remainder from MasterTickers once DB connection is established.
    setImmediate(() => {
      this.ensureLoaded().catch(() => {});
    });
  }
}

