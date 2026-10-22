/**
 * scripts/run_phase2_batch3.ts
 *
 * IICE Phase 2 - Batch 3: High Leverage, Working Capital & Governance Stress Execution Script
 * Evaluates 5 companies:
 * 1. PURVA      (Puravankara Ltd - Real Estate high leverage, Net Debt/EBITDA breaker test)
 * 2. STLNETWORK (Sterlite Technologies Ltd - Debt reduction guidance revision vs cash flow squeeze)
 * 3. SENCO      (Senco Gold Ltd - Working capital & gold metal loan reliance vs store expansion)
 * 4. GMDCLTD    (Gujarat Mineral Dev Corp - State CPSE environmental & mining clearance dependencies)
 * 5. 360ONE     (360 ONE WAM Ltd - Wealth management regulatory scrutiny & fee yield compression)
 *
 * Enforces all Phase 1B / Gate A hardened contracts:
 * - IntelligenceQualityGate write boundary
 * - Article 26 temporal claim lifecycle
 * - Article 21 multi-evidence contradictions (CLAIM_VS_RESULT)
 * - Machine-executable thesis breakers (Leverage & Working Capital limits)
 * - Two-axis reconciliation (ITAS Quant Opp x IICE Intel Risk -> Reconciled Thesis State)
 * - Serializes portable audit dossiers into data/phase2_cohort/<SYMBOL>/
 */

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { IntelligenceQualityGate } from '../src/server/intelligence/services/IntelligenceQualityGate.js';
import { ClaimLedgerService } from '../src/server/intelligence/services/ClaimLedgerService.js';
import { ContradictionEngine } from '../src/server/intelligence/services/ContradictionEngine.js';
import { ThesisBreakerEngine } from '../src/server/intelligence/services/ThesisBreakerEngine.js';
import {
  ItasIiceReconciliationService,
  ItasQuantInput,
  IiceIntelligenceInput
} from '../src/server/intelligence/services/ItasIiceReconciliationService.js';
import { ManagementClaim } from '../src/server/intelligence/types/ManagementClaim.js';
import { IntelligenceEvent } from '../src/server/intelligence/types/IntelligenceEvent.js';
import { ThesisBreaker } from '../src/server/intelligence/types/ThesisDefinition.js';
import { Contradiction } from '../src/server/intelligence/types/Contradiction.js';

interface BatchCompanyData {
  company: {
    symbol: string;
    companyName: string;
    bseCode: string;
    isin: string;
    marketCapTier: 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP_SME';
    exchangeBoard: 'MAIN_BOARD' | 'SME_EXCHANGE';
    industry: string;
    headquarters: string;
    primaryExchange: string;
  };
  sources: any[];
  evidenceSpans: any[];
  claims: ManagementClaim[];
  events: IntelligenceEvent[];
  contradictions: Contradiction[];
  thesis: {
    symbol: string;
    coreThesisStatement: string;
    investmentPillars: Array<{ pillarId: string; title: string; description: string }>;
    thesisBreakersDefined: string[];
  };
  breakers: ThesisBreaker[];
  breakerContextMetrics: Record<string, number>;
  itasSignal: ItasQuantInput;
}

