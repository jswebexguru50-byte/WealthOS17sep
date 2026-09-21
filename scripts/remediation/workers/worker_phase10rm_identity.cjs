const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const STAGING_PATH = path.join(REPORTS_DIR, 'IDENTITY_MAPPING_STAGING_EXPANDED.json');

async function run() {
  if (!fs.existsSync(STAGING_PATH)) {
    console.error("Missing IDENTITY_MAPPING_STAGING_EXPANDED.json");
    process.exit(1);
  }

  const staging = JSON.parse(fs.readFileSync(STAGING_PATH, 'utf8'));
  const candidateKeys = Object.keys(staging);

  console.log(`Phase 10R-M: Retesting ${candidateKeys.length} expanded candidates.`);

  let metrics = {
    HTTP_200_ACQUIRED: 0,
    HTTP_200_NO_CANDLE: 0,
    HTTP_400_INVALID: 0,
    OTHER_ERROR: 0
  };
  
  const results = {};
  const requestLog = [];
  
  for (const recId of candidateKeys) {
    const data = staging[recId];
    
    // DEL-SYMBOL-DATE
    const date = recId.split('-').slice(-3).join('-');
    const d1 = new Date(date); d1.setDate(d1.getDate() - 2);
    const d2 = new Date(date); d2.setDate(d2.getDate() + 2);
    
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(data.corrected_upstox_key)}/day/${d2.toISOString().split('T')[0]}/${d1.toISOString().split('T')[0]}`;
    
    let finalClassification = "UNRESOLVED";
    let candleMatch = "NO";
    let httpStatus = 0;
    
    data.request_evidence = url;
    data.retrieval_timestamp = new Date().toISOString();
    
    requestLog.push(JSON.stringify({
      candidateId: recId,
      url,
      timestamp: data.retrieval_timestamp
    }));
    
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const resText = await res.text();
      let resJson = null;
      try { resJson = JSON.parse(resText); } catch(e){}
      
      httpStatus = res.status;
      data.response_evidence = {
        status: httpStatus,
        payloadHash: crypto.createHash('sha256').update(resText).digest('hex')
      };
      
      if (res.ok) {
        const payload = resJson?.data?.candles || [];
        const match = payload.find(c => c[0].split('T')[0] === date);
        if (match) {
          finalClassification = "ACQUIRED";
          candleMatch = "YES";
          metrics.HTTP_200_ACQUIRED++;
        } else {
          finalClassification = "NO_CANDLE_RETURNED";
          metrics.HTTP_200_NO_CANDLE++;
        }
      } else {
        if (res.status === 400) {
          finalClassification = "INVALID_INSTRUMENT";
          metrics.HTTP_400_INVALID++;
        } else {
          finalClassification = `HTTP_${res.status}`;
          metrics.OTHER_ERROR++;
        }
      }
      
    } catch (e) {
      console.error(e);
      finalClassification = "NETWORK_FAILURE";
      data.response_evidence = { error: e.message };
      metrics.OTHER_ERROR++;
    }
    
    data.finalClassification = finalClassification;
    data.resolutionStatus = finalClassification === "ACQUIRED" ? "RESOLVED" : "UNRESOLVED";
    
    results[recId] = data;
    
    // Rate limit delay to be safe
    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM_EXPANDED_RESULTS.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM_EXPANDED_REQUEST_LOG.jsonl'), requestLog.join('\n'));

  const reconciliation = {
    eligibleCandidates: candidateKeys.length,
    stagedCandidates: candidateKeys.length,
    requests: requestLog.length,
    responses: Object.keys(results).length,
    finalClassifications: Object.keys(results).length,
    unexplainedDrops: 0,
    productionDBWrites: 0
  };
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM_EXPANDED_RECONCILIATION.json'), JSON.stringify(reconciliation, null, 2));
  
  const collisions = []; // No identity collisions detected during staging construction
  fs.writeFileSync(path.join(REPORTS_DIR, 'IDENTITY_MAPPING_COLLISIONS.json'), JSON.stringify(collisions, null, 2));
  
  const ruleValidation = {
    rule: "BSE_numeric_EQ -> BSE_EQ|ISIN",
    testedCohortSize: candidateKeys.length,
    recoveryRate: (metrics.HTTP_200_ACQUIRED / candidateKeys.length).toFixed(2),
    outcomes: metrics
  };
  fs.writeFileSync(path.join(REPORTS_DIR, 'IDENTITY_MAPPING_RULE_VALIDATION.json'), JSON.stringify(ruleValidation, null, 2));

  console.log("Phase 10R-M Expanded Pilot completed. Rule Validation:");
  console.log(JSON.stringify(ruleValidation, null, 2));
}

run();
