/**
 * Local-only dossier runner.  It calls no LLM and sends no email.
 * Usage: npx tsx scripts/run_current_universe_dossier.ts
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ConsolidatedOpportunityEngine } from '../src/server/services/ConsolidatedOpportunityEngine.js';

async function main() {
  console.log('[Dossier] Starting full active NSE/BSE strategy-gated scan.');
  const report = await ConsolidatedOpportunityEngine.getInstance().executeFullScanPipeline();
  console.log(`[Dossier] Scan completed: ${report.opportunities?.length ?? 0} evaluated opportunities.`);

  // The builder reads only the locally persisted scan output and local DuckDB/Parquet data.
  const runtimeNode = 'C:\\Users\\gopal\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
  const builderDir = path.resolve('scratch', 'dossier_refresh_artifact');
  execFileSync(runtimeNode, ['build_latest_dossier.mjs'], { cwd: builderDir, stdio: 'inherit' });
  console.log('[Dossier] Workbook written to outputs/latest_universe_dossier/.');
}

main().catch(error => { console.error('[Dossier] Failed:', error); process.exitCode = 1; });
