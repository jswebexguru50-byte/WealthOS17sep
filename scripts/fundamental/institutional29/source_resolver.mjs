import crypto from 'node:crypto';

const TRENDLYNE_VIEW_TO_TOOL = {
  overview: ['get_overview_news_corp_events', 'overview', 'fundamental_endpoint_snapshots'],
  technical: ['get_overview_news_corp_events', 'technical', 'fundamental_endpoint_snapshots'],
  news: ['get_overview_news_corp_events', 'news', 'fundamental_endpoint_snapshots'],
  events: ['get_overview_news_corp_events', 'events', 'company_events + fundamental_endpoint_snapshots'],
  shareholding: ['get_ownership_deals_insider_sast', 'shareholding', 'HistoricalShareholdingPattern + fundamental_endpoint_snapshots'],
  sast: ['get_ownership_deals_insider_sast', 'sast', 'InstitutionalDeals + fundamental_endpoint_snapshots'],
  bulblockdeal: ['get_ownership_deals_insider_sast', 'bulblockdeal', 'InstitutionalDeals + fundamental_endpoint_snapshots'],
};

const LOCAL_DOMAIN_RULES = {
  DOCUMENTS: {
    localFirst: ['source_documents', 'FEREEnrichedLedger', 'fundamental_endpoint_snapshots:documents'],
    primarySources: ['NSE/BSE filed annual reports and announcements', 'Company investor-relations filings'],
    canonicalDestination: 'source_documents plus cited qualitative evidence records',
    existingExecutors: ['src/server/services/enrichment/trendlyne/TrendlyneDocumentAdapter.ts'],
  },
  EVENTS: {
    localFirst: ['company_events', 'StatutoryEvents', 'fundamental_endpoint_snapshots:corporate_events'],
    primarySources: ['NSE/BSE corporate announcements'],
    canonicalDestination: 'company_events + StatutoryEvents',
    existingExecutors: ['src/server/services/enrichment/trendlyne/TrendlyneEventAdapter.ts'],
  },
  DEALS: {
    localFirst: ['InstitutionalDeals'],
    primarySources: ['NSE/BSE bulk, block, insider and SAST disclosures'],
    canonicalDestination: 'InstitutionalDeals',
    existingExecutors: ['src/server/services/enrichment/trendlyne/TrendlyneOwnershipAdapter.ts', 'scripts/run_one_time_data_push.cjs'],
  },
  SEGMENTS: {
    localFirst: ['HistoricalFinancialStatements', 'FEREEnrichedLedger', 'source_documents'],
    primarySources: ['Annual-report segment note', 'Quarterly result segment schedule', 'XBRL segment disclosures'],
    canonicalDestination: 'period-anchored segment fact records',
    existingExecutors: ['scripts/fundamental/promote_all_xbrl_to_company_facts.py'],
  },
  RPT: {
    localFirst: ['source_documents', 'FEREEnrichedLedger'],
    primarySources: ['Annual-report related-party note', 'XBRL related-party disclosures'],
    canonicalDestination: 'counterparty-level related-party evidence ledger',
    existingExecutors: ['scripts/fundamental/promote_all_xbrl_to_company_facts.py'],
  },
  FINANCIAL_HISTORY: {
    localFirst: ['company_facts', 'HistoricalFinancialStatements', 'FEREEnrichedLedger', 'fundamental_endpoint_snapshots'],
    primarySources: ['NSE/BSE filed financial results', 'XBRL/FERE statements'],
    canonicalDestination: 'company_facts + HistoricalFinancialStatements',
    existingExecutors: ['scripts/fundamental/canonical_fact_ingestion.ts', 'scripts/fundamental/promote_all_xbrl_to_company_facts.py'],
  },
  SHAREHOLDING: {
    localFirst: ['HistoricalShareholdingPattern', 'fundamental_endpoint_snapshots:shareholding'],
    primarySources: ['NSE/BSE quarterly shareholding pattern'],
    canonicalDestination: 'HistoricalShareholdingPattern',
    existingExecutors: ['scripts/data_quality/jobs/shareholding_history_backfill.ts', 'scripts/fundamental/promote_trendlyne_shareholding_history.ts'],
  },
  FERE: {
    localFirst: ['FEREEnrichedLedger', 'company_facts'],
    primarySources: ['NSE/BSE XBRL filings'],
    canonicalDestination: 'FEREEnrichedLedger + company_facts',
    existingExecutors: ['scripts/fundamental/promote_fere_verified_xbrl_facts.ts', 'scripts/fundamental/promote_all_xbrl_to_company_facts.py'],
  },
  PEERS: {
    localFirst: ['MasterTickers', 'company_facts'],
    primarySources: ['Exchange industry classification and filed peer disclosures'],
    canonicalDestination: 'governed peer set with classification rationale',
    existingExecutors: [],
  },
  ADJUSTED_OHLCV: {
    localFirst: ['DuckDB app_adjusted_ohlcv'],
    primarySources: ['NSE/BSE bhavcopy and corporate actions'],
    canonicalDestination: 'DuckDB adjusted OHLCV',
    existingExecutors: ['scripts/market_data/query_adjusted_ohlcv_worker.py'],
  },
};

