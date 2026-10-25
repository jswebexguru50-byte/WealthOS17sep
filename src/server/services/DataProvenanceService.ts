import { PROVIDER, DATA_CLASS } from './DataProviderRegistry.js';
import { obs } from './ObservabilityHub.js';

export interface ProvenanceRecord {
  id: string;          // nano-id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`
  ts: string;          // ISO timestamp
  symbol: string;
  dataClass: string;   // DATA_CLASS value
  provider: string;    // PROVIDER value
  latencyMs: number;
  success: boolean;
  cached: boolean;     // true = served from cache, false = live fetch
  source?: string;     // optional raw source label
}

const MAX_RECORDS = 5000;

export class DataProvenanceService {
  private static instance: DataProvenanceService;
  private records: ProvenanceRecord[] = [];

  static getInstance(): DataProvenanceService {
    if (!DataProvenanceService.instance) DataProvenanceService.instance = new DataProvenanceService();
    return DataProvenanceService.instance;
  }

  record(entry: Omit<ProvenanceRecord, 'id' | 'ts'>): void {
    const rec: ProvenanceRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      ...entry,
    };
    this.records.push(rec);
    if (this.records.length > MAX_RECORDS) this.records.shift();
    obs.increment('provenance.recorded', { provider: entry.provider, cached: String(entry.cached) });
  }

  query(opts: {
    symbol?: string;
    dataClass?: string;
    provider?: string;
    limit?: number;
    since?: string;   // ISO timestamp
  } = {}): ProvenanceRecord[] {
    let out = this.records;
    if (opts.symbol)    out = out.filter(r => r.symbol === opts.symbol!.toUpperCase());
    if (opts.dataClass) out = out.filter(r => r.dataClass === opts.dataClass);
    if (opts.provider)  out = out.filter(r => r.provider === opts.provider);
    if (opts.since)     out = out.filter(r => r.ts >= opts.since!);
    const limit = opts.limit ?? 100;
    return out.slice(-limit).reverse(); // most recent first
  }

  stats(): { total: number; byProvider: Record<string, number>; hitRate: number } {
    const byProvider: Record<string, number> = {};
    let cached = 0;
    for (const r of this.records) {
      byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
      if (r.cached) cached++;
    }
    return {
      total: this.records.length,
      byProvider,
      hitRate: this.records.length ? cached / this.records.length : 0,
    };
  }
}
