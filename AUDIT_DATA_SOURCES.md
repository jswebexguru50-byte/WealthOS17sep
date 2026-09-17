# NRI WealthOS -- External Data Source Audit

Generated: 2026-09-09

---

## 1. Complete Data Source Inventory

| # | Service | External URL(s) | Quality Rating | Reliability | Key Data Fields | Storage Table(s) | Breaks Often? |
|---|---------|----------------|----------------|-------------|-----------------|-------------------|---------------|
| 1 | **screenerService.ts** | `https://www.screener.in/company/{SYM}/consolidated/` | SCRAPED | LOW | Company name, about, sector, industry, PE, ROCE, ROE, D/E, dividend yield, book value, face value, pros/cons, shareholding (promoter/FII/DII/public), 5yr growth metrics, quarterly results (sales, PAT, OPM), peers, concall/presentation docs | `AppConfig` (key: `screener_cache_{SYM}`) | YES -- HTML parsing, any layout change breaks all ratios |
| 2 | **screenerService.ts** | `https://www.screener.in/api/company/search/?q={SYM}` | SCRAPED | LOW | Symbol-to-URL mapping (search fallback) | (used transiently) | YES -- undocumented API |
| 3 | **FundamentalDataService.ts** | (none -- delegates to screenerService) | SCRAPED | LOW | PE, book value, dividend yield, ROCE, ROE, D/E, interest coverage, sales/PAT 5yr growth, promoter/FII/DII holding, pledged % | `FundamentalSnapshots` | YES -- inherits Screener fragility |
| 4 | **TrendlyneIntelligenceService.ts** | (none -- synthesizes from Screener data + formulas) | DERIVED | MEDIUM | DVM scores (durability/valuation/momentum), SWOT, analyst consensus, Piotroski F-Score, Altman Z-Score, institutional checklists, forecaster (fwd EPS/PE) | `AppConfig` (key: `trendlyne_intel_{SYM}`) | NO -- but quality depends on Screener input |
| 5 | **FnOIntelligenceService.ts** | `https://api.upstox.com/v2/option/chain?instrument_key={KEY}` | OFFICIAL | HIGH | PCR (OI + volume), max pain, ATM IV, IV percentile/rank, OI buildup, call/put OI totals, highest call/put OI strikes, rollover %, delivery % | `FnoDataCache` | NO -- authenticated Upstox API |
| 6 | **NseBhavcopyService.ts** | `https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv` | OFFICIAL | HIGH | OHLCV, avg price, volume, turnover, no. of trades, delivery qty, delivery % (all EQ series) | `NseBhavcopy` | RARELY -- official CSV, stable format |
| 7 | **NseBhavcopyService.ts** | `https://archives.nseindia.com/content/equities/bulk.csv` | OFFICIAL | HIGH | Bulk deals: date, symbol, client, buy/sell, qty, price | `InstitutionalDeals` | RARELY |
| 8 | **NseBhavcopyService.ts** | `https://archives.nseindia.com/content/equities/block.csv` | OFFICIAL | HIGH | Block deals: date, symbol, client, buy/sell, qty, price | `InstitutionalDeals` | RARELY |
| 9 | **NseBhavcopyService.ts** | `https://www.amfiindia.com/spages/NAVAll.txt` | OFFICIAL | HIGH | MF scheme code, ISIN, scheme name, NAV, NAV date | `MfNavHistory` | RARELY -- stable semicolon-delimited format |
| 10 | **NseBhavcopyService.ts** | `https://query1.finance.yahoo.com/v8/finance/chart/{PAIR}=X?interval=1d&range=1d` | SCRAPED | MEDIUM | Forex rates: USDINR, AEDINR, EURINR, GBPINR | `ForexRates` | SOMETIMES -- Yahoo undocumented API |
| 11 | **NewsSentimentService.ts** | `https://news.google.com/rss/search?q={QUERY}` (5 Indian site-scoped feeds) | SCRAPED | MEDIUM | Headlines, pub date, source name, content snippet | `EventIntelligenceLog` | SOMETIMES -- Google News RSS, rate limits |
| 12 | **NewsSentimentService.ts** | `https://finance.yahoo.com/rss/headline?s={SYM}` | SCRAPED | MEDIUM | US stock headlines | (in-memory only) | SOMETIMES |
| 13 | **NewsSentimentService.ts** | `https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines` | SCRAPED | MEDIUM | MarketWatch headlines (US) | (in-memory only) | SOMETIMES |
| 14 | **SmartMoneyFlowEngine.ts** | (none -- reads local `HistoricalPrices` + `yahooFinance.fetchTickerData` fallback) | DERIVED | MEDIUM | SMAS score, VWAP divergence, delivery surge, net institutional flow, block deals, sector flows | `SmartMoneySectorCache`, `DataProvenanceLog` | NO -- derived from local OHLCV |
| 15 | **MacroRegimeClassifierService.ts** | (none -- reads local Nifty prices from `MarketSnapshots` / `HistoricalPrices`) | DERIVED | MEDIUM | Regime classification (Bull/Bear/HighVol/MeanReverting), realized vol, breadth, VIX proxy, conviction multiplier | `MacroRegimeLog`, `ModelRunLedger` | NO -- pure computation |
| 16 | **MarketDataIngestorService.ts** | `https://api.upstox.com/v2/historical-candle/{instKey}/day/{to}/{from}` | OFFICIAL | HIGH | OHLCV + open interest (daily candles) | `MarketSnapshots` | NO -- authenticated Upstox API |
| 17 | **MarketDataIngestorService.ts** | `https://query1.finance.yahoo.com/v8/finance/chart/{SYM}?period1=...&period2=...&interval=1d` | SCRAPED | MEDIUM | OHLCV daily (Yahoo Finance fallback) | `MarketSnapshots` | SOMETIMES -- undocumented, rate limited |
| 18 | **yahooFinance.ts** | `https://query1.finance.yahoo.com/v8/finance/chart/{SYM}` | SCRAPED | MEDIUM | OHLCV, dividends, splits, regularMarketPrice | `HistoricalPrices` | SOMETIMES -- Yahoo changes endpoints periodically |
| 19 | **yahooFinance.ts** | `https://data.alpaca.markets/v2/stocks/bars?symbols={SYM}` | OFFICIAL | HIGH | US market OHLCV daily bars | `HistoricalPrices` | NO -- Alpaca authenticated API (US only) |
| 20 | **YouTubeResearchIntelligenceEngine.ts** | YouTube via `yt-dlp` + `faster-whisper` Python sidecar | USER-GENERATED | LOW | Video titles, channels, transcripts (via captions or Whisper STT), dialectic debates, feature proposals | `yt_knowledge_sessions`, `yt_knowledge_videos`, `yt_knowledge_debates`, `yt_knowledge_feature_proposals` | YES -- depends on yt-dlp, Whisper, Python |
| 21 | **BrokerResearchIntelligenceService.ts** | (none -- hardcoded seed data + DB storage) | DERIVED | MEDIUM | Broker name, report title, entry/target/SL prices, horizon, thesis, catalysts | `BrokerResearchReports` | NO -- manual seed, no live scraping |
| 22 | **IpoAnalysisEngine.ts** | (none -- hardcoded static IPO universe) | DERIVED | MEDIUM | IPO price band, lot size, GMP, subscription ratios, financials, peer comparison, verdict | (in-memory only) | NO -- but stale unless manually updated |
| 23 | **CorporateActionsEngine.ts** | (none -- reads local `CorporateActions` table, manual entry) | DERIVED | MEDIUM | Record date, ex-date, dividend per share, bonus/split ratio, rights price | `CorporateActions`, `rights_subscriptions` | NO -- manual data entry |
| 24 | **LiveMarketStreamService.ts** | (none -- reads local DB + `yahooFinance.fetchTickerData` for price resolution) | DERIVED | MEDIUM | Live tick prices via WebSocket to frontend | (in-memory + `MarketDataCache`) | NO -- but tick simulation, not real exchange feed |
| 25 | **OrderBookImbalanceService.ts** | (none -- returns neutral stub; no live L2 feed) | DERIVED | LOW | Order book depth, bid/ask imbalance, micro price | (in-memory only) | NO -- always returns neutral (no real L2 source) |
| 26 | **InstitutionalBuyersService.ts** | (none -- synthesizes from hardcoded registry + DB `OpportunityScripEvaluations`) | DERIVED | MEDIUM | Institutional buyer profiles, scrip accumulations, deal types, provenance claims | (in-memory + `MarketDataCache`) | NO -- but not sourced from real filings despite provenance labels |
| 27 | **ScripIntelligenceDossierService.ts** | (none -- orchestrates all other services) | DERIVED | MEDIUM | Unified dossier: outlook, catalysts, sector positioning, macro mood, demand/supply flows | (in-memory) | Depends on upstream services |

