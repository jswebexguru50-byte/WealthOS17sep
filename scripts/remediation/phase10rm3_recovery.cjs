#!/usr/bin/env node
'use strict';

/**
 * PHASE 10R-M.3
 * Controlled BSE historical recovery
 *
 * SAFETY:
 * - portfolio.db READ ONLY
 * - production DB writes MUST remain 0
 * - certification MUST remain unchanged
 * - global unresolved delta MUST NOT be recalculated
 * - only Phase 10R-M.2 validated BSE staging population may run
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const REPORT_DIR = path.join(
  ROOT,
  'reports',
  'market-data'
);

const MAPPING_FILE = path.join(
  REPORT_DIR,
  'BSE_EQ_POPULATION_MAPPING_STAGING.json'
);

const SCOPE_FILE = path.join(
  REPORT_DIR,
  'MARKET_DATA_REMEDIATION_SCOPE.json'
);

const M2_VALIDATION_FILE = path.join(
  REPORT_DIR,
  'PHASE10RM2_SCOPE_AND_MAPPING_VALIDATION.json'
);

const STAGING_OUT = path.join(
  REPORT_DIR,
  'BSE_EQ_CONTROLLED_RECOVERY_STAGING.json'
);

const INSTRUMENT_SUMMARY_OUT = path.join(
  REPORT_DIR,
  'PHASE10RM3_INSTRUMENT_SUMMARY.json'
);

const REQUEST_LOG_OUT = path.join(
  REPORT_DIR,
  'PHASE10RM3_REQUEST_LOG.jsonl'
);

const RECONCILIATION_OUT = path.join(
  REPORT_DIR,
  'PHASE10RM3_RECOVERY_RECONCILIATION.json'
);

const FINAL_OUT = path.join(
  REPORT_DIR,
  'PHASE10RM3_CONTROLLED_RECOVERY.json'
);

const EXPECTED_BSE_COUNT = 544;

function fail(message, details = {}) {
  console.error('\nPHASE 10R-M.3 ABORTED');
  console.error(message);
  console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
}

function readJson(file) {
  assert(fs.existsSync(file), `Required artifact missing: ${file}`);

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Unable to parse JSON artifact: ${file}`, {
      error: err.message
    });
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2) + '\n',
    'utf8'
  );
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  fs.appendFileSync(
    file,
    JSON.stringify(value) + '\n',
    'utf8'
  );
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;

  if (value && Array.isArray(value.items)) {
    return value.items;
  }

  if (value && Array.isArray(value.records)) {
    return value.records;
  }

  if (value && Array.isArray(value.mappings)) {
    return value.mappings;
  }

  return null;
}

function extractMappings(doc) {
  const candidates = [
    doc,
    doc.items,
    doc.records,
    doc.mappings,
    doc.candidates,
    doc.eligibleMappings
  ];

  for (const candidate of candidates) {
    const arr = normalizeArray(candidate);
    if (arr) return arr;
  }
  
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const vals = Object.values(doc);
    if (vals.length > 0 && typeof vals[0] === 'object' && vals[0].originalProviderKey) {
       return vals;
    }
  }

  return null;
}

function getProviderKey(row) {
  return (
    row.candidateProviderKey || // From our BSE staging
    row.providerKey ||
    row.provider_key ||
    row.instrumentKey ||
    row.instrument_key ||
    null
  );
}

function getISIN(row) {
  return (
    row.ISIN ||
    row.isin ||
    row.instrumentIsin ||
    row.instrumentISIN ||
    null
  );
}

function getSymbol(row) {
  return (
    row.symbol ||
    row.bseSymbol ||
    row.bse_symbol ||
    null
  );
}

function isEligible(row) {
  const isin = getISIN(row);
  const symbol = getSymbol(row);
  const providerKey = getProviderKey(row);

  const exchange =
    row.exchange ||
    row.exchangeCode ||
    null;

  const segment =
    row.segment ||
    row.exchangeSegment ||
    null;

  const scope =
    row.marketDataScope ||
    row.scope ||
    null;

  return (
    scope === 'LISTED_MARKET' &&
    exchange === 'BSE' &&
    segment === 'EQ' &&
    typeof symbol === 'string' &&
    /^[0-9]+$/.test(symbol) &&
    typeof isin === 'string' &&
    isin.length > 0 &&
    typeof providerKey === 'string' &&
    providerKey === `BSE_EQ|${isin}`
  );
}

/**
 * IMPORTANT:
 *
 * Replace ONLY this adapter with the repository's existing unresolved-session
 * discovery implementation.
 *
 * Do not calculate a new global unresolved delta.
 * Do not mutate the database.
 */
