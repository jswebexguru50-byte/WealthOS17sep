import { readReadiness } from '../services/ReadinessService.js';
/**
 * src/server/routes/system.ts
 * System routes: healthcheck, server-info, backup, DB admin, change logs
 */
import { Router } from 'express';
import os from 'os';
import { DatabaseManager } from '../services/DatabaseManager.js';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { CircuitBreaker } from '../services/CircuitBreaker.js';
import { obs } from '../services/ObservabilityHub.js';
import { providerMeta, PROVIDER } from '../services/DataProviderRegistry.js';
import { DataRefreshScheduler } from '../services/DataRefreshScheduler.js';
import { MultiLayerCache } from '../services/MultiLayerCache.js';
import { CostTracker } from '../services/CostTracker.js';
import { BudgetEnforcer } from '../services/BudgetEnforcer.js';
import { DataProvenanceService } from '../services/DataProvenanceService.js';
import { FeatureFlags } from '../services/FeatureFlags.js';

const router = Router();

// GET /api/healthcheck
router.get('/healthcheck', async (_req, res) => {
  const result = await readReadiness(getDB());
  res.status(result.statusCode).json(result.body);
});

// GET /api/platform/health — circuit breaker states + in-process metrics
router.get('/platform/health', (_req, res) => {
  const cbStatus = CircuitBreaker.status();
  const providerStatus: Record<string, { priority: number; cbState: string; requiresSession: boolean; isExplicitOnly: boolean }> = {};
  for (const [p, meta] of Object.entries(providerMeta)) {
    providerStatus[p] = {
      priority: meta.priority,
      cbState: cbStatus[p] ?? 'CLOSED',
      requiresSession: meta.requiresSession,
      isExplicitOnly: meta.isExplicitOnly,
    };
  }
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    providers: providerStatus,
    scheduler: DataRefreshScheduler.getInstance().status(),
    metrics: obs.snapshot(),
    cache: MultiLayerCache.getInstance().stats(),
    budget: BudgetEnforcer.getInstance().status(),
    costs: CostTracker.getInstance().summary(),
  });
});

// POST /api/platform/refresh/:job — manually trigger a named refresh job
router.post('/platform/refresh/:job', async (req, res) => {
  const result = await DataRefreshScheduler.getInstance().runNow(req.params.job as any);
  res.status(result.ok ? 200 : 400).json(result);
});

// GET /api/platform/provenance — audit trail for data fetches
router.get('/platform/provenance', (req, res) => {
  const svc = DataProvenanceService.getInstance();
  const { symbol, provider, dataClass, limit, since } = req.query as Record<string, string | undefined>;
  const records = svc.query({
    symbol: symbol,
    provider: provider,
    dataClass: dataClass,
    limit: limit ? parseInt(limit, 10) : undefined,
    since: since,
  });
  res.json({ ok: true, records, stats: svc.stats() });
});

// GET /api/platform/flags — runtime feature flag snapshot
router.get('/platform/flags', (_req, res) => {
  res.json({ ok: true, flags: FeatureFlags.getInstance().snapshot() });
});

// GET /api/server-info
router.get('/server-info', (req, res) => {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  res.json({
    status: 'online',
    port: PORT,
    ipAddresses: addresses,
    primaryUrl: addresses.length > 0 ? `http://${addresses[0]}:${PORT}` : `http://localhost:${PORT}`
  });
});