---

## 2. Scraped to Official Migration Opportunities

| Data Field (Currently Scraped) | Current Source | Official Alternative | Endpoint / File | Migration Difficulty |
|-------------------------------|---------------|---------------------|-----------------|---------------------|
| **Company fundamentals (PE, ROCE, ROE, D/E, book value, div yield)** | Screener.in HTML scraping | **BSE Corporate Filings + NSE Financial Results** | `https://api.bseindia.com/BseIndiaAPI/api/CorporateAction/...` or NSE financial results CSV | HIGH -- requires parsing XBRL/PDF filings |
| **Shareholding pattern (Promoter/FII/DII/Public %)** | Screener.in HTML scraping | **NSE Shareholding Patterns** | `https://www.nseindia.com/api/corporate-shareholding?index=equities&symbol={SYM}` or quarterly XBRL shareholding files on NSE/BSE | MEDIUM -- NSE JSON API exists but requires cookie/session handling |
| **Promoter pledge %** | Not currently captured (null) | **NSE/BSE quarterly shareholding XBRL** | Same as above -- pledge data is within shareholding pattern | MEDIUM |
| **Quarterly results (Sales, PAT, OPM)** | Screener.in HTML scraping | **NSE Financial Results API** | `https://www.nseindia.com/api/corporates/financialResults?index=equities&symbol={SYM}` | MEDIUM |
| **Peer comparison** | Screener.in HTML scraping | **NSE Sector-wise listings + BSE sector files** | Nifty sector index constituent CSVs + fundamental data per scrip | HIGH -- must build own peer engine |
| **Company pros/cons/about** | Screener.in HTML scraping | No official equivalent | (none) -- this is editorial content | N/A -- keep Screener or build own |
| **Concall/presentation documents** | Screener.in HTML scraping | **BSE Filing System / NSE Corporate Filings** | `https://www.bseindia.com/corporates/ann.html` or NSE NEAPS filings | MEDIUM |
| **Growth metrics (5yr sales/profit CAGR)** | Screener.in HTML scraping | **Compute from 5 years of NSE financial results** | Derived from annual results | MEDIUM -- requires multi-year filing history |
| **Daily OHLCV (Indian equities)** | Yahoo Finance undocumented API (fallback) | **Upstox Historical Candle API v2** (already primary) | `https://api.upstox.com/v2/historical-candle/{key}/day/{to}/{from}` | DONE -- Upstox is already primary, Yahoo is fallback |
| **Forex rates (USDINR etc.)** | Yahoo Finance chart API | **RBI Reference Rates** or **Upstox Forex** | `https://www.rbi.org.in/scripts/ReferenceRateArchive.aspx` or Upstox FX instrument candles | LOW -- simple replacement |
| **News headlines** | Google News RSS (site-scoped scraping) | **NSE/BSE Corporate Announcements API** + **Direct RSS from ET/Livemint** | NSE: `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol={SYM}` | MEDIUM -- official announcements cover regulatory events; RSS stays for media |
| **IPO data (GMP, subscription, financials)** | Hardcoded static data | **NSE IPO Dashboard + BSE IPO filings** | `https://www.nseindia.com/market-data/all-upcoming-issues-ipo` + SEBI DRHP filings | HIGH -- no single structured API |
| **Index membership (Nifty 500 etc.)** | Not currently fetched | **NSE Index Constituent CSVs** | `https://archives.nseindia.com/content/indices/ind_nifty500list.csv` (free, monthly) | LOW -- simple CSV download |
| **Free float data** | Not reliably fetched | **NSE EQUITY_L.csv** | `https://archives.nseindia.com/content/equities/EQUITY_L.csv` (free float, ISIN, face value) | LOW |
| **Circuit band limits** | Not currently fetched | **NSE Circuit Limits file** | `https://archives.nseindia.com/content/equities/circuitbreakers.csv` | LOW |

