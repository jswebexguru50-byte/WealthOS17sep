const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = path.join(ROOT, 'data/portfolio_v6.3_pilot_research.db');

let db = null;
if (fs.existsSync(DB_PATH)) {
  db = new Database(DB_PATH, {
    readonly: true,
    fileMustExist: true
  });
}

function tableExists(name) {
  if (!db) return false;
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(name)
  );
}

function getColumns(table) {
  if (!db) return [];
  return db.prepare(
    `PRAGMA table_info("${table.replace(/"/g, '""')}")`
  ).all();
}

function findColumn(table, candidates) {
  const columns = getColumns(table)
    .map(x => x.name.toLowerCase());

  for (const candidate of candidates) {
    if (columns.includes(candidate.toLowerCase())) {
      return columns.find(
        x => x.toLowerCase() === candidate.toLowerCase()
      );
    }
  }

  return null;
}

function assertTable(table) {
  if (!tableExists(table)) {
    throw new Error(`Required table missing: ${table}`);
  }
}

function loadUniverse() {
  assertTable('historical_investable_universe');

  const symbolColumn = findColumn(
    'historical_investable_universe',
    ['symbol', 'ticker', 'tradingsymbol']
  );

  const isinColumn = findColumn(
    'historical_investable_universe',
    ['isin']
  );

  if (!symbolColumn) {
    throw new Error(
      'historical_investable_universe has no supported symbol column'
    );
  }

  const rows = db.prepare(`
    SELECT
      "${symbolColumn}" AS symbol
      ${isinColumn ? `, "${isinColumn}" AS isin` : ''}
    FROM historical_investable_universe
  `).all();

  return rows;
}

function loadOHLCV() {
  assertTable('DailyOHLCV');

  const columns = getColumns('DailyOHLCV')
    .map(x => x.name);

  const symbolColumn =
    columns.find(x =>
      ['symbol', 'ticker', 'instrument', 'instrumentKey']
        .includes(x.toLowerCase())
    );

  const dateColumn =
    columns.find(x =>
      ['date', 'observationDate', 'timestamp', 'trade_date']
        .includes(x.toLowerCase())
    );

  if (!symbolColumn || !dateColumn) {
    throw new Error(
      'DailyOHLCV lacks identifiable symbol/date columns'
    );
  }

  return db.prepare(`
    SELECT
      "${symbolColumn}" AS instrument,
      DATE("${dateColumn}") AS observationDate
    FROM DailyOHLCV
    GROUP BY
      "${symbolColumn}",
      DATE("${dateColumn}")
  `).all();
}

function loadTradingCalendar() {
  const candidates = [
    'TradingCalendar',
    'trading_calendar',
    'NSETradingCalendar',
    'market_calendar',
    'authoritative_trading_calendar'
  ];

  const table = candidates.find(tableExists);

  if (!table) {
    return null;
  }

  const dateColumn = findColumn(
    table,
    ['date', 'tradingDate', 'sessionDate']
  );

  const openColumn = findColumn(
    table,
    ['isTradingDay', 'isOpen', 'tradingDay', 'tradable']
  );

  if (!dateColumn) {
    return null;
  }

  return db.prepare(`
    SELECT DATE("${dateColumn}") AS date
    ${openColumn
      ? `, "${openColumn}" AS isTradingDay`
      : ''}
    FROM "${table}"
    ${
      openColumn
        ? `WHERE "${openColumn}" IN (1, TRUE, '1', 'TRUE')`
        : ''
    }
    ORDER BY DATE("${dateColumn}")
  `).all();
}

function key(instrument, date) {
  return `${instrument}::${date}`;
}

function main() {
  let universe = [];
  let actual = [];
  if (db) {
    try {
      universe = loadUniverse();
      actual = loadOHLCV();
    } catch(e) {
      console.error(e.message);
    }
  }

  const actualSet = new Set();
  for (const row of actual) {
    actualSet.add(key(row.instrument, row.observationDate));
  }

  const listingTableCandidates = [
    'SecurityIdentityRegistry',
    'SecurityListings',
    'security_listings',
    'HistoricalSecurityUniverse',
    'historical_investable_universe'
  ];

  const listingTable = listingTableCandidates.find(tableExists);
  const calendar = loadTradingCalendar();

  let status = 'INCOMPLETE';
  let missing = [];
  let extra = [];
  let expected = new Set();
  let reason = '';

  if (!listingTable || !calendar) {
    reason = 'Historical listing interval or authoritative trading calendar evidence unavailable; fail-closed.';
    status = 'UNVERIFIED_INCOMPLETE';
  } else {
    const listingColumns = getColumns(listingTable).map(x => x.name);
    const listingSymbol = listingColumns.find(x => ['symbol', 'ticker', 'instrument', 'instrumentKey'].includes(x.toLowerCase()));
    const listedFrom = listingColumns.find(x => ['listedfrom', 'listingdate', 'validfrom', 'effectivefrom', 'effective_from'].includes(x.toLowerCase()));
    const listedTo = listingColumns.find(x => ['listedto', 'delistingdate', 'validto', 'effectiveto', 'effective_to'].includes(x.toLowerCase()));

    if (!listingSymbol || !listedFrom) {
      reason = 'Listing table lacks necessary interval columns.';
      status = 'UNVERIFIED_INCOMPLETE';
    } else {
      const listings = db.prepare(`
        SELECT "${listingSymbol}" AS instrument, DATE("${listedFrom}") AS listedFrom ${listedTo ? `, DATE("${listedTo}") AS listedTo` : ''}
        FROM "${listingTable}"
      `).all();

      const tradingDates = calendar.filter(x => x.isTradingDay !== 0).map(x => x.date);

      for (const listing of listings) {
        for (const date of tradingDates) {
          if (date < listing.listedFrom) continue;
          if (listing.listedTo && date > listing.listedTo) continue;
          expected.add(key(listing.instrument, date));
        }
      }

      for (const k of expected) {
        if (!actualSet.has(k)) missing.push(k);
      }
      for (const k of actualSet) {
        if (!expected.has(k)) extra.push(k);
      }

      status = (missing.length === 0 && extra.length === 0) ? 'COMPLETE' : 'INCOMPLETE';
    }
  }

  const result = {
    auditVersion: '3.7.0',
    database: DB_PATH,
    universe: {
      masterTickerCount: universe.length,
      listingRecordCount: expected.size
    },
    calendar: {
      tradingSessionCount: calendar ? calendar.length : 0
    },
    coverage: {
      expectedKeyCount: expected.size,
      actualKeyCount: actualSet.size,
      missingKeyCount: missing.length,
      extraKeyCount: extra.length
    },
    status,
    reason,
    missing: missing.slice(0, 1000),
    extra: extra.slice(0, 1000)
  };

  const out = path.join(ROOT, 'reports/v65-delivery-2.2/WAVE3_7_REQUIRED_MARKET_COVERAGE.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify(result, null, 2));

  if (result.status !== 'COMPLETE') {
    process.exit(1);
  }
}

main();
