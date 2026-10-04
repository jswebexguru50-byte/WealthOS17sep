import { CompanyIntelligenceOrchestrator } from '../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';

async function testCompanyIntelligence() {
  console.log('--- Calling CompanyIntelligenceOrchestrator for TCS ---');
  try {
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
    const result = await orchestrator.orchestrate('TCS', null, false);
    console.log('Result keys:', Object.keys(result || {}));
    console.log('Summary:', JSON.stringify(result?.summary || {}, null, 2));
    console.log('Fundamental Section:', JSON.stringify(result?.fundamentals || result?.fundamental || {}, null, 2));
    console.log('Valuation Section:', JSON.stringify(result?.valuation || {}, null, 2));
    console.log('QGLP Section:', JSON.stringify(result?.qglp || {}, null, 2));
  } catch (err: any) {
    console.error('CompanyIntelligenceOrchestrator error:', err.message, err.stack);
  }
}

testCompanyIntelligence().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
