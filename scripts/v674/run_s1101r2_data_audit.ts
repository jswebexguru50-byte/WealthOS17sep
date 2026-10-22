import { S1101R2DataTruthAuditor } from '../../src/server/services/s1101r2/data/S1101R2DataTruthAuditor';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 2: DATA TRUTH, PIT & AUTOMATIC ENRICHMENT AUDIT ===');
  const ledger = new S1101R2MasterLedger();
  const auditor = new S1101R2DataTruthAuditor('reports/v674-s1101r2', ledger);
  const result = auditor.runDataAudit();

  console.log(`Audited ${result.domainsAudited.length} canonical data domains.`);
  console.log(`Detected ${result.gapsCount} gaps, executed ${result.acquisitionsCount} acquisitions.`);
  console.log(`Generated Dataset Version V2 Hash: ${result.datasetHash}`);
  console.log('=== S1101R2 AGENT 2 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 2 Audit Error:', err);
  process.exit(1);
});
