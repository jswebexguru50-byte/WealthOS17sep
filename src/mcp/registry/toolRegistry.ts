/**
 * WealthOS Universal MCP — Tool Registry
 * Master Developer Specification — Section E, F to AC
 */

import { WealthOSProductionAdapter } from '../adapters/wealthosAdapter.js';
import { RepositoryAdapter } from '../adapters/repositoryAdapter.js';
import { TestingAdapter } from '../adapters/testingAdapter.js';
import { DeveloperAgentAdapter } from '../adapters/developerAgentAdapter.js';
import { RequirementRegistry } from './requirementRegistry.js';
import { verifyXirrOracle } from '../verification/xirrVerifier.js';
import { verifyFinancialMetricOracle } from '../verification/financialVerifier.js';
import { verifyTechnicalIndicatorOracle } from '../verification/technicalVerifier.js';
import { FundamentalCalibrationAdapter } from '../adapters/fundamentalCalibrationAdapter.js';
import { SevenStrategiesCandidatesService } from '../../server/services/SevenStrategiesCandidatesService.js';
import { createEnvelope, McpResponseEnvelope, McpError, McpErrorCode } from '../types.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<McpResponseEnvelope<any>>;
}

export const TOOLS: McpToolDefinition[] = [
  // ── DOMAIN 1: SECURITY / INSTRUMENT MASTER ──────────────────────────────────
  {
    name: 'search_securities',
    description: 'Search Indian equity securities across the master ticker database by symbol, company name, or ISIN.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (symbol, company name, or ISIN)' },
        limit: { type: 'number', description: 'Max results to return (default 20, max 100)' }
      },
      required: ['query']
    },
    handler: async (args) => {
      const results = await WealthOSProductionAdapter.searchSecurities(args.query, args.limit || 20);
      return createEnvelope(results, { meta: { count: results.length } });
    }
  },
  {
    name: 'resolve_security',
    description: 'Resolve exact canonical security identity by symbol or ISIN to prevent ticker collisions (e.g. STYL vs STYLAMIND).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbolOrIsin: { type: 'string', description: 'Ticker symbol or ISIN to resolve' }
      },
      required: ['symbolOrIsin']
    },
    handler: async (args) => {
      const result = await WealthOSProductionAdapter.resolveSecurity(args.symbolOrIsin);
      if (!result) {
        return createEnvelope(null, {
          status: 'MISSING',
          warnings: [`Security '${args.symbolOrIsin}' not found in canonical master_tickers`]
        });
      }
      return createEnvelope(result);
    }
  },
  {
    name: 'get_security_profile',
    description: 'Get comprehensive security profile, listing platform (SME vs Mainboard), and asset classification.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'NSE/BSE ticker symbol' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const profile = await WealthOSProductionAdapter.getSecurityProfile(args.symbol);
      if (!profile) {
        return createEnvelope(null, { status: 'MISSING', warnings: [`Security '${args.symbol}' profile not found`] });
      }
      return createEnvelope(profile);
    }
  },

  // ── DOMAIN 2: PORTFOLIO MANAGEMENT ──────────────────────────────────────────
  {
    name: 'list_portfolios',
    description: 'List all active investor and family office portfolios stored in WealthOS.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const portfolios = await WealthOSProductionAdapter.listPortfolios();
      return createEnvelope(portfolios, { meta: { count: portfolios.length } });
    }
  },
  {
    name: 'get_portfolio_summary',
    description: 'Get aggregated valuation, total invested cost, unrealized P&L, and return percentage for portfolios.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Specific portfolio ID (optional; consolidates all if omitted)' }
      }
    },
    handler: async (args) => {
      const summary = await WealthOSProductionAdapter.getPortfolioSummary(args.portfolioId);
      return createEnvelope(summary);
    }
  },
  {
    name: 'get_portfolio_holdings',
    description: 'Get detailed holdings with quantities, purchase cost, current market price, value, and weight.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Specific portfolio ID' },
        limit: { type: 'number', description: 'Max holdings to return (default 100)' }
      }
    },
    handler: async (args) => {
      const holdings = await WealthOSProductionAdapter.getPortfolioHoldings(args.portfolioId, args.limit || 100);
      return createEnvelope(holdings, { meta: { count: holdings.length } });
    }
  },
  {
    name: 'get_portfolio_transactions',
    description: 'Retrieve raw buy, sell, and dividend transactions with date, price, and broker metadata.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID filter' },
        symbol: { type: 'string', description: 'Filter by equity symbol' },
        limit: { type: 'number', description: 'Max transactions to return (default 50)' }
      }
    },
    handler: async (args) => {
      const txs = await WealthOSProductionAdapter.getPortfolioTransactions(args.portfolioId, args.symbol, args.limit || 50);
      return createEnvelope(txs, { meta: { count: txs.length } });
    }
  },
  {
    name: 'add_transaction',
    description: 'Add a new investment transaction with validation, deduplication, and FIFO lot updates.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID' },
        symbol: { type: 'string', description: 'NSE/BSE ticker symbol' },
        type: { type: 'string', enum: ['BUY', 'SELL', 'DIVIDEND'], description: 'Transaction type' },
        date: { type: 'string', description: 'Execution date (YYYY-MM-DD)' },
        quantity: { type: 'number', description: 'Shares quantity' },
        price: { type: 'number', description: 'Execution price per share' },
        charges: { type: 'number', description: 'Brokerage & statutory charges (STT, stamp duty)' },
        isin: { type: 'string', description: 'ISIN of security' }
      },
      required: ['portfolioId', 'symbol', 'type', 'date', 'quantity', 'price']
    },
    handler: async (args) => {
      const result = await WealthOSProductionAdapter.addTransaction(args);
      return createEnvelope(result, {
        status: 'OK',
        meta: { sideEffects: result.sideEffects }
      });
    }
  },
  {
    name: 'get_portfolio_allocation',
    description: 'Get portfolio asset class and sector allocation breakdown.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    handler: async (args) => {
      const alloc = await WealthOSProductionAdapter.getPortfolioAllocation(args.portfolioId);
      return createEnvelope(alloc);
    }
  },
  {
    name: 'get_portfolio_history',
    description: 'Get historical portfolio snapshot and value checkpoints.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    handler: async (args) => {
      const history = await WealthOSProductionAdapter.getPortfolioHistory(args.portfolioId);
      return createEnvelope(history);
    }
  },

  // ── DOMAIN 3: PORTFOLIO QUERY / COPILOT ──────────────────────────────────────
  {
    name: 'query_portfolio',
    description: 'Structured query across portfolio holdings to inspect risks, sector allocations, and deteriorating metrics.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID' },
        minGainPct: { type: 'number', description: 'Minimum unrealized gain percentage' },
        maxGainPct: { type: 'number', description: 'Maximum unrealized gain percentage' }
      }
    },
    handler: async (args) => {
      const holdings = await WealthOSProductionAdapter.getPortfolioHoldings(args.portfolioId, 200);
      let filtered = holdings;
      if (args.minGainPct !== undefined) {
        filtered = filtered.filter(h => h.unrealizedPnLPct >= args.minGainPct);
      }
      if (args.maxGainPct !== undefined) {
        filtered = filtered.filter(h => h.unrealizedPnLPct <= args.maxGainPct);
      }
      return createEnvelope(filtered, { meta: { totalFiltered: filtered.length } });
    }
  },

  // ── DOMAIN 4: XIRR & RETURN ANALYTICS ────────────────────────────────────────
  {
    name: 'get_portfolio_xirr',
    description: 'Calculate exact portfolio XIRR using true dated cashflows and terminal valuation via production Newton-Raphson engine.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID filter' }
      }
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getPortfolioXirr(args.portfolioId);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_security_xirr',
    description: 'Calculate per-security XIRR for a specific stock/scrip.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getSecurityXirr(args.symbol, args.portfolioId);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_dual_currency_xirr',
    description: 'Calculate post-tax and dual-currency XIRR (INR vs USD/AED/GBP) for NRI accounts.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Portfolio ID' },
        targetCurrency: { type: 'string', enum: ['USD', 'AED', 'GBP', 'EUR'], description: 'Repatriation currency' }
      },
      required: ['targetCurrency']
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getDualCurrencyXirr(args.portfolioId, args.targetCurrency);
      return createEnvelope(res);
    }
  },

  // ── DOMAIN 5: TAX & CAPITAL GAINS ───────────────────────────────────────────
  {
    name: 'get_tax_summary',
    description: 'Get statutory capital gains tax breakdown (LTCG, STCG, Section 112A grandfathering) for a financial year.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        financialYear: { type: 'string', description: 'Financial year (e.g. FY2025-2026)' }
      }
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getTaxSummary(args.financialYear);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_tax_harvesting_opportunities',
    description: 'Identify tax loss harvesting opportunities across existing holdings.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' },
        financialYear: { type: 'string', description: 'Financial year' }
      }
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getTaxHarvestingOpportunities(args.portfolioId, args.financialYear);
      return createEnvelope(res);
    }
  },

  // ── DOMAIN 6: REPORTING ─────────────────────────────────────────────────────
  {
    name: 'list_reports',
    description: 'List all available reporting templates (Commercial Excel, Institutional Dossiers, Schedule 112A).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const reports = [
        { id: 'COMMERCIAL_EXCEL', title: 'Full Family Office Commercial Excel Dossier' },
        { id: 'SCHEDULE_112A', title: 'Schedule 112A Capital Gains Tax Filing Report' },
        { id: 'INSTITUTIONAL_DOSSIER', title: 'Institutional Equity Research Dossier' }
      ];
      return createEnvelope(reports);
    }
  },
  {
    name: 'generate_report',
    description: 'Generate commercial Excel or PDF institutional report into reports archive.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        reportType: { type: 'string', description: 'Report template ID' },
        parameters: { type: 'object', description: 'Report parameters' }
      },
      required: ['reportType']
    },
    handler: async (args) => {
      const report = await WealthOSProductionAdapter.generateReport(args.reportType, args.parameters);
      return createEnvelope(report);
    }
  },

  // ── DOMAIN 7: COMPANY / STOCK INTELLIGENCE ──────────────────────────────────
  {
    name: 'get_company_intelligence',
    description: 'Get full multi-module company intelligence (business, fundamentals, management, valuation, catalysts, risks).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol (e.g. TCS, DYCL)' },
        modules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Subset of modules to run (FUNDAMENTAL, MANAGEMENT, VALUATION, QGLP, TECHNICAL)'
        }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const intel = await WealthOSProductionAdapter.getCompanyIntelligence(args.symbol, args.modules);
      return createEnvelope(intel);
    }
  },
  {
    name: 'get_financial_statements',
    description: 'Get point-in-time canonical financial facts, historical P&L, balance sheet, and cashflow metrics.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' },
        limit: { type: 'number', description: 'Max canonical facts to return (default 100)' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const facts = await WealthOSProductionAdapter.getCanonicalFacts(args.symbol, args.limit || 100);
      return createEnvelope(facts, { meta: { count: facts.length } });
    }
  },
  {
    name: 'get_management_analysis',
    description: 'Inspect management Walk-the-Talk records, commitments, and historical claims with adverse evidence preserved.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const mgmt = await WealthOSProductionAdapter.getManagementAnalysis(args.symbol);
      return createEnvelope(mgmt);
    }
  },
  {
    name: 'get_valuation_analysis',
    description: 'Get fact-based valuation analysis, reverse DCF, PE vs historical bands, and fair value.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const val = await WealthOSProductionAdapter.getValuationAnalysis(args.symbol);
      return createEnvelope(val);
    }
  },

  // ── DOMAIN 8: DETERMINISTIC QGLP ────────────────────────────────────────────
  {
    name: 'get_qglp_analysis',
    description: 'Compute deterministic Motilal-Oswal QGLP score across Quality, Growth, Longevity, and Price pillars.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const qglp = await WealthOSProductionAdapter.getQglpAnalysis(args.symbol);
      return createEnvelope(qglp);
    }
  },

  // ── DOMAIN 9: OPPORTUNITY ENGINE ────────────────────────────────────────────
  {
    name: 'get_opportunity_candidates',
    description: 'Get latest pre-calculated opportunity candidates across the full universe.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Filter by strategy ID (S1A, S1B, S2A, S3A, S4B, S5A)' }
      }
    },
    handler: async (args) => {
      const payload = await SevenStrategiesCandidatesService.getInstance().getCandidatesPayload();
      if (args.strategyId && payload.strategies[args.strategyId as keyof typeof payload.strategies]) {
        return createEnvelope(payload.strategies[args.strategyId as keyof typeof payload.strategies].candidates);
      }
      return createEnvelope(payload);
    }
  },
  {
    name: 'run_opportunity_discovery',
    description: 'Run consolidated multi-engine opportunity discovery (fundamental, technical, institutional flow).',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sleeves: { type: 'array', items: { type: 'string' }, description: 'Sleeves to run' }
      }
    },
    handler: async (args) => {
      const results = await WealthOSProductionAdapter.runOpportunityDiscovery(args.sleeves);
      return createEnvelope(results);
    }
  },

  // ── DOMAIN 10: FUNDAMENTAL DISCOVERY ────────────────────────────────────────
  {
    name: 'screen_fundamentals',
    description: 'Screen companies by fundamental moat, growth, leverage, and earnings quality.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        minRoce: { type: 'number', description: 'Min ROCE %' },
        minRoe: { type: 'number', description: 'Min ROE %' },
        maxDebtEquity: { type: 'number', description: 'Max Debt to Equity ratio' }
      }
    },
    handler: async (args) => {
      const results = await WealthOSProductionAdapter.screenFundamentals(args);
      return createEnvelope(results);
    }
  },

  // ── DOMAIN 11: TECHNICAL ANALYSIS & OHLCV ───────────────────────────────────
  {
    name: 'get_adjusted_ohlcv',
    description: 'Get adjusted daily candlestick bars from the DuckDB/Parquet store with corporate-action adjustments.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'NSE/BSE equity ticker symbol' },
        limit: { type: 'number', description: 'Number of daily bars (default 250, max 1000)' },
        from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD)' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const resp = await WealthOSProductionAdapter.getAdjustedOhlcv(args.symbol, args.limit || 250, args.from, args.to);
      return createEnvelope(resp);
    }
  },
  {
    name: 'get_technical_indicators',
    description: 'Compute technical indicators (SMA, EMA, RSI, ATR, Support/Resistance, Trend regime).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        indicators: { type: 'array', items: { type: 'string' } }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const ind = await WealthOSProductionAdapter.getTechnicalIndicators(args.symbol, args.indicators);
      return createEnvelope(ind);
    }
  },

  // ── DOMAIN 12: TECHNICAL STRATEGIES (S1–S10) ────────────────────────────────
  {
    name: 'evaluate_strategies',
    description: 'Evaluate production technical strategies (S1A, S1B, S2A, S3A, S4B, S5A) on real adjusted OHLCV bars.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' },
        strategies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Strategies to evaluate (defaults to all active: S1A, S1B, S2A, S3A, S4B, S5A)'
        }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const results = await WealthOSProductionAdapter.evaluateStrategies(args.symbol, args.strategies);
      return createEnvelope(results);
    }
  },
  {
    name: 'get_strategy_scan_results',
    description: 'Get latest pre-calculated strategy candidates across the full Indian equity universe.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Strategy ID (e.g. S1A, S1B, S2A, S3A, S4B, S5A)' }
      },
      required: ['strategyId']
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getStrategyScanResults(args.strategyId);
      return createEnvelope(res);
    }
  },

  // ── DOMAIN 13: SECTOR MOMENTUM ──────────────────────────────────────────────
  {
    name: 'get_sector_momentum',
    description: 'Get sector momentum rankings and relative strength indicators across market segments.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const res = await WealthOSProductionAdapter.getSectorMomentum();
      return createEnvelope(res);
    }
  },
  {
    name: 'get_universe_coverage',
    description: 'Get Indian equity universe summary, active counts, and OHLCV coverage audit.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const res = await WealthOSProductionAdapter.getUniverseCoverage();
      return createEnvelope(res);
    }
  },
  {
    name: 'get_data_freshness_summary',
    description: 'Inspect data freshness, latest update timestamps, and missing data coverage.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional symbol' }
      }
    },
    handler: async (args) => {
      const res = await WealthOSProductionAdapter.getDataFreshnessSummary(args.symbol);
      return createEnvelope(res);
    }
  },

  // ── DOMAIN 16: EVIDENCE & FERE ──────────────────────────────────────────────
  {
    name: 'get_fact_provenance',
    description: 'Trace exact source filing, citation, verification status, and provider for any canonical fact ID.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        factId: { type: 'string', description: 'Unique canonical fact ID' }
      },
      required: ['factId']
    },
    handler: async (args) => {
      const fact = await WealthOSProductionAdapter.getFactProvenance(args.factId);
      if (!fact) {
        return createEnvelope(null, {
          status: 'MISSING',
          warnings: [`Fact ID '${args.factId}' not found in CanonicalFacts`]
        });
      }
      return createEnvelope(fact);
    }
  },

  // ── DOMAIN 17: COMPOSITE ORCHESTRATION ──────────────────────────────────────
  {
    name: 'analyze_investment_candidate',
    description: 'Orchestrate complete multi-module analysis of an equity candidate (identity, fundamentals, QGLP, management, valuation, technicals, strategies).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Equity ticker symbol' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const sym = args.symbol.toUpperCase();
      const [sec, intel, qglp, strat] = await Promise.all([
        WealthOSProductionAdapter.resolveSecurity(sym),
        WealthOSProductionAdapter.getCompanyIntelligence(sym),
        WealthOSProductionAdapter.getQglpAnalysis(sym),
        WealthOSProductionAdapter.evaluateStrategies(sym)
      ]);

      return createEnvelope({
        security: sec,
        intelligence: intel,
        qglp,
        technicalStrategies: strat
      });
    }
  },
  {
    name: 'analyze_portfolio',
    description: 'Orchestrate portfolio-wide intelligence review across holdings (fundamentals, risks, valuations, strategy signals).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        portfolioId: { type: 'string', description: 'Optional portfolio name' }
      }
    },
    handler: async (args) => {
      const review = await WealthOSProductionAdapter.analyzePortfolio(args.portfolioId);
      return createEnvelope(review);
    }
  },

  // ── DOMAIN 18: REQUIREMENT REGISTRY ─────────────────────────────────────────
  {
    name: 'get_requirements',
    description: 'Inspect canonical product and technical requirements with strict provenance tagging.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Filter by requirement domain' }
      }
    },
    handler: async (args) => {
      let reqs = RequirementRegistry.listRequirements();
      if (args.domain) {
        reqs = reqs.filter(r => r.domain.toLowerCase() === args.domain.toLowerCase());
      }
      return createEnvelope(reqs, { meta: { count: reqs.length } });
    }
  },
  {
    name: 'list_requirements',
    description: 'List all verified WealthOS product requirements, acceptance criteria, and suite mappings.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const reqs = RequirementRegistry.listRequirements();
      return createEnvelope(reqs, { meta: { count: reqs.length } });
    }
  },
  {
    name: 'get_requirement',
    description: 'Get detailed requirement specification, acceptance criteria, and status by requirement ID.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Requirement ID (e.g. REQ-SEC-01, REQ-STRAT-01)' }
      },
      required: ['requirementId']
    },
    handler: async (args) => {
      const req = RequirementRegistry.getRequirement(args.requirementId);
      if (!req) {
        return createEnvelope(null, {
          status: 'MISSING',
          warnings: [`Requirement '${args.requirementId}' not found`]
        });
      }
      return createEnvelope(req);
    }
  },

  // ── DOMAIN 19: REPOSITORY REVIEW PLANE ──────────────────────────────────────
  {
    name: 'get_repository_status',
    description: 'Inspect repository git status, current branch, SHA, and modified/untracked files (read-only).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const status = RepositoryAdapter.getStatus();
      return createEnvelope(status);
    }
  },
  {
    name: 'get_commit_history',
    description: 'Get recent git commits with hash, author, date, and message.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of commits to return (default 10, max 50)' }
      }
    },
    handler: async (args) => {
      const history = RepositoryAdapter.getCommitHistory(args.limit || 10);
      return createEnvelope(history);
    }
  },
  {
    name: 'get_file_diff',
    description: 'Inspect git diff of working tree or a specific file with automatic secret redaction.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Optional relative path to inspect' }
      }
    },
    handler: async (args) => {
      const diff = RepositoryAdapter.getFileDiff(args.filePath);
      return createEnvelope({ diff, filePath: args.filePath || 'ALL' });
    }
  },
  {
    name: 'inspect_source_file',
    description: 'Read bounded source file lines within repository with sandboxing and secret redaction.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative path to repository source file' },
        startLine: { type: 'number', description: 'Starting line number (1-indexed)' },
        endLine: { type: 'number', description: 'Ending line number' }
      },
      required: ['filePath']
    },
    handler: async (args) => {
      const fileData = RepositoryAdapter.inspectSourceFile(args.filePath, args.startLine, args.endLine);
      return createEnvelope(fileData);
    }
  },

  // ── DOMAIN 20: TEST EXECUTION PLANE ─────────────────────────────────────────
  {
    name: 'list_test_suites',
    description: 'List all available allowlisted test suites that can be executed safely.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const suites = TestingAdapter.listTestSuites();
      return createEnvelope(suites);
    }
  },
  {
    name: 'run_tests',
    description: 'Execute an allowlisted test suite (unit, integration, strategies, xirr, verification) and capture structured outcomes.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        suiteId: { type: 'string', description: 'Suite ID to run (unit, integration, strategies, xirr, acceptance, verification)' }
      },
      required: ['suiteId']
    },
    handler: async (args) => {
      const result = TestingAdapter.runTests(args.suiteId);
      return createEnvelope(result, {
        status: result.passed ? 'OK' : 'ERROR',
        meta: { durationMs: result.durationMs }
      });
    }
  },

  // ── DOMAIN 21: INDEPENDENT VERIFICATION PLANE ───────────────────────────────
  {
    name: 'verify_xirr',
    description: 'Independently recompute XIRR from raw dated cashflows using a clean-room root-finder and compare against production value.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        cashflows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              amount: { type: 'number', description: 'Cash flow amount' }
            },
            required: ['date', 'amount']
          },
          description: 'Raw dated cash flows'
        },
        productionXirr: { type: 'number', description: 'Reported production XIRR to verify' },
        tolerance: { type: 'number', description: 'Acceptable tolerance (default 0.005)' }
      },
      required: ['cashflows', 'productionXirr']
    },
    handler: async (args) => {
      const verification = verifyXirrOracle(args.cashflows, args.productionXirr, args.tolerance || 0.005);
      return createEnvelope(verification, {
        status: verification.status === 'MATCH' ? 'OK' : 'PARTIAL'
      });
    }
  },
  {
    name: 'verify_financial_metric',
    description: 'Independently recompute financial ratios (CAGR, YOY_GROWTH, EBITDA_MARGIN_PCT, PAT_MARGIN_PCT, ROE_PCT, ROCE_PCT, CFO_TO_PAT_PCT) from raw facts.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        metricName: { type: 'string', description: 'Financial metric name' },
        rawInputs: { type: 'object', description: 'Raw numerical inputs (e.g. { ebitda, revenue } or { startValue, endValue, periods })' },
        productionResult: { type: 'number', description: 'Reported production metric value to verify' },
        tolerance: { type: 'number', description: 'Acceptable tolerance (default 0.01)' }
      },
      required: ['metricName', 'rawInputs', 'productionResult']
    },
    handler: async (args) => {
      const verification = verifyFinancialMetricOracle(args.metricName, args.rawInputs, args.productionResult, args.tolerance || 0.01);
      return createEnvelope(verification, {
        status: verification.status === 'MATCH' ? 'OK' : 'PARTIAL'
      });
    }
  },
  {
    name: 'verify_technical_indicator',
    description: 'Independently compute technical indicators (SMA, EMA, RSI) directly from raw bar close prices.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        indicatorName: { type: 'string', enum: ['SMA', 'EMA', 'RSI'], description: 'Indicator to compute' },
        rawBars: {
          type: 'array',
          items: {
            type: 'object',
            properties: { close: { type: 'number' } },
            required: ['close']
          },
          description: 'Raw candle bars'
        },
        productionResult: { type: 'number', description: 'Production indicator value to verify' },
        period: { type: 'number', description: 'Indicator period (e.g. 14 for RSI, 20 for SMA)' },
        tolerance: { type: 'number', description: 'Acceptable tolerance' }
      },
      required: ['indicatorName', 'rawBars', 'productionResult']
    },
    handler: async (args) => {
      const verification = verifyTechnicalIndicatorOracle(
        args.indicatorName,
        args.rawBars,
        args.productionResult,
        args.period || 20,
        args.tolerance || 0.05
      );
      return createEnvelope(verification, {
        status: verification.status === 'MATCH' ? 'OK' : 'PARTIAL'
      });
    }
  },

  // ── DOMAIN 22: DEVELOPER SESSION MODEL & REMEDIATION CONTRACT ────────────────
  {
    name: 'create_development_session',
    description: 'Create a tracked development session (DEV-*) capturing baseline branch, commit, objective, and constraints.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string', description: 'Developer task objective' },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit development boundaries and rules'
        }
      },
      required: ['objective']
    },
    handler: async (args) => {
      const session = DeveloperAgentAdapter.createSession(args.objective, args.constraints || []);
      return createEnvelope(session);
    }
  },
  {
    name: 'get_development_session',
    description: 'Inspect development session state, modified files, diff summary, and test integrity guard flags.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID (e.g. DEV-20260930-001)' }
      },
      required: ['sessionId']
    },
    handler: async (args) => {
      const session = DeveloperAgentAdapter.getSession(args.sessionId);
      return createEnvelope(session);
    }
  },
  {
    name: 'list_development_sessions',
    description: 'List all recorded development sessions with their current status and repair cycle counts.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const sessions = DeveloperAgentAdapter.listSessions();
      return createEnvelope(sessions, { meta: { count: sessions.length } });
    }
  },
  {
    name: 'submit_remediation_request',
    description: 'Submit a structured remediation request to developer bot (max 3 cycles before escalating to human).',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID' },
        observedFailure: { type: 'string', description: 'Specific factual failure observed by reviewer' },
        severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'], description: 'Failure severity' },
        allowedScope: { type: 'array', items: { type: 'string' }, description: 'Allowed files/directories to edit' },
        forbiddenChanges: { type: 'array', items: { type: 'string' }, description: 'Strictly prohibited modifications' },
        acceptanceTests: { type: 'array', items: { type: 'string' }, description: 'Tests that must pass to accept remediation' }
      },
      required: ['sessionId', 'observedFailure', 'severity', 'allowedScope', 'forbiddenChanges', 'acceptanceTests']
    },
    handler: async (args) => {
      const result = DeveloperAgentAdapter.submitRemediation(args);
      return createEnvelope(result);
    }
  },
  {
    name: 'get_diff',
    description: 'Get git diff of repository or specific file with automatic secret redaction.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Optional relative file path to diff' }
      }
    },
    handler: async (args) => {
      const diff = RepositoryAdapter.getFileDiff(args.filePath);
      return createEnvelope(diff);
    }
  },
  {
    name: 'inspect_source',
    description: 'Sandboxed search and file retrieval for source code (explicitly blocks .env, credentials, secrets, databases, parquet).',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'get_file'], description: 'search or get_file' },
        query: { type: 'string', description: 'Search term (for action=search)' },
        filePath: { type: 'string', description: 'Relative path (for action=get_file)' },
        startLine: { type: 'number', description: 'Start line (1-indexed)' },
        endLine: { type: 'number', description: 'End line (1-indexed)' }
      },
      required: ['action']
    },
    handler: async (args) => {
      if (args.action === 'search') {
        const results = RepositoryAdapter.searchSource(args.query || '', args.filePath);
        return createEnvelope(results);
      } else {
        const fileContent = RepositoryAdapter.inspectSourceFile(args.filePath, args.startLine, args.endLine);
        return createEnvelope(fileContent);
      }
    }
  },
  {
    name: 'run_build_and_typecheck',
    description: 'Run non-shell build and typecheck commands (npx tsc --noEmit, npm run build).',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['typecheck', 'build', 'both'], description: 'Execution mode' }
      },
      required: ['mode']
    },
    handler: async (args) => {
      let result: any = {};
      if (args.mode === 'typecheck' || args.mode === 'both') {
        result.typecheck = RepositoryAdapter.runTypecheck();
      }
      if (args.mode === 'build' || args.mode === 'both') {
        result.build = RepositoryAdapter.runBuild();
      }
      return createEnvelope(result);
    }
  },
  {
    name: 'get_system_health',
    description: 'Inspect Node process memory, uptime, and dev server status.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const health = await RepositoryAdapter.getSystemHealth();
      return createEnvelope(health);
    }
  },
  {
    name: 'run_browser_journey',
    description: 'Execute controlled headless browser journey against localhost:3000 routes and check for errors.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        journey: { type: 'string', enum: ['portfolio', 'intelligence', 'opportunity', 'overview'], description: 'Journey to test' }
      }
    },
    handler: async (args) => {
      const result = await RepositoryAdapter.runBrowserJourney(args.journey);
      return createEnvelope(result);
    }
  },
  {
    name: 'create_development_task_package',
    description: 'Create a structured task handoff package for the user to paste into Antigravity IDE.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID' }
      },
      required: ['sessionId']
    },
    handler: async (args) => {
      const pkg = DeveloperAgentAdapter.createDevelopmentTaskPackage(args.sessionId);
      return createEnvelope(pkg);
    }
  },
  {
    name: 'resume_development_session',
    description: 'Resume a session after Antigravity completes work, detect repository changes, and begin review.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID' }
      },
      required: ['sessionId']
    },
    handler: async (args) => {
      const res = DeveloperAgentAdapter.resumeDevelopmentSession(args.sessionId);
      return createEnvelope(res);
    }
  },
  {
    name: 'cancel_remediation',
    description: 'Cancel an active remediation request and mark session as CANCELLED.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Development session ID' },
        reason: { type: 'string', description: 'Cancellation reason' }
      },
      required: ['sessionId', 'reason']
    },
    handler: async (args) => {
      const res = DeveloperAgentAdapter.cancelRemediation(args.sessionId, args.reason);
      return createEnvelope(res);
    }
  },

  // ── DOMAIN 21: FUNDAMENTAL INTERPRETATION CALIBRATION ─────────────────────
  {
    name: 'get_fundamental_review_inputs',
    description: 'Generates structured review input package (facts, derived metrics, interpretations, evidence, missingness) for an Indian equity.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'National equity symbol (e.g. TCS, HDFCBANK)' },
        asOfDate: { type: 'string', description: 'Optional evaluation date (YYYY-MM-DD)' }
      },
      required: ['symbol']
    },
    handler: async (args) => {
      const res = await FundamentalCalibrationAdapter.getReviewInputs(args.symbol, args.asOfDate);
      return createEnvelope(res);
    }
  },
  {
    name: 'create_fundamental_review_run',
    description: 'Initializes and freezes a cohort for a fundamental calibration review run.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the review run' },
        phase: { type: 'string', enum: ['PILOT', 'CALIBRATION', 'FULL'], description: 'Review phase' },
        cohort: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              companyName: { type: 'string' },
              sector: { type: 'string' },
              capCategory: { type: 'string' },
              rationale: { type: 'string' }
            },
            required: ['symbol', 'companyName', 'capCategory']
          }
        }
      },
      required: ['name', 'cohort']
    },
    handler: async (args) => {
      const res = FundamentalCalibrationAdapter.createReviewRun(args.name, args.phase, args.cohort);
      return createEnvelope(res);
    }
  },
  {
    name: 'record_fundamental_review',
    description: 'Records reviewed interpretation claims and updates outcome and issue taxonomy distributions.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Review run ID' },
        reviews: { type: 'array', description: 'List of reviewed claim results' }
      },
      required: ['runId', 'reviews']
    },
    handler: async (args) => {
      const res = FundamentalCalibrationAdapter.recordReviews(args.runId, args.reviews);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_fundamental_review_run',
    description: 'Retrieves complete metadata, cohort, and claim summary for a review run.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Review run ID' }
      },
      required: ['runId']
    },
    handler: async (args) => {
      const res = FundamentalCalibrationAdapter.getReviewRun(args.runId);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_fundamental_review_findings',
    description: 'Retrieves claims evaluated in a review run, with optional filtering for questioned/unsupported items.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Review run ID' },
        filter: { type: 'string', enum: ['ALL', 'QUESTIONED_OR_UNSUPPORTED'] }
      },
      required: ['runId']
    },
    handler: async (args) => {
      const res = FundamentalCalibrationAdapter.getReviewFindings(args.runId, args.filter);
      return createEnvelope(res);
    }
  },
  {
    name: 'get_fundamental_review_clusters',
    description: 'Retrieves systemic defect clusters grouped by root cause for developer remediation.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Review run ID' }
      },
      required: ['runId']
    },
    handler: async (args) => {
      const res = FundamentalCalibrationAdapter.getReviewClusters(args.runId);
      return createEnvelope(res);
    }
  }
];

