import { S1ToS10RequirementsExtractor } from '../../src/server/services/datarichness/S1ToS10RequirementsExtractor';

async function main() {
  console.log('=== RUNNING HISTORICAL DATA RICHNESS STEP 1: S1-S10 CODE REQUIREMENT EXTRACTION ===');
  const extractor = new S1ToS10RequirementsExtractor('reports/v674-s110');
  const reqs = extractor.extractAllRequirements();
  console.log(`Successfully extracted requirements for ${Object.keys(reqs).length} strategies (S1 to S10).`);
  console.log('Saved 10 JSON specification files (S1_DATA_REQUIREMENTS.json .. S10_DATA_REQUIREMENTS.json).');
  console.log('=== STEP 1 COMPLETE ===');
}

main().catch((err) => {
  console.error('Extractor error:', err);
  process.exit(1);
});
