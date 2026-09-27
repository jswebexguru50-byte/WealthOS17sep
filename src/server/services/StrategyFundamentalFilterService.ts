import { dbAll } from '../database.js';
import { Database } from 'sqlite3';

export const STRATEGY_FUNDAMENTAL_RULES = {
  promoterMinimumPct: 66.6,
  roceMinimumPct: 35,
  roeMinimumPct: 25,
  profitableQuarterCount: 8,
  cashFlowToOperatingProfitMinimum: 0.5,
} as const;

export type FundamentalPopulation = 'FULLY_COMPLIANT' | 'PARTIAL' | 'NOT_COMPLIANT';

export interface StrategyFundamentalEnrichment {
  symbol: string;
  population: FundamentalPopulation;
  passCount: number;
  totalChecks: number;
  promoterPct: number | null;
  promoterPass: boolean;
  profitableLast8Quarters: boolean | null;
  profitableQuarterCount: number;
  rocePct: number | null;
  rocePass: boolean;
  roePct: number | null;
  roePass: boolean;
  pledgedPct: number | null;
  noPledgePass: boolean | null;
  fiiPct: number | null;
  diiPct: number | null;
  institutionalInvolvementPass: boolean | null;
  institutionalIncreasing: boolean | null;
  latestOperatingProfitCr: number | null;
  latestCfoCr: number | null;
  cashFlowToOperatingProfit: number | null;
  cashFlowPass: boolean | null;
  sunriseSector: string | null;
  pliScheme: string | null;
  qglpStatus: 'AVAILABLE_FROM_ENGINE' | 'NOT_AVAILABLE';
  qglpScore: number | null;
  qglpReason: string;
  sectorMomentumStatus: 'AVAILABLE' | 'NOT_AVAILABLE';
  sectorMomentumPct: number | null;
  stockMomentumPct: number | null;
  doubleMomentumStatus: 'AVAILABLE' | 'NOT_AVAILABLE';
  institutionalPurchases: Array<{ clientName: string; quantity: number; rate: number; date: string; dealType: string }>;
  evidenceStatus: 'VERIFIED' | 'PARTIAL' | 'UNAVAILABLE';
  evidenceNote: string;
}

type AnyRow = Record<string, any>;

function latestBySymbol(rows: AnyRow[], key = 'symbol'): Map<string, AnyRow> {
  const map = new Map<string, AnyRow>();
  for (const row of rows) {
    const symbol = String(row[key] || '').trim().toUpperCase();
    if (!symbol || !map.has(symbol)) map.set(symbol, row);
  }
  return map;
}

export class StrategyFundamentalFilterService {
  private static instance: StrategyFundamentalFilterService;
  public static getInstance(): StrategyFundamentalFilterService {
    if (!this.instance) this.instance = new StrategyFundamentalFilterService();
    return this.instance;
  }

