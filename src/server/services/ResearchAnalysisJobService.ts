import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dbAll, dbGet, dbRun, getDB } from '../database.js';
import { ResearchAnalysisArchiveService } from './ResearchAnalysisArchiveService.js';
import { Institutional29SynthesisService } from './Institutional29SynthesisService.js';

const execFileAsync = promisify(execFile);
type JobMode = 'DETERMINISTIC_ONLY' | 'LLM_IF_AVAILABLE' | 'LLM_REQUIRED';

export interface ResearchAnalysisJob {
  jobId: string;
  symbols: string[];
  asOfDate: string;
  mode: JobMode;
  status: string;
  total: number;
  completed: number;
  failed: number;
  currentSymbol: string | null;
  results: any[];
  errors: any[];
  symbolMetadata: Record<string, ResearchSymbolMetadata>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ResearchSymbolMetadata {
  marketValue?: number;
  quantity?: number;
  ltp?: number;
  portfolios?: string[];
  valuationAsOf?: string | null;
}

const parseJson = (value: any, fallback: any) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

export class ResearchAnalysisJobService {
  private static instance: ResearchAnalysisJobService;
  private schemaReady = false;
  private active = new Set<string>();

  static getInstance(): ResearchAnalysisJobService {
    if (!this.instance) this.instance = new ResearchAnalysisJobService();
    return this.instance;
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    await dbRun(getDB(), `CREATE TABLE IF NOT EXISTS ResearchAnalysisJobs (
      job_id TEXT PRIMARY KEY,
      symbols_json TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      current_symbol TEXT,
      results_json TEXT NOT NULL DEFAULT '[]',
      errors_json TEXT NOT NULL DEFAULT '[]',
      symbol_metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )`);
    try {
      await dbRun(getDB(), `ALTER TABLE ResearchAnalysisJobs ADD COLUMN symbol_metadata_json TEXT NOT NULL DEFAULT '{}'`);
    } catch (error: any) {
      if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
    }
    await dbRun(getDB(), 'CREATE INDEX IF NOT EXISTS idx_research_jobs_created ON ResearchAnalysisJobs(created_at DESC)');
    this.schemaReady = true;
  }

  private normalizeSymbols(values: unknown, maxSymbols = 50): string[] {
    if (!Array.isArray(values)) throw new Error('INVALID_SYMBOL_LIST');
    const symbols = [...new Set(values.map(value => String(value || '').trim().toUpperCase().replace(/^NSE:/, '')).filter(Boolean))];
    if (!symbols.length || symbols.length > maxSymbols || symbols.some(symbol => !/^[A-Z0-9&._-]{1,32}$/.test(symbol))) throw new Error('INVALID_SYMBOL_LIST');
    return symbols;
  }

  private map(row: any): ResearchAnalysisJob {
    return {
      jobId: row.job_id, symbols: parseJson(row.symbols_json, []), asOfDate: row.as_of_date, mode: row.mode,
      status: row.status, total: row.total, completed: row.completed, failed: row.failed,
      currentSymbol: row.current_symbol ?? null, results: parseJson(row.results_json, []), errors: parseJson(row.errors_json, []),
      symbolMetadata: parseJson(row.symbol_metadata_json, {}),
      createdAt: row.created_at, startedAt: row.started_at ?? null, finishedAt: row.finished_at ?? null,
    };
  }

