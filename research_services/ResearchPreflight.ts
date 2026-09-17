import sqlite3 from "sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";

export interface PreflightResult {
  databasePath: string;
  databaseSha256: string;
  integrityCheck: string;
  foreignKeyErrors: number;
  dailyBars: number;
  symbols: number;
  dateMin: string | null;
  dateMax: string | null;

  deliveryRows: number;
  turnoverRows: number;

  calendarRows: number;
  calendarTradingRows: number;

  indexConstituentRows: number;
  corporateActionRows: number;
  corporateActionExDateRows: number;

  shareholdingRows: number;
  shareholdingAsOfRows: number;

  financialRows: number;
  financialPeriodRows: number;
}

function all<T>(
  db: sqlite3.Database,
  sql: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all<T>(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead: number;

    do {
      bytesRead = fs.readSync(
        fd,
        buffer,
        0,
        buffer.length,
        null
      );

      if (bytesRead > 0) {
        hash.update(
          buffer.subarray(
            0,
            bytesRead
          )
        );
      }
    } while (bytesRead === buffer.length);

    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

export async function runResearchPreflight(
  dbPath: string
): Promise<PreflightResult> {
  const db =
    new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READONLY
    );

  try {
    const integrity =
      await all<{ integrity_check: string }>(
        db,
        `PRAGMA integrity_check`
      );

    const integrityCheck =
      String(
        integrity[0]?.integrity_check ?? ""
      );

    if (integrityCheck !== "ok") {
      throw new Error(
        `SQLITE_INTEGRITY_CHECK_FAILED: ${integrityCheck}`
      );
    }

    const fk =
      await all<Record<string, unknown>>(
        db,
        `PRAGMA foreign_key_check`
      );

    if (fk.length > 0) {
      throw new Error(
        `SQLITE_FOREIGN_KEY_CHECK_FAILED: ${fk.length} errors`
      );
    }

    const counts =
      await all<{
        dailyBars: number;
        symbols: number;
        dateMin: string;
        dateMax: string;
        deliveryRows: number;
        turnoverRows: number;
        calendarRows: number;
        calendarTradingRows: number;
        indexConstituentRows: number;
        corporateActionRows: number;
        corporateActionExDateRows: number;
        shareholdingRows: number;
        shareholdingAsOfRows: number;
        financialRows: number;
        financialPeriodRows: number;
      }>(
        db,
        `
        SELECT
          (SELECT COUNT(*) FROM DailyOHLCV) AS dailyBars,
          (SELECT COUNT(DISTINCT symbol) FROM DailyOHLCV) AS symbols,
          (SELECT MIN(trade_date) FROM DailyOHLCV) AS dateMin,
          (SELECT MAX(trade_date) FROM DailyOHLCV) AS dateMax,

          (SELECT COUNT(*) FROM DailyOHLCV
             WHERE delivery_qty IS NOT NULL) AS deliveryRows,

          (SELECT COUNT(*) FROM DailyOHLCV
             WHERE turnover IS NOT NULL) AS turnoverRows,

          (SELECT COUNT(*) FROM trading_calendar) AS calendarRows,

          (SELECT COUNT(*) FROM trading_calendar
             WHERE is_trading_day = 1) AS calendarTradingRows,

          (SELECT COUNT(*) FROM IndexConstituents)
             AS indexConstituentRows,

          (SELECT COUNT(*) FROM CorporateActions)
             AS corporateActionRows,

          (SELECT COUNT(*) FROM CorporateActions
             WHERE ex_date IS NOT NULL)
             AS corporateActionExDateRows,

          (SELECT COUNT(*) FROM HistoricalShareholdingPattern)
             AS shareholdingRows,

          (SELECT COUNT(*) FROM HistoricalShareholdingPattern
             WHERE as_of_date IS NOT NULL)
             AS shareholdingAsOfRows,

          (SELECT COUNT(*) FROM HistoricalFinancialStatements)
             AS financialRows,

          (SELECT COUNT(*) FROM HistoricalFinancialStatements
             WHERE period_date IS NOT NULL)
             AS financialPeriodRows
        `
      );

    const c = counts[0];

    const result: PreflightResult = {
      databasePath: dbPath,
      databaseSha256: sha256File(dbPath),

      integrityCheck,
      foreignKeyErrors: fk.length,

      dailyBars: Number(c.dailyBars),
      symbols: Number(c.symbols),
      dateMin: c.dateMin ?? null,
      dateMax: c.dateMax ?? null,

      deliveryRows: Number(c.deliveryRows),
      turnoverRows: Number(c.turnoverRows),

      calendarRows: Number(c.calendarRows),
      calendarTradingRows:
        Number(c.calendarTradingRows),

      indexConstituentRows:
        Number(c.indexConstituentRows),

      corporateActionRows:
        Number(c.corporateActionRows),

      corporateActionExDateRows:
        Number(c.corporateActionExDateRows),

      shareholdingRows:
        Number(c.shareholdingRows),

      shareholdingAsOfRows:
        Number(c.shareholdingAsOfRows),

      financialRows:
        Number(c.financialRows),

      financialPeriodRows:
        Number(c.financialPeriodRows)
    };

    return result;
  } finally {
    db.close();
  }
}

export function assertResearchDataComplete(
  p: PreflightResult
) {
  const failures: string[] = [];

  if (p.deliveryRows < p.dailyBars) {
    failures.push(
      `DELIVERY_DATA_INCOMPLETE: ${p.deliveryRows}/${p.dailyBars}`
    );
  }

  if (p.turnoverRows < p.dailyBars) {
    failures.push(
      `TURNOVER_DATA_INCOMPLETE: ${p.turnoverRows}/${p.dailyBars}`
    );
  }

  if (p.calendarTradingRows === 0) {
    failures.push(
      "TRADING_CALENDAR_UNAVAILABLE"
    );
  }

  if (p.indexConstituentRows === 0) {
    failures.push(
      "HISTORICAL_INDEX_MEMBERSHIP_UNAVAILABLE"
    );
  }

  if (
    p.corporateActionRows > 0 &&
    p.corporateActionExDateRows === 0
  ) {
    failures.push(
      "CORPORATE_ACTION_EX_DATE_UNAVAILABLE"
    );
  }

  if (
    p.shareholdingRows > 0 &&
    p.shareholdingAsOfRows === 0
  ) {
    failures.push(
      "SHAREHOLDING_AS_OF_DATE_UNAVAILABLE"
    );
  }

  if (
    p.financialRows > 0 &&
    p.financialPeriodRows === 0
  ) {
    failures.push(
      "FINANCIAL_PERIOD_DATE_UNAVAILABLE"
    );
  }

  if (failures.length) {
    throw new Error(
      "DATA_INSUFFICIENT\n" +
      failures.map(x => ` - ${x}`).join("\n")
    );
  }
}
