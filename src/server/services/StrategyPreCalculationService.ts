/**
 * StrategyPreCalculationService.ts
 *
 * Phase A: Backend Pre-Calculation Service (Database + Scheduler + Cache)
 *
 * Runs background scans of all active strategies against the stock universe,
 * stores results in strategy_scan_cache table, and serves cached results to UI.
 * Scans run every 5 minutes automatically; results are queryable in <100ms.
 */

import { Database } from 'sqlite3';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';

interface ScanCacheRow {
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
  scan_date: string | null;
  created_at: string;
}

interface ScanMetadataRow {
  id: string;
  scan_id: string;
  strategy_ids_json: string | null;
  universe_count: number | null;
  stocks_qualified_total: number | null;
  scan_started_at: string | null;
  scan_completed_at: string | null;
  duration_seconds: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface StrategyResult {
  qualified: boolean;
  symbol: string;
  entry_price?: number | null;
  target1?: number | null;
  target2?: number | null;
  stop_loss?: number | null;
  rr_ratio?: number | null;
  confidence_pct?: number | null;
  rule_checks?: any;
}

interface UnifiedScanResult {
  strategy_results: { [strategyId: string]: StrategyResult[] };
  convergence?: any;
  total_scanned?: number;
  total_qualified_across_all?: number;
}

interface ScanMetadata {
  scan_id: string;
  timestamp: string | null;
  duration_seconds: number | null;
  universe_count: number | null;
  strategies_count: number | null;
  status: string;
}

export class StrategyPreCalculationService {
  private static instance: StrategyPreCalculationService;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isScanning = false;
  private lastScanTime = 0;

  static getInstance(): StrategyPreCalculationService {
    if (!StrategyPreCalculationService.instance) {
      StrategyPreCalculationService.instance = new StrategyPreCalculationService();
    }
    return StrategyPreCalculationService.instance;
  }

  /**
   * Initialize background scheduler
   * Called on server startup
   */
  public async initializeScheduler(): Promise<void> {
    try {
      console.log('[StrategyPreCalculationService] Initializing background scheduler...');

      // Clean up any stale or orphaned running scans from previous crashes
      const db = getDB();
      await dbRun(db, `UPDATE strategy_scan_metadata SET status = 'INTERRUPTED' WHERE status = 'RUNNING'`);

      // Run first scan deferred by 60s in background
      setTimeout(() => {
        console.log('[StrategyPreCalculationService] Running initial scan...');
        this.scanAllStrategiesAndCache().catch(err => {
          console.error('[StrategyPreCalculationService] Initial scan error:', err);
        });
      }, 60000);

      // Schedule subsequent scans every 5 minutes (300 seconds)
      this.schedulerInterval = setInterval(async () => {
        if (!this.isScanning) {
          await this.scanAllStrategiesAndCache().catch(err => {
            console.error('[StrategyPreCalculationService] Scheduled scan error:', err);
          });
        }
      }, 300000); // 5 minutes

      const nextRunTime = new Date(Date.now() + 300000).toISOString();
      console.log(`[StrategyPreCalculationService] Background scheduler initialized. Next run: ${nextRunTime}`);
    } catch (err) {
      console.error('[StrategyPreCalculationService] Scheduler initialization failed:', err);
      throw err;
    }
  }

