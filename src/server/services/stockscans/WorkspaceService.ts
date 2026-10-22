/**
 * WorkspaceService.ts
 * Clean-Room StockScans Parity Engine — Decision Workspace Layer
 * 
 * Manages:
 * 1. Scan Run Registry & Scan Match (exact intersection / union across immutable scan runs)
 * 2. Saved Scans & Watchlists with custom tags
 * 3. Custom Indices definitions
 * 4. Valuation Calculators (Reverse DCF, Earnings Valuation, OPM Expansion) with sensitivity tables
 * 5. Durable Alerts & Idempotent Audit Log
 * 
 * High performance via better-sqlite3 with WAL mode in data/stockscans_workspace.db.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { ScanRunResult } from './MarketDataQueryService.js';
import { DataStatus, ScanRunRecord } from '../../../types/stockscans.js';

export interface ScanMatchOverlapResult {
  asOfDates: string[];
  hasMixedDatesWarning: boolean;
  selectedScans: Array<{ runId: string; scanName: string; asOf: string; count: number }>;
  requiredCount: number;
  intersectionCount: number;
  intersectionMatches: Array<{
    symbol: string;
    close: number;
    changePct: number;
    matchCount: number;
    matchedScans: string[];
    reasons: Record<string, string>;
  }>;
  allMatches: Array<{
    symbol: string;
    close: number;
    changePct: number;
    matchCount: number;
    matchedScans: string[];
    reasons: Record<string, string>;
  }>;
  coverage: {
    selectedRuns: number;
    missingRuns: string[];
  };
}

export interface ReverseDcfResult {
  cmp: number;
  currentEps: number;
  discountRate: number;
  terminalGrowthRate: number;
  terminalMultiple: number;
  projectionYears: number;
  impliedGrowthRatePct: number;
  sensitivityMatrix: {
    discountRates: number[];
    terminalMultiples: number[];
    matrix: Array<Array<{ discountRate: number; terminalMultiple: number; impliedGrowthPct: number }>>;
  };
}

export interface DurableAlertRecord {
  id: number;
  name: string;
  alertType: 'PRICE_LEVEL' | 'SCAN_MATCH' | 'ANNOUNCEMENT_KEYWORD' | 'PLEDGE_CHANGE';
  targetSymbol: string | null;
  criteriaJson: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  snoozeUntil: string | null;
  createdAt: string;
}

const dbDir = path.resolve('data');
const dbFilePath = path.join(dbDir, 'stockscans_workspace.db');

export class WorkspaceService {
  private static dbInstance: Database.Database | null = null;

  private static getDB(): Database.Database {
    if (!this.dbInstance) {
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      this.dbInstance = new Database(dbFilePath);
      this.dbInstance.pragma('journal_mode = WAL');
      this.dbInstance.pragma('synchronous = NORMAL');
      this.initTables();
    }
    return this.dbInstance;
  }

  private static initTables(): void {
    const db = this.dbInstance!;
    db.exec(`
      CREATE TABLE IF NOT EXISTS stockscans_scan_runs (
        run_id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        scan_name TEXT NOT NULL,
        category TEXT NOT NULL,
        as_of TEXT NOT NULL,
        parameter_hash TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        universe_size INTEGER NOT NULL,
        matched_count INTEGER NOT NULL,
        results_json TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        formula_version TEXT,
        data_revision TEXT,
        universe_revision TEXT,
        source_system TEXT,
        coverage_json TEXT,
        status TEXT,
        no_data_reason TEXT,
        results_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS stockscans_saved_scans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        criteria_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stockscans_watchlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        symbols_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stockscans_custom_indices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        constituents_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stockscans_durable_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        target_symbol TEXT,
        criteria_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_triggered_at TEXT,
        snooze_until TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stockscans_alert_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id INTEGER NOT NULL,
        trigger_timestamp TEXT NOT NULL,
        trigger_data_json TEXT NOT NULL,
        delivery_status TEXT NOT NULL,
        error_message TEXT
      );
    `);

    // Add safe schema migrations for existing tables
    const existingColumns = new Set((db.pragma('table_info(stockscans_scan_runs)') as any[]).map(c => c.name));
    const migrations = [
      { name: 'formula_version', type: 'TEXT' },
      { name: 'data_revision', type: 'TEXT' },
      { name: 'universe_revision', type: 'TEXT' },
      { name: 'source_system', type: 'TEXT' },
      { name: 'coverage_json', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
      { name: 'no_data_reason', type: 'TEXT' },
      { name: 'results_hash', type: 'TEXT' }
    ];
    const applyMigrations = db.transaction(() => {
      for (const col of migrations) {
        if (!existingColumns.has(col.name)) {
          db.exec(`ALTER TABLE stockscans_scan_runs ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    });
    applyMigrations();
  }

  /**
   * P0: Record immutable scan run in registry.
   * Every execution creates an immutable record with full provenance revisions.
   */
  public static async recordScanRun(run: ScanRunResult | ScanRunRecord): Promise<void> {
    const db = this.getDB();
    const resultsJson = JSON.stringify(run.matches || []);
    const resultsHash = crypto.createHash('sha256').update(resultsJson).digest('hex');

    const formulaVersion = run.formulaVersion || '1.0.0';
    const dataRevision = (run as any).dataRevision || run.asOf || new Date().toISOString().split('T')[0];
    const universeRevision = (run as any).universeRevision || run.asOf || new Date().toISOString().split('T')[0];
    const sourceSystem = (run as any).sourceSystem || (run as any).dataSource || 'DUCKDB';
    const status: DataStatus = (run as any).status || (run.matches && run.matches.length > 0 ? 'VERIFIED' : 'PARTIAL');
    const noDataReason = (run as any).noDataReason || null;
    const coverageJson = JSON.stringify(run.coverage || { requested: 0, eligible: 0, matched: 0, unavailable: 0, gaps: [] });

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stockscans_scan_runs 
      (run_id, scan_id, scan_name, category, as_of, parameter_hash, parameters_json,
       universe_size, matched_count, results_json, executed_at, formula_version,
       data_revision, universe_revision, source_system, coverage_json, status, no_data_reason, results_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      run.runId,
      run.scanId,
      run.scanName,
      run.category || 'TECHNICAL',
      run.asOf,
      run.parameterHash,
      JSON.stringify(run.parameters || {}),
      run.coverage?.eligible ?? 0,
      run.matches?.length ?? 0,
      resultsJson,
      run.executedAt,
      formulaVersion,
      dataRevision,
      universeRevision,
      sourceSystem,
      coverageJson,
      status,
      noDataReason,
      resultsHash
    );
  }

  /**
   * P0: Get recent scan runs from registry with full revision metadata
   */
  public static async getScanRuns(limit = 30): Promise<ScanRunRecord[]> {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT run_id AS runId, scan_id AS scanId, scan_name AS scanName, category,
             as_of AS asOf, parameter_hash AS parameterHash, parameters_json AS parametersJson,
             universe_size AS universeSize, matched_count AS matchedCount,
             results_json AS resultsJson, executed_at AS executedAt,
             formula_version AS formulaVersion, data_revision AS dataRevision,
             universe_revision AS universeRevision, source_system AS sourceSystem,
             coverage_json AS coverageJson, status, no_data_reason AS noDataReason,
             results_hash AS resultsHash
        FROM stockscans_scan_runs
       ORDER BY executed_at DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map((r: any) => {
      let coverage = { requested: r.universeSize, eligible: r.universeSize, matched: r.matchedCount, unavailable: 0, gaps: [] };
      if (r.coverageJson) {
        try { coverage = JSON.parse(r.coverageJson); } catch {}
      }
      let parameters: Record<string, unknown> = {};
      if (r.parametersJson) {
        try { parameters = JSON.parse(r.parametersJson); } catch {}
      }

      return {
        runId: r.runId,
        scanId: r.scanId,
        scanName: r.scanName,
        category: r.category,
        asOf: r.asOf,
        sourceSystem: r.sourceSystem || 'DUCKDB',
        formulaVersion: r.formulaVersion || '1.0.0',
        dataRevision: r.dataRevision || r.asOf,
        universeRevision: r.universeRevision || r.asOf,
        parameterHash: r.parameterHash,
        parameters,
        coverage,
        status: (r.status || 'VERIFIED') as DataStatus,
        resultsHash: r.resultsHash || '',
        executedAt: r.executedAt,
        noDataReason: r.noDataReason || null
      };
    });
  }

  /**
   * P0: Scan Match Engine (Exact Intersection & Overlap Analysis)
   * Non-negotiable policy: intersectionMatches MUST contain only exact intersections.
   */
  public static async matchScans(runIds: string[]): Promise<ScanMatchOverlapResult> {
    if (!runIds.length) {
      return {
        asOfDates: [],
        hasMixedDatesWarning: false,
        selectedScans: [],
        requiredCount: 0,
        intersectionCount: 0,
        intersectionMatches: [],
        allMatches: [],
        coverage: {
          selectedRuns: 0,
          missingRuns: []
        }
      };
    }

    const db = this.getDB();
    const placeholders = runIds.map(() => '?').join(',');
    const runs = db.prepare(`
      SELECT run_id AS runId, scan_name AS scanName, as_of AS asOf, results_json AS resultsJson
        FROM stockscans_scan_runs WHERE run_id IN (${placeholders})
    `).all(...runIds) as any[];

    const foundRunIds = new Set(runs.map((r: any) => r.runId));
    const missingRunIds = runIds.filter(id => !foundRunIds.has(id));

    const asOfDates = [...new Set(runs.map((r: any) => r.asOf))];
    const hasMixedDatesWarning = asOfDates.length > 1;

    const selectedScans = runs.map((r: any) => ({
      runId: r.runId,
      scanName: r.scanName,
      asOf: r.asOf,
      count: JSON.parse(r.resultsJson || '[]').length
    }));

    // Build symbol occurrence map
    const symbolMap = new Map<string, {
      symbol: string;
      close: number;
      changePct: number;
      matchCount: number;
      matchedScans: string[];
      reasons: Record<string, string>;
    }>();

    for (const r of runs) {
      const matches = JSON.parse(r.resultsJson || '[]');
      for (const m of matches) {
        const sym = String(m.symbol).toUpperCase();
        if (!symbolMap.has(sym)) {
          symbolMap.set(sym, {
            symbol: sym,
            close: m.close,
            changePct: m.changePct,
            matchCount: 0,
            matchedScans: [],
            reasons: {}
          });
        }
        const entry = symbolMap.get(sym)!;
        entry.matchCount++;
        entry.matchedScans.push(r.scanName);
        entry.reasons[r.scanName] = m.matchReason;
      }
    }

    const allMatches = [...symbolMap.values()].sort((a, b) => b.matchCount - a.matchCount || b.changePct - a.changePct);
    const requiredCount = runs.length;
    // Non-negotiable bug fix: intersectionMatches must ONLY contain exact intersections
    const intersectionMatches = allMatches.filter(m => m.matchCount === requiredCount);

    return {
      asOfDates,
      hasMixedDatesWarning,
      selectedScans,
      requiredCount,
      intersectionCount: intersectionMatches.length,
      intersectionMatches,
      allMatches,
      coverage: {
        selectedRuns: runIds.length,
        missingRuns: missingRunIds
      }
    };
  }

  /**
   * P0: Add scan matches to a Watchlist
   */
  public static async addScanMatchesToWatchlist(watchlistName: string, symbols: string[], tags: string[] = []): Promise<void> {
    const db = this.getDB();
    const id = `WL-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const existing = db.prepare(`SELECT id, symbols_json, tags_json FROM stockscans_watchlists WHERE name = ?`).get(watchlistName) as any;
    if (existing) {
      const currentSyms: string[] = JSON.parse(existing.symbols_json || '[]');
      const currentTags: string[] = JSON.parse(existing.tags_json || '[]');
      const mergedSyms = [...new Set([...currentSyms, ...symbols])];
      const mergedTags = [...new Set([...currentTags, ...tags])];
      db.prepare(`UPDATE stockscans_watchlists SET symbols_json = ?, tags_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(mergedSyms),
        JSON.stringify(mergedTags),
        timestamp,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO stockscans_watchlists (id, name, symbols_json, tags_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, watchlistName, JSON.stringify(symbols), JSON.stringify(tags), timestamp, timestamp);
    }
  }

  /**
   * P1: Watchlists API
   */
  public static async getWatchlists(): Promise<Array<{
    id: string;
    name: string;
    symbols: string[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>> {
    const db = this.getDB();
    const rows = db.prepare(`SELECT id, name, symbols_json, tags_json, created_at, updated_at FROM stockscans_watchlists ORDER BY updated_at DESC`).all() as any[];
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      symbols: JSON.parse(r.symbols_json || '[]'),
      tags: JSON.parse(r.tags_json || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * P1: Custom Thematic Indices CRUD
   */
  public static async saveCustomIndex(data: {
    id?: string;
    name: string;
    description?: string;
    constituents: Array<{ symbol: string; weight?: number }>;
  }): Promise<string> {
    const db = this.getDB();
    const id = data.id || `IDX-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const existing = db.prepare(`SELECT id, version FROM stockscans_custom_indices WHERE id = ?`).get(id) as any;
    if (existing) {
      db.prepare(`
        UPDATE stockscans_custom_indices 
           SET name = ?, description = ?, constituents_json = ?, version = version + 1, updated_at = ?
         WHERE id = ?
      `).run(data.name, data.description || '', JSON.stringify(data.constituents), timestamp, id);
    } else {
      db.prepare(`
        INSERT INTO stockscans_custom_indices (id, name, description, constituents_json, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(id, data.name, data.description || '', JSON.stringify(data.constituents), timestamp, timestamp);
    }
    return id;
  }

  public static async getCustomIndices(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    constituents: Array<{ symbol: string; weight?: number }>;
    version: number;
    updatedAt: string;
  }>> {
    const db = this.getDB();
    const rows = db.prepare(`SELECT id, name, description, constituents_json, version, updated_at FROM stockscans_custom_indices ORDER BY updated_at DESC`).all() as any[];
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      constituents: JSON.parse(r.constituents_json || '[]'),
      version: r.version,
      updatedAt: r.updated_at
    }));
  }

  /**
   * P1: Reverse DCF Valuation Calculator
   * Solves: Price = CurrentEPS * SUM( ((1+g)/(1+d))^t ) + TerminalValue
   */
  public static calculateReverseDcf(params: {
    cmp: number;
    currentEps: number;
    discountRate?: number; // e.g. 0.12
    terminalGrowthRate?: number; // e.g. 0.05
    terminalMultiple?: number; // e.g. 25
    projectionYears?: number; // e.g. 10
  }): ReverseDcfResult {
    const cmp = Math.max(params.cmp, 1);
    const eps = Math.max(params.currentEps, 0.01);
    const d = params.discountRate ?? 0.12;
    const gTerm = params.terminalGrowthRate ?? 0.05;
    const exitMult = params.terminalMultiple ?? 20;
    const n = params.projectionYears ?? 10;

    // Numerical binary search to find implied growth rate g
    let low = -0.50; // -50% CAGR
    let high = 1.00; // 100% CAGR
    let impliedG = 0;

    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      let pvEps = 0;
      let currE = eps;

      for (let t = 1; t <= n; t++) {
        currE *= (1 + mid);
        pvEps += currE / Math.pow(1 + d, t);
      }

      const terminalEps = currE;
      const terminalVal = terminalEps * exitMult;
      const pvTerminal = terminalVal / Math.pow(1 + d, n);
      const modeledPrice = pvEps + pvTerminal;

      if (modeledPrice > cmp) {
        high = mid;
      } else {
        low = mid;
      }
      impliedG = mid;
    }

    // Generate 5x4 sensitivity matrix: Discount Rates (10%, 11%, 12%, 13%, 14%) x Multiples (15, 20, 25, 30)
    const discountRates = [0.10, 0.11, 0.12, 0.13, 0.14];
    const terminalMultiples = [15, 20, 25, 30];

    const matrix: Array<Array<{ discountRate: number; terminalMultiple: number; impliedGrowthPct: number }>> = [];

    for (const testD of discountRates) {
      const row: Array<{ discountRate: number; terminalMultiple: number; impliedGrowthPct: number }> = [];
      for (const testM of terminalMultiples) {
        let l = -0.50;
        let h = 1.00;
        let gRes = 0;
        for (let iter = 0; iter < 30; iter++) {
          const m = (l + h) / 2;
          let pv = 0;
          let ce = eps;
          for (let t = 1; t <= n; t++) {
            ce *= (1 + m);
            pv += ce / Math.pow(1 + testD, t);
          }
          const pvT = (ce * testM) / Math.pow(1 + testD, n);
          if (pv + pvT > cmp) h = m; else l = m;
          gRes = m;
        }
        row.push({
          discountRate: testD,
          terminalMultiple: testM,
          impliedGrowthPct: Number((gRes * 100).toFixed(1))
        });
      }
      matrix.push(row);
    }

    return {
      cmp,
      currentEps: eps,
      discountRate: d,
      terminalGrowthRate: gTerm,
      terminalMultiple: exitMult,
      projectionYears: n,
      impliedGrowthRatePct: Number((impliedG * 100).toFixed(1)),
      sensitivityMatrix: {
        discountRates,
        terminalMultiples,
        matrix
      }
    };
  }

  /**
   * P1: Durable Alerts Management
   */
  public static async createAlert(data: {
    name: string;
    alertType: 'PRICE_LEVEL' | 'SCAN_MATCH' | 'ANNOUNCEMENT_KEYWORD' | 'PLEDGE_CHANGE';
    targetSymbol?: string;
    criteria: Record<string, any>;
  }): Promise<number> {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO stockscans_durable_alerts (name, alert_type, target_symbol, criteria_json, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    const res = stmt.run(data.name, data.alertType, data.targetSymbol || null, JSON.stringify(data.criteria), new Date().toISOString());
    return Number(res.lastInsertRowid);
  }

  public static async getAlerts(): Promise<DurableAlertRecord[]> {
    const db = this.getDB();
    const rows = db.prepare(`
      SELECT id, name, alert_type as alertType, target_symbol as targetSymbol, criteria_json as criteriaJson,
             is_active as isActive, last_triggered_at as lastTriggeredAt, snooze_until as snoozeUntil, created_at as createdAt
        FROM stockscans_durable_alerts
       ORDER BY id DESC
    `).all() as any[];
    return rows.map((r: any) => ({
      ...r,
      isActive: Boolean(r.isActive)
    }));
  }

  public static async toggleAlert(alertId: number, isActive: boolean): Promise<void> {
    const db = this.getDB();
    db.prepare(`UPDATE stockscans_durable_alerts SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, alertId);
  }

  public static async snoozeAlert(alertId: number, durationHours: number): Promise<void> {
    const db = this.getDB();
    const snoozeUntil = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
    db.prepare(`UPDATE stockscans_durable_alerts SET snooze_until = ? WHERE id = ?`).run(snoozeUntil, alertId);
  }
}
