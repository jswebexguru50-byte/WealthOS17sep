import { dbAll, getDB } from '../database.js';
import { SECTOR_INDEX_MAP, classifySectorMomentum, calculateSma, calculateEma, calculateRsi, calculateAtrPct } from './SectorMomentumService.js';
import { DuckDbAdjustedOhlcvService, AdjustedOhlcvBar } from './DuckDbAdjustedOhlcvService.js';

export interface EnrichedCandidateFields {
  companyName: string | null;

  // Technical
  latestOhlcvDate: string | null;
  ohlcvStatus: 'AVAILABLE' | 'STALE' | 'NOT_CHECKED' | 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE';
  aboveEma20: boolean | null;
  aboveSma20: boolean | null;
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  ema20: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atrPct: number | null;
  latestClose: number | null;
  signalCmp: number | null;
  latestVolume: number | null;
  stockReturn5D: number | null;
  stockReturn20D: number | null;
  volumeSignal: string | null;
  stockMomentumStatus: 'BULLISH' | 'NEUTRAL' | 'WEAK' | 'DATA_INSUFFICIENT';

  // Sector
  sector: string | null;
  industry: string | null;
  sectorIndex: string | null;
  sectorMappingStatus: 'MAPPED' | 'UNMAPPED' | 'DATA_INSUFFICIENT';
  sectorLatestDate: string | null;
  sectorReturn5D: number | null;
  sectorReturn20D: number | null;
  sectorAboveEma20: boolean | null;
  sectorAboveSma20: boolean | null;
  sectorAboveSma50: boolean | null;
  sectorAboveSma200: boolean | null;
  sectorRsi14: number | null;
  sectorMomentumStatus: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'WEAK' | 'BEARISH' | 'DATA_INSUFFICIENT';
  doubleMomentumStatus: 'YES' | 'NO' | 'DATA_INSUFFICIENT';

  // Market Cap
  marketCapCr: number | null;
  marketCapCategory: 'SMALL_CAP' | 'MID_CAP' | 'LARGE_CAP' | 'UNAVAILABLE';
  marketCapSource: string | null;
  marketCapFetchedAt: string | null;

  // QGLP/Fundamental
  qglpStatus: 'AVAILABLE' | 'PARTIAL' | 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE';
  qglpOverallRating: string | null;
  fundamentalEvidenceState: 'SUPPORTIVE' | 'MIXED_WATCH' | 'CONCERN' | 'MISSING_CONFLICTING' | 'DATA_INSUFFICIENT';
  missingCriticalDataCount: number;
  missingCriticalFields: string[];

  // Evidence Status
  trendlyneFreshnessStatus: 'VALID' | 'STALE' | 'NOT_CHECKED' | 'DATA_INSUFFICIENT' | null;
  fereStatus: string | null;
  technicalFreshnessStatus: 'VALID' | 'STALE' | 'NOT_CHECKED' | 'DATA_INSUFFICIENT' | null;
  dataCompletenessStatus: 'READY_FOR_ANALYZE' | 'PARTIAL_BUT_ANALYZABLE' | 'DATA_INSUFFICIENT';

  // Actions
  canAnalyze: boolean;
  canBacktest: boolean;
  canPaperTrade: boolean;
  canCreateAlert: boolean;
}

export interface CandidateEnrichmentParams {
  symbol: string;
  cmp?: number | null;
}

export interface CandidateEnrichmentOptions {
  includeTechnicals?: boolean;
  includeSectorMomentum?: boolean;
  includeActionReadiness?: boolean;
}

export class SevenStrategiesCandidateEnrichmentService {
  private static instance: SevenStrategiesCandidateEnrichmentService;

  public static getInstance(): SevenStrategiesCandidateEnrichmentService {
    if (!SevenStrategiesCandidateEnrichmentService.instance) {
      SevenStrategiesCandidateEnrichmentService.instance = new SevenStrategiesCandidateEnrichmentService();
    }
    return SevenStrategiesCandidateEnrichmentService.instance;
  }

