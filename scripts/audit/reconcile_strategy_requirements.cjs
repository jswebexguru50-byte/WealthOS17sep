/**
 * scripts/audit/reconcile_strategy_requirements.cjs
 *
 * Cross-checks strategy source registry against requirements registry to catch contradictions.
 */

const fs = require('fs');
const path = require('path');

function reconcile() {
  console.log('Reconciling Strategy Registry with Requirements Registry...');
  const rootDir = path.resolve(__dirname, '../../');
  
  const strategyRegistryPath = path.join(rootDir, 'reports/v65-delivery-2.2/WAVE3_6C_STRATEGY_SOURCE_REGISTRY.json');
  const reqRegistryPath = path.join(rootDir, 'reports/v65-delivery-2.2/REQUIREMENTS_SOURCE_REGISTRY.json');

  if (!fs.existsSync(strategyRegistryPath) || !fs.existsSync(reqRegistryPath)) {
    console.error('FATAL: One or both registry files missing!');
    process.exit(1);
  }

  const stratReg = JSON.parse(fs.readFileSync(strategyRegistryPath, 'utf8'));
  const reqReg = JSON.parse(fs.readFileSync(reqRegistryPath, 'utf8'));

  let contradictions = 0;

  // Check REQ-026 (S1) through REQ-045 (S20)
  for (let i = 1; i <= 20; i++) {
    const reqId = `REQ-${String(25 + i).padStart(3, '0')}`;
    const sId = `S${i}`;
    
    const req = (reqReg.requirements || []).find(r => r.requirementId === reqId);
    const strat = stratReg.canonical_family[sId];

    if (!req) {
      console.error(`CONTRADICTION: Missing requirement ${reqId} for ${sId}`);
      contradictions++;
      continue;
    }

    if (!strat) {
      console.error(`CONTRADICTION: Missing strategy ${sId} in source registry`);
      contradictions++;
      continue;
    }

    // Check symbol existence
    if (strat.methodExists === false && req.implementationSymbols.includes(strat.method)) {
      console.error(`CONTRADICTION: Requirement ${reqId} names method ${strat.method} which does not exist in code!`);
      contradictions++;
    }
  }

  if (contradictions > 0) {
    console.error(`FAIL: ${contradictions} contradictions found during reconciliation!`);
    process.exit(1);
  }

  console.log('SUCCESS: Strategy and Requirements registries are 100% reconciled with zero contradictions!');
}

reconcile();
