/**
 * scripts/run_phase2_batch1.ts
 *
 * IICE Phase 2 - Batch 1: Benchmark Clean & Growth Leaders Execution Script
 * Evaluates 5 companies:
 * 1. SOLARINDS (Solar Industries India Ltd)
 * 2. ARVSMART  (Arvind SmartSpaces Ltd)
 * 3. NOVARTIND (Novartis India Ltd)
 * 4. BAJAJHLDNG (Bajaj Holdings & Investment Ltd)
 * 5. UNOMINDA  (UNO Minda Ltd)
 *
 * Enforces all Phase 1B / Gate A hardened contracts:
 * - IntelligenceQualityGate write boundary
 * - Article 26 temporal claim lifecycle
 * - Article 21 multi-evidence contradictions (or clean assertion)
 * - Machine-executable thesis breakers
 * - Two-axis reconciliation (ITAS Quant vs IICE Risk)
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

const BATCH_1_COMPANIES: BatchCompanyData[] = [
  // 1. SOLARINDS
  {
    company: {
      symbol: 'SOLARINDS',
      companyName: 'Solar Industries India Limited',
      bseCode: '500405',
      isin: 'INE343H01029',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Defense & Industrial Explosives',
      headquarters: 'Nagpur, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_SOLAR_AR2024',
        documentName: 'Solar_Industries_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-18',
        documentHashSha256: 'a68f237bc9910d8a55e1a2f641b7cd9348c6913eef4a09a56c52701a5e786b42',
        repositoryRelativePath: 'data/disclosures/SOLARINDS/2024/Solar_Industries_Annual_Report_2023_2024.pdf',
        pageCount: 248,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_SOLAR_BSE_Q4FY24',
        documentName: 'BSE_Financial_Disclosures_Audited_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-15',
        documentHashSha256: '9f283c18b242e88a0b0739da4b69d4a37e54f738ac8537c35293da2764ba81f1',
        repositoryRelativePath: 'data/disclosures/SOLARINDS/2024/BSE_Financial_Disclosures_Audited_Results_Q4FY24.pdf',
        pageCount: 42,
        filingAuthority: 'BSE Corporate Announcement'
      },
      {
        documentId: 'DOC_SOLAR_ORDER_887CR',
        documentName: 'Exchange_Disclosure_Defense_Export_Order_887Cr.pdf',
        documentType: 'EXCHANGE_DISCLOSURE',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-11-20',
        documentHashSha256: '417de2b4e877fc04313f83d9d592f2324310557cc548234399e521b44b82bcda',
        repositoryRelativePath: 'data/disclosures/SOLARINDS/2024/Exchange_Disclosure_Defense_Export_Order_887Cr.pdf',
        pageCount: 3,
        filingAuthority: 'NSE / BSE Listing Compliance'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_SOLAR_AR24_P42',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_AR2024',
        documentHash: 'a68f237bc9910d8a55e1a2f641b7cd9348c6913eef4a09a56c52701a5e786b42',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 42,
        pagePrinted: 40,
        quotedText: 'We expect our defense export order book to exceed ₹1,000 Cr in FY25 supported by multi-country supply of Pinaka rockets and specialized warheads.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_BSE_Q4FY24',
        documentHash: '9f283c18b242e88a0b0739da4b69d4a37e54f738ac8537c35293da2764ba81f1',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 6,
        pagePrinted: 6,
        quotedText: 'Defense segment revenue for Q4FY24 reached ₹348 Cr; cumulative defense order book stood at ₹1,250 Cr as of 31st March 2024 with full delivery pipeline on schedule.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_SOLAR_ORDER_P1',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_ORDER_887CR',
        documentHash: '417de2b4e877fc04313f83d9d592f2324310557cc548234399e521b44b82bcda',
        documentType: 'EXCHANGE_DISCLOSURE',
        pagePhysical: 1,
        pagePrinted: 1,
        quotedText: 'Solar Industries India Ltd bags international export contract valued at ₹887 Crores for supply of Pinaka rockets and military warheads.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_SOLAR_LEVERAGE_Q4',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_BSE_Q4FY24',
        documentHash: '9f283c18b242e88a0b0739da4b69d4a37e54f738ac8537c35293da2764ba81f1',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 14,
        pagePrinted: 14,
        quotedText: 'Consolidated Net Debt stood at ₹428 Cr against FY24 EBITDA of ₹1,220 Cr, yielding Net Debt / EBITDA of 0.35x.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_SOLAR_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        period: 'FY25',
        category: 'ORDER_BOOK',
        statement: 'Defense order book will scale above ₹1,000 Cr in FY25.',
        targetMetric: 'defense_order_book_inr_cr',
        baselineValue: 650,
        expectedValue: 1000,
        expectedOutcome: 'Order book exceeds ₹1,000 Cr',
        expectedTimeframe: 'FY25',
        evidenceId: 'EV_SOLAR_AR24_P42',
        claimDate: '2024-07-18',
        expectedPeriodStart: '2024-04-01',
        expectedPeriodEnd: '2025-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1250,
        actualOutcomeDescription: 'Quarterly defense export dispatches reached ₹1,250 Cr',
        evaluationEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
        evaluationDate: '2025-05-15',
        evaluationBasis: 'BSE Audited Financial Results and Segmental Disclosure',
        createdAt: '2024-07-18T10:00:00.000Z'
      },
      {
        claimId: 'CLM_SOLAR_02',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        period: 'FY24',
        category: 'MARGIN',
        statement: 'Consolidated EBITDA margin expected to remain resilient above 22%.',
        targetMetric: 'ebitda_margin_pct',
        baselineValue: 20.8,
        expectedValue: 22.0,
        expectedOutcome: 'EBITDA margin >= 22%',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_SOLAR_AR24_P42',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 23.4,
        actualOutcomeDescription: 'Delivered FY24 EBITDA margin of 23.4% on favorable defense export mix',
        evaluationEvidenceId: 'EV_SOLAR_DISCLOSURE_Q4',
        evaluationDate: '2024-05-15',
        evaluationBasis: 'Q4 BSE Financial Disclosures review',
        createdAt: '2023-08-10T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_SOLAR_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        eventDate: '2024-11-20',
        category: 'ORDER_BOOK',
        headline: 'Solar Industries bags ₹887 Cr export order for pinaka rocket propellant',
        description: 'Official BSE corporate disclosure of international military defense export contract',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_SOLAR_ORDER_P1',
        materiality: 'HIGH',
        createdAt: '2024-11-20T08:30:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'SOLARINDS',
      coreThesisStatement: 'Defense ammunition scaling and export runway drive multi-year earnings compounding with pristine solvency and state-level industrial moat.',
      investmentPillars: [
        {
          pillarId: 'PIL_SOLAR_01',
          title: 'Global Defense Export Scaling',
          description: 'Pinaka rocket systems, UAV warheads, and defense propellants expanding share of total EBITDA.'
        },
        {
          pillarId: 'PIL_SOLAR_02',
          title: 'Conservative Balance Sheet & Low Leverage',
          description: 'Net debt / EBITDA sustained below 1.0x provides balance sheet resilience against global macro cycles.'
        }
      ],
      thesisBreakersDefined: ['TB_SOLAR_LEVERAGE', 'TB_SOLAR_REGULATORY_CANCELLATION']
    },
    breakers: [
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
        severity: 'CRITICAL',
        rationale: '',
        evidenceIds: ['EV_SOLAR_LEVERAGE_Q4']
      }
    ],
    breakerContextMetrics: { net_debt_to_ebitda: 0.35 },
    itasSignal: {
      symbol: 'SOLARINDS',
      strategyAgreementCount: 7,
      totalStrategiesEvaluated: 20,
      signalStrength: 96,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  },

  // 2. ARVSMART
  {
    company: {
      symbol: 'ARVSMART',
      companyName: 'Arvind SmartSpaces Limited',
      bseCode: '539301',
      isin: 'INE034S01021',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Real Estate Development',
      headquarters: 'Ahmedabad, Gujarat, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_ARV_AR2024',
        documentName: 'Arvind_SmartSpaces_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-25',
        documentHashSha256: 'c819dfb49817ad99c15d7e7e5d898ef1b2389104fae574b6201bca5e39d568bc',
        repositoryRelativePath: 'data/disclosures/ARVSMART/2024/Arvind_SmartSpaces_Annual_Report_2023_2024.pdf',
        pageCount: 196,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_ARV_BSE_Q4FY24',
        documentName: 'Arvind_SmartSpaces_Audited_Financial_Results_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-18',
        documentHashSha256: '3819dc74f91b72e9a0c14b629e4d58ba1048bce9561a3d90234cae98715bd012',
        repositoryRelativePath: 'data/disclosures/ARVSMART/2024/Arvind_SmartSpaces_Audited_Financial_Results_Q4FY24.pdf',
        pageCount: 36,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_ARV_AR24_P28',
        issuerNseSymbol: 'ARVSMART',
        issuerBseCode: '539301',
        documentId: 'DOC_ARV_AR2024',
        documentHash: 'c819dfb49817ad99c15d7e7e5d898ef1b2389104fae574b6201bca5e39d568bc',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 28,
        pagePrinted: 26,
        quotedText: 'Our target is to cross ₹1,000 Cr in pre-sales bookings in FY24 driven by plotted residential launches across Ahmedabad and Bengaluru.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_ARV_DISCLOSURE_Q4',
        issuerNseSymbol: 'ARVSMART',
        issuerBseCode: '539301',
        documentId: 'DOC_ARV_BSE_Q4FY24',
        documentHash: '3819dc74f91b72e9a0c14b629e4d58ba1048bce9561a3d90234cae98715bd012',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 5,
        pagePrinted: 5,
        quotedText: 'Achieved all-time high annual pre-sales bookings of ₹1,107 Cr in FY24, an increase of 38% YoY, while maintaining net cash surplus of ₹124 Cr.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_ARV_LEVERAGE_Q4',
        issuerNseSymbol: 'ARVSMART',
        issuerBseCode: '539301',
        documentId: 'DOC_ARV_BSE_Q4FY24',
        documentHash: '3819dc74f91b72e9a0c14b629e4d58ba1048bce9561a3d90234cae98715bd012',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 12,
        pagePrinted: 12,
        quotedText: 'Net Debt / Equity ratio stood at -0.18x as of March 31, 2024 reflecting net cash balance sheet under asset-light JDA model.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_ARV_01',
        issuerNseSymbol: 'ARVSMART',
        issuerBseCode: '539301',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Pre-sales bookings targeted to exceed ₹1,000 Cr in FY24.',
        targetMetric: 'pre_sales_inr_cr',
        baselineValue: 802,
        expectedValue: 1000,
        expectedOutcome: 'Pre-sales bookings >= ₹1,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_ARV_AR24_P28',
        claimDate: '2023-07-28',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1107,
        actualOutcomeDescription: 'Pre-sales reached ₹1,107 Cr, beating ₹1,000 Cr target',
        evaluationEvidenceId: 'EV_ARV_DISCLOSURE_Q4',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'BSE Audited Financial Results and Segmental Presentation',
        createdAt: '2023-07-28T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_ARV_01',
        issuerNseSymbol: 'ARVSMART',
        issuerBseCode: '539301',
        eventDate: '2024-05-18',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Arvind SmartSpaces confirms net cash balance sheet and ₹400 Cr new project pipeline',
        description: 'BSE disclosure confirms asset-light horizontal plotted expansion model',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_ARV_DISCLOSURE_Q4',
        materiality: 'MATERIAL',
        createdAt: '2024-05-18T09:00:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'ARVSMART',
      coreThesisStatement: 'Asset-light horizontal plotted residential model backed by Lalbhai brand delivers 30%+ ROCE with zero balance-sheet distress.',
      investmentPillars: [
        {
          pillarId: 'PIL_ARV_01',
          title: 'Asset-Light Horizontal Plotted Moat',
          description: 'Joint development and plotted models turn over capital in 12-18 months with negative working capital.'
        },
        {
          pillarId: 'PIL_ARV_02',
          title: 'Pristine Solvency',
          description: 'Net cash balance sheet insulates company against real estate downcycles.'
        }
      ],
      thesisBreakersDefined: ['TB_ARV_LEVERAGE']
    },
    breakers: [
      {
        breakerId: 'TB_ARV_LEVERAGE',
        name: 'Leverage Incurrence Breaker',
        description: 'Net Debt / Equity must not exceed 0.5x',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Net Debt / Equity > 0.5',
        quantitativeCondition: {
          metric: 'net_debt_to_equity',
          operator: '>',
          threshold: 0.5,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: '',
        evidenceIds: ['EV_ARV_LEVERAGE_Q4']
      }
    ],
    breakerContextMetrics: { net_debt_to_equity: -0.18 },
    itasSignal: {
      symbol: 'ARVSMART',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 89,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  },

  // 3. NOVARTIND
  {
    company: {
      symbol: 'NOVARTIND',
      companyName: 'Novartis India Limited',
      bseCode: '500672',
      isin: 'INE234A01025',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Pharmaceuticals & Healthcare',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_NOV_AR2024',
        documentName: 'Novartis_India_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-15',
        documentHashSha256: '7281ef849201bd9840291ca8e47192bd840219cae901482ba014829be49102ca',
        repositoryRelativePath: 'data/disclosures/NOVARTIND/2024/Novartis_India_Annual_Report_2023_2024.pdf',
        pageCount: 164,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_NOV_BSE_DIVIDEND',
        documentName: 'Novartis_India_Dividend_Recommendation_FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-22',
        documentHashSha256: '1098234af09281ca8401928eb471928ba40192cae981248ba014829bc39104aa',
        repositoryRelativePath: 'data/disclosures/NOVARTIND/2024/Novartis_India_Dividend_Recommendation_FY24.pdf',
        pageCount: 8,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_NOV_AR24_P18',
        issuerNseSymbol: 'NOVARTIND',
        issuerBseCode: '500672',
        documentId: 'DOC_NOV_AR2024',
        documentHash: '7281ef849201bd9840291ca8e47192bd840219cae901482ba014829be49102ca',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 18,
        pagePrinted: 16,
        quotedText: 'Company remains focused on distributing substantial portion of free cash flow to shareholders while operating debt-free.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_NOV_DISCLOSURE_DIV',
        issuerNseSymbol: 'NOVARTIND',
        issuerBseCode: '500672',
        documentId: 'DOC_NOV_BSE_DIVIDEND',
        documentHash: '1098234af09281ca8401928eb471928ba40192cae981248ba014829bc39104aa',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 2,
        pagePrinted: 2,
        quotedText: 'Board recommended final dividend of ₹25.00 per equity share (500%) along with special dividend of ₹22.50 per share, delivering >90% profit distribution.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_NOV_01',
        issuerNseSymbol: 'NOVARTIND',
        issuerBseCode: '500672',
        period: 'FY24',
        category: 'CAPITAL_ALLOCATION',
        statement: 'Distribute substantial portion of free cash flows to shareholders while maintaining zero debt.',
        targetMetric: 'dividend_payout_pct',
        baselineValue: 80,
        expectedValue: 85,
        expectedOutcome: 'Dividend payout ratio >= 85%',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_NOV_AR24_P18',
        claimDate: '2023-08-05',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 92,
        actualOutcomeDescription: 'Delivered ₹47.50/share total dividend, representing 92% earnings payout',
        evaluationEvidenceId: 'EV_NOV_DISCLOSURE_DIV',
        evaluationDate: '2024-05-22',
        evaluationBasis: 'BSE Dividend Announcement and Audited Accounts',
        createdAt: '2023-08-05T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_NOV_01',
        issuerNseSymbol: 'NOVARTIND',
        issuerBseCode: '500672',
        eventDate: '2024-05-22',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Novartis India announces ₹47.50 per share dividend distribution',
        description: 'Statutory filing confirms massive cash return to shareholders with zero debt',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_NOV_DISCLOSURE_DIV',
        materiality: 'MATERIAL',
        createdAt: '2024-05-22T08:45:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'NOVARTIND',
      coreThesisStatement: 'MNC pharma subsidiary with zero debt, high return on capital, and high shareholder distributions acting as a low-volatility compounder.',
      investmentPillars: [
        {
          pillarId: 'PIL_NOV_01',
          title: 'MNC Governance & Zero Debt',
          description: 'Swiss parent oversight, debt-free balance sheet, and pristine accounting compliance.'
        },
        {
          pillarId: 'PIL_NOV_02',
          title: 'Cash Distribution Yield',
          description: 'High dividend payout acts as downside buffer during broader market drawdowns.'
        }
      ],
      thesisBreakersDefined: ['TB_NOV_DEBT']
    },
    breakers: [
      {
        breakerId: 'TB_NOV_DEBT',
        name: 'Debt Incurrence Breaker',
        description: 'Total Debt must remain zero',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Total Debt > 0',
        quantitativeCondition: {
          metric: 'total_debt_inr_cr',
          operator: '>',
          threshold: 0,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'CRITICAL',
        rationale: '',
        evidenceIds: ['EV_NOV_DISCLOSURE_DIV']
      }
    ],
    breakerContextMetrics: { total_debt_inr_cr: 0 },
    itasSignal: {
      symbol: 'NOVARTIND',
      strategyAgreementCount: 5,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY'
    }
  },

  // 4. BAJAJHLDNG
  {
    company: {
      symbol: 'BAJAJHLDNG',
      companyName: 'Bajaj Holdings & Investment Limited',
      bseCode: '500490',
      isin: 'INE118A01012',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Investment Holding Company',
      headquarters: 'Pune, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BAJ_AR2024',
        documentName: 'Bajaj_Holdings_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-10',
        documentHashSha256: '981240182ba014829be49102ca7281ef849201bd9840291ca8e47192bd840219',
        repositoryRelativePath: 'data/disclosures/BAJAJHLDNG/2024/Bajaj_Holdings_Annual_Report_2023_2024.pdf',
        pageCount: 212,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_BAJ_BSE_DIVIDEND',
        documentName: 'Bajaj_Holdings_Consolidated_Financials_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-04-26',
        documentHashSha256: '5819028eb471928ba40192cae981248ba014829bc39104aa1098234af09281ca',
        repositoryRelativePath: 'data/disclosures/BAJAJHLDNG/2024/Bajaj_Holdings_Consolidated_Financials_Q4FY24.pdf',
        pageCount: 48,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BAJ_AR24_P14',
        issuerNseSymbol: 'BAJAJHLDNG',
        issuerBseCode: '500490',
        documentId: 'DOC_BAJ_AR2024',
        documentHash: '981240182ba014829be49102ca7281ef849201bd9840291ca8e47192bd840219',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 14,
        pagePrinted: 12,
        quotedText: 'BHIL remains a pure investment company, holding strategic stakes of ~34% in Bajaj Auto and ~39% in Bajaj Finserv, passing through underlying dividend cash flows.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_BAJ_DISCLOSURE_DIV',
        issuerNseSymbol: 'BAJAJHLDNG',
        issuerBseCode: '500490',
        documentId: 'DOC_BAJ_BSE_DIVIDEND',
        documentHash: '5819028eb471928ba40192cae981248ba014829bc39104aa1098234af09281ca',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 4,
        pagePrinted: 4,
        quotedText: 'Consolidated profit after tax stood at ₹7,341 Cr for FY24; Board recommended final dividend of ₹21.00 per share in addition to interim dividend of ₹110.00 per share.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BAJ_01',
        issuerNseSymbol: 'BAJAJHLDNG',
        issuerBseCode: '500490',
        period: 'FY24',
        category: 'CAPITAL_ALLOCATION',
        statement: 'Maintain pass-through of core subsidiary dividend income to BHIL shareholders without speculative reinvestment.',
        targetMetric: 'dividend_pass_through',
        baselineValue: 100,
        expectedValue: 100,
        expectedOutcome: '100% pass-through of received operating dividends',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BAJ_AR24_P14',
        claimDate: '2023-06-20',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 100,
        actualOutcomeDescription: 'Paid total dividend of ₹131.00 per share from operating dividend receipts',
        evaluationEvidenceId: 'EV_BAJ_DISCLOSURE_DIV',
        evaluationDate: '2024-04-26',
        evaluationBasis: 'BSE Financial Results and Cash Flow Statement',
        createdAt: '2023-06-20T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_BAJ_01',
        issuerNseSymbol: 'BAJAJHLDNG',
        issuerBseCode: '500490',
        eventDate: '2024-04-26',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Bajaj Holdings posts ₹7,341 Cr consolidated net profit with ₹131/share annual dividend',
        description: 'Statutory filing confirms strategic value accretion from Bajaj Auto & Bajaj Finserv',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_BAJ_DISCLOSURE_DIV',
        materiality: 'MATERIAL',
        createdAt: '2024-04-26T09:30:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'BAJAJHLDNG',
      coreThesisStatement: 'Apex holding company providing diversified proxy exposure to Indian auto and financial compounding at a structural holding company discount.',
      investmentPillars: [
        {
          pillarId: 'PIL_BAJ_01',
          title: 'Strategic Conglomerate Anchors',
          description: 'Key stakes in Bajaj Auto and Bajaj Finserv capture mobility and consumer credit compounding.'
        },
        {
          pillarId: 'PIL_BAJ_02',
          title: 'Pristine Zero Debt & Zero Pledge',
          description: 'Promoter pledge is 0.00% with fortress treasury balance sheet.'
        }
      ],
      thesisBreakersDefined: ['TB_BAJ_PLEDGE']
    },
    breakers: [
      {
        breakerId: 'TB_BAJ_PLEDGE',
        name: 'Promoter Pledge Breaker',
        description: 'Promoter shares pledged must remain 0%',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Promoter Pledge Pct > 0',
        quantitativeCondition: {
          metric: 'promoter_pledge_pct',
          operator: '>',
          threshold: 0,
          evaluationPeriod: 'quarterly',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'CRITICAL',
        rationale: '',
        evidenceIds: ['EV_BAJ_DISCLOSURE_DIV']
      }
    ],
    breakerContextMetrics: { promoter_pledge_pct: 0 },
    itasSignal: {
      symbol: 'BAJAJHLDNG',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  },

  // 5. UNOMINDA
  {
    company: {
      symbol: 'UNOMINDA',
      companyName: 'UNO Minda Limited',
      bseCode: '532539',
      isin: 'INE405E01023',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Auto Components & Systems',
      headquarters: 'Gurugram, Haryana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_UNO_AR2024',
        documentName: 'UNO_Minda_Annual_Report_2023_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: '840192cae981248ba014829bc39104aa1098234af09281ca8401928eb471928b',
        repositoryRelativePath: 'data/disclosures/UNOMINDA/2024/UNO_Minda_Annual_Report_2023_2024.pdf',
        pageCount: 284,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_UNO_BSE_Q4FY24',
        documentName: 'UNO_Minda_Financial_Disclosures_Audited_Q4FY24.pdf',
        documentType: 'STATUTORY_FILING',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-05-16',
        documentHashSha256: '9201bd9840291ca8e47192bd840219cae901482ba014829be49102ca7281ef84',
        repositoryRelativePath: 'data/disclosures/UNOMINDA/2024/UNO_Minda_Financial_Disclosures_Audited_Q4FY24.pdf',
        pageCount: 52,
        filingAuthority: 'BSE Corporate Announcement'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_UNO_AR24_P56',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        documentId: 'DOC_UNO_AR2024',
        documentHash: '840192cae981248ba014829bc39104aa1098234af09281ca8401928eb471928b',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 56,
        pagePrinted: 54,
        quotedText: 'Targeting EV kit value per 2-wheeler to cross ₹25,000 on high-voltage battery management systems and controllers.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE'
      },
      {
        evidenceId: 'EV_UNO_DISCLOSURE_Q4',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        documentId: 'DOC_UNO_BSE_Q4FY24',
        documentHash: '9201bd9840291ca8e47192bd840219cae901482ba014829be49102ca7281ef84',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 8,
        pagePrinted: 8,
        quotedText: 'EV potential kit value achieved ₹27,800 per vehicle for 2-wheelers with ₹1,200 Cr in EV order book commitments.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      },
      {
        evidenceId: 'EV_UNO_LEVERAGE_Q4',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        documentId: 'DOC_UNO_BSE_Q4FY24',
        documentHash: '9201bd9840291ca8e47192bd840219cae901482ba014829be49102ca7281ef84',
        documentType: 'BSE_DISCLOSURE',
        pagePhysical: 18,
        pagePrinted: 18,
        quotedText: 'Consolidated Net Debt stood at ₹912 Cr against FY24 EBITDA of ₹1,582 Cr, resulting in conservative Net Debt / EBITDA of 0.58x.',
        verificationStatus: 'VERIFIED',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE'
      }
    ],
    claims: [
      {
        claimId: 'CLM_UNO_01',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        period: 'FY24',
        category: 'TECHNOLOGY',
        statement: 'EV kit value per 2W vehicle targeted to exceed ₹25,000.',
        targetMetric: 'ev_kit_value_inr',
        baselineValue: 18000,
        expectedValue: 25000,
        expectedOutcome: 'EV kit value >= ₹25,000',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_UNO_AR24_P56',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 27800,
        actualOutcomeDescription: 'Delivered ₹27,800 EV kit value on BMS and controller commercialization',
        evaluationEvidenceId: 'EV_UNO_DISCLOSURE_Q4',
        evaluationDate: '2024-05-16',
        evaluationBasis: 'BSE Investor Presentation and Audited Segmental Reports',
        createdAt: '2023-08-14T10:00:00.000Z'
      }
    ],
    events: [
      {
        eventId: 'EVT_UNO_01',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        eventDate: '2024-05-16',
        category: 'ORDER_BOOK',
        headline: 'UNO Minda crosses ₹1,200 Cr EV order book commitments',
        description: 'Exchange filing confirms commercialization of next-gen smart controllers and lighting systems',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'BSE_DISCLOSURE',
        evidenceId: 'EV_UNO_DISCLOSURE_Q4',
        materiality: 'MATERIAL',
        createdAt: '2024-05-16T09:15:00.000Z'
      }
    ],
    contradictions: [],
    thesis: {
      symbol: 'UNOMINDA',
      coreThesisStatement: 'Tier-1 automotive supplier capitalizing on EV kit value expansion and localization of premium electronic components.',
      investmentPillars: [
        {
          pillarId: 'PIL_UNO_01',
          title: 'Kit Value Multiplier',
          description: 'Transition from ICE to EV increases content per vehicle by 3x to 4x across lighting, switches, and acoustics.'
        },
        {
          pillarId: 'PIL_UNO_02',
          title: 'Conservative Leverage',
          description: 'Net debt / EBITDA sustained well below 1.0x while funding greenfield capacity.'
        }
      ],
      thesisBreakersDefined: ['TB_UNO_LEVERAGE']
    },
    breakers: [
      {
        breakerId: 'TB_UNO_LEVERAGE',
        name: 'Leverage Incurrence Breaker',
        description: 'Net Debt / EBITDA must not breach 2.0x',
        type: 'QUANTITATIVE',
        evaluationMethod: 'METRIC_THRESHOLD',
        conditionText: 'Net Debt / EBITDA > 2.0',
        quantitativeCondition: {
          metric: 'net_debt_to_ebitda',
          operator: '>',
          threshold: 2.0,
          evaluationPeriod: 'annual',
          evidenceRequired: true
        },
        status: 'INACTIVE',
        severity: 'HIGH',
        rationale: '',
        evidenceIds: ['EV_UNO_LEVERAGE_Q4']
      }
    ],
    breakerContextMetrics: { net_debt_to_ebitda: 0.58 },
    itasSignal: {
      symbol: 'UNOMINDA',
      strategyAgreementCount: 6,
      totalStrategiesEvaluated: 20,
      signalStrength: 90,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY'
    }
  }
];

async function runBatch1() {
  console.log('================================================================================');
  console.log('IICE PHASE 2: BATCH 1 (BENCHMARK CLEAN & GROWTH LEADERS) EXECUTION');
  console.log('================================================================================');

  const cohortDbPath = path.resolve('data', 'phase2_cohort', 'iice_cohort.db');
  const db = new sqlite3.Database(cohortDbPath);
  await new Promise<void>((res, rej) => db.run('PRAGMA busy_timeout = 30000;', (e) => (e ? rej(e) : res())));
  await new Promise<void>((res, rej) => db.run('PRAGMA journal_mode = WAL;', (e) => (e ? rej(e) : res())));

  // Initialize schema in dedicated cohort database
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS EvidenceInventory (
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
        CREATE TABLE IF NOT EXISTS ManagementClaims (
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS IntelligenceEvents (
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
          source_tier TEXT DEFAULT 'TIER_2_PRIMARY_CORPORATE',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS Contradictions (
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
      `, (err) => (err ? reject(err) : resolve()));
    });
  });

  const gate = new IntelligenceQualityGate(db);
  const claimService = new ClaimLedgerService(db);
  const contraEngine = new ContradictionEngine(db);
  const breakerEngine = new ThesisBreakerEngine();
  const reconciler = new ItasIiceReconciliationService();

  const cohortSummaryRows: any[] = [];

  for (const item of BATCH_1_COMPANIES) {
    const sym = item.company.symbol;
    console.log(`\n>>> Processing [Batch 1] ${sym} - ${item.company.companyName}...`);

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
      await gate.approveAndPersistClaim(clm);
    }
    fs.writeFileSync(path.join(symbolDir, 'claims.json'), JSON.stringify(item.claims, null, 2));

    // 5. Validate & persist events via Quality Gate
    for (const evt of item.events) {
      await gate.approveAndPersistEvent(evt);
    }
    fs.writeFileSync(path.join(symbolDir, 'events.json'), JSON.stringify(item.events, null, 2));

    // 6. Scorecard calculation
    const scorecard = await claimService.getCredibilityScorecard(sym);

    // 7. Contradictions evaluation
    for (const con of item.contradictions) {
      await gate.approveAndPersistContradiction(con);
    }
    const retrievedContras = await contraEngine.getContradictionsForIssuer(sym);
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

  // Write Batch 1 Markdown Summary Report
  let md = `# Phase 2 - Batch 1 Execution Report: Benchmark Clean & Growth Leaders

**Execution Timestamp:** ${new Date().toISOString()}  
**Status:** BATCH 1 COMPLETE (5/5 Companies Processed)  
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
- **Executive Summary**: ${r.oneLineSummary}
- **Artifact Location**: \`data/phase2_cohort/${r.symbol}/\`

`;
  }

  fs.writeFileSync(path.resolve('data', 'phase2_cohort', 'BATCH_1_EXECUTION_REPORT.md'), md);
  console.log('\n================================================================================');
  console.log('BATCH 1 COMPLETE: Report saved to data/phase2_cohort/BATCH_1_EXECUTION_REPORT.md');
  console.log('================================================================================');

  await new Promise<void>((resolve) => db.close(() => resolve()));
}

console.error('LEGACY_SYNTHETIC_QUARANTINED: this batch cannot create live FERE evidence.');
process.exitCode = 1;
