/**
 * authenticity_audit.ts — Gate 29: Test Authenticity & Provenance Audit
 *
 * Detailed code-level forensic audit of all 120 test cases in scripts/readiness/scrip_lifecycle/
 * Classifies each test according to:
 * - REAL_PRODUCTION_PATH: Directly invokes production service/engine and asserts actual returned state.
 * - INDEPENDENT_ORACLE: Independently derives expected outputs mathematically against raw source data.
 * - FIXTURE_TEST: Asserts properties of a local inline mock, constant, or synthetic fixture.
 * - STATIC_ASSERTION: Hardcodes status: 'PASS' without executing logic or uses an empty loop.
 * - SELF_REFERENTIAL: Tests a locally created lambda/function defined inside the test harness itself.
 * - UNPROVEN: Assumes invariant or catches error and forces passed = true without proof.
 */

export interface TestAuthenticityAuditRecord {
  id: string;
  name: string;
  lane: string;
  file: string;
  classification: 'REAL_PRODUCTION_PATH' | 'INDEPENDENT_ORACLE' | 'FIXTURE_TEST' | 'STATIC_ASSERTION' | 'SELF_REFERENTIAL' | 'UNPROVEN';
  invokesProductionCode: boolean;
  readsProductionData: boolean;
  independentlyDerives: boolean;
  findingDetails: string;
}

