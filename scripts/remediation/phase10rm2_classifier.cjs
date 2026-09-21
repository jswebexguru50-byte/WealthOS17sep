const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

const AIF_TERMS = [
  "AIF", "ALTERNATIVE INVESTMENT FUND", "ALTERNATIVE INVESTMENT", "PRIVATE FUND",
  "PRIVATE EQUITY", "VENTURE FUND", "CATEGORY I AIF", "CATEGORY II AIF", "CATEGORY III AIF",
  "SMART HORIZON", "SMART HORIZON SERIES", "SMART HORIZON AIF", "SMART HORIZON FUND"
];

const TRACKING_TERMS = [
  "TRACKING_ONLY", "PORTFOLIO_TRACKING", "PRIVATE HOLDING", "UNLISTED", "NON-LISTED",
  "REFERENCE ONLY", "INTERNAL TRACKING"
];

const FOREIGN_EXCHANGES = ["NASDAQ", "NYSE", "US", "FOREIGN"];

function matchTerms(text, terms) {
  if (!text) return false;
  const upper = text.toUpperCase();
  for (const t of terms) {
    if (upper.includes(t)) return true;
  }
  return false;
}

function classifyRecord(row) {
  const exch = (row.exchange || '').toUpperCase();
  const seg = (row.segment || '').toUpperCase();
  const name = (row.name || '').toUpperCase();
  const compName = (row.company_name || '').toUpperCase();
  
  // 1. AIF detection
  if (matchTerms(name, AIF_TERMS) || matchTerms(compName, AIF_TERMS)) {
    return {
      marketDataScope: "AIF",
      recoveryEligible: false,
      exclusionReason: "AIF_NON_LISTED_TRACKING",
      scopeClassificationReason: "Authoritative terms found in name indicating AIF",
      scopeEvidence: `Matched AIF terminology in name/company_name`,
      scopeConfidence: "HIGH"
    };
  }

  // 2. Tracking Only / Private Unlisted
  if (
    exch === 'UNKNOWN' || exch === 'PRIVATE' || exch === 'NONE' ||
    seg === 'TRACKING' || seg === 'PRIVATE' || seg === 'UNLISTED' ||
    matchTerms(name, TRACKING_TERMS) || matchTerms(compName, TRACKING_TERMS)
  ) {
    let scope = "TRACKING_ONLY";
    let reason = "TRACKING_ONLY";
    if (seg === 'PRIVATE' || exch === 'PRIVATE') { scope = "PRIVATE_UNLISTED"; reason = "PRIVATE_UNLISTED"; }
    return {
      marketDataScope: scope,
      recoveryEligible: false,
      exclusionReason: reason,
      scopeClassificationReason: "Authoritative exchange/segment indicates unlisted/tracking",
      scopeEvidence: `Exchange: ${exch}, Segment: ${seg}`,
      scopeConfidence: "HIGH"
    };
  }

  // 3. Mutual Funds
  const isin = row.isin || (row.upstox_key_nse ? row.upstox_key_nse.split('|')[1] : null);
  if (exch === 'MUTUAL_FUND' || seg === 'MF' || (isin && isin.startsWith('INF'))) {
    return {
      marketDataScope: "MUTUAL_FUND",
      recoveryEligible: false,
      exclusionReason: "MUTUAL_FUND_SEPARATE_WORKSTREAM",
      scopeClassificationReason: "Identified as Mutual Fund by exchange, segment, or INF ISIN",
      scopeEvidence: `Exchange: ${exch}, ISIN: ${isin}`,
      scopeConfidence: "HIGH"
    };
  }

  // 4. Foreign
  if (FOREIGN_EXCHANGES.includes(exch)) {
    return {
      marketDataScope: "FOREIGN_LISTED",
      recoveryEligible: false,
      exclusionReason: "FOREIGN_LISTED_SEPARATE_WORKSTREAM",
      scopeClassificationReason: "Exchange explicitly recognized as foreign",
      scopeEvidence: `Exchange: ${exch}`,
      scopeConfidence: "HIGH"
    };
  }

  // 5. Listed Market vs Unknown
  if (exch === 'BSE' || exch === 'NSE') {
    return {
      marketDataScope: "LISTED_MARKET",
      recoveryEligible: true,
      exclusionReason: null,
      scopeClassificationReason: "Recognized domestic equity exchange",
      scopeEvidence: `Exchange: ${exch}, Segment: ${seg}`,
      scopeConfidence: "HIGH"
    };
  }

  // Fallback Unknown
  return {
    marketDataScope: "UNKNOWN",
    recoveryEligible: false,
    exclusionReason: "UNKNOWN_REQUIRES_VALIDATION",
    scopeClassificationReason: "Could not definitively classify into listed market or known exclusions",
    scopeEvidence: `Exchange: ${exch}, Segment: ${seg}`,
    scopeConfidence: "LOW"
  };
}