---

## 3. Strategy Data Coverage Analysis

### 10-Strategy Data Requirements vs Current App Sources

| Data Field | Needed By (Strategies) | Current Source in App | Quality | Recommended Official Source | Status |
|-----------|----------------------|---------------------|---------|---------------------------|--------|
| **Standard OHLCV (daily)** | S1-S10 (ALL) | Upstox API v2 (primary) + Yahoo Finance (fallback) | OFFICIAL/SCRAPED | Upstox API v2 + NSE Bhavcopy backup | **COVERED** -- Upstox primary working |
| **Turnover (INR lacs)** | S2, S3, S4 | NSE Bhavcopy `turnover_lacs` | OFFICIAL | NSE Bhavcopy (already used) | **COVERED** |
| **Delivery Qty** | S3, S4 | NSE Bhavcopy `deliv_qty` | OFFICIAL | NSE Bhavcopy (already used) | **COVERED** |
| **Delivery %** | S3, S4 | NSE Bhavcopy `deliv_per` | OFFICIAL | NSE Bhavcopy (already used) | **COVERED** |
| **No. of Trades** | S3, S4 | NSE Bhavcopy `no_of_trades` | OFFICIAL | NSE Bhavcopy (already used) | **COVERED** |
| **Market Cap (Cr)** | S5 | Screener.in (scraped) or `MasterTickers` table | SCRAPED | NSE EQUITY_L.csv or compute from close * shares outstanding | **MIGRATION_NEEDED** |
| **Promoter Holding %** | S8 | Screener.in (scraped, nullable) | SCRAPED | NSE quarterly shareholding XBRL | **MIGRATION_NEEDED** |
| **Free Float % / Shares** | S8, S9 | Not reliably captured | GAP | NSE EQUITY_L.csv `FREE_FLOAT` field | **GAP** |
| **Index Membership** | S6 | Not currently fetched | GAP | NSE `ind_nifty500list.csv` (free) | **GAP** |
| **Circuit Band Limit** | S6 | Not currently fetched | GAP | NSE `circuitbreakers.csv` | **GAP** |
| **Nifty 500 Daily Close** | S6, S9 | Not reliably fetched for ^CNX500 | GAP | Upstox Index Historical Candle API: `NSE_INDEX|Nifty 500` | **GAP** |
| **Nifty 50 Daily Close** | Macro Regime, general | Yahoo Finance or local `HistoricalPrices` | SCRAPED | Upstox: `NSE_INDEX|Nifty 50` (already mapped) | **MIGRATION_NEEDED** |
| **52-Week High/Low** | S1, S2, S3, S4, S6 | Computed from local OHLCV | DERIVED | (OK as-is -- computed from Upstox/Bhavcopy data) | **COVERED** |
| **15-min Intraday Candles** | S10 | Upstox Intraday Candle API | OFFICIAL | `https://api.upstox.com/v2/historical-candle/intraday/{key}/{interval}` | **COVERED** (endpoint exists, needs wiring) |
| **SMA(200), SMA(50), EMA(9/21/50)** | S1-S10 various | Computed in `MarketDataIngestorService` | DERIVED | (OK -- computed from OHLCV) | **COVERED** |
| **RSI(14)** | S1, S5, S6, S7 | Computed in `MarketDataIngestorService` | DERIVED | (OK) | **COVERED** |
| **ATR(14)** | S1, S5, S7, S10 | Computed in `MarketDataIngestorService` | DERIVED | (OK) | **COVERED** |
| **Bollinger Bands(20,2)** | S7 | Computed in `MarketDataIngestorService` | DERIVED | (OK) | **COVERED** |
| **Mansfield RS (stock/index ratio)** | S6 | Not implemented | GAP | Requires Nifty 500 daily close (see above) | **GAP** |
| **ADR(20) %** | S8, S9, S10 | Not implemented | GAP | Computed from OHLCV: `SMA((H-L)/C*100, 20)` | **GAP** (compute only, no external source needed) |
| **Linear Regression Trendline** | S10 | Not implemented | GAP | Computed locally | **GAP** (compute only) |
| **NR4 / NR7 patterns** | S1 | Not implemented | GAP | Computed from OHLCV range comparison | **GAP** (compute only) |

