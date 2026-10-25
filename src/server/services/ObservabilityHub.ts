/**
 * ObservabilityHub — structured logging and lightweight metrics.
 *
 * Drop-in replacement for scattered console.log calls.
 * Emits JSON log lines (stdout) and accumulates in-process counters.
 *
 * Usage:
 *   import { obs } from './ObservabilityHub.js';
 *   obs.info('yahoo-finance', 'fetch_start', { symbol: 'INFY' });
 *   obs.error('upstox', 'fetch_failed', { symbol: 'INFY', status: 429 });
 *   obs.increment('api.calls', { provider: 'yahoo' });
 *   obs.timing('fetch.latency', elapsedMs, { provider: 'upstox' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Labels = Record<string, string | number | boolean>;

interface LogLine {
  ts: string;
  level: LogLevel;
  source: string;
  event: string;
  traceId?: string;
  [key: string]: any;
}

interface Counter { value: number; labels: Labels }
interface Histogram { sum: number; count: number; p99?: number; samples: number[] }

export class ObservabilityHub {
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private currentTraceId: string | null = null;

  // ── Logging ──────────────────────────────────────────────────────────────

  log(level: LogLevel, source: string, event: string, extra: Record<string, any> = {}): void {
    const line: LogLine = {
      ts: new Date().toISOString(),
      level,
      source,
      event,
      ...(this.currentTraceId ? { traceId: this.currentTraceId } : {}),
      ...extra,
    };
    const out = JSON.stringify(line);
    if (level === 'error') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  }

  debug(source: string, event: string, extra?: Record<string, any>): void { this.log('debug', source, event, extra); }
  info(source: string, event: string, extra?: Record<string, any>): void  { this.log('info',  source, event, extra); }
  warn(source: string, event: string, extra?: Record<string, any>): void  { this.log('warn',  source, event, extra); }
  error(source: string, event: string, extra?: Record<string, any>): void { this.log('error', source, event, extra); }

  // ── Metrics ───────────────────────────────────────────────────────────────

  increment(metric: string, labels: Labels = {}, by = 1): void {
    const key = this.metricKey(metric, labels);
    const c = this.counters.get(key) ?? { value: 0, labels };
    c.value += by;
    this.counters.set(key, c);
  }

  timing(metric: string, ms: number, labels: Labels = {}): void {
    const key = this.metricKey(metric, labels);
    const h = this.histograms.get(key) ?? { sum: 0, count: 0, samples: [] };
    h.sum += ms;
    h.count++;
    h.samples.push(ms);
    if (h.samples.length > 1000) h.samples.shift(); // rolling window
    this.histograms.set(key, h);
  }

  // ── Trace context ─────────────────────────────────────────────────────────

  withTraceId<T>(id: string, fn: () => T): T {
    const prev = this.currentTraceId;
    this.currentTraceId = id;
    try { return fn(); } finally { this.currentTraceId = prev; }
  }

  // ── Snapshot (for /api/system/metrics endpoint) ───────────────────────────

  snapshot() {
    const counters: Record<string, number> = {};
    for (const [k, c] of this.counters) counters[k] = c.value;

    const histograms: Record<string, { avg: number; p99: number; count: number }> = {};
    for (const [k, h] of this.histograms) {
      const sorted = [...h.samples].sort((a, b) => a - b);
      histograms[k] = {
        avg: h.count ? h.sum / h.count : 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
        count: h.count,
      };
    }
    return { counters, histograms, ts: new Date().toISOString() };
  }

  private metricKey(metric: string, labels: Labels): string {
    const l = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',');
    return l ? `${metric}{${l}}` : metric;
  }
}

export const obs = new ObservabilityHub();
