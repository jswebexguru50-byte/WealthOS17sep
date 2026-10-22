import Database from 'better-sqlite3';
import fs from 'node:fs';

const db = new Database('portfolio.db');
const runId = 'DR-20261001-7D-B0A8466C';

const symbolsRows = db.prepare('SELECT DISTINCT symbol FROM dossier_analysis_snapshots WHERE dossierRunId = ?').all(runId);
const symbols = symbolsRows.map(r => r.symbol);

const status = {
  runId,
  symbols,
  checkpoints: {
    checkpoint_1_archify_ready: true,
    checkpoint_2_run_reconciled: true,
    checkpoint_3_pipeline_mapped: true,
    checkpoint_4_gaps_loaded: true,
    checkpoint_5_zero_network_recovery: false,
    checkpoint_6_network_recovery: false,
    checkpoint_7_db_reconciled: false,
    checkpoint_8_qglp_verified: false,
    checkpoint_9_dossier_analysis: false,
    checkpoint_10_excel_dry_run: false,
    checkpoint_11_dossier_db_verified: false,
    checkpoint_12_frontend_verified: false
  },
  gaps: {
    initial: 2979,
    remaining: 2979,
    zero_network_fixed: 0,
    network_fixed: 0
  }
};

fs.writeFileSync('reports/dossier/DR-20261001-7D-B0A8466C_EXECUTION_STATUS.json', JSON.stringify(status, null, 2));
console.log('Created execution status file with symbols: ', symbols);
