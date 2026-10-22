import { getDB, dbRun, dbAll, dbGet } from '../database.js';

export interface SecurityDossierSnapshot {
  id: string;
  symbol: string;
  as_of_date: string;
  verdict: string;
  calibrated_prob: number;
  target_price: number;
  stop_loss: number;
  horizon_days: number;
  fundamental_score: number;
  technical_score: number;
  flow_score: number;
  news_score: number;
  fno_score?: number;
  bull_catalysts_json: string;
  bear_risks_json: string;
  macro_micro_json: string;
  peer_benchmark_json: string;
  raw_metrics_snapshot_json: string;
}

export interface InvestmentThesis {
  id: string;
  symbol: string;
  entry_date: string;
  entry_price: number;
  initial_verdict: string;
  initial_target: number;
  initial_stop_loss: number;
  core_thesis_pillars: string[];
  invalidation_triggers: string[];
  status: 'ACTIVE' | 'THESIS_INTACT' | 'THESIS_STRAINED' | 'THESIS_BROKEN' | 'CLOSED';
  last_reviewed_at?: string;
  custom_notes?: string;
}

export interface AutoCalibrationProposalRecord {
  id: string;
  created_at: string;
  trigger_reason: string;
  attribution_summary: string;
  old_weights_json: string;
  proposed_weights_json: string;
  simulated_winrate_delta_pct: number;
  brier_score_improvement: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_at?: string;
}

export interface AlertRecord {
  id: string;
  timestamp: string;
  symbol: string;
  company_name: string;
  severity: 'BREAKOUT' | 'RISK' | 'THESIS_STRAIN';
  title: string;
  message: string;
  catalyst_source: string;
  price_at_alert: number;
  target_price?: number;
  stop_loss?: number;
  calibrated_prob?: number;
  dismissed: boolean;
}

export class ScripKnowledgeBaseService {
  private static initialized = false;