export const LIFECYCLE_TEST_AUDIT_LEDGER: TestAuthenticityAuditRecord[] = [
  // ─── LANE L0: EXISTING INTEGRITY (11 Checks) ──────────────────────────────
  {
    id: 'L0-TSC',
    name: 'TypeScript Compilation Integrity',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Runs execSync("npx tsc --noEmit") on entire codebase.'
  },
  {
    id: 'L0-V2-ACCEPTANCE',
    name: 'V2 Final Machine Acceptance Gate',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Reads V2_FINAL_ACCEPTANCE.json artifact and asserts overallAcceptance === true.'
  },
  {
    id: 'L0-REALITY-ORACLE',
    name: 'Reality Oracle 110/110 Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Runs evaluateGoldenCompaniesRealityOracle across 11 benchmark companies.'
  },
  {
    id: 'L0-WALK-THE-TALK',
    name: 'Walk-the-Talk Retrospective Reality Gate',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Runs buildWalkTheTalkRealityReport across 5 retrospective companies.'
  },
  {
    id: 'L0-BROWSER-ACCEPTANCE',
    name: 'Browser Acceptance Product Journeys',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Reads V2_BROWSER_ACCEPTANCE.json artifact validating Playwright/E2E browser journeys.'
  },
  {
    id: 'L0-GET-ZERO-WRITE',
    name: 'GET Zero-Write Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Asserts Gate 4 regression test status and validates read-only contracts.'
  },
  {
    id: 'L0-REFRESH-IDEMPOTENCE',
    name: 'Refresh Idempotence Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Asserts Gate 4 regression test status for repeated refresh idempotence.'
  },
  {
    id: 'L0-NO-BLACK-BOX-SCORE',
    name: 'No Black-Box Score Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Scans for prohibited rating/composite score fields across API payloads.'
  },
  {
    id: 'L0-SYMBOL-FREE-ANALYTICS',
    name: 'Symbol-Free Analytics Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Checks SectorArchetypeRegistry and BusinessModelClassifier for symbol-free routing.'
  },
  {
    id: 'L0-QUOTA-RESERVE',
    name: 'Trendlyne Protected Interactive Quota Reserve',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries trendlyne_quota_ledger in SQLite and asserts daily_limit - daily_used >= 100.'
  },
  {
    id: 'L0-NO-BROKER-EXECUTION',
    name: 'Zero Broker Execution Invariant',
    lane: 'L0_INTEGRITY',
    file: 'laneL0_existing_integrity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Verifies PaperTradingPotService isolation from live broker order endpoints.'
  },

  // ─── LANE A: DISCOVERY & IDENTITY (E2E-001 to E2E-017) ────────────────────
  {
    id: 'E2E-001',
    name: 'Exact ticker search (ASHIANA -> Ashiana Housing Ltd)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers table and runs SecurityIdentityRegistry.resolveSecurityId.'
  },
  {
    id: 'E2E-002',
    name: 'Company name search ("Ashiana Housing" -> canonical ASHIANA)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers WHERE name LIKE "%Ashiana Housing%" directly via SQL.'
  },
  {
    id: 'E2E-003',
    name: 'Partial name search ("Ashiana" -> relevant results, no duplicates)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers WHERE name LIKE "%Ashiana%" and verifies unique ISIN resolution.'
  },
  {
    id: 'E2E-004',
    name: 'Ambiguous ticker: STYL -> Seshaasai Technologies, NOT Stylam',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Invokes SecurityIdentityRegistry.resolveSecurityId("STYL") and checks MasterTickers.'
  },
  {
    id: 'E2E-005',
    name: 'Similar company: Stylam -> STYLAMIND (INE239C01020)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Invokes SecurityIdentityRegistry.resolveSecurityId("STYLAMIND") and checks MasterTickers.'
  },
  {
    id: 'E2E-006',
    name: 'Invalid ticker -> explicit NOT_FOUND / IDENTITY_REVIEW',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Invokes SecurityIdentityRegistry.resolveSecurityId with invalid symbol "INVALID_ZZZZ_TICKER".'
  },
  {
    id: 'E2E-007',
    name: 'Fundamental discovery (TITAN, SUNPHARMA, BEL recalculated conditions)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_facts directly for preselected symbols (TITAN, SUNPHARMA, BEL) rather than running discovery engine first.'
  },
  {
    id: 'E2E-008',
    name: 'Technical discovery (RELIANCE, TATAMOTORS, TATASTEEL recalculated from DuckDB)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries DuckDbAdjustedOhlcvService for preselected symbols (RELIANCE, TATAMOTORS, TATASTEEL).'
  },
  {
    id: 'E2E-009',
    name: 'Multi-filter discovery (1 company, N distinct provenance reasons)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Verifies DYCL in MasterTickers and DuckDbAdjustedOhlcvService.'
  },
  {
    id: 'E2E-010',
    name: 'Fundamental + technical dual discovery (retains both provenance chains)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Verifies ICICIBANK facts in company_facts and bars in DuckDbAdjustedOhlcvService.'
  },
  {
    id: 'E2E-011',
    name: 'Near miss boundary exclusion (threshold 15.0%, actual 14.99% -> FAIL)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Defines local inline test function: evaluateBoundary(14.99, 15.0) and asserts === false. Does not invoke production screener.'
  },
  {
    id: 'E2E-012',
    name: 'Missing data integrity (missing metric does NOT become 0 or pass)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Defines local inline test function: evaluateMetricWithMissing(null, 15.0) and asserts passed === false.'
  },
  {
    id: 'E2E-013',
    name: 'Cross-source reconciliation (MasterTickers + Registry + DuckDB align on TCS)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers, SecurityIdentityRegistry, and DuckDbAdjustedOhlcvService for TCS.'
  },
  {
    id: 'E2E-014',
    name: 'Symbol collision prevention (STYL != STYLAMIND zero cross-contamination)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers and SecurityIdentityRegistry for both STYL and STYLAMIND.'
  },
  {
    id: 'E2E-015',
    name: 'Renamed security continuity (ARE&M / AMARAJABAT canonical ISIN INE885A01032)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers and company_facts for ARE&M ISIN continuity.'
  },
  {
    id: 'E2E-016',
    name: 'Delisted / inactive security protection (cannot appear as active candidate)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries MasterTickers WHERE status != "ACTIVE".'
  },
  {
    id: 'E2E-017',
    name: 'IPO short history handling (no fake 200-day MA when bars < 200)',
    lane: 'BOT_A',
    file: 'laneA_discovery_identity.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries DuckDbAdjustedOhlcvService for BAJAJHFL bars and evaluates bar count.'
  },

  // ─── LANE B: FUNDAMENTALS & VALUATION (33 Checks) ──────────────────────────
  {
    id: 'E2E-018',
    name: 'Raw -> Canonical fact normalization (20/20 verified)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries 20 actual rows from company_facts and asserts schema/structure.'
  },
  {
    id: 'E2E-019',
    name: 'Annual vs Quarterly period separation (FY26 != Q4 FY26)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_facts periodType distribution directly in SQLite.'
  },
  {
    id: 'E2E-020',
    name: 'TTM calculation reproducibility from valid trailing periods',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Queries 5 rows and sets const passed = true directly without recalculation.'
  },
  {
    id: 'E2E-021',
    name: 'Standalone vs Consolidated isolation (zero silent mixing)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_facts scope column in SQLite.'
  },
  {
    id: 'E2E-022',
    name: 'Unit conversion consistency (rupees, lakhs, crores, millions)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Defines local convertToCrores lambda inside test and evaluates test constant.'
  },
  {
    id: 'E2E-023',
    name: 'Missing value representation (explicit MISSING, never 0)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Defines local formatValue lambda inside test and passes null.'
  },
  {
    id: 'E2E-024',
    name: 'Conflicting provider data retention and resolution provenance',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Queries nonexistent table fundamental_metric_conflicts, catches error, and sets passed = true.'
  },
  {
    id: 'E2E-025',
    name: 'Point-in-time future leakage prevention (zero look-ahead bias)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_facts with asOfDate filter to check lookahead leakage.'
  },
  {
    id: 'E2E-026',
    name: 'Financial restatement audit provenance (historical knowledge preserved)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-027',
    name: 'Corporate announcement publication timing (zero PIT violations)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_events broadcast timestamps in SQLite.'
  },
  {
    id: 'E2E-028',
    name: 'Business segment reconciliation against regulatory filings',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Invokes CompanyIntelligenceOrchestrator for TCS and checks business segments.'
  },
  {
    id: 'E2E-029',
    name: 'Geographic revenue split reconciliation (Domestic vs Export)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Invokes CompanyIntelligenceOrchestrator for TCS and checks geographic splits.'
  },
  {
    id: 'E2E-030',
    name: 'Capacity and utilization evidence traceability',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-031',
    name: 'Customer concentration disclosure bounds',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-032',
    name: 'Zero narrative invention (missing driver disappears, not AI hallucinated)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-033',
    name: 'Revenue & PAT growth mathematical recalculation',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes growth formula ((120 - 100)/100 * 100) = 20% on test numbers.'
  },
  {
    id: 'E2E-034',
    name: '3Y/5Y Compound Annual Growth Rate (CAGR) recalculation',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes CAGR math on test constants ((172.8/100)^(1/3) - 1).'
  },
  {
    id: 'E2E-035',
    name: 'EBITDA and PAT margin derivation from canonical inputs',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes margin math on test numbers.'
  },
  {
    id: 'E2E-036',
    name: 'ROE & ROCE mathematical calculation from balance sheet & P&L',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes ROE & ROCE math on test numbers.'
  },
  {
    id: 'E2E-037',
    name: 'Cash conversion decomposition (ASHIANA CFO ₹342cr vs PAT ₹118cr WC advance flag)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline classifyCashConversion function with hardcoded 342 and 118.'
  },
  {
    id: 'E2E-038',
    name: 'Abnormal growth base-effect flagging (ASHIANA +224.9% PAT growth -> PEG normalized)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline evaluatePegWithBaseEffect function with hardcoded 224.9% growth.'
  },
  {
    id: 'E2E-039',
    name: 'Loss-making company valuation handling (IDEA negative PAT -> P/E unavailable)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline computePeRatio function with hardcoded negative net profit.'
  },
  {
    id: 'E2E-040',
    name: 'Negative equity handling (P/B unavailable for eroded net worth)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline computePbRatio function with negative book value.'
  },
  {
    id: 'L8-SECTOR',
    name: 'Sector intelligence specialization (Banking vs Real Estate vs Tech vs Capital Goods)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Queries SectorArchetypeRegistry for Banking, Real Estate, Technology, Capital Goods archetypes.'
  },
  {
    id: 'E2E-052',
    name: 'P/E multiple calculation (Market Cap / TTM PAT)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes P/E math on test numbers (1500 / 100 = 15).'
  },
  {
    id: 'E2E-053',
    name: 'P/B multiple calculation (Market Cap / Net Worth)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes P/B math on test numbers (1000 / 500 = 2).'
  },
  {
    id: 'E2E-054',
    name: 'Enterprise Value calculation (Market Cap + Total Debt - Cash & Liquid Investments)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes EV formula (100000 + 20000 - 5000 = 115000).'
  },
  {
    id: 'E2E-055',
    name: 'EV/EBITDA ratio derivation and reconciliation',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes EV/EBITDA ratio on test numbers.'
  },
  {
    id: 'E2E-056',
    name: 'Historical valuation multiple context (vs 3Y/5Y own historical band)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-057',
    name: 'Peer valuation comparability (strictly economically relevant peers)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-058',
    name: 'Exceptional earnings normalization before valuation multiple application',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes 500 - 200 = 300 Cr normalized PAT on test numbers.'
  },
  {
    id: 'E2E-059',
    name: 'Price target provenance (explicit forecast * target multiple derivation)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: true,
    findingDetails: 'Computes EPS 25 * 20x P/E = 500 on test numbers.'
  },
  {
    id: 'E2E-060',
    name: 'Zero invented price target (ASHIANA ₹480/₹560 classified as TECHNICAL, never fair value)',
    lane: 'BOT_B',
    file: 'laneB_fundamentals_valuation.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline classifyTargetType function with hardcoded target.'
  },

  // ─── LANE C: MANAGEMENT, CATALYST, RISK (11 Checks) ────────────────────────
  {
    id: 'E2E-041',
    name: 'Management statement extraction (speaker + date + source + excerpt)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Calls buildWalkTheTalkRealityReport and asserts speaker/date/source/excerpt fields.'
  },
  {
    id: 'E2E-042',
    name: 'Commitment detection (measurable commitment separated from broad aspiration)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline classifyCommitment function with string literals.'
  },
  {
    id: 'E2E-043',
    name: 'Historical outcome retrieval from subsequent audited evidence',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Checks actualValue in commitments from buildWalkTheTalkRealityReport.'
  },
  {
    id: 'E2E-044',
    name: 'Computed outcome status (deterministic MET, PARTIALLY_MET, MISSED classification)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Checks status breakdown from buildWalkTheTalkRealityReport.'
  },
  {
    id: 'E2E-045',
    name: 'Zero inference without evidence (unobserved commitments never guess status)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-046',
    name: 'Guidance change and contradiction detection (PAYTM surfaces both statements)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion without querying PAYTM statements.'
  },
  {
    id: 'E2E-047',
    name: 'Management intelligence deterministic replay (identical outputs on re-run)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Re-runs buildWalkTheTalkRealityReport and asserts matching commitment counts.'
  },
  {
    id: 'E2E-048',
    name: 'Two-sided catalyst engine (ASHIANA ₹1,000cr land program -> Growth + Capital Risk)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with hardcoded details.'
  },
  {
    id: 'E2E-049',
    name: 'Risk provenance (every emitted risk backed by empirical evidence and citation)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with hardcoded details.'
  },
  {
    id: 'E2E-050',
    name: 'Risk engine dynamic resolution (risk clears when condition is remediated)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline evaluatePledgeRisk function with hardcoded values 35% and 0%.'
  },
  {
    id: 'E2E-051',
    name: 'Zero boilerplate risk pollution (TCS/INFY receive zero irrelevant commodity risks)',
    lane: 'BOT_C',
    file: 'laneC_management_catalyst_risk.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with hardcoded details.'
  },

  // ─── LANE D: MARKET DATA & STRATEGIES (11 Checks) ──────────────────────────
  {
    id: 'E2E-061',
    name: 'Latest bar session validity (matches latest active exchange session)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls DuckDbAdjustedOhlcvService for RELIANCE and checks latest trade_date.'
  },
  {
    id: 'E2E-062',
    name: 'Strict chronological bar sequencing (date[i] > date[i-1])',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Iterates through DuckDB bars and verifies ascending dates.'
  },
  {
    id: 'E2E-063',
    name: 'Zero duplicate records (unique symbol + date invariant)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Checks for duplicate dates in DuckDB bar maps.'
  },
  {
    id: 'E2E-064',
    name: 'OHLC candlestick geometric invariant (Low <= {O,C} <= High)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Validates geometric OHLC invariants across real bars.'
  },
  {
    id: 'E2E-065',
    name: 'Volume validity (strictly non-negative and numeric)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Verifies volume >= 0 across real DuckDB bars.'
  },
  {
    id: 'E2E-066',
    name: 'Corporate action adjustment continuity (back-adjusted prices prevent artificial gap spikes)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion without inspecting split/bonus series.'
  },
  {
    id: 'E2E-067',
    name: 'Missing partition explicit coverage gap (no silent fallback or synthetic bars)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls DuckDbAdjustedOhlcvService with nonexistent symbol and verifies empty return.'
  },
  {
    id: 'E2E-068',
    name: 'Independent indicator mathematical verification (SMA20/50/200, RSI14, ATR within tolerance)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'INDEPENDENT_ORACLE',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calculates SMA, RSI, ATR using technicalindicators on raw TCS DuckDB bars.'
  },
  {
    id: 'L15-STRATEGIES-80',
    name: 'S1–S10 Comprehensive Strategy Matrix (80/80 condition verification across 10 strategies)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Contains empty nested for-loops that increment stratTestsPassed counter 80 times without calling any strategy function.'
  },
  {
    id: 'E2E-069',
    name: 'Strategy explainability: ENGINE_CONFIRMED vs PATTERN_OBSERVED (ASHIANA S2a CE regression)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline classifyTrigger(false, true) lambda inside test rather than running production engine on ASHIANA.'
  },
  {
    id: 'L17-CONVERGENCE',
    name: 'Fundamental × Technical 4-quadrant convergence (zero black-box scores, zero BUY/SELL)',
    lane: 'BOT_D',
    file: 'laneD_market_technical_strategies.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Tests local inline mapToQuadrant lambda without invoking ConsolidatedOpportunityEngine.'
  },

  // ─── LANE E: API, COCKPIT, LIFECYCLE (32 Checks) ───────────────────────────
  {
    id: 'E2E-070',
    name: 'Intelligence API module completeness (returns all configured analysis modules)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Calls CompanyIntelligenceOrchestrator.orchestrate("TCS") and checks module count.'
  },
  {
    id: 'E2E-071',
    name: 'Module error isolation (partial module degradation never crashes full response)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'FIXTURE_TEST',
    invokesProductionCode: true,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Orchestrates synthetic symbol "WAVEBTEST".'
  },
  {
    id: 'E2E-072',
    name: 'GET zero-write invariant (GET /v2/company-intelligence creates 0 DB mutations)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Captures SQLite counts before and after 3 orchestrate() calls and asserts 0 delta.'
  },
  {
    id: 'E2E-073',
    name: 'GET idempotency and deterministic repeatability across repeated calls',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls orchestrate("INFY") twice and compares symbol, module count, and pillars.'
  },
  {
    id: 'E2E-074',
    name: 'Zero runtime DDL invariant (no CREATE/ALTER/DROP TABLE in intelligence path)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-075',
    name: 'Evidence reference resolution (evidence IDs resolve to canonical facts/events)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_facts for BEL and asserts factId presence.'
  },
  {
    id: 'E2E-076',
    name: 'Explicit refresh persistence (POST .../refresh activates persist: true path)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion without making HTTP POST request.'
  },
  {
    id: 'E2E-077',
    name: 'Refresh idempotence (identical refresh creates zero duplicate fact records)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion citing unique index without executing refresh.'
  },
  {
    id: 'E2E-078',
    name: 'Snapshot versioning (changed data creates new versioned snapshot)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-079',
    name: 'Historical state reconstruction from versioned snapshots',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-080',
    name: 'Deterministic thesis state hash (changes only on economic fact alterations)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls orchestrate("RELIANCE") twice and checks thesis.result.thesisStateHash.'
  },
  {
    id: 'E2E-081',
    name: 'Investor Cockpit 8 panels completeness (no blank panel without explanation)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with hardcoded panel list.'
  },
  {
    id: 'E2E-082',
    name: 'Missing data presentation (shown explicitly as unavailable with honest reason)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-083',
    name: 'Financial number alignment (displayed UI values strictly match API response)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-084',
    name: 'Technical indicator alignment (displayed indicators match API & DuckDB)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-085',
    name: 'Evidence link resolution (all cited evidence items link to source excerpts)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-086',
    name: 'As-of date and data freshness visibility across cockpit cards',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-087',
    name: 'Zero stale cached company contamination across navigation (STYL -> STYLAMIND -> ASHIANA)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'L21-EVIDENCE-100',
    name: 'Evidence Click-Through Audit (100/100 sampled claims traceable to source facts/documents)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Hardcodes classificationBreakdown: { REPORTED: 68, DERIVED: 22, SCENARIO: 6, MISSING: 4 } in local object without sampling or tracing.'
  },
  {
    id: 'E2E-088',
    name: 'New information detection (incoming filing/announcement flagged in event stream)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-089',
    name: 'Old snapshot preservation upon new data ingestion',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-090',
    name: 'Changes panel differential calculation (surfaces exactly what changed)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-091',
    name: 'Material fundamental change propagation to affected business drivers',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-092',
    name: 'Technical price bar change triggers strategy re-evaluation',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-093',
    name: 'Unrelated modules remain stable during single-domain update',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion with durationMs: 5.'
  },
  {
    id: 'E2E-094',
    name: 'Deterministic thesis identity (same securityId -> same thesisId)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls orchestrate("TITAN") twice and asserts matching thesis ID.'
  },
  {
    id: 'E2E-095',
    name: 'Zero thesis revision without evidence alteration',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Compares thesis revisions in SQLite across consecutive read-only runs.'
  },
  {
    id: 'E2E-096',
    name: 'Material evidence change captures formal thesis revision with revision notes',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'STATIC_ASSERTION',
    invokesProductionCode: false,
    readsProductionData: false,
    independentlyDerives: false,
    findingDetails: 'Pushes static passed = true assertion.'
  },
  {
    id: 'E2E-097',
    name: 'Contradiction visibility (opposing evidence surfaces in contradiction panel)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls orchestrate("PAYTM") and checks for contradiction array.'
  },
  {
    id: 'E2E-098',
    name: 'Historical thesis continuity (prior thesis versions remain readable)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries company_thesis_revisions table directly in SQLite.'
  },
  {
    id: 'E2E-099',
    name: 'Staleness enforcement (aged facts classified as STALE/UNAVAILABLE, never current)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Calls FreshnessEngine.getInstance().evaluateFreshness with past as-of date.'
  },
  {
    id: 'E2E-100',
    name: 'Failure / chaos & Trendlyne protected interactive reserve preservation (>= 100 reserved)',
    lane: 'BOT_E',
    file: 'laneE_api_cockpit_lifecycle.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Queries trendlyne_quota_ledger in SQLite and validates reserve calculation.'
  },

  // ─── LANE F: UNIVERSE, REPLAY, REGRESSION (5 Checks) ──────────────────────
  {
    id: 'L26-UNIVERSE-SCALE',
    name: 'Universe scale reconciliation (Universe = evaluated + excluded + unavailable)',
    lane: 'BOT_F',
    file: 'laneF_universe_replay_regression.ts',
    classification: 'SELF_REFERENTIAL',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Evaluates tautology: const unavailable = totalUniverse - evaluated - excluded; const reconciled = (evaluated + excluded + unavailable) === totalUniverse; which resulted in unavailable = -516 without true semantic classification.'
  },
  {
    id: 'L27-PROVENANCE-REPLAY',
    name: 'Full provenance replay (cache clearing + deterministic re-evaluation match 5/5)',
    lane: 'BOT_F',
    file: 'laneF_universe_replay_regression.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Runs orchestrate() twice on 5 companies (TCS, INFY, HDFCBANK, RELIANCE, BEL) and asserts matching symbol and module count.'
  },
  {
    id: 'L28-ASHIANA-REGRESSION',
    name: 'ASHIANA dedicated regression pack (base effect, WC cash, 2-sided land catalyst, S1/S2 rules)',
    lane: 'BOT_F',
    file: 'laneF_universe_replay_regression.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Orchestrates ASHIANA and asserts sector === "Real Estate".'
  },
  {
    id: 'L28-STYL-REGRESSION',
    name: 'STYL dedicated regression pack (STYL != STYLAMIND, recent IPO bounds, float & indicator truth)',
    lane: 'BOT_F',
    file: 'laneF_universe_replay_regression.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: true,
    readsProductionData: true,
    independentlyDerives: false,
    findingDetails: 'Orchestrates STYL and asserts ISIN === INE04VU01023 and STYL != STYLAMIND.'
  },
  {
    id: 'SEC-32-NEGATIVE-ASSERTIONS',
    name: 'Mandatory Negative Assertions Audit (zero BUY/SELL, 0 composite scores, 0 hallucinations)',
    lane: 'BOT_F',
    file: 'laneF_universe_replay_regression.ts',
    classification: 'REAL_PRODUCTION_PATH',
    invokesProductionCode: false,
    readsProductionData: true,
    independentlyDerives: true,
    findingDetails: 'Scans database tables (CompanyTheses, company_facts) for 19 prohibited phrases and patterns.'
  }
];
