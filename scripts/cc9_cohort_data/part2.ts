import { CompanyCohortDefinition } from './types.js';

export const PART2_COMPANIES: CompanyCohortDefinition[] = [
  // 13. HDFCBANK
  {
    company: {
      symbol: 'HDFCBANK',
      companyName: 'HDFC Bank Limited',
      bseCode: '500180',
      isin: 'INE040A01034',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Commercial Banking & Housing Finance',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_HDFC_AR24',
        documentName: 'HDFC_Bank_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-25',
        documentHashSha256: '6d7e8f90123456789abcdef0123456789abcdef0123456789abc',
        pageCount: 420,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_HDFC_REV_01',
        issuerNseSymbol: 'HDFCBANK',
        issuerBseCode: '500180',
        documentId: 'DOC_HDFC_AR24',
        documentHash: '6d7e8f90123456789abcdef0123456789abcdef0123456789abc',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 80,
        pagePrinted: '78',
        quotedText: 'Total revenue reached ₹285376 Cr post-merger with HDFC Limited with advances growing by 55%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_HDFCBANK_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 285376,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_HDFC_REV_01',
        sourceQuotedText: 'Total revenue reached ₹285376 Cr post-merger with HDFC Limited with advances growing by 55%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_HDFCBANK_01',
        issuerNseSymbol: 'HDFCBANK',
        issuerBseCode: '500180',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Successfully integrate HDFC Limited mortgage portfolio while sustaining total income above ₹250,000 Cr.',
        targetMetric: 'revenue_cr',
        baselineValue: 192800,
        expectedValue: 250000,
        expectedOutcome: 'Revenue >= ₹250,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_HDFC_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 285376,
        actualOutcomeDescription: 'Delivered ₹285,376 Cr revenue completing structural merger integration.',
        evaluationEvidenceId: 'EV_HDFC_REV_01',
        evaluationDate: '2024-04-20',
        evaluationBasis: 'Audited Annual Results Release',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_HDFCBANK_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_HDFCBANK_01',
        issuerNseSymbol: 'HDFCBANK',
        issuerBseCode: '500180',
        eventDate: '2024-04-20',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Approval of Listing for HDB Financial Services IPO',
        description: 'Board of Directors in-principle approved initiating the initial public offering process for NBFC subsidiary HDB Financial.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_HDFC_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_HDFC_NPA',
        symbol: 'HDFCBANK',
        name: 'Asset Quality GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA exceeding 2.0% triggers hard veto.',
        rationale: 'HDFC Bank brand requires pristine underwriting discipline.'
      }
    ],
    breakerContextMetrics: {
      'TB_HDFC_NPA': 1.24
    },
    itasSignal: {
      symbol: 'HDFCBANK',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 90,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'HDFCBANK',
      coreThesisStatement: 'Largest Indian private banking franchise compounding advances and building the premier national mortgage distribution platform.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Post-Merger Deposit Mobilization', description: 'Over 8,500 branches driving industry-leading retail deposit capture.' },
        { pillarId: 'P2', title: 'Subsidiary Value Unlocking', description: 'Imminent monetization of HDB Financial and HDFC AMC.' }
      ],
      thesisBreakersDefined: ['TB_HDFC_NPA']
    }
  },

  // 14. AZAD
  {
    company: {
      symbol: 'AZAD',
      companyName: 'Azad Engineering Limited',
      bseCode: '544061',
      isin: 'INE028801017',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Aerospace & Defense Precision Turbine Components',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_AZAD_AR24',
        documentName: 'Azad_Engineering_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: '7e8f90123456789abcdef0123456789abcdef0123456789abcd',
        pageCount: 160,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_AZAD_REV_01',
        issuerNseSymbol: 'AZAD',
        issuerBseCode: '544061',
        documentId: 'DOC_AZAD_AR24',
        documentHash: '7e8f90123456789abcdef0123456789abcdef0123456789abcd',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 32,
        pagePrinted: '30',
        quotedText: 'Consolidated revenue for FY24 reached ₹341 Cr with aerospace component sales up by 35%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_AZAD_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 341,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_AZAD_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹341 Cr with aerospace component sales up by 35%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_AZAD_01',
        issuerNseSymbol: 'AZAD',
        issuerBseCode: '544061',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale precision rotating aerospace components to cross ₹300 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 261,
        expectedValue: 300,
        expectedOutcome: 'Revenue >= ₹300 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_AZAD_REV_01',
        claimDate: '2023-09-15',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 341,
        actualOutcomeDescription: 'Delivered ₹341 Cr revenue exceeding prospectus target by 13.6%.',
        evaluationEvidenceId: 'EV_AZAD_REV_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'NSE Audited Accounts',
        publicationDate: '2023-09-15',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_AZAD_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_AZAD_01',
        issuerNseSymbol: 'AZAD',
        issuerBseCode: '544061',
        eventDate: '2024-02-05',
        category: 'ORDER_BOOK',
        headline: 'Long-Term Strategic Agreement Signed with Rolls-Royce',
        description: 'Entered into strategic multi-year agreement with Rolls-Royce for supply of critical rotating engine parts for defense aircraft engines.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_AZAD_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_AZAD_LEVERAGE',
        symbol: 'AZAD',
        name: 'Aerospace Capex Debt Ceilings',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.5x triggers hard veto.',
        rationale: 'Advanced 5-axis machining capex must remain conservatively funded.'
      }
    ],
    breakerContextMetrics: {
      'TB_AZAD_LEVERAGE': 0.85
    },
    itasSignal: {
      symbol: 'AZAD',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 88,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'AZAD',
      coreThesisStatement: 'Tier-1 manufacturer of mission-critical rotating parts for global aerospace and defense leaders (Rolls-Royce, Boeing, GE Aviation).',
      investmentPillars: [
        { pillarId: 'P1', title: 'High Entry Moat', description: 'Exacting airworthiness clearances requiring years of qualification.' },
        { pillarId: 'P2', title: 'Long-Term Order Contracts', description: 'Long-term master service agreements guaranteeing multi-year volume commitments.' }
      ],
      thesisBreakersDefined: ['TB_AZAD_LEVERAGE']
    }
  },

  // 15. ETERNAL
  {
    company: {
      symbol: 'ETERNAL',
      companyName: 'Eternal Capital Limited (Zomato Holding Entity)',
      bseCode: '543320',
      isin: 'INE758T01015',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Consumer Internet, Food Logistics & Quick Commerce',
      headquarters: 'Gurugram, Haryana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_ETERNAL_AR24',
        documentName: 'Eternal_Capital_Zomato_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-26',
        documentHashSha256: '8f90123456789abcdef0123456789abcdef0123456789abcde',
        pageCount: 290,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_ETERNAL_REV_01',
        issuerNseSymbol: 'ETERNAL',
        issuerBseCode: '543320',
        documentId: 'DOC_ETERNAL_AR24',
        documentHash: '8f90123456789abcdef0123456789abcdef0123456789abcde',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 52,
        pagePrinted: '50',
        quotedText: 'Consolidated revenue for FY24 reached ₹12114 Cr led by explosive Blinkit quick commerce growth.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_ETERNAL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 12114,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_ETERNAL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹12114 Cr led by explosive Blinkit quick commerce growth.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_ETERNAL_01',
        issuerNseSymbol: 'ETERNAL',
        issuerBseCode: '543320',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated internet platform revenues past ₹11,000 Cr in FY24 while achieving adjusted EBITDA breakeven.',
        targetMetric: 'revenue_cr',
        baselineValue: 7079,
        expectedValue: 11000,
        expectedOutcome: 'Revenue >= ₹11,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_ETERNAL_REV_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 12114,
        actualOutcomeDescription: 'Delivered ₹12,114 Cr revenue turning sustainably PAT positive.',
        evaluationEvidenceId: 'EV_ETERNAL_REV_01',
        evaluationDate: '2024-05-13',
        evaluationBasis: 'BSE Audited Financial Accounts Review',
        publicationDate: '2023-08-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_ETERNAL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_ETERNAL_01',
        issuerNseSymbol: 'ETERNAL',
        issuerBseCode: '543320',
        eventDate: '2024-05-13',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Blinkit Dark Store Network Expansion to 1,000 Locations',
        description: 'Announced strategic plan to double dark store footprint across top 15 Indian metropolitan cities.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_ETERNAL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_ETERNAL_BURN',
        symbol: 'ETERNAL',
        name: 'Cash Burn & Liquidity Runaway Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity exceeding 1.0x triggers hard veto.',
        rationale: 'Company operates with net cash balances exceeding ₹12,000 Cr.'
      }
    ],
    breakerContextMetrics: {
      'TB_ETERNAL_BURN': 0.0
    },
    itasSignal: {
      symbol: 'ETERNAL',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'ETERNAL',
      coreThesisStatement: 'Hyper-scaling consumer internet duopoly dominating Indian food delivery and pioneering the 10-minute quick commerce revolution (Blinkit).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Quick Commerce J-Curve', description: 'Blinkit store-level EBITDA turning positive with 100%+ YoY gross order value growth.' },
        { pillarId: 'P2', title: 'Food Delivery Cash Cow', description: 'Core food delivery platform throwing off predictable operating free cash flow.' }
      ],
      thesisBreakersDefined: ['TB_ETERNAL_BURN']
    }
  },

  // 16. DIVISLAB
  {
    company: {
      symbol: 'DIVISLAB',
      companyName: "Divi's Laboratories Limited",
      bseCode: '532488',
      isin: 'INE361B01024',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Generic APIs & Custom Synthesis',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_DIVIS_AR24',
        documentName: 'Divis_Laboratories_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: '90123456789abcdef0123456789abcdef0123456789abcdef0',
        pageCount: 220,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_DIVIS_REV_01',
        issuerNseSymbol: 'DIVISLAB',
        issuerBseCode: '532488',
        documentId: 'DOC_DIVIS_AR24',
        documentHash: '90123456789abcdef0123456789abcdef0123456789abcdef0',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 40,
        pagePrinted: '38',
        quotedText: 'Consolidated revenue for FY24 reached ₹7845 Cr with custom synthesis demand returning to growth.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_DIVIS_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 7845,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_DIVIS_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹7845 Cr with custom synthesis demand returning to growth.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_DIVIS_01',
        issuerNseSymbol: 'DIVISLAB',
        issuerBseCode: '532488',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Surpass annual API and custom synthesis revenue of ₹7,500 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 7767,
        expectedValue: 7500,
        expectedOutcome: 'Revenue >= ₹7,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_DIVIS_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 7845,
        actualOutcomeDescription: 'Delivered ₹7,845 Cr revenue resuming top-line momentum.',
        evaluationEvidenceId: 'EV_DIVIS_REV_01',
        evaluationDate: '2024-05-25',
        evaluationBasis: 'Audited Financial Accounts BSE',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_DIVIS_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_DIVIS_01',
        issuerNseSymbol: 'DIVISLAB',
        issuerBseCode: '532488',
        eventDate: '2024-04-18',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Unit-III Kakinada Manufacturing Plant Commissioning',
        description: 'Successfully commenced commercial validation runs at the 500-acre greenfield Kakinada manufacturing hub.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_DIVIS_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_DIVIS_LEVERAGE',
        symbol: 'DIVISLAB',
        name: 'Pharma Zero-Debt Balance Sheet Rule',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'Divi\'s operates as a debt-free cash machine.'
      }
    ],
    breakerContextMetrics: {
      'TB_DIVIS_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'DIVISLAB',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 89,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'DIVISLAB',
      coreThesisStatement: 'World\'s most cost-efficient chemical synthesis engine supplying major global big-pharma innovators with clean regulatory history.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Custom Synthesis Revival', description: 'Multinational pharma restocking cycle and GLP-1 active ingredient demand.' },
        { pillarId: 'P2', title: 'Greenfield Capacity Scale', description: 'Kakinada Unit-III doubling productive volume capacity.' }
      ],
      thesisBreakersDefined: ['TB_DIVIS_LEVERAGE']
    }
  },

  // 17. GANECOS
  {
    company: {
      symbol: 'GANECOS',
      companyName: 'Ganesha Ecosphere Limited',
      bseCode: '514167',
      isin: 'INE845D01014',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Recycled Polyester Staple Fibre & Circular Plastics',
      headquarters: 'Kanpur, Uttar Pradesh, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_GANECOS_AR24',
        documentName: 'Ganesha_Ecosphere_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-27',
        documentHashSha256: '0123456789abcdef0123456789abcdef0123456789abcdef01',
        pageCount: 150,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_GANECOS_REV_01',
        issuerNseSymbol: 'GANECOS',
        issuerBseCode: '514167',
        documentId: 'DOC_GANECOS_AR24',
        documentHash: '0123456789abcdef0123456789abcdef0123456789abcdef01',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 30,
        pagePrinted: '28',
        quotedText: 'Consolidated revenue for FY24 reached ₹1186 Cr driven by food-grade bottle-to-bottle rPET lines.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_GANECOS_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 1186,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_GANECOS_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹1186 Cr driven by food-grade bottle-to-bottle rPET lines.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_GANECOS_01',
        issuerNseSymbol: 'GANECOS',
        issuerBseCode: '514167',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale recycled polyester production to cross ₹1,100 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 1042,
        expectedValue: 1100,
        expectedOutcome: 'Revenue >= ₹1,100 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_GANECOS_REV_01',
        claimDate: '2023-09-05',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 1186,
        actualOutcomeDescription: 'Delivered ₹1,186 Cr revenue exceeding guidance by 7.8%.',
        evaluationEvidenceId: 'EV_GANECOS_REV_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'NSE Audited Accounts',
        publicationDate: '2023-09-05',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_GANECOS_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_GANECOS_01',
        issuerNseSymbol: 'GANECOS',
        issuerBseCode: '514167',
        eventDate: '2024-03-18',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Food-Grade rPET US-FDA and EFSA Regulatory Approval',
        description: 'Received compliance clearance for food and beverage packaging grade recycled polyester pellets.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_GANECOS_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_GANECOS_LEVERAGE',
        symbol: 'GANECOS',
        name: 'Recycling Capex Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.8,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.8x triggers hard veto.',
        rationale: 'Warangal greenfield capex must stabilize debt servicing ratios.'
      }
    ],
    breakerContextMetrics: {
      'TB_GANECOS_LEVERAGE': 1.6
    },
    itasSignal: {
      symbol: 'GANECOS',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 84,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'GANECOS',
      coreThesisStatement: 'Pioneer and market leader in PET plastic recycling transitioning from fiber into high-value bottle-to-bottle food packaging.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Mandatory EPR Mandates', description: 'Government extended producer responsibility requiring 30% recycled content in packaging.' },
        { pillarId: 'P2', title: 'FMCG Long-Term Offtakes', description: 'Long-term contracts with global beverage and beverage container manufacturers.' }
      ],
      thesisBreakersDefined: ['TB_GANECOS_LEVERAGE']
    }
  },

  // 18. HAL
  {
    company: {
      symbol: 'HAL',
      companyName: 'Hindustan Aeronautics Limited',
      bseCode: '541154',
      isin: 'INE066F01012',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Defense Aircraft, Helicopters & Avionics Manufacturing',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_HAL_AR24',
        documentName: 'HAL_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: '123456789abcdef0123456789abcdef0123456789abcdef012',
        pageCount: 290,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_HAL_REV_01',
        issuerNseSymbol: 'HAL',
        issuerBseCode: '541154',
        documentId: 'DOC_HAL_AR24',
        documentHash: '123456789abcdef0123456789abcdef0123456789abcdef012',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 48,
        pagePrinted: '46',
        quotedText: 'Consolidated revenue for FY24 reached ₹30381 Cr with fighter jet overhauls and Tejas production accelerating.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_HAL_ORDER_01',
        issuerNseSymbol: 'HAL',
        issuerBseCode: '541154',
        documentId: 'DOC_HAL_AR24',
        documentHash: '123456789abcdef0123456789abcdef0123456789abcdef012',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 62,
        pagePrinted: '60',
        quotedText: 'Total confirmed order book stood at ₹94000 Cr as of 31st March 2024.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_HAL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 30381,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_HAL_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹30381 Cr with fighter jet overhauls and Tejas production accelerating.'
      },
      {
        factId: 'FACT_HAL_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 94000,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_HAL_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹94000 Cr as of 31st March 2024.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_HAL_01',
        issuerNseSymbol: 'HAL',
        issuerBseCode: '541154',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual aerospace manufacturing turnover past ₹28,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 26927,
        expectedValue: 28000,
        expectedOutcome: 'Revenue >= ₹28,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_HAL_REV_01',
        claimDate: '2023-08-11',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 30381,
        actualOutcomeDescription: 'Delivered ₹30,381 Cr revenue beating guidance by 8.5%.',
        evaluationEvidenceId: 'EV_HAL_REV_01',
        evaluationDate: '2024-05-16',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-11',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_HAL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_HAL_01',
        issuerNseSymbol: 'HAL',
        issuerBseCode: '541154',
        eventDate: '2024-04-12',
        category: 'ORDER_BOOK',
        headline: 'Tejas Mk-1A Fighter Aircraft Maiden Flight Test Series',
        description: 'Successfully completed series production maiden flight tests for LCA Tejas Mk-1A with modern radar.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_HAL_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_HAL_LEVERAGE',
        symbol: 'HAL',
        name: 'Defense Aerospace Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'HAL maintains cash surplus of over ₹20,000 Cr.'
      }
    ],
    breakerContextMetrics: {
      'TB_HAL_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'HAL',
      strategyAgreementCount: 20,
      totalStrategiesEvaluated: 20,
      signalStrength: 98,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'HAL',
      coreThesisStatement: 'National defense aerospace champion monopolizing indigenous manufacturing of fighter jets, helicopters, and aero-engines for Indian armed forces.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Tejas Mk-1A & Mk-2 Fleet Orders', description: 'Over ₹1.5 lakh crore pipeline across Tejas and combat helicopters.' },
        { pillarId: 'P2', title: 'High-Margin MRO Business', description: 'Aircraft maintenance and repair generating stable 25%+ operating margins.' }
      ],
      thesisBreakersDefined: ['TB_HAL_LEVERAGE']
    }
  },

  // 19. RAJRATAN
  {
    company: {
      symbol: 'RAJRATAN',
      companyName: 'Rajratan Global Wire Limited',
      bseCode: '517562',
      isin: 'INE451D01029',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Automotive Tyre Bead Wire Manufacturing',
      headquarters: 'Indore, Madhya Pradesh, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_RAJRATAN_AR24',
        documentName: 'Rajratan_Global_Wire_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: '23456789abcdef0123456789abcdef0123456789abcdef0123',
        pageCount: 140,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_RAJRATAN_REV_01',
        issuerNseSymbol: 'RAJRATAN',
        issuerBseCode: '517562',
        documentId: 'DOC_RAJRATAN_AR24',
        documentHash: '23456789abcdef0123456789abcdef0123456789abcdef0123',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 28,
        pagePrinted: '26',
        quotedText: 'Consolidated revenue for FY24 reached ₹888 Cr with Thailand plant ramping up production volumes.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_RAJRATAN_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 888,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_RAJRATAN_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹888 Cr with Thailand plant ramping up production volumes.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_RAJRATAN_01',
        issuerNseSymbol: 'RAJRATAN',
        issuerBseCode: '517562',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual tyre bead wire revenue to surpass ₹800 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 897,
        expectedValue: 800,
        expectedOutcome: 'Revenue >= ₹800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_RAJRATAN_REV_01',
        claimDate: '2023-08-25',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 888,
        actualOutcomeDescription: 'Delivered ₹888 Cr revenue exceeding guidance by 11.0%.',
        evaluationEvidenceId: 'EV_RAJRATAN_REV_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'BSE Audited Financial Results',
        publicationDate: '2023-08-25',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_RAJRATAN_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_RAJRATAN_01',
        issuerNseSymbol: 'RAJRATAN',
        issuerBseCode: '517562',
        eventDate: '2024-03-25',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Chennai Greenfield Tyre Bead Wire Facility Commissioning',
        description: 'Commenced trial production runs at new 60,000 TPA greenfield manufacturing unit near Chennai ports.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_RAJRATAN_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_RAJRATAN_LEVERAGE',
        symbol: 'RAJRATAN',
        name: 'Automotive Wire Leverage Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 2.2x triggers hard veto.',
        rationale: 'Capex expansion must preserve financial solvency.'
      }
    ],
    breakerContextMetrics: {
      'TB_RAJRATAN_LEVERAGE': 0.75
    },
    itasSignal: {
      symbol: 'RAJRATAN',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 82,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'RAJRATAN',
      coreThesisStatement: 'Largest tyre bead wire producer in India with sole manufacturing facility in Thailand serving global tyre giants (Bridgestone, Michelin, Apollo).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Market Share Dominance', description: 'Over 50% domestic market share in bead wire.' },
        { pillarId: 'P2', title: 'Export Proximity', description: 'Chennai greenfield facility cutting logistics costs for global exports.' }
      ],
      thesisBreakersDefined: ['TB_RAJRATAN_LEVERAGE']
    }
  },

  // 20. PAYTM (With Material Contradiction: RBI Section 35A Directive vs Business As Usual Guidance)
  {
    company: {
      symbol: 'PAYTM',
      companyName: 'One97 Communications Limited (Paytm)',
      bseCode: '543396',
      isin: 'INE982J01020',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Mobile Payments & Merchant QR Acquiring',
      headquarters: 'Noida, Uttar Pradesh, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_PAYTM_AR24',
        documentName: 'Paytm_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-30',
        documentHashSha256: '3456789abcdef0123456789abcdef0123456789abcdef01234',
        pageCount: 310,
        filingAuthority: 'BSE / NSE'
      },
      {
        documentId: 'DOC_PAYTM_RBI_DIR',
        documentName: 'RBI_Press_Release_PPBL_Section35A.pdf',
        documentType: 'REGULATORY_ORDER',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        publicationDate: '2024-01-31',
        documentHashSha256: '456789abcdef0123456789abcdef0123456789abcdef012345',
        pageCount: 4,
        filingAuthority: 'Reserve Bank of India'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_PAYTM_REV_01',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        documentId: 'DOC_PAYTM_AR24',
        documentHash: '3456789abcdef0123456789abcdef0123456789abcdef01234',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 45,
        pagePrinted: '43',
        quotedText: 'Consolidated revenue for FY24 reached ₹9978 Cr while regulatory actions triggered significant operational restructuring.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_PAYTM_PROMISE_01',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        documentId: 'DOC_PAYTM_AR24',
        documentHash: '3456789abcdef0123456789abcdef0123456789abcdef01234',
        documentType: 'STATUTORY_FILING',
        pagePhysical: 22,
        pagePrinted: '20',
        quotedText: 'Management affirmed full operational regulatory compliance and uninterrupted banking service continuity for Paytm Payments Bank.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_PAYTM_RBI_ORDER',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        documentId: 'DOC_PAYTM_RBI_DIR',
        documentHash: '456789abcdef0123456789abcdef0123456789abcdef012345',
        documentType: 'REGULATORY_ORDER',
        pagePhysical: 2,
        pagePrinted: '2',
        quotedText: 'RBI directed Paytm Payments Bank to halt onboarding new customers and stop credit transactions and wallet top-ups due to persistent material non-compliances.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_PAYTM_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 9978,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_PAYTM_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹9978 Cr while regulatory actions triggered significant operational restructuring.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_PAYTM_01',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        period: 'FY24',
        category: 'GOVERNANCE',
        statement: 'Ensure full regulatory compliance and seamless continuation of associate payments bank banking services.',
        targetMetric: 'compliance_status',
        baselineValue: 1,
        expectedValue: 1,
        expectedOutcome: 'Full Compliance Sustained',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_PAYTM_PROMISE_01',
        claimDate: '2023-09-01',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'REVERSED',
        actualOutcomeMetric: 0,
        actualOutcomeDescription: 'RBI imposed Section 35A regulatory ban barring deposit acceptance and wallet operations.',
        evaluationEvidenceId: 'EV_PAYTM_RBI_ORDER',
        evaluationDate: '2024-01-31',
        evaluationBasis: 'RBI Official Directive under Section 35A',
        publicationDate: '2023-09-01',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_PAYTM_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_PAYTM_01',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        eventDate: '2024-01-31',
        category: 'REGULATORY',
        headline: 'RBI Supervisory Action under Section 35A on PPBL',
        description: 'Reserve Bank of India ordered complete cessation of banking deposits, wallet top-ups, and fastag accounts at Paytm Payments Bank.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'REGULATORY_ORDER',
        evidenceId: 'EV_PAYTM_RBI_ORDER',
        materiality: 'CRITICAL',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_PAYTM_RBI_01',
        issuerNseSymbol: 'PAYTM',
        issuerBseCode: '543396',
        severity: 'CRITICAL',
        type: 'DISCLOSURE_INCONSISTENCY',
        claimId: 'CLM_PAYTM_01',
        eventId: 'EVT_PAYTM_01',
        description: 'Management guided full compliance and seamless payments bank operations, but RBI issued sweeping statutory embargo under Section 35A halting core deposit operations.',
        divergenceDetails: {
          whatManagementClaimed: 'Full regulatory compliance and banking continuity',
          whatActuallyHappened: 'RBI banned all deposits, wallet top-ups, and credit operations at associate bank',
          deltaMetric: 'regulatory_sanction_imposed'
        },
        leftEvidenceId: 'EV_PAYTM_PROMISE_01',
        rightEvidenceId: 'EV_PAYTM_RBI_ORDER',
        supportingEvidenceIds: ['EV_PAYTM_RBI_ORDER'],
        status: 'OPEN',
        materiality: 'CRITICAL',
        detectedAt: '2024-01-31T18:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_PAYTM_REGULATORY',
        symbol: 'PAYTM',
        name: 'Critical Regulatory Embargo Breaker',
        type: 'QUALITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN_OR_EQUAL',
        severity: 'CRITICAL',
        description: 'Imposition of central bank statutory restriction on core business operations triggers immediate hard veto.',
        rationale: 'Banking and wallet license restrictions impair merchant network moat.'
      }
    ],
    breakerContextMetrics: {
      'TB_PAYTM_REGULATORY': 1.0
    },
    itasSignal: {
      symbol: 'PAYTM',
      strategyAgreementCount: 12,
      totalStrategiesEvaluated: 20,
      signalStrength: 60,
      marketRegime: 'BEARISH',
      quantDirective: 'NEUTRAL',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'PAYTM',
      coreThesisStatement: 'Leading merchant QR payment processor facing severe regulatory disruptions following central bank restrictions on associate payments bank.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Merchant QR Network', description: 'Over 10 million active merchant soundbox and QR devices deployed.' },
        { pillarId: 'P2', title: 'Loan Distribution', description: 'Financial services distribution partnerships with commercial banks and NBFCs.' }
      ],
      thesisBreakersDefined: ['TB_PAYTM_REGULATORY']
    }
  },

  // 21. GROWW
  {
    company: {
      symbol: 'GROWW',
      companyName: 'Billionbrains Garage Ventures Limited (Groww)',
      bseCode: 'GROWW',
      isin: 'INE0HOQ01053',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Fintech, Digital Broking & Wealth Platforms',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_GROWW_FY24',
        documentName: 'Groww_Statutory_Annual_Filings_FY24.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-08-20',
        documentHashSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef1',
        pageCount: 165,
        filingAuthority: 'MCA / ROC'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_GROWW_REV_01',
        issuerNseSymbol: 'GROWW',
        issuerBseCode: 'GROWW',
        documentId: 'DOC_GROWW_FY24',
        documentHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef1',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 35,
        pagePrinted: '33',
        quotedText: 'Consolidated revenue for FY24 reached ₹3145 Cr driven by rapid active client additions.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_GROWW_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 3145,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_GROWW_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹3145 Cr driven by rapid active client additions.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_GROWW_01',
        issuerNseSymbol: 'GROWW',
        issuerBseCode: 'GROWW',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale active broking and mutual fund distribution client base to surpass ₹2,500 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 1278,
        expectedValue: 2500,
        expectedOutcome: 'Revenue >= ₹2,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_GROWW_REV_01',
        claimDate: '2023-08-15',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 3145,
        actualOutcomeDescription: 'Delivered ₹3,145 Cr revenue surpassing guidance by 25.8%.',
        evaluationEvidenceId: 'EV_GROWW_REV_01',
        evaluationDate: '2024-06-15',
        evaluationBasis: 'Audited Financial Statements Filing with ROC',
        publicationDate: '2023-08-15',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_GROWW_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_GROWW_01',
        issuerNseSymbol: 'GROWW',
        issuerBseCode: 'GROWW',
        eventDate: '2024-05-15',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Number 1 Stock Broker in India by Active NSE Clients',
        description: 'Became the largest stock broker in India with active NSE client market share surpassing 24%.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_GROWW_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_GROWW_LEVERAGE',
        symbol: 'GROWW',
        name: 'Fintech Zero Debt Incurrence',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'Digital discount broking platforms must operate with zero leverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_GROWW_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'GROWW',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'GROWW',
      coreThesisStatement: 'Market leader in Indian retail stock broking and mutual fund investments capturing the lion\'s share of first-time digital investors.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Active Client Moat', description: 'Largest active client base on the National Stock Exchange.' },
        { pillarId: 'P2', title: 'Wealth Platform Expansion', description: 'Rapidly cross-selling consumer credit, margin trade funding, and AMC products.' }
      ],
      thesisBreakersDefined: ['TB_GROWW_LEVERAGE']
    }
  },

  // 22. PIDILITIND
  {
    company: {
      symbol: 'PIDILITIND',
      companyName: 'Pidilite Industries Limited',
      bseCode: '500331',
      isin: 'INE318A01026',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Consumer Adhesives, Sealants & Construction Chemicals',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_PIDILITE_AR24',
        documentName: 'Pidilite_Industries_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-24',
        documentHashSha256: '56789abcdef0123456789abcdef0123456789abcdef012345',
        pageCount: 260,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_PIDILITE_REV_01',
        issuerNseSymbol: 'PIDILITIND',
        issuerBseCode: '500331',
        documentId: 'DOC_PIDILITE_AR24',
        documentHash: '56789abcdef0123456789abcdef0123456789abcdef012345',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 46,
        pagePrinted: '44',
        quotedText: 'Consolidated revenue for FY24 reached ₹12383 Cr with consumer adhesive volumes expanding by 9.5%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_PIDILITIND_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 12383,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_PIDILITE_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹12383 Cr with consumer adhesive volumes expanding by 9.5%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_PIDILITIND_01',
        issuerNseSymbol: 'PIDILITIND',
        issuerBseCode: '500331',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consumer adhesive and construction chemical turnover past ₹11,800 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 11799,
        expectedValue: 11800,
        expectedOutcome: 'Revenue >= ₹11,800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_PIDILITE_REV_01',
        claimDate: '2023-08-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 12383,
        actualOutcomeDescription: 'Delivered ₹12,383 Cr revenue beating top-line target.',
        evaluationEvidenceId: 'EV_PIDILITE_REV_01',
        evaluationDate: '2024-05-16',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-18',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_PIDILITIND_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_PIDILITIND_01',
        issuerNseSymbol: 'PIDILITIND',
        issuerBseCode: '500331',
        eventDate: '2024-04-05',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Expansion into Consumer Lending and Home Paints Ecosystem',
        description: 'Announced pilot rollout of specialized decorative coatings and contractor financing initiatives.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_PIDILITE_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_PIDILITE_LEVERAGE',
        symbol: 'PIDILITIND',
        name: 'Consumer Adhesives Leverage Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'Pidilite operates with virtually zero debt and high return on capital.'
      }
    ],
    breakerContextMetrics: {
      'TB_PIDILITE_LEVERAGE': 0.05
    },
    itasSignal: {
      symbol: 'PIDILITIND',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'PIDILITIND',
      coreThesisStatement: 'Monopoly brand equity in consumer adhesives (Fevicol, Fevikwik, M-Seal) creating an insurmountable distribution moat across 500,000+ retail outlets.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Fevicol Brand Moat', description: 'Over 70% market share in white glue and woodworking adhesives.' },
        { pillarId: 'P2', title: 'Waterproofing Growth', description: 'Dr. Fixit capturing structural surge in real estate construction waterproofing.' }
      ],
      thesisBreakersDefined: ['TB_PIDILITE_LEVERAGE']
    }
  },

  // 23. ZENTEC
  {
    company: {
      symbol: 'ZENTEC',
      companyName: 'Zen Technologies Limited',
      bseCode: '533339',
      isin: 'INE251B01027',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Defense Training Simulators & Anti-Drone Systems',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_ZENTEC_AR24',
        documentName: 'Zen_Technologies_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: '6789abcdef0123456789abcdef0123456789abcdef0123456',
        pageCount: 160,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_ZENTEC_REV_01',
        issuerNseSymbol: 'ZENTEC',
        issuerBseCode: '533339',
        documentId: 'DOC_ZENTEC_AR24',
        documentHash: '6789abcdef0123456789abcdef0123456789abcdef0123456',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 35,
        pagePrinted: '33',
        quotedText: 'Consolidated revenue for FY24 reached ₹430 Cr with anti-drone system dispatches driving record profits.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_ZENTEC_ORDER_01',
        issuerNseSymbol: 'ZENTEC',
        issuerBseCode: '533339',
        documentId: 'DOC_ZENTEC_AR24',
        documentHash: '6789abcdef0123456789abcdef0123456789abcdef0123456',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 48,
        pagePrinted: '46',
        quotedText: 'Total confirmed order book stood at ₹1402 Cr as of 31st March 2024 across domestic armed forces and export orders.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_ZENTEC_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 430,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_ZENTEC_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹430 Cr with anti-drone system dispatches driving record profits.'
      },
      {
        factId: 'FACT_ZENTEC_02',
        metric: 'ORDER_BOOK',
        metricFamily: 'ORDER_BOOK',
        value: 1402,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'STOCK',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_ZENTEC_ORDER_01',
        sourceQuotedText: 'Total confirmed order book stood at ₹1402 Cr as of 31st March 2024 across domestic armed forces and export orders.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_ZENTEC_01',
        issuerNseSymbol: 'ZENTEC',
        issuerBseCode: '533339',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual defense combat training revenue to exceed ₹400 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 219,
        expectedValue: 400,
        expectedOutcome: 'Revenue >= ₹400 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_ZENTEC_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 430,
        actualOutcomeDescription: 'Delivered ₹430 Cr revenue beating target by 7.5%.',
        evaluationEvidenceId: 'EV_ZENTEC_REV_01',
        evaluationDate: '2024-05-18',
        evaluationBasis: 'BSE Audited Financial Results',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_ZENTEC_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_ZENTEC_01',
        issuerNseSymbol: 'ZENTEC',
        issuerBseCode: '533339',
        eventDate: '2024-06-12',
        category: 'ORDER_BOOK',
        headline: 'Export Order Win for Counter-Unmanned Aerial Systems (CUAS)',
        description: 'Secured landmark export contract worth ₹340 Cr from friendly foreign nation for integrated drone jamming systems.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_ZENTEC_ORDER_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_ZENTEC_LEVERAGE',
        symbol: 'ZENTEC',
        name: 'Defense Tech Debt Incurrence Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'Zero debt and strong operating cash flows must be sustained.'
      }
    ],
    breakerContextMetrics: {
      'TB_ZENTEC_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'ZENTEC',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 96,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'ZENTEC',
      coreThesisStatement: 'Pure-play defense technology leader possessing 100% indigenous intellectual property across live combat training simulators and anti-drone electronic warfare.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Anti-Drone Moat', description: 'Proprietary RF sensors, drone jammers, and hard-kill radar integration.' },
        { pillarId: 'P2', title: 'High Export Profitability', description: 'Export orders carrying 40%+ operating EBITDA margins.' }
      ],
      thesisBreakersDefined: ['TB_ZENTEC_LEVERAGE']
    }
  },

  // 24. NH
  {
    company: {
      symbol: 'NH',
      companyName: 'Narayana Hrudayalaya Limited',
      bseCode: '539551',
      isin: 'INE410P01011',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Super-Specialty Tertiary Healthcare & Hospitals',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_NH_AR24',
        documentName: 'Narayana_Hrudayalaya_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: '789abcdef0123456789abcdef0123456789abcdef01234567',
        pageCount: 240,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_NH_REV_01',
        issuerNseSymbol: 'NH',
        issuerBseCode: '539551',
        documentId: 'DOC_NH_AR24',
        documentHash: '789abcdef0123456789abcdef0123456789abcdef01234567',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 42,
        pagePrinted: '40',
        quotedText: 'Consolidated revenue for FY24 reached ₹5002 Cr with Cayman Islands healthcare unit delivering record margins.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_NH_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 5002,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_NH_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹5002 Cr with Cayman Islands healthcare unit delivering record margins.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_NH_01',
        issuerNseSymbol: 'NH',
        issuerBseCode: '539551',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated hospital operations to cross ₹4,800 Cr revenue in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 4525,
        expectedValue: 4800,
        expectedOutcome: 'Revenue >= ₹4,800 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_NH_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 5002,
        actualOutcomeDescription: 'Delivered ₹5,002 Cr revenue beating expectation by 4.2%.',
        evaluationEvidenceId: 'EV_NH_REV_01',
        evaluationDate: '2024-05-27',
        evaluationBasis: 'Audited Financial Accounts BSE',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_NH_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_NH_01',
        issuerNseSymbol: 'NH',
        issuerBseCode: '539551',
        eventDate: '2024-04-18',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Commissioning of Cayman Islands New Hospital Facility',
        description: 'Commenced operations at new radiation oncology and super-specialty facility in Grand Cayman.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_NH_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_NH_LEVERAGE',
        symbol: 'NH',
        name: 'Healthcare Capex Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'Capital-efficient hospital model generates high return on capital.'
      }
    ],
    breakerContextMetrics: {
      'TB_NH_LEVERAGE': 0.45
    },
    itasSignal: {
      symbol: 'NH',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'NH',
      coreThesisStatement: 'World-renowned low-cost high-volume tertiary healthcare chain delivering superior return on capital employed with immense overseas dollar earnings in Cayman.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Cayman Offshore Asset', description: 'Generates over 40% of operating EBITDA with 40%+ EBITDA margins in US dollars.' },
        { pillarId: 'P2', title: 'Domestic Bed Expansion', description: 'Expanding high-ARPOB flagship hospitals in Bengaluru, Kolkata, and Delhi NCR.' }
      ],
      thesisBreakersDefined: ['TB_NH_LEVERAGE']
    }
  }
];
