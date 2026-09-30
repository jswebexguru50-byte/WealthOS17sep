/**
 * run_walk_the_talk_reality_test.ts
 *
 * WealthOS — Walk-the-Talk Retrospective Reality Acceptance Runner
 *
 * Purely read-only execution:
 * - Retrieves candidate commitments from management_commitments in portfolio.db
 * - Verifies original source publication in source_documents
 * - Verifies subsequent reported evidence in company_facts
 * - Classifies deterministic outcomes using generic mathematical operators
 * - Writes reports/readiness/WALK_THE_TALK_REALITY_TEST.json
 * - Writes reports/readiness/WALK_THE_TALK_REALITY_TEST.md
 *
 * Zero hardcoded fixture arrays. Zero database mutations (no DELETE, INSERT, or UPDATE).
 */

import fs from 'fs';
import path from 'path';
import {
  buildWalkTheTalkRealityReport,
  type RealityTestReport,
  type VerifiedCommitment
} from './walkTheTalkRealityEngine.js';

const COMPANY_NAMES: Record<string, string> = {
  DYCL: 'Dynamic Cables Limited',
  TCS: 'Tata Consultancy Services Limited',
  RELIANCE: 'Reliance Industries Limited',
  HDFCBANK: 'HDFC Bank Limited',
  BEL: 'Bharat Electronics Limited'
};

async function main(): Promise<void> {
  console.log('[WalkTheTalkRealityTest] Starting read-only retrospective reality audit from SQLite...');

  const report: RealityTestReport = await buildWalkTheTalkRealityReport({
    symbols: ['DYCL', 'TCS', 'RELIANCE', 'HDFCBANK', 'BEL']
  });

  console.log(`[WalkTheTalkRealityTest] Retrieved and verified ${report.totalCommitments} commitments across ${report.companiesEvaluated} companies.`);
  console.log('[WalkTheTalkRealityTest] Status breakdown:', report.statusBreakdown);

  if (report.totalCommitments < 10) {
    throw new Error(`Insufficient verified commitments: expected >= 10, found ${report.totalCommitments}`);
  }
  if (report.companiesEvaluated < 5) {
    throw new Error(`Insufficient companies evaluated: expected >= 5, found ${report.companiesEvaluated}`);
  }
  if (report.pendingObservations !== 0) {
    throw new Error(`Invalid pending observations: expected 0, found ${report.pendingObservations}`);
  }

  const outDir = path.resolve('reports', 'readiness');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Write JSON report
  const jsonPath = path.join(outDir, 'WALK_THE_TALK_REALITY_TEST.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[WalkTheTalkRealityTest] Wrote ${jsonPath}`);

  // 2. Write Markdown report
  let md = `# WealthOS — Walk-the-Talk Retrospective Reality Audit\n\n`;
  md += `**Evaluation Date:** ${new Date().toISOString().split('T')[0]}  \n`;
  md += `**Evaluation Methodology:** Read-Only Retrospective Database Audit (Fail-Closed)  \n`;
  md += `**Evaluated Companies:** ${report.companyList.map((s) => `\`${s}\``).join(', ')}  \n`;
  md += `**Status Invariant:** Zero \`PENDING\` records. All candidate commitments verified against independent source documents and later company facts.  \n\n`;

  md += `### Summary Metrics\n\n`;
  md += `| Total Companies | Total Commitments | MET | PARTIALLY_MET | MISSED | NOT_MEASURABLE | PENDING |\n`;
  md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
  md += `| **${report.companiesEvaluated}** | **${report.totalCommitments}** | **${report.statusBreakdown.MET}** | **${report.statusBreakdown.PARTIALLY_MET}** | **${report.statusBreakdown.MISSED}** | **${report.statusBreakdown.NOT_MEASURABLE}** | **0** |\n\n`;

  md += `### Company-by-Company Retrospective Verification\n\n`;

  const grouped = new Map<string, VerifiedCommitment[]>();
  for (const c of report.commitments) {
    const list = grouped.get(c.symbol) || [];
    list.push(c);
    grouped.set(c.symbol, list);
  }

  for (const [sym, comms] of grouped.entries()) {
    const cName = COMPANY_NAMES[sym] || sym;
    md += `#### ${sym} — ${cName}\n\n`;
    md += `| Management Guidance | Statement Date | Metric & Target | Actual Delivered | Subsequent Evidence | Status |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :---: |\n`;

    for (const c of comms) {
      const excerptClean = c.sourceExcerpt.replace(/\|/g, '\\|');
      const targetStr = c.targetMin !== null && c.targetMax !== null
        ? `${c.targetMin} - ${c.targetMax} ${c.targetUnit || ''}`
        : `${c.targetValue !== null ? c.targetValue : ''} ${c.targetUnit || ''}`;
      const actualStr = `${c.actualValue} ${c.targetUnit || ''}`;
      const badge =
        c.status === 'MET'
          ? '✅ **MET**'
          : c.status === 'PARTIALLY_MET'
          ? '⚠️ **PARTIALLY_MET**'
          : c.status === 'MISSED'
          ? '❌ **MISSED**'
          : '⚪ **NOT_MEASURABLE**';

      md += `| "${excerptClean}"<br>*(${c.speaker})* | ${c.statementDate} | **${c.metricKey}**: ${targetStr}<br>*(Period: ${c.targetPeriodEnd})* | **${actualStr}** | *Doc:* \`${c.evidenceDocumentId}\`<br>*(Date: ${c.evidenceDate})* | ${badge} |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `### Verification & Integrity Invariants\n\n`;
  md += `1. **Read-Only Database Audit:** Engine executes zero mutations (` + '`DELETE`' + `, ` + '`INSERT`' + `, ` + '`UPDATE`' + `); all data read from ` + '`management_commitments`' + `, ` + '`source_documents`' + `, and ` + '`company_facts`' + `.\n`;
  md += `2. **Dual-Proof Verification:** Every commitment has both an authentic source document (with publication date and excerpt) and a subsequent statutory evidence document.\n`;
  md += `3. **Mathematical Classification:** Outcomes derived deterministically using generic operator rules (` + '`GTE`' + `, ` + '`LTE`' + `, ` + '`RANGE`' + `, ` + '`APPROX`' + `, ` + '`EVENT_BY_DATE`' + `) with standard 90% threshold for partial fulfillment.\n`;

  const mdPath = path.join(outDir, 'WALK_THE_TALK_REALITY_TEST.md');
  fs.writeFileSync(mdPath, md, 'utf-8');
  console.log(`[WalkTheTalkRealityTest] Wrote ${mdPath}`);

  console.log('[WalkTheTalkRealityTest] Retrospective reality test completed successfully.');
}

main().catch((err) => {
  console.error('[WalkTheTalkRealityTest] Execution failed:', err);
  process.exit(1);
});