// POST /api/backup
router.post('/backup', async (req, res) => {
  try {
    const tag = req.body?.tag || 'manual';
    const backupPath = await DatabaseManager.getInstance().createBackup(tag);
    res.json({ success: true, backupPath, message: 'Snapshot backup created successfully.' });
  } catch (err: any) {
    console.error('Backup creation failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/change-logs — App change history
router.get('/change-logs', async (_req, res) => {
  try {
    const db = getDB();
    const logs = await dbAll(db, `SELECT * FROM AppChangeLogs ORDER BY timestamp DESC LIMIT 100`);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/change-logs
router.post('/change-logs', async (req, res) => {
  try {
    const db = getDB();
    const { version_tag, summary, file_count } = req.body;
    await dbRun(db, `INSERT INTO AppChangeLogs (version_tag, summary, file_count) VALUES (?, ?, ?)`,
      [version_tag || 'v1.0.0', summary, file_count || 0]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/system-logs — Error / action logs
router.get('/system-logs', async (req, res) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit as string || '100', 10);
    const logs = await dbAll(db, `SELECT * FROM SystemLogs ORDER BY timestamp DESC LIMIT ?`, [limit]);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/action-history
router.get('/action-history', async (_req, res) => {
  try {
    const db = getDB();
    const rows = await dbAll(db, `SELECT * FROM ActionHistory ORDER BY timestamp DESC LIMIT 200`);
    res.json({ success: true, history: rows, rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/apps/generate-ai — Graceful fallback AI endpoint
router.post('/apps/generate-ai', async (_req, res) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  res.json({
    success: true,
    data: {
      message: 'AI capabilities in fallback mode.',
      generated_text: 'Fallback generated text: The AI backend is gracefully handling rate limits.'
    }
  });
});

// GET /metrics — Prometheus text exposition format
router.get('/metrics', (_req, res) => {
  const snap = obs.snapshot();
  const cbStatus = CircuitBreaker.status();
  const costs = CostTracker.getInstance().summary();

  const lines: string[] = [];

  // Helper to sanitise label values
  const lbl = (v: string) => v.replace(/[^a-zA-Z0-9_]/g, '_');

  // Counters from ObservabilityHub
  lines.push('# HELP wealthos_counter Generic platform counters');
  lines.push('# TYPE wealthos_counter counter');
  for (const [key, val] of Object.entries(snap.counters)) {
    const match = key.match(/^([^{]+)(\{.*\})?$/);
    const metricName = `wealthos_${lbl(match?.[1] ?? key)}`;
    const labelStr = match?.[2] ?? '';
    lines.push(`${metricName}${labelStr} ${val}`);
  }

  // Histograms
  lines.push('# HELP wealthos_latency_ms Latency histograms (avg + p99)');
  lines.push('# TYPE wealthos_latency_ms gauge');
  for (const [key, h] of Object.entries(snap.histograms)) {
    const match = key.match(/^([^{]+)(\{.*\})?$/);
    const metricName = `wealthos_${lbl(match?.[1] ?? key)}`;
    const labelStr = match?.[2] ?? '';
    lines.push(`${metricName}_avg${labelStr} ${h.avg.toFixed(2)}`);
    lines.push(`${metricName}_p99${labelStr} ${h.p99.toFixed(2)}`);
  }

  // Circuit breaker states (CLOSED=0, HALF_OPEN=1, OPEN=2)
  lines.push('# HELP wealthos_circuit_breaker_state 0=CLOSED 1=HALF_OPEN 2=OPEN');
  lines.push('# TYPE wealthos_circuit_breaker_state gauge');
  const cbStateMap: Record<string, number> = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };
  for (const [provider, state] of Object.entries(cbStatus)) {
    lines.push(`wealthos_circuit_breaker_state{provider="${provider}"} ${cbStateMap[state] ?? 0}`);
  }

  // Provider costs
  lines.push('# HELP wealthos_provider_cost_inr Estimated INR cost per provider this month');
  lines.push('# TYPE wealthos_provider_cost_inr gauge');
  for (const [provider, stats] of Object.entries(costs.byProvider)) {
    lines.push(`wealthos_provider_cost_inr{provider="${provider}"} ${(stats as any).estimatedCostINR.toFixed(4)}`);
    lines.push(`wealthos_provider_calls_total{provider="${provider}"} ${(stats as any).calls}`);
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

export default router;
