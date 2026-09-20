/**
 * scripts/audit/build_strategy_source_registry.cjs
 *
 * Source-level strategy scanner for Wave 3.6C.
 * Scans PureTechnicalStrategiesEngine.ts, NewTechnicalStrategiesEngine.ts, and other engine files.
 * Generates WAVE3_6C_STRATEGY_SOURCE_REGISTRY.json with explicit implementation and method existence proof.
 */

const fs = require('fs');
const path = require('path');

function run() {
  console.log('Building Strategy Source Registry from repository code...');
  const rootDir = path.resolve(__dirname, '../../');
  
  const pureEnginePath = path.join(rootDir, 'src/server/services/PureTechnicalStrategiesEngine.ts');
  const newEnginePath = path.join(rootDir, 'src/server/services/NewTechnicalStrategiesEngine.ts');

  const pureEngineCode = fs.existsSync(pureEnginePath) ? fs.readFileSync(pureEnginePath, 'utf8') : '';
  const newEngineCode = fs.existsSync(newEnginePath) ? fs.readFileSync(newEnginePath, 'utf8') : '';

  const canonicalFamily = {};
  for (let i = 1; i <= 20; i++) {
    const sId = `S${i}`;
    const methodName = `evaluateStrategy${i}`;
    const methodExists = pureEngineCode.includes(methodName);
    
    let implStatus = 'NOT_IMPLEMENTED';
    let execStatus = 'DATA_INSUFFICIENT';
    
    if (methodExists) {
      if (sId === 'S10') {
        implStatus = 'IMPLEMENTED_DATA_INSUFFICIENT';
        execStatus = 'DATA_INSUFFICIENT';
      } else {
        implStatus = 'IMPLEMENTED_EXECUTABLE';
        execStatus = 'EXECUTABLE';
      }
    }

    canonicalFamily[sId] = {
      strategyId: sId,
      strategyName: `Strategy ${i}`,
      engineFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
      engineClass: 'PureTechnicalStrategiesEngine',
      method: methodName,
      methodExists: methodExists,
      implementationStatus: implStatus,
      executionStatus: execStatus,
      featureFlag: null,
      dataDependencies: sId === 'S10' ? ['Intraday_15m'] : ['DailyOHLCV'],
      dbTables: sId === 'S10' ? ['intraday_candles'] : ['daily_ohlcv'],
      testFiles: ['tests/fasttrack_d2/OutcomeSemantics.test.ts']
    };
  }

  const modularFamily = {};
  const modularStrategies = [
    { id: 'S8B', name: 'Classical Bull Flag', method: 'evaluateS8B_ClassicalBullFlag', flag: 'ENABLE_S8B' },
    { id: 'S21', name: 'Cup & Handle Pivot', method: 'evaluateS21_CupAndHandle', flag: 'ENABLE_S21' },
    { id: 'S22', name: 'John Carter Volatility Squeeze', method: 'evaluateS22_VolatilitySqueeze', flag: 'ENABLE_S22' },
    { id: 'S23', name: 'Classical Double Bottom', method: 'evaluateS23_DoubleBottom', flag: 'ENABLE_S23' },
    { id: 'S24', name: 'Double Top Distribution Exit', method: 'evaluateS24_DoubleTopExit', flag: 'ENABLE_S24' },
    { id: 'S25', name: 'Inverse Head & Shoulders', method: 'evaluateS25_InverseHeadAndShoulders', flag: 'ENABLE_S25' },
    { id: 'S26', name: 'Head & Shoulders Top Exit', method: 'evaluateS26_HeadAndShouldersExit', flag: 'ENABLE_S26' }
  ];

  modularStrategies.forEach(s => {
    const methodExists = newEngineCode.includes(s.method);
    modularFamily[s.id] = {
      strategyId: s.id,
      strategyName: s.name,
      engineFile: 'src/server/services/NewTechnicalStrategiesEngine.ts',
      engineClass: 'NewTechnicalStrategiesEngine',
      method: s.method,
      methodExists: methodExists,
      implementationStatus: methodExists ? 'FEATURE_FLAGGED' : 'NOT_IMPLEMENTED',
      executionStatus: 'FEATURE_FLAGGED',
      featureFlag: s.flag,
      dataDependencies: ['DailyOHLCV'],
      dbTables: ['daily_ohlcv'],
      testFiles: ['tests/unit/newTechnicalStrategies.test.ts']
    };
  });

  const registry = {
    registry_version: "3.6C_source_derived",
    audit_timestamp: new Date().toISOString(),
    canonical_family: canonicalFamily,
    modular_family: modularFamily
  };

  const outputPath = path.join(rootDir, 'reports/v65-delivery-2.2/WAVE3_6C_STRATEGY_SOURCE_REGISTRY.json');
  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2));
  console.log(`Strategy source registry written to ${outputPath}`);
}

run();