  public async bulkEnrich(
    paramsList: CandidateEnrichmentParams[],
    options?: CandidateEnrichmentOptions
  ): Promise<Map<string, EnrichedCandidateFields>> {
    const result = new Map<string, EnrichedCandidateFields>();
    if (paramsList.length === 0) return result;

    const includeTechnicals = options?.includeTechnicals !== false;
    const includeSectorMomentum = options?.includeSectorMomentum !== false;
    const includeActionReadiness = options?.includeActionReadiness !== false;

    // Remove duplicates by symbol
    const uniqueParams = Array.from(new Map(paramsList.map(p => [p.symbol, p])).values());
    const uniqueSymbols = uniqueParams.map(p => p.symbol);
    
    // Chunk to prevent overly large IN clauses
    const chunks = this.chunkArray(uniqueParams, 200);

    for (const chunk of chunks) {
      const placeholders = chunk.map(() => '?').join(',');
      const db = getDB();

      // 1. Load Master & Fundamental Data
      let masterRows: any[] = [];
      try {
        const symbolList = chunk.map(p => p.symbol);
        masterRows = await dbAll(
          db,
          `SELECT m.symbol, 
                  COALESCE(m.company_name, m.name) as company_name, 
                  m.sector,
                  d.industry,
                  d.market_cap_cr,
                  d.roce_pct,
                  d.roe_pct,
                  d.cfo_cr,
                  d.latest_pat_cr,
                  d.debt_to_equity,
                  d.pe_ratio,
                  d.latest_sales_cr
           FROM MasterTickers m
           LEFT JOIN DataQualityAuditLedger d ON m.symbol = d.symbol
           WHERE m.symbol IN (${placeholders})`,
          symbolList
        ) as any[];
      } catch (e) {
        console.warn('[BulkEnrichment] Master/Fundamental query failed:', e);
      }

      // 2. Load Latest Technical Data via DuckDB (conditional)
      let technicalBarsBySymbol = new Map<string, AdjustedOhlcvBar[]>();
      let duckDbError = false;
      if (includeTechnicals) {
        try {
          const symbolList = chunk.map(p => p.symbol);
          const res = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(symbolList, 250);
          technicalBarsBySymbol = res.bars;
        } catch (e) {
          console.warn('[BulkEnrichment] Technical query failed:', e);
          duckDbError = true;
        }
      }

      // 3. Load Sector Momentum Data (conditional)
      let indexBarsBySymbol: Record<string, any[]> = {};
      if (includeSectorMomentum) {
        const sectorNames = Array.from(new Set(masterRows.map(r => r.sector).filter(Boolean)));
        const requiredIndices = Array.from(new Set(sectorNames.map(s => SECTOR_INDEX_MAP[s.trim().toUpperCase()]).filter(Boolean)));
        
        if (requiredIndices.length > 0) {
          try {
            const idxPlaceholders = requiredIndices.map(() => '?').join(',');
            const indexRows = await dbAll(
              db,
              `SELECT index_symbol, trade_date, close
               FROM IndexOHLCV
               WHERE index_symbol IN (${idxPlaceholders})
               ORDER BY trade_date ASC`,
              requiredIndices
            ) as any[];

            for (const row of indexRows) {
              if (!indexBarsBySymbol[row.index_symbol]) indexBarsBySymbol[row.index_symbol] = [];
              // SectorMomentumService expects AdjustedOhlcvBar format
              indexBarsBySymbol[row.index_symbol].push({
                trade_date: row.trade_date,
                close_adjusted: row.close
              });
            }
          } catch (e) {
            console.warn('[BulkEnrichment] Sector Index query failed:', e);
          }
        }
      }

      for (const param of chunk) {
        const symbol = param.symbol;
        const master = masterRows.find(r => r.symbol === symbol) || {};
        
        // --- Market Cap ---
        const mcap = master.market_cap_cr ? Number(master.market_cap_cr) : null;
        let mcapCategory: EnrichedCandidateFields['marketCapCategory'] = 'UNAVAILABLE';
        if (mcap !== null) {
          if (mcap >= 20000) mcapCategory = 'LARGE_CAP';
          else if (mcap >= 5000) mcapCategory = 'MID_CAP';
          else mcapCategory = 'SMALL_CAP';
        }

        // --- Sector & Index Mapping ---
        const sector = master.sector || null;
        const normSector = sector?.trim().toUpperCase() || null;
        const mappedIndex = normSector ? SECTOR_INDEX_MAP[normSector] || null : null;
        
        let sectorMomentumStatus: EnrichedCandidateFields['sectorMomentumStatus'] = 'DATA_INSUFFICIENT';
        let sectorLatestDate: string | null = null;
        let sectorReturn5D: number | null = null;
        let sectorReturn20D: number | null = null;
        let sectorAboveEma20: boolean | null = null;
        let sectorAboveSma20: boolean | null = null;
        let sectorAboveSma50: boolean | null = null;
        let sectorAboveSma200: boolean | null = null;
        let sectorRsi14: number | null = null;
        let sectorMappingStatus: EnrichedCandidateFields['sectorMappingStatus'] = mappedIndex ? 'MAPPED' : 'UNMAPPED';
        
        if (mappedIndex && indexBarsBySymbol[mappedIndex]) {
          const bars = indexBarsBySymbol[mappedIndex];
          if (bars.length > 0) {
            const sm = classifySectorMomentum(sector, bars as any);
            sectorLatestDate = sm.asOf;
            if (sm.status === 'BULLISH') {
              sectorMomentumStatus = 'BULLISH';
            } else if (sm.status === 'NOT_BULLISH') {
              if (sm.aboveEma20 === false && sm.aboveSma20 === false && sm.aboveSma50 === false) {
                sectorMomentumStatus = 'WEAK';
              } else {
                sectorMomentumStatus = 'NEUTRAL';
              }
            } else {
              sectorMomentumStatus = 'DATA_INSUFFICIENT';
            }
            sectorReturn5D = sm.return5dPct;
            sectorReturn20D = sm.return20dPct;
            sectorAboveEma20 = sm.aboveEma20;
            sectorAboveSma20 = sm.aboveSma20;
            sectorAboveSma50 = sm.aboveSma50;
            sectorAboveSma200 = sm.aboveSma200;
            sectorRsi14 = sm.rsi14;
          }
        }

        // --- Technical & Stock Momentum ---
        const stockBarsRaw = technicalBarsBySymbol.get(symbol) || [];
        const stockBars = stockBarsRaw.slice().sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
        const values = stockBars.map(b => Number(b.close_adjusted));
        
        const hasTech = stockBars.length > 0;
        const signalCmp = param.cmp ?? null;
        const cmp = signalCmp;
        const latestClose = hasTech ? values[values.length - 1] : null;
        const latestOhlcvDate = hasTech ? stockBars[stockBars.length - 1].trade_date : null;
        const latestVolume = hasTech ? stockBars[stockBars.length - 1].volume_raw : null;

        const ema20 = calculateEma(values, 20);
        const sma20 = calculateSma(values, 20);
        const sma50 = calculateSma(values, 50);
        const sma200 = calculateSma(values, 200);
        const rsi14 = calculateRsi(values, 14);
        const atrPct = calculateAtrPct(stockBars as any, 14);
        
        const prev5 = values.length >= 6 ? values[values.length - 6] : null;
        const stockReturn5D = latestClose !== null && prev5 !== null && prev5 !== 0 ? ((latestClose / prev5) - 1) * 100 : null;
        
        const prev20 = values.length >= 21 ? values[values.length - 21] : null;
        const stockReturn20D = latestClose !== null && prev20 !== null && prev20 !== 0 ? ((latestClose / prev20) - 1) * 100 : null;
        
        const aboveEma20 = latestClose !== null && ema20 !== null ? latestClose > ema20 : null;
        const aboveSma20 = latestClose !== null && sma20 !== null ? latestClose > sma20 : null;
        const aboveSma50 = latestClose !== null && sma50 !== null ? latestClose > sma50 : null;
        const aboveSma200 = latestClose !== null && sma200 !== null ? latestClose > sma200 : null;
        
        let stockMomentumStatus: EnrichedCandidateFields['stockMomentumStatus'] = 'DATA_INSUFFICIENT';
        if (hasTech && ema20 !== null && sma20 !== null && sma50 !== null) {
          if (aboveEma20 && aboveSma20 && aboveSma50) stockMomentumStatus = 'BULLISH';
          else if (!aboveEma20 && !aboveSma20 && !aboveSma50) stockMomentumStatus = 'WEAK';
          else stockMomentumStatus = 'NEUTRAL';
        }
        
        let ohlcvStatus: EnrichedCandidateFields['ohlcvStatus'] = includeTechnicals 
          ? (duckDbError ? 'SOURCE_UNAVAILABLE' : (hasTech ? 'AVAILABLE' : 'DATA_INSUFFICIENT'))
          : 'NOT_CHECKED';
        if (includeTechnicals && hasTech && !duckDbError) {
           const isStale = (new Date().getTime() - new Date(latestOhlcvDate!).getTime()) > (7 * 24 * 60 * 60 * 1000);
           if (isStale) ohlcvStatus = 'STALE';
        }

        // Double momentum
        let doubleMomentumStatus: EnrichedCandidateFields['doubleMomentumStatus'] = 'DATA_INSUFFICIENT';
        if (stockMomentumStatus === 'BULLISH' && sectorMomentumStatus === 'BULLISH') {
          doubleMomentumStatus = 'YES';
        } else if (stockMomentumStatus !== 'DATA_INSUFFICIENT' && sectorMomentumStatus !== 'DATA_INSUFFICIENT') {
          doubleMomentumStatus = 'NO';
        }

        // --- Fundamental/QGLP Readiness ---
        const missingFields: string[] = [];
        if (!mcap) missingFields.push('Market Cap');
        if (!sector) missingFields.push('Sector');
        
        if (master.roce_pct == null && master.roe_pct == null) missingFields.push('ROE/ROCE');
        if (master.cfo_cr == null || master.latest_pat_cr == null) missingFields.push('CFO/PAT');
        if (master.debt_to_equity == null) missingFields.push('Debt/Equity');
        if (master.pe_ratio == null) missingFields.push('PE');

        let qglpStatus: EnrichedCandidateFields['qglpStatus'] = 'DATA_INSUFFICIENT';

        // --- Action Readiness ---
        const canAnalyze = !!master.symbol;
        const canBacktest = includeActionReadiness && includeTechnicals && !!master.symbol && stockBars.length >= 200 && ohlcvStatus === 'AVAILABLE';
        const canPaperTrade = includeActionReadiness && includeTechnicals && !!master.symbol && latestClose !== null && ohlcvStatus === 'AVAILABLE';
        const canCreateAlert = includeActionReadiness && includeTechnicals && !!master.symbol && latestClose !== null && ohlcvStatus === 'AVAILABLE';

        const enrichment: EnrichedCandidateFields = {
          companyName: master.company_name || null,

          latestOhlcvDate,
          ohlcvStatus,
          aboveEma20,
          aboveSma20,
          aboveSma50,
          aboveSma200,
          ema20,
          sma20,
          sma50,
          sma200,
          rsi14,
          atrPct,
          latestClose,
          signalCmp,
          latestVolume,
          stockReturn5D,
          stockReturn20D,
          volumeSignal: null,
          stockMomentumStatus,

          sector,
          industry: master.industry || null,
          sectorIndex: mappedIndex,
          sectorMappingStatus,
          sectorLatestDate,
          sectorReturn5D,
          sectorReturn20D,
          sectorAboveEma20,
          sectorAboveSma20,
          sectorAboveSma50,
          sectorAboveSma200,
          sectorRsi14,
          sectorMomentumStatus,
          doubleMomentumStatus,

          marketCapCr: mcap,
          marketCapCategory: mcapCategory,
          marketCapSource: null,
          marketCapFetchedAt: null,

          qglpStatus,
          qglpOverallRating: null,
          fundamentalEvidenceState: 'DATA_INSUFFICIENT',
          missingCriticalDataCount: missingFields.length,
          missingCriticalFields: missingFields,

          trendlyneFreshnessStatus: 'NOT_CHECKED',
          fereStatus: null,
          technicalFreshnessStatus: ohlcvStatus === 'AVAILABLE' ? 'VALID' : (ohlcvStatus === 'STALE' ? 'STALE' : 'DATA_INSUFFICIENT'),
          dataCompletenessStatus: !master.symbol ? 'DATA_INSUFFICIENT' : 'PARTIAL_BUT_ANALYZABLE',

          canAnalyze,
          canBacktest,
          canPaperTrade,
          canCreateAlert,
        };

        result.set(symbol, enrichment);
      }
    }

    return result;
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }
}