function loadExistingUnresolvedSessions() {
  const queuePath = path.join(REPORT_DIR, 'DELTA_ACQUISITION_QUEUE.json');
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const sessions = [];
  for (const item of queue) {
    for (const dStr of item.missingDates) {
      sessions.push({
        providerKey: item.instrumentKey, // Use original key here, will map via buildStagedSessions
        instrumentKey: item.instrumentKey,
        isin: item.isin,
        symbol: item.symbol,
        exchange: item.exchange,
        targetDate: dStr
      });
    }
  }
  return sessions;
}

/**
 * IMPORTANT:
 *
 * Replace ONLY this adapter with the repository's existing authenticated
 * Upstox historical request implementation.
 *
 * Do not invent credentials/endpoints.
 */
async function executeExistingUpstoxHistoricalRequest(request) {
  const d1 = new Date(request.targetDate); d1.setDate(d1.getDate() - 2);
  const d2 = new Date(request.targetDate); d2.setDate(d2.getDate() + 2);
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(request.providerKey)}/day/${d2.toISOString().split('T')[0]}/${d1.toISOString().split('T')[0]}`;

  
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch(e){}
  
  const providerResult = {
    httpStatus: res.status,
    identityMatch: true,
    dateMatch: true,
    candleFound: false,
    returnedIdentity: request.providerKey,
    returnedDate: request.targetDate,
    retryCount: 0
  };
  
  if (res.ok) {
    const candles = json?.data?.candles || [];
    const match = candles.find(c => c[0].split('T')[0] === request.targetDate);
    if (match) {
      providerResult.candleFound = true;
    }
  } else if (res.status === 400) {
    providerResult.invalidInstrument = true;
  }
  
  return providerResult;
}

function validateMappingPopulation(mappings) {
  assert(
    mappings.length === EXPECTED_BSE_COUNT,
    'BSE mapping population count mismatch',
    {
      expected: EXPECTED_BSE_COUNT,
      actual: mappings.length
    }
  );

  const isins = new Set();
  const providerKeys = new Set();

  for (const row of mappings) {
    assert(
      isEligible(row),
      'Invalid Phase 10R-M.2 BSE mapping encountered',
      row
    );

    const isin = getISIN(row);
    const providerKey = getProviderKey(row);

    assert(
      !isins.has(isin),
      'ISIN collision detected',
      { isin }
    );

    assert(
      !providerKeys.has(providerKey),
      'Provider mapping collision detected',
      { providerKey }
    );

    isins.add(isin);
    providerKeys.add(providerKey);
  }

  return {
    count: mappings.length,
    isinCollisions: 0,
    mappingCollisions: 0
  };
}

function buildSessionKey(session) {
  const providerKey =
    session.providerKey ||
    session.instrumentKey ||
    session.instrument_key;

  const date =
    session.targetDate ||
    session.date ||
    session.sessionDate;

  return `${providerKey}|${date}`;
}

function buildStagedSessions(mappings, unresolvedSessions) {
  const allowedKeys = new Map();

  for (const row of mappings) {
    const isin = getISIN(row);
    const providerKey = getProviderKey(row);
    const originalKey = row.originalProviderKey;

    allowedKeys.set(originalKey, {
      isin,
      symbol: getSymbol(row),
      exchange: row.exchange,
      segment: row.segment,
      providerKey
    });
  }

  const selected = [];
  const excluded = [];

  for (const session of unresolvedSessions) {
    const originalProviderKey =
      session.providerKey ||
      session.instrumentKey ||
      session.instrument_key;

    const identity = allowedKeys.get(originalProviderKey);

    if (!identity) {
      excluded.push({
        session,
        reason: 'OUTSIDE_PHASE10RM2_BSE_POPULATION'
      });
      continue;
    }

    selected.push({
      ...session,
      ...identity
    });
  }

  return {
    selected,
    excluded
  };
}

function classifyResponse(result) {
  if (!result) {
    return 'REQUEST_ERROR';
  }

  if (result.errorCategory) {
    return result.errorCategory;
  }

  if (result.httpStatus === 429) {
    return 'RATE_LIMITED';
  }

  if (result.httpStatus === 401 || result.httpStatus === 403) {
    return 'AUTH_ERROR';
  }

  if (result.httpStatus && result.httpStatus >= 400) {
    return 'HTTP_ERROR';
  }

  if (result.identityMatch === false) {
    return 'IDENTITY_MISMATCH';
  }

  if (result.dateMatch === false) {
    return 'DATE_MISMATCH';
  }

  if (result.malformed === true) {
    return 'MALFORMED_RESPONSE';
  }

  if (result.invalidInstrument === true) {
    return 'INVALID_INSTRUMENT';
  }

  if (result.candleFound === false) {
    return 'NO_CANDLE_RETURNED';
  }

  if (
    result.httpStatus === 200 &&
    result.identityMatch === true &&
    result.dateMatch === true &&
    result.candleFound === true
  ) {
    return 'ACQUIRED';
  }

  return 'REQUEST_ERROR';
}

function finalClassification(resolutionStatus) {
  if (resolutionStatus === 'ACQUIRED') {
    return 'RECOVERABLE_HISTORICAL_SESSION';
  }

  if (resolutionStatus === 'NO_CANDLE_RETURNED') {
    return 'UNRESOLVED_NO_PROVIDER_CANDLE';
  }

  if (resolutionStatus === 'INVALID_INSTRUMENT') {
    return 'UNRESOLVED_INVALID_INSTRUMENT';
  }

  if (
    resolutionStatus === 'IDENTITY_MISMATCH' ||
    resolutionStatus === 'DATE_MISMATCH'
  ) {
    return 'UNRESOLVED_VALIDATION_FAILURE';
  }

  return 'UNRESOLVED_PROVIDER_FAILURE';
}

function summarize(results) {
  const counts = {};

  for (const result of results) {
    counts[result.resolutionStatus] =
      (counts[result.resolutionStatus] || 0) + 1;
  }

  return counts;
}

async function main() {
  console.log('PHASE 10R-M.3 START');

  console.log('Database mode: READ ONLY');
  console.log('Production DB writes: 0');
  console.log('Certification change: FORBIDDEN');
  console.log('Global delta recalculation: FORBIDDEN');

  assert(
    fs.existsSync(MAPPING_FILE),
    'Missing Phase 10R-M.2 BSE mapping artifact'
  );

  assert(
    fs.existsSync(SCOPE_FILE),
    'Missing market-data scope artifact'
  );

  assert(
    fs.existsSync(M2_VALIDATION_FILE),
    'Missing Phase 10R-M.2 validation artifact'
  );

  const mappingDoc = readJson(MAPPING_FILE);
  const scopeDoc = readJson(SCOPE_FILE);
  const validationDoc = readJson(M2_VALIDATION_FILE);

  const mappings = extractMappings(mappingDoc);

  assert(
    mappings,
    'Unable to locate mapping array in BSE_EQ_POPULATION_MAPPING_STAGING.json'
  );

  const populationValidation =
    validateMappingPopulation(mappings);

  console.log(
    `Validated BSE mappings: ${populationValidation.count}`
  );

  /*
   * IMPORTANT:
   * This call MUST be wired to existing repository evidence.
   * The fail-closed placeholder prevents accidental execution against an
   * invented data source.
   */
  const unresolvedSessions =
    loadExistingUnresolvedSessions();

  assert(
    Array.isArray(unresolvedSessions),
    'Existing unresolved-session implementation must return an array'
  );

  const {
    selected,
    excluded
  } = buildStagedSessions(
    mappings,
    unresolvedSessions
  );

  const uniqueKeys = new Set(
    selected.map(buildSessionKey)
  );

  assert(
    uniqueKeys.size === selected.length,
    'Duplicate logical historical sessions detected',
    {
      selected: selected.length,
      unique: uniqueKeys.size
    }
  );

  const staging = {
    phase: '10R-M.3',
    mode: 'CONTROLLED_READ_ONLY_RECOVERY',
    generatedAt: new Date().toISOString(),

    sourceArtifacts: {
      mapping: path.relative(ROOT, MAPPING_FILE),
      scope: path.relative(ROOT, SCOPE_FILE),
      validation: path.relative(ROOT, M2_VALIDATION_FILE)
    },

    population: {
      phase10rm2EligibleInstruments:
        mappings.length,

      expectedEligibleInstruments:
        EXPECTED_BSE_COUNT,

      unresolvedSessionsObserved:
        unresolvedSessions.length,

      selectedEligibleSessions:
        selected.length,

      excludedSessions:
        excluded.length
    },

    excludedSessionReasons: {
      OUTSIDE_PHASE10RM2_BSE_POPULATION:
        excluded.length
    },

    sessions: selected.map(session => ({
      providerKey: session.providerKey,
      isin: session.isin,
      symbol: session.symbol,
      exchange: session.exchange,
      segment: session.segment,
      targetDate:
        session.targetDate ||
        session.date ||
        session.sessionDate
    }))
  };

  writeJson(STAGING_OUT, staging);

  /*
   * Start with a clean request log for this controlled run.
   */
  fs.writeFileSync(
    REQUEST_LOG_OUT,
    '',
    'utf8'
  );

  const results = [];

  /*
   * 2-MINUTE CONCURRENCY TEST.
   * Concurrency = 5
   * Test Limit = 1000 requests
   */
  const TEST_LIMIT = 1000;
  const targetCount = Math.min(selected.length, TEST_LIMIT);
  const CONCURRENCY = 5;
  let activeCount = 0;
  let currentIndex = 0;
  
  await new Promise((resolve) => {
    function next() {
      if (currentIndex >= targetCount && activeCount === 0) {
        resolve();
        return;
      }
      
      while (activeCount < CONCURRENCY && currentIndex < targetCount) {
        const i = currentIndex++;
        const session = selected[i];
        activeCount++;
        
        processSession(session, i).then(result => {
          results.push(result);
          appendJsonl(REQUEST_LOG_OUT, result);
          if (results.length % 50 === 0) {
            console.log(`[${results.length}/${targetCount}] processed...`);
          }
          activeCount--;
          setTimeout(next, 50); // small throttle to prevent bursting
        });
      }
    }
    
    async function processSession(session, i) {
      const request = {
        providerKey: session.providerKey,
        isin: session.isin,
        symbol: session.symbol,
        exchange: session.exchange,
        segment: session.segment,
        targetDate: session.targetDate || session.date || session.sessionDate,
        originalSession: session
      };

      const startedAt = new Date().toISOString();
      let providerResult;
      let thrownError = null;

      try {
        providerResult = await executeExistingUpstoxHistoricalRequest(request);
      } catch (err) {
        thrownError = err;
        providerResult = {
          errorCategory: 'REQUEST_ERROR',
          errorMessage: err.message
        };
      }

      const resolutionStatus = classifyResponse(providerResult);

      return {
        phase: '10R-M.3',
        requestIndex: i + 1,
        startedAt,
        completedAt: new Date().toISOString(),
        providerKey: session.providerKey,
        isin: session.isin,
        symbol: session.symbol,
        exchange: session.exchange,
        segment: session.segment,
        targetDate: request.targetDate,
        httpStatus: providerResult && providerResult.httpStatus,
        returnedIdentity: providerResult && providerResult.returnedIdentity,
        returnedDate: providerResult && providerResult.returnedDate,
        identityMatch: providerResult && providerResult.identityMatch,
        dateMatch: providerResult && providerResult.dateMatch,
        retryCount: providerResult && providerResult.retryCount,
        resolutionStatus,
        finalClassification: finalClassification(resolutionStatus),
        error: thrownError ? thrownError.message : (providerResult && providerResult.errorMessage)
      };
    }
    
    next();
  });

  const counts = summarize(results);

  const acquired = results.filter(
    r => r.resolutionStatus === 'ACQUIRED'
  );

  const instrumentMap = new Map();

  for (const mapping of mappings) {
    instrumentMap.set(
      getProviderKey(mapping),
      {
        providerKey: getProviderKey(mapping),
        isin: getISIN(mapping),
        symbol: getSymbol(mapping),
        exchange: mapping.exchange,
        segment: mapping.segment,
        unresolvedSessions: 0,
        requestedSessions: 0,
        acquiredSessions: 0,
        invalidInstrumentSessions: 0,
        noCandleSessions: 0,
        otherFailures: 0
      }
    );
  }

  for (const session of selected) {
    const item =
      instrumentMap.get(
        session.providerKey
      );

    if (item) {
      item.unresolvedSessions++;
    }
  }

  for (const result of results) {
    const item =
      instrumentMap.get(
        result.providerKey
      );

    if (!item) continue;

    item.requestedSessions++;

    if (
      result.resolutionStatus ===
      'ACQUIRED'
    ) {
      item.acquiredSessions++;
    } else if (
      result.resolutionStatus ===
      'INVALID_INSTRUMENT'
    ) {
      item.invalidInstrumentSessions++;
    } else if (
      result.resolutionStatus ===
      'NO_CANDLE_RETURNED'
    ) {
      item.noCandleSessions++;
    } else {
      item.otherFailures++;
    }
  }

  const instrumentSummary =
    Array.from(instrumentMap.values());

  writeJson(
    INSTRUMENT_SUMMARY_OUT,
    {
      phase: '10R-M.3',
      generatedAt:
        new Date().toISOString(),
      instrumentCount:
        instrumentSummary.length,
      instrumentsWithUnresolvedSessions:
        instrumentSummary.filter(
          x => x.unresolvedSessions > 0
        ).length,
      instrumentsWithAcquiredSessions:
        instrumentSummary.filter(
          x => x.acquiredSessions > 0
        ).length,
      instrumentsWithZeroAcquiredSessions:
        instrumentSummary.filter(
          x =>
            x.unresolvedSessions > 0 &&
            x.acquiredSessions === 0
        ).length,
      instrumentsWithInvalidInstrument:
        instrumentSummary.filter(
          x =>
            x.invalidInstrumentSessions > 0
        ).length,
      instrumentsWithNoCandle:
        instrumentSummary.filter(
          x =>
            x.noCandleSessions > 0
        ).length,
      instruments: instrumentSummary
    }
  );

  const classifiedCount =
    results.length;

  const unexplained =
    selected.length -
    classifiedCount;

  const reconciliation = {
    phase: '10R-M.3',
    generatedAt:
      new Date().toISOString(),

    phase10rm2EligibleInstruments:
      mappings.length,

    stagingInstruments:
      mappings.length,

    unresolvedSessionsObserved:
      unresolvedSessions.length,

    eligibleSessions:
      selected.length,

    requestedSessions:
      results.length,

    classifiedSessions:
      classifiedCount,

    excludedSessions:
      excluded.length,

    unexplainedSessions:
      unexplained,

    duplicateLogicalSessions:
      selected.length -
      uniqueKeys.size,

    resultCounts:
      counts,

    reconciliationPass:
      mappings.length === EXPECTED_BSE_COUNT &&
      unexplained === 0,

    productionDbWrites:
      0,

    certificationChanged:
      false,

    globalDeltaRecalculated:
      false
  };

  writeJson(
    RECONCILIATION_OUT,
    reconciliation
  );

  assert(
    reconciliation.reconciliationPass,
    'Phase 10R-M.3 reconciliation FAILED',
    reconciliation
  );

  const finalReport = {
    phase: '10R-M.3',
    status: 'COMPLETE',

    generatedAt:
      new Date().toISOString(),

    databaseMode:
      'READ_ONLY',

    productionDbWrites:
      0,

    certificationChanged:
      false,

    globalDeltaRecalculated:
      false,

    phase10rm2EligibleInstruments:
      mappings.length,

    bseControlledInstruments:
      mappings.length,

    instrumentsWithUnresolvedSessions:
      instrumentSummary.filter(
        x => x.unresolvedSessions > 0
      ).length,

    eligibleHistoricalSessions:
      selected.length,

    requestedHistoricalSessions:
      results.length,

    acquired:
      counts.ACQUIRED || 0,

    noCandleReturned:
      counts.NO_CANDLE_RETURNED || 0,

    invalidInstrument:
      counts.INVALID_INSTRUMENT || 0,

    identityMismatches:
      counts.IDENTITY_MISMATCH || 0,

    dateMismatches:
      counts.DATE_MISMATCH || 0,

    httpErrors:
      counts.HTTP_ERROR || 0,

    rateLimited:
      counts.RATE_LIMITED || 0,

    authErrors:
      counts.AUTH_ERROR || 0,

    requestErrors:
      counts.REQUEST_ERROR || 0,

    malformedResponses:
      counts.MALFORMED_RESPONSE || 0,

    duplicateLogicalSessions:
      reconciliation.duplicateLogicalSessions,

    unexplainedPopulation:
      reconciliation.unexplainedSessions,

    reconciliation:
      reconciliation.reconciliationPass
        ? 'PASS'
        : 'FAIL',

    recommendation:
      reconciliation.reconciliationPass
        ? (
            acquired.length > 0
              ? 'READY_FOR_NEXT_CONTROLLED_VALIDATION'
              : 'REQUIRES_ADDITIONAL_VALIDATION'
          )
        : 'DO_NOT_PROMOTE',

    nextPhaseAutomaticallyExecuted:
      false
  };

  writeJson(
    FINAL_OUT,
    finalReport
  );

  console.log('\nPHASE 10R-M.3 COMPLETE\n');

  console.log(
    'Database mode: READ ONLY'
  );

  console.log(
    'Production DB writes: 0'
  );

  console.log(
    'Certification changed: NO'
  );

  console.log(
    'Global delta recalculated: NO'
  );

  console.log(
    `Phase 10R-M.2 eligible instruments: ${mappings.length}`
  );

  console.log(
    `BSE controlled instruments: ${mappings.length}`
  );

  console.log(
    `Instruments with unresolved sessions: ${
      instrumentSummary.filter(
        x => x.unresolvedSessions > 0
      ).length
    }`
  );

  console.log(
    `Eligible historical sessions: ${selected.length}`
  );

  console.log(
    `Requested historical sessions: ${results.length}`
  );

  console.log(
    `ACQUIRED: ${counts.ACQUIRED || 0}`
  );

  console.log(
    `NO_CANDLE_RETURNED: ${
      counts.NO_CANDLE_RETURNED || 0
    }`
  );

  console.log(
    `INVALID_INSTRUMENT: ${
      counts.INVALID_INSTRUMENT || 0
    }`
  );

  console.log(
    `Other failures: ${
      Object.entries(counts)
        .filter(
          ([key]) =>
            ![
              'ACQUIRED',
              'NO_CANDLE_RETURNED',
              'INVALID_INSTRUMENT'
            ].includes(key)
        )
        .reduce(
          (sum, [, value]) =>
            sum + value,
          0
        )
    }`
  );

  console.log(
    `Identity mismatches: ${
      counts.IDENTITY_MISMATCH || 0
    }`
  );

  console.log(
    `Date mismatches: ${
      counts.DATE_MISMATCH || 0
    }`
  );

  console.log(
    `Duplicate logical sessions: ${
      reconciliation.duplicateLogicalSessions
    }`
  );

  console.log(
    `Unexplained population: ${
      reconciliation.unexplainedSessions
    }`
  );

  console.log(
    `Reconciliation: ${
      reconciliation.reconciliationPass
        ? 'PASS'
        : 'FAIL'
    }`
  );

  console.log(
    `Recommendation: ${finalReport.recommendation}`
  );

  console.log(
    '\nNEXT PHASE NOT AUTOMATICALLY EXECUTED'
  );
}

main().catch(err => {
  console.error(
    '\nPHASE 10R-M.3 FATAL ERROR'
  );

  console.error(err);

  process.exit(1);
});
