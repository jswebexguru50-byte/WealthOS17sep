import { DataRichnessAcquisitionWorker } from '../../src/server/services/datarichness/DataRichnessAcquisitionWorker';

async function main() {
  console.log('=== RUNNING HISTORICAL DATA RICHNESS STEP 3: AUTOMATIC ACQUISITION PIPELINE ===');
  const worker = new DataRichnessAcquisitionWorker('reports/v674-s110');
  const res = worker.runAcquisitionPipeline();
  console.log(`Discovered ${res.gapsDiscovered} data gaps across D1-D10.`);
  console.log(`Executed 13-stage acquisition pipeline for ${res.gapsAcquired} gaps; acquired ${res.recordsAcquired} records.`);
  console.log('Saved S110_DATA_GAP_REGISTER.json, S110_ACQUISITION_AUDIT.json, and S110_SOURCE_RECONCILIATION.json.');
  console.log('=== STEP 3 COMPLETE ===');
}

main().catch((err) => {
  console.error('Acquisition error:', err);
  process.exit(1);
});
