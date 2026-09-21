# PHASE 10R-M.3Y-Z1.1 Data-Lineage Forensics

## 1. Executive Summary
The application's technical strategy engines act as pure mathematical evaluators, decoupled from market data APIs. They do not directly fetch candles from Zerodha or Upstox. Instead, they require pre-fetched arrays of `Candle` objects, which are queried from the local SQLite database (`DailyOHLCV` and `IntradayOHLCV` tables) by runner scripts (e.g., `v65_runner_source.ts`).

## 2. Zerodha Identity Result
The staging symbol `534109` was successfully matched in the Zerodha instrument master using `exchange_token` instead of `tradingsymbol`. 
Result: `ZERODHA_CURRENT_INSTRUMENT_RESOLVED`

## 3. Strategy Signal Entry Points
- `v65_runner_source.ts` iterates through dates and invokes `pureEngine.evaluateStrategy1(candles, sym)`.
- `src/server/services/RegimeBacktestEngine.ts` evaluates strategies over historical slices.

## 4. Strategy -> Indicator -> Candle Call Graph
`v65_runner_source.ts (queryDb)` 
  -> `Candle[]` 
  -> `evaluateStrategy1()` 
  -> `technicalindicators (SMA, EMA, RSI)` 
  -> `Strategy1Result`

## 5. Canonical Candle Object
```typescript
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}
```

## 6. Candle Data Source
The `DailyOHLCV` table in SQLite. Queried via:
`SELECT trade_date, open, high, low, close, volume, turnover FROM DailyOHLCV`

## 7. Historical Data Storage
Local SQLite databases (`portfolio.db`, `portfolio_v6.3_pilot_research.db`, etc.) using the `DailyOHLCV` table for EOD and `IntradayOHLCV` for intraday.

## 8. Provider Identification
- EOD Data primarily populated via `NSE_BHAVCOPY` (seen in schema insertions and ingest scripts).
- Intraday Data is ingested directly via Upstox public endpoints (`UpstoxIntradayIngestor.ts`).

## 9. Instrument Identity Chain
`WEALTHOS_ISIN` -> `BSE_EQ_POPULATION_MAPPING_STAGING.json (symbol)` -> `Zerodha exchange_token`

## 10. Existing Historical Coverage
The SQLite databases contain extensive historical coverage, but the `data_source` is historically `NSE_BHAVCOPY`. Since NSE bhavcopies exclusively cover NSE-listed symbols, pure BSE-listed equities are inherently missing from this specific cache.

## 11. Evidence Relevant to Missing BSE Instruments
The application explicitly tracks missing dates in `reports/market-data/BSE_EQ_OPTIMIZED_STAGING.json` indicating that BSE-exclusive data was never part of the original NSE bhavcopy ingestion pipeline.

## 12. Potential Recovery Paths
- **Upstox**: The public historical API endpoint is already proven capable of fulfilling exact requested ranges (currently executing in the background).
- **Zerodha**: The identity collision/lookup issue was resolved via `exchange_token`. However, bulk historical fetches would require an active Historical API add-on subscription (which is currently returning 403).

## 13. Risks / Unknowns
No new risks discovered. The system properly abstracts the data layer from the strategy layer.

## 14. Frozen Hash Verification
All 6 core files exactly match their frozen SHA-256 control hashes (`FROZEN_CONTROL_HASH_MISMATCH` was avoided).

## 15. Safety Certification
No production writes were made. Certification state remains unchanged.

---

### IMPORTANT RECOVERY QUESTION

**"Does the existing application already possess historical OHLC/candle data that could cover any of the currently unresolved BSE instruments?"**

**NO**. 
The local SQLite `DailyOHLCV` tables are populated from `NSE_BHAVCOPY` sources. Equities exclusively listed on the BSE are structurally absent from the NSE bhavcopy files. Therefore, there is no hidden local cache of BSE historical data to recover from.

**"Where does the technical strategy engine obtain the candles from?"**
`v65_runner_source.ts` 
-> `database.ts (queryDb)` 
-> `SQLite (portfolio.db / DailyOHLCV table)` 
-> `mapped to Candle[]` 
-> `PureTechnicalStrategiesEngine`
