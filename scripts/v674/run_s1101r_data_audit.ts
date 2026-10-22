import { S1101RDataTruthAuditor } from '../../src/server/services/s1101r/data/S1101RDataTruthAuditor';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 2: DATA TRUTH, PIT & AUTOMATIC ENRICHMENT AUDIT ===');
  const ledger = new S1101RMasterLedger();
  const auditor = new S1101RDataTruthAuditor('reports/v674-s1101r', ledger);
  const result = auditor.runDataAudit();

  console.log(`Audited ${result.domainsAudited.length} data domains.`);
  console.log(`Detected ${result.gapsCount} data gaps, executed ${result.acquisitionsCount} automatic acquisitions.`);
  console.log(`Generated Dataset Version V2 with hash: ${result.datasetHash}`);
  console.log('=== AGENT 2 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 2 Audit Error:', err);
  process.exit(1);
});
