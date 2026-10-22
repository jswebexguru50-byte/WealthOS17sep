import fs from 'fs';
import path from 'path';
import { FundamentalReviewPackageBuilder } from '../../src/mcp/fundamentalCalibration/fundamentalReviewPackageBuilder.js';
import { DeterministicVerifiers } from '../../src/mcp/fundamentalCalibration/deterministicVerifiers.js';

const PILOT_COHORT = [
  { symbol: 'TCS', companyName: 'Tata Consultancy Services Limited', sector: 'Technology', capCategory: 'Large Cap' },
  { symbol: 'INFY', companyName: 'Infosys Limited', sector: 'Technology', capCategory: 'Large Cap' },
  { symbol: 'BAJFINANCE', companyName: 'Bajaj Finance Limited', sector: 'Financial Services', capCategory: 'Large Cap' },
  { symbol: 'HDFCBANK', companyName: 'HDFC Bank Limited', sector: 'Financial Services', capCategory: 'Large Cap' },
  { symbol: 'RELIANCE', companyName: 'Reliance Industries Limited', sector: 'Energy', capCategory: 'Large Cap' },
  { symbol: 'TATAMOTORS', companyName: 'Tata Motors Limited', sector: 'Consumer Cyclical', capCategory: 'Large Cap' },
  { symbol: 'TATASTEEL', companyName: 'Tata Steel Limited', sector: 'Basic Materials', capCategory: 'Large Cap' },
  { symbol: 'SUNPHARMA', companyName: 'Sun Pharmaceutical Industries Limited', sector: 'Healthcare', capCategory: 'Large Cap' },
  { symbol: 'TITAN', companyName: 'Titan Company Limited', sector: 'Consumer Cyclical', capCategory: 'Large Cap' },
  { symbol: 'LTIM', companyName: 'LTIMindtree Limited', sector: 'Technology', capCategory: 'Large Cap' },
  { symbol: 'LT', companyName: 'Larsen & Toubro Limited', sector: 'Industrials', capCategory: 'Large Cap' },
  { symbol: 'ASTRAL', companyName: 'Astral Limited', sector: 'Industrials', capCategory: 'Mid Cap' },
  { symbol: 'POLYCAB', companyName: 'Polycab India Limited', sector: 'Industrials', capCategory: 'Large/Mid Cap' },
  { symbol: 'DEEPAKNTR', companyName: 'Deepak Nitrite Limited', sector: 'Basic Materials', capCategory: 'Mid Cap' },
  { symbol: 'PIDILITIND', companyName: 'Pidilite Industries Limited', sector: 'Basic Materials', capCategory: 'Large Cap' },
  { symbol: 'AAVAS', companyName: 'Aavas Financiers Limited', sector: 'Financial Services', capCategory: 'Mid/Small Cap' },
  { symbol: 'CLEAN', companyName: 'Clean Science and Technology Limited', sector: 'Basic Materials', capCategory: 'Mid/Small Cap' },
  { symbol: 'RAMCOIND', companyName: 'Ramco Industries Limited', sector: 'Industrials', capCategory: 'Small Cap' },
  { symbol: 'DYCL', companyName: 'Dynamic Cables Limited', sector: 'Industrials', capCategory: 'Small Cap' },
  { symbol: 'STYL', companyName: 'Seshaasai Technologies Limited', sector: 'Technology', capCategory: 'Small Cap' }
];

async function prepareInputs() {
  console.log('Generating PILOT_RUN_002 Inputs...');
  const OUTPUT_DIR = path.resolve('reports/fundamental-review/PILOT_RUN_002_INPUTS');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let totalClaims = 0;

  for (const company of PILOT_COHORT) {
    console.log(`Processing ${company.symbol}...`);
    const pkg = await FundamentalReviewPackageBuilder.buildReviewPackage(company.symbol);

    // Filter to only legitimately available information
    const frozenPackage = {
      PRODUCTION_STATE: "POST_REMEDIATION_EXPERIMENT",
      companyIdentity: pkg.identity,
      periodContext: pkg.periodContext,
      canonicalFinancialFacts: pkg.financialFacts,
      derivedMetrics: pkg.derivedMetrics.map(d => {
        let verifyStatus = 'NOT_VERIFIABLE';
        if (d.verificationStatus === 'MATCH') verifyStatus = 'VERIFIED';
        if (d.verificationStatus === 'MISMATCH') verifyStatus = 'MISMATCH';
        return {
          metric: d.metric,
          value: d.value,
          unit: d.unit,
          formula: d.formula,
          periodsCompared: d.periodsCompared,
          verificationStatus: verifyStatus,
          independentValue: d.independentValue,
          discrepancyNotes: d.discrepancyNotes
        };
      }),
      evidenceProvenance: pkg.evidenceManifest,
      missingData: pkg.missingData,
      wealthosInterpretations: pkg.interpretations.map(claim => ({
        claimId: claim.claimId,
        module: claim.module,
        dimension: claim.dimension,
        claimStatement: claim.claimStatement,
        wealthosStatus: claim.wealthosStatus,
        underlyingMetricValues: claim.underlyingMetricValues
      }))
    };

    totalClaims += frozenPackage.wealthosInterpretations.length;

    const outPath = path.join(OUTPUT_DIR, `${company.symbol}_INPUT.json`);
    fs.writeFileSync(outPath, JSON.stringify(frozenPackage, null, 2));
  }

  console.log(`\nInput preparation complete. Evaluated 20 companies, expanded to ${totalClaims} material claims.`);
  console.log(`Saved frozen packages to ${OUTPUT_DIR}`);
}

prepareInputs().catch(console.error);
