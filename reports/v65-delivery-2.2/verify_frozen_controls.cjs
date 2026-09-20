const crypto = require('crypto');
const fs = require('fs');

const EXPECTED_HASHES = {
  'src/server/services/PureTechnicalStrategiesEngine.ts': '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3',
  'src/server/services/StrategyParameterConfig.ts': '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B',
  'src/server/services/SignalQualityOverlay.ts': 'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452',
  'src/server/services/CapitalProtectionEngine.ts': '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753',
  'src/server/services/NewTechnicalStrategiesEngine.ts': '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354',
  'src/server/services/UpstoxIntradayIngestor.ts': '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151',
  'data/v6.3_REAL_trade_identity_ledger.jsonl': '035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485'
};

function main() {
  let output = 'Frozen Control Verification\n\n';
  let allMatched = true;
  let count = 0;

  for (const [file, expected] of Object.entries(EXPECTED_HASHES)) {
    count++;
    let actual = '';
    try {
      const buf = fs.readFileSync(file);
      actual = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    } catch (err) {
      actual = `ERROR: ${err.message}`;
    }

    const match = actual === expected;
    if (!match) allMatched = false;

    output += `${count}. ${file}\n`;
    output += `   Expected: ${expected}\n`;
    output += `   Actual:   ${actual}\n`;
    output += `   ${match ? 'MATCH' : 'MISMATCH'}\n\n`;
  }

  output += `RESULT: ${allMatched ? '7/7 MATCH' : 'MISMATCH'}\n`;
  
  fs.writeFileSync('reports/v65-delivery-2.2/FROZEN_CONTROL_VERIFICATION.txt', output);
  console.log(output);

  if (!allMatched) {
    console.error('FROZEN CONTROL MISMATCH!');
    process.exitCode = 1;
  }
}

main();