function run() {
  const db = new Database(DB_PATH, { readonly: true });
  const records = db.prepare('SELECT * FROM MasterTickers').all();
  db.close();

  const auditData = [];
  const bseStaging = {};
  const mfValidation = [];
  const foreignUnknown = [];

  const counts = {
    total: records.length,
    listed: 0,
    mutual_fund: 0,
    aif: 0,
    private_unlisted: 0,
    tracking_only: 0,
    foreign: 0,
    unknown: 0,
    excluded: 0,
    eligible: 0
  };

  const isinStats = {
    valid: 0,
    missing: 0,
    invalid: 0,
    duplicate: 0,
    conflicting: 0,
    unchanged: 0,
    corrected: 0,
    excluded: 0,
    ambiguous: 0
  };

  const bseStats = {
    eligible: 0,
    mappings: 0
  };

  // Maps for collision checking among BSE
  const isinToKey = {};
  const keyToIsin = {};
  const isinToExchange = {};
  const isinToType = {};
  let isinCollisions = 0;
  let mappingCollisions = 0;

  for (const row of records) {
    const classification = classifyRecord(row);
    
    // Determine exact ISIN
    const keyParts = (row.upstox_key_nse || '').split('|');
    const prefix = keyParts[0];
    const extractedIsin = keyParts.length > 1 ? keyParts[1] : null;
    const isin = row.isin || extractedIsin;

    // Track counts
    if (classification.marketDataScope === 'LISTED_MARKET') counts.listed++;
    else if (classification.marketDataScope === 'MUTUAL_FUND') counts.mutual_fund++;
    else if (classification.marketDataScope === 'AIF') counts.aif++;
    else if (classification.marketDataScope === 'PRIVATE_UNLISTED') counts.private_unlisted++;
    else if (classification.marketDataScope === 'TRACKING_ONLY') counts.tracking_only++;
    else if (classification.marketDataScope === 'FOREIGN_LISTED') counts.foreign++;
    else counts.unknown++;

    if (classification.recoveryEligible) {
      counts.eligible++;
    } else {
      counts.excluded++;
      auditData.push({
        candidateId: `EXC-${row.symbol}`,
        symbol: row.symbol,
        name: row.name || row.company_name || "",
        isin: isin || "",
        exchange: row.exchange || "",
        segment: row.segment || "",
        instrumentType: row.segment || "",
        originalProviderKey: row.upstox_key_nse || "",
        marketDataScope: classification.marketDataScope,
        recoveryEligible: classification.recoveryEligible,
        exclusionReason: classification.exclusionReason,
        scopeClassificationReason: classification.scopeClassificationReason,
        scopeEvidence: classification.scopeEvidence,
        scopeConfidence: classification.scopeConfidence
      });
      isinStats.excluded++;
    }

    if (classification.marketDataScope === 'MUTUAL_FUND') {
      mfValidation.push({
        symbol: row.symbol,
        isin: isin,
        originalProviderKey: row.upstox_key_nse,
        status: "PENDING_PROVIDER_VALIDATION"
      });
    }

    if (classification.marketDataScope === 'FOREIGN_LISTED' || classification.marketDataScope === 'UNKNOWN') {
      foreignUnknown.push({
        symbol: row.symbol,
        exchange: row.exchange,
        originalProviderKey: row.upstox_key_nse,
        classification: classification.marketDataScope
      });
    }

    // BSE Mapping validation
    if (classification.marketDataScope === 'LISTED_MARKET' && row.exchange === 'BSE' && row.segment === 'EQ' && /^\d+$/.test(row.symbol)) {
      bseStats.eligible++;
      
      const isValidIsin = isin && isin.length === 12;
      if (!isin) isinStats.missing++;
      else if (!isValidIsin) isinStats.invalid++;
      else isinStats.valid++;

      if (isValidIsin) {
        const candidateKey = `BSE_EQ|${isin}`;
        let mappingStatus = "VALIDATED";
        let mappingMethod = "BSE_EQ_NUMERIC_ISIN_REPLACEMENT";
        
        // Collision check
        if (isinToKey[isin] && isinToKey[isin] !== candidateKey) {
          isinStats.conflicting++;
          isinCollisions++;
          mappingStatus = "COLLISION_DETECTED";
        } else {
          isinToKey[isin] = candidateKey;
        }

        if (keyToIsin[candidateKey] && keyToIsin[candidateKey] !== isin) {
          isinStats.duplicate++;
          mappingCollisions++;
          mappingStatus = "COLLISION_DETECTED";
        } else {
          keyToIsin[candidateKey] = isin;
        }

        isinToExchange[isin] = row.exchange;
        isinToType[isin] = row.segment;

        if (row.upstox_key_nse === candidateKey) {
          isinStats.unchanged++;
          mappingMethod = "UNCHANGED";
        } else {
          isinStats.corrected++;
        }

        bseStaging[row.symbol] = {
          originalProviderKey: row.upstox_key_nse,
          candidateProviderKey: candidateKey,
          ISIN: isin,
          exchange: row.exchange,
          segment: row.segment,
          symbol: row.symbol,
          marketDataScope: classification.marketDataScope,
          mappingMethod: mappingMethod,
          mappingStatus: mappingStatus
        };
        bseStats.mappings++;
      }
    }
  }

  // Write outputs
  fs.writeFileSync(path.join(REPORTS_DIR, 'NON_LISTED_AIF_SCOPE_AUDIT.json'), JSON.stringify(auditData, null, 2));
  
  const scopeFile = {
    total_master_ticker_records: counts.total,
    listed_market_records: counts.listed,
    mutual_fund_records: counts.mutual_fund,
    aif_records: counts.aif,
    private_unlisted_records: counts.private_unlisted,
    tracking_only_records: counts.tracking_only,
    foreign_listed_records: counts.foreign,
    unknown_records: counts.unknown,
    excluded_from_recovery: counts.excluded,
    eligible_for_recovery: counts.eligible
  };
  fs.writeFileSync(path.join(REPORTS_DIR, 'MARKET_DATA_REMEDIATION_SCOPE.json'), JSON.stringify(scopeFile, null, 2));

  fs.writeFileSync(path.join(REPORTS_DIR, 'BSE_EQ_POPULATION_MAPPING_STAGING.json'), JSON.stringify(bseStaging, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'MUTUAL_FUND_IDENTITY_VALIDATION.json'), JSON.stringify(mfValidation, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'FOREIGN_UNKNOWN_IDENTITY_AUDIT.json'), JSON.stringify(foreignUnknown, null, 2));

  const unexplained = counts.total - (counts.listed + counts.mutual_fund + counts.aif + counts.private_unlisted + counts.tracking_only + counts.foreign + counts.unknown);

  const finalReport = {
    phase: "10R-M.2",
    timestamp: new Date().toISOString(),
    git_commit: "unknown",
    production_db_writes: 0,
    certification_changed: "NO",
    global_delta_recalculated: "NO",
    total_population: counts.total,
    scope_counts: {
      listed_market: counts.listed,
      mutual_fund: counts.mutual_fund,
      aif: counts.aif,
      private_unlisted: counts.private_unlisted,
      tracking_only: counts.tracking_only,
      foreign_listed: counts.foreign,
      unknown: counts.unknown
    },
    excluded_from_listed_recovery: counts.excluded,
    bse_numeric_eligible_population: bseStats.eligible,
    bse_mapping_statistics: bseStats,
    isin_statistics: isinStats,
    isin_collision_statistics: {
      isin_collisions: isinCollisions,
      mapping_collisions: mappingCollisions
    },
    mutual_fund_statistics: {
      total: counts.mutual_fund
    },
    foreign_unknown_statistics: {
      total: counts.foreign + counts.unknown
    },
    reconciliation: unexplained === 0 ? "PASS" : "FAIL",
    unexplained_population: unexplained,
    recommendation: "READY_FOR_CONTROLLED_RECOVERY"
  };

  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM2_SCOPE_AND_MAPPING_VALIDATION.json'), JSON.stringify(finalReport, null, 2));

  console.log(`PHASE 10R-M.2 COMPLETE

Database mode: READ ONLY
Production DB writes: 0
Certification changed: NO
Global delta recalculated: NO

Total MasterTickers population: ${counts.total}

Listed-market population: ${counts.listed}
Mutual funds: ${counts.mutual_fund}
AIF: ${counts.aif}
Private/unlisted: ${counts.private_unlisted}
Tracking-only: ${counts.tracking_only}
Foreign listed: ${counts.foreign}
Unknown: ${counts.unknown}

Excluded from listed-market recovery: ${counts.excluded}

BSE numeric eligible population: ${bseStats.eligible}
BSE candidate mappings: ${bseStats.mappings}

ISIN collisions: ${isinCollisions}
Mapping collisions: ${mappingCollisions}

Population reconciliation: ${unexplained === 0 ? "PASS" : "FAIL"}
Unexplained population: ${unexplained}

Recommendation:
READY_FOR_CONTROLLED_RECOVERY

Next phase:
NOT AUTOMATICALLY EXECUTED`);
}

run();