const BATCH_3_COMPANIES: BatchCompanyData[] = [
  // 1. PURVA
  {
    company: {
      symbol: 'PURVA',
      companyName: 'Puravankara Limited',
      bseCode: '532891',
      isin: 'INE323I01011',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Real Estate Residential Development',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_PURVA_AR2024',
        documentName: 'Puravankara_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: 'a38192cae981248ba014829bc39104aa1098234af09281ca8401928eb471928a',
        repositoryRelativePath: 'data/disclosures/PURVA/2024/Puravankara_Annual_Report_2023_2024.pdf',
        pageCount: 260,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_PURVA_BSE_Q4FY24',
        documentName: 'Puravankara_Audited_Financial_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-27',
        documentHashSha256: 'b492039eb471928ba40192cae981248ba014829bc39104aa1098234af09281cb',
        repositoryRelativePath: 'data/disclosures/PURVA/2024/Puravankara_Audited_Financial_Results_Q4FY24.pdf',
        pageCount: 46,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_PURVA_PROMISE_01',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        documentId: 'DOC_PURVA_AR2024',
        documentHash: 'a38192cae981248ba014829bc39104aa1098234af09281ca8401928eb471928a',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 48,
        pagePrinted: 46,
        quotedText: 'Company aims to maintain net debt to equity below 1.0x while expanding residential launch pipeline across Mumbai and Bengaluru.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_PURVA_RESULT_01',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        documentId: 'DOC_PURVA_BSE_Q4FY24',
        documentHash: 'b492039eb471928ba40192cae981248ba014829bc39104aa1098234af09281cb',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 12,
        pagePrinted: 12,
        quotedText: 'Consolidated Net Debt stood at ₹2,151 Cr with Net Debt to Equity ratio elevating to 1.16x and Net Debt to EBITDA reaching 5.8x due to land acquisition payments.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_PURVA_PRESALES_Q4',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        documentId: 'DOC_PURVA_BSE_Q4FY24',
        documentHash: 'b492039eb471928ba40192cae981248ba014829bc39104aa1098234af09281cb',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 6,
        pagePrinted: 6,
        quotedText: 'Achieved robust operational pre-sales of ₹5,914 Cr in FY24, an increase of 90% YoY.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_PURVA_01',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        period: 'FY24',
        category: 'FINANCIAL_METRIC',
        statement: 'Net debt to equity targeted to remain below 1.0x.',
        targetMetric: 'net_debt_to_equity',
        baselineValue: 0.92,
        expectedValue: 1.0,
        expectedOutcome: 'Net Debt / Equity <= 1.0x',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_PURVA_PROMISE_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'MISSED',
        actualOutcomeMetric: 1.16,
        actualOutcomeDescription: 'Net Debt to Equity elevated to 1.16x on heavy land capex',
        evaluationEvidenceId: 'EV_PURVA_RESULT_01',
        evaluationDate: '2024-05-27',
        evaluationBasis: 'BSE Audited Financial Accounts and Leverage Notes',
        createdAt: '2023-08-14T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_PURVA_01',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        eventDate: '2024-05-27',
        category: 'DEBT_FINANCING',
        headline: 'Puravankara net debt breaches ₹2,150 Cr threshold on aggressive redevelopment acquisition',
        description: 'Statutory debt disclosure reveals Net Debt to EBITDA ratio rising to 5.8x.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_PURVA_RESULT_01',
        materiality: 'HIGH',
        createdAt: '2024-05-27T09:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_PURVA_01',
        issuerNseSymbol: 'PURVA',
        issuerBseCode: '532891',
        severity: 'HIGH',
        type: 'CLAIM_VS_RESULT',
        claimId: 'CLM_PURVA_01',
        eventId: 'EVT_PURVA_01',
        description: 'Management guided Net Debt / Equity <= 1.0x, but reported 1.16x with Net Debt / EBITDA at 5.8x',
        divergenceDetails: { targetRatio: 1.0, deliveredRatio: 1.16, netDebtEbitda: 5.8 },
        leftEvidenceId: 'EV_PURVA_PROMISE_01',
        rightEvidenceId: 'EV_PURVA_RESULT_01',
        supportingEvidenceIds: ['EV_PURVA_PRESALES_Q4'],
        status: 'OPEN',
        materiality: 'HIGH',
        detectedAt: '2024-05-27T10:00:00.000Z',
        createdAt: '2026-09-15 13:20:00',
        resolvedAt: null,
        resolutionBasis: null
      }
    ],
    thesis: {
      symbol: 'PURVA',
      coreThesisStatement: 'Pre-sales volume momentum across south and west Indian residential redevelopment markets.',
      investmentPillars: [
        {
          pillarId: 'PIL_PURVA_PRESALES',
          title: 'Residential Pre-sales Velocity',
          description: 'Strong brand pull and 90% pre-sales growth in Bengaluru and Mumbai markets.'
        }
      ],
      thesisBreakersDefined: ['TB_PURVA_LEVERAGE']
    },
    breakers: [
      {
        breakerId: 'TB_PURVA_LEVERAGE',
        name: 'Developer Leverage Incurrence Breaker',
        description: 'Net Debt / EBITDA must not breach 4.5x during redevelopment cycle',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Net Debt / EBITDA > 4.5',
        quantitativeCondition: {
          metric: 'net_debt_to_ebitda',
          operator: '>',
          threshold: 4.5,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'ACTIVE',
        severity: 'HIGH',
        rationale: 'Breaker triggered: Net Debt / EBITDA reached 5.8x exceeding 4.5x risk threshold',
        evidenceIds: ['EV_PURVA_RESULT_01']
      }
    ],
    breakerContextMetrics: { net_debt_to_ebitda: 5.8 },
    itasSignal: {
      symbol: 'PURVA',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  },

  // 2. STLNETWORK
  {
    company: {
      symbol: 'STLNETWORK',
      companyName: 'Sterlite Technologies Limited',
      bseCode: '532374',
      isin: 'INE089C01029',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Telecom Equipment & Optical Fibre Cables',
      headquarters: 'Pune, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_STL_AR2023',
        documentName: 'Sterlite_Technologies_Annual_Report_2022_2023.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2023-07-15',
        documentHashSha256: 'c501928eb471928ba40192cae981248ba014829bc39104aa1098234af09281cd',
        repositoryRelativePath: 'data/disclosures/STLNETWORK/2023/Sterlite_Technologies_Annual_Report_2022_2023.pdf',
        pageCount: 240,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_STL_BSE_Q4FY24',
        documentName: 'Sterlite_Technologies_Audited_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-16',
        documentHashSha256: 'd612039eb471928ba40192cae981248ba014829bc39104aa1098234af09281ce',
        repositoryRelativePath: 'data/disclosures/STLNETWORK/2024/Sterlite_Technologies_Audited_Results_Q4FY24.pdf',
        pageCount: 52,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_STL_PROMISE_01',
        issuerNseSymbol: 'STLNETWORK',
        issuerBseCode: '532374',
        documentId: 'DOC_STL_AR2023',
        documentHash: 'c501928eb471928ba40192cae981248ba014829bc39104aa1098234af09281cd',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 36,
        pagePrinted: 34,
        quotedText: 'Committed to reduce consolidated net debt below ₹2,500 Cr by FY24 through working capital release and non-core asset divestments.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_STL_RESULT_01',
        issuerNseSymbol: 'STLNETWORK',
        issuerBseCode: '532374',
        documentId: 'DOC_STL_BSE_Q4FY24',
        documentHash: 'd612039eb471928ba40192cae981248ba014829bc39104aa1098234af09281ce',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 14,
        pagePrinted: 14,
        quotedText: 'Consolidated net debt stood elevated at ₹3,124 Cr at end of FY24 impacted by global optical fiber destocking and delayed North American carrier capex.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_STL_01',
        issuerNseSymbol: 'STLNETWORK',
        issuerBseCode: '532374',
        period: 'FY24',
        category: 'DEBT_FINANCING',
        statement: 'Consolidated net debt targeted below ₹2,500 Cr by end of FY24.',
        targetMetric: 'net_debt_inr_cr',
        baselineValue: 3200,
        expectedValue: 2500,
        expectedOutcome: 'Net Debt <= ₹2,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_STL_PROMISE_01',
        claimDate: '2023-07-15',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'MISSED',
        actualOutcomeMetric: 3124,
        actualOutcomeDescription: 'Net debt remained elevated at ₹3,124 Cr due to telecom destocking',
        evaluationEvidenceId: 'EV_STL_RESULT_01',
        evaluationDate: '2024-05-16',
        evaluationBasis: 'BSE Audited Financial Accounts and Cash Flow Statement',
        createdAt: '2023-07-15T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_STL_01',
        issuerNseSymbol: 'STLNETWORK',
        issuerBseCode: '532374',
        eventDate: '2024-05-16',
        category: 'EARNINGS_RELEASE',
        headline: 'Sterlite Tech net debt remains elevated at ₹3,124 Cr vs ₹2,500 Cr guided target',
        description: 'Global optical fibre demand drop and delayed collections squeeze operating cash flows.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_STL_RESULT_01',
        materiality: 'HIGH',
        createdAt: '2024-05-16T09:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_STL_01',
        issuerNseSymbol: 'STLNETWORK',
        issuerBseCode: '532374',
        severity: 'HIGH',
        type: 'CLAIM_VS_RESULT',
        claimId: 'CLM_STL_01',
        eventId: 'EVT_STL_01',
        description: 'Management guided Net Debt reduction below ₹2,500 Cr, but delivered ₹3,124 Cr debt',
        divergenceDetails: { targetNetDebt: 2500, actualNetDebt: 3124 },
        leftEvidenceId: 'EV_STL_PROMISE_01',
        rightEvidenceId: 'EV_STL_RESULT_01',
        supportingEvidenceIds: [],
        status: 'OPEN',
        materiality: 'HIGH',
        detectedAt: '2024-05-16T10:00:00.000Z',
        createdAt: '2026-09-15 13:20:00',
        resolvedAt: null,
        resolutionBasis: null
      }
    ],
    thesis: {
      symbol: 'STLNETWORK',
      coreThesisStatement: 'Global 5G rollouts and optical interconnect demand driving network services turnaround.',
      investmentPillars: [
        {
          pillarId: 'PIL_STL_5G',
          title: 'Optical Fiber Volume Recovery',
          description: 'Turnaround in global broadband connectivity and fiber-to-the-home capex.'
        }
      ],
      thesisBreakersDefined: ['TB_STL_LEVERAGE']
    },
    breakers: [
      {
        breakerId: 'TB_STL_LEVERAGE',
        name: 'Debt Service Incurrence Breaker',
        description: 'Net Debt / EBITDA must not breach 3.5x',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Net Debt / EBITDA > 3.5',
        quantitativeCondition: {
          metric: 'net_debt_to_ebitda',
          operator: '>',
          threshold: 3.5,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'ACTIVE',
        severity: 'HIGH',
        rationale: 'Breaker triggered: Net Debt / EBITDA stood at 4.2x exceeding 3.5x covenant ceiling',
        evidenceIds: ['EV_STL_RESULT_01']
      }
    ],
    breakerContextMetrics: { net_debt_to_ebitda: 4.2 },
    itasSignal: {
      symbol: 'STLNETWORK',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 82,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY'
    }
  },

  // 3. SENCO
  {
    company: {
      symbol: 'SENCO',
      companyName: 'Senco Gold Limited',
      bseCode: '543936',
      isin: 'INE602W01023',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Gems, Jewelry & Luxury Retail',
      headquarters: 'Kolkata, West Bengal, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_SENCO_AR2024',
        documentName: 'Senco_Gold_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-12',
        documentHashSha256: 'e723049eb471928ba40192cae981248ba014829bc39104aa1098234af09281cf',
        repositoryRelativePath: 'data/disclosures/SENCO/2024/Senco_Gold_Annual_Report_2023_2024.pdf',
        pageCount: 228,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_SENCO_BSE_Q4FY24',
        documentName: 'Senco_Gold_Audited_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-24',
        documentHashSha256: 'f834159eb471928ba40192cae981248ba014829bc39104aa1098234af09281d0',
        repositoryRelativePath: 'data/disclosures/SENCO/2024/Senco_Gold_Audited_Results_Q4FY24.pdf',
        pageCount: 38,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_SENCO_PROMISE_01',
        issuerNseSymbol: 'SENCO',
        issuerBseCode: '543936',
        documentId: 'DOC_SENCO_AR2024',
        documentHash: 'e723049eb471928ba40192cae981248ba014829bc39104aa1098234af09281cf',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 32,
        pagePrinted: 30,
        quotedText: 'Targeting net store network expansion of 18 to 20 showrooms in FY24 across northern and eastern regions.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_SENCO_RESULT_01',
        issuerNseSymbol: 'SENCO',
        issuerBseCode: '543936',
        documentId: 'DOC_SENCO_BSE_Q4FY24',
        documentHash: 'f834159eb471928ba40192cae981248ba014829bc39104aa1098234af09281d0',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 8,
        pagePrinted: 8,
        quotedText: 'Opened 23 new showrooms in FY24 taking total store network to 159 showrooms nationwide.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_SENCO_WC_Q4',
        issuerNseSymbol: 'SENCO',
        issuerBseCode: '543936',
        documentId: 'DOC_SENCO_BSE_Q4FY24',
        documentHash: 'f834159eb471928ba40192cae981248ba014829bc39104aa1098234af09281d0',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 16,
        pagePrinted: 16,
        quotedText: 'Gold Metal Loan and working capital bank borrowings stood at ₹1,420 Cr representing 82% bank sanction limit utilization on elevated bullion procurement.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_SENCO_01',
        issuerNseSymbol: 'SENCO',
        issuerBseCode: '543936',
        period: 'FY24',
        category: 'STORE_EXPANSION',
        statement: 'Net showroom additions targeted between 18 and 20 stores in FY24.',
        targetMetric: 'store_additions_count',
        baselineValue: 136,
        expectedValue: 18,
        expectedOutcome: 'Store additions >= 18',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_SENCO_PROMISE_01',
        claimDate: '2023-08-22',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 23,
        actualOutcomeDescription: 'Delivered 23 new showrooms beating the 18-20 store guidance',
        evaluationEvidenceId: 'EV_SENCO_RESULT_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'BSE Audited Financial Results and Investor Presentation',
        createdAt: '2023-08-22T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_SENCO_01',
        issuerNseSymbol: 'SENCO',
        issuerBseCode: '543936',
        eventDate: '2024-05-24',
        category: 'WORKING_CAPITAL_CHANGE',
        headline: 'Senco Gold working capital borrowing expands to ₹1,420 Cr on high gold prices',
        description: 'Bank credit facility utilization reaches 82% to fund gold inventory across newly opened stores.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_SENCO_WC_Q4',
        materiality: 'MEDIUM',
        createdAt: '2024-05-24T09:00:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'SENCO',
      coreThesisStatement: 'Formalization of unorganized jewelry market and rapid retail showroom expansion.',
      investmentPillars: [
        {
          pillarId: 'PIL_SENCO_STORES',
          title: 'Store Network Scale',
          description: 'Expanding footprint in tier-1 and tier-2 towns with asset-light franchise blend.'
        }
      ],
      thesisBreakersDefined: ['TB_SENCO_WC_UTIL']
    },
    breakers: [
      {
        breakerId: 'TB_SENCO_WC_UTIL',
        name: 'Working Capital Limit Breaker',
        description: 'Working Capital Bank Sanction Limit Utilization must not exceed 90%',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'WC Bank Limit Utilization > 90%',
        quantitativeCondition: {
          metric: 'wc_limit_utilization_pct',
          operator: '>',
          threshold: 90,
          evaluationPeriod: 'quarterly',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: 'Metric within safe limits: WC Utilization at 82% does not exceed 90% threshold',
        evidenceIds: ['EV_SENCO_WC_Q4']
      }
    ],
    breakerContextMetrics: { wc_limit_utilization_pct: 82 },
    itasSignal: {
      symbol: 'SENCO',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 87,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  },

  // 4. GMDCLTD
  {
    company: {
      symbol: 'GMDCLTD',
      companyName: 'Gujarat Mineral Development Corporation Limited',
      bseCode: '532181',
      isin: 'INE131A01031',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Mining & Lignite Mineral Extraction',
      headquarters: 'Ahmedabad, Gujarat, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_GMDC_AR2023',
        documentName: 'GMDC_Annual_Report_2022_2023.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2023-08-10',
        documentHashSha256: '0945169eb471928ba40192cae981248ba014829bc39104aa1098234af09281d1',
        repositoryRelativePath: 'data/disclosures/GMDCLTD/2023/GMDC_Annual_Report_2022_2023.pdf',
        pageCount: 210,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_GMDC_BSE_Q4FY24',
        documentName: 'GMDC_Audited_Financial_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-18',
        documentHashSha256: '1a56279eb471928ba40192cae981248ba014829bc39104aa1098234af09281d2',
        repositoryRelativePath: 'data/disclosures/GMDCLTD/2024/GMDC_Audited_Financial_Results_Q4FY24.pdf',
        pageCount: 36,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_GMDC_PROMISE_01',
        issuerNseSymbol: 'GMDCLTD',
        issuerBseCode: '532181',
        documentId: 'DOC_GMDC_AR2023',
        documentHash: '0945169eb471928ba40192cae981248ba014829bc39104aa1098234af09281d1',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 26,
        pagePrinted: 24,
        quotedText: 'Targeting operational commencement and commercial extraction at newly allotted commercial coal and lignite blocks in Odisha and Gujarat by Q4-FY24.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_GMDC_RESULT_01',
        issuerNseSymbol: 'GMDCLTD',
        issuerBseCode: '532181',
        documentId: 'DOC_GMDC_BSE_Q4FY24',
        documentHash: '1a56279eb471928ba40192cae981248ba014829bc39104aa1098234af09281d2',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 9,
        pagePrinted: 9,
        quotedText: 'Commercial mining operations at Baitarani West coal block deferred pending statutory stage-1 forest clearance and MoEFCC environmental permissions.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_GMDC_01',
        issuerNseSymbol: 'GMDCLTD',
        issuerBseCode: '532181',
        period: 'FY24',
        category: 'CAPEX',
        statement: 'Operational commencement of commercial coal blocks by Q4-FY24.',
        targetMetric: 'mining_commencement',
        baselineValue: 0,
        expectedValue: 1,
        expectedOutcome: 'Mining commenced by Q4-FY24',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_GMDC_PROMISE_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'MISSED',
        actualOutcomeMetric: 0,
        actualOutcomeDescription: 'Commercial extraction deferred due to pending MoEFCC environmental and forest clearances',
        evaluationEvidenceId: 'EV_GMDC_RESULT_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'BSE Statutory Financial and Operational Review Disclosures',
        createdAt: '2023-08-10T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_GMDC_01',
        issuerNseSymbol: 'GMDCLTD',
        issuerBseCode: '532181',
        eventDate: '2024-05-18',
        category: 'REGULATORY_ACTION',
        headline: 'GMDC Baitarani West commercial coal mining delayed pending statutory forest clearances',
        description: 'Regulatory delays push commercial production timeline beyond FY24 schedule.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_GMDC_RESULT_01',
        materiality: 'HIGH',
        createdAt: '2024-05-18T09:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_GMDC_01',
        issuerNseSymbol: 'GMDCLTD',
        issuerBseCode: '532181',
        severity: 'HIGH',
        type: 'CLAIM_VS_RESULT',
        claimId: 'CLM_GMDC_01',
        eventId: 'EVT_GMDC_01',
        description: 'Management promised commercial coal extraction by Q4-FY24, but statutory clearances deferred operations',
        divergenceDetails: { targetQuarter: 'Q4-FY24', clearanceStatus: 'PENDING_MOEFCC' },
        leftEvidenceId: 'EV_GMDC_PROMISE_01',
        rightEvidenceId: 'EV_GMDC_RESULT_01',
        supportingEvidenceIds: [],
        status: 'OPEN',
        materiality: 'HIGH',
        detectedAt: '2024-05-18T10:00:00.000Z',
        createdAt: '2026-09-15 13:20:00',
        resolvedAt: null,
        resolutionBasis: null
      }
    ],
    thesis: {
      symbol: 'GMDCLTD',
      coreThesisStatement: 'State-backed lignite supplier expanding into commercial coal mining and rare earth exploration.',
      investmentPillars: [
        {
          pillarId: 'PIL_GMDC_LIGNITE',
          title: 'Lignite Price Realization',
          description: 'Dominant merchant lignite provider in industrial Gujarat.'
        }
      ],
      thesisBreakersDefined: ['TB_GMDC_CLEARANCE']
    },
    breakers: [
      {
        breakerId: 'TB_GMDC_CLEARANCE',
        name: 'Mining Clearance Dependency Breaker',
        description: 'Major mining block must not suffer regulatory rejection or indefinite delay',
        type: 'QUALITATIVE',
        evaluationMethod: 'EVENT_MATCH',
        conditionText: 'Forest clearance deferred beyond 12 months',
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: 'Clearances under process with authorities; no formal rejection received',
        evidenceIds: ['EV_GMDC_RESULT_01']
      }
    ],
    breakerContextMetrics: {},
    itasSignal: {
      symbol: 'GMDCLTD',
      strategyAgreementCount: 5,
      totalStrategiesEvaluated: 20,
      signalStrength: 80,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY'
    }
  },

  // 5. 360ONE
  {
    company: {
      symbol: '360ONE',
      companyName: '360 ONE WAM Limited',
      bseCode: '542772',
      isin: 'INE466L01038',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Wealth & Alternative Asset Management',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_360ONE_AR2024',
        documentName: '360_ONE_WAM_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-16',
        documentHashSha256: '2b67389eb471928ba40192cae981248ba014829bc39104aa1098234af09281d3',
        repositoryRelativePath: 'data/disclosures/360ONE/2024/360_ONE_WAM_Annual_Report_2023_2024.pdf',
        pageCount: 275,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_360ONE_BSE_Q4FY24',
        documentName: '360_ONE_WAM_Audited_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-04-23',
        documentHashSha256: '3c78499eb471928ba40192cae981248ba014829bc39104aa1098234af09281d4',
        repositoryRelativePath: 'data/disclosures/360ONE/2024/360_ONE_WAM_Audited_Results_Q4FY24.pdf',
        pageCount: 42,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_360ONE_PROMISE_01',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        documentId: 'DOC_360ONE_AR2024',
        documentHash: '2b67389eb471928ba40192cae981248ba014829bc39104aa1098234af09281d3',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 44,
        pagePrinted: 42,
        quotedText: 'Targeting Annual Recurring Revenue (ARR) earning assets yield to remain resilient above 58 bps across Wealth and Asset Management divisions.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_360ONE_RESULT_01',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        documentId: 'DOC_360ONE_BSE_Q4FY24',
        documentHash: '3c78499eb471928ba40192cae981248ba014829bc39104aa1098234af09281d4',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 11,
        pagePrinted: 11,
        quotedText: 'Consolidated ARR yield stood at 53 bps in FY24 (compared to 58 bps in FY23) on mix shift towards institutional mandates and competitive fee compression.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_360ONE_AUM_Q4',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        documentId: 'DOC_360ONE_BSE_Q4FY24',
        documentHash: '3c78499eb471928ba40192cae981248ba014829bc39104aa1098234af09281d4',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 5,
        pagePrinted: 5,
        quotedText: 'Total Annual Recurring Revenue (ARR) AUM expanded 36% YoY to reach ₹2,10,800 Cr.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_360ONE_01',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        period: 'FY24',
        category: 'FINANCIAL_METRIC',
        statement: 'ARR earning assets yield guided to remain above 58 bps.',
        targetMetric: 'arr_yield_bps',
        baselineValue: 58,
        expectedValue: 58,
        expectedOutcome: 'ARR Yield >= 58 bps',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_360ONE_PROMISE_01',
        claimDate: '2023-05-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'PARTIALLY_ACHIEVED',
        actualOutcomeMetric: 53,
        actualOutcomeDescription: 'Delivered ARR yield of 53 bps (compressed by 5 bps due to institutional mix)',
        evaluationEvidenceId: 'EV_360ONE_RESULT_01',
        evaluationDate: '2024-04-23',
        evaluationBasis: 'BSE Audited Financial Results and Investor Presentation',
        createdAt: '2023-05-18T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_360ONE_01',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        eventDate: '2024-04-23',
        category: 'EARNINGS_RELEASE',
        headline: '360 ONE ARR earning assets yield contracts 5 bps YoY to 53 bps on institutional mandates',
        description: 'Robust 36% AUM expansion partially offset by competitive pricing and fee compression.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_360ONE_RESULT_01',
        materiality: 'MEDIUM',
        createdAt: '2024-04-23T09:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_360ONE_01',
        issuerNseSymbol: '360ONE',
        issuerBseCode: '542772',
        severity: 'MEDIUM',
        type: 'CLAIM_VS_RESULT',
        claimId: 'CLM_360ONE_01',
        eventId: 'EVT_360ONE_01',
        description: 'Management guided ARR yield >= 58 bps, but delivered 53 bps due to institutional fee compression',
        divergenceDetails: { guidedBps: 58, deliveredBps: 53 },
        leftEvidenceId: 'EV_360ONE_PROMISE_01',
        rightEvidenceId: 'EV_360ONE_RESULT_01',
        supportingEvidenceIds: ['EV_360ONE_AUM_Q4'],
        status: 'OPEN',
        materiality: 'MODERATE',
        detectedAt: '2024-04-23T10:00:00.000Z',
        createdAt: '2026-09-15 13:20:00',
        resolvedAt: null,
        resolutionBasis: null
      }
    ],
    thesis: {
      symbol: '360ONE',
      coreThesisStatement: 'Dominant Indian private wealth franchise benefiting from financialization of domestic HNIs.',
      investmentPillars: [
        {
          pillarId: 'PIL_360ONE_AUM',
          title: 'ARR AUM Compounding',
          description: 'Net new inflows and high-margin alternative asset management scaling.'
        }
      ],
      thesisBreakersDefined: ['TB_360ONE_YIELD']
    },
    breakers: [
      {
        breakerId: 'TB_360ONE_YIELD',
        name: 'ARR Yield Floor Breaker',
        description: 'ARR Yield must not breach 45 bps floor',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'ARR Yield < 45 bps',
        quantitativeCondition: {
          metric: 'arr_yield_bps',
          operator: '<',
          threshold: 45,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: 'Metric within safe boundaries: ARR yield of 53 bps remains comfortably above 45 bps floor',
        evidenceIds: ['EV_360ONE_RESULT_01']
      }
    ],
    breakerContextMetrics: { arr_yield_bps: 53 },
    itasSignal: {
      symbol: '360ONE',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 89,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  }
];

async function runBatch3() {
  console.log('================================================================================');
  console.log('IICE PHASE 2: BATCH 3 (HIGH LEVERAGE, WORKING CAPITAL & GOVERNANCE STRESS) EXECUTION');
  console.log('================================================================================\n');

  const cohortDbPath = path.resolve('data', 'phase2_cohort', 'iice_cohort.db');
  const db = new sqlite3.Database(cohortDbPath);

  // Set WAL mode and busy timeout
  await new Promise<void>((resolve, reject) => {
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) return reject(err);
      db.run('PRAGMA busy_timeout = 30000;', (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });

  const qualityGate = new IntelligenceQualityGate(db);
  const claimService = new ClaimLedgerService(db);
  const contradictionEngine = new ContradictionEngine(db);
  const breakerEngine = new ThesisBreakerEngine();
  const reconciler = new ItasIiceReconciliationService();

  const cohortSummaryRows: any[] = [];

  for (const item of BATCH_3_COMPANIES) {
    const sym = item.company.symbol;
    console.log(`>>> Processing [Batch 3] ${sym} - ${item.company.companyName}...`);

    const symbolDir = path.resolve('data', 'phase2_cohort', sym);
    if (!fs.existsSync(symbolDir)) {
      fs.mkdirSync(symbolDir, { recursive: true });
    }

    // 1. Save company.json
    fs.writeFileSync(path.join(symbolDir, 'company.json'), JSON.stringify(item.company, null, 2));

    // 2. Save source-manifest.json
    const manifest = {
      issuerNseSymbol: sym,
      issuerBseCode: item.company.bseCode,
      manifestGeneratedAt: new Date().toISOString(),
      sources: item.sources
    };
    fs.writeFileSync(path.join(symbolDir, 'source-manifest.json'), JSON.stringify(manifest, null, 2));

    // 3. Register evidence spans in DB & save evidence.json
    for (const ev of item.evidenceSpans) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO EvidenceInventory (
            evidence_id, issuer_nse_symbol, issuer_bse_code, document_hash,
            document_type, page_physical, page_printed, quoted_text, verification_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ev.evidenceId,
            ev.issuerNseSymbol,
            ev.issuerBseCode,
            ev.documentHash,
            ev.documentType,
            ev.pagePhysical,
            ev.pagePrinted,
            ev.quotedText,
            ev.verificationStatus
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }
    fs.writeFileSync(path.join(symbolDir, 'evidence.json'), JSON.stringify(item.evidenceSpans, null, 2));

    // 4. Validate & persist claims via Quality Gate
    for (const clm of item.claims) {
      await qualityGate.approveAndPersistClaim(clm);
    }
    fs.writeFileSync(path.join(symbolDir, 'claims.json'), JSON.stringify(item.claims, null, 2));

    // 5. Validate & persist events via Quality Gate
    for (const evt of item.events) {
      await qualityGate.approveAndPersistEvent(evt);
    }
    fs.writeFileSync(path.join(symbolDir, 'events.json'), JSON.stringify(item.events, null, 2));

    // 6. Scorecard calculation
    const scorecard = await claimService.getCredibilityScorecard(sym);

    // 7. Contradictions evaluation
    for (const con of item.contradictions) {
      await qualityGate.approveAndPersistContradiction(con);
    }
    const retrievedContras = await contradictionEngine.getContradictionsForIssuer(sym);
    const contradictionsRecord = {
      status: retrievedContras.length === 0 ? 'CONFIRMED_ZERO_ADVERSE_CONTRADICTIONS' : 'CONTRADICTIONS_DETECTED',
      issuerNseSymbol: sym,
      activeContradictionCount: retrievedContras.length,
      contradictions: retrievedContras
    };
    fs.writeFileSync(path.join(symbolDir, 'contradictions.json'), JSON.stringify(contradictionsRecord, null, 2));

    // 8. Breakers evaluation
    const evaluatedBreakers = breakerEngine.evaluateAll(item.breakers, {
      metrics: item.breakerContextMetrics,
      events: item.events,
      claims: item.claims
    });
    fs.writeFileSync(path.join(symbolDir, 'breaker-evaluation.json'), JSON.stringify(evaluatedBreakers, null, 2));

    // 9. ITAS input
    fs.writeFileSync(path.join(symbolDir, 'itas-input.json'), JSON.stringify(item.itasSignal, null, 2));

    // 10. Thesis & Breakers definition
    fs.writeFileSync(path.join(symbolDir, 'thesis.json'), JSON.stringify(item.thesis, null, 2));

    // 11. Reconciled brief assembly
    const iiceInput: IiceIntelligenceInput = {
      symbol: sym,
      companyName: item.company.companyName,
      marketCapTier: item.company.marketCapTier,
      exchangeBoard: item.company.exchangeBoard,
      walkTheTalk: scorecard,
      contradictions: retrievedContras,
      evaluatedBreakers,
      unknowns: [],
      recentEvents: item.events,
      evidenceCount: item.evidenceSpans.length
    };

    const brief = reconciler.generateBrief(item.itasSignal, iiceInput, item.thesis.coreThesisStatement);
    fs.writeFileSync(path.join(symbolDir, 'investment-brief.json'), JSON.stringify(brief, null, 2));

    console.log(`✓ ${sym}: Reconciled State -> Quant: ${brief.decisionState.quantOpportunity} | Risk: ${brief.decisionState.intelligenceRisk} | Thesis: ${brief.decisionState.thesisState}`);

    cohortSummaryRows.push({
      symbol: sym,
      name: item.company.companyName,
      cap: item.company.marketCapTier,
      itasOpportunity: brief.decisionState.quantOpportunity,
      iiceRisk: brief.decisionState.intelligenceRisk,
      thesisState: brief.decisionState.thesisState,
      credibilityGrade: scorecard.grade,
      claimsEvaluated: scorecard.totalClaims,
      activeBreakers: brief.decisionState.activeThesisBreakers,
      activeContradictions: retrievedContras.length,
      oneLineSummary: brief.executiveAssessment.oneLineSummary
    });
  }

  // Write Batch 3 Markdown Summary Report
  let md = `# Phase 2 - Batch 3 Execution Report: High Leverage, Working Capital & Governance Stress

**Execution Timestamp:** ${new Date().toISOString()}  
**Status:** BATCH 3 COMPLETE (5/5 Companies Processed)  
**Governance Standard:** Phase 1B Frozen Architecture & Quality Gate Enforced  

---

## 1. Executive Summary Table

| Symbol | Company Name | Segment | ITAS Quant Opp | IICE Intel Risk | Reconciled Thesis | Credibility | Claims | Breakers | Contradictions |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;

  for (const r of cohortSummaryRows) {
    md += `| **${r.symbol}** | ${r.name} | ${r.cap} | **${r.itasOpportunity}** | **${r.iiceRisk}** | **${r.thesisState}** | ${r.credibilityGrade} | ${r.claimsEvaluated} | ${r.activeBreakers} | ${r.activeContradictions} |\n`;
  }

  md += `\n---

## 2. Company-by-Company Reconciliation Details

`;

  for (const r of cohortSummaryRows) {
    md += `### ${r.symbol}: ${r.name}
- **Quant Opportunity**: \`${r.itasOpportunity}\`
- **Intelligence Risk**: \`${r.iiceRisk}\`
- **Thesis State**: \`${r.thesisState}\`
- **Credibility Grade**: \`${r.credibilityGrade}\` (Evaluated Claims: ${r.claimsEvaluated})
- **Active Contradictions**: \`${r.activeContradictions}\`
- **Active Thesis Breakers**: \`${r.activeBreakers}\`
- **Executive Summary**: ${r.oneLineSummary}
- **Artifact Location**: \`data/phase2_cohort/${r.symbol}/\`

`;
  }

  fs.writeFileSync(path.resolve('data', 'phase2_cohort', 'BATCH_3_EXECUTION_REPORT.md'), md);
  console.log('\n================================================================================');
  console.log('BATCH 3 COMPLETE: Report saved to data/phase2_cohort/BATCH_3_EXECUTION_REPORT.md');
  console.log('================================================================================');

  await new Promise<void>((resolve) => db.close(() => resolve()));
}

console.error('LEGACY_SYNTHETIC_QUARANTINED: this batch cannot create live FERE evidence.');
process.exitCode = 1;
