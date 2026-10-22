import { S1101R2DownstreamChainAuditor } from '../../src/server/services/s1101r2/downstream/S1101R2DownstreamChainAuditor';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 3: COMPLETE DOWNSTREAM DECISION CHAIN AUDIT ===');
  const ledger = new S1101R2MasterLedger();
  const auditor = new S1101R2DownstreamChainAuditor('reports/v674-s1101r2', ledger);
  const result = auditor.auditDownstreamChain('CE2DD63D97003FB232B483A99614D310313A13518CD7F02E36148EAF46A57C65');

  console.log(`Audited ${result.componentsAudited.length} downstream components.`);
  console.log(`Timestamp violations: ${result.totalTimestampViolations}`);
  console.log(`Semantic distinctions pass: ${result.semanticDistinctionsPass}`);
  console.log(`Safety locks pass: ${result.safetyLocksPass}`);
  console.log('=== S1101R2 AGENT 3 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 3 Audit Error:', err);
  process.exit(1);
});