### Summary Counts

| Status | Count |
|--------|-------|
| COVERED | 11 |
| MIGRATION_NEEDED | 3 |
| GAP (external data not fetched) | 4 |
| GAP (derived computation not built) | 4 |
| **Total fields** | **22** |

---

## 4. Intraday Data Sources

**CRITICAL ARCHITECTURAL NOTE:**

| Timeframe | Designated Source | Status | Notes |
|-----------|-----------------|--------|-------|
| **1min, 5min, 15min, 30min, 1hour** | **Upstox Intraday Candle API v2** | Available but not fully wired for S10 | `https://api.upstox.com/v2/historical-candle/intraday/{key}/{interval}` -- requires active Upstox access token |
| **Daily (1D)** | **Upstox Historical Candle API v2** (primary) + **NSE Bhavcopy** (official backup) | Fully operational | Both sources active; Upstox primary, Yahoo fallback |
| **Daily (1D) -- fallback** | Yahoo Finance v8 chart API | Operational but fragile | Undocumented, can break without notice. Should NOT be primary |
| **Weekly / Monthly** | Aggregated from daily candles in `MarketDataIngestorService.getMultiTimeframeData()` | Operational | Computed from stored daily snapshots |

**Key constraints:**
- NSE Bhavcopy is **daily-only** -- it cannot provide intraday data
- Yahoo Finance intraday is **unreliable** for Indian equities -- inconsistent data, missing candles
- Upstox API v2 is the **only reliable intraday source** currently integrated
- Strategy S10 (Trendline ORB) requires 15-min candles -- Upstox intraday endpoint must be wired

