/**
 * MarketContextModuleAdapter.ts
 *
 * Agent F Deliverable:
 * Adapts market and sector context into canonical ModuleResult<MarketContextPayload>.
 *
 * Invariants:
 * - Returns Stock trend, Sector trend, Nifty 50 trend, Nifty 500 trend, RS, and Flow proxy
 * - If sector data does not exist: returns DATA_INSUFFICIENT, not neutral
 * - Genuine calculations via SectorMomentumService and SectorFlowService
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { MarketContextPayload } from '../types/MarketContextPayload.js';
import { AnalysisEvidenceRepository } from '../AnalysisEvidenceRepository.js';
import { SectorMomentumService, classifySectorMomentum, SECTOR_INDEX_MAP } from '../../SectorMomentumService.js';
import { SectorFlowService } from '../../SectorFlowService.js';
import { TechnicalModuleAdapter } from './TechnicalModuleAdapter.js';
import { DuckDbAdjustedOhlcvService } from '../../DuckDbAdjustedOhlcvService.js';
import { getDB, dbGet } from '../../../database.js';

export class MarketContextModuleAdapter {
  private static instance: MarketContextModuleAdapter;

  private constructor() {}

  public static getInstance(): MarketContextModuleAdapter {
    if (!MarketContextModuleAdapter.instance) {
      MarketContextModuleAdapter.instance = new MarketContextModuleAdapter();
    }
    return MarketContextModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<MarketContextPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    // 1. Resolve ticker sector
    let sectorName: string | null = null;
    try {
      const db = getDB();
      if (db) {
        const ticker = await dbGet<any>(
          db,
          `SELECT sector FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
          [cleanSym]
        );
        if (ticker?.sector) {
          sectorName = ticker.sector;
        }
      }
    } catch {
      // Non-fatal
    }

    // 2. Fetch stock trend from TechnicalModuleAdapter
    let stockTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' = 'UNKNOWN';
    let stockRs: number | null = null;
    try {
      const techRes = await TechnicalModuleAdapter.getInstance().run(cleanSym);
      if (techRes.result) {
        stockTrend = techRes.result.trend;
        stockRs = techRes.result.rsPercentile;
        evidenceRefs.push(...techRes.evidenceRefs.slice(0, 1));
      }
    } catch {
      // Non-fatal
    }

    // 3. Fetch sector momentum
    let sectorTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    let sectorRs: number | null = null;

    if (sectorName) {
      try {
        const secRes = await AnalysisEvidenceRepository.getInstance().getSectorMomentum(cleanSym, sectorName);
        if (secRes.snapshot && secRes.snapshot.status !== 'UNAVAILABLE') {
          sectorTrend = secRes.snapshot.status === 'BULLISH' ? 'BULLISH' : 'BEARISH';
          sectorRs = secRes.snapshot.return20dPct;
          evidenceRefs.push(...secRes.provenance);
        }
      } catch {
        // Sector momentum evaluation fail closed
      }
    }

    // 4. Fetch Nifty 50 and Nifty 500 benchmarks
    let nifty50Trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' = 'UNKNOWN';
    let nifty500Trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN' = 'UNKNOWN';

    try {
      const n50Bars = await DuckDbAdjustedOhlcvService.getDailyBars('NIFTY 50', 50);
      if (n50Bars && n50Bars.length >= 20) {
        const close = Number(n50Bars[n50Bars.length - 1].close_adjusted);
        const sma20 = n50Bars.slice(-20).reduce((acc, b) => acc + Number(b.close_adjusted), 0) / 20;
        nifty50Trend = close > sma20 ? 'BULLISH' : 'BEARISH';
        evidenceRefs.push({
          evidenceId: `BENCHMARK_NIFTY50`,
          sourceType: 'DUCKDB_OHLCV',
          sourceId: 'NIFTY 50',
          timestamp: evaluationTimestamp,
          notes: `Nifty 50 benchmark evaluated vs 20-day SMA`,
        });
      }
    } catch {
      // Benchmark unavailable
    }

    try {
      const n500Bars = await DuckDbAdjustedOhlcvService.getDailyBars('NIFTY 500', 50);
      if (n500Bars && n500Bars.length >= 20) {
        const close = Number(n500Bars[n500Bars.length - 1].close_adjusted);
        const sma20 = n500Bars.slice(-20).reduce((acc, b) => acc + Number(b.close_adjusted), 0) / 20;
        nifty500Trend = close > sma20 ? 'BULLISH' : 'BEARISH';
      }
    } catch {
      // Benchmark unavailable
    }

    // 5. Fetch Sector Institutional Flow Proxy
    let sectorFlowProxy: string | null = null;
    if (sectorName) {
      try {
        const flows = await SectorFlowService.getSectorFlows();
        const secFlow = flows.find(f => f.sector?.toUpperCase() === sectorName?.toUpperCase());
        if (secFlow) {
          sectorFlowProxy = secFlow.status;
          evidenceRefs.push({
            evidenceId: `SECTOR_FLOW_${sectorName}`,
            sourceType: 'SECTOR_SERVICE',
            sourceId: 'SectorFlowService',
            timestamp: evaluationTimestamp,
            notes: `Institutional flow status: ${secFlow.status}`,
          });
        }
      } catch {
        // Flow service fail closed
      }
    }

    const hasData = stockTrend !== 'UNKNOWN' || sectorTrend !== 'DATA_INSUFFICIENT' || nifty50Trend !== 'UNKNOWN';
    const status: ModuleStatus = hasData ? 'WORKING' : 'DATA_INSUFFICIENT';

    const payload: MarketContextPayload = {
      stockTrend,
      sectorName,
      sectorTrend,
      nifty50Trend,
      nifty500Trend,
      sectorRelativeStrength: sectorRs,
      stockRelativeStrength: stockRs,
      sectorFlowProxy,
      dataAsOf: evaluationTimestamp,
    };

    return {
      moduleId: 'MARKET_CONTEXT',
      status,
      dataStatus: hasData ? 'VERIFIED' : 'DATA_INSUFFICIENT',
      result: payload,
      evidenceRefs,
      missingRequirements: hasData ? [] : ['Sector and market trend data unavailable'],
      warnings: [],
      evaluationTimestamp,
      dataAsOf: evaluationTimestamp,
      configVersion: '1.0.0',
      engineVersion: 'MarketContextModuleAdapter-v1.0',
    };
  }
}
