import { dbAll, getDB } from '../database.js';
import { SectorMomentumService, SectorMomentumSnapshot } from './SectorMomentumService.js';

export type SectorFlowStatus = 'HEAVY_INFLOW' | 'ACCUMULATION' | 'NEUTRAL' | 'OUTFLOW' | 'UNAVAILABLE';

export interface SectorFlowSnapshot {
  sector: string;
  status: SectorFlowStatus;
  fIIChangePct: number | null;
  dIIChangePct: number | null;
  institutionalChangePct: number | null;
  netDealValueCr: number | null;
  coveredStocks: number;
  totalStocks: number;
  coveragePct: number;
  momentum: SectorMomentumSnapshot;
  reason: string;
  source: string[];
  asOf: string | null;
}

type Row = Record<string, any>;

export class SectorFlowService {
  static async getSectorFlows(fromDate?: string, toDate?: string): Promise<SectorFlowSnapshot[]> {
    const db = getDB();
    const tickers = await dbAll<Row>(db, `SELECT upper(symbol) symbol, sector FROM MasterTickers WHERE symbol IS NOT NULL AND sector IS NOT NULL AND trim(sector) <> ''`).catch(() => []);
    const symbols = [...new Set(tickers.map(r => String(r.symbol).trim()).filter(Boolean))];
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => '?').join(',');
    const holdings = await dbAll<Row>(db, `SELECT upper(symbol) symbol, quarter_label, as_of_date, fii_pct, dii_pct FROM HistoricalShareholdingPattern WHERE upper(symbol) IN (${placeholders}) ORDER BY as_of_date DESC`, symbols).catch(() => []);
    const caps = await dbAll<Row>(db, `SELECT upper(symbol) symbol, market_cap_cr FROM DataQualityAuditLedger WHERE upper(symbol) IN (${placeholders})`, symbols).catch(() => []);
    const capBySymbol = new Map<string, number>(caps.map(r => [String(r.symbol), Number(r.market_cap_cr)] as [string, number]));
    const deals = await dbAll<Row>(db, `SELECT upper(symbol) symbol, trade_price, quantity, deal_date, deal_type FROM InstitutionalDeals WHERE upper(symbol) IN (${placeholders}) ${fromDate ? 'AND date(deal_date) >= date(?)' : ''} ${toDate ? 'AND date(deal_date) <= date(?)' : ''}`, [...symbols, ...(fromDate ? [fromDate] : []), ...(toDate ? [toDate] : [])]).catch(() => []);
    const sectorSymbols = new Map<string, string[]>();
    for (const row of tickers) { const sector = String(row.sector).trim(); if (!sectorSymbols.has(sector)) sectorSymbols.set(sector, []); sectorSymbols.get(sector)!.push(String(row.symbol)); }
    const result: SectorFlowSnapshot[] = [];
    for (const [sector, sectorSyms] of sectorSymbols) {
      let totalWeight = 0; let coveredWeight = 0; let fiiWeighted = 0; let diiWeighted = 0; let instDeltaWeighted = 0;
      for (const symbol of sectorSyms) {
        const rows = holdings.filter(r => String(r.symbol) === symbol).sort((a, b) => String(b.as_of_date || '').localeCompare(String(a.as_of_date || '')));
        const current = rows[0]; const previous = rows.find(r => String(r.quarter_label) !== String(current?.quarter_label));
        const weight = capBySymbol.get(symbol);
        if (weight == null || !Number.isFinite(weight) || weight <= 0) continue;
        totalWeight += weight;
        if (!current || !previous) continue;
        const fiiDelta = Number(current.fii_pct) - Number(previous.fii_pct); const diiDelta = Number(current.dii_pct) - Number(previous.dii_pct);
        if (!Number.isFinite(fiiDelta) || !Number.isFinite(diiDelta)) continue;
        coveredWeight += weight; fiiWeighted += weight * fiiDelta; diiWeighted += weight * diiDelta; instDeltaWeighted += weight * (fiiDelta + diiDelta);
      }
      const coveragePct = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0;
      const fiiChangePct = coveredWeight > 0 ? fiiWeighted / coveredWeight : null;
      const diiChangePct = coveredWeight > 0 ? diiWeighted / coveredWeight : null;
      const institutionalChangePct = coveredWeight > 0 ? instDeltaWeighted / coveredWeight : null;
      const sectorDeals = deals.filter(r => sectorSyms.includes(String(r.symbol)));
      const netDealValueCr = sectorDeals.length ? sectorDeals.reduce((sum, r) => { const value = Number(r.trade_price) * Number(r.quantity) / 1e7; const type = String(r.deal_type || '').toUpperCase(); return sum + (type.includes('SELL') ? -value : value); }, 0) : null;
      const momentum = await SectorMomentumService.getForSector(sector);
      const sufficient = coveragePct >= 60 && institutionalChangePct !== null;
      const corroboratedInflow = sufficient && institutionalChangePct! > 0 && (netDealValueCr === null || netDealValueCr > 0) && momentum.status === 'BULLISH';
      const corroboratedOutflow = sufficient && institutionalChangePct! < 0 && netDealValueCr !== null && netDealValueCr < 0 && momentum.status === 'NOT_BULLISH';
      const status: SectorFlowStatus = !sufficient ? 'UNAVAILABLE' : corroboratedInflow ? 'HEAVY_INFLOW' : corroboratedOutflow ? 'OUTFLOW' : institutionalChangePct! > 0 ? 'ACCUMULATION' : institutionalChangePct! < 0 ? 'OUTFLOW' : 'NEUTRAL';
      const source = ['HistoricalShareholdingPattern', 'DataQualityAuditLedger']; if (sectorDeals.length) source.push('InstitutionalDeals'); if (momentum.source !== 'UNAVAILABLE') source.push('DuckDBAdjustedOHLCV');
      result.push({ sector, status, fIIChangePct: fiiChangePct, dIIChangePct: diiChangePct, institutionalChangePct, netDealValueCr, coveredStocks: Math.round(coveredWeight > 0 ? sectorSyms.length * coveragePct / 100 : 0), totalStocks: sectorSyms.length, coveragePct, momentum, reason: !sufficient ? 'Insufficient weighted current and prior-quarter shareholding coverage.' : status === 'HEAVY_INFLOW' ? 'Positive weighted institutional ownership change, compatible disclosed deal flow, and bullish sector-index confirmation.' : status === 'OUTFLOW' ? 'Negative institutional evidence with weak or negative confirmation.' : status === 'ACCUMULATION' ? 'Positive weighted institutional ownership change; deal or price confirmation is incomplete.' : 'No verified directional institutional change.', source, asOf: holdings.map(r => String(r.as_of_date || '')).sort().pop() || null });
    }
    return result.sort((a, b) => (b.institutionalChangePct ?? -Infinity) - (a.institutionalChangePct ?? -Infinity));
  }
}
