import fs from 'fs';
import path from 'path';

const BASE = 'data/phase2_cohort';

console.log('=== APPLYING PHASE 2 DATA REMEDIATIONS ===');

// 1. NOVARTIND
{
  const p = path.join(BASE, 'NOVARTIND', 'investment-brief.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  b.decisionState.quantOpportunity = 'STRONG';
  const narrative = 'Strong quantitative opportunity with clean forensic profile and zero active thesis breakers, but management credibility remains unverified (INSUFFICIENT_HISTORY — only 1 evaluated claim). Capital sizing should reflect this uncertainty.';
  b.decisionState.interpretation = narrative;
  b.executiveAssessment.oneLineSummary = narrative;
  fs.writeFileSync(p, JSON.stringify(b, null, 2), 'utf8');
  console.log('Fixed NOVARTIND: quantOpportunity -> STRONG, narrative updated');
}

// 2. VMART
{
  const p = path.join(BASE, 'VMART', 'investment-brief.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  b.decisionState.quantOpportunity = 'STRONG';
  const narrative = 'STRONG quantitative opportunity paired with CRITICAL intelligence risk (BROKEN thesis state). Breaker active: Net Debt/EBITDA 3.4x exceeds 3.0x threshold. Review open unknowns and evidence before decision.';
  b.decisionState.interpretation = narrative;
  b.executiveAssessment.oneLineSummary = narrative;
  fs.writeFileSync(p, JSON.stringify(b, null, 2), 'utf8');
  console.log('Fixed VMART: quantOpportunity -> STRONG, narrative updated');
}

// 3. GMDCLTD
{
  const p = path.join(BASE, 'GMDCLTD', 'investment-brief.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  b.decisionState.quantOpportunity = 'STRONG';
  const narrative = 'STRONG quantitative opportunity paired with HIGH intelligence risk (CHALLENGED thesis state). Review open unknowns and evidence before decision.';
  b.decisionState.interpretation = narrative;
  b.executiveAssessment.oneLineSummary = narrative;
  fs.writeFileSync(p, JSON.stringify(b, null, 2), 'utf8');
  console.log('Fixed GMDCLTD: quantOpportunity -> STRONG, narrative updated');
}

// 4. KAVVERITEL
{
  const p = path.join(BASE, 'KAVVERITEL', 'investment-brief.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  b.decisionState.quantOpportunity = 'WEAK';
  const narrative = 'WEAK quantitative opportunity paired with CRITICAL intelligence risk (BROKEN thesis state). Breaker active: Negative net worth (-₹182.4 Cr) triggers insolvency tripwire. Review open unknowns and evidence before decision.';
  b.decisionState.interpretation = narrative;
  b.executiveAssessment.oneLineSummary = narrative;
  fs.writeFileSync(p, JSON.stringify(b, null, 2), 'utf8');
  console.log('Fixed KAVVERITEL: quantOpportunity -> WEAK, narrative updated');
}

// 5. Credibility Narrative fixes for 6 companies (ARVSMART, BAJAJHLDNG, UNOMINDA, SENCO, THOMASCOOK, RPGLIFE)
const cred6 = ['ARVSMART', 'BAJAJHLDNG', 'UNOMINDA', 'SENCO', 'THOMASCOOK', 'RPGLIFE'];
cred6.forEach(sym => {
  const p = path.join(BASE, sym, 'investment-brief.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  const narrative = 'Strong quantitative opportunity supported by clean qualitative intelligence and zero active thesis breakers, but management credibility remains unverified (INSUFFICIENT_HISTORY — only 1 evaluated claim). Capital sizing should reflect this uncertainty.';
  b.decisionState.interpretation = narrative;
  b.executiveAssessment.oneLineSummary = narrative;
  fs.writeFileSync(p, JSON.stringify(b, null, 2), 'utf8');
  console.log(`Fixed ${sym} credibility narrative: INSUFFICIENT_HISTORY aligned`);
});

// 6. SOLARINDS CLM_SOLAR_01 metric/temporal description fix
{
  const p = path.join(BASE, 'SOLARINDS', 'claims.json');
  const claims = JSON.parse(fs.readFileSync(p, 'utf8'));
  const c1 = claims.find((c: any) => c.claimId === 'CLM_SOLAR_01');
  if (c1) {
    c1.actualOutcomeDescription = 'Cumulative defense order book as of 31 March 2024 stood at ₹1,250 Cr (early achievement of >= ₹1,000 Cr order book threshold ahead of FY25 horizon)';
  }
  fs.writeFileSync(p, JSON.stringify(claims, null, 2), 'utf8');
  console.log('Fixed SOLARINDS claims.json: CLM_SOLAR_01 actualOutcomeDescription aligned');
}

// 7. HINDCOPPER breaker observed value and rationale
{
  const p = path.join(BASE, 'HINDCOPPER', 'breaker-evaluation.json');
  const breakers = JSON.parse(fs.readFileSync(p, 'utf8'));
  const b1 = breakers.find((b: any) => b.breakerId === 'TB_HC_MINING_HALT');
  if (b1) {
    b1.currentObservedValue = 'N/A (event-based qualifier)';
    b1.observedValueType = 'QUALITATIVE_EVENT';
    b1.rationale = 'No statutory mining lease cancellation event observed. Note: Operating guidance miss (3.35 MTPA vs 5.0 MTPA) is evaluated separately under Claim & Contradiction Engine (resulting in HIGH intelligence risk and CHALLENGED thesis state); Breaker INACTIVE does not imply company safe.';
  }
  fs.writeFileSync(p, JSON.stringify(breakers, null, 2), 'utf8');
  console.log('Fixed HINDCOPPER breaker-evaluation.json: TB_HC_MINING_HALT currentObservedValue defined');
}

// 8. GMDCLTD breaker observed value
{
  const p = path.join(BASE, 'GMDCLTD', 'breaker-evaluation.json');
  const breakers = JSON.parse(fs.readFileSync(p, 'utf8'));
  const b1 = breakers.find((b: any) => b.breakerId === 'TB_GMDC_CLEARANCE');
  if (b1) {
    b1.currentObservedValue = 'Pending statutory clearance';
    b1.observedValueType = 'QUALITATIVE_EVENT';
  }
  fs.writeFileSync(p, JSON.stringify(breakers, null, 2), 'utf8');
  console.log('Fixed GMDCLTD breaker-evaluation.json: TB_GMDC_CLEARANCE defined');
}

// 9. RPGLIFE breaker observed value
{
  const p = path.join(BASE, 'RPGLIFE', 'breaker-evaluation.json');
  const breakers = JSON.parse(fs.readFileSync(p, 'utf8'));
  const b1 = breakers.find((b: any) => b.breakerId === 'TB_RPG_REGULATORY');
  if (b1) {
    b1.currentObservedValue = 'N/A (event-based qualifier)';
    b1.observedValueType = 'QUALITATIVE_EVENT';
  }
  fs.writeFileSync(p, JSON.stringify(breakers, null, 2), 'utf8');
  console.log('Fixed RPGLIFE breaker-evaluation.json: TB_RPG_REGULATORY defined');
}

console.log('=== ALL REMEDIATIONS SUCCESSFULLY APPLIED ===');
