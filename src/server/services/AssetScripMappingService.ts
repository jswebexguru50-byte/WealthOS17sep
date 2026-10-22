import { DatabaseManager } from './DatabaseManager.js';

export interface ScripMappingRecord {
  id?: number;
  source_broker: string;
  raw_scrip_name: string;
  raw_symbol?: string;
  isin: string;
  symbol: string;
  asset_class: string;
  sector?: string;
  market_cap_tier?: string;
  notes?: string;
  created_at?: string;
}

export class AssetScripMappingService {
  private static instance: AssetScripMappingService;

  private constructor() {}

  public static getInstance(): AssetScripMappingService {
    if (!AssetScripMappingService.instance) {
      AssetScripMappingService.instance = new AssetScripMappingService();
    }
    return AssetScripMappingService.instance;
  }

  /**
   * Fetch all mappings with optional search and broker filter
   */
  public async getMappings(filter?: { broker?: string; query?: string }): Promise<{ success: boolean; mappings: ScripMappingRecord[] }> {
    const db = DatabaseManager.getInstance();
    let sql = `SELECT * FROM AssetScripMappings WHERE 1=1`;
    const params: any[] = [];

    if (filter?.broker && filter.broker !== 'ALL') {
      sql += ` AND source_broker = ?`;
      params.push(filter.broker);
    }

    if (filter?.query && filter.query.trim()) {
      const q = `%${filter.query.trim().toUpperCase()}%`;
      sql += ` AND (UPPER(raw_scrip_name) LIKE ? OR UPPER(symbol) LIKE ? OR UPPER(isin) LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY updated_at DESC LIMIT 500`;
    const mappings = await db.query<ScripMappingRecord>(sql, params);
    return { success: true, mappings };
  }

  /**
   * Resolve a raw scrip description to an ISIN, Symbol, and Asset Class
   */
  public async resolveScrip(sourceBroker: string, rawText: string): Promise<{ isin?: string; symbol?: string; asset_class?: string; sector?: string }> {
    const db = DatabaseManager.getInstance();
    const cleanText = rawText.trim().toUpperCase();

    // 1. Check exact mapping in AssetScripMappings
    const exact = await db.get<any>(`
      SELECT isin, symbol, asset_class, sector 
      FROM AssetScripMappings 
      WHERE source_broker = ? AND UPPER(raw_scrip_name) = ?
    `, [sourceBroker, cleanText]);

    if (exact) {
      return exact;
    }

    // 2. Check MasterTickers by ISIN or Symbol
    const master = await db.get<any>(`
      SELECT isin, symbol, sector 
      FROM MasterTickers 
      WHERE UPPER(symbol) = ? OR UPPER(isin) = ? OR UPPER(name) = ?
    `, [cleanText, cleanText, cleanText]);

    if (master) {
      return {
        isin: master.isin,
        symbol: master.symbol,
        asset_class: master.isin?.startsWith('INF') ? 'Mutual Fund' : 'Equity',
        sector: master.sector
      };
    }

    // 3. Fallback: Parse common ISIN patterns from text
    const isinMatch = rawText.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/);
    if (isinMatch) {
      const parsedIsin = isinMatch[0].toUpperCase();
      return {
        isin: parsedIsin,
        symbol: cleanText.split(/[\s-]+/)[0],
        asset_class: parsedIsin.startsWith('INF') ? 'Mutual Fund' : 'Equity'
      };
    }

    return {
      symbol: cleanText.replace(/[^A-Z0-9]/g, '').slice(0, 20),
      asset_class: cleanText.includes('FD') || cleanText.includes('DEPOSIT') ? 'Fixed Deposit' : 'Equity'
    };
  }

  /**
   * Save or update a Scrip Mapping
   */
  public async saveMapping(mapping: ScripMappingRecord): Promise<{ success: boolean }> {
    const db = DatabaseManager.getInstance();
    await db.execute(`
      INSERT INTO AssetScripMappings (source_broker, raw_scrip_name, raw_symbol, isin, symbol, asset_class, sector, market_cap_tier, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_broker, raw_scrip_name) DO UPDATE SET
        isin = excluded.isin,
        symbol = excluded.symbol,
        asset_class = excluded.asset_class,
        sector = excluded.sector,
        market_cap_tier = excluded.market_cap_tier,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      mapping.source_broker,
      mapping.raw_scrip_name.trim(),
      mapping.raw_symbol || '',
      mapping.isin?.trim().toUpperCase() || '',
      mapping.symbol?.trim().toUpperCase() || '',
      mapping.asset_class || 'Equity',
      mapping.sector || 'Diversified',
      mapping.market_cap_tier || 'Large Cap',
      mapping.notes || ''
    ]);
    return { success: true };
  }

  /**
   * Delete a mapping
   */
  public async deleteMapping(id: number): Promise<{ success: boolean }> {
    const db = DatabaseManager.getInstance();
    await db.execute(`DELETE FROM AssetScripMappings WHERE id = ?`, [id]);
    return { success: true };
  }

  /**
   * Scan active holdings and transactions to detect unmapped or non-standard scrip names
   */
  public async getUnmappedScrips(): Promise<{ success: boolean; unmapped: Array<{ symbol: string; count: number; portfolio: string }> }> {
    const db = DatabaseManager.getInstance();
    const rows = await db.query<any>(`
      SELECT h.symbol, h.portfolio, COUNT(*) as count
      FROM Holdings h
      LEFT JOIN MasterTickers m ON h.isin = m.isin OR h.symbol = m.symbol
      WHERE m.isin IS NULL AND h.quantity > 0
      GROUP BY h.symbol, h.portfolio
      ORDER BY count DESC
    `);
    return { success: true, unmapped: rows };
  }

  /**
   * Auto-resolve unmapped scrips by fuzzy matching against MasterTickers and AMFI directory
   */
  public async autoResolveUnmapped(): Promise<{ success: boolean; resolvedCount: number; resolved: Array<{ raw: string; symbol: string; isin: string }> }> {
    const db = DatabaseManager.getInstance();
    const unmapped = await this.getUnmappedScrips();
    const masterTickers = await db.query<any>(`SELECT isin, symbol, name, sector FROM MasterTickers`);
    const resolved: Array<{ raw: string; symbol: string; isin: string }> = [];

    for (const item of unmapped.unmapped) {
      const clean = item.symbol.trim().toUpperCase().replace(/[-_]EQ$/, '').replace(/[-_]BE$/, '');
      
      // Look for match in MasterTickers
      const match = masterTickers.find(m => 
        m.symbol.toUpperCase() === clean || 
        m.name.toUpperCase().includes(clean) || 
        clean.includes(m.symbol.toUpperCase())
      );

      if (match) {
        await this.saveMapping({
          source_broker: 'AUTO_RESOLVED',
          raw_scrip_name: item.symbol,
          symbol: match.symbol,
          isin: match.isin || '',
          asset_class: match.isin?.startsWith('INF') ? 'Mutual Fund' : 'Equity',
          sector: match.sector || 'Diversified',
          market_cap_tier: 'Large Cap',
          notes: `Auto-resolved match with ${match.name}`
        });

        // Update holdings record with resolved isin and sector if missing
        await db.execute(`
          UPDATE Holdings 
          SET isin = COALESCE(NULLIF(isin, ''), ?),
              sector = COALESCE(NULLIF(sector, ''), ?)
          WHERE symbol = ?
        `, [match.isin, match.sector, item.symbol]);

        resolved.push({ raw: item.symbol, symbol: match.symbol, isin: match.isin || '' });
      }
    }

    return { success: true, resolvedCount: resolved.length, resolved };
  }
}

