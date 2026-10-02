/**
 * CLI Entry point for Gate 29: Final Independent Product Reality Challenge
 */
import { runIndependentRealityChallenge } from './independent_challenge/run_challenge.js';

async function main() {
  try {
    const report = await runIndependentRealityChallenge();
    console.log(`\n[Gate 29 Complete] Final Status: ${report.overallStatus}`);
    process.exit(0);
  } catch (err: any) {
    console.error('[Gate 29 Error]', err);
    process.exit(1);
  }
}

main();
