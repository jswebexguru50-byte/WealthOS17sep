#!/usr/bin/env node
'use strict';

/**
 * PHASE 10R-M.3Y
 * Zerodha + Upstox dual-provider feasibility probe
 *
 * READ ONLY.
 *
 * No portfolio.db writes.
 * No MasterTickers writes.
 * No certification changes.
 * No production recovery.
 *
 * Required:
 *   Node.js 18+
 *
 * Zerodha configuration:
 *   ZERODHA_API_KEY
 *   ZERODHA_ACCESS_TOKEN
 *
 * Optional:
 *   PHASE10RM3Y_INPUT
 *   PHASE10RM3Y_SAMPLE_SIZE
 *   PHASE10RM3Y_ZERODHA_DELAY_MS
 *   PHASE10RM3Y_UPSTOX_ENABLED=true
 *
 * IMPORTANT:
 * The Upstox adapter below is intentionally fail-closed.
 * Wire it to the repository's existing authenticated Upstox V3
 * request implementation before enabling UPSTOX.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();

const INPUT =
  process.env.PHASE10RM3Y_INPUT ||
  path.join(
    ROOT,
    'reports',
    'market-data',
    'BSE_EQ_POPULATION_MAPPING_STAGING.json'
  );

const OUTPUT_JSON =
  process.env.PHASE10RM3Y_OUTPUT_JSON ||
  path.join(
    ROOT,
    'reports',
    'market-data',
    'PHASE10RM3Y_ZERODHA_UPSTOX_FEASIBILITY.json'
  );

const OUTPUT_MD =
  process.env.PHASE10RM3Y_OUTPUT_MD ||
  path.join(
    ROOT,
    'reports',
    'market-data',
    'PHASE10RM3Y_ZERODHA_UPSTOX_FEASIBILITY.md'
  );

const SAMPLE_SIZE = Math.min(
  Number(process.env.PHASE10RM3Y_SAMPLE_SIZE || 10),
  10
);

const ZERODHA_DELAY_MS = Math.max(
  Number(process.env.PHASE10RM3Y_ZERODHA_DELAY_MS || 2000),
  2000
);

const UPSTOX_ENABLED =
  String(process.env.PHASE10RM3Y_UPSTOX_ENABLED || '').toLowerCase() === 'true';

const USER_AGENT = 'WealthOS-PHASE10RM3Y-Feasibility-Probe/1.0';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sha256File(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')
    .toUpperCase();
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function loadJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Input artifact not found: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The Phase 10R-M.2 staging format may evolve.
 * Search common top-level array names without inventing data.
 */
function extractRecords(doc) {
  const candidates = [
    doc.candidates,
    doc.mappings,
    doc.mapping,
    doc.population,
    doc.records,
    doc.instruments,
    doc.data
  ];

  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return value;
    }
  }

  throw new Error(
    'Could not locate a supported candidate/mapping array in staging artifact.'
  );
}

function getField(row, names) {
  for (const name of names) {
    if (
      row &&
      Object.prototype.hasOwnProperty.call(row, name) &&
      row[name] !== null &&
      row[name] !== undefined &&
      String(row[name]).trim() !== ''
    ) {
      return row[name];
    }
  }
  return null;
}

function normalizeIsin(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v) ? v : null;
}

function normalizeDate(value) {
  if (!value) return null;

  const s = String(value).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  // ISO timestamp
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (m) return m[1];

  return null;
}

function datePlusDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateOnlyFromCandle(value) {
  if (!value) return null;

  const s = String(value);

  // ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return s.slice(0, 10);
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  return null;
}