  private normalizeSymbolMetadata(value: unknown, symbols: string[]): Record<string, ResearchSymbolMetadata> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const allowed = new Set(symbols);
    const normalized: Record<string, ResearchSymbolMetadata> = {};
    for (const [rawSymbol, rawMetadata] of Object.entries(value as Record<string, any>)) {
      const symbol = String(rawSymbol || '').trim().toUpperCase().replace(/^NSE:/, '');
      if (!allowed.has(symbol) || !rawMetadata || typeof rawMetadata !== 'object') continue;
      const numberOrUndefined = (candidate: unknown) => {
        const number = Number(candidate);
        return Number.isFinite(number) && number >= 0 ? number : undefined;
      };
      const portfolios: string[] | undefined = Array.isArray(rawMetadata.portfolios)
        ? [...new Set<string>((rawMetadata.portfolios as unknown[]).map(item => String(item || '').trim()).filter(Boolean))].slice(0, 20)
        : undefined;
      normalized[symbol] = {
        marketValue: numberOrUndefined(rawMetadata.marketValue),
        quantity: numberOrUndefined(rawMetadata.quantity),
        ltp: numberOrUndefined(rawMetadata.ltp),
        portfolios,
        valuationAsOf: /^\d{4}-\d{2}-\d{2}/.test(String(rawMetadata.valuationAsOf || ''))
          ? String(rawMetadata.valuationAsOf).slice(0, 10)
          : null,
      };
    }
    return normalized;
  }

  async create(symbolValues: unknown, asOfDate: string, mode: JobMode = 'LLM_IF_AVAILABLE', symbolMetadataValue: unknown = {}, maxSymbols = 50): Promise<ResearchAnalysisJob> {
    await this.ensureSchema();
    const symbols = this.normalizeSymbols(symbolValues, maxSymbols);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('INVALID_AS_OF_DATE');
    if (!['DETERMINISTIC_ONLY', 'LLM_IF_AVAILABLE', 'LLM_REQUIRED'].includes(mode)) throw new Error('INVALID_JOB_MODE');
    const symbolMetadata = this.normalizeSymbolMetadata(symbolMetadataValue, symbols);
    const now = new Date().toISOString();
    const jobId = `RJ-${asOfDate.replaceAll('-', '')}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    await dbRun(getDB(), `INSERT INTO ResearchAnalysisJobs
      (job_id,symbols_json,as_of_date,mode,status,total,symbol_metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [jobId, JSON.stringify(symbols), asOfDate, mode, 'QUEUED', symbols.length, JSON.stringify(symbolMetadata), now]);
    setImmediate(() => this.run(jobId).catch(error => console.error(`[ResearchAnalysisJob] ${jobId} failed:`, error)));
    return (await this.get(jobId))!;
  }

  async get(jobId: string): Promise<ResearchAnalysisJob | null> {
    await this.ensureSchema();
    const row = await dbGet<any>(getDB(), 'SELECT * FROM ResearchAnalysisJobs WHERE job_id=?', [jobId]);
    return row ? this.map(row) : null;
  }

  async list(limit = 20): Promise<ResearchAnalysisJob[]> {
    await this.ensureSchema();
    const rows = await dbAll<any>(getDB(), 'SELECT * FROM ResearchAnalysisJobs ORDER BY created_at DESC LIMIT ?', [Math.min(Math.max(limit, 1), 100)]);
    return rows.map(row => this.map(row));
  }

  private async update(jobId: string, values: Partial<{ status: string; completed: number; failed: number; currentSymbol: string | null; results: any[]; errors: any[]; startedAt: string; finishedAt: string }>): Promise<void> {
    const mappings: Record<string, string> = { status: 'status', completed: 'completed', failed: 'failed', currentSymbol: 'current_symbol', results: 'results_json', errors: 'errors_json', startedAt: 'started_at', finishedAt: 'finished_at' };
    const entries = Object.entries(values);
    if (!entries.length) return;
    const sql = entries.map(([key]) => `${mappings[key]}=?`).join(',');
    const params = entries.map(([key, value]) => key === 'results' || key === 'errors' ? JSON.stringify(value) : value);
    await dbRun(getDB(), `UPDATE ResearchAnalysisJobs SET ${sql} WHERE job_id=?`, [...params, jobId]);
  }

