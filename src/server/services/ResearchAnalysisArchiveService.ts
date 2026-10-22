import crypto from 'node:crypto';
import { dbAll, dbGet, dbRun, getDB } from '../database.js';

export type ResearchAnalysisKind = 'EVIDENCE_BUNDLE' | 'DETERMINISTIC_ANALYSIS' | 'LLM_ANALYSIS';
export type ResearchValidationStatus = 'EVIDENCE_READY' | 'UNVALIDATED' | 'VALIDATED' | 'PARTIAL' | 'REJECTED';

export interface SaveResearchAnalysisInput {
  symbol: string;
  kind: ResearchAnalysisKind;
  title: string;
  asOfDate: string;
  analysisMarkdown?: string | null;
  analysisJson?: unknown;
  evidenceBundle?: unknown;
  citations?: unknown[];
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  contractVersion?: string | null;
  evidencePolicyVersion?: string | null;
  validationStatus?: ResearchValidationStatus;
  sourceJob?: string | null;
  metadata?: unknown;
  parentAnalysisId?: string | null;
}

export interface SavedResearchAnalysis {
  analysisId: string;
  symbol: string;
  kind: ResearchAnalysisKind;
  title: string;
  asOfDate: string;
  generatedAt: string;
  persistedAt: string;
  modelProvider: string | null;
  modelName: string | null;
  promptVersion: string | null;
  contractVersion: string | null;
  evidencePolicyVersion: string | null;
  validationStatus: ResearchValidationStatus;
  evidenceHash: string | null;
  contentHash: string;
  analysisMarkdown: string | null;
  analysisJson: unknown;
  evidenceBundle: unknown;
  citations: unknown[];
  sourceJob: string | null;
  metadata: unknown;
  parentAnalysisId: string | null;
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const stableJson = (value: unknown) => value == null ? null : JSON.stringify(value);
const parseJson = (value: unknown, fallback: unknown) => {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

export class ResearchAnalysisArchiveService {
  private static instance: ResearchAnalysisArchiveService;
  private schemaReady = false;

  static getInstance(): ResearchAnalysisArchiveService {
    if (!this.instance) this.instance = new ResearchAnalysisArchiveService();
    return this.instance;
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const db = getDB();
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ResearchAnalysisArchive (
      analysis_id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      analysis_kind TEXT NOT NULL CHECK (analysis_kind IN ('EVIDENCE_BUNDLE','DETERMINISTIC_ANALYSIS','LLM_ANALYSIS')),
      title TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      persisted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      model_provider TEXT,
      model_name TEXT,
      prompt_version TEXT,
      contract_version TEXT,
      evidence_policy_version TEXT,
      validation_status TEXT NOT NULL,
      evidence_hash TEXT,
      content_hash TEXT NOT NULL,
      analysis_markdown TEXT,
      analysis_json TEXT,
      evidence_bundle_json TEXT,
      citations_json TEXT,
      source_job TEXT,
      metadata_json TEXT,
      parent_analysis_id TEXT,
      UNIQUE(symbol, analysis_kind, content_hash)
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_research_analysis_symbol_latest
      ON ResearchAnalysisArchive(symbol, persisted_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_research_analysis_kind_latest
      ON ResearchAnalysisArchive(analysis_kind, persisted_at DESC)`);
    this.schemaReady = true;
  }

  private normalizeSymbol(symbol: string): string {
    const normalized = String(symbol || '').trim().toUpperCase().replace(/^NSE:/, '');
    if (!/^[A-Z0-9&._-]{1,32}$/.test(normalized)) throw new Error('INVALID_SYMBOL');
    return normalized;
  }

  private mapRow(row: any): SavedResearchAnalysis {
    return {
      analysisId: row.analysis_id,
      symbol: row.symbol,
      kind: row.analysis_kind,
      title: row.title,
      asOfDate: row.as_of_date,
      generatedAt: row.generated_at,
      persistedAt: row.persisted_at,
      modelProvider: row.model_provider ?? null,
      modelName: row.model_name ?? null,
      promptVersion: row.prompt_version ?? null,
      contractVersion: row.contract_version ?? null,
      evidencePolicyVersion: row.evidence_policy_version ?? null,
      validationStatus: row.validation_status,
      evidenceHash: row.evidence_hash ?? null,
      contentHash: row.content_hash,
      analysisMarkdown: row.analysis_markdown ?? null,
      analysisJson: parseJson(row.analysis_json, null),
      evidenceBundle: parseJson(row.evidence_bundle_json, null),
      citations: parseJson(row.citations_json, []) as unknown[],
      sourceJob: row.source_job ?? null,
      metadata: parseJson(row.metadata_json, null),
      parentAnalysisId: row.parent_analysis_id ?? null,
    };
  }

  async save(input: SaveResearchAnalysisInput): Promise<{ record: SavedResearchAnalysis; created: boolean }> {
    await this.ensureSchema();
    const symbol = this.normalizeSymbol(input.symbol);
    const title = String(input.title || '').trim();
    const asOfDate = String(input.asOfDate || '').trim();
    if (!title || title.length > 300) throw new Error('INVALID_TITLE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('INVALID_AS_OF_DATE');

    const markdown = input.analysisMarkdown == null ? null : String(input.analysisMarkdown);
    if (markdown && Buffer.byteLength(markdown, 'utf8') > 2_000_000) throw new Error('ANALYSIS_TOO_LARGE');
    const evidenceJson = stableJson(input.evidenceBundle);
    if (evidenceJson && Buffer.byteLength(evidenceJson, 'utf8') > 8_000_000) throw new Error('EVIDENCE_BUNDLE_TOO_LARGE');
    const analysisJson = stableJson(input.analysisJson);
    const citationsJson = stableJson(input.citations || []);
    const metadataJson = stableJson(input.metadata);
    const evidenceHash = evidenceJson ? sha256(evidenceJson) : null;
    const contentHash = sha256(JSON.stringify({ symbol, kind: input.kind, asOfDate, markdown, analysisJson, evidenceHash, modelProvider: input.modelProvider || null, modelName: input.modelName || null, promptVersion: input.promptVersion || null }));
    const analysisId = `RA-${symbol}-${asOfDate.replaceAll('-', '')}-${contentHash.slice(0, 12).toUpperCase()}`;
    const generatedAt = new Date().toISOString();
    const validationStatus = input.validationStatus || (input.kind === 'EVIDENCE_BUNDLE' ? 'EVIDENCE_READY' : 'UNVALIDATED');
    const db = getDB();
    const result = await dbRun(db, `INSERT OR IGNORE INTO ResearchAnalysisArchive (
      analysis_id,symbol,analysis_kind,title,as_of_date,generated_at,model_provider,model_name,prompt_version,
      contract_version,evidence_policy_version,validation_status,evidence_hash,content_hash,analysis_markdown,
      analysis_json,evidence_bundle_json,citations_json,source_job,metadata_json,parent_analysis_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      analysisId, symbol, input.kind, title, asOfDate, generatedAt, input.modelProvider || null, input.modelName || null,
      input.promptVersion || null, input.contractVersion || null, input.evidencePolicyVersion || null, validationStatus,
      evidenceHash, contentHash, markdown, analysisJson, evidenceJson, citationsJson, input.sourceJob || null,
      metadataJson, input.parentAnalysisId || null,
    ]);
    const row = await dbGet<any>(db, `SELECT * FROM ResearchAnalysisArchive
      WHERE symbol=? AND analysis_kind=? AND content_hash=?`, [symbol, input.kind, contentHash]);
    return { record: this.mapRow(row), created: Number(result?.changes || 0) > 0 };
  }

  async list(symbol: string, limit = 20): Promise<SavedResearchAnalysis[]> {
    await this.ensureSchema();
    const normalized = this.normalizeSymbol(symbol);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await dbAll<any>(getDB(), `SELECT
      analysis_id,symbol,analysis_kind,title,as_of_date,generated_at,persisted_at,model_provider,model_name,
      prompt_version,contract_version,evidence_policy_version,validation_status,evidence_hash,content_hash,
      analysis_markdown,NULL AS analysis_json,NULL AS evidence_bundle_json,citations_json,source_job,
      metadata_json,parent_analysis_id
      FROM ResearchAnalysisArchive
      WHERE symbol=? ORDER BY persisted_at DESC, generated_at DESC LIMIT ?`, [normalized, safeLimit]);
    return rows.map(row => this.mapRow(row));
  }

  async getLatest(symbol: string, includeEvidenceBundles = false): Promise<SavedResearchAnalysis | null> {
    await this.ensureSchema();
    const normalized = this.normalizeSymbol(symbol);
    const row = await dbGet<any>(getDB(), `SELECT * FROM ResearchAnalysisArchive
      WHERE symbol=? ${includeEvidenceBundles ? '' : "AND analysis_kind!='EVIDENCE_BUNDLE'"}
      ORDER BY persisted_at DESC, generated_at DESC LIMIT 1`, [normalized]);
    return row ? this.mapRow(row) : null;
  }

  async getLatestEvidence(symbol: string, asOfDate?: string): Promise<SavedResearchAnalysis | null> {
    await this.ensureSchema();
    const normalized = this.normalizeSymbol(symbol);
    const row = await dbGet<any>(getDB(), `SELECT * FROM ResearchAnalysisArchive
      WHERE symbol=? AND analysis_kind='EVIDENCE_BUNDLE' ${asOfDate ? 'AND as_of_date=?' : ''}
      ORDER BY persisted_at DESC, generated_at DESC LIMIT 1`, asOfDate ? [normalized, asOfDate] : [normalized]);
    return row ? this.mapRow(row) : null;
  }

  async getById(analysisId: string): Promise<SavedResearchAnalysis | null> {
    await this.ensureSchema();
    const row = await dbGet<any>(getDB(), 'SELECT * FROM ResearchAnalysisArchive WHERE analysis_id=?', [analysisId]);
    return row ? this.mapRow(row) : null;
  }
}
