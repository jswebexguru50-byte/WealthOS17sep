const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve('portfolio.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

function query(sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function audit() {
  console.log('[Coverage Audit] Auditing portfolio.db tables...');

  const dailyOhlcvMeta = await query("SELECT count(*) as count, min(trade_date) as minDate, max(trade_date) as maxDate, count(distinct symbol) as distinctSecurities FROM DailyOHLCV");
  const histPricesMeta = await query("SELECT count(*) as count, min(date) as minDate, max(date) as maxDate, count(distinct symbol) as distinctSecurities FROM HistoricalPrices");
  const corpActionsMeta = await query("SELECT count(*) as count, min(ex_date) as minDate, max(ex_date) as maxDate, count(distinct symbol) as distinctSecurities FROM CorporateActions");
  const finStatementsMeta = await query("SELECT count(*) as count, min(period_date) as minDate, max(period_date) as maxDate, count(distinct symbol) as distinctSecurities FROM HistoricalFinancialStatements");
  const shareholdingMeta = await query("SELECT count(*) as count, min(as_of_date) as minDate, max(as_of_date) as maxDate, count(distinct symbol) as distinctSecurities FROM HistoricalShareholdingPattern");

  const auditReport = {
    generatedAt: new Date().toISOString(),
    database: 'portfolio.db',
    sources: {
      DailyOHLCV: {
        recordCount: dailyOhlcvMeta.count,
        minDate: dailyOhlcvMeta.minDate,
        maxDate: dailyOhlcvMeta.maxDate,
        securityCoverage: dailyOhlcvMeta.distinctSecurities,
        provenance: 'Local SQLite Repository Database',
        hashability: 'Deterministic SQL query dump'
      },
      HistoricalPrices: {
        recordCount: histPricesMeta.count,
        minDate: histPricesMeta.minDate,
        maxDate: histPricesMeta.maxDate,
        securityCoverage: histPricesMeta.distinctSecurities,
        provenance: 'Local SQLite Repository Database',
        hashability: 'Deterministic SQL query dump'
      },
      CorporateActions: {
        recordCount: corpActionsMeta.count,
        minDate: corpActionsMeta.minDate,
        maxDate: corpActionsMeta.maxDate,
        securityCoverage: corpActionsMeta.distinctSecurities,
        provenance: 'Local SQLite Repository Database',
        hashability: 'Deterministic SQL query dump'
      },
      HistoricalFinancialStatements: {
        recordCount: finStatementsMeta.count,
        minDate: finStatementsMeta.minDate,
        maxDate: finStatementsMeta.maxDate,
        securityCoverage: finStatementsMeta.distinctSecurities,
        provenance: 'Local SQLite Repository Database',
        hashability: 'Deterministic SQL query dump'
      },
      HistoricalShareholdingPattern: {
        recordCount: shareholdingMeta.count,
        minDate: shareholdingMeta.minDate,
        maxDate: shareholdingMeta.maxDate,
        securityCoverage: shareholdingMeta.distinctSecurities,
        provenance: 'Local SQLite Repository Database',
        hashability: 'Deterministic SQL query dump'
      }
    }
  };

  const outDir = path.resolve('reports/v672/r2');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'DATA_SOURCE_COVERAGE_AUDIT.json');
  fs.writeFileSync(outFile, JSON.stringify(auditReport, null, 2));
  console.log('[Coverage Audit] Exported:', outFile);
  console.log(JSON.stringify(auditReport, null, 2));
  db.close();
}

audit().catch(console.error);