  private async run(jobId: string): Promise<void> {
    if (this.active.has(jobId)) return;
    this.active.add(jobId);
    try {
      const job = await this.get(jobId);
      if (!job || !['QUEUED', 'INTERRUPTED'].includes(job.status)) return;
      const startedAt = new Date().toISOString();
      await this.update(jobId, { status: 'RUNNING', startedAt });
      const results: any[] = [];
      const errors: any[] = [];
      let completed = 0;
      let failed = 0;
      for (const symbol of job.symbols) {
        await this.update(jobId, { currentSymbol: symbol, completed, failed, results, errors });
        try {
          const script = path.join(process.cwd(), 'scripts', 'fundamental', 'institutional29', 'build_bundle.mjs');
          const metadata = job.symbolMetadata[symbol] || {};
          const buildArgs = [script, symbol, '--as-of', job.asOfDate, '--no-persist'];
          if (metadata.marketValue && metadata.marketValue > 0) buildArgs.push('--position-value', String(metadata.marketValue));
          await execFileAsync(process.execPath, buildArgs, { cwd: process.cwd(), timeout: 180_000, maxBuffer: 10_000_000 });
          const symbolDir = path.join(process.cwd(), 'outputs', 'institutional29', symbol);
          const bundle = JSON.parse(fs.readFileSync(path.join(symbolDir, 'research_bundle.json'), 'utf8'));
          const instructions = fs.readFileSync(path.join(symbolDir, 'synthesis_instructions.md'), 'utf8');
          const archive = ResearchAnalysisArchiveService.getInstance();
          const evidenceRecord = await archive.save({
            symbol, kind: 'EVIDENCE_BUNDLE', title: `${symbol} Institutional-29 evidence bundle`, asOfDate: job.asOfDate,
            evidenceBundle: bundle, contractVersion: bundle.contractVersion, evidencePolicyVersion: bundle.evidencePolicyVersion,
            validationStatus: 'EVIDENCE_READY', sourceJob: jobId, metadata: { summary: bundle.summary, holding: metadata },
          });
          let analysisId: string | null = null;
          let llmStatus = 'NOT_REQUESTED';
          if (job.mode !== 'DETERMINISTIC_ONLY') {
            const synthesizer = Institutional29SynthesisService.getInstance();
            if (!synthesizer.isConfigured()) {
              if (job.mode === 'LLM_REQUIRED') throw new Error('LLM_NOT_CONFIGURED');
              llmStatus = 'NOT_CONFIGURED';
            } else {
              const synthesis = await synthesizer.synthesize(bundle, instructions);
              const saved = await archive.save({
                symbol, kind: 'LLM_ANALYSIS', title: synthesis.analysis.title, asOfDate: job.asOfDate,
                analysisMarkdown: synthesis.markdown, analysisJson: synthesis.analysis, evidenceBundle: bundle,
                citations: synthesis.analysis.citations, modelProvider: synthesis.provider, modelName: synthesis.model,
                promptVersion: synthesis.promptVersion, contractVersion: bundle.contractVersion,
                evidencePolicyVersion: bundle.evidencePolicyVersion, validationStatus: 'UNVALIDATED', sourceJob: jobId,
                parentAnalysisId: evidenceRecord.record.analysisId,
                metadata: { rawResponseHash: crypto.createHash('sha256').update(synthesis.rawText).digest('hex'), holding: metadata },
              });
              analysisId = saved.record.analysisId;
              llmStatus = 'SAVED_UNVALIDATED';
            }
          }
          results.push({ symbol, evidenceAnalysisId: evidenceRecord.record.analysisId, analysisId, llmStatus });
          completed++;
        } catch (error: any) {
          failed++;
          errors.push({ symbol, error: error.message || String(error) });
        }
      }
      const status = failed === 0 ? 'COMPLETED' : completed > 0 ? 'COMPLETED_WITH_ERRORS' : 'FAILED';
      await this.update(jobId, { status, completed, failed, currentSymbol: null, results, errors, finishedAt: new Date().toISOString() });
    } finally {
      this.active.delete(jobId);
    }
  }
}
