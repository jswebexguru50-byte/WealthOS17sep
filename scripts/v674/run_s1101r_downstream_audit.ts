import { S1101RDownstreamChainAuditor } from '../../src/server/services/s1101r/downstream/S1101RDownstreamChainAuditor';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 3: COMPLETE DOWNSTREAM DECISION CHAIN AUDIT ===');
  const ledger = new S1101RMasterLedger();
  const auditor = new S1101RDownstreamChainAuditor('reports/v674-s1101r', ledger);
  const result = auditor.auditDownstreamChain('E95606FFA5D47B3CB56B9DBDDC1FADF02111B46C1A42E798A93DF34AFDC2840A');

  console.log(`Audited ${result.componentsAudited.length} downstream components.`);
  console.log(`Timestamp violations: ${result.totalTimestampViolations}`);
  console.log(`Semantic distinctions pass: ${result.semanticDistinctionsPass}`);
  console.log(`Safety locks pass: ${result.safetyLocksPass}`);
  console.log('=== AGENT 3 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 3 Audit Error:', err);
  process.exit(1);
});
