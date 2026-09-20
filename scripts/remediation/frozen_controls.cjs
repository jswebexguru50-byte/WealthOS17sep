const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../');

const FROZEN_CONTROLS = [
  {
    file: 'src/server/services/PureTechnicalStrategiesEngine.ts',
    hash: '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3'
  },
  {
    file: 'src/server/services/StrategyParameterConfig.ts',
    hash: '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B'
  },
  {
    file: 'src/server/services/SignalQualityOverlay.ts',
    hash: 'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452'
  },
  {
    file: 'src/server/services/CapitalProtectionEngine.ts',
    hash: '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753'
  },
  {
    file: 'src/server/services/NewTechnicalStrategiesEngine.ts',
    hash: '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354'
  },
  {
    file: 'src/server/services/UpstoxIntradayIngestor.ts',
    hash: '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151'
  },
  {
    file: 'data/v6.3_REAL_trade_identity_ledger.jsonl',
    hash: '035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485'
  }
];

function verifyFrozenControls() {
  let allPass = true;
  const results = [];

  for (const control of FROZEN_CONTROLS) {
    const filePath = path.join(ROOT, control.file);
    if (!fs.existsSync(filePath)) {
      results.push({ file: control.file, status: 'MISSING', expected: control.hash, actual: null });
      allPass = false;
      continue;
    }

    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();

    if (hash !== control.hash) {
      results.push({ file: control.file, status: 'FAIL', expected: control.hash, actual: hash });
      allPass = false;
    } else {
      results.push({ file: control.file, status: 'PASS', expected: control.hash, actual: hash });
    }
  }

  return { allPass, results };
}

if (require.main === module) {
  const result = verifyFrozenControls();
  console.log(JSON.stringify(result, null, 2));
  if (!result.allPass) {
    console.error("FROZEN CONTROLS FAILED. STOPPING.");
    process.exit(1);
  }
}

module.exports = { verifyFrozenControls };
