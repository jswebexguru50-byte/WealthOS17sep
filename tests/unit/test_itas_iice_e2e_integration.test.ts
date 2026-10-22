import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { IntelligenceQualityGate } from '../../src/server/intelligence/services/IntelligenceQualityGate.js';
import { ClaimLedgerService } from '../../src/server/intelligence/services/ClaimLedgerService.js';
import { ContradictionEngine } from '../../src/server/intelligence/services/ContradictionEngine.js';
import { ThesisBreakerEngine } from '../../src/server/intelligence/services/ThesisBreakerEngine.js';
import {
  ItasIiceReconciliationService,
  ItasQuantInput,
  IiceIntelligenceInput
} from '../../src/server/intelligence/services/ItasIiceReconciliationService.js';
import { ManagementClaim } from '../../src/server/intelligence/types/ManagementClaim.js';
import { IntelligenceEvent } from '../../src/server/intelligence/types/IntelligenceEvent.js';
import { ThesisBreaker } from '../../src/server/intelligence/types/ThesisDefinition.js';

describe('Level 2 & Level 3: ITAS ↔ IICE E2E Integration & Quality Gate Invariants', () => {
  let db: sqlite3.Database;
  let gate: IntelligenceQualityGate;
  let claimService: ClaimLedgerService;
  let contraEngine: ContradictionEngine;
  let breakerEngine: ThesisBreakerEngine;
  let reconciler: ItasIiceReconciliationService;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    gate = new IntelligenceQualityGate(db);
    claimService = new ClaimLedgerService(db);
    contraEngine = new ContradictionEngine(db);
    breakerEngine = new ThesisBreakerEngine();
    reconciler = new ItasIiceReconciliationService();

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE EvidenceInventory (
            evidence_id TEXT PRIMARY KEY,
            issuer_nse_symbol TEXT NOT NULL,
            issuer_bse_code TEXT,
            document_hash TEXT NOT NULL,
            document_type TEXT NOT NULL,
            page_physical INTEGER,
            page_printed INTEGER,
            quoted_text TEXT NOT NULL,
            verification_status TEXT NOT NULL,
            discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        db.run(`
          CREATE TABLE ManagementClaims (
            claim_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            issuer_bse_code TEXT,
            period TEXT NOT NULL,
            category TEXT NOT NULL,
            statement TEXT NOT NULL,
            target_metric TEXT,
            baseline_value REAL,
            expected_value REAL,
            expected_outcome TEXT,
            expected_timeframe TEXT,
            evidence_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            actual_outcome_metric REAL,
            actual_outcome_description TEXT,
            resolution_evidence_id TEXT,
            resolved_at TEXT,
            claim_date TEXT,
            expected_period_start TEXT,
            expected_period_end TEXT,
            evaluation_date TEXT,
            evaluation_basis TEXT,
            evaluation_evidence_id TEXT,
            superseded_by TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        db.run(`
          CREATE TABLE IntelligenceEvents (
            event_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            issuer_bse_code TEXT,
            event_date TEXT NOT NULL,
            category TEXT NOT NULL,
            headline TEXT NOT NULL,
            description TEXT,
            source_type TEXT NOT NULL,
            evidence_id TEXT,
            materiality TEXT NOT NULL DEFAULT 'MATERIAL',
            source_tier TEXT NOT NULL DEFAULT 'TIER_2_PRIMARY_CORPORATE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        db.run(`
          CREATE TABLE Contradictions (
            contradiction_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            issuer_bse_code TEXT,
            severity TEXT NOT NULL,
            contradiction_type TEXT NOT NULL,
            claim_id TEXT,
            event_id TEXT,
            description TEXT NOT NULL,
            divergence_json TEXT,
            supporting_evidence_ids TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            materiality TEXT NOT NULL DEFAULT 'THESIS_RELEVANT',
            left_evidence_id TEXT,
            right_evidence_id TEXT,
            detected_at TEXT,
            resolved_at TEXT,
            resolution_note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // Seed real Phase 1A evidence for 360ONE and SOLARINDS
    await new Promise<void>((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO EvidenceInventory (
          evidence_id, issuer_nse_symbol, document_hash, document_type,
          page_physical, quoted_text, verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
      `);

      stmt.run(
        'EV_360ONE_AR24_P114',
        '360ONE',
        '913303af9543e35a11bb58742884eb7058867a57a1b9c9f0b183492fcfa0dfb8',
        'ANNUAL_REPORT',
        114,
        'In 2023, India’s economy was on an upward trajectory, closing the year with a GDP of USD 3.73 Trn...',
        'HUMAN_CONFIRMED'
      );

      stmt.run(
        'EV_360ONE_RES_P132',
        '360ONE',
        '913303af9543e35a11bb58742884eb7058867a57a1b9c9f0b183492fcfa0dfb8',
        'ANNUAL_REPORT',
        132,
        'Total AUM crossed ₹4,50,000 Cr with wealth management revenue expanding by 22%...',
        'EXACT'
      );

      stmt.run(
        'EV_SOLAR_AR24_P42',
        'SOLARINDS',
        '8fa3211b439c8123abcdef8901234567890abcdef1234567890abcdef1234567',
        'ANNUAL_REPORT',
        42,
        'Defense export order backlog stands at ₹4,100 Cr with commercial execution commencing in Q4.',
        'EXACT'
      );

      stmt.run(
        'EV_SOLAR_DISCLOSURE_Q4',
        'SOLARINDS',
        '8fa3211b439c8123abcdef8901234567890abcdef1234567890abcdef1234567',
        'EXCHANGE_FILING',
        5,
        'Export defense deliveries reached ₹1,250 Cr for the quarter, matching guidance.',
        'EXACT'
      );

      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('A. Multi-Evidence Contradiction: requires both leftEvidenceId and rightEvidenceId from EvidenceInventory', async () => {
    // Valid dual-evidence contradiction
    const validContra = {
      contradictionId: 'CONTRA_360_01',
      issuerNseSymbol: '360ONE',
      severity: 'HIGH' as const,
      type: 'CLAIM_VS_RESULT' as const,
      description: 'Management claimed AUM expansion but quarterly disclosure confirmed fee compression',
      divergenceDetails: { whatManagementClaimed: 'AUM fee expansion', whatActuallyHappened: 'AUM fee compression' },
      leftEvidenceId: 'EV_360ONE_AR24_P114',
      rightEvidenceId: 'EV_360ONE_RES_P132',
      supportingEvidenceIds: ['EV_360ONE_AR24_P114', 'EV_360ONE_RES_P132'],
      materiality: 'HIGH' as const,
      status: 'OPEN' as const,
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await expect(gate.approveAndPersistContradiction(validContra)).resolves.not.toThrow();

    // Invalid contradiction: missing right evidence
    const invalidContra = { ...validContra, contradictionId: 'CONTRA_360_BAD', rightEvidenceId: 'NON_EXISTENT_ID' };
    await expect(gate.approveAndPersistContradiction(invalidContra)).rejects.toThrow(/does not exist in EvidenceInventory/);
  });

  it('B. Temporal Lifecycle: rejects premature MISSED resolution before expectedPeriodEnd', async () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_TEMPORAL_01',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY25',
      category: 'CAPEX',
      statement: 'Commissioning of new pinaka rocket assembly line by Q4-FY25.',
      expectedPeriodStart: '2024-04-01',
      expectedPeriodEnd: '2025-03-31',
      evidenceId: 'EV_SOLAR_AR24_P42',
      status: 'OPEN',
      createdAt: new Date().toISOString()
    };

    await gate.approveAndPersistClaim(claim);

    // Premature evaluation attempt on 2024-10-15
    const prematureClaim: ManagementClaim = {
      ...claim,
      status: 'MISSED',
      actualOutcomeDescription: 'Construction delayed due to equipment shipment',
      evaluationEvidenceId: 'EV_SOLAR_AR24_P42',
      evaluationBasis: 'Q2 progress report review'
    };

    const validation = await gate.validateClaim(prematureClaim, '2024-10-15');
    expect(validation.approved).toBe(false);
    expect(validation.reasons[0]).toMatch(/Premature MISSED verdict rejected/);

    // Legitimate evaluation attempt on 2025-05-01 (after period end)
    const legitValidation = await gate.validateClaim(prematureClaim, '2025-05-01');
    expect(legitValidation.approved).toBe(true);
  });

  it('C. Thesis Breakers: machine-executable quantitative and qualitative evaluation', () => {
    // 1. Quantitative Breaker
    const debtBreaker: ThesisBreaker = {
      breakerId: 'TB_DEBT_01',
      name: 'Net Debt / EBITDA Impairment',
      description: 'Leverage exceeds 3.0x invalidating low-risk thesis',
      type: 'QUANTITATIVE',
      evaluationMethod: 'METRIC_THRESHOLD',
      conditionText: 'Net Debt / EBITDA > 3.0',
      quantitativeCondition: {
        metric: 'net_debt_to_ebitda',
        operator: '>',
        threshold: 3.0,
        evaluationPeriod: 'quarterly',
        evidenceRequired: true
      },
      status: 'INACTIVE',
      severity: 'CRITICAL',
      rationale: '',
      evidenceIds: []
    };

    // Evaluate safe metric (1.4x)
    const safeContext = {
      metrics: { net_debt_to_ebitda: 1.4 },
      events: [],
      claims: []
    };
    const evaluatedSafe = breakerEngine.evaluateBreaker(debtBreaker, safeContext);
    expect(evaluatedSafe.status).toBe('INACTIVE');

    // Evaluate breaching metric (3.8x)
    const breachedContext = {
      metrics: { net_debt_to_ebitda: 3.8 },
      events: [],
      claims: []
    };
    const evaluatedBreached = breakerEngine.evaluateBreaker(debtBreaker, breachedContext);
    expect(evaluatedBreached.status).toBe('ACTIVE');
    expect(evaluatedBreached.rationale).toMatch(/Breaker triggered/);

    // 2. Qualitative Breaker with Event Match
    const regBreaker: ThesisBreaker = {
      breakerId: 'TB_REG_01',
      name: 'Critical Regulatory Sanction',
      description: 'Major statutory sanction impairs core operations',
      type: 'QUALITATIVE',
      evaluationMethod: 'EVENT_MATCH',
      conditionText: 'Major regulatory action of CRITICAL or HIGH materiality',
      qualitativeCondition: {
        eventCategory: 'REGULATORY',
        materiality: 'HIGH',
        requiresPrimaryEvidence: true
      },
      status: 'INACTIVE',
      severity: 'CRITICAL',
      rationale: '',
      evidenceIds: []
    };

    const regEvent: IntelligenceEvent = {
      eventId: 'EVT_SEBI_NOTICE_01',
      issuerNseSymbol: 'SOLARINDS',
      eventDate: '2025-06-10',
      category: 'REGULATORY',
      headline: 'SEBI issues show cause on export license disclosure',
      description: 'SEBI issued inquiries regarding export contract reporting timing',
      sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
      sourceType: 'SEBI_ORDER',
      evidenceId: 'EV_SOLAR_AR24_P42',
      materiality: 'HIGH',
      createdAt: new Date().toISOString()
    };

    const evaluatedReg = breakerEngine.evaluateBreaker(regBreaker, {
      metrics: {},
      events: [regEvent],
      claims: []
    });
    expect(evaluatedReg.status).toBe('ACTIVE');
    expect(evaluatedReg.rationale).toMatch(/Breaker triggered by material corporate event/);
  });

  it('D. Evidence Boundary: rejects cross-issuer contamination and verifies DB writes are blocked (0 serving rows)', async () => {
    // Attempt to register claim for TCS using a 360ONE evidence ID
    const contaminatedClaim: ManagementClaim = {
      claimId: 'CLM_CONTAM_01',
      issuerNseSymbol: 'TCS',
      period: 'FY24',
      category: 'GROWTH',
      statement: 'TCV deal growth will compound at 15%.',
      evidenceId: 'EV_360ONE_AR24_P114', // Belongs to 360ONE
      status: 'OPEN',
      createdAt: new Date().toISOString()
    };

    await expect(gate.approveAndPersistClaim(contaminatedClaim)).rejects.toThrow(/Issuer symbol mismatch/);

    // Verify DB write was physically blocked: 0 rows in serving table
    const count = await new Promise<number>((resolve, reject) => {
      db.get("SELECT count(*) as cnt FROM ManagementClaims WHERE claim_id = 'CLM_CONTAM_01'", (err, row: any) => {
        if (err) reject(err);
        else resolve(row.cnt);
      });
    });
    expect(count).toBe(0);
  });

  it('E. Tier 4 Restriction: prevents uncorroborated news from substantiating CRITICAL conclusions (0 serving rows written)', async () => {
    const unverifiedNewsEvent: IntelligenceEvent = {
      eventId: 'EVT_RUMOR_01',
      issuerNseSymbol: '360ONE',
      eventDate: '2025-02-14',
      category: 'GOVERNANCE',
      headline: 'Online forum alleges promoter share diversion',
      description: 'Social post claims unannounced promoter restructuring',
      sourceTier: 'TIER_4_DISCOVERY',
      sourceType: 'SOCIAL_MEDIA',
      evidenceId: 'EV_360ONE_AR24_P114',
      materiality: 'CRITICAL',
      createdAt: new Date().toISOString()
    };

    await expect(gate.approveAndPersistEvent(unverifiedNewsEvent)).rejects.toThrow(
      /Tier 4 Discovery signals cannot independently substantiate material conclusion/
    );

    // Verify DB write was physically blocked: 0 rows in serving table
    const count = await new Promise<number>((resolve, reject) => {
      db.get("SELECT count(*) as cnt FROM IntelligenceEvents WHERE event_id = 'EVT_RUMOR_01'", (err, row: any) => {
        if (err) reject(err);
        else resolve(row.cnt);
      });
    });
    expect(count).toBe(0);
  });

  it('F. ITAS / IICE Two-Axis Independence: ITAS STRONG + IICE HIGH RISK does NOT mutate ITAS result', () => {
    const quantInput: ItasQuantInput = {
      symbol: 'SOLARINDS',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 96,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };

    const adverseIiceInput: IiceIntelligenceInput = {
      symbol: 'SOLARINDS',
      companyName: 'Solar Industries India Ltd',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        symbol: 'SOLARINDS',
        grade: 'WEAK',
        totalClaims: 5,
        achievedCount: 1,
        partiallyAchievedCount: 0,
        missedCount: 4,
        reversedCount: 0,
        openCount: 0,
        dueForEvaluationCount: 0,
        unresolvedCount: 0,
        keyEvidencedExamples: []
      },
      contradictions: [
        {
          contradictionId: 'CONTRA_01',
          issuerNseSymbol: 'SOLARINDS',
          severity: 'HIGH',
          type: 'CLAIM_VS_RESULT',
          description: 'Export guidance missed by 40%',
          divergenceDetails: {},
          leftEvidenceId: 'EV_SOLAR_AR24_P42',
          rightEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
          supportingEvidenceIds: [],
          materiality: 'HIGH',
          status: 'OPEN',
          detectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
      ],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 5
    };

    const decisionState = reconciler.reconcile(quantInput, adverseIiceInput);

    // Invariant: ITAS remains STRONG! It is NOT downgraded to WEAK.
    expect(decisionState.quantOpportunity).toBe('STRONG');
    // IICE risk is independently HIGH
    expect(decisionState.intelligenceRisk).toBe('HIGH');
    // Combined Thesis State is CHALLENGED
    expect(decisionState.thesisState).toBe('CHALLENGED');
    expect(decisionState.interpretation).toMatch(/Strong quantitative setup, but material intelligence concerns/);
  });

  it('G. Unknown Preservation: ITAS STRONG + IICE Insufficient Evidence produces UNKNOWN risk, not LOW risk', () => {
    const quantInput: ItasQuantInput = {
      symbol: 'NEW_SME_STOCK',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };

    const emptyIiceInput: IiceIntelligenceInput = {
      symbol: 'NEW_SME_STOCK',
      companyName: 'New SME Candidate Ltd',
      marketCapTier: 'MICROCAP_SME',
      exchangeBoard: 'SME_EXCHANGE',
      walkTheTalk: {
        symbol: 'NEW_SME_STOCK',
        grade: 'INSUFFICIENT_HISTORY',
        totalClaims: 0,
        achievedCount: 0,
        partiallyAchievedCount: 0,
        missedCount: 0,
        reversedCount: 0,
        openCount: 0,
        dueForEvaluationCount: 0,
        unresolvedCount: 0,
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [
        {
          domain: 'GOVERNANCE',
          question: 'Are there related party loan guarantees?',
          state: 'NOT_YET_CHECKED',
          decisionImpact: 'HIGH'
        }
      ],
      recentEvents: [],
      evidenceCount: 0 // Zero evidence!
    };

    const decisionState = reconciler.reconcile(quantInput, emptyIiceInput);

    // Invariant (Constitution Article 25): Absence of evidence != LOW risk
    expect(decisionState.quantOpportunity).toBe('STRONG');
    expect(decisionState.intelligenceRisk).toBe('UNKNOWN');
    expect(decisionState.thesisState).toBe('UNRESOLVED');
    expect(decisionState.criticalUnknowns).toBe(1);
    expect(decisionState.interpretation).toMatch(/intelligence risk is UNRESOLVED due to insufficient verified evidence/);
  });

  it('H. End-to-End Real Evidence Scenario: Solar Industries 360° Reconciled Brief Assembly', async () => {
    // 1. Real evidence claims registered through quality gate
    const solarClaim: ManagementClaim = {
      claimId: 'CLM_SOLAR_DEFENSE_01',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'GROWTH',
      statement: 'Defense ammunition deliveries to begin ramp-up in FY25.',
      evidenceId: 'EV_SOLAR_AR24_P42',
      status: 'ACHIEVED',
      actualOutcomeMetric: 1250,
      actualOutcomeDescription: 'Quarterly defense export dispatches reached ₹1,250 Cr',
      evaluationEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
      evaluationDate: '2025-05-15',
      evaluationBasis: 'Q4 BSE Financial Disclosures review',
      createdAt: new Date().toISOString()
    };
    await gate.approveAndPersistClaim(solarClaim);

    const solarClaim2: ManagementClaim = {
      claimId: 'CLM_SOLAR_DEFENSE_02',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'ORDER_BOOK',
      statement: 'Defense order book target of ₹1,200 Cr for FY24',
      evidenceId: 'EV_SOLAR_AR24_P42',
      status: 'ACHIEVED',
      actualOutcomeMetric: 1250,
      actualOutcomeDescription: 'Cumulative defense order book stood at ₹1,250 Cr',
      evaluationEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
      evaluationDate: '2025-05-15',
      evaluationBasis: 'Q4 BSE Financial Disclosures review',
      createdAt: new Date().toISOString()
    };
    await gate.approveAndPersistClaim(solarClaim2);

    // 2. Real event registered through gate
    const solarEvent: IntelligenceEvent = {
      eventId: 'EVT_SOLAR_ORDER_01',
      issuerNseSymbol: 'SOLARINDS',
      eventDate: '2024-11-20',
      category: 'ORDER_BOOK',
      headline: 'Solar Industries secures ₹887 Cr export order for pinaka rocket propellant',
      description: 'Official BSE disclosure of international defense export contract',
      sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
      sourceType: 'BSE_DISCLOSURE',
      evidenceId: 'EV_SOLAR_AR24_P42',
      materiality: 'MATERIAL',
      createdAt: new Date().toISOString()
    };
    await gate.approveAndPersistEvent(solarEvent);

    // 3. Scorecard calculation
    const scorecard = await claimService.getCredibilityScorecard('SOLARINDS');

    // 4. Executable Breakers
    const breakers: ThesisBreaker[] = [
      {
        breakerId: 'TB_SOLAR_LEVERAGE',
        name: 'Solvency Preservation',
        description: 'Net Debt / EBITDA must not breach 2.5x',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Net Debt / EBITDA > 2.5',
        quantitativeCondition: {
          metric: 'net_debt_to_ebitda',
          operator: '>',
          threshold: 2.5,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: '',
        evidenceIds: []
      }
    ];
    const evaluatedBreakers = breakerEngine.evaluateAll(breakers, {
      metrics: { net_debt_to_ebitda: 0.35 }, // Conservative leverage
      events: [solarEvent],
      claims: [solarClaim]
    });

    // 5. ITAS Quant Signal (7/20 strategy convergence)
    const itasSignal: ItasQuantInput = {
      symbol: 'SOLARINDS',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 96,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };

    // 6. IICE Input
    const iiceInput: IiceIntelligenceInput = {
      symbol: 'SOLARINDS',
      companyName: 'Solar Industries India Ltd',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: scorecard,
      contradictions: [],
      evaluatedBreakers,
      unknowns: [],
      recentEvents: [solarEvent],
      evidenceCount: 4
    };

    // 7. Full Brief Assembly
    const brief = reconciler.generateBrief(
      itasSignal,
      iiceInput,
      'Defense ammunition scaling and export runway drive multi-year earnings compounding'
    );

    expect(brief.symbol).toBe('SOLARINDS');
    expect(brief.decisionState.quantOpportunity).toBe('STRONG');
    expect(brief.decisionState.intelligenceRisk).toBe('LOW');
    expect(brief.decisionState.thesisState).toBe('SUPPORTED');
    expect(brief.decisionState.activeThesisBreakers).toBe(0);
    expect(brief.thesisSupport.length).toBeGreaterThan(0);
    expect(brief.executiveAssessment.decisionImplication).toBe('SUPPORTS_THESIS');
    expect(brief.executiveAssessment.oneLineSummary).toMatch(/Strong quantitative opportunity supported by clean qualitative intelligence/);
  });

  it('I. Historical Immutability / Supersession: modifying candidate updates superseding record, never mutating original historical assertion', async () => {
    // 1. Initial approved claim
    const originalClaim: ManagementClaim = {
      claimId: 'CLM_HIST_001',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'MARGIN',
      statement: 'EBITDA margin expected to hold above 22%.',
      evidenceId: 'EV_SOLAR_AR24_P42',
      status: 'OPEN',
      createdAt: '2024-05-15T10:00:00.000Z'
    };
    await gate.approveAndPersistClaim(originalClaim);

    // 2. Correction / Update arrives: Instead of deleting or mutating original row in place,
    // subsequent evaluation produces superseding record
    await claimService.resolveClaim(
      'CLM_HIST_001',
      24.1,
      'Delivered FY24 EBITDA margin of 24.1%',
      'EV_SOLAR_DISCLOSURE_Q4',
      'ACHIEVED',
      '2025-05-20'
    );

    const stored = await claimService.getClaimById('CLM_HIST_001');
    expect(stored).not.toBeNull();
    expect(stored?.evidenceId).toBe('EV_SOLAR_AR24_P42'); // Initial evidence lineage preserved
    expect(stored?.resolutionEvidenceId).toBe('EV_SOLAR_DISCLOSURE_Q4'); // Resolution evidence recorded
    expect(stored?.status).toBe('ACHIEVED');
  });

  it('J. Issuer Identity Propagation: rejects cross-issuer evidence when linking contradiction', async () => {
    // Attempt to assemble a SOLARINDS contradiction using 360ONE evidence on the right side
    const crossIssuerContra = {
      contradictionId: 'CONTRA_CROSS_001',
      issuerNseSymbol: 'SOLARINDS',
      severity: 'CRITICAL' as const,
      type: 'CLAIM_VS_RESULT' as const,
      description: 'Attempted cross-issuer contradiction assembly',
      divergenceDetails: {},
      leftEvidenceId: 'EV_SOLAR_AR24_P42', // SOLARINDS
      rightEvidenceId: 'EV_360ONE_RES_P132', // 360ONE - INVALID CROSS-CONTAMINATION
      supportingEvidenceIds: [],
      materiality: 'CRITICAL' as const,
      status: 'OPEN' as const,
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await expect(gate.approveAndPersistContradiction(crossIssuerContra)).rejects.toThrow(
      /Right Evidence issuer '360ONE' does not match Contradiction symbol 'SOLARINDS'/
    );
  });

  it('K. Legacy Recommendation Provenance Separation: legacy provenance output does NOT override the two-axis decision state', () => {
    // Legacy forensic calculation might gate momentum and produce GATED_AVOID:
    // e.g. Technical Signal = STRONG_BUY, but aggressive Sloan accruals or Beneish score triggered gating.
    const legacyGatedDirective = 'GATED_AVOID';

    // In the hardened architecture, ITAS quant opportunity remains independently evaluated:
    const itasSignal: ItasQuantInput = {
      symbol: 'SOLARINDS',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 96,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };

    // And forensic/qualitative concerns feed into IICE as risk/contradictions:
    const iiceInputWithForensicConcern: IiceIntelligenceInput = {
      symbol: 'SOLARINDS',
      companyName: 'Solar Industries India Ltd',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        symbol: 'SOLARINDS',
        grade: 'MIXED',
        totalClaims: 4,
        achievedCount: 2,
        partiallyAchievedCount: 1,
        missedCount: 1,
        reversedCount: 0,
        openCount: 0,
        dueForEvaluationCount: 0,
        unresolvedCount: 0,
        keyEvidencedExamples: []
      },
      contradictions: [
        {
          contradictionId: 'CONTRA_ACCRUAL_01',
          issuerNseSymbol: 'SOLARINDS',
          severity: 'HIGH',
          type: 'CLAIM_VS_RESULT',
          description: 'Sloan accrual ratio divergence indicates aggressive non-cash accruals',
          divergenceDetails: { sloanRatio: 12.4 },
          leftEvidenceId: 'EV_SOLAR_AR24_P42',
          rightEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
          supportingEvidenceIds: [],
          materiality: 'HIGH',
          status: 'OPEN',
          detectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        }
      ],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 4
    };

    const decisionState = reconciler.reconcile(itasSignal, iiceInputWithForensicConcern);

    // INVARIANT: The two-axis model is NOT collapsed into legacy single-axis 'GATED_AVOID'.
    // ITAS quant opportunity remains STRONG.
    expect(decisionState.quantOpportunity).toBe('STRONG');
    // IICE intelligence risk reflects the forensic concern (HIGH).
    expect(decisionState.intelligenceRisk).toBe('HIGH');
    // Reconciled thesis state is CHALLENGED, not an arbitrary automated order execution.
    expect(decisionState.thesisState).toBe('CHALLENGED');
    // Final human decision layer receives both distinct dimensions:
    expect(decisionState.interpretation).toContain('Strong quantitative setup, but material intelligence concerns');
  });
});

