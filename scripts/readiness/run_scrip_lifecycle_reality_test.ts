/**
 * run_scrip_lifecycle_reality_test.ts
 *
 * Direct entrypoint to execute the WealthOS V2 Full Scrip Lifecycle E2E Reality Test.
 */

import { runScripLifecycleSuite } from './scrip_lifecycle/coordinator.js';

runScripLifecycleSuite()
  .then((artifact) => {
    console.log(`[LifecycleRunner] Finished execution. Overall Acceptance: ${artifact.overallAcceptance}`);
    process.exit(artifact.overallAcceptance ? 0 : 1);
  })
  .catch((err) => {
    console.error('[LifecycleRunner] Execution failure:', err);
    process.exit(1);
  });
