const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const EVIDENCE_DIR = path.join(ROOT, 'evidence/market-data-certification/recovery');
const PAYLOADS_PATH = path.join(EVIDENCE_DIR, 'PHASE10R_FORENSIC_RAW_PAYLOADS.json');

function run() {
  const payloads = JSON.parse(fs.readFileSync(PAYLOADS_PATH, 'utf8'));
  const staging = {};

  for (const [recId, data] of Object.entries(payloads)) {
    if (data.raw_response_status === 400) { // INVALID_INSTRUMENT
      const isin = data.instrument_key.split('|')[1] || data.instrument_key;
      let correctedKey = data.instrument_key;
      let rationale = "";

      if (data.exchange === 'BSE') {
        correctedKey = `BSE_EQ|${isin}`;
        rationale = "BSE equities incorrectly prefixed with NSE_EQ";
      } else if (data.exchange === 'MUTUAL_FUND') {
        correctedKey = `BSE_MF|${isin}`;
        rationale = "Mutual Funds incorrectly prefixed with NSE_EQ. Testing BSE_MF fallback.";
      } else if (data.exchange === 'NSE') {
        // Leave as is, test if Upstox just doesn't support it
        correctedKey = `NSE_EQ|${isin}`;
        rationale = "NSE_EQ correctly prefixed but rejected. Likely delisted or ISIN changed.";
      }

      staging[recId] = {
        symbol: data.symbol,
        exchange: data.exchange,
        segment: data.segment,
        original_upstox_key: data.instrument_key,
        corrected_upstox_key: correctedKey,
        mapping_rationale: rationale,
        mapping_source: "Heuristic Exchange Correction",
        mapping_timestamp: new Date().toISOString(),
        validation_status: "PENDING_RETEST"
      };
    }
  }

  const outputPath = path.join(REPORTS_DIR, 'IDENTITY_MAPPING_STAGING.json');
  fs.writeFileSync(outputPath, JSON.stringify(staging, null, 2));
  console.log(`Generated ${Object.keys(staging).length} staging mappings.`);
}

run();