const METRIC_RULES = [
  [/inventory|working_capital|capital_work_in_progress|trade_receivables|borrowings|total_debt/i, 'F03/F04', ['XBRL/FERE balance sheet and notes']],
  [/cfo|capex|net_cash_flow|debt_repaid|dividends_paid/i, 'F04', ['XBRL/FERE cash-flow statement']],
  [/ebitda|operating_profit|revenue|pat|materials_cost|exceptional|other_income/i, 'F01/F02', ['XBRL/FERE profit-and-loss statement']],
  [/roce|roic|roe|interest_coverage|opm|margin/i, 'F05', ['Derived from aligned XBRL/FERE statements']],
  [/market_cap|pe_|pb_|peg_|public_holding/i, 'F06/F07', ['Adjusted market price plus filed share capital/shareholding']],
  [/net_debt/i, 'F03', ['Derived from aligned borrowings, leases and cash; never fetch as a substitute for missing inputs']],
];

function actionId(symbol, questionId, missing) {
  const hash = crypto.createHash('sha256').update(`${symbol}|${questionId}|${missing}`).digest('hex').slice(0, 10).toUpperCase();
  return `GAP-${symbol}-${String(questionId).padStart(2, '0')}-${hash}`;
}

function resolveMetric(symbol, question, missing, priority) {
  const aliases = missing.slice('METRIC:'.length).split('|');
  const rule = METRIC_RULES.find(([pattern]) => aliases.some(alias => pattern.test(alias)));
  const pack = rule?.[1] || 'DISCOVER_EXACT_PARAMETER';
  return {
    actionId: actionId(symbol, question.id, missing), priority, questionId: question.id, status: question.status,
    missing, category: 'STRUCTURED_METRIC', aliases,
    localFirst: ['company_facts', 'HistoricalFinancialStatements', 'FEREEnrichedLedger', 'fundamental_endpoint_snapshots'],
    primarySources: rule?.[2] || ['NSE/BSE filed financial statements and notes'],
    providerFallback: {
      provider: 'TRENDLYNE_MCP', pack,
      discoveryTool: 'search_financial_parameters', fetchTool: 'get_stock_parameter_values',
      batching: 'Use only verified tokens; up to 10 symbols and up to 50 parameters per provider call.',
    },
    canonicalDestination: 'company_facts with identity, unit, scope, periodEnd, publishedAt/availableAt and provenance',
    existingExecutors: ['scripts/fundamental/trendlyne_metric_pack_planner.ts', 'scripts/fundamental/canonical_fact_ingestion.ts'],
    completionGate: 'At least one period-anchored canonical fact is present; derived metrics additionally require all aligned input fact IDs.',
  };
}

