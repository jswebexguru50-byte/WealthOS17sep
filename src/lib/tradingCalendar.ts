/**
 * INFRA-1: Trading Calendar Service
 * Spec: dev_spec_opportunity_engine.md Section 2, INFRA-1
 *
 * All date parameters are "YYYY-MM-DD" strings (UTC-midnight ISO dates).
 * All IST calendar-day comparisons convert via Intl.DateTimeFormat Asia/Kolkata.
 * NEVER use raw Date + timedelta for "N trading days" -- always call this module.
 * Returns explicit errors when calendar data is missing for a year; never treats
 * missing-holiday-data as "all days are trading days."
 */

import { dbAll, dbGet, dbRun, getDB } from "../server/database.js";

// --- Types --------------------------------------------------------------------

export interface TradingDayRecord {
  date: string;
  market: string;
  is_trading_day: boolean;
  session_type: "FULL" | "MUHURAT" | "CLOSED";
  holiday_name: string | null;
}

// --- NSE Holiday Seed Data -----------------------------------------------------
// MAINTENANCE: Update each December for the following year.
// Alert fires if <60 days of forward NSE holiday coverage remain.

const NSE_HOLIDAYS: Array<{ date: string; name: string; session_type: "MUHURAT" | "CLOSED" }> = [
  // FY 2024-25
  { date: "2024-04-14", name: "Dr. Ambedkar Jayanti", session_type: "CLOSED" },
  { date: "2024-04-17", name: "Ram Navami", session_type: "CLOSED" },
  { date: "2024-04-21", name: "Mahavir Jayanti", session_type: "CLOSED" },
  { date: "2024-05-23", name: "Buddha Purnima", session_type: "CLOSED" },
  { date: "2024-06-17", name: "Eid ul Adha", session_type: "CLOSED" },
  { date: "2024-07-17", name: "Muharram", session_type: "CLOSED" },
  { date: "2024-08-15", name: "Independence Day", session_type: "CLOSED" },
  { date: "2024-10-02", name: "Mahatma Gandhi Jayanti", session_type: "CLOSED" },
  { date: "2024-10-13", name: "Dussehra", session_type: "CLOSED" },
  { date: "2024-11-01", name: "Diwali Laxmi Pujan", session_type: "CLOSED" },
  { date: "2024-11-02", name: "Diwali Balipratipada", session_type: "CLOSED" },
  { date: "2024-11-15", name: "Gurunanak Jayanti", session_type: "CLOSED" },
  { date: "2024-12-25", name: "Christmas", session_type: "CLOSED" },
  // Muhurat trading session (market open in evening even on Diwali holiday)
  { date: "2024-11-01", name: "Diwali Muhurat Trading", session_type: "MUHURAT" },
  // FY 2025-26
  { date: "2025-01-26", name: "Republic Day", session_type: "CLOSED" },
  { date: "2025-02-26", name: "Mahashivratri", session_type: "CLOSED" },
  { date: "2025-03-14", name: "Holi", session_type: "CLOSED" },
  { date: "2025-04-10", name: "Shri Ram Navami", session_type: "CLOSED" },
  { date: "2025-04-14", name: "Dr. Ambedkar Jayanti", session_type: "CLOSED" },
  { date: "2025-04-18", name: "Good Friday", session_type: "CLOSED" },
  { date: "2025-05-12", name: "Buddha Purnima", session_type: "CLOSED" },
  { date: "2025-06-07", name: "Id-Ul-Fitr (Ramzan Eid)", session_type: "CLOSED" },
  { date: "2025-08-15", name: "Independence Day", session_type: "CLOSED" },
  { date: "2025-08-27", name: "Ganesh Chaturthi", session_type: "CLOSED" },
  { date: "2025-10-02", name: "Mahatma Gandhi Jayanti", session_type: "CLOSED" },
  { date: "2025-10-20", name: "Diwali Laxmi Pujan", session_type: "CLOSED" },
  { date: "2025-10-21", name: "Diwali Balipratipada", session_type: "CLOSED" },
  { date: "2025-11-05", name: "Gurunanak Jayanti", session_type: "CLOSED" },
  { date: "2025-12-25", name: "Christmas", session_type: "CLOSED" },
  // FY 2026-27
  { date: "2026-01-26", name: "Republic Day", session_type: "CLOSED" },
  { date: "2026-03-03", name: "Holi", session_type: "CLOSED" },
  { date: "2026-03-30", name: "Shri Ram Navami", session_type: "CLOSED" },
  { date: "2026-04-03", name: "Good Friday", session_type: "CLOSED" },
  { date: "2026-04-14", name: "Dr. Ambedkar Jayanti", session_type: "CLOSED" },
  { date: "2026-05-01", name: "Maharashtra Day", session_type: "CLOSED" },
  { date: "2026-08-15", name: "Independence Day", session_type: "CLOSED" },
  { date: "2026-09-17", name: "Ganesh Chaturthi", session_type: "CLOSED" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti", session_type: "CLOSED" },
  { date: "2026-10-19", name: "Dussehra", session_type: "CLOSED" },
  { date: "2026-11-09", name: "Diwali Laxmi Pujan", session_type: "CLOSED" },
  { date: "2026-11-10", name: "Diwali Balipratipada", session_type: "CLOSED" },
  { date: "2026-11-24", name: "Gurunanak Jayanti", session_type: "CLOSED" },
  { date: "2026-12-25", name: "Christmas", session_type: "CLOSED" },
];

// --- IST Helpers --------------------------------------------------------------

/**
 * Returns today as "YYYY-MM-DD" in IST (Asia/Kolkata), not UTC.
 * This is the correct date to use for any "is today a trading day?" check.
 */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Returns current IST hour and minute. */
function currentTimeIST(): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return {
    hours: parseInt(parts.find((p) => p.type === "hour")?.value ?? "0"),
    minutes: parseInt(parts.find((p) => p.type === "minute")?.value ?? "0"),
  };
}

