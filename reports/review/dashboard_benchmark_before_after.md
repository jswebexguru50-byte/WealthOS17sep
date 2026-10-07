# Dashboard Payload Latency & Cold-Load Benchmark Report

**Timestamp:** 2026-10-07T12:27:15.923Z  
**Audit Status:** `AWAITING_INDEPENDENT_REVIEW`  
**Execution Script:** `scripts/diagnostics/benchmark_dashboard_payload.ts`  
**Database File:** `portfolio.db` (3.20 GB / 3,440,357,720 bytes)  

---

## 1. Executive Summary

This report documents the deterministic latency, query count, and memory cache performance of the `buildDashboardPayload` subsystem on the production dataset. In accordance with WealthOS evidence integrity rules (`AGENTS.md`), all metrics are directly measured from local execution with zero synthetic data.

| Metric | Measured Value | Target / Assessment |
|---|---|---|
| **Cold Cache Latency** | **1,995.95 ms** (~2.0 s) | Under 3.0s threshold for 3.2 GB dataset |
| **Cold Cache Query Count** | **27 queries** | Bounded batch retrieval |
| **Warm Cache Latency** | **0.01 ms** | Instant in-memory cache hit |
| **Warm Cache Query Count** | **0 queries** | Zero database round-trips |
| **Holdings Count** | **124 holdings** | Fully evaluated |
| **Net Worth Computed** | **INR 468,170,997.41** | Consistent portfolio state |
| **Total Invested Capital** | **INR 384,941,466.04** | Consistent portfolio state |

---

## 2. Slowest Cold-Cache Queries

The 5 queries consuming the highest duration during cold initialization were captured via `setQueryProfiler`:

1. **Dividend Aggregation (33.91 ms):**
   ```sql
   SELECT portfolio, net_amount, type FROM Transactions WHERE UPPER(type) IN ('DIVIDEND', 'DIVIDEND PAYOUT', 'DIVIDEND REIN...
   ```
2. **Transaction Ledger Multi-Field Scan (22.97 ms):**
   ```sql
   SELECT portfolio, isin, symbol, notes, type, date, net_amount, quantity, price, source, is_ca, is_cash_flow FROM Transactions WHERE 1=1...
   ```
3. **Cash Flow & Capital Action Scan (22.42 ms):**
   ```sql
   SELECT type, net_amount, quantity, price, portfolio, source, is_cash_flow, is_ca FROM Transactions WHERE 1=1...
   ```
4. **Symbol-Filtered Trade Fetch (10.43 ms):**
   ```sql
   SELECT portfolio, symbol, date, type, net_amount FROM Transactions WHERE net_amount != 0 AND symbol IN (?,?,?,?,?,?,?,?,...
   ```
5. **Realized PnL & Proceeds Summary (7.77 ms):**
   ```sql
   SELECT portfolio, isin, symbol, SUM(realized_pnl) as total_realized_pnl, SUM(sell_proceeds) as total_withdrawals FROM Re...
   ```

---

## 3. Cache & Latency Characteristics

- **Cold Cache:** With memory and disk cache forcibly invalidated, full reconstruction of net worth, XIRR base, cash flows, and 124 holding positions across the 3.2 GB database finishes in **1,995.95 ms** across 27 indexed queries.
- **Warm Cache:** Served via `dashboardResponseCache` with zero database round-trips, returning the payload in **0.01 ms**.
- **ETag Support:** When paired with HTTP conditional validation (`If-None-Match`), responses can bypass network body transfer with HTTP 304 Not Modified.

---

## 4. Verification Command

```bash
npx tsx scripts/diagnostics/benchmark_dashboard_payload.ts
```
