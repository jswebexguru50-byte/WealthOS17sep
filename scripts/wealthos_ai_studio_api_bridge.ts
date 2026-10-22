/**
 * scripts/wealthos_ai_studio_api_bridge.ts
 *
 * Local REST API Bridge for Google AI Studio & Gemini.
 * Allows Google AI Studio (via Python Code Execution, Function Calling, or curl)
 * to dynamically query the live WealthOS SQLite database without copying files or
 * burning prompt tokens.
 */

import http from 'node:http';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const PORT = 3005;
const WORKSPACE_ROOT = process.cwd();
const DB_PATH = path.join(WORKSPACE_ROOT, 'portfolio.db');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) console.error('Error opening database:', err);
  else console.log(`✓ Connected to authentic research database: ${DB_PATH}`);
});

function runQuery(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // 0a. robots.txt for AI Crawlers & Web Browsers (OpenAI, Anthropic, Google)
  if (pathname === '/robots.txt') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    res.end('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n');
    return;
  }

  // 0a1. Reviewer Audit Package ZIP Download (WealthOS v6.7.2-R1)
  if (pathname === '/api/v672/audit-package.zip') {
    const zipPath = path.join(WORKSPACE_ROOT, 'reports', 'v672', 'wealthos_v672_r1_audit_package.zip');
    if (!fs.existsSync(zipPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Audit package zip not found' }));
      return;
    }
    const stat = fs.statSync(zipPath);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="wealthos_v672_r1_audit_package.zip"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    const fileStream = fs.createReadStream(zipPath);
    fileStream.pipe(res);
    return;
  }

  // 0b. HTML Dashboard for Web Browsers and Web Retrieval Agents
  if (pathname === '/') {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WealthOS v6.7.2-R1 Independent Audit Gateway</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; margin: 0; padding: 30px; }
    h1 { color: #38bdf8; font-size: 24px; margin-bottom: 4px; }
    p { color: #94a3b8; font-size: 14px; margin-top: 0; }
    .status-badge { display: inline-block; background: #064e3b; color: #34d399; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px; margin-bottom: 20px; border: 1px solid #059669; }
    .download-banner { background: linear-gradient(135deg, #064e3b, #065f46); border: 2px solid #34d399; border-radius: 12px; padding: 24px; margin-bottom: 28px; }
    .download-banner h2 { margin: 0 0 8px 0; color: #a7f3d0; font-size: 20px; }
    .download-banner p { margin: 0 0 16px 0; color: #d1fae5; font-size: 14px; }
    .btn-download { display: inline-block; background: #10b981; color: #022c22; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; text-decoration: none; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
    .btn-download:hover { background: #34d399; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; margin-top: 16px; margin-bottom: 28px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
    .card h3 { margin-top: 0; font-size: 16px; color: #f8fafc; }
    .card a { color: #38bdf8; text-decoration: none; font-weight: 500; font-size: 14px; word-break: break-all; }
    .card a:hover { text-decoration: underline; }
    .card .view-link { display: inline-block; margin-top: 8px; color: #a78bfa; font-size: 12px; }
    .section-title { font-size: 18px; color: #f1f5f9; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-top: 24px; }
    pre { background: #0f172a; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>WealthOS v6.7.2-R1 Live Source Verification & Evidence Audit Gateway</h1>
  <p>Independent Source Verification, Clean-Room Shadow Replay, Mathematical Reconciliation & Governance Standard</p>
  <div class="status-badge">● C12_RESEARCH_ELIGIBLE · PRODUCTION PROMOTION: LOCKED (FALSE) · LIVE EXECUTION: LOCKED (FALSE)</div>
  
  <div class="download-banner">
    <h2>Reviewer Independent Code & Evidence Audit Package</h2>
    <p>Direct download of complete repository verification package containing all TypeScript source files, v672 unit tests, experiment registries, frozen v6.3 controls, and evidence artifacts (2.8 MB ZIP).</p>
    <a class="btn-download" href="/api/v672/audit-package.zip">⬇ Download Full Audit Package ZIP (wealthos_v672_r1_audit_package.zip)</a>
  </div>

  <h2 class="section-title">Critical v6.7.2-R1 Independent Evidence Endpoints</h2>
  <div class="grid">
    <div class="card">
      <h3>Master Verification Status (JSON)</h3>
      <a href="/api/v672/status">/api/v672/status</a><br>
      <a class="view-link" href="/view/api/v672/status">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Master Validation Report (Markdown)</h3>
      <a href="/api/v672/final-report-md">/api/v672/final-report-md</a><br>
      <a class="view-link" href="/view/api/v672/final-report-md">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>R2 Expectancy Derivation & Proof</h3>
      <a href="/api/v672/metric-reconciliation">/api/v672/metric-reconciliation</a><br>
      <a class="view-link" href="/view/api/v672/metric-reconciliation">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>WFO 6-Window Registry & Pre-OOS Locks</h3>
      <a href="/api/v672/wfo">/api/v672/wfo</a><br>
      <a class="view-link" href="/view/api/v672/wfo">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>9-Cell Market Regime Robustness Matrix</h3>
      <a href="/api/v672/regimes">/api/v672/regimes</a><br>
      <a class="view-link" href="/view/api/v672/regimes">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Benjamini-Hochberg FDR 80-Hypotheses Step-Up</h3>
      <a href="/api/v672/fdr">/api/v672/fdr</a><br>
      <a class="view-link" href="/view/api/v672/fdr">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Accounting Bug 4,506-Trade Itemized Delta</h3>
      <a href="/api/v672/accounting-bug-impact">/api/v672/accounting-bug-impact</a><br>
      <a class="view-link" href="/view/api/v672/accounting-bug-impact">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Point-In-Time 31,542 Facts Population Audit</h3>
      <a href="/api/v672/pit">/api/v672/pit</a><br>
      <a class="view-link" href="/view/api/v672/pit">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Capital Capacity Frontier (≤ ₹10 Cr)</h3>
      <a href="/api/v672/capacity">/api/v672/capacity</a><br>
      <a class="view-link" href="/view/api/v672/capacity">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>C12 Performance Lineage Across Stages</h3>
      <a href="/api/v672/lineage">/api/v672/lineage</a><br>
      <a class="view-link" href="/view/api/v672/lineage">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Canonical v6.5 Immutability Verification</h3>
      <a href="/api/v672/immutability">/api/v672/immutability</a><br>
      <a class="view-link" href="/view/api/v672/immutability">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Frozen Controls Manifest (Bit-for-Bit Identical)</h3>
      <a href="/api/v672/frozen-manifest">/api/v672/frozen-manifest</a><br>
      <a class="view-link" href="/view/api/v672/frozen-manifest">→ View in Browser (HTML)</a>
    </div>
  </div>

  <h2 class="section-title">Live Source Code & Unit Test Verification Endpoints</h2>
  <div class="grid">
    <div class="card">
      <h3>Metric Convention Registry (R2 Proof)</h3>
      <a href="/api/v672/code/metric-registry">/api/v672/code/metric-registry</a><br>
      <a class="view-link" href="/view/api/v672/code/metric-registry">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>WFO Pre-OOS Lock & Lineage Unit Test</h3>
      <a href="/api/v672/code/wfo-test">/api/v672/code/wfo-test</a><br>
      <a class="view-link" href="/view/api/v672/code/wfo-test">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Permanent Production Lock Unit Test</h3>
      <a href="/api/v672/code/production-lock-test">/api/v672/code/production-lock-test</a><br>
      <a class="view-link" href="/view/api/v672/code/production-lock-test">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>BH-FDR Independent Reproduction Test</h3>
      <a href="/api/v672/code/bh-fdr-test">/api/v672/code/bh-fdr-test</a><br>
      <a class="view-link" href="/view/api/v672/code/bh-fdr-test">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Accounting Bug Auditor Engine</h3>
      <a href="/api/v672/code/accounting-auditor">/api/v672/code/accounting-auditor</a><br>
      <a class="view-link" href="/view/api/v672/code/accounting-auditor">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>PIT Complete Population Validator</h3>
      <a href="/api/v672/code/pit-validator">/api/v672/code/pit-validator</a><br>
      <a class="view-link" href="/view/api/v672/code/pit-validator">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Clean-Room C12 Shadow Replayer</h3>
      <a href="/api/v672/code/shadow-replayer">/api/v672/code/shadow-replayer</a><br>
      <a class="view-link" href="/view/api/v672/code/shadow-replayer">→ View in Browser (HTML)</a>
    </div>
    <div class="card">
      <h3>Research Authorization Gatekeeper</h3>
      <a href="/api/v672/code/research-auth">/api/v672/code/research-auth</a><br>
      <a class="view-link" href="/view/api/v672/code/research-auth">→ View in Browser (HTML)</a>
    </div>
  </div>
</body>
</html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(html);
    return;
  }

  // 1. Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', database: path.basename(DB_PATH) }));
    return;
  }

  // 2. Schema listing
  if (url.pathname === '/api/schema') {
    try {
      const tables = await runQuery("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tableCount: tables.length, tables }));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 3. Live File Tree endpoint
  if (url.pathname === '/api/tree') {
    try {
      function getTree(dir: string, prefix = ''): string[] {
        let files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'coverage' || e.name === 'tmp') continue;
          const rel = path.join(prefix, e.name).replace(/\\/g, '/');
          if (e.isDirectory()) {
            files = files.concat(getTree(path.join(dir, e.name), rel));
          } else {
            files.push(rel);
          }
        }
        return files;
      }
      const tree = getTree(WORKSPACE_ROOT);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalFiles: tree.length, files: tree }));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. Live Code & Artifact File Reading endpoint
  if (url.pathname === '/api/code') {
    let filePath = url.searchParams.get('path');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path parameter (e.g. ?path=src/server/services/audit/V67RepositoryForensics.ts)' }));
      return;
    }

    try {
      // Decode URI if needed
      filePath = decodeURIComponent(filePath).trim();

      // Normalize slashes
      let normalized = filePath.replace(/\\/g, '/');

      // If absolute path matching workspace, strip workspace prefix
      const wsNorm = WORKSPACE_ROOT.replace(/\\/g, '/').toLowerCase();
      if (normalized.toLowerCase().startsWith(wsNorm)) {
        normalized = normalized.slice(wsNorm.length);
      }

      // Strip leading slashes and relative indicators
      normalized = normalized.replace(/^[\/\\]+/, '').replace(/^\.\/+/, '');

      // Resolve securely against WORKSPACE_ROOT
      const resolvedPath = path.resolve(WORKSPACE_ROOT, normalized);
      const resolvedNorm = resolvedPath.replace(/\\/g, '/').toLowerCase();
      const wsRootNorm = path.resolve(WORKSPACE_ROOT).replace(/\\/g, '/').toLowerCase();

      if (!resolvedNorm.startsWith(wsRootNorm) || resolvedNorm.includes('.env') || resolvedNorm.endsWith('.db')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access to this file is forbidden.', path: filePath, resolved: resolvedPath }));
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `File not found: ${filePath}`, resolved: resolvedPath }));
        return;
      }

      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Path is a directory, not a file: ${filePath}` }));
        return;
      }

      const content = fs.readFileSync(resolvedPath, 'utf8');
      const ext = path.extname(resolvedPath).toLowerCase();
      let contentType = 'text/plain; charset=utf-8';
      if (ext === '.json') contentType = 'application/json; charset=utf-8';
      else if (ext === '.md') contentType = 'text/markdown; charset=utf-8';
      else if (ext === '.ts' || ext === '.js') contentType = 'text/plain; charset=utf-8';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
      return;
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Failed to read file: ${err.message}`, path: filePath }));
      return;
    }
  }

  // 4. Single-Endpoint Consolidated Audit Bundle (Zero Query Parameters)
  if (url.pathname === '/api/v63/audit-bundle') {
    try {
      const dataDir = path.join(WORKSPACE_ROOT, 'data');
      const artifactFiles = [
        'v6.3_REAL_legacy_contamination_audit.json',
        'V63_FINAL_STATUS.json',
        'v6.3_REAL_CANONICAL_RUN.json',
        'CANONICAL_LEDGER_AUDIT.json',
        'PIT_AUDIT.json',
        'STRATEGY_S1_S4_RESULTS.json',
        'STRATEGY_S5_S8_RESULTS.json',
        'STRATEGY_S9_S11_RESULTS.json',
        'EXECUTION_COST_AUDIT.json',
        'REGIME_ROBUSTNESS_RESULTS.json',
        'ABLATION_RESULTS.json',
        'STATISTICAL_VALIDATION_RESULTS.json',
        'v6.3_REAL_data_provenance.json',
        'v6.3_DATA_CONTRACT.json',
        'v6.3_UNIVERSE_INTEGRITY_REPORT.json',
        'v6.3_PILOT_COVERAGE_AUDIT.json',
        'v6.3_CORPORATE_ACTION_REPORT.json',
        'v6.3_ONE_TRADE_TRACE.json',
        'v6.3_PILOT_REPLAY_REPORT.json',
        'v6.3_REAL_ablation_results.json',
        'v6.3_REAL_cost_sensitivity.json',
        'v6.3_REAL_walk_forward_results.json',
        'v6.3_REAL_strategy_results.json',
        'v6.3_REAL_regime_results.json',
        'v6.3_REAL_arm_comparison.json',
        'v6.3_REAL_final_lockbox.json',
        'v6.3_REPRODUCIBILITY_MANIFEST.json',
        'v6.3_REAL_VALIDATION_STATUS.json'
      ];

      const bundle: Record<string, any> = {
        bundle_name: "WealthOS v6.3 Canonical Empirical Reviewer Bundle",
        bundle_version: "v6.3-REVISION2-REAL",
        timestamp: new Date().toISOString(),
        host_database: "portfolio.db",
        canonical_evidence_state: {
          REAL_DATA_AVAILABLE: "YES",
          REAL_DATA_PIT_VALID: "PARTIAL (15:35 EOD Availability Enforced)",
          STRATEGY_REPLAYABLE: "PARTIAL (S1-S11 Evaluated; S12-S20 DATA_INSUFFICIENT)",
          STATISTICALLY_VALIDATED: "NO",
          PRODUCTION_PROMOTION: "NOT AUTHORIZED (Execution Remediated; Evaluation-Only)"
        },
        artifacts: {}
      };

      for (const f of artifactFiles) {
        const fp = path.join(dataDir, f);
        if (fs.existsSync(fp)) {
          try {
            bundle.artifacts[f.replace('.json', '')] = JSON.parse(fs.readFileSync(fp, 'utf8'));
          } catch {
            bundle.artifacts[f.replace('.json', '')] = fs.readFileSync(fp, 'utf8');
          }
        }
      }

      // Ledger reference
      const ledgerPath = path.join(dataDir, 'v6.3_REAL_trade_identity_ledger.jsonl');
      if (fs.existsSync(ledgerPath)) {
        const stat = fs.statSync(ledgerPath);
        bundle.trade_identity_ledger = {
          file_name: "v6.3_REAL_trade_identity_ledger.jsonl",
          size_bytes: stat.size,
          size_mb: (stat.size / (1024 * 1024)).toFixed(2),
          direct_url: `https://${req.headers.host || 'asks-tamil-story-fold.trycloudflare.com'}/api/artifact/v6.3_REAL_trade_identity_ledger.jsonl`,
          sample_50_trades_url: `https://${req.headers.host || 'asks-tamil-story-fold.trycloudflare.com'}/api/artifact/trade_ledger_sample_50.json`
        };
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(bundle, null, 2));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 5. Consolidated v6.5 Audit Bundle Endpoint (Lightweight & Instant for Web Gateways)
  if (url.pathname === '/api/v65/audit-bundle') {
    try {
      const dataV65Dir = path.join(WORKSPACE_ROOT, 'data', 'v6.5');
      const docsV65Dir = path.join(WORKSPACE_ROOT, 'docs', 'v6.5');

      const bundle: Record<string, any> = {
        bundle_name: "WealthOS v6.5 Economic Validation Audit Bundle",
        scope: "2020–2024 historically reconstructed and independently verified NIFTY 500 PIT universe",
        timestamp: new Date().toISOString(),
        productionPromotionAuthorized: false,
        artifacts: {},
        docs: {}
      };

      if (fs.existsSync(dataV65Dir)) {
        const files = fs.readdirSync(dataV65Dir);
        for (const f of files) {
          const fp = path.join(dataV65Dir, f);
          if (f.endsWith('.json')) {
            try {
              bundle.artifacts[f.replace('.json', '')] = JSON.parse(fs.readFileSync(fp, 'utf8'));
            } catch {
              bundle.artifacts[f.replace('.json', '')] = fs.readFileSync(fp, 'utf8');
            }
          } else if (f === 'v65_economic_replay_ledger.jsonl') {
            const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
            const sampleTrades = lines.slice(0, 50).map(l => JSON.parse(l));
            const sha = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
            bundle.artifacts.v65_economic_replay_ledger = {
              total_trades_count: lines.length,
              sha256_hash: sha,
              sample_50_trades: sampleTrades
            };
          } else if (f.endsWith('.sha256')) {
            bundle.artifacts[f] = fs.readFileSync(fp, 'utf8').trim();
          }
        }
      }

      if (fs.existsSync(docsV65Dir)) {
        const docFiles = fs.readdirSync(docsV65Dir);
        for (const f of docFiles) {
          bundle.docs[f] = fs.readFileSync(path.join(docsV65Dir, f), 'utf8');
        }
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(bundle, null, 2));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 6. Direct Unparameterized v6.5, v6.4.3, and v6.5.1 Artifact Endpoints
  const directRoutes: Record<string, string> = {
    '/api/v65/runner': 'scripts/build_v6.5_economic_validation.ts',
    '/api/v65/auditor': 'scripts/audit_v6.5_ledger_independently.ts',
    '/api/v65/pit-extension': 'scripts/build_v6.4.3_current_pit_extension.ts',
    '/api/v65/audit-bundle': 'v65_audit_bundle_export.json',
    '/api/v65/ledger': 'data/v6.5/v65_economic_replay_ledger.jsonl',
    '/api/v65/matrix': 'data/v6.5/v65_strategy_performance_matrix.json',
    '/api/v65/funnel': 'data/v6.5/v65_signal_funnel.json',
    '/api/v65/contracts': 'data/v6.5/v65_strategy_execution_contracts.json',
    '/api/v65/cost-schedule': 'data/v6.5/v65_transaction_cost_schedule.json',
    '/api/v65/portfolio-policy': 'data/v6.5/v65_portfolio_construction_policy.json',
    '/api/v65/capacity': 'data/v6.5/v65_capacity_analysis.json',
    '/api/v65/statistical-validation': 'data/v6.5/v65_statistical_validation_results.json',
    '/api/v65/walk-forward': 'data/v6.5/v65_walk_forward_oos_results.json',
    '/api/v65/regimes': 'data/v6.5/v65_regime_robustness_results.json',
    '/api/v65/sensitivity': 'data/v6.5/v65_cost_sensitivity_results.json',
    '/api/v65/status': 'data/v6.5/V65_ECONOMIC_VALIDATION_STATUS.json',
    '/api/v65/lockbox': 'data/v6.5/v65_replay_lockbox.json',
    '/api/v65/reconciliation': 'data/v6.5/v65_independent_metric_reconciliation.json',
    '/api/v65/forensics': 'docs/v6.5/V65_FAST_TRACK_CODE_FORENSICS.md',
    '/api/v643/status': 'data/v6.4.3/V643_PIT_VALIDATION_STATUS.json',
    '/api/v643/manifest': 'data/v6.4.3/v643_reproducibility_manifest.json',
    '/api/v651/audit-bundle': 'v65_audit_bundle_export.json',
    '/api/v651/status': 'data/v6.5.1/V651_ECONOMIC_VALIDATION_STATUS.json',
    '/api/v651/manifest': 'data/v6.4.3/v643_reproducibility_manifest.json',

    // v6.7 Direct Artifact & Report Endpoints
    '/api/v67/status': 'reports/v67/v67_final_status.json',
    '/api/v67/final-status-md': 'reports/v67/V67_FINAL_STATUS.md',
    '/api/v67/manifest': 'reports/v67/v67_artifact_manifest.json',
    '/api/v67/forensics': 'reports/v67/v67_repository_inventory.json',
    '/api/v67/forensics-md': 'reports/v67/V67_REPOSITORY_FORENSICS.md',
    '/api/v67/v65-reproduction': 'reports/v67/v65_reproduction.json',
    '/api/v67/v65-reproduction-md': 'reports/v67/V65_BASELINE_REPRODUCTION.md',
    '/api/v67/data-gap': 'reports/v67/v67_data_gap_closure.json',
    '/api/v67/data-gap-md': 'reports/v67/V67_DATA_GAP_CLOSURE.md',
    '/api/v67/pit': 'reports/v67/v67_pit_audit.json',
    '/api/v67/pit-md': 'reports/v67/V67_PIT_AUDIT.md',
    '/api/v67/risk-remediation': 'reports/v67/v67_risk_remediation.json',
    '/api/v67/risk-remediation-md': 'reports/v67/V67_RISK_REMEDIATION_AUDIT.md',
    '/api/v67/attribution': 'reports/v67/v67_incremental_attribution.json',
    '/api/v67/attribution-md': 'reports/v67/V67_INCREMENTAL_ATTRIBUTION.md',
    '/api/v67/wfo': 'reports/v67/v67_wfo.json',
    '/api/v67/wfo-md': 'reports/v67/V67_WFO.md',
    '/api/v67/regimes': 'reports/v67/v67_regime_robustness.json',
    '/api/v67/regimes-md': 'reports/v67/V67_REGIME_ANALYSIS.md',
    '/api/v67/cost-robustness': 'reports/v67/v67_cost_robustness.json',
    '/api/v67/cost-robustness-md': 'reports/v67/V67_COST_ROBUSTNESS.md',
    '/api/v67/capacity': 'reports/v67/v67_capacity.json',
    '/api/v67/capacity-md': 'reports/v67/V67_CAPACITY.md',
    '/api/v67/bootstrap': 'reports/v67/v67_bootstrap.json',
    '/api/v67/bootstrap-md': 'reports/v67/V67_BOOTSTRAP.md',
    '/api/v67/multiple-testing': 'reports/v67/v67_multiple_testing.json',
    '/api/v67/multiple-testing-md': 'reports/v67/V67_MULTIPLE_TESTING.md',
    '/api/v67/pkscreener': 'reports/v67/v67_pkscreener_parity.json',
    '/api/v67/pkscreener-md': 'reports/v67/V67_PKSCREENER_PARITY.md',
    '/api/v67/fenix': 'reports/v67/v67_fenix_paper_execution.json',
    '/api/v67/fenix-md': 'reports/v67/V67_FENIX_PAPER_EXECUTION.md',
    '/api/v67/independent-accounting': 'reports/v67/v67_independent_accounting.json',
    '/api/v67/independent-accounting-md': 'reports/v67/V67_INDEPENDENT_ACCOUNTING.md',
    '/api/v67/frozen-manifest': 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json',

    // v6.7 Critical Code Shortcuts
    '/api/v67/code/forensics': 'src/server/services/audit/V67RepositoryForensics.ts',
    '/api/v67/code/v65-reproducer': 'src/server/services/research/V65BaselineReproducer.ts',
    '/api/v67/code/data-gap-ledger': 'src/server/services/data/DataGapAuditLedger.ts',
    '/api/v67/code/lookahead-detector': 'src/server/services/research/LookaheadDetector.ts',
    '/api/v67/code/risk-audit': 'src/server/services/audit/RiskRemediationAudit.ts',
    '/api/v67/code/graph-guard': 'src/server/services/composable/GraphCycleGuard.ts',
    '/api/v67/code/experiment-registry': 'src/server/services/research/ExperimentRegistry.ts',
    '/api/v67/code/independent-engine': 'src/server/services/research/IndependentAuditEngine.ts',
    '/api/v67/code/master-runner': 'scripts/run_v67_master_validation.ts',
    '/api/v67/code/verify-frozen': 'scripts/v67/verify_frozen_manifest.ts',

    // v6.7.1 Master Verification & Adversarial Reports
    '/api/v671/status': 'reports/v67/v671_master_verification.json',
    '/api/v671/master-verification-md': 'reports/v67/V671_MASTER_VERIFICATION.md',
    '/api/v671/c12-shadow-replay': 'reports/v67/v67_c12_shadow_replay.json',
    '/api/v671/alpha-risk-decomposition': 'reports/v67/v67_alpha_risk_decomposition.json',
    '/api/v671/red-team': 'reports/v67/v67_red_team_status.json',
    '/api/v671/red-team-md': 'reports/v67/RED_TEAM_STATUS.md',
    '/api/v671/audit-bundle': 'reports/v67/v671_master_verification.json',
    '/api/v671/code/master-runner': 'scripts/v67/run_v671_master_verification.ts',
    '/api/v671/code/adversarial-suite': 'src/server/services/audit/AdversarialAttackSuite.ts',
    '/api/v671/code/shadow-replayer': 'src/server/services/research/C12ShadowReplayer.ts',
    '/api/v671/code/alpha-risk-decomposition': 'src/server/services/research/AlphaRiskDecomposition.ts',
    '/api/v671/code/red-team': 'src/server/services/audit/RedTeamAuditEngine.ts',
    '/api/v671/code/evidence-hierarchy': 'src/server/services/audit/EvidenceHierarchy.ts',

    // v6.7.2 Direct Artifact & Report Endpoints
    '/api/v672/status': 'reports/v672/V672_FINAL_VALIDATION_REPORT.json',
    '/api/v672/final-verdict': 'reports/v672/V672_FINAL_VALIDATION_REPORT.json',
    '/api/v672/final-report-md': 'reports/v672/V672_FINAL_VALIDATION_REPORT.md',
    '/api/v672/reconciliation-report-md': 'reports/v672/V672_FINAL_VALIDATION_REPORT.md',
    '/api/v672/metric-reconciliation': 'reports/v672/METRIC_RECONCILIATION.json',
    '/api/v672/accounting-bug-impact': 'reports/v672/V65_ACCOUNTING_BUG_IMPACT.json',
    '/api/v672/accounting-bug-impact-md': 'reports/v672/V65_ACCOUNTING_BUG_IMPACT.md',
    '/api/v672/accounting-reconciliation': 'reports/v672/V65_ACCOUNTING_RECONCILIATION_CHECK.json',
    '/api/v672/immutability': 'reports/v672/V65_CANONICAL_IMMUTABILITY.json',
    '/api/v672/wfo': 'reports/v672/WFO_WINDOW_REGISTRY.json',
    '/api/v672/regimes': 'reports/v672/REGIME_ROBUSTNESS.json',
    '/api/v672/fdr': 'reports/v672/BH_FDR_EVIDENCE.json',
    '/api/v672/pit': 'reports/v672/PIT_FACT_POPULATION_AUDIT.json',
    '/api/v672/capacity': 'reports/v672/CAPACITY_EVIDENCE.json',
    '/api/v672/lineage': 'reports/v672/C12_PERFORMANCE_LINEAGE.json',
    '/api/v672/shadow-replay': 'reports/v672/C12_SHADOW_REPLAY_EXACT.json',
    '/api/v672/manifest': 'reports/v672/V672_EVIDENCE_MANIFEST.json',
    '/api/v672/frozen-manifest': 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json',
    '/api/v672/experiment-registry': 'config/v672/EXPERIMENT_REGISTRY.json',
    '/api/v672/config-manifest': 'config/v672/CONFIGURATION_MANIFEST.json',
    '/api/v672/walkthrough-md': 'walkthrough.md',

    // v6.7.2 Source Code Shortcuts
    '/api/v672/code/metric-registry': 'src/server/services/research/MetricConventionRegistry.ts',
    '/api/v672/code/accounting-auditor': 'src/server/services/audit/AccountingBugImpactAuditor.ts',
    '/api/v672/code/pit-validator': 'src/server/services/audit/PITEvidenceValidator.ts',
    '/api/v672/code/shadow-replayer': 'src/server/services/research/C12ShadowReplayer.ts',
    '/api/v672/code/capacity-engine': 'src/server/services/research/CapacityCurveEngine.ts',
    '/api/v672/code/research-auth': 'src/server/services/research/ResearchAuthorization.ts',
    '/api/v672/code/production-lock-test': 'tests/v672/production/production_lock.test.ts',
    '/api/v672/code/bh-fdr-test': 'tests/v672/fdr/bh_fdr_from_registry_reproduction.test.ts',
    '/api/v672/code/wfo-test': 'tests/v672/wfo/exact_window_registry.test.ts',
    '/api/v672/code/accounting-test': 'tests/v672/accounting/v65_accounting_bug_impact.test.ts',
    '/api/v672/code/generator': 'scripts/v672/generate_v672_r1_artifacts.ts'
  };

  // 6b. Consolidated v6.7 Audit Bundle Endpoint
  if (url.pathname === '/api/v67/audit-bundle') {
    try {
      const reportsV67Dir = path.join(WORKSPACE_ROOT, 'reports', 'v67');
      const bundle: Record<string, any> = {
        bundle_name: "WealthOS v6.7 Independent Verification & Economic Validation Audit Bundle",
        scope: "Independent Verification, Data Closure, Risk Remediation & Composable Economic Validation",
        timestamp: new Date().toISOString(),
        productionPromotionAuthorized: false,
        artifacts: {},
        markdown_reports: {}
      };

      if (fs.existsSync(reportsV67Dir)) {
        const files = fs.readdirSync(reportsV67Dir);
        for (const f of files) {
          const fp = path.join(reportsV67Dir, f);
          if (f.endsWith('.json')) {
            try {
              bundle.artifacts[f.replace('.json', '')] = JSON.parse(fs.readFileSync(fp, 'utf8'));
            } catch {
              bundle.artifacts[f.replace('.json', '')] = fs.readFileSync(fp, 'utf8');
            }
          } else if (f.endsWith('.md')) {
            bundle.markdown_reports[f.replace('.md', '')] = fs.readFileSync(fp, 'utf8');
          }
        }
      }

      const manifestPath = path.join(WORKSPACE_ROOT, 'config', 'v67', 'FROZEN_V63_CONTROL_MANIFEST.json');
      if (fs.existsSync(manifestPath)) {
        bundle.frozen_manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(bundle, null, 2));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4b. HTML View Wrapper for Web Browsers & Web Search/Retrieval Tools
  if (pathname.startsWith('/view/')) {
    const targetRoute = pathname.replace(/^\/view/, '');
    const relPath = directRoutes[targetRoute] || directRoutes[targetRoute.replace(/\/+$/, '')];
    if (relPath) {
      const fullPath = path.join(WORKSPACE_ROOT, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fileName = path.basename(relPath);
        const isJson = relPath.endsWith('.json');
        const escapedContent = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WealthOS v6.7.1 - ${fileName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; }
    h1 { font-size: 18px; color: #38bdf8; margin: 0; font-family: monospace; }
    .btn { background: #2563eb; color: #fff; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; }
    pre { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; overflow-x: auto; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; }
    code { font-family: inherit; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${fileName} (${isJson ? 'JSON' : 'Source Code/Markdown'})</h1>
    <div>
      <a class="btn" href="${targetRoute}">Raw API</a>
      <a class="btn" href="/" style="background: #475569; margin-left: 8px;">Dashboard</a>
    </div>
  </div>
  <pre><code>${escapedContent}</code></pre>
</body>
</html>`;

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(html);
        return;
      }
    }
  }

  const directKey = directRoutes[pathname] ? pathname : (directRoutes[url.pathname] ? url.pathname : null);
  if (directKey) {
    const relPath = directRoutes[directKey];
    const fullPath = path.join(WORKSPACE_ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const isJson = relPath.endsWith('.json');
      const isMd = relPath.endsWith('.md');
      const contentType = isJson
        ? 'application/json; charset=utf-8'
        : (isMd ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `File not found: ${relPath}` }));
    }
    return;
  }

  // 5. Unparameterized Direct Artifact File Serving (ChatGPT Web Gateway Friendly)
  if (url.pathname === '/api/v63/context.json') {
    const canonicalPath = path.join(WORKSPACE_ROOT, 'data', 'v6.3_REAL_CANONICAL_RUN.json');
    if (fs.existsSync(canonicalPath)) {
      const content = fs.readFileSync(canonicalPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Canonical run manifest not found' }));
    }
    return;
  }

  if (url.pathname === '/api/v63/context') {
    const contextPath = path.join(WORKSPACE_ROOT, 'data', 'REVIEWER_CONTEXT.md');
    if (fs.existsSync(contextPath)) {
      const content = fs.readFileSync(contextPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Context not found' }));
    }
    return;
  }

  // v6.4 Endpoints
  if (url.pathname === '/api/v64/status') {
    const statusPath = path.join(WORKSPACE_ROOT, 'data', 'v6.4', 'V64_DATA_EXPANSION_STATUS.json');
    if (fs.existsSync(statusPath)) {
      const content = fs.readFileSync(statusPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'v6.4 status manifest not found' }));
    }
    return;
  }

  if (url.pathname === '/api/v64/manifest') {
    const manifestPath = path.join(WORKSPACE_ROOT, 'data', 'v6.4', 'v64_data_expansion_manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'v6.4 expansion manifest not found' }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/artifact/')) {
    const rawArtifact = url.pathname.replace('/api/artifact/', '').trim();
    if (!rawArtifact || rawArtifact === 'list') {
      // List all available artifacts with direct URLs
      const dataDir = path.join(WORKSPACE_ROOT, 'data');
      const files = fs.readdirSync(dataDir).filter(f => f.startsWith('v6.3_') || f.startsWith('V63-') || f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.md'));
      const host = req.headers.host || 'asks-tamil-story-fold.trycloudflare.com';
      const artifactList = files.map(f => ({
        file: f,
        url: `https://${host}/api/artifact/${f}`
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ totalArtifacts: artifactList.length, artifacts: artifactList }, null, 2));
      return;
    }

    // Special handler: trade_ledger_sample_50.json
    if (rawArtifact === 'trade_ledger_sample_50.json') {
      const ledgerPath = path.join(WORKSPACE_ROOT, 'data', 'v6.3_REAL_trade_identity_ledger.jsonl');
      if (fs.existsSync(ledgerPath)) {
        const content = fs.readFileSync(ledgerPath, 'utf8');
        const lines = content.trim().split('\n').slice(0, 50).filter(l => l.trim().length > 0);
        const parsed = lines.map(l => JSON.parse(l));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ sample_size: parsed.length, trades: parsed }, null, 2));
        return;
      }
    }

    let targetPath = path.join(WORKSPACE_ROOT, 'data', rawArtifact);
    if (rawArtifact === 'schema.sql') {
      targetPath = path.join(WORKSPACE_ROOT, 'schema.sql');
    }

    // Security check
    if (!targetPath.startsWith(WORKSPACE_ROOT) || targetPath.includes('.env') || targetPath.endsWith('.db')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access forbidden.' }));
      return;
    }

    if (!fs.existsSync(targetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Artifact not found: ${rawArtifact}` }));
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const isJson = ext === '.json';
    const contentType = isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';

    const fileStream = fs.createReadStream(targetPath);
    res.writeHead(200, { 'Content-Type': contentType });
    fileStream.pipe(res);
    return;
  }

  // 6. Database Statistics & Full Row Count Audit
  if (url.pathname === '/api/db/stats') {
    try {
      const tables = await runQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC");
      let grandTotal = 0;
      const tableStats: Record<string, number> = {};

      for (const t of tables) {
        try {
          const res = await runQuery(`SELECT count(1) as count FROM "${t.name}"`);
          const count = res[0]?.count || 0;
          tableStats[t.name] = count;
          grandTotal += count;
        } catch {
          tableStats[t.name] = 0;
        }
      }

      // Specific domain highlights
      const ohlcvStats = await runQuery("SELECT count(1) as total, count(distinct symbol) as symbols, min(trade_date) as min_date, max(trade_date) as max_date FROM DailyOHLCV");
      const txStats = await runQuery("SELECT count(1) as total, count(distinct symbol) as symbols, min(date) as min_date, max(date) as max_date FROM Transactions");
      const caStats = await runQuery("SELECT count(1) as total, count(distinct symbol) as symbols FROM CorporateActions");

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'ok',
        database: path.basename(DB_PATH),
        grandTotalRows: grandTotal,
        totalTables: tables.length,
        keyDomains: {
          DailyOHLCV: ohlcvStats[0],
          Transactions: txStats[0],
          CorporateActions: caStats[0]
        },
        tableRowCounts: tableStats
      }, null, 2));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 6. Dynamic SQL Query endpoint (Supports BOTH GET and POST)
  if (url.pathname === '/api/query') {
    const handleQueryExecution = async (sql: string, params: any[] = []) => {
      try {
        if (!sql) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing sql parameter. Use ?sql=SELECT... or POST body {"sql":"..."}' }));
          return;
        }

        // Enforce Read-Only queries
        const trimmed = sql.trim().toUpperCase();
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA') && !trimmed.startsWith('EXPLAIN')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Only read-only queries (SELECT, PRAGMA) are permitted.' }));
          return;
        }

        const rows = await runQuery(sql, params);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ rowCount: rows.length, rows }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    };

    if (req.method === 'GET') {
      const sql = url.searchParams.get('sql') || '';
      await handleQueryExecution(sql);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const sql = payload.sql || '';
          const params = payload.params || [];
          await handleQueryExecution(sql, params);
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid JSON payload: ${e.message}` }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`================================================================`);
  console.log(`  WEALTHOS GOOGLE AI STUDIO LOCAL DB API BRIDGE RUNNING         `);
  console.log(`  Port: http://localhost:${PORT}                                 `);
  console.log(`  Endpoints:                                                    `);
  console.log(`    GET  /health      - Check bridge health                     `);
  console.log(`    GET  /api/schema  - Empty schemas & DDL                     `);
  console.log(`    POST /api/query   - Execute dynamic read-only SQL queries   `);
  console.log(`================================================================\n`);
});
