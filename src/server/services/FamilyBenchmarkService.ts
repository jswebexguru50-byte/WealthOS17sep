import { DatabaseManager } from './DatabaseManager.js';
import { BankAndFDService } from './BankAndFDService.js';

export interface FamilyGroup {
  id: number;
  name: string;
  description: string;
  benchmark_symbol: string;
  portfolios?: string[];
  total_valuation?: number;
  total_invested?: number;
  unrealized_pnl?: number;
}

export interface BenchmarkOption {
  symbol: string;
  name: string;
  category: 'Broad Market' | 'Sectoral' | 'Thematic' | 'Custom';
  description: string;
}

export const STANDARD_BENCHMARKS: BenchmarkOption[] = [
  { symbol: '^NSEI', name: 'Nifty 50 Index', category: 'Broad Market', description: 'Top 50 large-cap Indian companies by market capitalisation.' },
  { symbol: '^BSESN', name: 'BSE Sensex', category: 'Broad Market', description: '30 well-established and financially sound companies listed on BSE.' },
  { symbol: '^CRSLDX', name: 'Nifty 500', category: 'Broad Market', description: 'Broadest 500 companies representing over 95% of free float market cap.' },
  { symbol: 'NIFTY_MIDCAP_100', name: 'Nifty Midcap 100', category: 'Broad Market', description: 'Top 100 mid-sized growth companies.' },
  { symbol: '^NIFTY250SMR', name: 'Nifty Smallcap 250', category: 'Broad Market', description: '250 small-cap dynamic companies.' },
  { symbol: '^NSEBANK', name: 'Nifty Bank Index', category: 'Sectoral', description: '12 most liquid and large Indian banking stocks.' },
  { symbol: '^CNXIT', name: 'Nifty IT Index', category: 'Sectoral', description: 'Leading Indian technology and software services companies.' },
  { symbol: 'BLENDED_60_40', name: 'Blended 60:40 (Equity : Debt)', category: 'Custom', description: '60% Nifty 50 + 40% Crisil Composite Bond Index.' }
];

export class FamilyBenchmarkService {
  private static instance: FamilyBenchmarkService;

  private constructor() {}

  public static getInstance(): FamilyBenchmarkService {
    if (!FamilyBenchmarkService.instance) {
      FamilyBenchmarkService.instance = new FamilyBenchmarkService();
    }
    return FamilyBenchmarkService.instance;
  }

