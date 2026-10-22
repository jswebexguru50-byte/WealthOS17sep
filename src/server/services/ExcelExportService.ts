/**
 * ExcelExportService.ts
 *
 * Phase D: Excel Export Service for Strategy Scan Results
 *
 * Generates comprehensive Excel workbooks from strategy_scan_cache and strategy_scan_metadata.
 * Produces 5 sheets:
 *   1. Summary Sheet - high-level strategy metrics
 *   2. Per-Strategy Details - qualified stocks per strategy
 *   3. Convergence Matrix - cross-strategy qualification matrix
 *   4. Console Log - full trade details (debug/detailed)
 *   5. Metadata & Parameters - scan metadata and configuration
 */

import * as XLSX from 'xlsx';
import { Database } from 'sqlite3';
import { dbAll, dbGet } from '../database.js';
import { StrategyFundamentalFilterService, StrategyFundamentalEnrichment } from './StrategyFundamentalFilterService.js';
import { SectorMomentumService, SectorMomentumSnapshot } from './SectorMomentumService.js';
import { SectorFlowService, SectorFlowSnapshot } from './SectorFlowService.js';

export interface ScanResult {
  id: string;
  scan_id: string;
  strategy_id: string;
  symbol: string;
  qualified: boolean;
  entry_price: number | null;
  target1: number | null;
  target2: number | null;
  stop_loss: number | null;
  rr_ratio: number | null;
  confidence_pct: number | null;
  rule_checks_json: string | null;
  scan_date: string;
}

export interface ScanMetadata {
  id: string;
  scan_id: string;
  strategy_ids_json: string;
  universe_count: number;
  stocks_qualified_total: number;
  scan_started_at: string;
  scan_completed_at: string;
  duration_seconds: number;
  status: string;
  error_message: string | null;
}

export interface StrategyInfo {
  strategy_id: string;
  strategy_name: string;
  category: string;
  total_stocks: number;
  qualified_count: number;
  qualification_rate: number;
  avg_rr_ratio: number;
  min_rr_ratio: number;
  max_rr_ratio: number;
  date_added?: string;
  last_updated?: string;
}

export class ExcelExportService {
  private static instance: ExcelExportService;

  private constructor() {}

  public static getInstance(): ExcelExportService {
    if (!ExcelExportService.instance) {
      ExcelExportService.instance = new ExcelExportService();
    }
    return ExcelExportService.instance;
  }

