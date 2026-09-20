# FAMILYMEMBERS & P5-F FORENSIC AUDIT REPORT

## 1. Audit Executive Summary

* **Audit Target**: `src/server/database.ts` schema migrations and initialization guards.
* **Scope**: Analysis of `FamilyMembers` migration guard and `P5-F` async index creation vulnerability (`CREATE INDEX IF NOT EXISTS`).
* **Classification**:
  * `FamilyMembers`: `CODE_DEFECT` (Empty array truthy evaluation leading to `no such table` errors when table is absent).
  * `P5-F Index Robustness`: `CODE_DEFECT` / `ASYNC_RACE_DEFECT` (Un-callbacked `CREATE INDEX` execution against asynchronous table creation).

---

## 2. FamilyMembers Migration Guard Analysis

### Evidence
In `src/server/database.ts`:
```ts
db.all("PRAGMA table_info(FamilyMembers)", (fmErr, fmCols) => {
  if (fmCols) {
    const hasSenior = fmCols.some((r: any) => r.name === 'is_senior_citizen');
    ...
  }
});
```

### Forensic Finding
1. When `FamilyMembers` table does not exist in SQLite, `PRAGMA table_info(FamilyMembers)` returns an empty array `[]`.
2. In JavaScript, an empty array `[]` is truthy (`Boolean([]) === true`).
3. The check `if (fmCols)` passes even when the table is completely missing.
4. Subsequent migration operations attempt `ALTER TABLE` or `INSERT INTO FamilyMembers`, resulting in unhandled SQLite errors (`no such table: FamilyMembers`).

### Required Guard
```ts
if (fmCols && fmCols.length > 0)
```
This ensures column inspection and table seeding run **only** when the `FamilyMembers` table is actually present.

---

## 3. P5-F Index Migration Robustness Audit

### Evidence
In `src/server/database.ts` lines 2600-2770:
```ts
db.run(`CREATE TABLE IF NOT EXISTS DailyOHLCV (...)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_symbol ON DailyOHLCV(symbol)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_date ON DailyOHLCV(trade_date)`);
```

### Forensic Finding
1. `db.run` in the `sqlite3` Node.js driver executes asynchronously.
2. When `db.run('CREATE INDEX ... ON TableName')` is issued immediately following `db.run('CREATE TABLE IF NOT EXISTS TableName ...')` without passing it inside the table creation callback, SQLite places both statements in the async queue.
3. In isolated in-memory test databases (`:memory:`) or un-checkpointed databases, index creation statements fire before table creation completes, throwing `no such table: main.TableName`.
4. Impacted tables:
   * `DailyOHLCV` -> `idx_daily_ohlcv_symbol`, `idx_daily_ohlcv_date`, `idx_daily_ohlcv_source`
   * `IndexOHLCV` -> `idx_index_ohlcv_symbol`
   * `FundamentalData` -> `idx_fundamental_symbol`
   * `IntradayCandles` -> `idx_intraday_symbol_date`
   * `options_chain_snapshot` -> `idx_options_symbol_date`
   * `CustomStrategyBacktests` -> `idx_backtest_strategy`

### Recommendation
Move `CREATE INDEX IF NOT EXISTS` invocations into the callback function of `db.run(CREATE TABLE ..., () => { db.run(CREATE INDEX ...); })` to guarantee sequential table readiness before index creation.

---

## 4. Verification & Classification Summary

| Component | Target Table | Defect Type | Status | Required Action |
| :--- | :--- | :--- | :--- | :--- |
| `FamilyMembers` | `FamilyMembers` | `CODE_DEFECT` | Documented | Enforce `if (fmCols && fmCols.length > 0)` |
| `P5-F Index` | `DailyOHLCV` | `ASYNC_RACE_DEFECT` | Documented | Move index creation into `db.run` callback |
| `P5-F Index` | `FundamentalData` | `ASYNC_RACE_DEFECT` | Documented | Move index creation into `db.run` callback |
| `P5-F Index` | `IntradayCandles` | `ASYNC_RACE_DEFECT` | Documented | Move index creation into `db.run` callback |
| `P5-F Index` | `options_chain_snapshot` | `ASYNC_RACE_DEFECT` | Documented | Move index creation into `db.run` callback |
| `P5-F Index` | `CustomStrategyBacktests` | `ASYNC_RACE_DEFECT` | Documented | Move index creation into `db.run` callback |