  public async enrichSymbols(db: Database, symbols: string[]): Promise<Map<string, StrategyFundamentalEnrichment>> {
    const unique = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
    const out = new Map<string, StrategyFundamentalEnrichment>();
    if (!unique.length) return out;
    const placeholders = unique.map(() => '?').join(',');

    const safeAll = async (sql: string, params: any[] = []): Promise<AnyRow[]> => {
      try { return await dbAll<any>(db, sql, params); } catch { return []; }
    };
    const snapshots = await safeAll(`
      SELECT symbol, promoter_holding_pct AS promoterPct, fii_holding_pct AS fiiPct,
             dii_holding_pct AS diiPct, pledged_pct AS pledgedPct, roce_pct AS rocePct,
             roe_pct AS roePct, fetched_at AS fetchedAt
      FROM FundamentalSnapshots WHERE symbol IN (${placeholders}) ORDER BY fetched_at DESC`, unique);
    const holdings = await safeAll(`
      SELECT symbol, promoter_pct AS promoterPct, fii_pct AS fiiPct,
             dii_pct AS diiPct, as_of_date AS asOfDate
      FROM HistoricalShareholdingPattern WHERE symbol IN (${placeholders}) ORDER BY as_of_date DESC`, unique);
    const statements = await safeAll(`
      SELECT symbol, period_date AS periodDate, period_label AS periodLabel,
             operating_profit_cr AS operatingProfitCr, net_profit_pat_cr AS patCr, cfo_cr AS cfoCr
      FROM HistoricalFinancialStatements WHERE symbol IN (${placeholders}) AND statement_type = 'QUARTERLY_PL'
      ORDER BY period_date DESC, period_label DESC`, unique);
    const cashFlows = await safeAll(`
      SELECT symbol, period_date AS periodDate, cfo_cr AS cfoCr
      FROM HistoricalFinancialStatements WHERE symbol IN (${placeholders}) AND statement_type = 'CASH_FLOW'
      ORDER BY period_date DESC, period_label DESC`, unique);
    const sunrise = await safeAll(`
      SELECT symbol, vertical_name AS verticalName, pli_scheme_id AS pliScheme
      FROM sunrise_industrial_universe WHERE symbol IN (${placeholders}) AND is_active = 1`, unique);
    const deals = await safeAll(`
      SELECT symbol, client_name AS clientName, quantity, trade_price AS rate,
             deal_date AS date, deal_type AS dealType
      FROM InstitutionalDeals WHERE symbol IN (${placeholders}) ORDER BY deal_date DESC`, unique);

    const snapshotBySymbol = latestBySymbol(snapshots);
    const sunriseBySymbol = latestBySymbol(sunrise);
    const holdingRows = new Map<string, AnyRow[]>();
    for (const row of holdings) {
      const symbol = String(row.symbol || '').trim().toUpperCase();
      if (!holdingRows.has(symbol)) holdingRows.set(symbol, []);
      holdingRows.get(symbol)!.push(row);
    }
    const statementRows = new Map<string, AnyRow[]>();
    for (const row of statements) {
      const symbol = String(row.symbol || '').trim().toUpperCase();
      if (!statementRows.has(symbol)) statementRows.set(symbol, []);
      statementRows.get(symbol)!.push(row);
    }
    const cashFlowRows = new Map<string, AnyRow[]>();
    for (const row of cashFlows) {
      const symbol = String(row.symbol || '').trim().toUpperCase();
      if (!cashFlowRows.has(symbol)) cashFlowRows.set(symbol, []);
      cashFlowRows.get(symbol)!.push(row);
    }

    for (const symbol of unique) {
      const snapshot = snapshotBySymbol.get(symbol) || {};
      const sh = holdingRows.get(symbol) || [];
      const latestHolding = sh[0] || {};
      const previousHolding = sh[1] || {};
      const fins = (statementRows.get(symbol) || []).slice(0, STRATEGY_FUNDAMENTAL_RULES.profitableQuarterCount);
      const profitableQuarterCount = fins.filter(r => Number(r.patCr) > 0).length;
      const profitableLast8Quarters = fins.length >= 8 ? profitableQuarterCount === 8 : null;
      const opProfit = fins[0]?.operatingProfitCr == null ? null : Number(fins[0].operatingProfitCr);
      const cfoRow = (cashFlowRows.get(symbol) || [])[0];
      const cfo = cfoRow?.cfoCr == null ? null : Number(cfoRow.cfoCr);
      const cashFlowRatio = opProfit != null && cfo != null && opProfit > 0 ? cfo / opProfit : null;

      const promoterPct = snapshot.promoterPct ?? latestHolding.promoterPct ?? null;
      const fiiPct = snapshot.fiiPct ?? latestHolding.fiiPct ?? null;
      const diiPct = snapshot.diiPct ?? latestHolding.diiPct ?? null;
      const pledgedPct = snapshot.pledgedPct ?? null;
      const rocePct = snapshot.rocePct ?? null;
      const roePct = snapshot.roePct ?? null;
      const promoterPass = promoterPct != null && Number(promoterPct) > STRATEGY_FUNDAMENTAL_RULES.promoterMinimumPct;
      const rocePass = rocePct != null && Number(rocePct) >= STRATEGY_FUNDAMENTAL_RULES.roceMinimumPct;
      const roePass = roePct != null && Number(roePct) >= STRATEGY_FUNDAMENTAL_RULES.roeMinimumPct;
      const noPledgePass = pledgedPct == null ? null : Number(pledgedPct) === 0;
      const institutionalInvolvementPass = fiiPct != null && diiPct != null ? Number(fiiPct) + Number(diiPct) > 0 : null;
      const institutionalIncreasing = latestHolding.fiiPct != null && previousHolding.fiiPct != null && latestHolding.diiPct != null && previousHolding.diiPct != null
        ? Number(latestHolding.fiiPct) + Number(latestHolding.diiPct) > Number(previousHolding.fiiPct) + Number(previousHolding.diiPct) : null;
      const cashFlowPass = cashFlowRatio == null ? null : cfo! > 0 && cashFlowRatio >= STRATEGY_FUNDAMENTAL_RULES.cashFlowToOperatingProfitMinimum;
      const checks = [promoterPass, profitableLast8Quarters === true, rocePass, roePass, noPledgePass === true, institutionalInvolvementPass === true, cashFlowPass === true];
      const passCount = checks.filter(Boolean).length;
      const evidenceCount = [promoterPct, profitableLast8Quarters, rocePct, roePct, pledgedPct, institutionalInvolvementPass, cashFlowRatio].filter(v => v !== null).length;
      const population: FundamentalPopulation = passCount === checks.length ? 'FULLY_COMPLIANT' : passCount > 0 ? 'PARTIAL' : 'NOT_COMPLIANT';
      const sun = sunriseBySymbol.get(symbol);
      const symbolDeals = deals.filter(d => String(d.symbol || '').trim().toUpperCase() === symbol).slice(0, 10);
      out.set(symbol, {
        symbol, population, passCount, totalChecks: checks.length,
        promoterPct: promoterPct == null ? null : Number(promoterPct), promoterPass,
        profitableLast8Quarters, profitableQuarterCount,
        rocePct: rocePct == null ? null : Number(rocePct), rocePass,
        roePct: roePct == null ? null : Number(roePct), roePass,
        pledgedPct: pledgedPct == null ? null : Number(pledgedPct), noPledgePass,
        fiiPct: fiiPct == null ? null : Number(fiiPct), diiPct: diiPct == null ? null : Number(diiPct),
        institutionalInvolvementPass, institutionalIncreasing,
        latestOperatingProfitCr: opProfit, latestCfoCr: cfo, cashFlowToOperatingProfit: cashFlowRatio, cashFlowPass,
        sunriseSector: sun?.verticalName || null, pliScheme: sun?.pliScheme || null,
        qglpStatus: 'NOT_AVAILABLE', qglpScore: null,
        qglpReason: 'No authenticated QGLP score was available in the strategy-export data path.',
        sectorMomentumStatus: 'NOT_AVAILABLE', sectorMomentumPct: null, stockMomentumPct: null,
        doubleMomentumStatus: 'NOT_AVAILABLE',
        institutionalPurchases: symbolDeals.map(d => ({ clientName: String(d.clientName || ''), quantity: Number(d.quantity), rate: Number(d.rate), date: String(d.date || ''), dealType: String(d.dealType || '') })),
        evidenceStatus: evidenceCount === 0 ? 'UNAVAILABLE' : evidenceCount < checks.length ? 'PARTIAL' : 'VERIFIED',
        evidenceNote: evidenceCount < checks.length ? 'One or more required fields are unavailable and therefore failed closed.' : 'All filter inputs are present in SQLite evidence tables.',
      });
    }
    return out;
  }
}
