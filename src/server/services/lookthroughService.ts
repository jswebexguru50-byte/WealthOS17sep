import { getDB, dbAll } from '../database.js';

export interface UnderlyingStockWeight {
  symbol: string;
  name: string;
  weight_pct: number;
}

export interface EffectiveStockExposure {
  symbol: string;
  name: string;
  direct_value: number;
  indirect_value: number;
  total_effective_value: number;
  effective_pct: number;
  contributing_funds: string[];
}

// Constituent mappings for popular ETFs, Mutual Funds, and AIF structures
const FUND_CONSTITUENTS: Record<string, UnderlyingStockWeight[]> = {
  // US Index ETFs & Tech
  'VOO': [
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight_pct: 7.2 },
    { symbol: 'AAPL', name: 'Apple Inc.', weight_pct: 6.6 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight_pct: 6.1 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight_pct: 3.7 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight_pct: 2.4 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight_pct: 2.1 },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', weight_pct: 1.7 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', weight_pct: 1.6 }
  ],
  'QQQ': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight_pct: 8.7 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight_pct: 8.3 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight_pct: 7.4 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', weight_pct: 4.6 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight_pct: 4.3 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight_pct: 3.7 },
    { symbol: 'TSLA', name: 'Tesla Inc.', weight_pct: 3.1 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight_pct: 2.6 }
  ],
  'VGT': [
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight_pct: 16.5 },
    { symbol: 'AAPL', name: 'Apple Inc.', weight_pct: 15.8 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight_pct: 14.2 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', weight_pct: 4.8 },
    { symbol: 'CRM', name: 'Salesforce Inc.', weight_pct: 2.4 },
    { symbol: 'ADBE', name: 'Adobe Inc.', weight_pct: 2.1 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', weight_pct: 2.0 }
  ],
  'SCHG': [
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight_pct: 12.8 },
    { symbol: 'AAPL', name: 'Apple Inc.', weight_pct: 12.1 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight_pct: 10.5 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight_pct: 6.7 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight_pct: 4.5 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', weight_pct: 4.2 }
  ],

  // Motilal Oswal Nasdaq 100 FoF
  'MOTILAL OSWAL NASDAQ 100': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight_pct: 8.7 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight_pct: 8.3 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight_pct: 7.4 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', weight_pct: 4.6 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight_pct: 4.3 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight_pct: 3.7 }
  ],

  // Nippon India Small Cap Fund
  'NIPPON INDIA SMALL CAP': [
    { symbol: 'TIINDIA', name: 'Tube Investments of India', weight_pct: 3.2 },
    { symbol: 'APARINDS', name: 'Apar Industries Ltd', weight_pct: 2.8 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', weight_pct: 2.5 },
    { symbol: 'MCX', name: 'Multi Commodity Exchange', weight_pct: 2.1 },
    { symbol: 'KIRLOSENG', name: 'Kirloskar Oil Engines', weight_pct: 2.0 },
    { symbol: 'ELGIEQUIP', name: 'Elgi Equipments Ltd', weight_pct: 1.8 }
  ],

  // Nippon India Pharma Fund
  'NIPPON INDIA PHARMA': [
    { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Ind', weight_pct: 14.5 },
    { symbol: 'CIPLA', name: 'Cipla Ltd', weight_pct: 9.2 },
    { symbol: 'DRREDDY', name: 'Dr. Reddys Laboratories', weight_pct: 7.8 },
    { symbol: 'LUPIN', name: 'Lupin Ltd', weight_pct: 6.4 },
    { symbol: 'DIVISLAB', name: 'Divis Laboratories Ltd', weight_pct: 5.9 },
    { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals', weight_pct: 5.2 }
  ],

  // Nippon India Large Cap Fund
  'NIPPON INDIA LARGE CAP': [
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', weight_pct: 9.8 },
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', weight_pct: 8.9 },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', weight_pct: 7.6 },
    { symbol: 'INFY', name: 'Infosys Ltd', weight_pct: 5.8 },
    { symbol: 'L&T', name: 'Larsen & Toubro Ltd', weight_pct: 4.5 }
  ],

  // quant Small Cap & ELSS Tax Saver
  'QUANT SMALL CAP': [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', weight_pct: 8.2 },
    { symbol: 'JIOFIN', name: 'Jio Financial Services', weight_pct: 5.5 },
    { symbol: 'HFCL', name: 'HFCL Ltd', weight_pct: 4.8 },
    { symbol: 'AEGISCHEM', name: 'Aegis Logistics Ltd', weight_pct: 4.1 },
    { symbol: 'ADANIPOWER', name: 'Adani Power Ltd', weight_pct: 3.6 },
    { symbol: 'IRB', name: 'IRB Infrastructure', weight_pct: 3.2 }
  ],
  'QUANT ELSS': [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', weight_pct: 9.1 },
    { symbol: 'JIOFIN', name: 'Jio Financial Services', weight_pct: 6.2 },
    { symbol: 'ADANIPOWER', name: 'Adani Power Ltd', weight_pct: 4.8 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', weight_pct: 4.3 }
  ],

  // ICICI Prudential Smallcap
  'ICICI PRU SMALLCAP': [
    { symbol: 'KIMS', name: 'Krishna Institute of Med', weight_pct: 3.4 },
    { symbol: 'ASTERDM', name: 'Aster DM Healthcare Ltd', weight_pct: 2.9 },
    { symbol: 'TRIVENI', name: 'Triveni Turbine Ltd', weight_pct: 2.8 },
    { symbol: 'RAYMOND', name: 'Raymond Ltd', weight_pct: 2.6 }
  ],

  // Kotak Large Cap
  'KOTAK LARGE CAP': [
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', weight_pct: 9.4 },
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', weight_pct: 8.7 },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', weight_pct: 7.1 },
    { symbol: 'INFY', name: 'Infosys Ltd', weight_pct: 5.6 },
    { symbol: 'TCS', name: 'Tata Consultancy Services', weight_pct: 4.3 }
  ],

  // Mirae Asset Midcap
  'MIRAE ASSET MIDCAP': [
    { symbol: 'FEDERALBNK', name: 'The Federal Bank Ltd', weight_pct: 3.8 },
    { symbol: 'BHARATFORG', name: 'Bharat Forge Ltd', weight_pct: 3.4 },
    { symbol: 'INDHOTEL', name: 'The Indian Hotels Co Ltd', weight_pct: 3.2 },
    { symbol: 'CUMMINSIND', name: 'Cummins India Ltd', weight_pct: 2.9 }
  ],

  // SBI Midcap Fund
  'SBI MIDCAP': [
    { symbol: 'CRISIL', name: 'CRISIL Ltd', weight_pct: 3.9 },
    { symbol: 'TORNTPOWER', name: 'Torrent Power Ltd', weight_pct: 3.6 },
    { symbol: 'SUNDRMFAST', name: 'Sundram Fasteners Ltd', weight_pct: 3.3 },
    { symbol: 'ASTRAL', name: 'Astral Ltd', weight_pct: 3.1 }
  ]
};

export class LookthroughService {
  private static instance: LookthroughService;

  public static getInstance(): LookthroughService {
    if (!LookthroughService.instance) {
      LookthroughService.instance = new LookthroughService();
    }
    return LookthroughService.instance;
  }

  public async computeEffectiveHoldings(selectedPortfolios: string[] | null): Promise<EffectiveStockExposure[]> {
    const db = getDB();
    let query = `
      SELECT H.symbol, COALESCE(M.name, H.symbol) as company_name, H.isin, H.portfolio, H.quantity, H.current_value, H.total_cost, H.currency 
      FROM Holdings H 
      LEFT JOIN MasterTickers M ON H.isin = M.isin OR H.symbol = M.symbol 
      WHERE H.quantity > 0
    `;
    let params: any[] = [];

    if (selectedPortfolios && selectedPortfolios.length > 0) {
      const placeholders = selectedPortfolios.map(() => 'LOWER(TRIM(?))').join(',');
      query += ` AND LOWER(TRIM(H.portfolio)) IN (${placeholders})`;
      params.push(...selectedPortfolios);
    }

    const holdings = await dbAll(db, query, params);
    if (!holdings || holdings.length === 0) return [];

    const stockMap: Record<string, EffectiveStockExposure> = {};
    let totalPortfolioValuation = 0;

    for (const h of holdings) {
      const val = (h.current_value && h.current_value > 0) ? h.current_value : (h.total_cost || 0);
      if (val <= 0) continue;
      totalPortfolioValuation += val;

      const sym = (h.symbol || '').trim().toUpperCase();
      const isin = (h.isin || '').trim().toUpperCase();
      const isMF = isin.startsWith('INF') || h.portfolio?.includes('MF');

      // Check if this holding is a known ETF or Mutual Fund that can be look-through parsed
      let constituents: UnderlyingStockWeight[] | null = null;

      if (FUND_CONSTITUENTS[sym]) {
        constituents = FUND_CONSTITUENTS[sym];
      } else {
        // Match partial fund name
        for (const [key, list] of Object.entries(FUND_CONSTITUENTS)) {
          if (h.company_name?.toUpperCase().includes(key) || sym.includes(key)) {
            constituents = list;
            break;
          }
        }
      }

      if (constituents && constituents.length > 0) {
        // Allocate indirect value to underlying stocks
        for (const c of constituents) {
          const indirectVal = (val * c.weight_pct) / 100;
          if (!stockMap[c.symbol]) {
            stockMap[c.symbol] = {
              symbol: c.symbol,
              name: c.name,
              direct_value: 0,
              indirect_value: indirectVal,
              total_effective_value: indirectVal,
              effective_pct: 0,
              contributing_funds: [h.company_name || sym]
            };
          } else {
            stockMap[c.symbol].indirect_value += indirectVal;
            stockMap[c.symbol].total_effective_value += indirectVal;
            if (!stockMap[c.symbol].contributing_funds.includes(h.company_name || sym)) {
              stockMap[c.symbol].contributing_funds.push(h.company_name || sym);
            }
          }
        }
      } else if (!isMF) {
        // Direct Stock holding
        if (!stockMap[sym]) {
          stockMap[sym] = {
            symbol: sym,
            name: h.company_name || sym,
            direct_value: val,
            indirect_value: 0,
            total_effective_value: val,
            effective_pct: 0,
            contributing_funds: []
          };
        } else {
          stockMap[sym].direct_value += val;
          stockMap[sym].total_effective_value += val;
        }
      }
    }

    // Compute effective percentages and sort descending
    const result = Object.values(stockMap).map(item => ({
      ...item,
      effective_pct: totalPortfolioValuation > 0 ? (item.total_effective_value / totalPortfolioValuation) * 100 : 0
    })).sort((a, b) => b.total_effective_value - a.total_effective_value);

    return result;
  }
}