---

## 5. Data Source Priority Ranking

| Priority | Source | Type | Data Provided | Auth Required | Cost |
|----------|--------|------|--------------|---------------|------|
| **1** | **NSE Official (archives.nseindia.com)** | OFFICIAL | Bhavcopy (EOD OHLCV + delivery + turnover), bulk/block deals, shareholding, index constituents, circuit limits, EQUITY_L.csv | No (public CSVs) | Free |
| **2** | **Upstox API v2** | OFFICIAL | OHLCV (daily + intraday), F&O option chain, instrument master, historical candles | Yes (OAuth2 access token) | Free (with Upstox account) |
| **3** | **BSE Official (bseindia.com)** | OFFICIAL | Corporate filings, shareholding patterns, financial results, corporate actions | No (public) | Free |
| **4** | **AMFI (amfiindia.com)** | OFFICIAL | Mutual fund NAVs (all schemes, daily) | No (public) | Free |
| **5** | **SEBI / Exchange filings** | OFFICIAL | SAST disclosures, FPI holdings, XBRL financial filings | No (public) | Free |
| **6** | **RBI** | OFFICIAL | Reference exchange rates (USDINR etc.) | No (public) | Free |
| **7** | **Alpaca Markets API** | OFFICIAL | US equity OHLCV (for US holdings only) | Yes (API key) | Free tier available |
| **8** | **Yahoo Finance v8** | UNOFFICIAL | OHLCV fallback, forex rates | No | Free but undocumented |
| **9** | **Screener.in** | UNOFFICIAL | Fundamentals, shareholding, growth, peers | No | Free but fragile HTML scraping |
| **10** | **Google News RSS** | UNOFFICIAL | News headlines for sentiment | No | Free but rate-limited |

---

## 6. Key Findings Summary

### Data Quality Distribution

| Quality Category | Service Count | % of Total |
|-----------------|--------------|-----------|
| OFFICIAL (NSE/BSE/Upstox/AMFI/Alpaca) | 8 external endpoints | ~35% |
| SCRAPED (Screener/Yahoo/Google News) | 7 external endpoints | ~30% |
| DERIVED (local computation, no external fetch) | 10 services | ~35% |
| USER-GENERATED (YouTube) | 1 service | ~4% |

### Critical Scraped Dependencies with Official Alternatives

1. **Screener.in fundamentals** (PE, ROCE, ROE, D/E, shareholding) -- Used by `FundamentalDataService`, `TrendlyneIntelligenceService`, `ScripIntelligenceDossierService`. **Official alternative: NSE shareholding API + BSE financial results XBRL.** This is the single largest fragility point in the system.

2. **Yahoo Finance OHLCV** -- Used as fallback by `MarketDataIngestorService`, `SmartMoneyFlowEngine`, `LiveMarketStreamService`. **Official alternative: Upstox is already primary.** Yahoo should be demoted to emergency-only fallback.

3. **Yahoo Finance Forex** -- Used by `NseBhavcopyService.syncForexRates()`. **Official alternative: RBI Reference Rate page or Upstox FX candles.**

4. **Google News RSS** -- Used by `NewsSentimentService`. **Partial alternative: NSE Corporate Announcements API for regulatory/material events.** Keep RSS for broader media coverage but add official exchange announcements as primary for governance events.

