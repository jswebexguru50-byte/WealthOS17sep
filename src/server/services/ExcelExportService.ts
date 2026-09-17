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
    db: Database
  ): Promise<Buffer> {
    try {
      // Fetch metadata
      const metadata = await this.fetchScanMetadata(db, scanId);
      if (!metadata) {
        throw new Error(`Scan ID ${scanId} not found`);
      }

      // Fetch all results
      const results = await this.fetchScanResults(db, scanId);

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

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Summary');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Strategy Details');
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Convergence Matrix');
      XLSX.utils.book_append_sheet(workbook, sheet4, 'Console Log');
      XLSX.utils.book_append_sheet(workbook, sheet5, 'Metadata');

      // Write to buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return buffer as Buffer;
    } catch (error: any) {
      console.error('[ExcelExportService] Export failed:', error);
      throw error;
    }
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
  private async fetchScanResults(db: Database, scanId: string): Promise<ScanResult[]> {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM strategy_scan_cache WHERE scan_id = ? ORDER BY strategy_id, symbol`,
        [scanId],
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
