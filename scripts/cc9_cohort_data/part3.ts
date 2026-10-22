import { CompanyCohortDefinition } from './types.js';

export const PART3_COMPANIES: CompanyCohortDefinition[] = [
  // 25. HOMEFIRST
  {
    company: {
      symbol: 'HOMEFIRST',
      companyName: 'Home First Finance Company India Limited',
      bseCode: '543259',
      isin: 'INE481N01025',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Tech-Driven Affordable Housing Finance',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_HOMEFIRST_AR24',
        documentName: 'Home_First_Finance_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: '89abcdef0123456789abcdef0123456789abcdef012345678',
        pageCount: 220,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_HOME_REV_01',
        issuerNseSymbol: 'HOMEFIRST',
        issuerBseCode: '543259',
        documentId: 'DOC_HOMEFIRST_AR24',
        documentHash: '89abcdef0123456789abcdef0123456789abcdef012345678',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 38,
        pagePrinted: '36',
        quotedText: 'Total revenue reached ₹1154 Cr with assets under management crossing ₹9,600 Cr.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_HOMEFIRST_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 1154,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_HOME_REV_01',
        sourceQuotedText: 'Total revenue reached ₹1154 Cr with assets under management crossing ₹9,600 Cr.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_HOMEFIRST_01',
        issuerNseSymbol: 'HOMEFIRST',
        issuerBseCode: '543259',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual mortgage income past ₹1,000 Cr while maintaining gross NPAs under 2.0%.',
        targetMetric: 'revenue_cr',
        baselineValue: 795,
        expectedValue: 1000,
        expectedOutcome: 'Revenue >= ₹1,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_HOME_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1154,
        actualOutcomeDescription: 'Delivered ₹1,154 Cr revenue beating target by 15.4%.',
        evaluationEvidenceId: 'EV_HOME_REV_01',
        evaluationDate: '2024-05-09',
        evaluationBasis: 'Audited Financial Results BSE',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_HOMEFIRST_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_HOMEFIRST_01',
        issuerNseSymbol: 'HOMEFIRST',
        issuerBseCode: '543259',
        eventDate: '2024-04-25',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'AUM Crosses Milestone ₹10,000 Crore',
        description: 'Assets under management surpassed ₹10,000 Cr threshold with 35% YoY loan book compounding.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_HOME_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_HOME_NPA',
        symbol: 'HOMEFIRST',
        name: 'Affordable Housing GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA exceeding 2.5% triggers hard veto.',
        rationale: 'Underwriting discipline in informal borrower segment must remain tight.'
      }
    ],
    breakerContextMetrics: {
      'TB_HOME_NPA': 1.6
    },
    itasSignal: {
      symbol: 'HOMEFIRST',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 90,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'HOMEFIRST',
      coreThesisStatement: 'Fastest-growing affordable housing finance NBFC combining digital app-based underwriting with on-ground collateral verification.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Tech Underwriting Moat', description: 'Underwriting informal income borrowers with industry-low turnaround times.' },
        { pillarId: 'P2', title: 'Pristine Asset Quality', description: 'Credit costs consistently below 40 bps.' }
      ],
      thesisBreakersDefined: ['TB_HOME_NPA']
    }
  },

  // 26. BAJFINANCE
  {
    company: {
      symbol: 'BAJFINANCE',
      companyName: 'Bajaj Finance Limited',
      bseCode: '500034',
      isin: 'INE296A01024',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Consumer & SME Lending Non-Banking Finance',
      headquarters: 'Pune, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BAJFIN_AR24',
        documentName: 'Bajaj_Finance_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-16',
        documentHashSha256: '9abcdef0123456789abcdef0123456789abcdef0123456789',
        pageCount: 380,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BAJFIN_REV_01',
        issuerNseSymbol: 'BAJFINANCE',
        issuerBseCode: '500034',
        documentId: 'DOC_BAJFIN_AR24',
        documentHash: '9abcdef0123456789abcdef0123456789abcdef0123456789',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 75,
        pagePrinted: '73',
        quotedText: 'Total revenue reached ₹54969 Cr with customer franchise expanding to 83.6 million clients.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BAJFINANCE_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 54969,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BAJFIN_REV_01',
        sourceQuotedText: 'Total revenue reached ₹54969 Cr with customer franchise expanding to 83.6 million clients.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BAJFINANCE_01',
        issuerNseSymbol: 'BAJFINANCE',
        issuerBseCode: '500034',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual consolidated NBFC income to cross ₹50,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 41406,
        expectedValue: 50000,
        expectedOutcome: 'Revenue >= ₹50,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BAJFIN_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 54969,
        actualOutcomeDescription: 'Delivered ₹54,969 Cr revenue beating milestone by 9.9%.',
        evaluationEvidenceId: 'EV_BAJFIN_REV_01',
        evaluationDate: '2024-04-25',
        evaluationBasis: 'BSE Audited Financial Results Release',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BAJFINANCE_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BAJFINANCE_01',
        issuerNseSymbol: 'BAJFINANCE',
        issuerBseCode: '500034',
        eventDate: '2024-05-02',
        category: 'REGULATORY',
        headline: 'RBI Lifts Restrictions on eCOM and Insta EMI Card Products',
        description: 'Reserve Bank of India officially revoked restrictions on onboarding new customers under eCOM and digital Insta EMI Card.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'REGULATORY_ORDER',
        evidenceId: 'EV_BAJFIN_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BAJFIN_NPA',
        symbol: 'BAJFINANCE',
        name: 'Retail NBFC GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA exceeding 2.2% triggers hard veto.',
        rationale: 'Consumer credit cycles must not exceed systemic stress boundaries.'
      }
    ],
    breakerContextMetrics: {
      'TB_BAJFIN_NPA': 0.85
    },
    itasSignal: {
      symbol: 'BAJFINANCE',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 94,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BAJFINANCE',
      coreThesisStatement: 'Omnichannel retail lending powerhouse possessing unparalleled proprietary customer franchise and cross-sell data moat across urban India.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Customer Franchise', description: 'Over 83 million customers with 50+ million cross-sell qualified borrowers.' },
        { pillarId: 'P2', title: 'Unmatched ROA', description: 'Consistently generating 4.5%+ return on assets across retail credit cycles.' }
      ],
      thesisBreakersDefined: ['TB_BAJFIN_NPA']
    }
  },

  // 27. BLUEJET
  {
    company: {
      symbol: 'BLUEJET',
      companyName: 'Blue Jet Healthcare Limited',
      bseCode: '544009',
      isin: 'INE0BCP01023',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Contrast Media Pharma Intermediates & APIs',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BLUEJET_AR24',
        documentName: 'Blue_Jet_Healthcare_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-26',
        documentHashSha256: 'abcdef0123456789abcdef0123456789abcdef0123456789a',
        pageCount: 150,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BLUEJET_REV_01',
        issuerNseSymbol: 'BLUEJET',
        issuerBseCode: '544009',
        documentId: 'DOC_BLUEJET_AR24',
        documentHash: 'abcdef0123456789abcdef0123456789abcdef0123456789a',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 30,
        pagePrinted: '28',
        quotedText: 'Consolidated revenue for FY24 reached ₹743 Cr supported by global diagnostic imaging contrast media demand.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BLUEJET_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 743,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BLUEJET_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹743 Cr supported by global diagnostic imaging contrast media demand.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BLUEJET_01',
        issuerNseSymbol: 'BLUEJET',
        issuerBseCode: '544009',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale contrast media intermediate sales to cross ₹700 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 721,
        expectedValue: 700,
        expectedOutcome: 'Revenue >= ₹700 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BLUEJET_REV_01',
        claimDate: '2023-09-08',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 743,
        actualOutcomeDescription: 'Delivered ₹743 Cr revenue beating prospectus guidance by 6.1%.',
        evaluationEvidenceId: 'EV_BLUEJET_REV_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'Audited Financial Results Release',
        publicationDate: '2023-09-08',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BLUEJET_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BLUEJET_01',
        issuerNseSymbol: 'BLUEJET',
        issuerBseCode: '544009',
        eventDate: '2024-03-15',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Unit-II Mahad Green Chemical Manufacturing Expansion',
        description: 'Successfully operationalized new chemical synthesis blocks at Mahad facility for global innovator supply.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_BLUEJET_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BLUEJET_LEVERAGE',
        symbol: 'BLUEJET',
        name: 'Specialty Pharma Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'Blue Jet operates as a debt-free cash-generating company.'
      }
    ],
    breakerContextMetrics: {
      'TB_BLUEJET_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'BLUEJET',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BLUEJET',
      coreThesisStatement: 'Leading global supplier of contrast media intermediates used in CT scans and MRI imaging with long-term innovator supply contracts (GE Healthcare, Guerbet).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Global Oligopoly Moat', description: 'One of very few qualified global manufacturers of iodinated contrast media precursors.' },
        { pillarId: 'P2', title: 'High Operating Margins', description: 'Superior chemistry complexity yielding 30%+ EBITDA margins.' }
      ],
      thesisBreakersDefined: ['TB_BLUEJET_LEVERAGE']
    }
  },

  // 28. M&M
  {
    company: {
      symbol: 'M&M',
      companyName: 'Mahindra & Mahindra Limited',
      bseCode: '500520',
      isin: 'INE101A01026',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Utility Vehicles, Farm Equipment & Commercial Vehicles',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_MM_AR24',
        documentName: 'Mahindra_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: 'bcdef0123456789abcdef0123456789abcdef0123456789ab',
        pageCount: 360,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_MM_REV_01',
        issuerNseSymbol: 'M&M',
        issuerBseCode: '500520',
        documentId: 'DOC_MM_AR24',
        documentHash: 'bcdef0123456789abcdef0123456789abcdef0123456789ab',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 68,
        pagePrinted: '66',
        quotedText: 'Consolidated revenue for FY24 reached ₹139078 Cr with SUV volume market share crossing 20.4%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_MM_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 139078,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_MM_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹139078 Cr with SUV volume market share crossing 20.4%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_MM_01',
        issuerNseSymbol: 'M&M',
        issuerBseCode: '500520',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale automotive and farm equipment consolidated revenue past ₹130,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 121269,
        expectedValue: 130000,
        expectedOutcome: 'Revenue >= ₹130,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_MM_REV_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 139078,
        actualOutcomeDescription: 'Delivered ₹139,078 Cr revenue beating guidance by 7.0%.',
        evaluationEvidenceId: 'EV_MM_REV_01',
        evaluationDate: '2024-05-16',
        evaluationBasis: 'BSE Audited Financial Results Release',
        publicationDate: '2023-08-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_MM_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_MM_01',
        issuerNseSymbol: 'M&M',
        issuerBseCode: '500520',
        eventDate: '2024-04-29',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Launch of XUV 3XO SUV with Record Bookings',
        description: 'Unveiled compact SUV XUV 3XO clocking over 50,000 bookings within 60 minutes of opening.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_MM_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_MM_LEVERAGE',
        symbol: 'M&M',
        name: 'Auto Manufacturing Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Auto business Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'Automotive manufacturing must maintain net-cash position.'
      }
    ],
    breakerContextMetrics: {
      'TB_MM_LEVERAGE': 0.15
    },
    itasSignal: {
      symbol: 'M&M',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 93,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'M&M',
      coreThesisStatement: 'Dominant Indian SUV and tractor maker firing on all cylinders with blockbuster vehicle launches (Scorpio-N, Thar, XUV700) and capital allocation discipline.',
      investmentPillars: [
        { pillarId: 'P1', title: 'SUV Leadership', description: 'Number 1 in Indian SUV revenue market share exceeding 20%.' },
        { pillarId: 'P2', title: 'Tractor Monopolist', description: 'Over 40% domestic tractor market share generating high free cash flows.' }
      ],
      thesisBreakersDefined: ['TB_MM_LEVERAGE']
    }
  },

  // 29. BEL
  {
    company: {
      symbol: 'BEL',
      companyName: 'Bharat Electronics Limited',
      bseCode: '500049',
      isin: 'INE263A01024',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Strategic Defense Electronics & Radars',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BEL_AR24',
        documentName: 'Bharat_Electronics_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: 'cdef0123456789abcdef0123456789abcdef0123456789abc',
        pageCount: 280,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BEL_REV_01',
        issuerNseSymbol: 'BEL',
        issuerBseCode: '500049',
        documentId: 'DOC_BEL_AR24',
        documentHash: 'cdef0123456789abcdef0123456789abcdef0123456789abc',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 46,
        pagePrinted: '44',
        quotedText: 'Consolidated revenue for FY24 reached ₹20268 Cr driven by missile defense electronics and naval radars.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_BEL_ORDER_01',
        issuerNseSymbol: 'BEL',
        issuerBseCode: '500049',
        documentId: 'DOC_BEL_AR24',
        documentHash: 'cdef0123456789abcdef0123456789abcdef0123456789abc',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 55,
        pagePrinted: '53',
        quotedText: 'Total confirmed order book stood at ₹75934 Cr as of 31st March 2024.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BEL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 20268,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BEL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹20268 Cr driven by missile defense electronics and naval radars.'
      },
      {
        factId: 'FACT_BEL_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 75934,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BEL_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹75934 Cr as of 31st March 2024.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BEL_01',
        issuerNseSymbol: 'BEL',
        issuerBseCode: '500049',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual defense electronic deliveries past ₹19,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 17734,
        expectedValue: 19000,
        expectedOutcome: 'Revenue >= ₹19,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BEL_REV_01',
        claimDate: '2023-08-12',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 20268,
        actualOutcomeDescription: 'Delivered ₹20,268 Cr revenue exceeding guidance by 6.7%.',
        evaluationEvidenceId: 'EV_BEL_REV_01',
        evaluationDate: '2024-05-20',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-12',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BEL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BEL_01',
        issuerNseSymbol: 'BEL',
        issuerBseCode: '500049',
        eventDate: '2024-03-28',
        category: 'ORDER_BOOK',
        headline: 'Mega Air Defense Akash Missile Electronics Order Inflow',
        description: 'Secured major contract for supply of Akash Prime radar and electronic combat guidance systems worth ₹2,900 Cr.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_BEL_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BEL_LEVERAGE',
        symbol: 'BEL',
        name: 'Defense PSU Zero Debt Rule',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'BEL operates as a cash-rich defense navratna.'
      }
    ],
    breakerContextMetrics: {
      'TB_BEL_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'BEL',
      strategyAgreementCount: 20,
      totalStrategiesEvaluated: 20,
      signalStrength: 97,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BEL',
      coreThesisStatement: 'Indispensable electronic systems backbone of Indian armed forces (radars, sonar, electronic warfare, missile seekers) with ₹76,000 Cr order backlog.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Indigenization Monopoly', description: 'Over 85% market share in defense electronic warfare suites.' },
        { pillarId: 'P2', title: 'Non-Defense Diversification', description: 'Expanding into metro train control, smart meters, and EV chargers.' }
      ],
      thesisBreakersDefined: ['TB_BEL_LEVERAGE']
    }
  },

  // 30. APLAPOLLO
  {
    company: {
      symbol: 'APLAPOLLO',
      companyName: 'APL Apollo Tubes Limited',
      bseCode: '533758',
      isin: 'INE702C01027',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Structural Steel Tubes & Hollow Sections',
      headquarters: 'Delhi NCR, Delhi, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_APLAPOLLO_AR24',
        documentName: 'APL_Apollo_Tubes_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-24',
        documentHashSha256: 'def0123456789abcdef0123456789abcdef0123456789abcd',
        pageCount: 240,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_APL_REV_01',
        issuerNseSymbol: 'APLAPOLLO',
        issuerBseCode: '533758',
        documentId: 'DOC_APLAPOLLO_AR24',
        documentHash: 'def0123456789abcdef0123456789abcdef0123456789abcd',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 40,
        pagePrinted: '38',
        quotedText: 'Consolidated revenue for FY24 reached ₹18119 Cr with structural tube sales volumes up 15%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_APLAPOLLO_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 18119,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_APL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹18119 Cr with structural tube sales volumes up 15%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_APLAPOLLO_01',
        issuerNseSymbol: 'APLAPOLLO',
        issuerBseCode: '533758',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual structural steel tube sales to surpass ₹17,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 16199,
        expectedValue: 17000,
        expectedOutcome: 'Revenue >= ₹17,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_APL_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 18119,
        actualOutcomeDescription: 'Delivered ₹18,119 Cr revenue exceeding guidance by 6.6%.',
        evaluationEvidenceId: 'EV_APL_REV_01',
        evaluationDate: '2024-05-11',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_APLAPOLLO_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_APLAPOLLO_01',
        issuerNseSymbol: 'APLAPOLLO',
        issuerBseCode: '533758',
        eventDate: '2024-04-10',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Raipur Mega Plant Ramp-Up to Full Capacity',
        description: 'Fully ramped up new 1.2 million ton mega manufacturing unit in Raipur producing heavy structural hollow sections.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_APL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_APL_LEVERAGE',
        symbol: 'APLAPOLLO',
        name: 'Steel Tubes Working Capital Leverage Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'Steel raw material volatility requires strict cash flow discipline.'
      }
    ],
    breakerContextMetrics: {
      'TB_APL_LEVERAGE': 0.55
    },
    itasSignal: {
      symbol: 'APLAPOLLO',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 87,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'APLAPOLLO',
      coreThesisStatement: 'Structural steel tube market creator and leader holding 55% domestic share substituting conventional timber and RCC columns in airport/stadium construction.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Market Creation Moat', description: 'First-mover in rectangular and square hollow sections for prefabricated building.' },
        { pillarId: 'P2', title: 'Distribution Density', description: 'Over 800 distributors and 50,000 fabricator touchpoints across India.' }
      ],
      thesisBreakersDefined: ['TB_APL_LEVERAGE']
    }
  },

  // 31. CGPOWER
  {
    company: {
      symbol: 'CGPOWER',
      companyName: 'CG Power and Industrial Solutions Limited',
      bseCode: '500093',
      isin: 'INE067A01029',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Industrial Motors, Power Transformers & Rail Traction',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_CGPOWER_AR24',
        documentName: 'CG_Power_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-18',
        documentHashSha256: 'ef0123456789abcdef0123456789abcdef0123456789abcde',
        pageCount: 260,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_CGPOWER_REV_01',
        issuerNseSymbol: 'CGPOWER',
        issuerBseCode: '500093',
        documentId: 'DOC_CGPOWER_AR24',
        documentHash: 'ef0123456789abcdef0123456789abcdef0123456789abcde',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 42,
        pagePrinted: '40',
        quotedText: 'Consolidated revenue for FY24 reached ₹8046 Cr with industrial motors and rail systems operating at peak capacity.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_CGPOWER_ORDER_01',
        issuerNseSymbol: 'CGPOWER',
        issuerBseCode: '500093',
        documentId: 'DOC_CGPOWER_AR24',
        documentHash: 'ef0123456789abcdef0123456789abcdef0123456789abcde',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 52,
        pagePrinted: '50',
        quotedText: 'Total confirmed order book stood at ₹6276 Cr as of 31st March 2024.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_CGPOWER_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 8046,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_CGPOWER_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹8046 Cr with industrial motors and rail systems operating at peak capacity.'
      },
      {
        factId: 'FACT_CGPOWER_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 6276,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_CGPOWER_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹6276 Cr as of 31st March 2024.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_CGPOWER_01',
        issuerNseSymbol: 'CGPOWER',
        issuerBseCode: '500093',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual industrial engineering turnover to cross ₹7,500 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 6973,
        expectedValue: 7500,
        expectedOutcome: 'Revenue >= ₹7,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_CGPOWER_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 8046,
        actualOutcomeDescription: 'Delivered ₹8,046 Cr revenue beating guidance by 7.3%.',
        evaluationEvidenceId: 'EV_CGPOWER_REV_01',
        evaluationDate: '2024-05-08',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_CGPOWER_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_CGPOWER_01',
        issuerNseSymbol: 'CGPOWER',
        issuerBseCode: '500093',
        eventDate: '2024-02-29',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Government Approval for ₹7,600 Cr Semiconductor OSAT JV',
        description: 'Union Cabinet approved semiconductor outsourced assembly and testing (OSAT) plant in Sanand with Renesas Electronics.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_CGPOWER_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_CGPOWER_LEVERAGE',
        symbol: 'CGPOWER',
        name: 'Murugappa Engineering Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.5x triggers hard veto.',
        rationale: 'Post-turnaround balance sheet must maintain net-cash posture.'
      }
    ],
    breakerContextMetrics: {
      'TB_CGPOWER_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'CGPOWER',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'CGPOWER',
      coreThesisStatement: 'Phenomenal Murugappa Group turnaround transforming electrical engineering champion into India\'s leading commercial semiconductor packaging player.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Motors & Transformers Moat', description: 'Number 1 market share in industrial motors and high-voltage power transformers.' },
        { pillarId: 'P2', title: 'Semiconductor Optionality', description: 'Sanand OSAT JV partnered with Renesas positioning company at the center of India Semiconductor Mission.' }
      ],
      thesisBreakersDefined: ['TB_CGPOWER_LEVERAGE']
    }
  },

  // 32. GOKEX
  {
    company: {
      symbol: 'GOKEX',
      companyName: 'Gokaldas Exports Limited',
      bseCode: '532630',
      isin: 'INE887G01027',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Woven & Knitted Garment Design & Apparel Exports',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_GOKEX_AR24',
        documentName: 'Gokaldas_Exports_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-25',
        documentHashSha256: 'f0123456789abcdef0123456789abcdef0123456789abcdef',
        pageCount: 180,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_GOKEX_REV_01',
        issuerNseSymbol: 'GOKEX',
        issuerBseCode: '532630',
        documentId: 'DOC_GOKEX_AR24',
        documentHash: 'f0123456789abcdef0123456789abcdef0123456789abcdef',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 36,
        pagePrinted: '34',
        quotedText: 'Consolidated revenue for FY24 reached ₹2401 Cr supported by Atraco Group international integration.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_GOKEX_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 2401,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_GOKEX_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹2401 Cr supported by Atraco Group international integration.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_GOKEX_01',
        issuerNseSymbol: 'GOKEX',
        issuerBseCode: '532630',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual apparel export revenues to cross ₹2,200 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 2247,
        expectedValue: 2200,
        expectedOutcome: 'Revenue >= ₹2,200 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_GOKEX_REV_01',
        claimDate: '2023-08-20',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 2401,
        actualOutcomeDescription: 'Delivered ₹2,401 Cr revenue beating guidance by 9.1%.',
        evaluationEvidenceId: 'EV_GOKEX_REV_01',
        evaluationDate: '2024-05-22',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-20',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_GOKEX_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_GOKEX_01',
        issuerNseSymbol: 'GOKEX',
        issuerBseCode: '532630',
        eventDate: '2024-03-05',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Closing of Atraco Group Dubai Acquisition',
        description: 'Completed acquisition of Dubai-based apparel producer Atraco expanding duty-free manufacturing presence in Kenya.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_GOKEX_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_GOKEX_LEVERAGE',
        symbol: 'GOKEX',
        name: 'Apparel Export Leverage Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.2x triggers hard veto.',
        rationale: 'Acquisition debt must be swiftly deleveraged via operating cash flows.'
      }
    ],
    breakerContextMetrics: {
      'TB_GOKEX_LEVERAGE': 1.1
    },
    itasSignal: {
      symbol: 'GOKEX',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 83,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'GOKEX',
      coreThesisStatement: 'Prime beneficiary of global textile "China+1" diversification with low-cost duty-free manufacturing hubs in Africa and India.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Duty-Free Trade Advantage', description: 'Atraco Kenya manufacturing delivering duty-free export access to US market.' },
        { pillarId: 'P2', title: 'Global Brand Vendor', description: 'Long-standing relationship with top global apparel brands (Gap, Banana Republic, Tommy Hilfiger).' }
      ],
      thesisBreakersDefined: ['TB_GOKEX_LEVERAGE']
    }
  },

  // 33. SBIFUN
  {
    company: {
      symbol: 'SBIFUN',
      companyName: 'SBI Funds Management Limited (SBI Mutual Fund)',
      bseCode: '500112',
      isin: 'INE006B01013',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Investment Management & Mutual Funds',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_SBIFUN_AR24',
        documentName: 'SBI_Funds_Management_Statutory_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: '0123456789abcdef0123456789abcdef0123456789abcdef1',
        pageCount: 190,
        filingAuthority: 'AMFI / MCA'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_SBIFUN_REV_01',
        issuerNseSymbol: 'SBIFUN',
        issuerBseCode: '500112',
        documentId: 'DOC_SBIFUN_AR24',
        documentHash: '0123456789abcdef0123456789abcdef0123456789abcdef1',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 38,
        pagePrinted: '36',
        quotedText: 'Consolidated revenue for FY24 reached ₹2850 Cr with average assets under management crossing ₹9.1 lakh crore.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_SBIFUN_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 2850,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_SBIFUN_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹2850 Cr with average assets under management crossing ₹9.1 lakh crore.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_SBIFUN_01',
        issuerNseSymbol: 'SBIFUN',
        issuerBseCode: '500112',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale mutual fund management fees past ₹2,500 Cr in FY24 supported by SIP inflows.',
        targetMetric: 'revenue_cr',
        baselineValue: 2280,
        expectedValue: 2500,
        expectedOutcome: 'Revenue >= ₹2,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_SBIFUN_REV_01',
        claimDate: '2023-08-15',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 2850,
        actualOutcomeDescription: 'Delivered ₹2,850 Cr revenue exceeding expectation by 14.0%.',
        evaluationEvidenceId: 'EV_SBIFUN_REV_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'Statutory Financial Accounts Review',
        publicationDate: '2023-08-15',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_SBIFUN_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_SBIFUN_01',
        issuerNseSymbol: 'SBIFUN',
        issuerBseCode: '500112',
        eventDate: '2024-04-10',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'AUM Crosses Milestone ₹10 Lakh Crore',
        description: 'Became the first asset management company in India to cross ₹10,00,000 Cr in average assets under management.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_SBIFUN_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_SBIFUN_LEVERAGE',
        symbol: 'SBIFUN',
        name: 'Asset Management Debt Incurrence Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'Mutual fund management operating models carry zero debt.'
      }
    ],
    breakerContextMetrics: {
      'TB_SBIFUN_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'SBIFUN',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'SBIFUN',
      coreThesisStatement: 'India\'s largest asset manager leveraging State Bank of India\'s 22,000+ branch distribution network to capture domestic SIP inflows.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Market Share Dominance', description: 'Over 16% total mutual fund industry market share.' },
        { pillarId: 'P2', title: 'High Dividend Payout', description: 'Capital-light operating model converting over 85% of net profit into free cash flow.' }
      ],
      thesisBreakersDefined: ['TB_SBIFUN_LEVERAGE']
    }
  },

  // 34. EPL
  {
    company: {
      symbol: 'EPL',
      companyName: 'EPL Limited (formerly Essel Propack)',
      bseCode: '500135',
      isin: 'INE255A01020',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Laminated Plastic Tubes & Sustainable Packaging Solutions',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_EPL_AR24',
        documentName: 'EPL_Limited_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-24',
        documentHashSha256: '123456789abcdef0123456789abcdef0123456789abcdef2',
        pageCount: 190,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_EPL_REV_01',
        issuerNseSymbol: 'EPL',
        issuerBseCode: '500135',
        documentId: 'DOC_EPL_AR24',
        documentHash: '123456789abcdef0123456789abcdef0123456789abcdef2',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 38,
        pagePrinted: '36',
        quotedText: 'Consolidated revenue for FY24 reached ₹3998 Cr with oral care and beauty tube volumes growing by 8%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_EPL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 3998,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_EPL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹3998 Cr with oral care and beauty tube volumes growing by 8%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_EPL_01',
        issuerNseSymbol: 'EPL',
        issuerBseCode: '500135',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual packaging turnover to surpass ₹3,800 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 3694,
        expectedValue: 3800,
        expectedOutcome: 'Revenue >= ₹3,800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_EPL_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 3998,
        actualOutcomeDescription: 'Delivered ₹3,998 Cr revenue beating guidance by 5.2%.',
        evaluationEvidenceId: 'EV_EPL_REV_01',
        evaluationDate: '2024-05-15',
        evaluationBasis: 'BSE Audited Financial Results Release',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_EPL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_EPL_01',
        issuerNseSymbol: 'EPL',
        issuerBseCode: '500135',
        eventDate: '2024-04-12',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Commercial Scale-Up of 100% Recyclable Platina Tubes',
        description: 'Successfully converted over 50% of oral care global product portfolio to fully recyclable Platina mono-material tubes.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_EPL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_EPL_LEVERAGE',
        symbol: 'EPL',
        name: 'Packaging Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.2x triggers hard veto.',
        rationale: 'Blackstone-sponsored financial leverage must remain disciplined.'
      }
    ],
    breakerContextMetrics: {
      'TB_EPL_LEVERAGE': 0.95
    },
    itasSignal: {
      symbol: 'EPL',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 82,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'EPL',
      coreThesisStatement: 'World\'s largest manufacturer of laminated tubes supplying 1 out of every 3 oral care tubes globally (Colgate, P&G, Unilever).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Global Oligopoly', description: 'Over 33% global oral care tube market share.' },
        { pillarId: 'P2', title: 'Sustainability Switch', description: 'Patented Platina recyclable technology locking in global FMCG brand contracts.' }
      ],
      thesisBreakersDefined: ['TB_EPL_LEVERAGE']
    }
  },

  // 35. DIXON
  {
    company: {
      symbol: 'DIXON',
      companyName: 'Dixon Technologies (India) Limited',
      bseCode: '540699',
      isin: 'INE935N01020',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Electronics Manufacturing Services (EMS)',
      headquarters: 'Noida, Uttar Pradesh, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_DIXON_AR24',
        documentName: 'Dixon_Technologies_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: '23456789abcdef0123456789abcdef0123456789abcdef3',
        pageCount: 260,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_DIXON_REV_01',
        issuerNseSymbol: 'DIXON',
        issuerBseCode: '540699',
        documentId: 'DOC_DIXON_AR24',
        documentHash: '23456789abcdef0123456789abcdef0123456789abcdef3',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 46,
        pagePrinted: '44',
        quotedText: 'Consolidated revenue for FY24 reached ₹17691 Cr with smartphone manufacturing volumes doubling.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_DIXON_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 17691,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_DIXON_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹17691 Cr with smartphone manufacturing volumes doubling.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_DIXON_01',
        issuerNseSymbol: 'DIXON',
        issuerBseCode: '540699',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated electronic manufacturing turnover to cross ₹16,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 12192,
        expectedValue: 16000,
        expectedOutcome: 'Revenue >= ₹16,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_DIXON_REV_01',
        claimDate: '2023-08-11',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 17691,
        actualOutcomeDescription: 'Delivered ₹17,691 Cr revenue exceeding guidance by 10.6%.',
        evaluationEvidenceId: 'EV_DIXON_REV_01',
        evaluationDate: '2024-05-15',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-11',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_DIXON_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_DIXON_01',
        issuerNseSymbol: 'DIXON',
        issuerBseCode: '540699',
        eventDate: '2024-04-18',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Acquisition of Majority Stake in Ismartu India',
        description: 'Acquired 50.1% stake in Ismartu India expanding smartphone manufacturing capacity for Transsion brands.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_DIXON_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_DIXON_LEVERAGE',
        symbol: 'DIXON',
        name: 'EMS Working Capital Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 1.8,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 1.8x triggers hard veto.',
        rationale: 'Contract manufacturing margins require tight working capital cycles.'
      }
    ],
    breakerContextMetrics: {
      'TB_DIXON_LEVERAGE': 0.2
    },
    itasSignal: {
      symbol: 'DIXON',
      strategyAgreementCount: 20,
      totalStrategiesEvaluated: 20,
      signalStrength: 98,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'DIXON',
      coreThesisStatement: 'Undisputed champion of India\'s Electronics Manufacturing Services (EMS) revolution capturing mobile phones, IT hardware, telecom, and consumer electronics.',
      investmentPillars: [
        { pillarId: 'P1', title: 'PLI Beneficiary', description: 'Selected across multiple government Production Linked Incentive schemes.' },
        { pillarId: 'P2', title: 'Component Backward Integration', description: 'Expanding into high-margin camera modules, display assemblies, and precision sheet metal.' }
      ],
      thesisBreakersDefined: ['TB_DIXON_LEVERAGE']
    }
  },

  // 36. OLECTRA
  {
    company: {
      symbol: 'OLECTRA',
      companyName: 'Olectra Greentech Limited',
      bseCode: '532439',
      isin: 'INE260D01016',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Zero-Emission Pure Electric Buses & EV Powertrains',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_OLECTRA_AR24',
        documentName: 'Olectra_Greentech_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-26',
        documentHashSha256: '3456789abcdef0123456789abcdef0123456789abcdef4',
        pageCount: 170,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_OLECTRA_REV_01',
        issuerNseSymbol: 'OLECTRA',
        issuerBseCode: '532439',
        documentId: 'DOC_OLECTRA_AR24',
        documentHash: '3456789abcdef0123456789abcdef0123456789abcdef4',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 35,
        pagePrinted: '33',
        quotedText: 'Consolidated revenue for FY24 reached ₹1154 Cr with electric bus deliveries up by 46%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_OLECTRA_ORDER_01',
        issuerNseSymbol: 'OLECTRA',
        issuerBseCode: '532439',
        documentId: 'DOC_OLECTRA_AR24',
        documentHash: '3456789abcdef0123456789abcdef0123456789abcdef4',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 46,
        pagePrinted: '44',
        quotedText: 'Total confirmed order book stood at ₹10500 Cr as of 31st March 2024 comprising over 8,000 electric buses.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_OLECTRA_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 1154,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_OLECTRA_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹1154 Cr with electric bus deliveries up by 46%.'
      },
      {
        factId: 'FACT_OLECTRA_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 10500,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_OLECTRA_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹10500 Cr as of 31st March 2024 comprising over 8,000 electric buses.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_OLECTRA_01',
        issuerNseSymbol: 'OLECTRA',
        issuerBseCode: '532439',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale electric bus deliveries to surpass ₹1,000 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 1091,
        expectedValue: 1000,
        expectedOutcome: 'Revenue >= ₹1,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_OLECTRA_REV_01',
        claimDate: '2023-08-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1154,
        actualOutcomeDescription: 'Delivered ₹1,154 Cr revenue beating guidance by 15.4%.',
        evaluationEvidenceId: 'EV_OLECTRA_REV_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-18',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_OLECTRA_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_OLECTRA_01',
        issuerNseSymbol: 'OLECTRA',
        issuerBseCode: '532439',
        eventDate: '2024-03-25',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Greenfield Seetharampur EV Bus Plant Operationalization',
        description: 'Commenced commercial production at new 5,000 electric bus per annum capacity greenfield facility near Hyderabad.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_OLECTRA_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_OLECTRA_LEVERAGE',
        symbol: 'OLECTRA',
        name: 'EV Bus Capex Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.2x triggers hard veto.',
        rationale: 'Manufacturing ramp-up must maintain sound debt servicing ratios.'
      }
    ],
    breakerContextMetrics: {
      'TB_OLECTRA_LEVERAGE': 0.8
    },
    itasSignal: {
      symbol: 'OLECTRA',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 86,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'OLECTRA',
      coreThesisStatement: 'Pioneer and leader in electric bus manufacturing in India with technical collaboration from BYD and over 8,000 buses in confirmed backlog.',
      investmentPillars: [
        { pillarId: 'P1', title: 'State Transport Undertaking Backlog', description: 'Massive order inflows from MSRTC and BEST Mumbai electrifying municipal transit.' },
        { pillarId: 'P2', title: 'Seetharampur Capacity', description: 'New 5,000 bus facility solving production bottleneck.' }
      ],
      thesisBreakersDefined: ['TB_OLECTRA_LEVERAGE']
    }
  }
];