  /**
   * Fetch all Family Groups with their member portfolios and aggregated metrics
   */
  public async getFamilyHierarchy(): Promise<{ success: boolean; families: FamilyGroup[]; unassignedPortfolios: string[] }> {
    const db = DatabaseManager.getInstance();

    // Ensure default primary family group exists
    const existingFamilies = await db.query<any>(`SELECT * FROM FamilyGroups ORDER BY id ASC`);
    if (existingFamilies.length === 0) {
      await db.execute(`
        INSERT INTO FamilyGroups (name, description, benchmark_symbol)
        VALUES ('Primary Family Office', 'Consolidated main family accounts and entities', '^NSEI')
      `);
    }

    const families = await db.query<any>(`SELECT * FROM FamilyGroups ORDER BY name ASC`);
    const allPortfolios = await db.query<any>(`
      SELECT DISTINCT portfolio FROM Holdings WHERE quantity > 0 
      UNION SELECT DISTINCT portfolio FROM Transactions WHERE portfolio IS NOT NULL
      UNION SELECT DISTINCT portfolio FROM BankAccountsAndFDs WHERE portfolio IS NOT NULL
    `);
    const portfolioRows = await db.query<any>(`SELECT * FROM Portfolios`);

    // Build portfolio lookup for family & benchmark
    const pMetaMap: Record<string, { family_group: string; benchmark_symbol: string }> = {};
    portfolioRows.forEach(p => {
      pMetaMap[p.name] = {
        family_group: p.family_group || 'Primary Family Office',
        benchmark_symbol: p.benchmark_symbol || '^NSEI'
      };
    });

    // 1. Fetch Currency Rates
    const fxRates = await BankAndFDService.getInstance().getCurrencyRates();
    const usdRate = fxRates.USD || 83.5;

    // 2. Fetch Holdings with portfolio metadata
    const holdingsQuery = `
      SELECT H.*, COALESCE(P.base_currency, 'INR') as base_currency
      FROM Holdings H
      LEFT JOIN Portfolios P ON H.portfolio = P.name
      WHERE H.quantity > 0
    `;
    const rawHoldings = await db.query<any>(holdingsQuery);

    const valMap: Record<string, { current: number; cost: number; pnl: number }> = {};

    rawHoldings.forEach(h => {
      const isUsAsset = h.portfolio === 'US - IBKR' || h.currency === 'USD' || h.base_currency === 'USD';
      const currency = isUsAsset ? 'USD' : (h.base_currency || 'INR');
      const rate = currency === 'USD' ? usdRate : (fxRates[currency.toUpperCase()] || 1.0);
      
      const inrVal = (isUsAsset && h.native_current_value > 0) 
        ? (h.native_current_value * rate) 
        : (isUsAsset && h.current_value < 100000 ? h.current_value * rate : (h.current_value || 0));

      const inrCost = (isUsAsset && h.native_total_cost > 0)
        ? (h.native_total_cost * rate)
        : (h.total_cost || 0);

      const port = h.portfolio || 'Unassigned';
      if (!valMap[port]) valMap[port] = { current: 0, cost: 0, pnl: 0 };
      valMap[port].current += inrVal;
      valMap[port].cost += inrCost;
      valMap[port].pnl += (inrVal - inrCost);
    });

    // 3. Add BankAccountsAndFDs
    const bankFDs = await BankAndFDService.getInstance().getAllBankAndFDs();
    bankFDs.forEach(b => {
      const rate = fxRates[b.currency.toUpperCase()] || 1.0;
      const inrVal = (b.balance_amount || 0) * rate;
      const principal = (b.principal_amount && b.principal_amount > 0) ? b.principal_amount : b.balance_amount;
      const inrCost = (principal || 0) * rate;

      const port = b.portfolio || 'Cash & FD';
      if (!valMap[port]) valMap[port] = { current: 0, cost: 0, pnl: 0 };
      valMap[port].current += inrVal;
      valMap[port].cost += inrCost;
      valMap[port].pnl += (inrVal - inrCost);
    });

    const familyResult: FamilyGroup[] = families.map(f => {
      const memberPorts: string[] = [];
      let totVal = 0;
      let totCost = 0;
      let totPnl = 0;

      allPortfolios.forEach(pObj => {
        const pName = pObj.portfolio;
        const assignedFam = pMetaMap[pName]?.family_group || 'Primary Family Office';
        if (assignedFam === f.name) {
          memberPorts.push(pName);
          if (valMap[pName]) {
            totVal += valMap[pName].current;
            totCost += valMap[pName].cost;
            totPnl += valMap[pName].pnl;
          }
        }
      });

      return {
        id: f.id,
        name: f.name,
        description: f.description || '',
        benchmark_symbol: f.benchmark_symbol || '^NSEI',
        portfolios: memberPorts,
        total_valuation: totVal,
        total_invested: totCost,
        unrealized_pnl: totPnl
      };
    });

    return {
      success: true,
      families: familyResult,
      unassignedPortfolios: []
    };
  }

  /**
   * Create or update a Family Group
   */
  public async saveFamilyGroup(data: { id?: number; name: string; description?: string; benchmark_symbol?: string }): Promise<{ success: boolean; id: number }> {
    const db = DatabaseManager.getInstance();
    if (data.id) {
      await db.execute(`
        UPDATE FamilyGroups 
        SET name = ?, description = ?, benchmark_symbol = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [data.name, data.description || '', data.benchmark_symbol || '^NSEI', data.id]);
      return { success: true, id: data.id };
    } else {
      const res = await db.execute(`
        INSERT INTO FamilyGroups (name, description, benchmark_symbol)
        VALUES (?, ?, ?)
      `, [data.name, data.description || '', data.benchmark_symbol || '^NSEI']);
      return { success: true, id: res.lastID };
    }
  }

  /**
   * Delete a Family Group and reassign its member portfolios to Primary Family Office
   */
  public async deleteFamilyGroup(id: number): Promise<{ success: boolean }> {
    const db = DatabaseManager.getInstance();
    const fam = await db.get<any>(`SELECT name FROM FamilyGroups WHERE id = ?`, [id]);
    if (fam) {
      await db.execute(`
        UPDATE Portfolios SET family_group = 'Primary Family Office' WHERE family_group = ?
      `, [fam.name]);
      await db.execute(`DELETE FROM FamilyGroups WHERE id = ?`, [id]);
    }
    return { success: true };
  }

  /**
   * Assign a Portfolio to a Family Group and optionally set its benchmark
   */
  public async assignPortfolio(data: { portfolio: string; family_group: string; benchmark_symbol?: string }): Promise<{ success: boolean }> {
    const db = DatabaseManager.getInstance();
    const existing = await db.get<any>(`SELECT id FROM Portfolios WHERE name = ?`, [data.portfolio]);
    if (existing) {
      await db.execute(`
        UPDATE Portfolios 
        SET family_group = ?, benchmark_symbol = COALESCE(?, benchmark_symbol), updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `, [data.family_group, data.benchmark_symbol || null, data.portfolio]);
    } else {
      await db.execute(`
        INSERT INTO Portfolios (name, family_group, benchmark_symbol)
        VALUES (?, ?, ?)
      `, [data.portfolio, data.family_group, data.benchmark_symbol || '^NSEI']);
    }
    return { success: true };
  }
}