function resolveView(symbol, question, missing, priority) {
  const view = missing.slice('TRENDLYNE_VIEW:'.length);
  const [tool, type, destination] = TRENDLYNE_VIEW_TO_TOOL[view] || ['UNKNOWN', view, 'fundamental_endpoint_snapshots'];
  return {
    actionId: actionId(symbol, question.id, missing), priority, questionId: question.id, status: question.status,
    missing, category: 'TRENDLYNE_VIEW', view,
    localFirst: [`fundamental_endpoint_snapshots:${view}`, ...(view === 'events' ? ['company_events', 'StatutoryEvents'] : []), ...(view === 'sast' || view === 'bulblockdeal' ? ['InstitutionalDeals'] : [])],
    primarySources: view === 'technical' ? ['DuckDB adjusted OHLCV remains analytical source of truth'] : ['NSE/BSE source disclosure should verify material claims'],
    providerFallback: { provider: 'TRENDLYNE_MCP', tool, arguments: { stock_code: symbol, type: view } },
    canonicalDestination: destination,
    existingExecutors: ['scripts/fundamental/run_trendlyne_mcp_enrichment.ts', 'src/server/services/enrichment/trendlyne/TrendlyneMcpClient.ts'],
    completionGate: `A successful, fresh ${view} snapshot is persisted; material claims are promoted or linked to their primary disclosure.`,
  };
}

function resolveLocalDomain(symbol, question, missing, priority) {
  const domain = missing.slice('LOCAL_DOMAIN:'.length);
  const rule = LOCAL_DOMAIN_RULES[domain] || { localFirst: [], primarySources: [], canonicalDestination: domain, existingExecutors: [] };
  const focusedQueries = domain === 'DOCUMENTS' || domain === 'SEGMENTS' || domain === 'RPT'
    ? question.documentQueries.map(query => ({ tool: 'get_document_search_results', arguments: { stock_code: symbol, query } }))
    : [];
  return {
    actionId: actionId(symbol, question.id, missing), priority, questionId: question.id, status: question.status,
    missing, category: 'LOCAL_DOMAIN', domain,
    localFirst: rule.localFirst,
    primarySources: rule.primarySources,
    providerFallback: focusedQueries.length ? { provider: 'TRENDLYNE_MCP', focusedQueries } : null,
    canonicalDestination: rule.canonicalDestination,
    existingExecutors: rule.existingExecutors,
    completionGate: domain === 'DOCUMENTS'
      ? 'Cited document excerpts include document identity, reporting period, page/chunk locator, URL and availableAt.'
      : `Verified ${domain} evidence is persisted in ${rule.canonicalDestination}.`,
  };
}

export function resolveMissingEvidence(symbol, question, missing) {
  const priority = question.status === 'DATA_INSUFFICIENT' ? 'P0' : 'P1';
  if (missing.startsWith('METRIC:')) return resolveMetric(symbol, question, missing, priority);
  if (missing.startsWith('TRENDLYNE_VIEW:')) return resolveView(symbol, question, missing, priority);
  if (missing.startsWith('LOCAL_DOMAIN:')) return resolveLocalDomain(symbol, question, missing, priority);
  return { actionId: actionId(symbol, question.id, missing), priority, questionId: question.id, status: question.status, missing, category: 'UNCLASSIFIED', localFirst: [], primarySources: [], providerFallback: null, canonicalDestination: null, existingExecutors: [], completionGate: 'Human source mapping required.' };
}

export function buildGapResolutionPlan(symbol, questions) {
  const actions = questions.flatMap(question => question.missing.map(missing => resolveMissingEvidence(symbol, question, missing)));
  const uniqueProviderCalls = [];
  const seen = new Set();
  for (const action of actions) {
    const provider = action.providerFallback;
    if (!provider) continue;
    const calls = provider.focusedQueries || [provider];
    for (const call of calls) {
      const key = JSON.stringify(call);
      if (!seen.has(key)) { seen.add(key); uniqueProviderCalls.push(call); }
    }
  }
  return {
    symbol,
    generatedAt: new Date().toISOString(),
    policy: ['Exhaust local persisted evidence first', 'Prefer primary filed evidence', 'Use provider data for discovery/cross-check and persist raw response', 'Promote only identity/period/unit/scope-verified evidence', 'Never convert missing evidence to zero or an invented narrative'],
    summary: {
      totalActions: actions.length,
      p0: actions.filter(item => item.priority === 'P0').length,
      p1: actions.filter(item => item.priority === 'P1').length,
      structuredMetrics: actions.filter(item => item.category === 'STRUCTURED_METRIC').length,
      providerViews: actions.filter(item => item.category === 'TRENDLYNE_VIEW').length,
      localDomains: actions.filter(item => item.category === 'LOCAL_DOMAIN').length,
      uniqueProviderCalls: uniqueProviderCalls.length,
    },
    actions,
    uniqueProviderCalls,
  };
}

