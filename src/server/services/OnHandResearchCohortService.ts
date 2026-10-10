import { dbAll, getDB } from '../database.js';
import { ResearchAnalysisJobService, type ResearchAnalysisJob, type ResearchSymbolMetadata } from './ResearchAnalysisJobService.js';

export interface OnHandResearchPosition {
  symbol: string;
  isin: string | null;
  companyName: string | null;
  exchange: string;
  quantity: number;
  marketValue: number;
  ltp: number | null;
  valuationAsOf: string | null;
  portfolios: string[];
}

export interface OnHandResearchExclusion {
  symbol: string;
  isin: string | null;
  marketValue: number;
  reason: 'NON_INR_OR_NON_EQUITY' | 'UNLISTED_PORTFOLIO' | 'UNMAPPED_MASTER_TICKER' | 'NON_NSE_BSE_SECURITY';
}

export interface OnHandResearchCohort {
  asOfDate: string;
  valuationAsOf: string | null;
  positions: OnHandResearchPosition[];
  exclusions: OnHandResearchExclusion[];
  totalMarketValue: number;
}

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export class OnHandResearchCohortService {
  private static instance: OnHandResearchCohortService;

  static getInstance(): OnHandResearchCohortService {
    if (!this.instance) this.instance = new OnHandResearchCohortService();
    return this.instance;
  }

  async build(asOfDate = new Date().toISOString().slice(0, 10)): Promise<OnHandResearchCohort> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('INVALID_AS_OF_DATE');
    const holdings = await dbAll<any>(getDB(), `
      SELECT UPPER(TRIM(symbol)) AS raw_symbol, NULLIF(UPPER(TRIM(isin)), '') AS raw_isin,
             UPPER(COALESCE(holding_type, 'EQUITY')) AS holding_type,
             UPPER(COALESCE(currency, 'INR')) AS currency,
             portfolio, quantity,
             CASE WHEN current_value > 0 THEN current_value
                  WHEN ltp > 0 THEN quantity * ltp ELSE 0 END AS market_value,
             CASE WHEN ltp > 0 THEN ltp ELSE NULL END AS ltp,
             last_update
      FROM Holdings
      WHERE quantity > 0
    `);
    const masters = await dbAll<any>(getDB(), `
      SELECT symbol, isin, exchange, segment, status, COALESCE(company_name, name) AS company_name, id
      FROM MasterTickers
      WHERE symbol IS NOT NULL AND TRIM(symbol) <> ''
      ORDER BY CASE WHEN UPPER(exchange)='NSE' THEN 0 WHEN UPPER(exchange)='BSE' THEN 1 ELSE 2 END, id
    `);
    const aliases = await dbAll<any>(getDB(), `
      SELECT raw_symbol, isin, symbol FROM AssetScripMappings
      WHERE symbol IS NOT NULL AND TRIM(symbol) <> ''
    `);
    const byIsin = new Map<string, any>();
    const bySymbol = new Map<string, any>();
    for (const master of masters) {
      const isin = normalize(master.isin);
      const symbol = normalize(master.symbol);
      if (isin && !byIsin.has(isin)) byIsin.set(isin, master);
      if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, master);
    }
    const aliasByIsin = new Map<string, string>();
    const aliasBySymbol = new Map<string, string>();
    for (const alias of aliases) {
      const resolved = normalize(alias.symbol);
      if (!resolved) continue;
      const isin = normalize(alias.isin);
      const symbol = normalize(alias.raw_symbol);
      if (isin) aliasByIsin.set(isin, resolved);
      if (symbol) aliasBySymbol.set(symbol, resolved);
    }

    const included = new Map<string, OnHandResearchPosition>();
    const excluded = new Map<string, OnHandResearchExclusion>();
    for (const holding of holdings) {
      const rawSymbol = normalize(holding.raw_symbol);
      const rawIsin = normalize(holding.raw_isin);
      const marketValue = number(holding.market_value);
      if (!rawSymbol || marketValue <= 0) continue;
      const exclusionKey = `${rawSymbol}|${rawIsin}|${holding.portfolio}`;
      if (normalize(holding.portfolio) === 'UNLISTED') {
        excluded.set(exclusionKey, { symbol: rawSymbol, isin: rawIsin || null, marketValue, reason: 'UNLISTED_PORTFOLIO' });
        continue;
      }
      if (normalize(holding.holding_type) !== 'EQUITY' || normalize(holding.currency) !== 'INR') {
        excluded.set(exclusionKey, { symbol: rawSymbol, isin: rawIsin || null, marketValue, reason: 'NON_INR_OR_NON_EQUITY' });
        continue;
      }
      const aliasSymbol = (rawIsin && aliasByIsin.get(rawIsin)) || aliasBySymbol.get(rawSymbol);
      const master = (rawIsin && byIsin.get(rawIsin)) || bySymbol.get(rawSymbol) || (aliasSymbol && bySymbol.get(aliasSymbol));
      if (!master) {
        excluded.set(exclusionKey, { symbol: rawSymbol, isin: rawIsin || null, marketValue, reason: 'UNMAPPED_MASTER_TICKER' });
        continue;
      }
      const exchange = normalize(master.exchange);
      if (!['NSE', 'BSE'].includes(exchange)) {
        excluded.set(exclusionKey, { symbol: rawSymbol, isin: rawIsin || null, marketValue, reason: 'NON_NSE_BSE_SECURITY' });
        continue;
      }
      const symbol = normalize(master.symbol);
      if (!/^[A-Z0-9&._-]{1,32}$/.test(symbol) || ['UNKNOWN', 'NA', 'N/A'].includes(symbol)) {
        excluded.set(exclusionKey, { symbol: rawSymbol, isin: rawIsin || null, marketValue, reason: 'UNMAPPED_MASTER_TICKER' });
        continue;
      }
      const existing = included.get(symbol);
      const date = holding.last_update ? String(holding.last_update).slice(0, 10) : null;
      if (existing) {
        existing.quantity += number(holding.quantity);
        existing.marketValue += marketValue;
        existing.portfolios = [...new Set([...existing.portfolios, String(holding.portfolio)])];
        if (date && (!existing.valuationAsOf || date > existing.valuationAsOf)) existing.valuationAsOf = date;
      } else {
        included.set(symbol, {
          symbol,
          isin: normalize(master.isin) || rawIsin || null,
          companyName: master.company_name ? String(master.company_name) : null,
          exchange,
          quantity: number(holding.quantity),
          marketValue,
          ltp: holding.ltp == null ? null : number(holding.ltp),
          valuationAsOf: date,
          portfolios: [String(holding.portfolio)],
        });
      }
    }
    const positions = [...included.values()].sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));
    const exclusions = [...excluded.values()].sort((a, b) => b.marketValue - a.marketValue || a.symbol.localeCompare(b.symbol));
    const valuationDates = positions.map(position => position.valuationAsOf).filter(Boolean) as string[];
    return {
      asOfDate,
      valuationAsOf: valuationDates.length ? valuationDates.sort().at(-1)! : null,
      positions,
      exclusions,
      totalMarketValue: positions.reduce((sum, position) => sum + position.marketValue, 0),
    };
  }

  async start(asOfDate: string, mode: 'DETERMINISTIC_ONLY' | 'LLM_IF_AVAILABLE' | 'LLM_REQUIRED' = 'LLM_IF_AVAILABLE'): Promise<{ cohort: OnHandResearchCohort; job: ResearchAnalysisJob }> {
    const cohort = await this.build(asOfDate);
    if (!cohort.positions.length) throw new Error('NO_ELIGIBLE_ON_HAND_SECURITIES');
    const metadata: Record<string, ResearchSymbolMetadata> = {};
    for (const position of cohort.positions) {
      metadata[position.symbol] = {
        marketValue: position.marketValue,
        quantity: position.quantity,
        ltp: position.ltp ?? undefined,
        portfolios: position.portfolios,
        valuationAsOf: position.valuationAsOf,
      };
    }
    const job = await ResearchAnalysisJobService.getInstance().create(
      cohort.positions.map(position => position.symbol),
      asOfDate,
      mode,
      metadata,
      200,
    );
    return { cohort, job };
  }
}