export function getToolsForPlane(plane: 'PRODUCT' | 'REVIEW' | 'DEVELOPMENT'): McpToolDefinition[] {
  const reviewerToolNames = new Set([
    // 1. Fundamental review
    'get_fundamental_review_inputs',
    'create_fundamental_review_run',
    'record_fundamental_review',
    'get_fundamental_review_run',
    'get_fundamental_review_findings',
    'get_fundamental_review_clusters',
    // 2. Repository inspection & diff inspection
    'get_repository_status',
    'get_diff',
    'get_file_diff',
    'get_commit_history',
    'inspect_source',
    'inspect_source_file',
    // 3. Requirements
    'get_requirements',
    'get_requirement',
    'list_requirements',
    // 4. Reports / Artifacts
    'get_audit_report',
    'get_scrip_lifecycle_report',
    // 5. Allowlisted tests & typecheck/build
    'list_test_suites',
    'run_tests',
    'run_build_and_typecheck',
    'get_system_health',
    // 6. Browser verification
    'run_browser_journey',
    // 7. Review session management & constrained remediation task submission
    'submit_remediation_request',
    'get_development_session',
    'list_development_sessions',
    // 8. Core Data (Read-only context)
    'search_securities',
    'resolve_security',
    'get_company_profile',
    'get_company_facts',
    'verify_xirr',
    'verify_financial_metric',
    'verify_technical_indicator'
  ]);

  const devToolNames = new Set([
    'get_repository_status',
    'get_diff',
    'get_file_diff',
    'get_commit_history',
    'inspect_source',
    'inspect_source_file',
    'list_test_suites',
    'run_tests',
    'run_build_and_typecheck',
    'get_system_health',
    'run_browser_journey',
    'create_development_session',
    'get_development_session',
    'list_development_sessions',
    'submit_remediation_request',
    'create_development_task_package',
    'resume_development_session',
    'cancel_remediation',
    'get_fundamental_review_inputs',
    'create_fundamental_review_run',
    'record_fundamental_review',
    'get_fundamental_review_run',
    'get_fundamental_review_findings',
    'get_fundamental_review_clusters',
    'get_requirements',
    'get_requirement',
    'list_requirements',
    'verify_xirr',
    'verify_financial_metric',
    'verify_technical_indicator'
  ]);

  if (plane === 'REVIEW') {
    return TOOLS.filter(t => reviewerToolNames.has(t.name));
  } else if (plane === 'PRODUCT') {
    return TOOLS.filter(t => !devToolNames.has(t.name) || ['get_requirements', 'verify_xirr', 'verify_financial_metric', 'verify_technical_indicator'].includes(t.name));
  } else {
    return TOOLS.filter(t => devToolNames.has(t.name));
  }
}
