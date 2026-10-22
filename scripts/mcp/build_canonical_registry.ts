/**
 * WealthOS Universal MCP — Canonical Registry Builder
 * Generates src/mcp/registry/canonicalRegistry.json
 * Reconciles 100% of capabilities, tools, schemas, and 3 distinct status concepts
 */

import fs from 'fs';
import path from 'path';

export interface CanonicalToolEntry {
  toolId: string;
  name: string;
  plane: 'PRODUCT' | 'DEVELOPMENT' | 'BOTH';
  domain: string;
  description: string;
  productionService: string;
  productionMethod: string;
  readOnly: boolean;
  sideEffects: string[];
  requiredPermission: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  capabilityIds: string[];
  productStatus: 'IMPLEMENTED' | 'PARTIAL' | 'LEGACY' | 'UNUSED' | 'NOT_FOUND';
  mcpStatus: 'NOT_STARTED' | 'IMPLEMENTED' | 'PARTIAL' | 'BLOCKED' | 'NOT_EXPOSED';
  verificationStatus: 'NOT_TESTED' | 'STATIC_ONLY' | 'PRODUCTION_PATH_VERIFIED' | 'INDEPENDENTLY_VERIFIED' | 'FAILED';
}

const CANONICAL_TOOLS: CanonicalToolEntry[] = [
  // ── PRODUCT PLANE: SECURITY MASTER (3 Tools) ───────────────────────────────
  {
    toolId: 'TOOL-SEC-001',
    name: 'search_securities',
    plane: 'PRODUCT',
    domain: 'SECURITY_MASTER',
    description: 'Search Indian equity securities across the master ticker database by symbol, company name, or ISIN.',
    productionService: 'MasterTickerService',
    productionMethod: 'searchTickers / resolveTicker',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (symbol, company name, or ISIN)' },
        limit: { type: 'number', description: 'Max results to return (default 20, max 100)' }
      },
      required: ['query']
    },
    outputSchema: {
      type: 'array',
      items: { type: 'object' }
    },
    capabilityIds: ['CAP-SEC-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-SEC-002',
    name: 'resolve_security',
    plane: 'PRODUCT',
    domain: 'SECURITY_MASTER',
    description: 'Resolve exact canonical security identity by symbol or ISIN to prevent ticker collisions (e.g. STYL vs STYLAMIND).',
    productionService: 'MasterTickerService',
    productionMethod: 'resolveCanonicalIdentity',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbolOrIsin: { type: 'string', description: 'Ticker symbol or ISIN to resolve' }
      },
      required: ['symbolOrIsin']
    },
    outputSchema: {
      type: 'object',
      properties: {
        canonicalSymbol: { type: 'string' },
        isin: { type: 'string' },
        companyName: { type: 'string' },
        status: { type: 'string' }
      }
    },
    capabilityIds: ['CAP-SEC-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-SEC-003',
    name: 'get_security_profile',
    plane: 'PRODUCT',
    domain: 'SECURITY_MASTER',
    description: 'Get comprehensive security profile, listing platform (SME vs Mainboard), and asset classification.',
    productionService: 'AssetScripMappingService / ListingPlatformClassifier',
    productionMethod: 'getMappings / classifyPlatform',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'NSE/BSE ticker symbol' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-SEC-003'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: PORTFOLIO MANAGEMENT (7 Tools) ───────────────────────────
  {
    toolId: 'TOOL-PORT-001',
    name: 'list_portfolios',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'List all managed family/investor portfolios with currency, broker, and active status.',
    productionService: 'database.ts',
    productionMethod: 'SELECT DISTINCT portfolio FROM Holdings / Portfolios',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-PORT-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-002',
    name: 'get_portfolio_summary',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Get aggregated portfolio summary (AUM, current value, total cost, unrealized P&L).',
    productionService: 'database.ts',
    productionMethod: 'getPortfolioSummary',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name/ID filter' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-PORT-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-003',
    name: 'get_portfolio_holdings',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Get active portfolio holdings with quantities, average cost, LTP, current value, and unrealized gains.',
    productionService: 'fifoEngine.ts / database.ts',
    productionMethod: 'calculateHoldingsWithFIFO / getHoldings',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name filter' },
        limit: { type: 'number', description: 'Max holdings to return (default 50, max 200)' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-PORT-003'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-004',
    name: 'get_portfolio_allocation',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Get portfolio asset class and sector allocation breakdown.',
    productionService: 'LookthroughService / AllocationEngine',
    productionMethod: 'computeEffectiveHoldings',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-PORT-004'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-005',
    name: 'get_portfolio_history',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Get historical portfolio snapshot and value checkpoints.',
    productionService: 'database.ts',
    productionMethod: 'getGrowthHistory',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-PORT-005'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-006',
    name: 'add_transaction',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Add a new investment transaction with validation, deduplication, and FIFO ledger update.',
    productionService: 'database.ts / TransactionDeduplicationService',
    productionMethod: 'addTransactionWithDedup',
    readOnly: false,
    sideEffects: ['Appends row to Transactions table in portfolio.db', 'Triggers FIFO lot recalculation'],
    requiredPermission: 'product.write',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID or Name' },
        symbol: { type: 'string', description: 'NSE/BSE Ticker symbol' },
        type: { type: 'string', enum: ['BUY', 'SELL', 'DIVIDEND'], description: 'Transaction type' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD' },
        quantity: { type: 'number', description: 'Number of units' },
        price: { type: 'number', description: 'Execution price per unit' },
        charges: { type: 'number', description: 'Brokerage and statutory charges' },
        isin: { type: 'string', description: 'Optional ISIN' }
      },
      required: ['portfolioId', 'symbol', 'type', 'date', 'quantity', 'price']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-PORT-006'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-PORT-007',
    name: 'get_portfolio_transactions',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_MANAGEMENT',
    description: 'Get paginated portfolio transactions with least-data responses.',
    productionService: 'database.ts',
    productionMethod: 'getTransactions',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name filter' },
        symbol: { type: 'string', description: 'Optional symbol filter' },
        limit: { type: 'number', description: 'Max transactions to return (default 50, max 200)' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-PORT-007'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: PORTFOLIO QUERY (1 Tool) ─────────────────────────────────
  {
    toolId: 'TOOL-COPILOT-001',
    name: 'query_portfolio',
    plane: 'PRODUCT',
    domain: 'PORTFOLIO_QUERY',
    description: 'Multi-attribute structured query of portfolio holdings, risks, fundamentals, and valuations.',
    productionService: 'PortfolioIntelligenceWatchlist',
    productionMethod: 'queryHoldingsWithMetadata',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID filter' },
        minGainPct: { type: 'number', description: 'Minimum unrealized gain %' },
        maxGainPct: { type: 'number', description: 'Maximum unrealized gain %' },
        deterioratingOnly: { type: 'boolean', description: 'Filter only holdings with deteriorating fundamental health' },
        limit: { type: 'number', description: 'Max results (default 50)' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-COPILOT-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: XIRR & RETURNS (3 Tools) ─────────────────────────────────
  {
    toolId: 'TOOL-XIRR-001',
    name: 'get_portfolio_xirr',
    plane: 'PRODUCT',
    domain: 'XIRR_RETURNS',
    description: 'Calculate exact portfolio XIRR using true dated cashflows (ACTUAL/365 Newton-Raphson).',
    productionService: 'xirr.ts',
    productionMethod: 'calculateXIRR',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-XIRR-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'INDEPENDENTLY_VERIFIED'
  },
  {
    toolId: 'TOOL-XIRR-002',
    name: 'get_security_xirr',
    plane: 'PRODUCT',
    domain: 'XIRR_RETURNS',
    description: 'Calculate per-security XIRR for a specific stock/scrip.',
    productionService: 'xirr.ts',
    productionMethod: 'calculateSecurityXIRR',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-XIRR-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'INDEPENDENTLY_VERIFIED'
  },
  {
    toolId: 'TOOL-XIRR-003',
    name: 'get_dual_currency_xirr',
    plane: 'PRODUCT',
    domain: 'XIRR_RETURNS',
    description: 'Calculate post-tax and dual-currency XIRR (INR vs USD/AED/GBP) for NRI accounts.',
    productionService: 'PostTaxXirrService / NriWealthService',
    productionMethod: 'computeDualCurrencyXirr',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID' },
        targetCurrency: { type: 'string', enum: ['USD', 'AED', 'GBP', 'EUR'], description: 'Repatriation currency' }
      },
      required: ['targetCurrency']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-XIRR-003'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: TAX & CAPITAL GAINS (2 Tools) ────────────────────────────
  {
    toolId: 'TOOL-TAX-001',
    name: 'get_tax_summary',
    plane: 'PRODUCT',
    domain: 'TAX_FIFO',
    description: 'Get capital gains tax summary (LTCG vs STCG). Note: reflects existing WealthOS rules; currency not independently verified.',
    productionService: 'fifoEngine.ts',
    productionMethod: 'calculateCapitalGainsTax',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        financialYear: { type: 'string', description: 'FY in YYYY-YYYY format (e.g. 2025-2026)' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-TAX-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-TAX-002',
    name: 'get_tax_harvesting_opportunities',
    plane: 'PRODUCT',
    domain: 'TAX_FIFO',
    description: 'Identify tax loss harvesting opportunities across existing holdings.',
    productionService: 'TaxHarvestingEngine',
    productionMethod: 'evaluateHarvestingOpportunities',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' },
        financialYear: { type: 'string', description: 'Financial year' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-TAX-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: REPORTING (2 Tools) ──────────────────────────────────────
  {
    toolId: 'TOOL-REP-001',
    name: 'list_reports',
    plane: 'PRODUCT',
    domain: 'REPORTING',
    description: 'List all available commercial and institutional reports.',
    productionService: 'ReportsService',
    productionMethod: 'listAvailableReports',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-REP-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-REP-002',
    name: 'generate_report',
    plane: 'PRODUCT',
    domain: 'REPORTING',
    description: 'Generate commercial Excel or PDF institutional report into reports archive.',
    productionService: 'CommercialExcelReportService',
    productionMethod: 'generateCommercialReport',
    readOnly: false,
    sideEffects: ['Writes report file into reports/ directory'],
    requiredPermission: 'product.write',
    inputSchema: {
      type: 'object',
      properties: {
        reportType: { type: 'string', description: 'Report template ID' },
        parameters: { type: 'object', description: 'Report parameters (e.g. portfolioId, symbol)' }
      },
      required: ['reportType']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REP-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: COMPANY INTELLIGENCE (4 Tools) ───────────────────────────
  {
    toolId: 'TOOL-INTEL-001',
    name: 'get_company_intelligence',
    plane: 'PRODUCT',
    domain: 'COMPANY_INTELLIGENCE',
    description: 'Get full multi-module company intelligence (business, fundamentals, management, valuation, catalysts, risks).',
    productionService: 'CompanyIntelligenceOrchestrator',
    productionMethod: 'getCompanyIntelligence',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'NSE/BSE ticker symbol' },
        modules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Modules: FUNDAMENTAL, MANAGEMENT, VALUATION, QGLP, TECHNICAL, CATALYSTS, RISKS'
        }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-INTEL-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-INTEL-002',
    name: 'get_financial_statements',
    plane: 'PRODUCT',
    domain: 'COMPANY_INTELLIGENCE',
    description: 'Get canonical point-in-time financial statement metric history from CanonicalFacts.',
    productionService: 'CanonicalFactIngestionService',
    productionMethod: 'getFinancialHistory',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        limit: { type: 'number', description: 'Max canonical facts (default 50)' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-INTEL-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-INTEL-003',
    name: 'get_management_analysis',
    plane: 'PRODUCT',
    domain: 'COMPANY_INTELLIGENCE',
    description: 'Get management Walk-the-Talk analysis, commitments, track record and adverse evidence.',
    productionService: 'ClaimLedgerService',
    productionMethod: 'getCommitmentsAndClaims',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-INTEL-003'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-INTEL-004',
    name: 'get_valuation_analysis',
    plane: 'PRODUCT',
    domain: 'COMPANY_INTELLIGENCE',
    description: 'Get fact-based valuation analysis, reverse DCF, PE vs historical bands, and fair value.',
    productionService: 'UnifiedValuationService / NormalizedReverseDCFEngine',
    productionMethod: 'computeValuation',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-INTEL-004'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: QGLP (1 Tool) ────────────────────────────────────────────
  {
    toolId: 'TOOL-QGLP-001',
    name: 'get_qglp_analysis',
    plane: 'PRODUCT',
    domain: 'QGLP',
    description: 'Calculate deterministic Motilal-Oswal style QGLP score (Quality, Growth, Longevity, Price). Fails closed on missing data.',
    productionService: 'QglpScoringService',
    productionMethod: 'calculateQglp',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-QGLP-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: OPPORTUNITY ENGINE (2 Tools) ─────────────────────────────
  {
    toolId: 'TOOL-OPP-001',
    name: 'run_opportunity_discovery',
    plane: 'PRODUCT',
    domain: 'OPPORTUNITY_ENGINE',
    description: 'Run consolidated multi-engine opportunity discovery (fundamental, technical, institutional flow).',
    productionService: 'ConsolidatedOpportunityEngine',
    productionMethod: 'runScan',
    readOnly: false,
    sideEffects: ['Writes scan results to reports/readiness/'],
    requiredPermission: 'product.write',
    inputSchema: {
      type: 'object',
      properties: {
        sleeves: { type: 'array', items: { type: 'string' }, description: 'Sleeves: fundamental, technical, flow' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-OPP-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-OPP-002',
    name: 'get_opportunity_candidates',
    plane: 'PRODUCT',
    domain: 'OPPORTUNITY_ENGINE',
    description: 'Get current high-conviction opportunity candidates with sleeve allocation.',
    productionService: 'SevenStrategiesCandidatesService',
    productionMethod: 'getCandidates',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Optional strategy ID filter' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-OPP-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: FUNDAMENTAL DISCOVERY (1 Tool) ───────────────────────────
  {
    toolId: 'TOOL-FND-001',
    name: 'screen_fundamentals',
    plane: 'PRODUCT',
    domain: 'FUNDAMENTAL_DISCOVERY',
    description: 'Screen companies by fundamental moat, growth, leverage, and earnings quality.',
    productionService: 'FundamentalMoatQualityScreener',
    productionMethod: 'evaluateUniverse',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        minRoce: { type: 'number', description: 'Min ROCE %' },
        minRoe: { type: 'number', description: 'Min ROE %' },
        maxDebtEquity: { type: 'number', description: 'Max Debt to Equity ratio' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-FND-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: TECHNICAL ANALYSIS (2 Tools) ─────────────────────────────
  {
    toolId: 'TOOL-TECH-001',
    name: 'get_adjusted_ohlcv',
    plane: 'PRODUCT',
    domain: 'TECHNICAL_ANALYSIS',
    description: 'Get adjusted daily OHLCV candlestick bars from DuckDB Parquet store.',
    productionService: 'DuckDbAdjustedOhlcvService',
    productionMethod: 'invokeForSymbol',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        limit: { type: 'number', description: 'Max candle bars (default 365)' },
        from: { type: 'string', description: 'From date (YYYY-MM-DD)' },
        to: { type: 'string', description: 'To date (YYYY-MM-DD)' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-TECH-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-TECH-002',
    name: 'get_technical_indicators',
    plane: 'PRODUCT',
    domain: 'TECHNICAL_ANALYSIS',
    description: 'Compute technical indicators (SMA, EMA, RSI, ATR, Support/Resistance, Trend regime).',
    productionService: 'TechnicalAnalysisEngine',
    productionMethod: 'computeIndicators',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        indicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'Indicators: SMA20, SMA50, SMA200, RSI14, ATR14'
        }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-TECH-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: TECHNICAL STRATEGIES (2 Tools) ───────────────────────────
  {
    toolId: 'TOOL-STRAT-001',
    name: 'evaluate_strategies',
    plane: 'PRODUCT',
    domain: 'TECHNICAL_STRATEGIES',
    description: 'Evaluate canonical technical strategies (S1–S10) and specialized variants (S1A, S1B, S2A, S3A, S4B, S5A) for a symbol.',
    productionService: 'PureTechnicalStrategiesEngine / StrategyParameterConfig',
    productionMethod: 'evaluateSymbol / runEvaluation',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        strategies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Strategies to evaluate: S1, S2, ..., S10, S1A, S1B, S2A, S3A, S4B, S5A'
        }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-STRAT-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-STRAT-002',
    name: 'get_strategy_scan_results',
    plane: 'PRODUCT',
    domain: 'TECHNICAL_STRATEGIES',
    description: 'Get latest pre-calculated strategy candidates across the full Indian equity universe.',
    productionService: 'SevenStrategiesCandidatesService',
    productionMethod: 'getStrategyScanCandidates',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Strategy ID (e.g. S1A, S1B, S2A, S3A, S4B, S5A)' }
      },
      required: ['strategyId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-STRAT-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: SECTOR MOMENTUM (1 Tool) ─────────────────────────────────
  {
    toolId: 'TOOL-SEC-MOM-001',
    name: 'get_sector_momentum',
    plane: 'PRODUCT',
    domain: 'SECTOR_MOMENTUM',
    description: 'Get sector momentum rankings, sector relative strength, and capital flow distribution.',
    productionService: 'SectorMomentumService / MacroRegimeClassifierService',
    productionMethod: 'getRankings / getSectorFlow',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        lookbackDays: { type: 'number', description: 'Lookback window in days (default 30)' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-SEC-MOM-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: MARKET UNIVERSE (1 Tool) ─────────────────────────────────
  {
    toolId: 'TOOL-UNIV-001',
    name: 'get_universe_coverage',
    plane: 'PRODUCT',
    domain: 'MARKET_UNIVERSE',
    description: 'Get Indian equity universe summary, active counts, and OHLCV coverage audit.',
    productionService: 'MasterIndianUniverseService',
    productionMethod: 'getUniverseStats',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-UNIV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: DATA INGESTION & FRESHNESS (1 Tool) ──────────────────────
  {
    toolId: 'TOOL-DATA-001',
    name: 'get_data_freshness_summary',
    plane: 'PRODUCT',
    domain: 'DATA_INGESTION',
    description: 'Inspect data freshness, latest update timestamps, and missing data coverage.',
    productionService: 'UniversalDataIntegrityGate',
    productionMethod: 'checkDataQuality',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional symbol' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DATA-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: EVIDENCE & FERE (1 Tool) ─────────────────────────────────
  {
    toolId: 'TOOL-EV-001',
    name: 'get_fact_provenance',
    plane: 'PRODUCT',
    domain: 'EVIDENCE_FERE',
    description: 'Trace exact provenance, source filing, citation, and verification status for any fact or claim.',
    productionService: 'FereEvidenceService / IndependentEvidenceVerifier',
    productionMethod: 'getFactEvidence',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        factId: { type: 'string', description: 'Canonical fact ID' }
      },
      required: ['factId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-EV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── PRODUCT PLANE: COMPOSITE ORCHESTRATION (2 Tools) ────────────────────────
  {
    toolId: 'TOOL-COMP-001',
    name: 'analyze_investment_candidate',
    plane: 'PRODUCT',
    domain: 'COMPOSITE_TOOLS',
    description: 'Orchestrate complete end-to-end investment research candidate dossier across all modules.',
    productionService: 'ScripIntelligenceDossierService',
    productionMethod: 'buildComprehensiveCandidateDossier',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-COMP-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-COMP-002',
    name: 'analyze_portfolio',
    plane: 'PRODUCT',
    domain: 'COMPOSITE_TOOLS',
    description: 'Orchestrate portfolio-wide intelligence review across holdings (fundamentals, risks, valuations, strategy signals).',
    productionService: 'fifoEngine.ts / ScripIntelligenceDossierService',
    productionMethod: 'buildPortfolioIntelligenceReview',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'product.read',
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-COMP-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },

  // ── SHARED / BOTH PLANES: REQUIREMENTS & INDEPENDENT ORACLES (4 Tools) ─────
  {
    toolId: 'TOOL-REQ-001',
    name: 'get_requirements',
    plane: 'BOTH',
    domain: 'REQUIREMENTS',
    description: 'Inspect canonical product and technical requirements with strict provenance tagging.',
    productionService: 'RequirementRegistry',
    productionMethod: 'listRequirements',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'review.read',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Filter by requirement domain' }
      }
    },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-REV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-VERIF-001',
    name: 'verify_xirr',
    plane: 'BOTH',
    domain: 'INDEPENDENT_VERIFICATION',
    description: 'Independently recompute XIRR from raw dated cashflows using clean-room Newton-Raphson/Bisection root-finder.',
    productionService: 'xirrVerifier.ts (Clean-room Oracle)',
    productionMethod: 'independentVerifyXirr',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'review.verify',
    inputSchema: {
      type: 'object',
      properties: {
        cashflows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              amount: { type: 'number' }
            },
            required: ['date', 'amount']
          }
        },
        productionXirr: { type: 'number' },
        tolerance: { type: 'number' }
      },
      required: ['cashflows', 'productionXirr']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-VERIF-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'INDEPENDENTLY_VERIFIED'
  },
  {
    toolId: 'TOOL-VERIF-002',
    name: 'verify_financial_metric',
    plane: 'BOTH',
    domain: 'INDEPENDENT_VERIFICATION',
    description: 'Independently recompute financial ratios (CAGR, Margins, ROE, ROCE, CFO/PAT) from raw facts.',
    productionService: 'financialVerifier.ts (Clean-room Oracle)',
    productionMethod: 'verifyFinancialMetricOracle',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'review.verify',
    inputSchema: {
      type: 'object',
      properties: {
        metricName: { type: 'string' },
        rawInputs: { type: 'object' },
        productionResult: { type: 'number' },
        tolerance: { type: 'number' }
      },
      required: ['metricName', 'rawInputs', 'productionResult']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-VERIF-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'INDEPENDENTLY_VERIFIED'
  },
  {
    toolId: 'TOOL-VERIF-003',
    name: 'verify_technical_indicator',
    plane: 'BOTH',
    domain: 'INDEPENDENT_VERIFICATION',
    description: 'Independently compute technical indicators (SMA, EMA, RSI) directly from raw bar close prices.',
    productionService: 'technicalVerifier.ts (Clean-room Oracle)',
    productionMethod: 'verifyTechnicalIndicatorOracle',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'review.verify',
    inputSchema: {
      type: 'object',
      properties: {
        indicatorName: { type: 'string', enum: ['SMA', 'EMA', 'RSI'] },
        rawBars: { type: 'array' },
        productionResult: { type: 'number' }
      },
      required: ['indicatorName', 'rawBars', 'productionResult']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-VERIF-003'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'INDEPENDENTLY_VERIFIED'
  },

  // ── DEVELOPMENT / REVIEW PLANE (14 Dedicated Tools) ─────────────────────────
  {
    toolId: 'TOOL-DEV-001',
    name: 'get_repository_status',
    plane: 'DEVELOPMENT',
    domain: 'REPOSITORY_REVIEW',
    description: 'Inspect repository git status, current branch, SHA, modified production files vs test files.',
    productionService: 'RepositoryAdapter',
    productionMethod: 'getStatus',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-002',
    name: 'get_diff',
    plane: 'DEVELOPMENT',
    domain: 'REPOSITORY_REVIEW',
    description: 'Get git diff of repository or specific file with automatic secret redaction.',
    productionService: 'RepositoryAdapter',
    productionMethod: 'getFileDiff',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Optional relative path to inspect' }
      }
    },
    outputSchema: { type: 'string' },
    capabilityIds: ['CAP-REV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-003',
    name: 'inspect_source',
    plane: 'DEVELOPMENT',
    domain: 'REPOSITORY_REVIEW',
    description: 'Sandboxed search and file retrieval for source code (explicitly blocks .env, credentials, secrets, databases, parquet).',
    productionService: 'RepositoryAdapter',
    productionMethod: 'searchSource / inspectSourceFile',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'get_file'], description: 'Search source or get file content' },
        query: { type: 'string', description: 'Search term for action=search' },
        filePath: { type: 'string', description: 'File path for action=get_file' },
        startLine: { type: 'number', description: 'Optional start line' },
        endLine: { type: 'number', description: 'Optional end line' }
      },
      required: ['action']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-004',
    name: 'run_tests',
    plane: 'DEVELOPMENT',
    domain: 'TEST_EXECUTION',
    description: 'Execute an allowlisted test suite (unit, integration, strategies, xirr, verification) with safe filters.',
    productionService: 'TestingAdapter',
    productionMethod: 'runTests',
    readOnly: false,
    sideEffects: ['Executes test runner subprocess'],
    requiredPermission: 'dev.test',
    inputSchema: {
      type: 'object',
      properties: {
        suiteId: { type: 'string', description: 'Suite ID: unit, integration, strategies, xirr, acceptance, verification' },
        filter: { type: 'string', description: 'Safe test name filter' }
      },
      required: ['suiteId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-005',
    name: 'run_build_and_typecheck',
    plane: 'DEVELOPMENT',
    domain: 'BUILD_TYPECHECK',
    description: 'Run non-shell build and typecheck commands (npx tsc --noEmit, npm run build).',
    productionService: 'RepositoryAdapter',
    productionMethod: 'runTypecheck / runBuild',
    readOnly: false,
    sideEffects: ['Compiles TypeScript and Vite assets'],
    requiredPermission: 'dev.build',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['typecheck', 'build', 'both'], description: 'Mode to execute' }
      },
      required: ['mode']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-006',
    name: 'get_system_health',
    plane: 'DEVELOPMENT',
    domain: 'RUNTIME_HEALTH',
    description: 'Inspect Node process memory, uptime, and dev server status.',
    productionService: 'RepositoryAdapter',
    productionMethod: 'getSystemHealth',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-007',
    name: 'run_browser_journey',
    plane: 'DEVELOPMENT',
    domain: 'BROWSER_VERIFICATION',
    description: 'Execute controlled headless browser journey against localhost:3000 routes and check for errors.',
    productionService: 'RepositoryAdapter',
    productionMethod: 'runBrowserJourney',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        journey: { type: 'string', enum: ['portfolio', 'intelligence', 'opportunity', 'overview'], description: 'Journey to test' }
      }
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-REV-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-008',
    name: 'create_development_session',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Create a tracked development session (DEV-*) capturing baseline branch, commit, objective, and constraints.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'createSession',
    readOnly: false,
    sideEffects: ['Writes session record to scratch/mcp_development_sessions.json'],
    requiredPermission: 'dev.session',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: 'Developer task objective' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Task constraints' }
      },
      required: ['objective']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-009',
    name: 'get_development_session',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Inspect development session state, modified files, diff summary, and test integrity guard flags.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'getSession',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID' }
      },
      required: ['sessionId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-010',
    name: 'list_development_sessions',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'List all recorded development sessions with their status and repair cycle counts.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'listSessions',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'array' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-011',
    name: 'submit_remediation_request',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Submit targeted structured remediation request to developer bot (max 3 cycles).',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'submitRemediation',
    readOnly: false,
    sideEffects: ['Advances repair cycle', 'Updates session status to REMEDIATION_REQUIRED'],
    requiredPermission: 'dev.remediate',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        observedFailure: { type: 'string' },
        severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        allowedScope: { type: 'array', items: { type: 'string' } },
        forbiddenChanges: { type: 'array', items: { type: 'string' } },
        acceptanceTests: { type: 'array', items: { type: 'string' } }
      },
      required: ['sessionId', 'observedFailure', 'severity', 'allowedScope', 'forbiddenChanges', 'acceptanceTests']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-012',
    name: 'create_development_task_package',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Create a structured task handoff package for the user to paste into Antigravity IDE.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'createDevelopmentTaskPackage',
    readOnly: false,
    sideEffects: ['Transitions session status to DEVELOPER_WORKING'],
    requiredPermission: 'dev.session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      },
      required: ['sessionId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-013',
    name: 'resume_development_session',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Resume a session after Antigravity completes work, detect repository changes, and begin review.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'resumeDevelopmentSession',
    readOnly: false,
    sideEffects: ['Transitions session status to REVIEWING'],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' }
      },
      required: ['sessionId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-014',
    name: 'cancel_remediation',
    plane: 'DEVELOPMENT',
    domain: 'DEVELOPER_LOOP',
    description: 'Cancel an active remediation request and mark session as CANCELLED.',
    productionService: 'DeveloperAgentAdapter',
    productionMethod: 'cancelRemediation',
    readOnly: false,
    sideEffects: ['Transitions session status to CANCELLED'],
    requiredPermission: 'dev.session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['sessionId', 'reason']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  // ── DEVELOPMENT PLANE: FUNDAMENTAL CALIBRATION (6 Tools) ─────────────────
  {
    toolId: 'TOOL-DEV-015',
    name: 'get_fundamental_review_inputs',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Generates structured review input package (facts, derived metrics, interpretations, evidence, missingness) for an Indian equity.',
    productionService: 'FundamentalReviewPackageBuilder',
    productionMethod: 'buildReviewPackage',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        asOfDate: { type: 'string' }
      },
      required: ['symbol']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-INTEL-001', 'CAP-INTEL-002'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-016',
    name: 'create_fundamental_review_run',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Initializes and freezes a cohort for a fundamental calibration review run.',
    productionService: 'FundamentalReviewEngine',
    productionMethod: 'createReviewRun',
    readOnly: false,
    sideEffects: ['Persists new review run record'],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phase: { type: 'string', enum: ['PILOT', 'CALIBRATION', 'FULL'] },
        cohort: { type: 'array', items: { type: 'object' } }
      },
      required: ['name', 'cohort']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-017',
    name: 'record_fundamental_review',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Records reviewed interpretation claims and updates outcome and issue taxonomy distributions.',
    productionService: 'FundamentalReviewEngine',
    productionMethod: 'recordReviews',
    readOnly: false,
    sideEffects: ['Updates reviewed claims and cluster distributions'],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        reviews: { type: 'array' }
      },
      required: ['runId', 'reviews']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-018',
    name: 'get_fundamental_review_run',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Retrieves complete metadata, cohort, and claim summary for a review run.',
    productionService: 'FundamentalReviewEngine',
    productionMethod: 'getReviewRun',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' }
      },
      required: ['runId']
    },
    outputSchema: { type: 'object' },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-019',
    name: 'get_fundamental_review_findings',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Retrieves claims evaluated in a review run, with optional filtering for questioned/unsupported items.',
    productionService: 'FundamentalReviewEngine',
    productionMethod: 'getReviewFindings',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        filter: { type: 'string', enum: ['ALL', 'QUESTIONED_OR_UNSUPPORTED'] }
      },
      required: ['runId']
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  },
  {
    toolId: 'TOOL-DEV-020',
    name: 'get_fundamental_review_clusters',
    plane: 'DEVELOPMENT',
    domain: 'FUNDAMENTAL_CALIBRATION',
    description: 'Retrieves systemic defect clusters grouped by root cause for developer remediation.',
    productionService: 'FundamentalReviewEngine',
    productionMethod: 'generateSystemicClusters',
    readOnly: true,
    sideEffects: [],
    requiredPermission: 'dev.review',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' }
      },
      required: ['runId']
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
    capabilityIds: ['CAP-DEV-001'],
    productStatus: 'IMPLEMENTED',
    mcpStatus: 'IMPLEMENTED',
    verificationStatus: 'PRODUCTION_PATH_VERIFIED'
  }
];

// Write canonical JSON registry
const outPath = path.join(process.cwd(), 'src', 'mcp', 'registry', 'canonicalRegistry.json');
fs.writeFileSync(outPath, JSON.stringify(CANONICAL_TOOLS, null, 2));

console.log(`Successfully generated canonical registry with ${CANONICAL_TOOLS.length} tools.`);
console.log(`- Product Tools: ${CANONICAL_TOOLS.filter(t => t.plane === 'PRODUCT').length}`);
console.log(`- Shared / Both: ${CANONICAL_TOOLS.filter(t => t.plane === 'BOTH').length}`);
console.log(`- Dev Tools: ${CANONICAL_TOOLS.filter(t => t.plane === 'DEVELOPMENT').length}`);
