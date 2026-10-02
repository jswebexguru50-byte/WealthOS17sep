import fs from 'fs';
import path from 'path';

const RUN_JSON_PATH = path.resolve('reports/fundamental-review/PILOT_RUN_001.json');
const AUTH_MD_PATH = path.resolve('reports/fundamental-review/PILOT_RUN_001_AUTHENTICITY.md');
const AUTH_JSON_PATH = path.resolve('reports/fundamental-review/PILOT_RUN_001_AUTHENTICITY.json');

function generateAuthenticity() {
  if (!fs.existsSync(RUN_JSON_PATH)) {
    console.error(`File not found: ${RUN_JSON_PATH}`);
    process.exit(1);
  }

  const runData = JSON.parse(fs.readFileSync(RUN_JSON_PATH, 'utf-8'));
  
  const authenticityClaims = runData.reviewedClaims.map((claim: any) => ({
    ...claim,
    reviewMethod: 'DEVELOPER_AUTHORED_RULE',
    reviewImplementation: 'run_pilot_calibration_run_001.ts assigned the semantic outcome using developer-authored deterministic logic without an independent LLM.'
  }));

  const authenticityRun = {
    ...runData,
    reviewedClaims: authenticityClaims
  };

  fs.writeFileSync(AUTH_JSON_PATH, JSON.stringify(authenticityRun, null, 2));

  let md = `# WealthOS PILOT_RUN_001 Review Authenticity Report\n\n`;
  md += `**Run ID:** \`${runData.runId}\`\n\n`;
  md += `This document records exactly how each of the ${authenticityClaims.length} claim outcomes in PILOT_RUN_001 was produced.\n\n`;
  md += `## Statement of Review Authenticity\n\n`;
  md += `**None of the outcomes in PILOT_RUN_001 were produced by an independent LLM interpretation review.**\n\n`;
  md += `All outcomes were produced deterministically by a developer-authored script (\`run_pilot_calibration_run_001.ts\`), which hardcoded logical rules for specific metrics (e.g., checking if growth is > 0, if margin bps change > 50, or if businessModel === 'BANK').\n\n`;

  md += `## Claim Outcomes Summary\n\n`;
  
  const byOutcome: Record<string, number> = {};
  authenticityClaims.forEach((c: any) => {
    byOutcome[c.reviewStatus] = (byOutcome[c.reviewStatus] || 0) + 1;
  });

  md += `| Outcome | Count | Method |\n`;
  md += `|---|---|---|\n`;
  for (const [outcome, count] of Object.entries(byOutcome)) {
    md += `| **${outcome}** | ${count} | DEVELOPER_AUTHORED_RULE |\n`;
  }

  md += `\n## Detailed Claim Authenticity Log\n\n`;
  
  authenticityClaims.forEach((c: any, index: number) => {
    md += `### ${index + 1}. ${c.symbol} - ${c.dimension} (${c.claimId})\n`;
    md += `- **WealthOS Claim:** ${c.wealthosInterpretation.status} - ${c.wealthosInterpretation.statement}\n`;
    md += `- **Outcome Assigned:** **${c.reviewStatus}**\n`;
    md += `- **Review Method:** \`${c.reviewMethod}\`\n`;
    md += `- **Review Implementation:** ${c.reviewImplementation}\n`;
    md += `- **Deterministic Logic Used:** ${c.reviewerExplanation}\n\n`;
  });

  fs.writeFileSync(AUTH_MD_PATH, md);
  console.log('Authenticity report generated successfully.');
}

generateAuthenticity();