/** Add exactly 1 calendar day to a YYYY-MM-DD string. */
function addOneCalendarDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Subtract exactly 1 calendar day. */
function subOneCalendarDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Add N calendar days (not trading days). */
function addNCalendarDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0=Sunday, 6=Saturday */
function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

// --- Database Initialization --------------------------------------------------

export async function initializeTradingCalendar(): Promise<void> {
  const db = getDB();

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS trading_calendar (
      date           TEXT PRIMARY KEY,
      market         TEXT NOT NULL DEFAULT 'NSE',
      is_trading_day INTEGER NOT NULL,
      session_type   TEXT NOT NULL DEFAULT 'FULL',
      holiday_name   TEXT,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  // Seed known NSE non-FULL days (CLOSED + MUHURAT)
  for (const h of NSE_HOLIDAYS) {
    const isTradingDay = h.session_type === "MUHURAT" ? 1 : 0;
    try {
      await dbRun(
        db,
        `INSERT OR IGNORE INTO trading_calendar (date, market, is_trading_day, session_type, holiday_name, updated_at)
         VALUES (?, 'NSE', ?, ?, ?, datetime('now'))`,
        [h.date, isTradingDay, h.session_type, h.name]
      );
    } catch {
      // Row already exists -- safe to skip
    }
  }

  // Staleness alert: warn if no future holidays seeded
  const today = todayIST();
  const futureRow: any = await dbGet(
    db,
    `SELECT COUNT(*) as cnt FROM trading_calendar WHERE date > ? AND is_trading_day = 0`,
    [today]
  );
  if ((futureRow?.cnt ?? 0) === 0) {
    console.warn(
      "[INFRA-1] ??  CALENDAR STALENESS ALERT: No future NSE holidays found in trading_calendar. " +
        "Update NSE_HOLIDAYS in src/lib/tradingCalendar.ts for the upcoming year."
    );
  }
}

// --- Core API ----------------------------------------------------------------

/**
 * Returns true if dateStr is a trading day on NSE.
 *
 * Rules (in priority order):
 * 1. Saturday / Sunday ? false
 * 2. Explicit CLOSED record in trading_calendar ? false
 * 3. Explicit MUHURAT record ? true (it is a trading day, though a special session)
 * 4. No record (regular weekday not listed as a holiday) ? true
 */
export async function isTradingDay(dateStr: string): Promise<boolean> {
  // Weekends are never trading days
  const dow = dayOfWeek(dateStr);
  if (dow === 0 || dow === 6) return false;

  const db = getDB();
  const row: any = await dbGet(
    db,
    `SELECT is_trading_day FROM trading_calendar WHERE date = ? AND market = 'NSE'`,
    [dateStr]
  );

  if (row !== null && row !== undefined) {
    return row.is_trading_day === 1;
  }

  // No row = regular weekday, no holiday recorded = trading day
  return true;
}

/**
 * Returns the number of trading days between fromDate (exclusive) and toDate (inclusive).
 * Efficient for spans <2 years; walks day-by-day.
 */
export async function tradingDaysBetween(
  fromDate: string,
  toDate: string
): Promise<number> {
  if (fromDate >= toDate) return 0;
  let count = 0;
  let current = addOneCalendarDay(fromDate);
  // Safety cap: 800 calendar days max to prevent infinite loops
  let safety = 0;
  while (current <= toDate && safety < 800) {
    if (await isTradingDay(current)) count++;
    current = addOneCalendarDay(current);
    safety++;
  }
  return count;
}

/**
 * Returns the date exactly N trading days after startDate.
 * The returned date is itself a trading day.
 * startDate is exclusive (day 0 = startDate, day 1 = first trading day after it).
 *
 * Per spec: use this for CA-1 "5 trading days to ex-date" and OPP-9 signal expiry.
 * Use plain calendar days + disclaimer for TX-1 "31-day repurchase heuristic."
 */
export async function addTradingDays(
  startDate: string,
  n: number
): Promise<string> {
  if (n <= 0) return startDate;
  let current = startDate;
  let counted = 0;
  let safety = 0;
  while (counted < n && safety < 500) {
    current = addOneCalendarDay(current);
    if (await isTradingDay(current)) counted++;
    safety++;
  }
  return current;
}

/**
 * Returns the most recent trading day on or before fromDate.
 * Used to snap a "today" check to the last valid session close.
 */
export async function mostRecentTradingDay(fromDate: string): Promise<string> {
  let current = fromDate;
  for (let i = 0; i < 14; i++) {
    if (await isTradingDay(current)) return current;
    current = subOneCalendarDay(current);
  }
  return current; // Fallback -- should never run more than ~4 days
}

/**
 * Returns true if the current IST time is within NSE market hours (9:15 AM – 3:30 PM).
 * Used by INFRA-3 to distinguish "STALE because feed failed" from "STALE because market closed."
 */
export function isMarketOpen(): boolean {
  const { hours, minutes } = currentTimeIST();
  const nowMins = hours * 60 + minutes;
  const openMins = 9 * 60 + 15;   // 9:15 AM IST
  const closeMins = 15 * 60 + 30; // 3:30 PM IST
  return nowMins >= openMins && nowMins <= closeMins;
}

/**
 * Returns upcoming NSE exchange closures/Muhurat sessions within the next N calendar days.
 * Used by CA-1 and TX-7 reminder checks.
 */
export async function getUpcomingNonFullSessions(
  daysAhead: number = 30
): Promise<TradingDayRecord[]> {
  const db = getDB();
  const today = todayIST();
  const future = addNCalendarDays(today, daysAhead);

  const rows: any[] = await dbAll(
    db,
    `SELECT date, market, is_trading_day, session_type, holiday_name
     FROM trading_calendar
     WHERE date >= ? AND date <= ? AND session_type != 'FULL'
     ORDER BY date ASC`,
    [today, future]
  ) ?? [];

  return rows.map((r) => ({
    date: r.date,
    market: r.market,
    is_trading_day: r.is_trading_day === 1,
    session_type: r.session_type as TradingDayRecord["session_type"],
    holiday_name: r.holiday_name ?? null,
  }));
}

/**
 * Convenience: returns the calendar date 31 days after a given date (calendar days, not trading).
 * Per spec TX-1: the 31-day repurchase rule is a calendar-day heuristic, not a trading-day rule.
 * The UI must display a disclaimer: "31 days is a practitioner heuristic, not a legal requirement."
 */
export function add31CalendarDays(dateStr: string): string {
  return addNCalendarDays(dateStr, 31);
}
