/**
 * pipeline/apply_human_validated_migrations.cjs
 *
 * Promotes exclusively human-validated assertions to serving tables
 * strictly through pipeline/quality-gate.cjs (Constitution Rule 5).
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { persistThroughQualityGate } = require('./quality-gate.cjs');

const dbPath = path.resolve(__dirname, '..', 'portfolio.db');
const humanReviewPath = path.resolve(__dirname, '..', 'scratch', 'human_reading_mda_inspection.md');

// Verify human sign-off exists
if (!fs.existsSync(humanReviewPath)) {
  console.error('[ABORT] Human review file does not exist.');
  process.exit(1);
}

const humanReviewContent = fs.readFileSync(humanReviewPath, 'utf8');

// Ensure all 3 scrips have [X] PASS
const scrips = ['360ONE', '63MOONS', 'A2ZINFRA'];
for (const s of scrips) {
  const sectionIdx = humanReviewContent.indexOf(s);
  if (sectionIdx === -1) {
    console.error(`[ABORT] Scrip ${s} not found in human review document.`);
    process.exit(1);
  }
  const chunk = humanReviewContent.slice(sectionIdx, sectionIdx + 3500);
  if (!chunk.includes('[X] PASS')) {
    console.error(`[ABORT] Scrip ${s} does not have [X] PASS in human review document.`);
    process.exit(1);
  }
}

console.log('[OK] Verified human PASS sign-off for all 3 genuine MD&A candidates.');

const assertions = [
  {
    assertionId: '360ONE:managementOutlook:1742299200',
    scripId: '360ONE',
    field: 'managementOutlook',
    value: "In 2023, India’s economy was on an upward trajectory, closing the year with a GDP of USD 3.73 Trn and a GDP per capita of USD 2,610, outpacing the global average growth rate of 3.2%1. The key factors driving this growth include inflation management, investment, and sectoral performance. The manufacturing sector saw robust growth, aided by initiatives like the Production-Linked Incentive (PLI) scheme.",
    status: 'VERIFIED',
    evidenceIds: ['360ONE:fc9ff43c-5469-4fd3-bde7-6da744f2ea5e:p114'],
    confidence: 0.70,
    sourceCount: 1,
    extractionMethod: 'LLM',
    methodologyVersion: 'mda-extractor-v1.0.0',
    createdAt: new Date().toISOString()
  },
  {
    assertionId: '63MOONS:managementOutlook:1742299201',
    scripId: '63MOONS',
    field: 'managementOutlook',
    value: "The Reserve Bank of India (RBI), in its recent monetary policy, has projected real GDP growth for FY24 at 7.6% and FY25 at 7.0%, based on strengthening of rural demand, improving employment conditions, moderating inflationary pressures and sustained momentum in manufacturing and services sector. Going forward, these factors are expected to boost private consumption in the urban and rural areas.",
    status: 'VERIFIED',
    evidenceIds: ['63MOONS:1cc146de-cf24-484e-8664-e0b64f38ff88:p48'],
    confidence: 0.70,
    sourceCount: 1,
    extractionMethod: 'LLM',
    methodologyVersion: 'mda-extractor-v1.0.0',
    createdAt: new Date().toISOString()
  },
  {
    assertionId: 'A2ZINFRA:managementOutlook:1742299202',
    scripId: 'A2ZINFRA',
    field: 'managementOutlook',
    value: "Both Emerging Markets and Developing Economies (EMDEs) and the Advanced Economies (AEs) achieved higher growth in year 2023. EMDEs maintained steady growth, at a growth rate of 4.3% in 2023, which was up from 4.0% in the year 2022. The EMDEs are projected to sustain a growth rate of 4.2% for both the years 2024 as well as 2025.",
    status: 'VERIFIED',
    evidenceIds: ['A2ZINFRA:cd0097e8-5be2-4369-8b03-608eb33aa796:p38'],
    confidence: 0.70,
    sourceCount: 1,
    extractionMethod: 'LLM',
    methodologyVersion: 'mda-extractor-v1.0.0',
    createdAt: new Date().toISOString()
  }
];

const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }

  try {
    console.log('Routing assertions through quality-gate.cjs chokepoint...');
    const result = await persistThroughQualityGate(db, assertions);
    console.log(`[SUCCESS] Passed quality gate: ${result.passedCount}, Quarantined: ${result.quarantinedCount}`);
    
    // Check serving table updates
    db.all(
      `SELECT symbol, full_dossier_json FROM SecurityDossierSnapshots WHERE symbol IN ('360ONE', '63MOONS', 'A2ZINFRA')`,
      (qErr, rows) => {
        if (qErr) throw qErr;
        console.log('\n--- Serving Table Promotion Status ---');
        for (const r of rows) {
          const fd = JSON.parse(r.full_dossier_json);
          console.log(`Scrip: ${r.symbol} | Tier: ${fd.operationalMoat?.qualitativeTier} | BackedFields: ${JSON.stringify(fd.operationalMoat?.evidenceBackedFields)}`);
        }
        db.close();
      }
    );
  } catch (gateErr) {
    console.error('[GATE ERROR]', gateErr);
    db.close();
    process.exit(1);
  }
});
