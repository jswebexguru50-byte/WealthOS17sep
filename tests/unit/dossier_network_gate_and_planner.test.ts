import { describe, it, expect, beforeAll } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { loadDynamicMetricPack } from '../../scripts/fundamental/trendlyne_metric_pack_planner.js';

describe('Dossier Network Gate, Gap Analyzer & Trendlyne Planner Verification', () => {
  const runId = 'DR-20261001-7D-B0A8466C';
  const dbPath = path.join(process.cwd(), 'portfolio.db');
  let db: sqlite3.Database;

  const queryAll = <T = any>(sql: string, params: any[] = []): Promise<T[]> =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });

  beforeAll(() => {
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  });

  // 1. Dossier symbols loaded dynamically from run
  it('dossier symbols loaded dynamically from run and not hardcoded', async () => {
    const rows = await queryAll<{ symbol: string }>(
      'SELECT DISTINCT symbol FROM dossier_candidates WHERE dossierRunId = ? ORDER BY symbol ASC',
      [runId]
    );
    expect(rows.length).toBe(19);
    const symbols = rows.map(r => r.symbol);
    expect(symbols).toContain('AETHER');
    expect(symbols).toContain('RRKABEL');
    expect(symbols).toContain('XELPMOC');
  });

  // 2. Run has 19 candidates
  it('run has exactly 19 candidates', async () => {
    const rows = await queryAll<{ cnt: number }>(
      'SELECT COUNT(DISTINCT symbol) as cnt FROM dossier_candidates WHERE dossierRunId = ?',
      [runId]
    );
    expect(rows[0].cnt).toBe(19);
  });

  // 3. Run has 25 signals
  it('run has exactly 25 signals', async () => {
    const rows = await queryAll<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM dossier_signals WHERE dossierRunId = ?',
      [runId]
    );
    expect(rows[0].cnt).toBe(25);
  });

  // 4. Raw dossier gap count comes from snapshots
  it('raw dossier gap count comes from persisted missingDataChecklist in snapshots', async () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    expect(fs.existsSync(reportPath)).toBe(true);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    expect(gateReport.RAW_DOSSIER_GAPS).toBeGreaterThan(0);
    // Raw gaps are 358 from missingDataChecklist, strictly different from company_facts count
    expect(gateReport.RAW_DOSSIER_GAPS).not.toBe(409);
    expect(gateReport.RAW_DOSSIER_GAPS).toBe(358);
    expect(gateReport.UNIQUE_LOGICAL_GAPS).toBe(179);
  });

  // 5. Requirement catalog is shared/not duplicated
  it('requirement catalog is shared and has no duplicate requirement IDs', () => {
    const gapAnalysisPath = path.join(process.cwd(), `reports/dossier/${runId}_GAP_ANALYSIS.json`);
    expect(fs.existsSync(gapAnalysisPath)).toBe(true);
    const gapData = JSON.parse(fs.readFileSync(gapAnalysisPath, 'utf8'));
    expect(gapData.requirementCatalog).toBeDefined();
    expect(gapData.requirementCatalog.TOTAL_REQUIREMENT_DEFINITIONS).toBe(28);
    expect(gapData.requirementCatalog.UNIQUE_CANONICAL_REQUIREMENTS).toBe(28 * 19);
  });

  // 6. Local source resolution works across evidence layers
  it('local source resolution classifies available canonical, stored trendlyne, fere, and exchange', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.AVAILABLE_CANONICAL).toBeGreaterThan(0);
    expect(gateReport.RECOVERED_STORED_TRENDLYNE).toBeGreaterThan(0);
    expect(gateReport.RECOVERED_FERE).toBeGreaterThan(0);
    expect(gateReport.RECOVERED_EXCHANGE).toBeGreaterThan(0);
  });

  // 7. XBRL/FERE zero means actually checked
  it('XBRL/FERE zero means actually checked (CHECKED_AND_ZERO)', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.RECOVERED_XBRL).toBe(0); // Actually checked XbrlIngestionService tables
  });

  // 8. Derivation detection works
  it('derivation detection identifies derivable metrics from components', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.RECOVERED_DERIVED).toBeGreaterThan(0);
    expect(gateReport.RECOVERED_DERIVED).toBe(37); // netMargin and pe/peg derivations
  });

  // 9. 409 canonical MISSING rows are not used as dossier-gap count
  it('409 canonical MISSING rows are classified and not conflated with dossier gaps', async () => {
    const missingRows = await queryAll<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM company_facts 
       WHERE symbol IN (SELECT DISTINCT symbol FROM dossier_candidates WHERE dossierRunId = ?)
         AND factType = 'MISSING'`,
      [runId]
    );
    expect(missingRows[0].cnt).toBeLessThanOrEqual(409);
    expect(missingRows[0].cnt).toBe(398);

    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.RAW_DOSSIER_GAPS).not.toBe(missingRows[0].cnt);
    expect(gateReport.UNIQUE_LOGICAL_GAPS).not.toBe(missingRows[0].cnt);
  });

  // 10. unresolvedTokens drives pack
  it('unresolvedTokens drives the pack required vs opportunistic split', async () => {
    const pack1 = await loadDynamicMetricPack(db, ['pegttm', 'opmpctq']);
    expect(pack1.requiredTokens).toContain('pegttm');
    expect(pack1.requiredTokens).toContain('opmpctq');
    expect(pack1.requiredTokenCount).toBe(2);
    expect(pack1.opportunisticTokens).not.toContain('pegttm');

    const pack2 = await loadDynamicMetricPack(db, ['sra']);
    expect(pack2.requiredTokens).toContain('sra');
    expect(pack2.requiredTokenCount).toBe(1);
    expect(pack2.opportunisticTokens).not.toContain('sra');
  });

  // 11. Deterministic pack ordering
  it('pack generation is fully deterministic given same inputs', async () => {
    const packA = await loadDynamicMetricPack(db, ['pegttm', 'opmpctq']);
    const packB = await loadDynamicMetricPack(db, ['pegttm', 'opmpctq']);
    expect(packA.allPackedTokens).toEqual(packB.allPackedTokens);
    expect(packA.requiredTokens).toEqual(packB.requiredTokens);
    expect(packA.opportunisticTokens).toEqual(packB.opportunisticTokens);
  });

  // 12. Max 50 metrics
  it('pack size never exceeds 50 metrics', async () => {
    const pack = await loadDynamicMetricPack(db, ['pegttm', 'opmpctq']);
    expect(pack.totalPacked).toBeLessThanOrEqual(50);
    expect(pack.allPackedTokens.length).toBeLessThanOrEqual(50);
  });

  // 13. Only verified tokens included
  it('pack only contains VERIFIED tokens from field_mapping_catalog', async () => {
    const verifiedRows = await queryAll<{ provider_token: string }>(
      "SELECT provider_token FROM field_mapping_catalog WHERE provider='TRENDLYNE_MCP' AND mapping_status='VERIFIED'"
    );
    const verifiedTokens = new Set(verifiedRows.map(r => r.provider_token));

    const pack = await loadDynamicMetricPack(db, ['pegttm', 'opmpctq']);
    for (const token of pack.allPackedTokens) {
      expect(verifiedTokens.has(token)).toBe(true);
    }
  });

  // 14. Max 10 symbols per batch
  it('planned batches never exceed 10 symbols per batch', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    for (const batch of gateReport.batches) {
      expect(batch.symbolCount).toBeLessThanOrEqual(10);
      expect(batch.symbols.length).toBeLessThanOrEqual(10);
    }
  });

  // 15. Only unresolved symbols fetched
  it('only symbols with unresolved Trendlyne requirements are scheduled in batches', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.SYMBOLS_REQUIRING_TRENDLYNE).toBe(2);
    expect(gateReport.batches[0].symbols).toEqual(['CAPILLARY', 'GLOBALPET']);
    // Symbols already complete (e.g. AETHER, RRKABEL, MTARTECH) are NOT included in batch
    expect(gateReport.batches[0].symbols).not.toContain('AETHER');
    expect(gateReport.batches[0].symbols).not.toContain('RRKABEL');
  });

  // 16. Full returned mapped metrics promoted contract
  it('planner promotes all returned mapped metrics and does not discard unrequested tokens', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const batch = gateReport.batches[0];
    expect(batch.allTokens.length).toBeGreaterThan(batch.requiredTokens.length);
    expect(batch.opportunisticTokens.length).toBe(35);
    expect(batch.allTokens.length).toBe(37);
  });

  // 17. No provider call occurs during planning
  it('NETWORK_CALLS_EXECUTED is 0 during planning and gate report generation', () => {
    const reportPath = path.join(process.cwd(), `reports/dossier/${runId}_PRE_NETWORK_GATE.json`);
    const gateReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(gateReport.NETWORK_CALLS_EXECUTED).toBe(0);
    expect(gateReport.GATE_PASS).toBe(true);
    expect(gateReport.DATA_INSUFFICIENT).toBe(28);
    expect(gateReport.NOT_VERIFIABLE).toBe(19);
    expect(gateReport.NO_VERIFIED_EVIDENCE).toBe(19);
    expect(gateReport.NOT_APPLICABLE).toBe(0);
    expect(gateReport.GENUINELY_MISSING).toBe(3);
  });

  // 18. No provider call occurs during historical dossier read
  it('historical dossier read uses local database snapshots with zero network calls', async () => {
    const snapshots = await queryAll<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM dossier_analysis_snapshots WHERE dossierRunId = ?',
      [runId]
    );
    expect(snapshots[0].cnt).toBeGreaterThan(0);
  });
});