  public static async initTables(): Promise<void> {
    if (this.initialized) return;
    const db = getDB();

    try {
      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS SecurityKnowledgeBaseLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          as_of_date TEXT NOT NULL,
          verdict TEXT NOT NULL,
          calibrated_prob REAL NOT NULL,
          target_price REAL NOT NULL,
          stop_loss REAL NOT NULL,
          horizon_days INTEGER NOT NULL,
          fundamental_score REAL NOT NULL,
          technical_score REAL NOT NULL,
          flow_score REAL NOT NULL,
          news_score REAL NOT NULL,
          fno_score REAL,
          bull_catalysts_json TEXT NOT NULL,
          bear_risks_json TEXT NOT NULL,
          macro_micro_json TEXT NOT NULL,
          peer_benchmark_json TEXT NOT NULL,
          raw_metrics_snapshot_json TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol, as_of_date)
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS InvestmentThesisLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          entry_date TEXT NOT NULL,
          entry_price REAL NOT NULL,
          initial_verdict TEXT NOT NULL,
          initial_target REAL NOT NULL,
          initial_stop_loss REAL NOT NULL,
          core_thesis_pillars_json TEXT NOT NULL,
          invalidation_triggers_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          custom_notes TEXT,
          last_reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(symbol)
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS QuarterlyEarningsIntelligence (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          quarter_label TEXT NOT NULL,
          filing_date TEXT NOT NULL,
          revenue_actual REAL,
          revenue_estimate REAL,
          revenue_beat_miss_pct REAL,
          ebitda_margin_actual REAL,
          pat_actual REAL,
          management_guidance_tone TEXT,
          concall_key_takeaways_json TEXT,
          thesis_impact TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS SecuritySignalDriftLedger (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          previous_value REAL,
          current_value REAL,
          drift_pct REAL,
          drift_direction TEXT,
          evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS AutoCalibrationProposals (
          id TEXT PRIMARY KEY,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          trigger_reason TEXT NOT NULL,
          attribution_summary TEXT NOT NULL,
          old_weights_json TEXT NOT NULL,
          proposed_weights_json TEXT NOT NULL,
          simulated_winrate_delta_pct REAL NOT NULL,
          brier_score_improvement REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          approved_at TEXT
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS AlertHistoryLedger (
          id TEXT PRIMARY KEY,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
          symbol TEXT NOT NULL,
          company_name TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          catalyst_source TEXT NOT NULL,
          price_at_alert REAL NOT NULL,
          target_price REAL,
          stop_loss REAL,
          calibrated_prob REAL,
          dismissed INTEGER DEFAULT 0
        )
      `);

      await dbRun(db, `
        CREATE TABLE IF NOT EXISTS SecurityDossierSnapshots (
          symbol TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          sector TEXT NOT NULL,
          industry TEXT,
          cmp REAL NOT NULL,
          day_change_pct REAL,
          market_cap_cr REAL,
          outlook_json TEXT NOT NULL,
          catalysts_json TEXT NOT NULL,
          sector_positioning_json TEXT NOT NULL,
          macro_mood_json TEXT NOT NULL,
          flows_json TEXT NOT NULL,
          fundamentals_json TEXT NOT NULL,
          technicals_json TEXT NOT NULL,
          derivatives_json TEXT NOT NULL,
          megatrend_json TEXT NOT NULL,
          concall_json TEXT,
          scores_json TEXT NOT NULL,
          portal_attribution_json TEXT NOT NULL,
          full_dossier_json TEXT NOT NULL,
          researched_at TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.initialized = true;
    } catch (err) {
      console.error('[ScripKnowledgeBaseService] Error initializing tables:', err);
    }
  }

  public static async saveCompleteDossier(dossier: any): Promise<void> {
    await this.initTables();
    const db = getDB();

    // Constitution Rule 5: Route through Quality Gate serving chokepoint
    const path = require('path');
    const { persistSnapshotThroughQualityGate } = require(path.resolve(process.cwd(), 'pipeline/quality-gate.cjs'));
    await persistSnapshotThroughQualityGate(db, dossier);

    // Also update SecurityKnowledgeBaseLedger
    await this.saveDossierSnapshot(dossier);
  }

  public static async getSavedDossier(symbol: string, maxAgeHours: number = 24): Promise<any | null> {
    await this.initTables();
    const db = getDB();
    const row = await dbGet(db, `
      SELECT full_dossier_json, researched_at
      FROM SecurityDossierSnapshots
      WHERE symbol = ?
    `, [symbol.toUpperCase().trim()]);

    if (!row?.full_dossier_json) return null;

    const ageMs = Date.now() - new Date(row.researched_at).getTime();
    if (ageMs > maxAgeHours * 3600 * 1000) {
      return null; // Expired, trigger re-research
    }

    try {
      return JSON.parse(row.full_dossier_json);
    } catch {
      return null;
    }
  }

  public static async saveDossierSnapshot(dossier: any): Promise<void> {
    await this.initTables();
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    const id = `${dossier.symbol}_${today}`;

    await dbRun(db, `
      INSERT OR REPLACE INTO SecurityKnowledgeBaseLedger (
        id, symbol, as_of_date, verdict, calibrated_prob, target_price, stop_loss,
        horizon_days, fundamental_score, technical_score, flow_score, news_score, fno_score,
        bull_catalysts_json, bear_risks_json, macro_micro_json, peer_benchmark_json,
        raw_metrics_snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      id,
      dossier.symbol,
      today,
      dossier.outlook?.verdict || dossier.verdict || 'ACCUMULATE_ON_DIPS',
      dossier.outlook?.calibratedProbabilityPct || dossier.calibratedProb || 50,
      dossier.outlook?.targetPrice || dossier.targetPrice || dossier.cmp || 100,
      dossier.outlook?.stopLossPrice || dossier.stopLoss || (dossier.cmp * 0.93) || 90,
      dossier.outlook?.horizonDays || dossier.horizonDays || 90,
      dossier.scores?.fundamentalScore || 0,
      dossier.scores?.technicalScore || 0,
      dossier.scores?.flowScore || 0,
      dossier.scores?.newsScore || 0,
      dossier.scores?.fnoScore || null,
      JSON.stringify(dossier.catalysts?.bullCase || dossier.bullCatalysts || []),
      JSON.stringify(dossier.catalysts?.bearCase || dossier.bearRisks || []),
      JSON.stringify(dossier.macroMarketMood || dossier.macroMicroContext || {}),
      JSON.stringify(dossier.sectorPositioning?.peers || dossier.peerComparison || []),
      JSON.stringify(dossier)
    ]);
  }

  public static async getDossierHistory(symbol: string, limit: number = 10): Promise<any[]> {
    await this.initTables();
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT * FROM SecurityKnowledgeBaseLedger
      WHERE symbol = ?
      ORDER BY as_of_date DESC
      LIMIT ?
    `, [symbol.toUpperCase(), limit]);

    return (rows || []).map((r: any) => ({
      ...r,
      bull_catalysts: JSON.parse(r.bull_catalysts_json || '[]'),
      bear_risks: JSON.parse(r.bear_risks_json || '[]'),
      macro_micro: JSON.parse(r.macro_micro_json || '{}'),
      peer_benchmark: JSON.parse(r.peer_benchmark_json || '[]')
    }));
  }

  public static async getThesis(symbol: string): Promise<InvestmentThesis | null> {
    await this.initTables();
    const db = getDB();
    const row = await dbGet(db, `
      SELECT * FROM InvestmentThesisLedger
      WHERE symbol = ?
    `, [symbol.toUpperCase()]);

    if (!row) return null;
    return {
      id: row.id,
      symbol: row.symbol,
      entry_date: row.entry_date,
      entry_price: row.entry_price,
      initial_verdict: row.initial_verdict,
      initial_target: row.initial_target,
      initial_stop_loss: row.initial_stop_loss,
      core_thesis_pillars: JSON.parse(row.core_thesis_pillars_json || '[]'),
      invalidation_triggers: JSON.parse(row.invalidation_triggers_json || '[]'),
      status: row.status,
      custom_notes: row.custom_notes,
      last_reviewed_at: row.last_reviewed_at
    };
  }

  public static async saveThesis(thesis: Partial<InvestmentThesis> & { symbol: string }): Promise<void> {
    await this.initTables();
    const db = getDB();
    const sym = thesis.symbol.toUpperCase();
    const existing = await this.getThesis(sym);
    const id = existing?.id || `THESIS_${sym}_${Date.now()}`;

    await dbRun(db, `
      INSERT OR REPLACE INTO InvestmentThesisLedger (
        id, symbol, entry_date, entry_price, initial_verdict, initial_target,
        initial_stop_loss, core_thesis_pillars_json, invalidation_triggers_json,
        status, custom_notes, last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      id,
      sym,
      thesis.entry_date || existing?.entry_date || new Date().toISOString().split('T')[0],
      thesis.entry_price || existing?.entry_price || 0,
      thesis.initial_verdict || existing?.initial_verdict || 'ACCUMULATE_DIPS',
      thesis.initial_target || existing?.initial_target || 0,
      thesis.initial_stop_loss || existing?.initial_stop_loss || 0,
      JSON.stringify(thesis.core_thesis_pillars || existing?.core_thesis_pillars || []),
      JSON.stringify(thesis.invalidation_triggers || existing?.invalidation_triggers || []),
      thesis.status || existing?.status || 'ACTIVE',
      thesis.custom_notes || existing?.custom_notes || ''
    ]);
  }

  public static async getCalibrationProposals(): Promise<AutoCalibrationProposalRecord[]> {
    await this.initTables();
    const db = getDB();
    const rows = await dbAll(db, `
      SELECT * FROM AutoCalibrationProposals
      ORDER BY created_at DESC
      LIMIT 20
    `);
    return rows || [];
  }

  public static async approveCalibrationProposal(id: string): Promise<boolean> {
    await this.initTables();
    const db = getDB();
    const proposal = await dbGet(db, `
      SELECT * FROM AutoCalibrationProposals WHERE id = ?
    `, [id]);

    if (!proposal) return false;

    // Apply the proposed weights into AppConfig
    try {
      const proposedWeights = JSON.parse(proposal.proposed_weights_json);
      await dbRun(db, `
        INSERT OR REPLACE INTO AppConfig (key, value)
        VALUES ('ACTIVE_MODEL_FACTOR_WEIGHTS', ?)
      `, [JSON.stringify(proposedWeights)]);

      await dbRun(db, `
        UPDATE AutoCalibrationProposals
        SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [id]);

      return true;
    } catch (e) {
      console.error('[ScripKnowledgeBaseService] Failed to approve calibration proposal:', e);
      return false;
    }
  }

  public static async recordAlert(alert: Omit<AlertRecord, 'id' | 'timestamp' | 'dismissed'>): Promise<string> {
    await this.initTables();
    const db = getDB();
    const id = `ALERT_${alert.symbol}_${Date.now()}`;
    await dbRun(db, `
      INSERT INTO AlertHistoryLedger (
        id, symbol, company_name, severity, title, message, catalyst_source,
        price_at_alert, target_price, stop_loss, calibrated_prob, dismissed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      id,
      alert.symbol.toUpperCase(),
      alert.company_name,
      alert.severity,
      alert.title,
      alert.message,
      alert.catalyst_source,
      alert.price_at_alert,
      alert.target_price || null,
      alert.stop_loss || null,
      alert.calibrated_prob || null
    ]);
    return id;
  }

  public static async getRecentAlerts(limit: number = 20, activeOnly: boolean = false): Promise<AlertRecord[]> {
    await this.initTables();
    const db = getDB();
    let query = `SELECT * FROM AlertHistoryLedger`;
    if (activeOnly) {
      query += ` WHERE dismissed = 0`;
    }
    query += ` ORDER BY timestamp DESC LIMIT ?`;

    const rows = await dbAll(db, query, [limit]);
    return (rows || []).map((r: any) => ({
      ...r,
      dismissed: Boolean(r.dismissed)
    }));
  }

  public static async dismissAlert(id: string): Promise<void> {
    await this.initTables();
    const db = getDB();
    await dbRun(db, `
      UPDATE AlertHistoryLedger SET dismissed = 1 WHERE id = ?
    `, [id]);
  }
}
