import fs from 'fs';
import path from 'path';

const BASE = 'data/phase2_cohort';
const SYMBOLS = ['SOLARINDS','ARVSMART','NOVARTIND','BAJAJHLDNG','UNOMINDA','VMART','TATATECH','HINDCOPPER','SCI','BOROLTD','PURVA','STLNETWORK','SENCO','GMDCLTD','360ONE','MANORAMA','IKIO','THOMASCOOK','RPGLIFE','KAVVERITEL'];

// ISSUE 2: Credibility narrative vs grade mismatch
console.log('=== ISSUE 2: CREDIBILITY GRADE vs EXECUTIVE NARRATIVE ===');
let issue2Mismatches: string[] = [];
SYMBOLS.forEach(sym => {
  const brief = JSON.parse(fs.readFileSync(path.join(BASE, sym, 'investment-brief.json'), 'utf8'));
  const grade = brief.decisionState.managementCredibility;
  const summary: string = brief.executiveAssessment?.oneLineSummary || brief.decisionState?.interpretation || '';
  const hasOverconfidentClaim = /(credible execution|credible management|proven track record|credible track record)/i.test(summary);
  const isInsufficient = grade === 'INSUFFICIENT_HISTORY';
  if (isInsufficient && hasOverconfidentClaim) {
    issue2Mismatches.push(sym);
    console.log('MISMATCH ' + sym + ': grade=' + grade);
    console.log('  narrative: ' + summary.substring(0, 150));
  } else {
    console.log('OK       ' + sym + ': grade=' + grade);
  }
});
console.log('');
console.log('Narrative mismatches: ' + (issue2Mismatches.length === 0 ? 'NONE' : issue2Mismatches.join(', ')));
console.log('');

// ISSUE 4: SOLARINDS temporal & metric mismatch
console.log('=== ISSUE 4: SOLARINDS TEMPORAL & METRIC CONSISTENCY ===');
const solarClaims = JSON.parse(fs.readFileSync(path.join(BASE, 'SOLARINDS', 'claims.json'), 'utf8'));
const solarEvidence = JSON.parse(fs.readFileSync(path.join(BASE, 'SOLARINDS', 'evidence.json'), 'utf8'));
solarClaims.forEach((c: any) => {
  const evalDate = new Date(c.evaluationDate);
  const periodEnd = new Date(c.expectedPeriodEnd);
  const temporalOk = evalDate >= periodEnd;
  console.log('Claim: ' + c.claimId);
  console.log('  Statement:        ' + c.statement);
  console.log('  Target metric:    ' + c.targetMetric + ' >= ' + c.expectedValue);
  console.log('  Promised period:  ' + c.period + ' (ends ' + c.expectedPeriodEnd + ')');
  console.log('  Evaluation date:  ' + c.evaluationDate);
  console.log('  Actual disclosed: ' + c.actualOutcomeMetric + ' — ' + c.actualOutcomeDescription);
  console.log('  Status:           ' + c.status);
  console.log('  Temporal check (evalDate >= periodEnd): ' + (temporalOk ? 'OK (' + c.evaluationDate + ' >= ' + c.expectedPeriodEnd + ')' : 'VIOLATION'));
  // Check if the metric used in evidence matches what was claimed
  const evalEvidence = solarEvidence.find((e: any) => e.evidenceId === c.evaluationEvidenceId);
  if (evalEvidence) {
    console.log('  Eval evidence quote: ' + (evalEvidence.quotedText || evalEvidence.verbatimQuote));
  }
  console.log('');
});

// ISSUE 5: Breaker threshold inventory
console.log('=== ISSUE 5: BREAKER THRESHOLD INVENTORY (all 20 companies) ===');
SYMBOLS.forEach(sym => {
  const breakers = JSON.parse(fs.readFileSync(path.join(BASE, sym, 'breaker-evaluation.json'), 'utf8'));
  breakers.forEach((b: any) => {
    const cond = b.conditionText || (b.quantitativeCondition ? (b.quantitativeCondition.metric + ' ' + b.quantitativeCondition.operator + ' ' + b.quantitativeCondition.threshold) : 'N/A');
    console.log(sym + ' | ' + b.breakerId + ' | condition: ' + cond + ' | observed: ' + b.currentObservedValue + ' | status: ' + b.status);
  });
});

// ISSUE 6: HINDCOPPER breaker observed value
console.log('');
console.log('=== ISSUE 6: HINDCOPPER BREAKER VALUE ===');
const hcBreakers = JSON.parse(fs.readFileSync(path.join(BASE, 'HINDCOPPER', 'breaker-evaluation.json'), 'utf8'));
hcBreakers.forEach((b: any) => {
  console.log('Breaker: ' + b.breakerId + ' | observed: ' + b.currentObservedValue + ' | status: ' + b.status + ' | rationale: ' + b.rationale);
});
const hcClaims = JSON.parse(fs.readFileSync(path.join(BASE, 'HINDCOPPER', 'claims.json'), 'utf8'));
console.log('Claims:');
hcClaims.forEach((c: any) => {
  console.log('  ' + c.claimId + ': expected=' + c.expectedValue + ' actual=' + c.actualOutcomeMetric + ' status=' + c.status);
});
