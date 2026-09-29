# V2 Remaining Gaps Report
_Wave 1 · 2026-09-29_

## Status: 4 Gaps Remain After Wave 1

---

## GAP-1: Management Commitment Indexing
**Severity:** HIGH (functional gap — module correctly returns DATA_INSUFFICIENT)
**Module affected:** MANAGEMENT, BUSINESS_DRIVERS (partial), THESIS (partial)

### Evidence
- management_claim_candidate in fere_evidence.db: 201 records for non-golden companies, 0 for golden
- ManagementClaims in portfolio.db: 0 records total
- Symbols with data: APOLLO, BHARTIARTL, BLS, HIRECT, JGCHEM, LAURUSLABS, MUFIN, POLYCAB, SOLARINDS, TEMBO, UNOMINDA, USHAMART

### Fix Path
1. Identify BSE filing download links for 10 golden company annual reports (FY24, FY25)
2. Run existing FERE claim extraction pipeline (ManagementClaimExtractor or equivalent)
3. Target: ≥5 verified management claims per company for top 5 (TCS, HDFCBANK, RELIANCE, INFY, ICICIBANK)
4. Management module auto-surfaces claims once indexed — no code change required

### Verification Test
`sql
SELECT symbol, COUNT(*) FROM management_claim_candidate 
WHERE symbol IN ('TCS','HDFCBANK','RELIANCE','INFY','ICICIBANK') 
GROUP BY symbol;
`
Expected: each symbol ≥5 rows

---

## GAP-2: Delta Comparison (First Run State)
**Severity:** LOW (by design — delta requires 2 analysis runs)
**Module affected:** DELTA, TIMELINE (proxy)

### Evidence
- CompanyDeltaEngine v2.0 is wired and working
- On first run: returns DATA_INSUFFICIENT with message "requires 2 runs"
- On second run: will compute material deltas (HIGH and MEDIUM materiality only)

### Fix Path
1. Start server: 
pm run dev
2. Call POST /api/company-intelligence/TCS/refresh for all 10 golden companies
3. Wait 24h for meaningful market movement
4. Call analysis again — delta comparison now available

---

## GAP-3: FERE Coverage by ISIN (Audit Only)
**Severity:** LOW (operational visibility, not a functional blocker)
**Module affected:** FERE

### Evidence
- erified_metric and erified_xbrl_fact tables use isin as primary key
- Audit ran by symbol; ISIN-based coverage per golden company not yet determined
- fere_evidence.db has 8 relevant tables and appears populated

### Fix Path
1. Query MasterTickers for ISINs of 10 golden companies
2. Run: SELECT COUNT(*) FROM verified_metric WHERE isin = '<ISIN>' GROUP BY isin for each
3. Report coverage to next session

---

## GAP-4: Company Facts Ingestion for Golden Companies (Medium Priority)
**Severity:** MEDIUM (impairs BusinessDriverEngine canonical fact quality)
**Module affected:** BUSINESS_DRIVERS, CONTRADICTIONS

### Evidence
- company_facts: 5,569 rows for non-golden symbols (ACCENTMIC, ADANIENSOL, etc.)
- 0 rows for RELIANCE, TCS, HDFCBANK, TATAMOTORS, TATASTEEL, INFY, ICICIBANK, SUNPHARMA, TITAN, BEL
- BusinessDriverEngine falls back to fundamental_endpoint_snapshots

### Fix Path
1. Extract ISINs from MasterTickers for golden companies
2. Populate company_facts with P&L, balance sheet, ratios from existing fundamental_endpoint_snapshots
3. This is a data transformation task (ETL), not a new data acquisition task

---

## Non-Gaps (Correctly Working)

| Component | Confirmed Working |
|-----------|-------------------|
| FundamentalModuleAdapter | ✅ 8 snapshots per golden company |
| TechnicalModuleAdapter | ✅ All golden companies |
| ValuationModuleAdapter | ✅ All golden companies |
| QGLPModuleAdapter | ✅ All golden companies |
| MarketContextModuleAdapter | ✅ All golden companies |
| BusinessDriverEngine | ✅ Wired, partial evidence |
| ContradictionEngine | ✅ Wired, runs all patterns |
| ThesisEngine | ✅ Wired, runs available pillars |
| CompanyDeltaEngine | ✅ Wired, first-run correctly |
| CompanyIntelligenceOverview | ✅ Decision-page design with evidence filter |
| UI Tabs (12 total) | ✅ All tabs functional post Wave 1 |
| TypeScript Build | ✅ Clean (code 0) |
