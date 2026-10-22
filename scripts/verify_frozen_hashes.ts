import fs from 'fs';
import crypto from 'crypto';

const frozen = [
  { path: 'src/server/services/PureTechnicalStrategiesEngine.ts', expected: '825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3' },
  { path: 'src/server/services/StrategyParameterConfig.ts', expected: '901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b' },
  { path: 'src/server/services/SignalQualityOverlay.ts', expected: 'c41cddb152c150bea932a8b9bd8fcc6ea01a03a2ba030a723789aaada5c17452' },
  { path: 'src/server/services/CapitalProtectionEngine.ts', expected: '63b8317889f5a60e9462f883e89acb57fe99e819935ec8f7b30036ecfe4ed753' },
  { path: 'src/server/services/NewTechnicalStrategiesEngine.ts', expected: '78415ba3c74ca6a9cc2fcc96d2e54ba871e9bca73fc6e078570c412781b1d354' },
  { path: 'src/server/services/UpstoxIntradayIngestor.ts', expected: '0f1c96d0e0c704672517f378990e17facdced7bfbf359daf9c6f37333be1b151' },
  { path: 'data/v6.3_REAL_trade_identity_ledger.jsonl', expected: '035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485' }
];

console.log('--- VERIFYING 7 FROZEN CONTROL PATH FILES ---');
let allMatch = true;
for (const f of frozen) {
  if (!fs.existsSync(f.path)) {
    console.error('MISSING:', f.path);
    allMatch = false;
    continue;
  }
  const content = fs.readFileSync(f.path);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const match = hash === f.expected;
  console.log(match ? '[LOCKED]' : '[TAMPERED]', f.path);
  if (!match) {
    console.error('  Expected:', f.expected);
    console.error('  Actual:  ', hash);
    allMatch = false;
  }
}
console.log('RESULT:', allMatch ? '100% IMMUTABILITY PRESERVED' : 'TAMPERING DETECTED');
if (!allMatch) process.exit(1);
