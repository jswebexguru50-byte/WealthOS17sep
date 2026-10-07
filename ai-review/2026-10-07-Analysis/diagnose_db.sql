-- WealthOS DB diagnostics. READ-ONLY. Run against a COPY or with: sqlite3 -readonly portfolio.db < diagnose_db.sql
-- Purpose: confirm which tables/indexes dominate size, whether the planner has statistics, and how hot queries are executed.
.timer on
.headers on
.mode column

-- 1. Is the planner flying blind? (empty or missing => no ANALYZE has ever run)
SELECT name FROM sqlite_master WHERE name = 'sqlite_stat1';
SELECT tbl, COUNT(*) AS stat_rows FROM sqlite_stat1 GROUP BY tbl ORDER BY stat_rows DESC LIMIT 5;

-- 2. Space by table and by index (needs dbstat; if "no such table: dbstat" use sqlite3_analyzer instead)
SELECT name, ROUND(SUM(pgsize)/1048576.0,1) AS mb, COUNT(*) AS pages
FROM dbstat GROUP BY name ORDER BY mb DESC LIMIT 40;

-- 3. Row counts of suspected big tables
SELECT 'Transactions', COUNT(*) FROM Transactions
UNION ALL SELECT 'HistoricalPrices', COUNT(*) FROM HistoricalPrices
UNION ALL SELECT 'PortfolioHistory', COUNT(*) FROM PortfolioHistory
UNION ALL SELECT 'RealizedGains', COUNT(*) FROM RealizedGains
UNION ALL SELECT 'Holdings', COUNT(*) FROM Holdings
UNION ALL SELECT 'DashboardDiskCache', COUNT(*) FROM DashboardDiskCache;

-- 4. Payload size of the disk cache (large JSON blobs slow the "instant" path)
SELECT cache_key, LENGTH(payload_json)/1024 AS kb, updated_at FROM DashboardDiskCache ORDER BY kb DESC LIMIT 10;

-- 5. Query plans for the dashboard hot path (look for SCAN vs SEARCH, and USE TEMP B-TREE)
EXPLAIN QUERY PLAN
SELECT portfolio, isin, symbol, SUM(realized_pnl), SUM(sell_proceeds) FROM RealizedGains GROUP BY portfolio, isin, symbol;

EXPLAIN QUERY PLAN
SELECT H.*, M.name, M.sector, COALESCE(P.base_currency,'INR')
FROM Holdings H
LEFT JOIN MasterTickers M ON (H.isin IS NOT NULL AND H.isin != '' AND M.isin = H.isin)
LEFT JOIN Portfolios P ON H.portfolio = P.name
ORDER BY H.current_value DESC;

EXPLAIN QUERY PLAN
SELECT portfolio, symbol, date, type, net_amount FROM Transactions
WHERE net_amount != 0 AND symbol IN ('RELIANCE','TCS') ORDER BY date ASC;

EXPLAIN QUERY PLAN
SELECT type, net_amount, quantity, price FROM Transactions
WHERE UPPER(type) IN ('DEPOSIT','SECURITY IN','TRANSFER IN','WITHDRAWAL','SECURITY OUT','TRANSFER OUT') AND portfolio IN ('cc9');

-- 6. Case-variant transaction types (if only canonical upper-case exists, UPPER(type) in queries is unnecessary)
SELECT type, COUNT(*) FROM Transactions GROUP BY type ORDER BY 2 DESC;

-- 7. Index usage cannot be read from SQLite directly. Use: sqlite3 portfolio.db ".expert" on real queries,
--    or run the app with the timing middleware from the report and EXPLAIN the slowest queries.
