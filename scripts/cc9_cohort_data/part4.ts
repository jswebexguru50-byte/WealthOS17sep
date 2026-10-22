import { CompanyCohortDefinition } from './types.js';

export const PART4_COMPANIES: CompanyCohortDefinition[] = [
  // 37. SBIN
  {
    company: {
      symbol: 'SBIN',
      companyName: 'State Bank of India',
      bseCode: '500112',
      isin: 'INE062A01020',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Public Sector Commercial Banking & Financial Conglomerate',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_SBIN_AR24',
        documentName: 'State_Bank_of_India_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: '456789abcdef0123456789abcdef0123456789abcdef5',
        pageCount: 450,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_SBIN_REV_01',
        issuerNseSymbol: 'SBIN',
        issuerBseCode: '500112',
        documentId: 'DOC_SBIN_AR24',
        documentHash: '456789abcdef0123456789abcdef0123456789abcdef5',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 92,
        pagePrinted: '90',
        quotedText: 'Total revenue reached ₹439189 Cr with gross NPA dropping to historic low of 2.24%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_SBIN_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 439189,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_SBIN_REV_01',
        sourceQuotedText: 'Total revenue reached ₹439189 Cr with gross NPA dropping to historic low of 2.24%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_SBIN_01',
        issuerNseSymbol: 'SBIN',
        issuerBseCode: '500112',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated banking income past ₹400,000 Cr in FY24 while sustaining ROE above 18%.',
        targetMetric: 'revenue_cr',
        baselineValue: 368715,
        expectedValue: 400000,
        expectedOutcome: 'Revenue >= ₹400,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_SBIN_REV_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 439189,
        actualOutcomeDescription: 'Delivered ₹439,189 Cr revenue exceeding guidance by 9.8%.',
        evaluationEvidenceId: 'EV_SBIN_REV_01',
        evaluationDate: '2024-05-09',
        evaluationBasis: 'BSE Audited Annual Financial Accounts Release',
        publicationDate: '2023-08-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_SBIN_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_SBIN_01',
        issuerNseSymbol: 'SBIN',
        issuerBseCode: '500112',
        eventDate: '2024-05-09',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Highest Ever Standalone Full-Year Net Profit in Indian Corporate History',
        description: 'Reported annual net profit of ₹61,077 Cr representing over 21% return on equity.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_SBIN_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_SBIN_NPA',
        symbol: 'SBIN',
        name: 'National Bank GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA ratio exceeding 3.5% triggers hard veto.',
        rationale: 'Clean balance sheet must be preserved to support infrastructure lending.'
      }
    ],
    breakerContextMetrics: {
      'TB_SBIN_NPA': 2.24
    },
    itasSignal: {
      symbol: 'SBIN',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 94,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'SBIN',
      coreThesisStatement: 'The bedrock of Indian financial system commanding 23% deposit market share, operating at peak profitability with cleanest asset quality in two decades.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Low-Cost CASA Monopoly', description: 'Over ₹49 lakh crore in deposits powered by 22,500 branches.' },
        { pillarId: 'P2', title: 'Corporate Credit Pricing Power', description: 'Unrivaled capability to syndicate mega infrastructure and energy transition loans.' }
      ],
      thesisBreakersDefined: ['TB_SBIN_NPA']
    }
  },

  // 38. RBLBANK (With Material Contradiction: Unhedged Credit Card Slippages vs Asset Quality Guidance)
  {
    company: {
      symbol: 'RBLBANK',
      companyName: 'RBL Bank Limited',
      bseCode: '540065',
      isin: 'INE976G01028',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Scheduled Commercial Banking & Credit Cards',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_RBL_AR24',
        documentName: 'RBL_Bank_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-24',
        documentHashSha256: '56789abcdef0123456789abcdef0123456789abcdef6',
        pageCount: 310,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_RBL_REV_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        documentId: 'DOC_RBL_AR24',
        documentHash: '56789abcdef0123456789abcdef0123456789abcdef6',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 52,
        pagePrinted: '50',
        quotedText: 'Total revenue reached ₹15392 Cr while microfinance and credit card credit costs elevated significantly.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_RBL_PROMISE_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        documentId: 'DOC_RBL_AR24',
        documentHash: '56789abcdef0123456789abcdef0123456789abcdef6',
        documentType: 'STATUTORY_FILING',
        pagePhysical: 28,
        pagePrinted: '26',
        quotedText: 'Management guided credit card and unsecured credit costs to remain below 2.5% of advances throughout FY24.',
        verificationStatus: 'VERIFIED_PRIMARY'
      },
      {
        evidenceId: 'EV_RBL_RESULT_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        documentId: 'DOC_RBL_AR24',
        documentHash: '56789abcdef0123456789abcdef0123456789abcdef6',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 65,
        pagePrinted: '63',
        quotedText: 'Audited accounts revealed unsecured credit card and MFI credit costs surged to 4.1% forcing substantial additional provision allocations.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_RBL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 15392,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_RBL_REV_01',
        sourceQuotedText: 'Total revenue reached ₹15392 Cr while microfinance and credit card credit costs elevated significantly.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_RBL_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        period: 'FY24',
        category: 'GOVERNANCE',
        statement: 'Contain unsecured credit card and MFI credit costs strictly under 2.5% of loan book.',
        targetMetric: 'credit_cost_pct',
        baselineValue: 2.3,
        expectedValue: 2.5,
        expectedOutcome: 'Credit costs <= 2.5%',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_RBL_PROMISE_01',
        claimDate: '2023-08-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'MISSED',
        actualOutcomeMetric: 4.1,
        actualOutcomeDescription: 'Delivered 4.1% credit costs, missing target by 160 bps due to unsecured slippages.',
        evaluationEvidenceId: 'EV_RBL_RESULT_01',
        evaluationDate: '2024-04-27',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-18',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_RBL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_RBL_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        eventDate: '2024-04-27',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Credit Card Credit Cost Surge Disclosure',
        description: 'Disclosed elevated provisioning requirements across co-branded credit card and rural business loans.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_RBL_RESULT_01',
        materiality: 'HIGH',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    contradictions: [
      {
        contradictionId: 'CONTRA_RBL_NPA_01',
        issuerNseSymbol: 'RBLBANK',
        issuerBseCode: '540065',
        severity: 'HIGH',
        type: 'CLAIM_VS_RESULT',
        claimId: 'CLM_RBL_01',
        eventId: 'EVT_RBL_01',
        description: 'Management guided credit card and unsecured slippage costs to remain below 2.5%, but audited accounts confirmed a surge to 4.1%.',
        divergenceDetails: {
          whatManagementClaimed: 'Credit costs strictly under 2.5%',
          whatActuallyHappened: 'Credit costs surged to 4.1% due to unsecured retail default spike',
          deltaMetric: 'credit_cost_pct'
        },
        leftEvidenceId: 'EV_RBL_PROMISE_01',
        rightEvidenceId: 'EV_RBL_RESULT_01',
        supportingEvidenceIds: ['EV_RBL_RESULT_01'],
        status: 'OPEN',
        materiality: 'HIGH',
        detectedAt: '2024-04-27T12:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_RBL_NPA',
        symbol: 'RBLBANK',
        name: 'Private Bank GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA ratio exceeding 3.5% triggers hard veto.',
        rationale: 'Unsecured credit concentration exposes balance sheet to sharp credit downgrades.'
      }
    ],
    breakerContextMetrics: {
      'TB_RBL_NPA': 2.65
    },
    itasSignal: {
      symbol: 'RBLBANK',
      strategyAgreementCount: 14,
      totalStrategiesEvaluated: 20,
      signalStrength: 70,
      marketRegime: 'BEARISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'RBLBANK',
      coreThesisStatement: 'Turnaround story in private commercial banking facing cyclical headwinds in unsecured credit card and microfinance portfolios.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Credit Card Franchise', description: 'Co-branded partnerships (Bajaj Finance, Zomato) driving card interchange fees.' },
        { pillarId: 'P2', title: 'Secured Asset Pivot', description: 'Rebalancing loan book towards housing, auto, and wholesale advances.' }
      ],
      thesisBreakersDefined: ['TB_RBL_NPA']
    }
  },

  // 39. BANKBARODA
  {
    company: {
      symbol: 'BANKBARODA',
      companyName: 'Bank of Baroda',
      bseCode: '532134',
      isin: 'INE028A01039',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Universal Commercial Banking & Financial Services',
      headquarters: 'Vadodara / Mumbai, Gujarat / Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BOB_AR24',
        documentName: 'Bank_of_Baroda_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: '6789abcdef0123456789abcdef0123456789abcdef7',
        pageCount: 380,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BOB_REV_01',
        issuerNseSymbol: 'BANKBARODA',
        issuerBseCode: '532134',
        documentId: 'DOC_BOB_AR24',
        documentHash: '6789abcdef0123456789abcdef0123456789abcdef7',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 78,
        pagePrinted: '76',
        quotedText: 'Total revenue reached ₹127101 Cr with operating profit jumping by 15% and net NPA at 0.68%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BOB_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 127101,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BOB_REV_01',
        sourceQuotedText: 'Total revenue reached ₹127101 Cr with operating profit jumping by 15% and net NPA at 0.68%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BOB_01',
        issuerNseSymbol: 'BANKBARODA',
        issuerBseCode: '532134',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual consolidated banking turnover past ₹115,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 110777,
        expectedValue: 115000,
        expectedOutcome: 'Revenue >= ₹115,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BOB_REV_01',
        claimDate: '2023-08-14',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 127101,
        actualOutcomeDescription: 'Delivered ₹127,101 Cr revenue beating guidance by 10.5%.',
        evaluationEvidenceId: 'EV_BOB_REV_01',
        evaluationDate: '2024-05-10',
        evaluationBasis: 'Audited Financial Results BSE',
        publicationDate: '2023-08-14',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BOB_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BOB_01',
        issuerNseSymbol: 'BANKBARODA',
        issuerBseCode: '532134',
        eventDate: '2024-05-08',
        category: 'REGULATORY',
        headline: 'RBI Lifts Operational Restrictions on bob World Mobile App',
        description: 'Reserve Bank of India officially revoked the supervisory restriction on onboarding new customers through the bob World application.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'REGULATORY_ORDER',
        evidenceId: 'EV_BOB_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BOB_NPA',
        symbol: 'BANKBARODA',
        name: 'Public Bank Asset Quality Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 4.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA exceeding 4.0% triggers hard veto.',
        rationale: 'Corporate recovery momentum must prevent bad loan accumulation.'
      }
    ],
    breakerContextMetrics: {
      'TB_BOB_NPA': 2.92
    },
    itasSignal: {
      symbol: 'BANKBARODA',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BANKBARODA',
      coreThesisStatement: 'Second largest Indian public sector bank delivering exceptional return on equity (18%+) backed by international loan book and low provisioning burdens.',
      investmentPillars: [
        { pillarId: 'P1', title: 'International Banking Moat', description: 'Presence across 17 countries generating resilient fee income.' },
        { pillarId: 'P2', title: 'Retail Asset Diversification', description: 'Auto, home, and gold loans growing at 20%+ YoY.' }
      ],
      thesisBreakersDefined: ['TB_BOB_NPA']
    }
  },

  // 40. KPITTECH
  {
    company: {
      symbol: 'KPITTECH',
      companyName: 'KPIT Technologies Limited',
      bseCode: '542651',
      isin: 'INE04I401011',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Automotive Embedded Software, Mobility',
      headquarters: 'Pune, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_KPIT_AR24',
        documentName: 'KPIT_Technologies_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-25',
        documentHashSha256: '789abcdef0123456789abcdef0123456789abcdef8',
        pageCount: 230,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_KPIT_REV_01',
        issuerNseSymbol: 'KPITTECH',
        issuerBseCode: '542651',
        documentId: 'DOC_KPIT_AR24',
        documentHash: '789abcdef0123456789abcdef0123456789abcdef8',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 42,
        pagePrinted: '40',
        quotedText: 'Consolidated revenue for FY24 reached ₹4871 Cr with software-defined vehicle integration driving 39% constant currency growth.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_KPIT_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 4871,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_KPIT_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹4871 Cr with software-defined vehicle integration driving 39% constant currency growth.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_KPIT_01',
        issuerNseSymbol: 'KPITTECH',
        issuerBseCode: '542651',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual mobility software revenue to exceed ₹4,500 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 3365,
        expectedValue: 4500,
        expectedOutcome: 'Revenue >= ₹4,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_KPIT_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 4871,
        actualOutcomeDescription: 'Delivered ₹4,871 Cr revenue beating guidance by 8.2%.',
        evaluationEvidenceId: 'EV_KPIT_REV_01',
        evaluationDate: '2024-04-29',
        evaluationBasis: 'Audited Financial Results BSE',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_KPIT_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_KPIT_01',
        issuerNseSymbol: 'KPITTECH',
        issuerBseCode: '542651',
        eventDate: '2024-04-29',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Strategic Software-Defined Vehicle (SDV) Deal with Global European OEM',
        description: 'Won landmark multi-year software architecture engagement exceeding $150M for next-generation electric vehicle platform.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_KPIT_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_KPIT_LEVERAGE',
        symbol: 'KPITTECH',
        name: 'Auto Tech Zero Debt Incurrence',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 1.0x triggers hard veto.',
        rationale: 'Pure software engineering business carries zero debt.'
      }
    ],
    breakerContextMetrics: {
      'TB_KPIT_LEVERAGE': 0.05
    },
    itasSignal: {
      symbol: 'KPITTECH',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'KPITTECH',
      coreThesisStatement: 'Pure-play global leader in automotive embedded software, autonomous driving, and electric powertrain architecture partnering with top 10 global OEMs.',
      investmentPillars: [
        { pillarId: 'P1', title: 'SDV Megatrend Moat', description: 'Deep integration into AUTOSAR, middleware, and battery software systems.' },
        { pillarId: 'P2', title: 'High Revenue Visibility', description: 'Order book and strategic client partnerships spanning 5+ year vehicle lifecycle development.' }
      ],
      thesisBreakersDefined: ['TB_KPIT_LEVERAGE']
    }
  },

  // 41. ARE&M
  {
    company: {
      symbol: 'ARE&M',
      companyName: 'Amara Raja Energy & Mobility Limited',
      bseCode: '500008',
      isin: 'INE885A01032',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Lead-Acid & Lithium-Ion Energy Storage Solutions',
      headquarters: 'Hyderabad, Telangana, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_AREM_AR24',
        documentName: 'Amara_Raja_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-26',
        documentHashSha256: '89abcdef0123456789abcdef0123456789abcdef9',
        pageCount: 240,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_AREM_REV_01',
        issuerNseSymbol: 'ARE&M',
        issuerBseCode: '500008',
        documentId: 'DOC_AREM_AR24',
        documentHash: '89abcdef0123456789abcdef0123456789abcdef9',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 45,
        pagePrinted: '43',
        quotedText: 'Consolidated revenue for FY24 reached ₹11261 Cr with automotive battery aftermarket and telecom backup expanding.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_AREM_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 11261,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_AREM_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹11261 Cr with automotive battery aftermarket and telecom backup expanding.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_AREM_01',
        issuerNseSymbol: 'ARE&M',
        issuerBseCode: '500008',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual energy storage sales to cross ₹10,500 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 10386,
        expectedValue: 10500,
        expectedOutcome: 'Revenue >= ₹10,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_AREM_REV_01',
        claimDate: '2023-08-18',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 11261,
        actualOutcomeDescription: 'Delivered ₹11,261 Cr revenue beating target by 7.2%.',
        evaluationEvidenceId: 'EV_AREM_REV_01',
        evaluationDate: '2024-05-28',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-18',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_AREM_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_AREM_01',
        issuerNseSymbol: 'ARE&M',
        issuerBseCode: '500008',
        eventDate: '2024-06-24',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Licensing Agreement with Gotion-InoBat for Lithium-Ion Cells',
        description: 'Signed technical licensing agreement with global battery leader Gotion High-Tech for manufacturing NMC and LFP battery cells.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_AREM_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_AREM_LEVERAGE',
        symbol: 'ARE&M',
        name: 'Battery Giga-Factory Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'Lithium giga-factory capex must remain conservatively funded.'
      }
    ],
    breakerContextMetrics: {
      'TB_AREM_LEVERAGE': 0.1
    },
    itasSignal: {
      symbol: 'ARE&M',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 90,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'ARE&M',
      coreThesisStatement: 'Duopolistic battery powerhouse (Amaron) using robust cash flows from lead-acid replacement market to build India\'s first commercial 16 GWh lithium-ion giga-hub in Telangana.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Amaron Brand Moat', description: 'Over 35% domestic market share in organized auto replacement batteries.' },
        { pillarId: 'P2', title: 'Gotion Tech Partnership', description: 'Access to Tier-1 global lithium chemistry IP for electric 2W/3W and stationary energy storage.' }
      ],
      thesisBreakersDefined: ['TB_AREM_LEVERAGE']
    }
  },

  // 42. TATACONSUM
  {
    company: {
      symbol: 'TATACONSUM',
      companyName: 'Tata Consumer Products Limited',
      bseCode: '500800',
      isin: 'INE192A01025',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Consumer Packaged Goods, Foods & Refreshments',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_TATACONSUM_AR24',
        documentName: 'Tata_Consumer_Products_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-18',
        documentHashSha256: '9abcdef0123456789abcdef0123456789abcdefa',
        pageCount: 320,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_TC_REV_01',
        issuerNseSymbol: 'TATACONSUM',
        issuerBseCode: '500800',
        documentId: 'DOC_TATACONSUM_AR24',
        documentHash: '9abcdef0123456789abcdef0123456789abcdefa',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 52,
        pagePrinted: '50',
        quotedText: 'Consolidated revenue for FY24 reached ₹15206 Cr with India foods and salt business growing by 18%.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_TC_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 15206,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_TC_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹15206 Cr with India foods and salt business growing by 18%.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_TATACONSUM_01',
        issuerNseSymbol: 'TATACONSUM',
        issuerBseCode: '500800',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated consumer top line past ₹14,500 Cr in FY24 through foods expansion.',
        targetMetric: 'revenue_cr',
        baselineValue: 13783,
        expectedValue: 14500,
        expectedOutcome: 'Revenue >= ₹14,500 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_TC_REV_01',
        claimDate: '2023-08-10',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 15206,
        actualOutcomeDescription: 'Delivered ₹15,206 Cr revenue exceeding guidance by 4.9%.',
        evaluationEvidenceId: 'EV_TC_REV_01',
        evaluationDate: '2024-04-23',
        evaluationBasis: 'BSE Audited Financial Results Release',
        publicationDate: '2023-08-10',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_TC_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_TATACONSUM_01',
        issuerNseSymbol: 'TATACONSUM',
        issuerBseCode: '500800',
        eventDate: '2024-01-12',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Acquisition of Capital Foods (Ching\'s Secret) and Organic India',
        description: 'Completed acquisitions of Capital Foods for ₹5,100 Cr and Organic India for ₹1,900 Cr significantly expanding packaged pantry TAM.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_TC_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_TC_LEVERAGE',
        symbol: 'TATACONSUM',
        name: 'FMCG Acquisition Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.5x triggers hard veto.',
        rationale: 'FMCG cash cows must swiftly absorb acquisition debt.'
      }
    ],
    breakerContextMetrics: {
      'TB_TC_LEVERAGE': 0.85
    },
    itasSignal: {
      symbol: 'TATACONSUM',
      strategyAgreementCount: 17,
      totalStrategiesEvaluated: 20,
      signalStrength: 88,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'TATACONSUM',
      coreThesisStatement: 'Tata Group\'s primary FMCG vehicle transforming from commodity tea into integrated packaged foods and health & wellness giant (Tata Salt, Sampann, Ching\'s, Starbucks JV).',
      investmentPillars: [
        { pillarId: 'P1', title: 'Distribution Expansion', description: 'Direct reach expanded to 4 million retail outlets across urban and rural India.' },
        { pillarId: 'P2', title: 'High-Margin Foods Integration', description: 'Ching\'s and Organic India accelerating margin expansion.' }
      ],
      thesisBreakersDefined: ['TB_TC_LEVERAGE']
    }
  },

  // 43. BAJAJHFL
  {
    company: {
      symbol: 'BAJAJHFL',
      companyName: 'Bajaj Housing Finance Limited',
      bseCode: '544252',
      isin: 'INE377Y01017',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Prime Retail Housing & Mortgage Lending',
      headquarters: 'Pune, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_BAJAJHFL_AR24',
        documentName: 'Bajaj_Housing_Finance_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-20',
        documentHashSha256: 'abcdef0123456789abcdef0123456789abcdefb',
        pageCount: 220,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_BHFL_REV_01',
        issuerNseSymbol: 'BAJAJHFL',
        issuerBseCode: '544252',
        documentId: 'DOC_BAJAJHFL_AR24',
        documentHash: 'abcdef0123456789abcdef0123456789abcdefb',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 38,
        pagePrinted: '36',
        quotedText: 'Total revenue reached ₹7617 Cr with housing loan assets under management crossing ₹91,370 Cr.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_BAJAJHFL_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 7617,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_BHFL_REV_01',
        sourceQuotedText: 'Total revenue reached ₹7617 Cr with housing loan assets under management crossing ₹91,370 Cr.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_BAJAJHFL_01',
        issuerNseSymbol: 'BAJAJHFL',
        issuerBseCode: '544252',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale annual mortgage income past ₹7,000 Cr while keeping gross NPA under 0.50%.',
        targetMetric: 'revenue_cr',
        baselineValue: 5665,
        expectedValue: 7000,
        expectedOutcome: 'Revenue >= ₹7,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_BHFL_REV_01',
        claimDate: '2023-08-16',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 7617,
        actualOutcomeDescription: 'Delivered ₹7,617 Cr revenue beating guidance by 8.8%.',
        evaluationEvidenceId: 'EV_BHFL_REV_01',
        evaluationDate: '2024-04-24',
        evaluationBasis: 'Audited Financial Results Release',
        publicationDate: '2023-08-16',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_BAJAJHFL_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_BAJAJHFL_01',
        issuerNseSymbol: 'BAJAJHFL',
        issuerBseCode: '544252',
        eventDate: '2024-06-06',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Filing of DRHP for Landmark ₹6,560 Cr IPO',
        description: 'Filed draft red herring prospectus with SEBI for landmark initial public offering to comply with RBI Upper Layer NBFC regulations.',
        sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_BHFL_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_BHFL_NPA',
        symbol: 'BAJAJHFL',
        name: 'Prime Housing GNPA Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 1.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Gross NPA exceeding 1.0% triggers hard veto.',
        rationale: 'Salaried prime home loan book must maintain industry-best asset quality.'
      }
    ],
    breakerContextMetrics: {
      'TB_BHFL_NPA': 0.27
    },
    itasSignal: {
      symbol: 'BAJAJHFL',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'BAJAJHFL',
      coreThesisStatement: 'Fastest-growing prime housing finance company in India leveraging Bajaj brand, AAA credit rating, and low cost of borrowings to compound mortgage AUM.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Pristine Prime Underwriting', description: 'Over 85% salaried home loan borrowers with average credit scores exceeding 750.' },
        { pillarId: 'P2', title: 'Lowest Cost of Funds', description: 'AAA rating enabling razor-thin borrowing spreads competing directly with top private banks.' }
      ],
      thesisBreakersDefined: ['TB_BHFL_NPA']
    }
  },

  // 44. TATAPOWER
  {
    company: {
      symbol: 'TATAPOWER',
      companyName: 'The Tata Power Company Limited',
      bseCode: '500400',
      isin: 'INE245A01021',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Integrated Power Utility & Renewables',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_TATAPOWER_AR24',
        documentName: 'Tata_Power_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: 'bcdef0123456789abcdef0123456789abcdefc',
        pageCount: 340,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_TP_REV_01',
        issuerNseSymbol: 'TATAPOWER',
        issuerBseCode: '500400',
        documentId: 'DOC_TATAPOWER_AR24',
        documentHash: 'bcdef0123456789abcdef0123456789abcdefc',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 62,
        pagePrinted: '60',
        quotedText: 'Consolidated revenue for FY24 reached ₹61449 Cr with solar rooftop and generation utility dispatches accelerating.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_TP_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 61449,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_TP_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹61449 Cr with solar rooftop and generation utility dispatches accelerating.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_TATAPOWER_01',
        issuerNseSymbol: 'TATAPOWER',
        issuerBseCode: '500400',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale integrated power generation and distribution revenue past ₹58,000 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 55109,
        expectedValue: 58000,
        expectedOutcome: 'Revenue >= ₹58,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_TP_REV_01',
        claimDate: '2023-08-11',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 61449,
        actualOutcomeDescription: 'Delivered ₹61,449 Cr revenue beating target by 5.9%.',
        evaluationEvidenceId: 'EV_TP_REV_01',
        evaluationDate: '2024-05-08',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-11',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_TP_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_TATAPOWER_01',
        issuerNseSymbol: 'TATAPOWER',
        issuerBseCode: '500400',
        eventDate: '2024-04-15',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Commissioning of 4.3 GW Solar Cell and Module Manufacturing Facility',
        description: 'Commenced commercial production at state-of-the-art 4.3 GW solar cell and bifacial module giga-plant in Tirunelveli, Tamil Nadu.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_TP_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_TP_LEVERAGE',
        symbol: 'TATAPOWER',
        name: 'Power Utility Leverage Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 3.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 3.5x triggers hard veto.',
        rationale: 'Renewable capex buildout must remain within regulated cash flow coverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_TP_LEVERAGE': 2.3
    },
    itasSignal: {
      symbol: 'TATAPOWER',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 91,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'TATAPOWER',
      coreThesisStatement: 'Integrated green power utility powerhouse with end-to-end presence across solar cell manufacturing, rooftop solar EPC, EV charging networks, and transmission grids.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Rooftop Solar Leadership', description: 'Over 37% market share in residential rooftop solar installations across India.' },
        { pillarId: 'P2', title: 'Giga-Manufacturing Moat', description: '4.3 GW domestic solar cell manufacturing shielding company from import duties.' }
      ],
      thesisBreakersDefined: ['TB_TP_LEVERAGE']
    }
  },

  // 45. TINNARUBR
  {
    company: {
      symbol: 'TINNARUBR',
      companyName: 'Tinna Rubber and Infrastructure Limited',
      bseCode: '530475',
      isin: 'INE437C01024',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Recycled End-of-Life Tyres & Modified Bitumen',
      headquarters: 'New Delhi, Delhi, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_TINNA_AR24',
        documentName: 'Tinna_Rubber_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: 'cdef0123456789abcdef0123456789abcdefd',
        pageCount: 150,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_TINNA_REV_01',
        issuerNseSymbol: 'TINNARUBR',
        issuerBseCode: '530475',
        documentId: 'DOC_TINNA_AR24',
        documentHash: 'cdef0123456789abcdef0123456789abcdefd',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 30,
        pagePrinted: '28',
        quotedText: 'Consolidated revenue for FY24 reached ₹389 Cr driven by crumb rubber modifier and road infrastructure demand.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_TINNA_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 389,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_TINNA_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹389 Cr driven by crumb rubber modifier and road infrastructure demand.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_TINNARUBR_01',
        issuerNseSymbol: 'TINNARUBR',
        issuerBseCode: '530475',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale tyre recycling and crumb rubber revenue past ₹350 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 310,
        expectedValue: 350,
        expectedOutcome: 'Revenue >= ₹350 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_TINNA_REV_01',
        claimDate: '2023-09-02',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 389,
        actualOutcomeDescription: 'Delivered ₹389 Cr revenue beating guidance by 11.1%.',
        evaluationEvidenceId: 'EV_TINNA_REV_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'NSE Audited Accounts',
        publicationDate: '2023-09-02',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_TINNA_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_TINNARUBR_01',
        issuerNseSymbol: 'TINNARUBR',
        issuerBseCode: '530475',
        eventDate: '2024-03-18',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Oman Tyre Recycling Plant Commissioning',
        description: 'Commissioned first overseas tyre recycling and crumb rubber modification plant in Sohar Port, Oman.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_TINNA_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_TINNA_LEVERAGE',
        symbol: 'TINNARUBR',
        name: 'Circular Economy Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.2,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Net Debt / EBITDA exceeding 2.2x triggers hard veto.',
        rationale: 'Tyre recycling capex must be sustained by operational free cash flows.'
      }
    ],
    breakerContextMetrics: {
      'TB_TINNA_LEVERAGE': 0.85
    },
    itasSignal: {
      symbol: 'TINNARUBR',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 84,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'TINNARUBR',
      coreThesisStatement: 'Pioneer and largest tyre recycler in India converting end-of-life tyres into crumb rubber modifier (CRM) for national highway construction and reclaim rubber for tyre makers.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Highway Bitumen Mandate', description: 'MoRTH mandates crumb rubber modified bitumen in national highway projects.' },
        { pillarId: 'P2', title: 'Global Tire Brand Offtakes', description: 'Long-term raw material supplier to Apollo, MRF, and Bridgestone.' }
      ],
      thesisBreakersDefined: ['TB_TINNA_LEVERAGE']
    }
  },

  // 46. TATAMOTORS
  {
    company: {
      symbol: 'TATAMOTORS',
      companyName: 'Tata Motors Limited',
      bseCode: '500570',
      isin: 'INE155A01022',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Commercial Vehicles, Passenger Cars & Electric Mobility',
      headquarters: 'Mumbai, Maharashtra, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_TATAMOTORS_AR24',
        documentName: 'Tata_Motors_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-22',
        documentHashSha256: 'def0123456789abcdef0123456789abcdef0123456789abcde',
        pageCount: 380,
        filingAuthority: 'BSE / NSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_TAMO_REV_01',
        issuerNseSymbol: 'TATAMOTORS',
        issuerBseCode: '500570',
        documentId: 'DOC_TATAMOTORS_AR24',
        documentHash: 'def0123456789abcdef0123456789abcdef0123456789abcde',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 72,
        pagePrinted: '70',
        quotedText: 'Consolidated revenue for FY24 reached ₹437928 Cr with Jaguar Land Rover record free cash flows.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_TAMO_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 437928,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_TAMO_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹437928 Cr with Jaguar Land Rover record free cash flows.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_TATAMOTORS_01',
        issuerNseSymbol: 'TATAMOTORS',
        issuerBseCode: '500570',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale consolidated automotive revenue past ₹400,000 Cr while achieving net automotive debt free status by FY25.',
        targetMetric: 'revenue_cr',
        baselineValue: 345967,
        expectedValue: 400000,
        expectedOutcome: 'Revenue >= ₹400,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_TAMO_REV_01',
        claimDate: '2023-08-11',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 437928,
        actualOutcomeDescription: 'Delivered ₹437,928 Cr revenue beating guidance by 9.5%.',
        evaluationEvidenceId: 'EV_TAMO_REV_01',
        evaluationDate: '2024-05-10',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-08-11',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_TAMO_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_TATAMOTORS_01',
        issuerNseSymbol: 'TATAMOTORS',
        issuerBseCode: '500570',
        eventDate: '2024-03-04',
        category: 'GOVERNANCE',
        headline: 'Approval for Demerger into Two Distinct Listed Entities',
        description: 'Board of Directors approved demerger of Tata Motors into commercial vehicles (CV) and passenger electric vehicles (PV/JLR).',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_TAMO_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_TAMO_LEVERAGE',
        symbol: 'TATAMOTORS',
        name: 'Auto Net Debt Ceiling',
        type: 'QUANTITATIVE',
        thresholdValue: 2.0,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Auto Net Debt / EBITDA exceeding 2.0x triggers hard veto.',
        rationale: 'JLR free cash flow generation must keep net automotive debt near zero.'
      }
    ],
    breakerContextMetrics: {
      'TB_TAMO_LEVERAGE': 0.35
    },
    itasSignal: {
      symbol: 'TATAMOTORS',
      strategyAgreementCount: 19,
      totalStrategiesEvaluated: 20,
      signalStrength: 95,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'TATAMOTORS',
      coreThesisStatement: 'Massive automotive turnaround story unlocking value via imminent demerger into commercial vehicles leader and high-margin luxury EV innovator (JLR & Tata Passenger EV).',
      investmentPillars: [
        { pillarId: 'P1', title: 'EV Domestic Monopoly', description: 'Over 70% Indian passenger electric vehicle market share (Nexon EV, Punch EV).' },
        { pillarId: 'P2', title: 'JLR Order Backlog', description: 'Defender and Range Rover order bank generating historic operating margins.' }
      ],
      thesisBreakersDefined: ['TB_TAMO_LEVERAGE']
    }
  },

  // 47. MEESHO
  {
    company: {
      symbol: 'MEESHO',
      companyName: 'Fashnear Technologies Private Limited (Meesho)',
      bseCode: 'MEESHO',
      isin: 'INE0MEE01010',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Digital Social E-Commerce & Reseller Platform',
      headquarters: 'Bengaluru, Karnataka, India',
      primaryExchange: 'NSE'
    },
    sources: [
      {
        documentId: 'DOC_MEESHO_FY24',
        documentName: 'Meesho_Statutory_Filings_FY24.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-08-25',
        documentHashSha256: 'ef0123456789abcdef0123456789abcdef0123456789abcdef1',
        pageCount: 140,
        filingAuthority: 'MCA / ROC'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_MEESHO_REV_01',
        issuerNseSymbol: 'MEESHO',
        issuerBseCode: 'MEESHO',
        documentId: 'DOC_MEESHO_FY24',
        documentHash: 'ef0123456789abcdef0123456789abcdef0123456789abcdef1',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 28,
        pagePrinted: '26',
        quotedText: 'Consolidated revenue for FY24 reached ₹7615 Cr with annual transacting users surpassing 140 million.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_MEESHO_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 7615,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_MEESHO_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹7615 Cr with annual transacting users surpassing 140 million.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_MEESHO_01',
        issuerNseSymbol: 'MEESHO',
        issuerBseCode: 'MEESHO',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale e-commerce marketplace revenue past ₹7,000 Cr while sustaining operating cash flow breakeven.',
        targetMetric: 'revenue_cr',
        baselineValue: 5735,
        expectedValue: 7000,
        expectedOutcome: 'Revenue >= ₹7,000 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_MEESHO_REV_01',
        claimDate: '2023-08-15',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 7615,
        actualOutcomeDescription: 'Delivered ₹7,615 Cr revenue turning sustainably operating cash flow positive.',
        evaluationEvidenceId: 'EV_MEESHO_REV_01',
        evaluationDate: '2024-06-20',
        evaluationBasis: 'Statutory Financial Filings ROC',
        publicationDate: '2023-08-15',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_MEESHO_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_MEESHO_01',
        issuerNseSymbol: 'MEESHO',
        issuerBseCode: 'MEESHO',
        eventDate: '2024-05-10',
        category: 'EXCHANGE_DISCLOSURE',
        headline: 'Closing of $275M Pre-IPO Funding Round',
        description: 'Successfully raised $275M growth capital from global institutional investors ahead of domestic IPO.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_MEESHO_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_MEESHO_LEVERAGE',
        symbol: 'MEESHO',
        name: 'Tech Marketplace Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 0.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 0.5x triggers hard veto.',
        rationale: 'E-commerce platform model operates with net cash balances.'
      }
    ],
    breakerContextMetrics: {
      'TB_MEESHO_LEVERAGE': 0.0
    },
    itasSignal: {
      symbol: 'MEESHO',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'MEESHO',
      coreThesisStatement: 'Dominant social commerce and zero-commission e-commerce marketplace capturing Tier-2/3 Indian consumers and unbranded sellers.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Zero Commission Moat', description: 'Advertising and logistics monetization providing low-cost seller acquisition.' },
        { pillarId: 'P2', title: 'Tier-2+ Demographics', description: 'Over 80% order volume originating from non-metro towns.' }
      ],
      thesisBreakersDefined: ['TB_MEESHO_LEVERAGE']
    }
  },

  // 48. FRATELLIVI
  {
    company: {
      symbol: 'FRATELLIVI',
      companyName: 'Fratelli Vineyards Limited',
      bseCode: '539745',
      isin: 'INE082E01010',
      marketCapTier: 'SMALLCAP',
      exchangeBoard: 'MAIN_BOARD',
      industry: 'Premium Wine Viticulture & Agro-Beverage Production',
      headquarters: 'Akluj, Maharashtra, India',
      primaryExchange: 'BSE'
    },
    sources: [
      {
        documentId: 'DOC_FRATELLI_AR24',
        documentName: 'Fratelli_Vineyards_Annual_Report_2024.pdf',
        documentType: 'ANNUAL_REPORT',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        publicationDate: '2024-07-28',
        documentHashSha256: 'f0123456789abcdef0123456789abcdef0123456789abcdef2',
        pageCount: 140,
        filingAuthority: 'BSE'
      }
    ],
    evidenceSpans: [
      {
        evidenceId: 'EV_FRAT_REV_01',
        issuerNseSymbol: 'FRATELLIVI',
        issuerBseCode: '539745',
        documentId: 'DOC_FRATELLI_AR24',
        documentHash: 'f0123456789abcdef0123456789abcdef0123456789abcdef2',
        documentType: 'ANNUAL_REPORT',
        pagePhysical: 28,
        pagePrinted: '26',
        quotedText: 'Consolidated revenue for FY24 reached ₹242 Cr with premium varietal wine consumption surging.',
        verificationStatus: 'VERIFIED_PRIMARY'
      }
    ],
    factsData: [
      {
        factId: 'FACT_FRAT_01',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 242,
        unit: 'INR_CRORE',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        asOfDate: '2024-03-31',
        sourceEvidenceId: 'EV_FRAT_REV_01',
        sourceQuotedText: 'Consolidated revenue for FY24 reached ₹242 Cr with premium varietal wine consumption surging.'
      }
    ],
    claims: [
      {
        claimId: 'CLM_FRATELLI_01',
        issuerNseSymbol: 'FRATELLIVI',
        issuerBseCode: '539745',
        period: 'FY24',
        category: 'GROWTH',
        statement: 'Scale premium bottled wine sales to surpass ₹220 Cr in FY24.',
        targetMetric: 'revenue_cr',
        baselineValue: 198,
        expectedValue: 220,
        expectedOutcome: 'Revenue >= ₹220 Cr',
        expectedTimeframe: 'FY24',
        evidenceId: 'EV_FRAT_REV_01',
        claimDate: '2023-09-01',
        expectedPeriodStart: '2023-04-01',
        expectedPeriodEnd: '2024-03-31',
        status: 'ACHIEVED',
        actualOutcomeMetric: 242,
        actualOutcomeDescription: 'Delivered ₹242 Cr revenue beating target by 10.0%.',
        evaluationEvidenceId: 'EV_FRAT_REV_01',
        evaluationDate: '2024-05-24',
        evaluationBasis: 'BSE Audited Financial Accounts Release',
        publicationDate: '2023-09-01',
        publicationDateType: 'MANAGEMENT_COMMENT',
        targetTemporalSemantics: 'PERIOD',
        factId: 'FACT_FRAT_01'
      }
    ],
    events: [
      {
        eventId: 'EVT_FRATELLI_01',
        issuerNseSymbol: 'FRATELLIVI',
        issuerBseCode: '539745',
        eventDate: '2024-03-22',
        category: 'CAPITAL_ALLOCATION',
        headline: 'Acquisition and Expansion of Estate Vineyards in Maharashtra',
        description: 'Expanded estate viticulture acreage in Solapur and Nashik to meet growing domestic demand for premium varietal wines.',
        sourceTier: 'TIER_2_PRIMARY_CORPORATE',
        sourceType: 'REGULATORY_FILING',
        evidenceId: 'EV_FRAT_REV_01',
        materiality: 'LOW',
        createdAt: '2026-09-16T11:00:00.000Z'
      }
    ],
    breakers: [
      {
        breakerId: 'TB_FRAT_LEVERAGE',
        symbol: 'FRATELLIVI',
        name: 'Beverage Viticulture Debt Limit',
        type: 'QUANTITATIVE',
        thresholdValue: 2.5,
        comparisonOperator: 'GREATER_THAN',
        severity: 'CRITICAL',
        description: 'Debt / Equity ratio exceeding 2.5x triggers hard veto.',
        rationale: 'Vineyard maturation and barrel aging cycles require balanced leverage.'
      }
    ],
    breakerContextMetrics: {
      'TB_FRAT_LEVERAGE': 1.15
    },
    itasSignal: {
      symbol: 'FRATELLIVI',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 82,
      marketRegime: 'BULLISH',
      quantDirective: 'BUY',
      decisionDate: '2024-06-30'
    },
    thesis: {
      symbol: 'FRATELLIVI',
      coreThesisStatement: 'Second largest wine brand in India capitalizing on rapid premiumization of Indian alcoholic beverage consumption and wine tourism.',
      investmentPillars: [
        { pillarId: 'P1', title: 'Premium Varietal Brand', description: 'Fratelli Sette and J\'NOON commanding premium price points.' },
        { pillarId: 'P2', title: 'Vineyard Terroir Moat', description: 'Over 240 acres of estate-owned vineyards in Akluj, Maharashtra.' }
      ],
      thesisBreakersDefined: ['TB_FRAT_LEVERAGE']
    }
  }
];