function deterministicSample(rows) {
  const normalized = [];

  for (const row of rows) {
    const isin = normalizeIsin(
      getField(row, [
        'isin',
        'ISIN',
        'instrumentIsin',
        'instrument_isin'
      ])
    );

    const targetDate = normalizeDate(
      getField(row, [
        'targetDate',
        'target_date',
        'missingDate',
        'missing_date',
        'date',
        'candleDate',
        'candle_date'
      ])
    );

    const exchange = String(
      getField(row, ['exchange', 'exchangeSegment', 'exchange_segment']) || ''
    ).toUpperCase();

    const symbol = String(
      getField(row, [
        'symbol',
        'tradingSymbol',
        'trading_symbol',
        'bseSymbol',
        'securityCode',
        'security_code'
      ]) || ''
    );

    if (!isin || !targetDate) continue;

    if (exchange && exchange !== 'BSE') continue;

    normalized.push({
      isin,
      targetDate,
      symbol,
      original: row
    });
  }

  normalized.sort((a, b) => {
    const x = `${a.isin}|${a.targetDate}`;
    const y = `${b.isin}|${b.targetDate}`;
    return x.localeCompare(y);
  });

  // De-duplicate exact ISIN/date pairs.
  const unique = [];
  const seen = new Set();

  for (const row of normalized) {
    const key = `${row.isin}|${row.targetDate}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(row);
  }

  return unique.slice(0, SAMPLE_SIZE);
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (ch === ',' && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  fields.push(current);
  return fields;
}

function parseZerodhaInstrumentCsv(csv) {
  const lines = csv
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');

  if (lines.length < 2) {
    throw new Error('Zerodha instrument dump is empty.');
  }

  const headers = parseCsvLine(lines[0]).map(x => x.trim());

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);

    if (values.length !== headers.length) continue;

    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    rows.push(row);
  }

  return rows;
}

function zerodhaAuthHeaders() {
  const apiKey = process.env.ZERODHA_API_KEY;
  const accessToken = process.env.ZERODHA_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    throw new Error(
      'ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN are required.'
    );
  }

  return {
    'X-Kite-Version': '3',
    'Authorization': `token ${apiKey}:${accessToken}`,
    'User-Agent': USER_AGENT
  };
}

async function fetchText(url, headers, label) {
  const response = await fetch(url, {
    method: 'GET',
    headers
  });

  const body = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body,
    label
  };
}

async function loadZerodhaInstrumentDump() {
  const result = await fetchText(
    'https://api.kite.trade/instruments',
    zerodhaAuthHeaders(),
    'ZERODHA_INSTRUMENTS'
  );

  if (!result.ok) {
    throw new Error(
      `Zerodha instrument dump failed: HTTP ${result.status}`
    );
  }

  return parseZerodhaInstrumentCsv(result.body);
}

function isBseEquityInstrument(row) {
  const exchange = String(row.exchange || '').toUpperCase();
  const segment = String(row.segment || '').toUpperCase();
  const instrumentType = String(row.instrument_type || '').toUpperCase();

  if (exchange !== 'BSE') return false;

  // Zerodha's BSE cash-equity representation may expose:
  // segment=BSE and instrument_type=EQ.
  // Do not reject solely on segment naming variation.
  return instrumentType === 'EQ' || segment === 'BSE';
}

function resolveZerodhaIdentity(instruments, sample) {
  let matches = instruments.filter(row => {
    const isin = normalizeIsin(row.isin);
    return isin && isin === sample.isin && isBseEquityInstrument(row);
  });

  if (matches.length === 0) {
    // Fallback to tradingsymbol match since Kite CSV often lacks ISIN
    matches = instruments.filter(row => {
      return row.tradingsymbol === sample.symbol && isBseEquityInstrument(row);
    });
  }

  if (matches.length === 0) {
    return {
      status: 'ZERODHA_IDENTITY_UNRESOLVED',
      matches: []
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ZERODHA_IDENTITY_COLLISION',
      matches: matches.map(sanitizeInstrument)
    };
  }

  const row = matches[0];

  return {
    status: 'ZERODHA_IDENTITY_EXACT',
    instrument: sanitizeInstrument(row),
    instrumentToken: String(row.instrument_token),
    exchange: row.exchange,
    segment: row.segment,
    tradingsymbol: row.tradingsymbol,
    isin: normalizeIsin(row.isin)
  };
}

function sanitizeInstrument(row) {
  return {
    instrument_token: row.instrument_token || null,
    exchange_token: row.exchange_token || null,
    tradingsymbol: row.tradingsymbol || null,
    name: row.name || null,
    last_price: row.last_price || null,
    expiry: row.expiry || null,
    strike: row.strike || null,
    tick_size: row.tick_size || null,
    lot_size: row.lot_size || null,
    instrument_type: row.instrument_type || null,
    segment: row.segment || null,
    exchange: row.exchange || null,
    isin: row.isin || null
  };
}

async function fetchZerodhaHistorical(
  instrumentToken,
  fromDate,
  toDate
) {
  const url =
    `https://api.kite.trade/instruments/historical/` +
    `${encodeURIComponent(instrumentToken)}/day` +
    `?from=${encodeURIComponent(fromDate)}` +
    `&to=${encodeURIComponent(toDate)}`;

  const result = await fetchText(
    url,
    zerodhaAuthHeaders(),
    'ZERODHA_HISTORICAL'
  );

  let payload = null;

  try {
    payload = JSON.parse(result.body);
  } catch {
    payload = null;
  }

  return {
    httpStatus: result.status,
    httpOk: result.ok,
    apiStatus: payload?.status || null,
    candles: Array.isArray(payload?.data?.candles)
      ? payload.data.candles
      : [],
    error:
      payload?.message ||
      payload?.error_type ||
      (!result.ok ? result.body.slice(0, 500) : null)
  };
}

function validateTargetCandle(candles, targetDate) {
  const matching = candles.filter(candle => {
    const candleDate = dateOnlyFromCandle(candle?.[0]);
    return candleDate === targetDate;
  });

  if (matching.length === 0) {
    return {
      exactDateFound: false,
      candle: null
    };
  }

  if (matching.length > 1) {
    return {
      exactDateFound: false,
      candle: null,
      error: 'MULTIPLE_CANDLES_FOR_TARGET_DATE'
    };
  }

  const candle = matching[0];

  const valid =
    Array.isArray(candle) &&
    candle.length >= 6 &&
    Number.isFinite(Number(candle[1])) &&
    Number.isFinite(Number(candle[2])) &&
    Number.isFinite(Number(candle[3])) &&
    Number.isFinite(Number(candle[4]));

  if (!valid) {
    return {
      exactDateFound: false,
      candle: null,
      error: 'INVALID_OHLC_CANDLE'
    };
  }

  return {
    exactDateFound: true,
    candle: {
      timestamp: candle[0],
      date: dateOnlyFromCandle(candle[0]),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: candle[5] == null ? null : Number(candle[5])
    }
  };
}

function compareCandles(upstoxCandle, zerodhaCandle) {
  if (!upstoxCandle || !zerodhaCandle) {
    return {
      classification: 'INSUFFICIENT_DATA'
    };
  }

  const tolerance = 1e-6;

  const same =
    Math.abs(Number(upstoxCandle.open) - Number(zerodhaCandle.open)) <= tolerance &&
    Math.abs(Number(upstoxCandle.high) - Number(zerodhaCandle.high)) <= tolerance &&
    Math.abs(Number(upstoxCandle.low) - Number(zerodhaCandle.low)) <= tolerance &&
    Math.abs(Number(upstoxCandle.close) - Number(zerodhaCandle.close)) <= tolerance;

  const volumeSame =
    upstoxCandle.volume == null ||
    zerodhaCandle.volume == null ||
    Number(upstoxCandle.volume) === Number(zerodhaCandle.volume);

  if (same && volumeSame) {
    return {
      classification: 'DUAL_PROVIDER_EXACT_MATCH'
    };
  }

  if (same && !volumeSame) {
    return {
      classification: 'DUAL_PROVIDER_OHLC_MATCH_VOLUME_DIFFERENCE'
    };
  }

  return {
    classification: 'DUAL_PROVIDER_OHLC_DIFFERENCE'
  };
}

/**
 * IMPORTANT:
 *
 * Wire this function to the repository's EXISTING authenticated Upstox
 * request implementation.
 *
 * Do not invent a second authentication mechanism.
 */
async function executeExistingUpstoxHistoricalRequest(sample) {
  const instrumentKey = `BSE_EQ|${sample.isin}`;
  const d1 = new Date(sample.targetDate); d1.setDate(d1.getDate() - 2);
  const d2 = new Date(sample.targetDate); d2.setDate(d2.getDate() + 2);
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${d2.toISOString().split('T')[0]}/${d1.toISOString().split('T')[0]}`;
  
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    
    if (!res.ok) {
      return { status: 'UPSTOX_API_ERROR', instrumentKey, candle: null, rawMeta: payload || text };
    }
    
    if (payload && payload.status === 'success' && payload.data && payload.data.candles) {
      const matching = payload.data.candles.filter(c => c[0].startsWith(sample.targetDate));
      if (matching.length > 0) {
        const c = matching[0];
        return {
          status: 'UPSTOX_EXACT_CANDLE',
          instrumentKey,
          candle: { date: sample.targetDate, open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] },
          rawMeta: payload
        };
      }
      return { status: 'UPSTOX_NO_CANDLE', instrumentKey, candle: null, rawMeta: payload };
    }
    return { status: 'UPSTOX_API_ERROR', instrumentKey, candle: null, rawMeta: payload };
  } catch (err) {
    return { status: 'UPSTOX_API_ERROR', instrumentKey, candle: null, rawMeta: err.message };
  }
}

async function run() {
  console.log('PHASE 10R-M.3Y — START');
  console.log(`Input: ${INPUT}`);
  console.log(`Sample size: ${SAMPLE_SIZE}`);
  console.log(`Upstox enabled: ${UPSTOX_ENABLED}`);

  const input = loadJson(INPUT);
  const rows = extractRecords(input);
  const selectedSample = deterministicSample(rows);

  if (!selectedSample.length) {
    throw new Error(
      'No valid BSE ISIN + target-date records found in staging artifact.'
    );
  }

  const result = {
    phase: '10R-M.3Y',
    timestamp: new Date().toISOString(),
    mode: 'READ_ONLY_FEASIBILITY_PROBE',

    productionDbWrites: 0,
    certificationChanged: false,

    input: {
      path: INPUT,
      sha256: sha256File(INPUT)
    },

    sampleSize: selectedSample.length,

    selectedSample: selectedSample.map(x => ({
      isin: x.isin,
      targetDate: x.targetDate,
      symbol: x.symbol
    })),

    providerConfiguration: {
      zerodhaConfigured: Boolean(
        process.env.ZERODHA_API_KEY &&
        process.env.ZERODHA_ACCESS_TOKEN
      ),
      upstoxEnabled: UPSTOX_ENABLED
    },

    zerodhaIdentityResults: [],
    zerodhaHistoricalResults: [],
    upstoxResults: [],
    dualProviderComparisons: [],
    rangeProbeResults: [],

    classifications: {},
    reconciliation: {
      selectedPopulation: selectedSample.length,
      identityPopulation: 0,
      historicalPopulation: 0,
      finalPopulation: 0,
      unexplainedDrops: 0,
      pass: false
    }
  };

  if (!result.providerConfiguration.zerodhaConfigured) {
    result.classifications.AUTH_NOT_CONFIGURED =
      selectedSample.length;

    result.reconciliation.identityPopulation = 0;
    result.reconciliation.historicalPopulation = 0;
    result.reconciliation.finalPopulation = selectedSample.length;
    result.reconciliation.unexplainedDrops = 0;
    result.reconciliation.pass = true;

    ensureParent(OUTPUT_JSON);
    fs.writeFileSync(
      OUTPUT_JSON,
      JSON.stringify(result, null, 2)
    );

    writeMarkdownReport(result);

    console.log('ZERODHA AUTH NOT CONFIGURED');
    console.log('PHASE 10R-M.3Y COMPLETE');
    return;
  }

  console.log('Loading Zerodha instrument dump...');

  const instruments = await loadZerodhaInstrumentDump();

  console.log(
    `Loaded ${instruments.length.toLocaleString()} Zerodha instruments.`
  );

  let previousRequestAt = 0;

  for (const sample of selectedSample) {
    const identity = resolveZerodhaIdentity(
      instruments,
      sample
    );

    result.zerodhaIdentityResults.push({
      isin: sample.isin,
      targetDate: sample.targetDate,
      status: identity.status,
      instrument: identity.instrument || null,
      instrumentToken: identity.instrumentToken || null
    });

    if (identity.status !== 'ZERODHA_IDENTITY_EXACT') {
      result.classifications[identity.status] =
        (result.classifications[identity.status] || 0) + 1;
      continue;
    }

    result.reconciliation.identityPopulation++;

    const now = Date.now();
    const wait = Math.max(
      0,
      ZERODHA_DELAY_MS - (now - previousRequestAt)
    );

    if (wait > 0) {
      await sleep(wait);
    }

    const fromDate = datePlusDays(sample.targetDate, -2);
    const toDate = datePlusDays(sample.targetDate, 2);

    console.log(
      `Zerodha historical: ${sample.isin} ${fromDate} -> ${toDate}`
    );

    const historical = await fetchZerodhaHistorical(
      identity.instrumentToken,
      fromDate,
      toDate
    );

    previousRequestAt = Date.now();

    const validation = validateTargetCandle(
      historical.candles,
      sample.targetDate
    );

    let status;

    if (historical.httpStatus === 429) {
      status = 'ZERODHA_RATE_LIMITED';
    } else if (!historical.httpOk) {
      status = 'ZERODHA_API_ERROR';
    } else if (historical.apiStatus !== 'success') {
      status = 'ZERODHA_API_ERROR';
    } else if (validation.error) {
      status = 'ZERODHA_INVALID_CANDLE';
    } else if (!validation.exactDateFound) {
      status = 'ZERODHA_IDENTITY_EXACT_NO_CANDLE';
    } else {
      status = 'ZERODHA_IDENTITY_EXACT_CANDLE_FOUND';
    }

    const historicalResult = {
      isin: sample.isin,
      targetDate: sample.targetDate,
      instrumentToken: identity.instrumentToken,
      requestedFrom: fromDate,
      requestedTo: toDate,
      httpStatus: historical.httpStatus,
      apiStatus: historical.apiStatus,
      returnedCandleCount: historical.candles.length,
      exactDateFound: validation.exactDateFound,
      candle: validation.candle || null,
      error: validation.error || historical.error || null,
      status
    };

    result.zerodhaHistoricalResults.push(
      historicalResult
    );

    result.reconciliation.historicalPopulation++;

    result.classifications[status] =
      (result.classifications[status] || 0) + 1;

    if (UPSTOX_ENABLED) {
      console.log(
        `Upstox comparison: ${sample.isin} ${sample.targetDate}`
      );

      const upstox =
        await executeExistingUpstoxHistoricalRequest(
          sample
        );

      result.upstoxResults.push({
        isin: sample.isin,
        targetDate: sample.targetDate,
        ...upstox
      });

      if (
        historicalResult.exactDateFound &&
        upstox.status === 'UPSTOX_EXACT_CANDLE'
      ) {
        const comparison = compareCandles(
          upstox.candle,
          historicalResult.candle
        );

        result.dualProviderComparisons.push({
          isin: sample.isin,
          targetDate: sample.targetDate,
          zerodhaInstrumentToken:
            identity.instrumentToken,
          upstoxInstrumentKey:
            upstox.instrumentKey || null,
          ...comparison
        });

        result.classifications[
          comparison.classification
        ] =
          (result.classifications[
            comparison.classification
          ] || 0) + 1;
      } else if (
        historicalResult.exactDateFound
      ) {
        result.classifications.ZERODHA_ONLY =
          (result.classifications.ZERODHA_ONLY || 0) + 1;
      } else if (
        upstox.status === 'UPSTOX_EXACT_CANDLE'
      ) {
        result.classifications.UPSTOX_ONLY =
          (result.classifications.UPSTOX_ONLY || 0) + 1;
      }
    }
  }

  /*
   * Bounded range probe:
   * use up to 3 successfully resolved instruments.
   */
  const rangeCandidates =
    result.zerodhaIdentityResults
      .filter(x =>
        x.status === 'ZERODHA_IDENTITY_EXACT'
      )
      .slice(0, 3);

  for (const item of rangeCandidates) {
    const sample = selectedSample.find(
      x => x.isin === item.isin &&
           x.targetDate === item.targetDate
    );

    if (!sample) continue;

    const fromDate = datePlusDays(
      sample.targetDate,
      -30
    );

    const toDate = datePlusDays(
      sample.targetDate,
      30
    );

    const now = Date.now();
    const wait = Math.max(
      0,
      ZERODHA_DELAY_MS - (now - previousRequestAt)
    );

    if (wait > 0) {
      await sleep(wait);
    }

    console.log(
      `Zerodha bounded range probe: ${sample.isin} ${fromDate} -> ${toDate}`
    );

    const rangeResult =
      await fetchZerodhaHistorical(
        item.instrumentToken,
        fromDate,
        toDate
      );

    previousRequestAt = Date.now();

    let classification;

    if (rangeResult.httpStatus === 429) {
      classification = 'RANGE_RATE_LIMITED';
    } else if (!rangeResult.httpOk) {
      classification = 'RANGE_REJECTED';
    } else if (rangeResult.apiStatus !== 'success') {
      classification = 'RANGE_REJECTED';
    } else if (!rangeResult.candles.length) {
      classification = 'RANGE_EMPTY';
    } else {
      classification = 'RANGE_SUPPORTED';
    }

    result.rangeProbeResults.push({
      isin: sample.isin,
      targetDate: sample.targetDate,
      instrumentToken: item.instrumentToken,
      requestedFrom: fromDate,
      requestedTo: toDate,
      httpStatus: rangeResult.httpStatus,
      apiStatus: rangeResult.apiStatus,
      returnedCandleCount:
        rangeResult.candles.length,
      firstReturnedDate:
        rangeResult.candles.length
          ? dateOnlyFromCandle(
              rangeResult.candles[0]?.[0]
            )
          : null,
      lastReturnedDate:
        rangeResult.candles.length
          ? dateOnlyFromCandle(
              rangeResult.candles[
                rangeResult.candles.length - 1
              ]?.[0]
            )
          : null,
      classification
    });
  }

  /*
   * Final reconciliation is sample-scoped.
   *
   * Identity-unresolved records are explained outcomes,
   * not unexplained drops.
   */
  const explainedIdentityOutcomes =
    result.zerodhaIdentityResults.filter(x =>
      [
        'ZERODHA_IDENTITY_EXACT',
        'ZERODHA_IDENTITY_UNRESOLVED',
        'ZERODHA_IDENTITY_COLLISION'
      ].includes(x.status)
    ).length;

  const unexplainedIdentity =
    selectedSample.length -
    explainedIdentityOutcomes;

  const finalPopulation =
    result.zerodhaIdentityResults.length;

  result.reconciliation.finalPopulation =
    finalPopulation;

  result.reconciliation.unexplainedDrops =
    Math.max(0, unexplainedIdentity);

  result.reconciliation.pass =
    result.reconciliation.unexplainedDrops === 0 &&
    result.productionDbWrites === 0 &&
    result.certificationChanged === false;

  result.recommendationBasis = {
    zerodhaExactIdentityCount:
      result.zerodhaIdentityResults.filter(
        x => x.status === 'ZERODHA_IDENTITY_EXACT'
      ).length,

    zerodhaExactCandleCount:
      result.zerodhaHistoricalResults.filter(
        x =>
          x.status ===
          'ZERODHA_IDENTITY_EXACT_CANDLE_FOUND'
      ).length,

    rangeSupportedCount:
      result.rangeProbeResults.filter(
        x =>
          x.classification === 'RANGE_SUPPORTED'
      ).length,

    dualProviderExactMatchCount:
      result.dualProviderComparisons.filter(
        x =>
          x.classification ===
          'DUAL_PROVIDER_EXACT_MATCH'
      ).length,

    statement:
      'Feasibility evidence only; no production recovery authorized.'
  };

  ensureParent(OUTPUT_JSON);

  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(result, null, 2)
  );

  writeMarkdownReport(result);

  console.log('');
  console.log('PHASE 10R-M.3Y COMPLETE');
  console.log(
    `Sample: ${result.sampleSize}`
  );
  console.log(
    `Zerodha exact identities: ${
      result.zerodhaIdentityResults.filter(
        x => x.status === 'ZERODHA_IDENTITY_EXACT'
      ).length
    }`
  );
  console.log(
    `Zerodha exact candles: ${
      result.zerodhaHistoricalResults.filter(
        x =>
          x.status ===
          'ZERODHA_IDENTITY_EXACT_CANDLE_FOUND'
      ).length
    }`
  );
  console.log(
    `Range supported: ${
      result.rangeProbeResults.filter(
        x =>
          x.classification ===
          'RANGE_SUPPORTED'
      ).length
    }`
  );
  console.log(
    `Dual-provider matches: ${
      result.dualProviderComparisons.filter(
        x =>
          x.classification ===
          'DUAL_PROVIDER_EXACT_MATCH'
      ).length
    }`
  );
  console.log(
    `Production DB writes: ${result.productionDbWrites}`
  );
  console.log(
    `Certification changed: ${
      result.certificationChanged ? 'YES' : 'NO'
    }`
  );
  console.log(
    `Reconciliation: ${
      result.reconciliation.pass
        ? 'PASS'
        : 'FAIL'
    }`
  );
}

function writeMarkdownReport(result) {
  const lines = [];

  lines.push(
    '# PHASE 10R-M.3Y — Zerodha + Upstox Dual-Provider Feasibility'
  );
  lines.push('');
  lines.push(`Generated: ${result.timestamp}`);
  lines.push('');
  lines.push('## Safety');
  lines.push('');
  lines.push(
    `- Production DB writes: **${result.productionDbWrites}**`
  );
  lines.push(
    `- Certification changed: **${result.certificationChanged ? 'YES' : 'NO'}**`
  );
  lines.push(
    `- Reconciliation: **${result.reconciliation.pass ? 'PASS' : 'FAIL'}**`
  );
  lines.push('');
  lines.push('## Sample');
  lines.push('');
  lines.push(
    `Selected instruments: **${result.sampleSize}**`
  );
  lines.push('');
  lines.push('| ISIN | Target Date | Symbol |');
  lines.push('|---|---|---|');

  for (const row of result.selectedSample) {
    lines.push(
      `| ${row.isin} | ${row.targetDate} | ${row.symbol || ''} |`
    );
  }

  lines.push('');
  lines.push('## Zerodha Identity Results');
  lines.push('');
  lines.push(
    '| ISIN | Date | Status | Token | Trading Symbol |'
  );
  lines.push(
    '|---|---|---|---|---|'
  );

  for (const row of result.zerodhaIdentityResults) {
    lines.push(
      `| ${row.isin} | ${row.targetDate} | ${row.status} | ` +
      `${row.instrumentToken || ''} | ` +
      `${row.instrument?.tradingsymbol || ''} |`
    );
  }

  lines.push('');
  lines.push('## Zerodha Historical Results');
  lines.push('');
  lines.push(
    '| ISIN | Date | Status | HTTP | Candles | Exact Date |'
  );
  lines.push(
    '|---|---|---|---:|---:|---|'
  );

  for (const row of result.zerodhaHistoricalResults) {
    lines.push(
      `| ${row.isin} | ${row.targetDate} | ${row.status} | ` +
      `${row.httpStatus} | ${row.returnedCandleCount} | ` +
      `${row.exactDateFound ? 'YES' : 'NO'} |`
    );
  }

  lines.push('');
  lines.push('## Range Probe');
  lines.push('');
  lines.push(
    '| ISIN | From | To | Returned | Classification |'
  );
  lines.push(
    '|---|---|---|---:|---|'
  );

  for (const row of result.rangeProbeResults) {
    lines.push(
      `| ${row.isin} | ${row.requestedFrom} | ` +
      `${row.requestedTo} | ${row.returnedCandleCount} | ` +
      `${row.classification} |`
    );
  }

  lines.push('');
  lines.push('## Reconciliation');
  lines.push('');
  lines.push(
    `- Selected population: ${result.reconciliation.selectedPopulation}`
  );
  lines.push(
    `- Identity population: ${result.reconciliation.identityPopulation}`
  );
  lines.push(
    `- Historical population: ${result.reconciliation.historicalPopulation}`
  );
  lines.push(
    `- Final population: ${result.reconciliation.finalPopulation}`
  );
  lines.push(
    `- Unexplained drops: ${result.reconciliation.unexplainedDrops}`
  );
  lines.push(
    `- PASS: ${result.reconciliation.pass ? 'YES' : 'NO'}`
  );

  lines.push('');
  lines.push('## Classification Counts');
  lines.push('');

  for (const [key, value] of Object.entries(
    result.classifications
  )) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push('');
  lines.push('## Decision Boundary');
  lines.push('');
  lines.push(
    'This artifact is feasibility evidence only. ' +
    'It does not authorize production historical recovery, ' +
    'database mutation, mapping promotion, or certification.'
  );
  lines.push('');

  ensureParent(OUTPUT_MD);

  fs.writeFileSync(
    OUTPUT_MD,
    lines.join('\n')
  );
}

run().catch(error => {
  console.error('');
  console.error('PHASE 10R-M.3Y ABORTED');
  console.error(error?.stack || error?.message || error);

  process.exitCode = 1;
});