  /**
   * Main scan function: scans all active strategies and caches results
   */
  private async scanAllStrategiesAndCache(): Promise<void> {
    if (this.isScanning) {
      console.log('[StrategyPreCalculationService] Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    const scanStartTime = Date.now();
    const scanId = `scan_${Date.now()}`;

    try {
      const db = getDB();

      // Fetch all active strategies
      const allStrategies = await dbAll<any>(
        db,
        'SELECT id FROM CustomStrategies WHERE is_active = 1'
      );

      if (!allStrategies || allStrategies.length === 0) {
        console.log('[StrategyPreCalculationService] No active strategies found');
        this.isScanning = false;
        return;
      }

      const strategyIds = allStrategies.map(s => s.id);
      console.log(`[StrategyPreCalculationService] Starting scan: ${strategyIds.length} strategies`);

      // Record scan start
      const scanStartedAt = new Date().toISOString();
      await dbRun(
        db,
        `INSERT INTO strategy_scan_metadata (id, scan_id, strategy_ids_json, status, scan_started_at)
         VALUES (?, ?, ?, 'RUNNING', ?)`,
        [`meta_${scanId}`, scanId, JSON.stringify(strategyIds), scanStartedAt]
      );

      // Get PureTechnicalStrategiesEngine and run all strategies
      const { PureTechnicalStrategiesEngine } = await import('./PureTechnicalStrategiesEngine.js');
      const engine = new PureTechnicalStrategiesEngine();

      let totalQualified = 0;
      let latestUniverseCount = 0;
      const batchInserts: any[] = [];
      // Run all strategies in a single unified pass across universe (10x faster)
      const result = await engine.scanUniverseAllStrategies(strategyIds);
      if (result.total_scanned) {
        latestUniverseCount = result.total_scanned;
      }

      for (const strategyId of strategyIds) {
        const strategyResults = result.strategy_results?.[strategyId] || [];
        for (const stock of strategyResults) {
          if (stock.qualified) {
            totalQualified++;
            const cacheId = `cache_${scanId}_${strategyId}_${stock.symbol}`;
            batchInserts.push({
              id: cacheId,
              scan_id: scanId,
              strategy_id: strategyId,
              symbol: stock.symbol,
              qualified: 1,
              entry_price: stock.entry_price ?? null,
              target1: stock.target1 ?? null,
              target2: stock.target2 ?? null,
              stop_loss: stock.stop_loss ?? null,
              rr_ratio: stock.rr_ratio ?? null,
              confidence_pct: stock.confidence_pct ?? null,
              rule_checks_json: stock.rule_checks ? JSON.stringify(stock.rule_checks) : null,
              scan_date: new Date().toISOString().split('T')[0]
            });
          }
        }
      }

      // Batch insert qualified results cleanly
      console.log(`[StrategyPreCalculationService] Inserting ${batchInserts.length} qualified cache records...`);
      for (let i = 0; i < batchInserts.length; i += 200) {
        const chunk = batchInserts.slice(i, i + 200);

        await new Promise<void>((resolve) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            for (const record of chunk) {
              db.run(
                `INSERT OR REPLACE INTO strategy_scan_cache
                 (id, scan_id, strategy_id, symbol, qualified, entry_price, target1, target2, stop_loss, rr_ratio, confidence_pct, rule_checks_json, scan_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  record.id,
                  record.scan_id,
                  record.strategy_id,
                  record.symbol,
                  record.qualified,
                  record.entry_price,
                  record.target1,
                  record.target2,
                  record.stop_loss,
                  record.rr_ratio,
                  record.confidence_pct,
                  record.rule_checks_json,
                  record.scan_date
                ]
              );
            }
            db.run('COMMIT', () => resolve());
          });
        });
        await new Promise((r) => setTimeout(r, 10));
      }

      // Update metadata with completion
      const scanEndedAt = new Date().toISOString();
      const durationSeconds = Math.round((Date.now() - scanStartTime) / 1000);
      const universeCount = latestUniverseCount || 0;

      await dbRun(
        db,
        `UPDATE strategy_scan_metadata
         SET status = 'COMPLETE', scan_completed_at = ?, duration_seconds = ?,
             stocks_qualified_total = ?, universe_count = ?
         WHERE scan_id = ?`,
        [scanEndedAt, durationSeconds, totalQualified, universeCount, scanId]
      );

      // Cleanup old cache (keep only latest 3 completed scans to prevent multi-million row explosion)
      await dbRun(
        db,
        `DELETE FROM strategy_scan_cache 
         WHERE scan_id NOT IN (
           SELECT scan_id FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY id DESC LIMIT 3
         )`
      );
      await dbRun(
        db,
        `DELETE FROM strategy_scan_metadata
         WHERE id NOT IN (
           SELECT id FROM strategy_scan_metadata ORDER BY id DESC LIMIT 20
         )`
      );

      console.log(
        `[StrategyPreCalculationService] Scan complete: ${strategyIds.length} strategies × ${universeCount} stocks in ${durationSeconds}s. Qualified: ${totalQualified}`
      );
      this.lastScanTime = Date.now();
    } catch (err) {
      console.error('[StrategyPreCalculationService] Scan failed:', err);

      // Record error in metadata
      try {
        const db = getDB();
        await dbRun(
          db,
          `UPDATE strategy_scan_metadata SET status = 'FAILED', error_message = ? WHERE scan_id = ?`,
          [String(err), scanId]
        );
      } catch (metaErr) {
        console.error('[StrategyPreCalculationService] Failed to record error metadata:', metaErr);
      }
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Get cached results for latest scan
   */
  public async getCachedResults(scanId?: string): Promise<{ scanId: string; results: any[]; metadata: ScanMetadata }> {
    try {
      const db = getDB();

      // If no scanId provided, get latest completed scan
      let activeScanId = scanId;
      if (!activeScanId) {
        const latestMeta = await dbGet<ScanMetadataRow>(
          db,
          `SELECT scan_id FROM strategy_scan_metadata WHERE status = 'COMPLETE' ORDER BY created_at DESC LIMIT 1`
        );
        activeScanId = latestMeta?.scan_id;
      }

      if (!activeScanId) {
        return { scanId: '', results: [], metadata: { scan_id: '', timestamp: null, duration_seconds: null, universe_count: null, strategies_count: null, status: 'NO_DATA' } };
      }

      // Query cache for this scan
      const results = await dbAll<ScanCacheRow>(
        db,
        `SELECT * FROM strategy_scan_cache WHERE scan_id = ? ORDER BY strategy_id, symbol`,
        [activeScanId]
      );

      // Get metadata
      const metadata = await dbGet<ScanMetadataRow>(
        db,
        `SELECT * FROM strategy_scan_metadata WHERE scan_id = ?`,
        [activeScanId]
      );

      return {
        scanId: activeScanId,
        results: results || [],
        metadata: {
          scan_id: activeScanId,
          timestamp: metadata?.scan_completed_at || null,
          duration_seconds: metadata?.duration_seconds || null,
          universe_count: metadata?.universe_count || null,
          strategies_count: metadata?.strategy_ids_json ? JSON.parse(metadata.strategy_ids_json).length : null,
          status: metadata?.status || 'UNKNOWN'
        }
      };
    } catch (err) {
      console.error('[StrategyPreCalculationService] getCachedResults failed:', err);
      throw err;
    }
  }

  /**
   * Invalidate cache (delete newest scan only, keep history)
   */
  public async invalidateCache(): Promise<void> {
    try {
      const db = getDB();

      // Get newest scan
      const newest = await dbGet<ScanMetadataRow>(
        db,
        `SELECT scan_id FROM strategy_scan_metadata ORDER BY created_at DESC LIMIT 1`
      );

      if (newest) {
        await dbRun(
          db,
          `DELETE FROM strategy_scan_cache WHERE scan_id = ?`,
          [newest.scan_id]
        );
        await dbRun(
          db,
          `DELETE FROM strategy_scan_metadata WHERE scan_id = ?`,
          [newest.scan_id]
        );
        console.log(`[StrategyPreCalculationService] Cache invalidated for scan: ${newest.scan_id}`);
      }
    } catch (err) {
      console.error('[StrategyPreCalculationService] invalidateCache failed:', err);
      throw err;
    }
  }

  /**
   * Get latest scan metadata
   */
  public async getLatestScanMetadata(): Promise<ScanMetadata | null> {
    try {
      const db = getDB();
      const metadata = await dbGet<ScanMetadataRow>(
        db,
        `SELECT * FROM strategy_scan_metadata ORDER BY created_at DESC LIMIT 1`
      );

      if (!metadata) {
        return null;
      }

      return {
        scan_id: metadata.scan_id,
        timestamp: metadata.scan_completed_at || null,
        duration_seconds: metadata.duration_seconds || null,
        universe_count: metadata.universe_count || null,
        strategies_count: metadata.strategy_ids_json ? JSON.parse(metadata.strategy_ids_json).length : null,
        status: metadata.status
      };
    } catch (err) {
      console.error('[StrategyPreCalculationService] getLatestScanMetadata failed:', err);
      return null;
    }
  }

  /**
   * Get current scan progress
   */
  public async getScanProgress(): Promise<{
    status: 'RUNNING' | 'IDLE';
    progress: string;
    percent?: number;
    scanned?: number;
    total?: number;
    current_symbol?: string;
    qualified_count?: number;
    strategy_matches?: { [strategyId: string]: number };
    eta_seconds?: number;
  }> {
    const { PureTechnicalStrategiesEngine } = await import('./PureTechnicalStrategiesEngine.js');
    const engineProgress = PureTechnicalStrategiesEngine.getScanProgress();

    if (this.isScanning) {
      const scanned = engineProgress.scanned || 0;
      const total = engineProgress.total || 3000;
      const pct = engineProgress.percent ?? (total > 0 ? Math.min(99, Math.round((scanned / total) * 100)) : 0);

      return {
        status: 'RUNNING',
        progress: `${pct}%`,
        percent: pct,
        scanned,
        total,
        current_symbol: engineProgress.currentSymbol || '',
        qualified_count: engineProgress.qualifiedCount || 0,
        strategy_matches: engineProgress.strategyMatches || {}
      };
    }

    const runningMeta = await dbGet<ScanMetadataRow>(
      getDB(),
      `SELECT * FROM strategy_scan_metadata WHERE status = 'RUNNING' ORDER BY created_at DESC LIMIT 1`
    );

    if (!runningMeta) {
      return { status: 'IDLE', progress: '0%', percent: 0 };
    }

    // Auto-heal dead zombie scan if isScanning is false and scan started over 3 minutes ago
    const elapsedSeconds = Math.round((Date.now() - new Date(runningMeta.scan_started_at!).getTime()) / 1000);
    if (!this.isScanning && elapsedSeconds > 180) {
      await dbRun(getDB(), `UPDATE strategy_scan_metadata SET status = 'INTERRUPTED' WHERE scan_id = ?`, [runningMeta.scan_id]);
      return { status: 'IDLE', progress: '0%', percent: 0 };
    }

    return {
      status: 'RUNNING',
      progress: `${Math.min(95, Math.round((elapsedSeconds / 120) * 100))}%`,
      percent: Math.min(95, Math.round((elapsedSeconds / 120) * 100)),
      scanned: 0,
      total: 3000
    };
  }

  /**
   * Trigger manual scan immediately
   */
  public async triggerManualScan(): Promise<{ scanId: string; message: string }> {
    if (this.isScanning) {
      return { scanId: '', message: 'Scan already in progress' };
    }

    // Run async in background
    this.scanAllStrategiesAndCache().catch(err => {
      console.error('[StrategyPreCalculationService] Manual scan error:', err);
    });

    return { scanId: `scan_${Date.now()}`, message: 'Scan started' };
  }
}

export default StrategyPreCalculationService;
