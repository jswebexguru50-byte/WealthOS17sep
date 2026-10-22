import { FundamentalCalibrationAdapter } from '../../src/mcp/adapters/fundamentalCalibrationAdapter.js';

async function runBlindnessVerification() {
  const symbols = ['TCS', 'HDFCBANK', 'DYCL', 'AAVAS'];
  const forbiddenSubstrings = [
    'PILOT_RUN_001',
    'PILOT_RUN_002',
    'developerVerdict',
    'defectCluster',
    'proposedRemediation',
    'expectedAnswer',
    'candidateThreshold'
  ];

  console.log('======================================================================');
  console.log('FUNDAMENTAL REVIEW BLINDNESS VERIFICATION (Section 9)');
  console.log('======================================================================');

  let allPassed = true;

  for (const sym of symbols) {
    console.log(`\nEvaluating Blind Inputs for Symbol: ${sym}...`);
    const pkg = await FundamentalCalibrationAdapter.getReviewInputs(sym);

    // Verify required elements exist
    const hasIdentity = !!(pkg.identity && pkg.identity.symbol && pkg.identity.companyName);
    const hasSectorIndustry = !!(pkg.identity && (pkg.identity.sector !== undefined) && (pkg.identity.industry !== undefined));
    const hasBusinessModel = !!(pkg.identity && pkg.identity.businessModel);
    const hasPeriodContext = !!(pkg.periodContext && Array.isArray(pkg.periodContext.periodsAvailable));
    const hasFacts = Array.isArray(pkg.financialFacts);
    const hasDerived = Array.isArray(pkg.derivedMetrics);
    const hasArithmeticVerification = pkg.derivedMetrics.length > 0 ? pkg.derivedMetrics.every(d => d.formula && d.verificationStatus) : true;
    const hasInterpretations = Array.isArray(pkg.interpretations);
    const hasEvidence = Array.isArray(pkg.evidenceManifest);
    const hasMissingness = Array.isArray(pkg.missingData);

    console.log(`  - Identity: ${hasIdentity ? 'PASS' : 'FAIL'} (${pkg.identity?.companyName})`);
    console.log(`  - Sector/Industry: ${hasSectorIndustry ? 'PASS' : 'FAIL'} (${pkg.identity?.sector} / ${pkg.identity?.industry})`);
    console.log(`  - Business Model: ${hasBusinessModel ? 'PASS' : 'FAIL'} (${pkg.identity?.businessModel})`);
    console.log(`  - Period Context: ${hasPeriodContext ? 'PASS' : 'FAIL'} (${pkg.periodContext?.periodsAvailable?.length || 0} periods)`);
    console.log(`  - Financial Facts: ${hasFacts ? 'PASS' : 'FAIL'} (${pkg.financialFacts.length} facts)`);
    console.log(`  - Derived Metrics: ${hasDerived ? 'PASS' : 'FAIL'} (${pkg.derivedMetrics.length} metrics)`);
    console.log(`  - Arithmetic Verification: ${hasArithmeticVerification ? 'PASS' : 'FAIL'}`);
    console.log(`  - WealthOS Interpretations: ${hasInterpretations ? 'PASS' : 'FAIL'} (${pkg.interpretations.length} claims)`);
    console.log(`  - Evidence Manifest: ${hasEvidence ? 'PASS' : 'FAIL'} (${pkg.evidenceManifest.length} items)`);
    console.log(`  - Missingness List: ${hasMissingness ? 'PASS' : 'FAIL'} (${pkg.missingData.length} entries)`);

    const jsonStr = JSON.stringify(pkg);
    const foundForbidden: string[] = [];
    for (const forbidden of forbiddenSubstrings) {
      if (jsonStr.includes(forbidden)) {
        foundForbidden.push(forbidden);
      }
    }

    if (foundForbidden.length > 0) {
      console.error(`  - BLINDNESS CHECK: FAIL! Leaked forbidden fields: ${foundForbidden.join(', ')}`);
      allPassed = false;
    } else {
      console.log(`  - BLINDNESS CHECK: PASS (No pilot verdicts, developer verdicts, clusters, or threshold hints)`);
    }

    if (!hasIdentity || !hasSectorIndustry || !hasBusinessModel || !hasFacts || !hasInterpretations) {
      allPassed = false;
    }
  }

  console.log('\n======================================================================');
  if (allPassed) {
    console.log('FUNDAMENTAL_REVIEW_BLINDNESS = PASS (All 4 symbols verified)');
  } else {
    console.error('FUNDAMENTAL_REVIEW_BLINDNESS = FAIL');
    process.exit(1);
  }
  console.log('======================================================================');
}

runBlindnessVerification().catch(err => {
  console.error('Error running blindness verification:', err);
  process.exit(1);
});
