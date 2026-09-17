import fs from 'fs';
import path from 'path';

const BASE = 'data/phase2_cohort';
const SYMBOLS = [
  'SOLARINDS','ARVSMART','NOVARTIND','BAJAJHLDNG','UNOMINDA',
  'VMART','TATATECH','HINDCOPPER','SCI','BOROLTD',
  'PURVA','STLNETWORK','SENCO','GMDCLTD','360ONE',
  'MANORAMA','IKIO','THOMASCOOK','RPGLIFE','KAVVERITEL'
];

console.log('=== QUANTITATIVE OPPORTUNITY VS ITAS SCORE AUDIT ===');
SYMBOLS.forEach(sym => {
  const brief = JSON.parse(fs.readFileSync(path.join(BASE, sym, 'investment-brief.json'), 'utf8'));
  const itas = JSON.parse(fs.readFileSync(path.join(BASE, sym, 'itas-input.json'), 'utf8'));
  const score = itas.signalStrength !== undefined ? itas.signalStrength : (itas.compositeScore !== undefined ? itas.compositeScore : (itas.score !== undefined ? itas.score : brief.decisionState.itasScore));
  const reported = brief.decisionState.quantOpportunity;
  let expected = 'NONE';
  if (score >= 75) expected = 'STRONG';
  else if (score >= 50) expected = 'MODERATE';
  else if (score >= 25) expected = 'WEAK';
  else expected = 'NONE';
  const match = reported === expected;
  console.log(`${sym.padEnd(12)} | Score: ${String(score).padEnd(4)} | Reported: ${reported.padEnd(10)} | Expected: ${expected.padEnd(10)} | ${match ? 'MATCH' : 'MISMATCH'}`);
});
