export interface TestCaseResult {
  id: string; // e2e ID, e.g. E2E-001
  name: string;
  lane: 'L0_INTEGRITY' | 'BOT_A' | 'BOT_B' | 'BOT_C' | 'BOT_D' | 'BOT_E' | 'BOT_F';
  section: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  details: string;
  evidence?: any;
  durationMs: number;
}

export interface GateSummary {
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  testCases: TestCaseResult[];
}

export interface ScripLifecycleAcceptanceArtifact {
  asOf: string;
  commit: string;
  universe: {
    companiesTested: number;
    entryRoutesTested: number;
    strategiesTested: number;
    testCohort: Array<{
      symbol: string;
      name: string;
      isin?: string;
      category: string;
      sector?: string;
    }>;
  };
  gates: {
    existingV2Regression: boolean;
    discovery: boolean;
    identity: boolean;
    canonicalFacts: boolean;
    pointInTime: boolean;
    businessUnderstanding: boolean;
    financialReasoning: boolean;
    management: boolean;
    walkTheTalk: boolean;
    catalysts: boolean;
    risks: boolean;
    valuation: boolean;
    marketData: boolean;
    technicalIndicators: boolean;
    strategies: boolean;
    api: boolean;
    browser: boolean;
    evidenceTraceability: boolean;
    monitoring: boolean;
    thesisRevision: boolean;
    failureHandling: boolean;
    deterministicReplay: boolean;
  };
  evidenceTraceability: {
    sampledClaims: number;
    verifiedClaims: number;
    classificationBreakdown: {
      REPORTED: number;
      DERIVED: number;
      SCENARIO: number;
      MISSING: number;
      PROHIBITED_AI: number;
    };
  };
  negativeAssertions: {
    scannedEntities: number;
    violationsDetected: number;
    prohibitedPatternsChecked: string[];
    passed: boolean;
  };
  laneSummaries: Record<string, {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  }>;
  failures: Array<{
    id: string;
    name: string;
    reason: string;
    remediation?: string;
  }>;
  overallAcceptance: boolean;
}