  /**
   * Generate comprehensive Excel export for a given scan ID
   */
  public async generateComprehensiveExport(
    scanId: string,
    db: Database,
    options: { fromDate?: string; toDate?: string } = {}
  ): Promise<Buffer> {
    try {
      // Fetch metadata
      const metadata = await this.fetchScanMetadata(db, scanId);
      if (!metadata) {
        throw new Error(`Scan ID ${scanId} not found`);
      }

      // Fetch all results
      const results = await this.fetchScanResults(db, scanId, options);
      const selectedResults = results.filter(r => r.qualified);
      const fundamentalMap = await StrategyFundamentalFilterService.getInstance()
        .enrichSymbols(db, selectedResults.map(r => r.symbol));

      // Parse strategy list from metadata
      const strategyIds = JSON.parse(metadata.strategy_ids_json || '[]');

      // Build strategy summaries
      const strategySummaries = await this.buildStrategySummaries(db, results, strategyIds);

      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Build sheets
      const sheet1 = this.buildSummarySheet(strategySummaries, metadata);
      const sheet2 = this.buildPerStrategyDetailsSheet(results, strategySummaries);
      const sheet3 = this.buildConvergenceMatrix(results, strategySummaries);
      const sheet4 = this.buildConsoleLog(results);
      const sheet5 = this.buildMetadataSheet(metadata, strategyIds, strategySummaries);
      const fundamentalRows = selectedResults.map(result => ({ result, enrichment: fundamentalMap.get(result.symbol.toUpperCase()) }));
      const sheet6 = this.buildFundamentalSheet(fundamentalRows, 'ALL_SELECTED');
      const sheet7 = this.buildFundamentalSheet(fundamentalRows, 'FULLY_COMPLIANT');
      const sheet8 = this.buildFundamentalSheet(fundamentalRows, 'PARTIAL');
      const masterRows = await this.buildMasterAnalysisRows(db, selectedResults, fundamentalMap, options);
      const sheet9 = this.buildMasterAnalysisSheet(masterRows);

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Summary');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Strategy Details');
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Convergence Matrix');
      XLSX.utils.book_append_sheet(workbook, sheet4, 'Console Log');
      XLSX.utils.book_append_sheet(workbook, sheet5, 'Metadata');
      XLSX.utils.book_append_sheet(workbook, sheet6, 'Fundamental Population');
      XLSX.utils.book_append_sheet(workbook, sheet7, 'Fully Compliant');
      XLSX.utils.book_append_sheet(workbook, sheet8, 'Partial Compliant');
      XLSX.utils.book_append_sheet(workbook, sheet9, 'Master Analysis');

      // Write to buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return buffer as Buffer;
    } catch (error: any) {
      console.error('[ExcelExportService] Export failed:', error);
      throw error;
    }
  }

  private async buildMasterAnalysisRows(
    db: Database,
    results: ScanResult[],
    fundamentalMap: Map<string, StrategyFundamentalEnrichment>,
    options: { fromDate?: string; toDate?: string }
  ): Promise<any[]> {
    const symbols = [...new Set(results.filter(r => r.qualified).map(r => r.symbol.toUpperCase()))];
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => '?').join(',');
    const ledger = await dbAll<any>(db, `SELECT symbol, sector, market_cap_cr FROM DataQualityAuditLedger WHERE upper(symbol) IN (${placeholders})`, symbols).catch(() => []);
    const masters = await dbAll<any>(db, `SELECT symbol, sector FROM MasterTickers WHERE upper(symbol) IN (${placeholders})`, symbols).catch(() => []);
    const marketBySymbol = new Map<string, any>(masters.map((r: any) => [String(r.symbol).toUpperCase(), r]));
    for (const row of ledger) {
      const key = String(row.symbol).toUpperCase();
      const existing = marketBySymbol.get(key) || {};
      const cleanRow = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== ''));
      marketBySymbol.set(key, { ...existing, ...cleanRow });
    }
    const sectors = [...new Set([...marketBySymbol.values()].map((r: any) => String(r.sector || '').trim()).filter(Boolean))];
    const momentumEntries = await Promise.all(sectors.map(async sector => [sector, await SectorMomentumService.getForSector(sector)] as const));
    const momentumBySector = new Map(momentumEntries);
    const flowRows = await SectorFlowService.getSectorFlows(options.fromDate, options.toDate);
    const flowBySector = new Map(flowRows.map(row => [row.sector, row]));
    return results.filter(r => r.qualified).map(result => {
      const symbol = result.symbol.toUpperCase();
      const enrichment = fundamentalMap.get(symbol);
      const source = marketBySymbol.get(symbol) || {};
      const marketCapCr = source.market_cap_cr == null || !Number.isFinite(Number(source.market_cap_cr)) ? null : Number(source.market_cap_cr);
      const capCategory = marketCapCr == null ? 'UNAVAILABLE' : marketCapCr <= 5000 ? 'SMALL_CAP' : marketCapCr <= 20000 ? 'MID_CAP' : 'LARGE_CAP';
      const momentum: SectorMomentumSnapshot = momentumBySector.get(String(source.sector || '')) || {
        sectorName: source.sector || null, indexSymbol: null, asOf: null, status: 'UNAVAILABLE', aboveEma20: null, aboveSma20: null,
        aboveSma50: null, aboveSma200: null, close: null, ema20: null, sma20: null, sma50: null, sma200: null, rsi14: null, return5dPct: null, return20dPct: null, source: 'UNAVAILABLE'
      };
      const flow: SectorFlowSnapshot | undefined = flowBySector.get(String(source.sector || ''));
      return {
        'Signal Date': result.scan_date ? new Date(`${result.scan_date}T00:00:00Z`) : null, Symbol: symbol, Strategy: result.strategy_id, Entry: result.entry_price, Stop: result.stop_loss, Target1: result.target1, Target2: result.target2,
        'R:R': result.rr_ratio, Confidence: result.confidence_pct, Sector: source.sector || 'UNAVAILABLE', 'Market Cap (Cr)': marketCapCr,
        'Market Cap Category': capCategory, 'Market Cap Rule': '≤5000 Small; >5000–≤20000 Mid; >20000 Large', 'Sector Index': momentum.indexSymbol || 'UNAVAILABLE',
        'Sector Momentum': momentum.status, 'Above 20 EMA': momentum.aboveEma20 == null ? 'UNAVAILABLE' : momentum.aboveEma20 ? 'YES' : 'NO',
        'Above 20 SMA': momentum.aboveSma20 == null ? 'UNAVAILABLE' : momentum.aboveSma20 ? 'YES' : 'NO', 'Sector Return 20D %': momentum.return20dPct,
        'Sector Momentum Reason': momentum.status === 'BULLISH' ? 'Adjusted sector-index close is above both 20 EMA and 20 SMA.' : momentum.status === 'NOT_BULLISH' ? 'Adjusted sector-index close is not above both 20 EMA and 20 SMA.' : 'No mapped sector index or sufficient adjusted OHLCV evidence.',
        'Sector Flow': flow?.status || 'UNAVAILABLE', 'FII Change %': flow?.fIIChangePct ?? null, 'DII Change %': flow?.dIIChangePct ?? null,
        'Institutional Change %': flow?.institutionalChangePct ?? null, 'Net Deal Value (Cr)': flow?.netDealValueCr ?? null, 'Flow Coverage %': flow?.coveragePct ?? null,
        'Sector Flow Reason': flow?.reason || 'No sector-flow evidence returned.', 'Flow Sources': flow?.source?.join('; ') || 'UNAVAILABLE',
        'Fundamental Population': enrichment?.population || 'UNAVAILABLE', 'Passed Checks': enrichment ? `${enrichment.passCount}/${enrichment.totalChecks}` : 'UNAVAILABLE',
        'Promoter %': enrichment?.promoterPct ?? null, 'Profitable 8Q': enrichment?.profitableLast8Quarters == null ? 'UNAVAILABLE' : enrichment.profitableLast8Quarters ? 'PASS' : 'FAIL',
        'ROCE %': enrichment?.rocePct ?? null, 'ROE %': enrichment?.roePct ?? null, 'Pledged %': enrichment?.pledgedPct ?? null,
        'FII %': enrichment?.fiiPct ?? null, 'DII %': enrichment?.diiPct ?? null, 'Cash Flow Ratio': enrichment?.cashFlowToOperatingProfit ?? null,
        'Institutional Increasing': enrichment?.institutionalIncreasing == null ? 'UNAVAILABLE' : enrichment.institutionalIncreasing ? 'YES' : 'NO',
        'CFO Cr': enrichment?.latestCfoCr ?? null, 'Operating Profit Cr': enrichment?.latestOperatingProfitCr ?? null,
        'Cash Flow >=50%': enrichment?.cashFlowPass == null ? 'UNAVAILABLE' : enrichment.cashFlowPass ? 'PASS' : 'FAIL',
        'Sunrise Sector': enrichment?.sunriseSector ?? null, 'PLI Scheme': enrichment?.pliScheme ?? null,
        'QGLP Status': enrichment?.qglpStatus ?? 'UNAVAILABLE', 'QGLP Score': enrichment?.qglpScore ?? null,
        'Stock Momentum %': enrichment?.stockMomentumPct ?? null, 'Double Momentum': enrichment?.doubleMomentumStatus ?? 'UNAVAILABLE',
        'Recent Institutional Purchases': enrichment?.institutionalPurchases?.length ? JSON.stringify(enrichment.institutionalPurchases) : 'UNAVAILABLE',
        'Evidence Status': enrichment?.evidenceStatus || 'UNAVAILABLE'
      };
    });
  }

  private buildMasterAnalysisSheet(rows: any[]): XLSX.WorkSheet {
    const headers = ['Signal Date', 'Symbol', 'Strategy', 'Entry', 'Stop', 'Target1', 'Target2', 'R:R', 'Confidence', 'Sector', 'Market Cap (Cr)', 'Market Cap Category', 'Market Cap Rule', 'Sector Index', 'Sector Momentum', 'Above 20 EMA', 'Above 20 SMA', 'Sector Return 20D %', 'Sector Momentum Reason', 'Sector Flow', 'FII Change %', 'DII Change %', 'Institutional Change %', 'Net Deal Value (Cr)', 'Flow Coverage %', 'Sector Flow Reason', 'Flow Sources', 'Fundamental Population', 'Passed Checks', 'Promoter %', 'Profitable 8Q', 'ROCE %', 'ROE %', 'Pledged %', 'FII %', 'DII %', 'Institutional Increasing', 'Operating Profit Cr', 'CFO Cr', 'Cash Flow Ratio', 'Cash Flow >=50%', 'Sunrise Sector', 'PLI Scheme', 'QGLP Status', 'QGLP Score', 'Stock Momentum %', 'Double Momentum', 'Recent Institutional Purchases', 'Evidence Status'];
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers, cellDates: true });
    sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(rows.length + 1, 1)}` };
    sheet['!cols'] = headers.map(h => ({ wch: Math.min(42, Math.max(12, h.length + 2)) }));
    return sheet;
  }

  private buildFundamentalSheet(
    rows: Array<{ result: ScanResult; enrichment?: StrategyFundamentalEnrichment }>,
    population: 'ALL_SELECTED' | 'FULLY_COMPLIANT' | 'PARTIAL'
  ): XLSX.WorkSheet {
    const headers = [
      'Symbol', 'Strategy', 'Population', 'Passed Checks', 'Promoter %', 'Promoter >66.6%',
      'Profitable Last 8Q', 'Profitable Quarters Found', 'ROCE %', 'ROCE >=35%', 'ROE %', 'ROE >=25%',
      'Pledged %', 'No Pledge', 'FII %', 'DII %', 'Institutional Involvement', 'Institutional Increasing',
      'Operating Profit Cr', 'CFO Cr', 'CFO / Operating Profit', 'Cash Flow >=50%',
      'Sunrise Sector', 'PLI Scheme', 'QGLP Status', 'QGLP Score', 'Sector Momentum',
      'Stock Momentum', 'Double Momentum', 'Recent Institutional Purchases', 'Evidence Status', 'Evidence Note'
    ];
    const data: any[][] = [headers];
    for (const { result, enrichment } of rows) {
      if (!enrichment) continue;
      if (population !== 'ALL_SELECTED' && enrichment.population !== population) continue;
      data.push([
        result.symbol, result.strategy_id, enrichment.population, `${enrichment.passCount}/${enrichment.totalChecks}`,
        enrichment.promoterPct, enrichment.promoterPass ? 'PASS' : 'FAIL',
        enrichment.profitableLast8Quarters == null ? 'UNAVAILABLE' : enrichment.profitableLast8Quarters ? 'PASS' : 'FAIL',
        enrichment.profitableQuarterCount, enrichment.rocePct, enrichment.rocePass ? 'PASS' : 'FAIL',
        enrichment.roePct, enrichment.roePass ? 'PASS' : 'FAIL', enrichment.pledgedPct,
        enrichment.noPledgePass == null ? 'UNAVAILABLE' : enrichment.noPledgePass ? 'PASS' : 'FAIL',
        enrichment.fiiPct, enrichment.diiPct,
        enrichment.institutionalInvolvementPass == null ? 'UNAVAILABLE' : enrichment.institutionalInvolvementPass ? 'PASS' : 'FAIL',
        enrichment.institutionalIncreasing == null ? 'UNAVAILABLE' : enrichment.institutionalIncreasing ? 'YES' : 'NO',
        enrichment.latestOperatingProfitCr, enrichment.latestCfoCr, enrichment.cashFlowToOperatingProfit,
        enrichment.cashFlowPass == null ? 'UNAVAILABLE' : enrichment.cashFlowPass ? 'PASS' : 'FAIL',
        enrichment.sunriseSector, enrichment.pliScheme, enrichment.qglpStatus, enrichment.qglpScore,
        enrichment.sectorMomentumPct, enrichment.stockMomentumPct, enrichment.doubleMomentumStatus,
        JSON.stringify(enrichment.institutionalPurchases), enrichment.evidenceStatus, enrichment.evidenceNote
      ]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(data.length, 1)}` };
    sheet['!cols'] = headers.map(h => ({ wch: Math.min(34, Math.max(12, h.length + 2)) }));
    return sheet;
  }

  /**
   * Fetch scan metadata
   */
  private async fetchScanMetadata(db: Database, scanId: string): Promise<ScanMetadata | null> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM strategy_scan_metadata WHERE scan_id = ?`,
        [scanId],
        (err, row: ScanMetadata | undefined) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  /**
   * Fetch all scan results for a scan ID
   */
  private async fetchScanResults(db: Database, scanId: string, options: { fromDate?: string; toDate?: string } = {}): Promise<ScanResult[]> {
    const predicates = ['scan_id = ?'];
    const params: any[] = [scanId];
    if (options.fromDate) { predicates.push('date(scan_date) >= date(?)'); params.push(options.fromDate); }
    if (options.toDate) { predicates.push('date(scan_date) <= date(?)'); params.push(options.toDate); }
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM strategy_scan_cache WHERE ${predicates.join(' AND ')} ORDER BY strategy_id, symbol`,
        params,
        (err, rows: ScanResult[] | undefined) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Build strategy summary data
   */
  private async buildStrategySummaries(
    db: Database,
    results: ScanResult[],
    strategyIds: string[]
  ): Promise<StrategyInfo[]> {
    const summaries: StrategyInfo[] = [];

    for (const strategyId of strategyIds) {
      const strategyResults = results.filter(r => r.strategy_id === strategyId);

      if (strategyResults.length === 0) {
        continue;
      }

      const qualifiedCount = strategyResults.filter(r => r.qualified).length;
      const rrRatios = strategyResults
        .filter(r => r.rr_ratio !== null && r.rr_ratio !== undefined)
        .map(r => r.rr_ratio as number);

      const avgRrRatio = rrRatios.length > 0
        ? rrRatios.reduce((a, b) => a + b, 0) / rrRatios.length
        : 0;
      const minRrRatio = rrRatios.length > 0 ? Math.min(...rrRatios) : 0;
      const maxRrRatio = rrRatios.length > 0 ? Math.max(...rrRatios) : 0;

      summaries.push({
        strategy_id: strategyId,
        strategy_name: this.formatStrategyName(strategyId),
        category: this.getStrategyCategory(strategyId),
        total_stocks: strategyResults.length,
        qualified_count: qualifiedCount,
        qualification_rate: strategyResults.length > 0
          ? (qualifiedCount / strategyResults.length) * 100
          : 0,
        avg_rr_ratio: avgRrRatio,
        min_rr_ratio: minRrRatio,
        max_rr_ratio: maxRrRatio
      });
    }

    return summaries;
  }

  /**
   * SHEET 1: Summary Sheet
   */
  private buildSummarySheet(strategies: StrategyInfo[], metadata: ScanMetadata): XLSX.WorkSheet {
    const data: any[] = [
      ['Strategy Name', 'Category', 'Total Stocks', 'Qualified Count', 'Qualification Rate %',
       'Avg R:R Ratio', 'Min R:R', 'Max R:R', 'Date Added', 'Last Updated']
    ];

    for (const strat of strategies) {
      data.push([
        strat.strategy_name,
        strat.category,
        strat.total_stocks,
        strat.qualified_count,
        strat.qualification_rate.toFixed(2),
        strat.avg_rr_ratio.toFixed(2),
        strat.min_rr_ratio.toFixed(2),
        strat.max_rr_ratio.toFixed(2),
        strat.date_added || 'N/A',
        strat.last_updated || 'N/A'
      ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    sheet['!cols'] = [
      { wch: 25 },  // Strategy Name
      { wch: 15 },  // Category
      { wch: 14 },  // Total Stocks
      { wch: 14 },  // Qualified Count
      { wch: 18 },  // Qualification Rate %
      { wch: 14 },  // Avg R:R Ratio
      { wch: 12 },  // Min R:R
      { wch: 12 },  // Max R:R
      { wch: 14 },  // Date Added
      { wch: 14 }   // Last Updated
    ];

    return sheet;
  }

  /**
   * SHEET 2: Per-Strategy Details
   */
  private buildPerStrategyDetailsSheet(results: ScanResult[], strategies: StrategyInfo[]): XLSX.WorkSheet {
    const data: any[] = [];

    for (const strategy of strategies) {
      const strategyResults = results.filter(r => r.strategy_id === strategy.strategy_id);
      const qualifiedResults = strategyResults.filter(r => r.qualified);

      // Add section header
      data.push([`${strategy.strategy_name} - Qualified Stocks (${qualifiedResults.length} total)`, '', '', '', '', '']);
      data.push(['Symbol', 'CMP', 'Entry Price', 'Target', 'Stop Loss', 'R:R Ratio']);

      // Add qualified stocks
      for (const result of qualifiedResults) {
        data.push([
          result.symbol,
          '—',
          result.entry_price ? result.entry_price.toFixed(2) : '—',
          result.target1 ? result.target1.toFixed(2) : '—',
          result.stop_loss ? result.stop_loss.toFixed(2) : '—',
          result.rr_ratio ? result.rr_ratio.toFixed(2) : '—'
        ]);
      }

      // Add blank row between sections
      data.push(['', '', '', '', '', '']);
    }

    const sheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    sheet['!cols'] = [
      { wch: 12 },  // Symbol
      { wch: 12 },  // CMP
      { wch: 12 },  // Entry Price
      { wch: 12 },  // Target
      { wch: 12 },  // Stop Loss
      { wch: 10 }   // R:R Ratio
    ];

    return sheet;
  }

  /**
   * SHEET 3: Convergence Matrix
   */
  private buildConvergenceMatrix(results: ScanResult[], strategies: StrategyInfo[]): XLSX.WorkSheet {
    // Get all unique symbols that qualified in at least one strategy
    const allSymbols = new Set<string>();
    results.forEach(r => {
      if (r.qualified) {
        allSymbols.add(r.symbol);
      }
    });

    const symbols = Array.from(allSymbols).sort();

    // Build header
    const data: any[] = [
      ['Symbol', ...strategies.map(s => s.strategy_id), 'Convergence Count']
    ];

    // Build data rows
    const symbolRows: { symbol: string; convergence: number; row: any[] }[] = [];

    for (const symbol of symbols) {
      const row = [symbol];
      let convergenceCount = 0;

      for (const strategy of strategies) {
        const result = results.find(
          r => r.symbol === symbol && r.strategy_id === strategy.strategy_id
        );
        if (result && result.qualified) {
          row.push('✅');
          convergenceCount++;
        } else {
          row.push('❌');
        }
      }

      row.push(convergenceCount.toString());
      symbolRows.push({ symbol, convergence: convergenceCount, row });
    }

    // Sort by convergence count DESC
    symbolRows.sort((a, b) => b.convergence - a.convergence);

    // Add sorted rows to data
    for (const { row } of symbolRows) {
      data.push(row);
    }

    // Add footer with column sums
    const footer: any[] = ['Column Total'];
    for (const strategy of strategies) {
      const count = results.filter(
        r => r.strategy_id === strategy.strategy_id && r.qualified
      ).length;
      footer.push(count.toString());
    }
    footer.push(''); // Convergence total column
    data.push(footer);

    const sheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    const colWidths = [{ wch: 14 }];
    for (let i = 0; i < strategies.length; i++) {
      colWidths.push({ wch: 10 });
    }
    colWidths.push({ wch: 14 }); // Convergence Count
    sheet['!cols'] = colWidths;

    return sheet;
  }

  /**
   * SHEET 4: Console Log (Full Trade Details)
   */
  private buildConsoleLog(results: ScanResult[]): XLSX.WorkSheet {
    const data: any[] = [
      ['Symbol', 'Strategy', 'Qualified', 'Entry Price', 'Target 1', 'Target 2', 'Stop Loss',
       'R:R Ratio', 'Confidence %', 'Rule Checks Summary']
    ];

    for (const result of results) {
      const ruleChecks = this.summarizeRuleChecks(result.rule_checks_json);

      data.push([
        result.symbol,
        result.strategy_id,
        result.qualified ? 'Yes' : 'No',
        result.entry_price ? result.entry_price.toFixed(2) : '—',
        result.target1 ? result.target1.toFixed(2) : '—',
        result.target2 ? result.target2.toFixed(2) : '—',
        result.stop_loss ? result.stop_loss.toFixed(2) : '—',
        result.rr_ratio ? result.rr_ratio.toFixed(2) : '—',
        result.confidence_pct ? result.confidence_pct.toFixed(2) : '—',
        ruleChecks
      ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    sheet['!cols'] = [
      { wch: 12 },  // Symbol
      { wch: 15 },  // Strategy
      { wch: 10 },  // Qualified
      { wch: 12 },  // Entry Price
      { wch: 10 },  // Target 1
      { wch: 10 },  // Target 2
      { wch: 12 },  // Stop Loss
      { wch: 10 },  // R:R Ratio
      { wch: 12 },  // Confidence %
      { wch: 40 }   // Rule Checks Summary
    ];

    return sheet;
  }

  /**
   * SHEET 5: Metadata & Parameters
   */
  private buildMetadataSheet(
    metadata: ScanMetadata,
    strategyIds: string[],
    strategies: StrategyInfo[]
  ): XLSX.WorkSheet {
    const data: any[] = [
      ['Scan Metadata', ''],
      ['', ''],
      ['Scan ID', metadata.scan_id],
      ['Scan Timestamp', metadata.scan_completed_at || metadata.scan_started_at || '—'],
      ['Duration (seconds)', metadata.duration_seconds || '—'],
      ['Status', metadata.status],
      ['', ''],
      ['Universe & Coverage', ''],
      ['', ''],
      ['Total Stocks Scanned', metadata.universe_count],
      ['Total Stocks Qualified', metadata.stocks_qualified_total],
      ['', ''],
      ['Strategies Executed', ''],
      ['', '']
    ];

    // Add each strategy
    for (const strategy of strategies) {
      data.push([strategy.strategy_id, strategy.strategy_name]);
    }

    data.push(['', '']);
    data.push(['Strategy Parameters', '']);
    data.push(['', '']);

    // Add parameter summary for each strategy
    for (const strategy of strategies) {
      data.push([`${strategy.strategy_id} (${strategy.strategy_name})`, '']);
      data.push(['Category', strategy.category]);
      data.push(['Qualification Rate', `${strategy.qualification_rate.toFixed(2)}%`]);
      data.push(['Average R:R Ratio', strategy.avg_rr_ratio.toFixed(2)]);
      data.push(['', '']);
    }

    data.push(['Data Quality Notes', '']);
    data.push(['', 'All results fetched from strategy_scan_cache table']);
    data.push(['', 'Timestamp preserved as scan_completed_at']);
    data.push(['', 'Rule checks stored as JSON in rule_checks_json column']);
    data.push(['Master Analysis Definitions', '']);
    data.push(['Market-cap calculation', 'Uses latest available DataQualityAuditLedger.market_cap_cr evidence; unavailable values remain unavailable.']);
    data.push(['Market-cap categories', '≤ ₹5,000 Cr = Small Cap; > ₹5,000 and ≤ ₹20,000 Cr = Mid Cap; > ₹20,000 Cr = Large Cap.']);
    data.push(['Sector bullish rule', 'Sector adjusted-index close must be above both its 20-period EMA and 20-period SMA.']);
    data.push(['Sector flow rule', 'Weighted current-vs-prior-quarter FII/DII ownership change, corroborated where available by disclosed institutional deals and sector-index momentum.']);
    data.push(['Flow status meanings', 'HEAVY_INFLOW, ACCUMULATION, NEUTRAL, OUTFLOW, or UNAVAILABLE; insufficient coverage never receives a directional label.']);
    data.push(['Flow coverage', 'Market-cap-weighted coverage of stocks with both current and prior-quarter shareholding evidence.']);
    data.push(['Export duration', 'Use the UI selector or duration=today|day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD.']);

    const sheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    sheet['!cols'] = [
      { wch: 25 },  // Label
      { wch: 50 }   // Value
    ];

    return sheet;
  }

  /**
   * Helper: Format strategy name
   */
  private formatStrategyName(strategyId: string): string {
    const nameMap: Record<string, string> = {
      'S1': 'S1: VPA Base Breakout',
      'S1_VPA_BASE_BREAKOUT': 'Strategy 1: VPA Base Breakout',
      'S2': 'S2: Institutional FVG/CE',
      'S2_INSTITUTIONAL_FVG_CE': 'Strategy 2: Institutional FVG/CE Pullback',
      'S3': 'S3: HH/HL Compaction',
      'S3_HH_HL_COMPACTION': 'Strategy 3: HH/HL Compaction',
      'S4': 'S4: HH/HL + SMA200 + VPA',
      'S4_HH_HL_SMA200_VPA': 'Strategy 4: HH/HL + SMA200 + VPA',
      'S5': 'S5: 50 EMA Pullback VCP',
      'S5_50EMA_PULLBACK_VCP': 'Strategy 5: 50 EMA Pullback VCP',
      'S6': 'S6: Relative Strength Breakout',
      'S6_RS_BREAKOUT': 'Strategy 6: Relative Strength Breakout',
      'S7': 'S7: RSI Mean-Reversion Dip',
      'S7_RSI_MEAN_REVERSION': 'Strategy 7: RSI Mean-Reversion Dip',
      'S8': 'S8: High-Tight Flag',
      'S8_HIGH_TIGHT_FLAG': 'Strategy 8: High-Tight Flag',
      'S9': 'S9: Volume Dry-Up RS',
      'S9_VOLUME_DRYUP_RS': 'Strategy 9: Volume Dry-Up RS',
      'S10': 'S10: Trendline ORB',
      'S10_TRENDLINE_ORB': 'Strategy 10: Trendline ORB'
    };

    return nameMap[strategyId] || strategyId;
  }

  /**
   * Helper: Get strategy category
   */
  private getStrategyCategory(strategyId: string): string {
    const categoryMap: Record<string, string> = {
      'S1': 'BREAKOUT',
      'S1_VPA_BASE_BREAKOUT': 'BREAKOUT',
      'S2': 'PULLBACK',
      'S2_INSTITUTIONAL_FVG_CE': 'PULLBACK',
      'S3': 'MOMENTUM',
      'S3_HH_HL_COMPACTION': 'MOMENTUM',
      'S4': 'MOMENTUM',
      'S4_HH_HL_SMA200_VPA': 'MOMENTUM',
      'S5': 'PULLBACK',
      'S5_50EMA_PULLBACK_VCP': 'PULLBACK',
      'S6': 'BREAKOUT',
      'S6_RS_BREAKOUT': 'BREAKOUT',
      'S7': 'MEAN_REVERSION',
      'S7_RSI_MEAN_REVERSION': 'MEAN_REVERSION',
      'S8': 'MOMENTUM',
      'S8_HIGH_TIGHT_FLAG': 'MOMENTUM',
      'S9': 'SMART_MONEY',
      'S9_VOLUME_DRYUP_RS': 'SMART_MONEY',
      'S10': 'BREAKOUT',
      'S10_TRENDLINE_ORB': 'BREAKOUT'
    };

    return categoryMap[strategyId] || 'CUSTOM';
  }

  /**
   * Helper: Summarize rule checks from JSON
   */
  private summarizeRuleChecks(ruleChecksJson: string | null): string {
    if (!ruleChecksJson) {
      return '—';
    }

    try {
      const checks = JSON.parse(ruleChecksJson);
      if (typeof checks === 'object' && checks !== null) {
        const keys = Object.keys(checks);
        let summary = keys.slice(0, 3).join(', ');
        if (keys.length > 3) {
          summary += ` +${keys.length - 3} more`;
        }
        return summary.substring(0, 50);
      }
      return String(checks).substring(0, 50);
    } catch (e) {
      return ruleChecksJson.substring(0, 50);
    }
  }
}