### Data Captured but Not Used by Any Strategy

| Data | Service | Observation |
|------|---------|-------------|
| MF NAV history | `NseBhavcopyService.syncAmfiNavs()` | Ingested into `MfNavHistory` but no strategy or scanner references it |
| YouTube transcripts & debates | `YouTubeResearchIntelligenceEngine` | Research tool only; no strategy integration |
| Broker research reports | `BrokerResearchIntelligenceService` | UI display only; not fed into any scanner or strategy engine |
| IPO analysis records | `IpoAnalysisEngine` | Standalone feature; hardcoded data, not integrated with opportunity scanner |
| Order book imbalance | `OrderBookImbalanceService` | Always returns neutral (no live L2 feed); adds 0 pts to SMAS score |

### Data Needed by Strategies but Not Fetched by Any Service

| Data Field | Required By | Gap Description | Fix |
|-----------|------------|-----------------|-----|
| **Index constituency (Nifty 500)** | S6 (RS Breakout) | No service downloads `ind_nifty500list.csv` | Add NSE index constituent CSV download to `NseBhavcopyService` |
| **Circuit band limits** | S6 | No service downloads `circuitbreakers.csv` | Add to `NseBhavcopyService` |
| **Free float shares** | S8, S9 | `EQUITY_L.csv` not downloaded; Screener doesn't reliably provide it | Add NSE `EQUITY_L.csv` download |
| **Nifty 500 daily close** | S6, S9 (Mansfield RS) | `^CNX500` not systematically ingested | Add Upstox index candle fetch for `NSE_INDEX|Nifty 500` |
| **DailyOHLCV unified table** | All 10 strategies | Spec calls for a unified `DailyOHLCV` table merging Bhavcopy + Upstox data; app currently has separate `NseBhavcopy`, `MarketSnapshots`, `HistoricalPrices` tables | Consolidate into single `DailyOHLCV` table per spec section 10.3 |

### Provenance Integrity Concerns

1. **InstitutionalBuyersService** labels its output as `sourceType: 'SOURCED'` with `confidencePct: 100` and references like `AMFI_MF_MONTHLY_DISCLOSURE`, but the data is actually generated from a hardcoded registry with synthetic accumulation values. This is misleading provenance.

2. **TrendlyneIntelligenceService** is named after Trendlyne but does NOT fetch from trendlyne.com. It synthesizes DVM scores, SWOT, analyst consensus, and Piotroski/Altman scores entirely from Screener.in ratios using local formulas. The analyst consensus (target prices, buy/sell counts) is fabricated from DVM scores, not sourced from any analyst database.

3. **IpoAnalysisEngine** contains hardcoded IPO data (Waaree, Swiggy, Hyundai, NTPC Green, etc.) with dates from 2024. The `multiSourceIntelligence` section references Chittorgarh, Value Research, Moneycontrol, and Zerodha Pulse ratings, but these are hardcoded strings, not fetched from those sources.

### Recommended Priority Actions

1. **HIGH** -- Add NSE official data downloads to `NseBhavcopyService`: `EQUITY_L.csv` (free float, ISIN), `ind_nifty500list.csv` (index constituents), `circuitbreakers.csv` (circuit limits). These are free, stable, and unblock strategies S6, S8, S9.

2. **HIGH** -- Consolidate `NseBhavcopy` + `MarketSnapshots` + `HistoricalPrices` into the unified `DailyOHLCV` table specified in section 10.3 of the strategy spec. Current fragmentation means strategies must query 3+ tables.

3. **HIGH** -- Wire Upstox intraday candle endpoint for 15-min data to support S10 (Trendline ORB).

4. **MEDIUM** -- Add Upstox index historical candle fetch for `NSE_INDEX|Nifty 500` and `NSE_INDEX|Nifty Bank` to fill the Mansfield RS gap.

5. **MEDIUM** -- Replace Yahoo Finance forex with RBI reference rates or Upstox FX candles.

6. **MEDIUM** -- Fix misleading provenance labels in `InstitutionalBuyersService` (change `SOURCED` to `MODELED`).

7. **LOW** -- Evaluate replacing Screener.in scraping with NSE/BSE financial results APIs for fundamental data. This is high-effort but eliminates the largest fragility point.

8. **LOW** -- Add NSE Corporate Announcements API as a structured alternative to Google News RSS for regulatory events (SEBI notices, board meetings, results announcements).
