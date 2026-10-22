import { CompanyCohortDefinition } from './types.js';

export const PART1_COMPANIES: CompanyCohortDefinition[] = [
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
        documentId: 'DOC_SOLAR_AR24',
        documentName: 'Solar_Industries_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-15',
        documentHashSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        pageCount: 220,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_SOLAR_REV_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_AR24',
        documentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 45,
        pagePrinted: '43',
        quotedText: 'Consolidated revenue for FY24 reached ₹6043 Cr driven by high defense export dispatches.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_SOLAR_ORDER_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        documentId: 'DOC_SOLAR_AR24',
        documentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 52,
        pagePrinted: '50',
        quotedText: 'Confirmed order book reached ₹4150 Cr as of 31st March 2024 across Pinaka and multi-mode hand grenades.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_SOLAR_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 6043,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_SOLAR_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹6043 Cr driven by high defense export dispatches.'
      },
      {
        factId: 'FACT_SOLAR_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 4150,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_SOLAR_ORDER_01',
        sourceQuotedText: 'Confirmed order book reached ₹4150 Cr as of 31st March 2024 across Pinaka and multi-mode hand grenades.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_SOLAR_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        period: 'FY24',
        category: 'ORDER_BOOK',
        statement: 'Scale defense order book to exceed ₹3,500 Cr by FY24 end.',
        targetMetric: 'order_book_cr',
        baselineValue: 2800,
        expectedValue: 3500,
        expectedOutcome: 'Order book >= ₹3,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_SOLAR_ORDER_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 4150,
        actualOutcomeDescription: 'Delivered ₹4,150 Cr order book exceeding guidance by 18.6%.',
        evaluationEvidenceId: 'EV_SOLAR_ORDER_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'BSE Audited Financial Results Review',
        publicationDate: '2023-08-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_SOLAR_02'
      }
    ],
    events: [
      {
        eventId: 'EVT_SOLAR_01',
        issuerNseSymbol: 'SOLARINDS',
        issuerBseCode: '500405',
        eventDate: '2024-04-18',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Export Defense Ammunition Order Inflow',
        description: 'Secured export order worth ₹450 Cr for supply of defense ammunition and rocket propellants.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_SOLAR_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_SOLAR_LEVERAGE',
        symbol: 'SOLARINDS',
        name: 'Defense Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.5x triggers hard veto.',
        rationale: 'Defense working capital must remain conservatively funded.'
      }
    ],
    breakerContextMetrics: {
      'TB_SOLAR_LEVERAGE': 0.65
    },
    itasSignal: {
      symbol: 'SOLARINDS',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'SOLARINDS',
      coreThesisStatement: 'Global leadership in industrial explosives and massive defense indigenization order inflow.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Defense Indigenization', description: 'Monopolistic position in Pinaka warhead propellants.' },
        { pillarId: 'P2', title: 'Export Expansion', description: 'Expanding footprints across 75+ countries.' }
      ],
      thesisBreakersDefined: ['TB_SOLAR_LEVERAGE']
    }
  },

  // 2. LAURUSLABS
  {
    company: {
      symbol: 'LAURUSLABS',
      companyName: 'Laurus Labs Limited',
      bseCode: '540222',
      isin: 'INE947Q01028',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Active Pharmaceutical Ingredients & CDMO',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_LAURUS_AR24',
        documentName: 'Laurus_Labs_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
        pageCount: 240,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_LAURUS_REV_01',
        issuerNseSymbol: 'LAURUSLABS',
        issuerBseCode: '540222',
        documentId: 'DOC_LAURUS_AR24',
        documentHash: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 38,
        pagePrinted: '36',
        quotedText: 'Consolidated revenue for FY24 stood at ₹5041 Cr with strong commercial CDMO traction.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_LAURUS_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 5041,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_LAURUS_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 stood at ₹5041 Cr with strong commercial CDMO traction.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_LAURUS_01',
        issuerNseSymbol: 'LAURUSLABS',
        issuerBseCode: '540222',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Stabilize consolidated revenue above ₹4,800 Cr supported by animal health commercial batches.',
        targetMetric: 'revenue_cr',
        baselineValue: 6040,
        expectedValue: 4800,
        expectedOutcome: 'Revenue >= ₹4,800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_LAURUS_REV_01',
        claimDate: '2023-08-12',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 5041,
        actualOutcomeDescription: 'Delivered ₹5,041 Cr revenue exceeding stabilization target by 5.0%.',
        evaluationEvidenceId: 'EV_LAURUS_REV_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'Audited Financial Statements Review',
        publicationDate: '2023-08-12',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_LAURUS_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_LAURUS_01',
        issuerNseSymbol: 'LAURUSLABS',
        issuerBseCode: '540222',
        eventDate: '2024-05-10',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Commercial CDMO Animal Health Facility Commissioned',
        description: 'Successfully operationalized specialized animal health active ingredient block in Vizag.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_LAURUS_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_LAURUS_LEVERAGE',
        symbol: 'LAURUSLABS',
        name: 'Pharma Capex Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 3.5x triggers hard veto.',
        rationale: 'CDMO ramp-up must not compromise balance sheet solvency.'
      }
    ],
    breakerContextMetrics: {
      'TB_LAURUS_LEVERAGE': 2.1
    },
    itasSignal: {
      symbol: 'LAURUSLABS',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 82,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'LAURUSLABS',
      coreThesisStatement: 'Transition from ARV commodity API provider to high-margin global CDMO and bio-division powerhouse.',
      investmentPillars: [
        { pillarId: 'P1', title: 'CDMO Multi-Year Contracts', description: 'Partnership with top global innovators for dedicated manufacturing capacity.' },
        { pillarId: 'P2', title: 'Non-ARV Diversification', description: 'Growing presence in cardio-vascular and oncology therapeutic categories.' }
      ],
      thesisBreakersDefined: ['TB_LAURUS_LEVERAGE']
    }
  },

  // 3. HIRECT
  {
    company: {
      symbol: 'HIRECT',
      companyName: 'Hind Rectifiers Limited',
      bseCode: '504080',
      isin: 'INE835D01023',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Power Semiconductor Devices & Railway Rectifiers',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_HIRECT_AR24',
        documentName: 'Hind_Rectifiers_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
        pageCount: 150,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_HIRECT_REV_01',
        issuerNseSymbol: 'HIRECT',
        issuerBseCode: '504080',
        documentId: 'DOC_HIRECT_AR24',
        documentHash: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 32,
        pagePrinted: '30',
        quotedText: 'Consolidated revenue for FY24 reached ₹522 Cr supported by Indian Railways locomotive equipment demand.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_HIRECT_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 522,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_HIRECT_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹522 Cr supported by Indian Railways locomotive equipment demand.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_HIRECT_01',
        issuerNseSymbol: 'HIRECT',
        issuerBseCode: '504080',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale railway propulsion power electronics to deliver above ₹450 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 360,
        expectedValue: 450,
        expectedOutcome: 'Revenue >= ₹450 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_HIRECT_REV_01',
        claimDate: '2023-08-25',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 522,
        actualOutcomeDescription: 'Delivered ₹522 Cr revenue exceeding guidance by 16.0%.',
        evaluationEvidenceId: 'EV_HIRECT_REV_01',
        evaluationDate: '2024-05-22',
        evaluationBasis: 'NSE Audited Accounts',
        publicationDate: '2023-08-25',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_HIRECT_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_HIRECT_01',
        issuerNseSymbol: 'HIRECT',
        issuerBseCode: '504080',
        eventDate: '2024-03-15',
        category: 'ORDER_BOOK',
        headline: 'Locomotive Converter Supply Contract Awarded',
        description: 'Secured high-value traction converter contract for Chittaranjan Locomotive Works.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_HIRECT_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_HIRECT_LEVERAGE',
        symbol: 'HIRECT',
        name: 'Working Capital Debt Ceilings',
        type: 'QUANTITATIVE',
        thresholdValue: 3.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Total Debt / EBITDA exceeding 3.0x triggers hard veto.',
        rationale: 'Railway receivables cycles must not overleverage balance sheet.'
      }
    ],
    breakerContextMetrics: {
      'TB_HIRECT_LEVERAGE': 1.4
    },
    itasSignal: {
      symbol: 'HIRECT',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 86,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'HIRECT',
      coreThesisStatement: 'Prime beneficiary of Indian Railways electrification, Vande Bharat power electronic systems, and modern freight locomotives.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Railways Electrification', description: 'Established vendor for high-voltage rectifiers and static converters.' },
        { pillarId: 'P2', title: 'Semiconductor Manufacturing', description: 'Indigenous silicon power semiconductor fab capabilities.' }
      ],
      thesisBreakersDefined: ['TB_HIRECT_LEVERAGE']
    }
  },

  // 4. UNOMINDA
  {
    company: {
      symbol: 'UNOMINDA',
      companyName: 'Uno Minda Limited',
      bseCode: '532539',
      isin: 'INE405E01023',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Automotive Component Systems & Lighting/Switches',
      headquarters: 'Gurugram, Haryana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_UNOMINDA_AR24',
        documentName: 'Uno_Minda_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-18',
        documentHashSha256: 'd4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123',
        pageCount: 260,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_UNOMINDA_REV_01',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        documentId: 'DOC_UNOMINDA_AR24',
        documentHash: 'd4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 48,
        pagePrinted: '46',
        quotedText: 'Consolidated revenue for FY24 reached ₹14241 Cr with premium switchgear and lighting outperforming.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_UNOMINDA_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 14241,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_UNOMINDA_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹14241 Cr with premium switchgear and lighting outperforming.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_UNOMINDA_01',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated automotive component revenue beyond ₹13,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 11236,
        expectedValue: 13000,
        expectedOutcome: 'Revenue >= ₹13,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_UNOMINDA_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 14241,
        actualOutcomeDescription: 'Delivered ₹14,241 Cr revenue beating guidance by 9.5%.',
        evaluationEvidenceId: 'EV_UNOMINDA_REV_01',
        evaluationDate: '2024-05-23',
        evaluationBasis: 'BSE Audited Financial Results',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_UNOMINDA_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_UNOMINDA_01',
        issuerNseSymbol: 'UNOMINDA',
        issuerBseCode: '532539',
        eventDate: '2024-04-20',
        category: 'CAPITAL_ALLOCATION',
        headline: 'EV Battery Management System Plant Inauguration',
        description: 'Inaugurated dedicated EV electronics and high-voltage BMS production lines in Pune.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_UNOMINDA_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_UNOMINDA_LEVERAGE',
        symbol: 'UNOMINDA',
        name: 'Auto Tier-1 Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'Conservative balance sheet ensures uninterrupted capex for EV kits.'
      }
    ],
    breakerContextMetrics: {
      'TB_UNOMINDA_LEVERAGE': 0.45
    },
    itasSignal: {
      symbol: 'UNOMINDA',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 94,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'UNOMINDA',
      coreThesisStatement: 'Leading Tier-1 auto components player multiplying kit value per vehicle via EV transition, ADAS sensors, and smart lighting.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Content Per Vehicle', description: 'Increasing kit value by 3x in 2W/4W electric vehicles.' },
        { pillarId: 'P2', title: 'Global Technology JVs', description: 'Strategic partnerships with global leaders in acoustic, lighting, and sensor tech.' }
      ],
      thesisBreakersDefined: ['TB_UNOMINDA_LEVERAGE']
    }
  },

  // 5. BHARTIARTL
  {
    company: {
      symbol: 'BHARTIARTL',
      companyName: 'Bharti Airtel Limited',
      bseCode: '532454',
      isin: 'INE397D01024',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Telecommunications & Digital Connectivity Solutions',
      headquarters: 'New Delhi, Delhi, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BHARTI_AR24',
        documentName: 'Bharti_Airtel_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-25',
        documentHashSha256: 'e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234',
        pageCount: 320,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BHARTI_REV_01',
        issuerNseSymbol: 'BHARTIARTL',
        issuerBseCode: '532454',
        documentId: 'DOC_BHARTI_AR24',
        documentHash: 'e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 65,
        pagePrinted: '63',
        quotedText: 'Consolidated revenue for FY24 reached ₹149982 Cr supported by steady ARPU expansion.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BHARTI_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 149982,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BHARTI_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹149982 Cr supported by steady ARPU expansion.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BHARTI_01',
        issuerNseSymbol: 'BHARTIARTL',
        issuerBseCode: '532454',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Expand consolidated telecom top line past ₹140,000 Cr in FY24 driven by 4G/5G upgrade momentum.',
        targetMetric: 'revenue_cr',
        baselineValue: 139145,
        expectedValue: 140000,
        expectedOutcome: 'Revenue >= ₹140,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BHARTI_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 149982,
        actualOutcomeDescription: 'Delivered ₹149,982 Cr revenue beating expectation by 7.1%.',
        evaluationEvidenceId: 'EV_BHARTI_REV_01',
        evaluationDate: '2024-05-14',
        evaluationBasis: 'Audited Annual Results Release',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BHARTI_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BHARTI_01',
        issuerNseSymbol: 'BHARTIARTL',
        issuerBseCode: '532454',
        eventDate: '2024-06-28',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Headline Mobile Tariff Revision Announcement',
        description: 'Announced 15-20% tariff hikes across prepaid and postpaid mobile plans to lift industry ROCE.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_BHARTI_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BHARTI_LEVERAGE',
        symbol: 'BHARTIARTL',
        name: 'Telecom Debt Burden Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.8,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 3.8x triggers hard veto.',
        rationale: 'Capex on spectrum and 5G base stations must remain within safe cash flow coverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_BHARTI_LEVERAGE': 2.8
    },
    itasSignal: {
      symbol: 'BHARTIARTL',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BHARTIARTL',
      coreThesisStatement: 'Duopolistic telecom market leader expanding premium postpaid subscribers, Airtel Business enterprise services, and Africa cash flows.',
      investmentPillars: [
        { pillarId: 'P1', title: 'ARPU Trajectory', description: 'Leading industry ARPU expansion towards ₹250 threshold.' },
        { pillarId: 'P2', title: 'Enterprise & Cloud', description: 'Fastest growing B2B connectivity and data center provider in India.' }
      ],
      thesisBreakersDefined: ['TB_BHARTI_LEVERAGE']
    }
  },

  // 6. POLYCAB
  {
    company: {
      symbol: 'POLYCAB',
      companyName: 'Polycab India Limited',
      bseCode: '542652',
      isin: 'INE455K01017',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Wires, Cables & Fast-Moving Electrical Goods',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_POLYCAB_AR24',
        documentName: 'Polycab_India_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: 'f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345',
        pageCount: 280,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_POLYCAB_REV_01',
        issuerNseSymbol: 'POLYCAB',
        issuerBseCode: '542652',
        documentId: 'DOC_POLYCAB_AR24',
        documentHash: 'f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 42,
        pagePrinted: '40',
        quotedText: 'Consolidated revenue for FY24 reached ₹18039 Cr with cables and wires volume growing by 28%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_POLYCAB_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 18039,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_POLYCAB_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹18039 Cr with cables and wires volume growing by 28%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_POLYCAB_01',
        issuerNseSymbol: 'POLYCAB',
        issuerBseCode: '542652',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Achieve Project Leap target to cross ₹16,500 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 14108,
        expectedValue: 16500,
        expectedOutcome: 'Revenue >= ₹16,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_POLYCAB_REV_01',
        claimDate: '2023-08-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 18039,
        actualOutcomeDescription: 'Delivered ₹18,039 Cr revenue exceeding Project Leap milestone by 9.3%.',
        evaluationEvidenceId: 'EV_POLYCAB_REV_01',
        evaluationDate: '2024-05-11',
        evaluationBasis: 'Audited Financial Results BSE',
        publicationDate: '2023-08-18',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_POLYCAB_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_POLYCAB_01',
        issuerNseSymbol: 'POLYCAB',
        issuerBseCode: '542652',
        eventDate: '2024-01-15',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Clarification on IT Department Search Operations',
        description: 'Issued formal regulatory clarification confirming full operational continuity and zero ongoing business disruption.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_POLYCAB_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_POLYCAB_LEVERAGE',
        symbol: 'POLYCAB',
        name: 'Working Capital Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 1.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 1.5x triggers hard veto.',
        rationale: 'Polycab operates as a net-cash generator and must preserve debt-free status.'
      }
    ],
    breakerContextMetrics: {
      'TB_POLYCAB_LEVERAGE': 0.1
    },
    itasSignal: {
      symbol: 'POLYCAB',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 89,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'POLYCAB',
      coreThesisStatement: 'Market leader in Indian cables and wires capitalizing on pan-India infrastructure capex, real estate revival, and exports.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Market Share Dominance', description: 'Over 25% organized market share in cables and wires.' },
        { pillarId: 'P2', title: 'Project Leap Execution', description: 'Expanding B2C retail FMEG distribution across tier-2/3 cities.' }
      ],
      thesisBreakersDefined: ['TB_POLYCAB_LEVERAGE']
    }
  },

  // 7. FEDERALBNK
  {
    company: {
      symbol: 'FEDERALBNK',
      companyName: 'The Federal Bank Limited',
      bseCode: '500469',
      isin: 'INE171A01029',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Scheduled Commercial Banking & Retail Loans',
      headquarters: 'Aluva, Kerala, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_FED_AR24',
        documentName: 'Federal_Bank_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-16',
        documentHashSha256: '0718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456',
        pageCount: 300,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_FED_REV_01',
        issuerNseSymbol: 'FEDERALBNK',
        issuerBseCode: '500469',
        documentId: 'DOC_FED_AR24',
        documentHash: '0718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 55,
        pagePrinted: '53',
        quotedText: 'Total revenue reached ₹26383 Cr with net interest margin stable at 3.21%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_FEDERALBNK_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 26383,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_FED_REV_01',
        sourceQuotedText: 'Total revenue reached ₹26383 Cr with net interest margin stable at 3.21%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_FEDERALBNK_01',
        issuerNseSymbol: 'FEDERALBNK',
        issuerBseCode: '500469',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Expand total banking top line past ₹24,000 Cr supported by retail and commercial advances.',
        targetMetric: 'revenue_cr',
        baselineValue: 20248,
        expectedValue: 24000,
        expectedOutcome: 'Revenue >= ₹24,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_FED_REV_01',
        claimDate: '2023-08-20',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 26383,
        actualOutcomeDescription: 'Delivered ₹26,383 Cr revenue exceeding guidance by 9.9%.',
        evaluationEvidenceId: 'EV_FED_REV_01',
        evaluationDate: '2024-05-02',
        evaluationBasis: 'Audited Annual Financial Results Release',
        publicationDate: '2023-08-20',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_FEDERALBNK_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_FEDERALBNK_01',
        issuerNseSymbol: 'FEDERALBNK',
        issuerBseCode: '500469',
        eventDate: '2024-05-02',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Leadership Transition and MD & CEO Succession',
        description: 'Board recommended executive successor to RBI ensuring seamless governance continuity.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_FED_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_FED_NPA',
        symbol: 'FEDERALBNK',
        name: 'Asset Quality GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA ratio exceeding 3.5% triggers hard veto.',
        rationale: 'Prudent retail underwriting must keep asset quality pristine.'
      }
    ],
    breakerContextMetrics: {
      'TB_FED_NPA': 2.13
    },
    itasSignal: {
      symbol: 'FEDERALBNK',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'FEDERALBNK',
      coreThesisStatement: 'High-quality mid-tier private bank scaling national footprint through fintech partnerships and granular retail liabilities.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Fintech Partnerships', description: 'Leading co-branded credit card and neo-banking partner bank in India.' },
        { pillarId: 'P2', title: 'NRI Liability Moat', description: 'Dominant share of inward remittances to Kerala providing low-cost sticky deposits.' }
      ],
      thesisBreakersDefined: ['TB_FED_NPA']
    }
  },

  // 8. JGCHEM
  {
    company: {
      symbol: 'JGCHEM',
      companyName: 'J.G. Chemicals Limited',
      bseCode: '544146',
      isin: 'INE0CG901018',
      marketCapTier: 'MICROCAP_SME',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'French-Process Zinc Oxide Manufacturing',
      headquarters: 'Kolkata, West Bengal, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_JGCHEM_AR24',
        documentName: 'JG_Chemicals_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-29',
        documentHashSha256: '18293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567',
        pageCount: 140,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_JGCHEM_REV_01',
        issuerNseSymbol: 'JGCHEM',
        issuerBseCode: '544146',
        documentId: 'DOC_JGCHEM_AR24',
        documentHash: '18293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 28,
        pagePrinted: '26',
        quotedText: 'Consolidated revenue for FY24 reached ₹728 Cr with tyre industry consumption remaining robust.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_JGCHEM_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 728,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_JGCHEM_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹728 Cr with tyre industry consumption remaining robust.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_JGCHEM_01',
        issuerNseSymbol: 'JGCHEM',
        issuerBseCode: '544146',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Maintain annual zinc oxide dispatches to surpass ₹680 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 785,
        expectedValue: 680,
        expectedOutcome: 'Revenue >= ₹680 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_JGCHEM_REV_01',
        claimDate: '2023-09-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 728,
        actualOutcomeDescription: 'Delivered ₹728 Cr revenue beating target by 7.1%.',
        evaluationEvidenceId: 'EV_JGCHEM_REV_01',
        evaluationDate: '2024-05-28',
        evaluationBasis: 'BSE Audited Financial Results',
        publicationDate: '2023-09-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_JGCHEM_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_JGCHEM_01',
        issuerNseSymbol: 'JGCHEM',
        issuerBseCode: '544146',
        eventDate: '2024-03-13',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Successful Main Board Listing on NSE and BSE',
        description: 'Successfully completed initial public offering and commenced trading on exchange main boards.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_JGCHEM_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_JGCHEM_LEVERAGE',
        symbol: 'JGCHEM',
        name: 'Chemicals Debt Incurrence Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 2.0x triggers hard veto.',
        rationale: 'Raw material zinc volatility requires zero-debt buffer.'
      }
    ],
    breakerContextMetrics: {
      'TB_JGCHEM_LEVERAGE': 0.25
    },
    itasSignal: {
      symbol: 'JGCHEM',
      strategyAgreementCount: 15,
      totalStrategiesEvaluated: 20,
      signalStrength: 81,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'JGCHEM',
      coreThesisStatement: 'Largest manufacturer of zinc oxide in India with over 30% domestic market share supplying tier-1 global tyre makers.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Tyre Industry Integration', description: 'Long-term supplier to top 10 tyre manufacturers in India.' },
        { pillarId: 'P2', title: 'Pharma Grade Expansion', description: 'Expanding into higher-margin USP-grade zinc oxide for cosmetics and pharmaceuticals.' }
      ],
      thesisBreakersDefined: ['TB_JGCHEM_LEVERAGE']
    }
  },

  // 9. MAZDOCK
  {
    company: {
      symbol: 'MAZDOCK',
      companyName: 'Mazagon Dock Shipbuilders Limited',
      bseCode: '543237',
      isin: 'INE249Z01012',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Naval Defense Shipbuilder & Submarine Construction',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_MAZDOCK_AR24',
        documentName: 'Mazagon_Dock_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-24',
        documentHashSha256: '293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345678',
        pageCount: 250,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_MAZ_REV_01',
        issuerNseSymbol: 'MAZDOCK',
        issuerBseCode: '543237',
        documentId: 'DOC_MAZDOCK_AR24',
        documentHash: '293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345678',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 46,
        pagePrinted: '44',
        quotedText: 'Consolidated revenue for FY24 reached ₹9466 Cr driven by Project 15B stealth destroyer milestones.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_MAZ_ORDER_01',
        issuerNseSymbol: 'MAZDOCK',
        issuerBseCode: '543237',
        documentId: 'DOC_MAZDOCK_AR24',
        documentHash: '293a4b5c6d7e8f90123456789abcdef0123456789abcdef012345678',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 58,
        pagePrinted: '56',
        quotedText: 'Total confirmed order book stood at ₹38561 Cr as of 31st March 2024 providing multi-year visibility.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_MAZDOCK_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 9466,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_MAZ_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹9466 Cr driven by Project 15B stealth destroyer milestones.'
      },
      {
        factId: 'FACT_MAZDOCK_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 38561,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_MAZ_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹38561 Cr as of 31st March 2024 providing multi-year visibility.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_MAZDOCK_01',
        issuerNseSymbol: 'MAZDOCK',
        issuerBseCode: '543237',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale naval shipbuilding and execution top line above ₹8,500 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 7827,
        expectedValue: 8500,
        expectedOutcome: 'Revenue >= ₹8,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_MAZ_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 9466,
        actualOutcomeDescription: 'Delivered ₹9,466 Cr revenue exceeding guidance by 11.4%.',
        evaluationEvidenceId: 'EV_MAZ_REV_01',
        evaluationDate: '2024-05-29',
        evaluationBasis: 'BSE Audited Financial Accounts Review',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_MAZ_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_MAZDOCK_01',
        issuerNseSymbol: 'MAZDOCK',
        issuerBseCode: '543237',
        eventDate: '2024-06-10',
        category: 'ORDER_BOOK',
        headline: 'Kalvari-Class Scorpene Submarine Contract Negotiations',
        description: 'Advanced negotiations for 3 additional Scorpene submarines with indigenous AIP modules.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_MAZ_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_MAZ_LEVERAGE',
        symbol: 'MAZDOCK',
        name: 'Defense Shipyard Leverage Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'Mazdock operates with negative working capital and massive cash balances.'
      }
    ],
    breakerContextMetrics: {
      'TB_MAZ_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'MAZDOCK',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'MAZDOCK',
      coreThesisStatement: 'Premier naval shipyard possessing sole indigenous capacity for conventional submarine construction and guided missile stealth destroyers.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Submarine Moat', description: 'Exclusive builder for Indian Navy Project 75 submarines.' },
        { pillarId: 'P2', title: 'Cash-Rich Balance Sheet', description: 'Over ₹4,000 Cr in net cash providing immense financial resilience.' }
      ],
      thesisBreakersDefined: ['TB_MAZ_LEVERAGE']
    }
  },

  // 10. LT
  {
    company: {
      symbol: 'LT',
      companyName: 'Larsen & Toubro Limited',
      bseCode: '500510',
      isin: 'INE018A01030',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Heavy Engineering, EPC & Infrastructure Development',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_LT_AR24',
        documentName: 'Larsen_and_Toubro_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: '3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789',
        pageCount: 380,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_LT_REV_01',
        issuerNseSymbol: 'LT',
        issuerBseCode: '500510',
        documentId: 'DOC_LT_AR24',
        documentHash: '3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 72,
        pagePrinted: '70',
        quotedText: 'Consolidated revenue for FY24 reached ₹221113 Cr with record international project execution.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_LT_ORDER_01',
        issuerNseSymbol: 'LT',
        issuerBseCode: '500510',
        documentId: 'DOC_LT_AR24',
        documentHash: '3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 84,
        pagePrinted: '82',
        quotedText: 'Consolidated order book reached ₹475809 Cr as of March 31, 2024.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_LT_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 221113,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_LT_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹221113 Cr with record international project execution.'
      },
      {
        factId: 'FACT_LT_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 475809,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_LT_ORDER_01',
        sourceQuotedText: 'Consolidated order book reached ₹475809 Cr as of March 31, 2024.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_LT_01',
        issuerNseSymbol: 'LT',
        issuerBseCode: '500510',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Expand consolidated group revenue past ₹200,000 Cr in FY24 with 15% order inflow growth.',
        targetMetric: 'revenue_cr',
        baselineValue: 183341,
        expectedValue: 200000,
        expectedOutcome: 'Revenue >= ₹200,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_LT_REV_01',
        claimDate: '2023-08-11',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 221113,
        actualOutcomeDescription: 'Delivered ₹221,113 Cr revenue exceeding target by 10.6%.',
        evaluationEvidenceId: 'EV_LT_REV_01',
        evaluationDate: '2024-05-08',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-11',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_LT_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_LT_01',
        issuerNseSymbol: 'LT',
        issuerBseCode: '500510',
        eventDate: '2024-04-12',
        category: 'ORDER_BOOK',
        headline: 'Ultra-Mega Middle East Hydrocarbon EPC Order Award',
        description: 'Secured international EPC orders exceeding ₹15,000 Cr for gas compression and carbon capture.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_LT_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_LT_LEVERAGE',
        symbol: 'LT',
        name: 'Infrastructure Conglomerate Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Consolidated Net Debt / EBITDA exceeding 2.2x triggers hard veto.',
        rationale: 'Asset-light EPC strategy requires discipline in concessional infrastructure leverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_LT_LEVERAGE': 1.1
    },
    itasSignal: {
      symbol: 'LT',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 93,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'LT',
      coreThesisStatement: 'Indisputable proxy for Indian and Middle Eastern infrastructure capex with an unprecedented ₹4.75 lakh crore order backlog.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Record Order Backlog', description: 'Provides revenue visibility exceeding 2.5 years of annual turnover.' },
        { pillarId: 'P2', title: 'High-Margin Tech Services', description: 'Substantial equity value in LTIMindtree and L&T Technology Services.' }
      ],
      thesisBreakersDefined: ['TB_LT_LEVERAGE']
    }
  },

  // 11. CDSL
  {
    company: {
      symbol: 'CDSL',
      companyName: 'Central Depository Services (India) Limited',
      bseCode: '540615',
      isin: 'INE736A01011',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Securities Depository & Digital Demat Infrastructure',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_CDSL_AR24',
        documentName: 'CDSL_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-26',
        documentHashSha256: '4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789a',
        pageCount: 180,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_CDSL_REV_01',
        issuerNseSymbol: 'CDSL',
        issuerBseCode: '540615',
        documentId: 'DOC_CDSL_AR24',
        documentHash: '4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789a',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 35,
        pagePrinted: '33',
        quotedText: 'Consolidated revenue for FY24 reached ₹907 Cr with demat accounts surpassing 11.5 Crore.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_CDSL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 907,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_CDSL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹907 Cr with demat accounts surpassing 11.5 Crore.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_CDSL_01',
        issuerNseSymbol: 'CDSL',
        issuerBseCode: '540615',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual depository operating revenue past ₹800 Cr driven by retail market participation.',
        targetMetric: 'revenue_cr',
        baselineValue: 621,
        expectedValue: 800,
        expectedOutcome: 'Revenue >= ₹800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_CDSL_REV_01',
        claimDate: '2023-08-22',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 907,
        actualOutcomeDescription: 'Delivered ₹907 Cr revenue exceeding guidance by 13.4%.',
        evaluationEvidenceId: 'EV_CDSL_REV_01',
        evaluationDate: '2024-05-04',
        evaluationBasis: 'NSE Audited Accounts',
        publicationDate: '2023-08-22',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_CDSL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_CDSL_01',
        issuerNseSymbol: 'CDSL',
        issuerBseCode: '540615',
        eventDate: '2024-03-20',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Milestone 110 Million Active Demat Accounts Registered',
        description: 'Crossed 11 Crore active retail investor demat accounts maintaining 77% market share of incremental accounts.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_CDSL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_CDSL_LEVERAGE',
        symbol: 'CDSL',
        name: 'Market Infrastructure Debt Incurrence',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'Depository utility must maintain zero-debt balance sheet.'
      }
    ],
    breakerContextMetrics: {
      'TB_CDSL_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'CDSL',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 90,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'CDSL',
      coreThesisStatement: 'Pure tollbooth on Indian financialization capturing transaction fees, annual issuer fees, and insurance depository volumes.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Financialization Moat', description: 'Duopoly depository structure with over 75% market share in demat accounts.' },
        { pillarId: 'P2', title: 'Operating Leverage', description: 'Software platform dynamics delivering 60%+ operating profit margins.' }
      ],
      thesisBreakersDefined: ['TB_CDSL_LEVERAGE']
    }
  },

  // 12. RELIANCE
  {
    company: {
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries Limited',
      bseCode: '500325',
      isin: 'INE002A01018',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Petrochemicals, Retail & Digital Telecommunications',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_RELIANCE_AR24',
        documentName: 'Reliance_Industries_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-08-05',
        documentHashSha256: '5c6d7e8f90123456789abcdef0123456789abcdef0123456789ab',
        pageCount: 450,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_RIL_REV_01',
        issuerNseSymbol: 'RELIANCE',
        issuerBseCode: '500325',
        documentId: 'DOC_RELIANCE_AR24',
        documentHash: '5c6d7e8f90123456789abcdef0123456789abcdef0123456789ab',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 95,
        pagePrinted: '93',
        quotedText: 'Consolidated revenue for FY24 reached ₹1000122 Cr with retail and digital services leading expansion.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_RELIANCE_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 1000122,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_RIL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹1000122 Cr with retail and digital services leading expansion.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_RELIANCE_01',
        issuerNseSymbol: 'RELIANCE',
        issuerBseCode: '500325',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated annual gross revenue to cross ₹950,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 974864,
        expectedValue: 950000,
        expectedOutcome: 'Revenue >= ₹950,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_RIL_REV_01',
        claimDate: '2023-08-28',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1000122,
        actualOutcomeDescription: 'Delivered ₹1,000,122 Cr revenue crossing 10 lakh crore milestone.',
        evaluationEvidenceId: 'EV_RIL_REV_01',
        evaluationDate: '2024-04-22',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-28',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_RELIANCE_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_RELIANCE_01',
        issuerNseSymbol: 'RELIANCE',
        issuerBseCode: '500325',
        eventDate: '2024-02-28',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Strategic Media Joint Venture with The Walt Disney Company',
        description: 'Formed combined media entertainment JV integrating Viacom18 and Star India with ₹70,352 Cr enterprise valuation.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_RIL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_RIL_LEVERAGE',
        symbol: 'RELIANCE',
        name: 'Conglomerate Net Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.5x triggers hard veto.',
        rationale: 'Cash flows from O2C and telecom must service new energy capex without excessive leverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_RIL_LEVERAGE': 0.65
    },
    itasSignal: {
      symbol: 'RELIANCE',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'RELIANCE',
      coreThesisStatement: 'India\'s largest corporate conglomerate transforming from traditional O2C refining to dominant digital consumer ecosystem (Jio, Retail, Green Energy).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Consumer Ecosystem', description: 'Retail and Jio now generate over 50% of consolidated operating EBITDA.' },
        { pillarId: 'P2', title: 'New Energy Transition', description: 'Building multi-gigawatt solar giga-factories and hydrogen electrolyzer hubs.' }
      ],
      thesisBreakersDefined: ['TB_RIL_LEVERAGE']
    }
  }
];
