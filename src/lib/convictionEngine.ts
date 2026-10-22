/**
 * UNIFIED CONVICTION ENGINE & DATA SOURCE INTEGRATION MATRIX
 * Spec: master_app_specification_v4_addendum.md (Sections 2, 3, 4, 5)
 */

import { dbAll, dbGet, dbRun, getDB } from '../server/database.js';
import { roundINR } from './decimalUtils.js';

// Database query helpers passing active DB instance
const run = (sql: string, params: any[] = []) => dbRun(getDB(), sql, params);
const all = <T = any>(sql: string, params: any[] = []): Promise<T[]> => dbAll(getDB(), sql, params);
const get = <T = any>(sql: string, params: any[] = []): Promise<T | null> => dbGet(getDB(), sql, params);

export interface DataSourceRecord {
  source_id: string;
  display_name: string;
  category: 'MARKET_DATA' | 'FUNDAMENTAL' | 'TECHNICAL_AGGREGATOR' | 'NEWS' | 'SOCIAL' | 'OPTIONS' | 'REGULATORY_FILING';
  access_method: 'OFFICIAL_API' | 'LICENSED_FEED' | 'RSS' | 'MANUAL_EXPORT' | 'WEBSITE_SCRAPE';
  tos_status: 'COMPLIANT' | 'REQUIRES_REVIEW' | 'PROHIBITED';
  reliability_tier: number; // 1 (highest) to 4 (lowest)
  refresh_cadence: string;
  notes?: string;
}

export interface ConvictionComponentInput {
  technicalProbability?: number;   // Calibrated prob from 7-strategy scanner
  fundamentalScore?: number;       // 0 to 100 quality score (ROE, Debt/Eq, PEG)
  institutionalFlowScore?: number; // 0 to 100 delivery / bulk deal / pledge score
  optionsPositioningScore?: number;// 0 to 100 PCR / Max Pain / Roll-over score
  newsEventScore?: number;         // -50 to +50 sentiment/material event score
  retailSentimentScore?: number;   // -20 to +20 social/retail score (capped)
  thirdPartyCorroboration?: number;// 0 to 100 analyst consensus score
}

export interface FusedConvictionResult {
  symbol: string;
  convictionScore: number; // 0.0 to 1.0 (or 0% to 100%)
  isRecommendation: boolean; // Labeling discipline: true only if calibrated & min_n met
  isInformationalOnly: boolean;
  componentsBreakdown: {
    technical: { raw: number; weighted: number; weight: number; calibrated: boolean };
    fundamental: { raw: number; weighted: number; weight: number };
    flow: { raw: number; weighted: number; weight: number };
    options: { raw: number; weighted: number; weight: number };
    news: { raw: number; weighted: number; weight: number };
    sentiment: { raw: number; weighted: number; weight: number; capped: boolean };
    thirdParty: { raw: number; weighted: number; weight: number };
  };
  circuitBreakerActive: boolean;
  circuitBreakerReason?: string;
  maxKellyAllocationPct: number; // 0% if circuit breaker active, else calculated
}

export async function initConvictionTables(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS data_sources (
      source_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      access_method TEXT NOT NULL,
      tos_status TEXT NOT NULL,
      reliability_tier INTEGER NOT NULL,
      refresh_cadence TEXT NOT NULL,
      notes TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS source_adapter_runs (
      run_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      started_at_utc TEXT NOT NULL,
      completed_at_utc TEXT,
      records_ingested INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      error_detail TEXT,
      FOREIGN KEY(source_id) REFERENCES data_sources(source_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS unified_conviction_scores (
      symbol TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      conviction_score REAL NOT NULL,
      is_recommendation BOOLEAN NOT NULL,
      components_breakdown TEXT NOT NULL,
      hard_circuit_breaker_active BOOLEAN NOT NULL DEFAULT 0,
      zero_size_reason TEXT,
      max_kelly_fraction REAL,
      created_at TEXT NOT NULL
    )
  `);

  // SRC-2: Fundamental metric cross-validation & discrepancy tracking
  await run(`
    CREATE TABLE IF NOT EXISTS fundamental_metric_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      metric TEXT NOT NULL,
      source_a TEXT NOT NULL,
      value_a REAL NOT NULL,
      source_b TEXT NOT NULL,
      value_b REAL NOT NULL,
      max_deviation_pct REAL NOT NULL,
      as_of TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT 0,
      resolution_note TEXT
    )
  `);

  // SRC-3: News & Corporate Announcement Ingestion Pipeline with Dedup Clusters
  await run(`
    CREATE TABLE IF NOT EXISTS news_events (
      event_id TEXT PRIMARY KEY,
      published_at TEXT NOT NULL,
      source_id TEXT NOT NULL,
      headline TEXT NOT NULL,
      entity_keys TEXT NOT NULL, -- comma-separated symbols/ISINs
      event_type TEXT NOT NULL,  -- 'EARNINGS','M&A','REGULATORY','LITIGATION','MANAGEMENT_CHANGE','GUIDANCE','OTHER'
      dedup_cluster_id TEXT,
      sentiment_score REAL
    )
  `);

  // SRC-4: Social/Retail Sentiment Engine with Manipulation Detection
  await run(`
    CREATE TABLE IF NOT EXISTS social_sentiment_daily (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 0,
      positive_pct REAL NOT NULL DEFAULT 0,
      negative_pct REAL NOT NULL DEFAULT 0,
      manipulation_risk TEXT NOT NULL, -- 'LOW' | 'MEDIUM' | 'HIGH'
      score_used_in_fusion BOOLEAN NOT NULL DEFAULT 1,
      PRIMARY KEY (symbol, date)
    )
  `);

  // SRC-6: Options Chain Snapshot & Derived Metrics (PCR, Max Pain, Skew)
  await run(`
    CREATE TABLE IF NOT EXISTS options_chain_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      strike REAL NOT NULL,
      option_type TEXT NOT NULL, -- 'CE' | 'PE'
      oi INTEGER NOT NULL,
      oi_change INTEGER NOT NULL,
      iv REAL,
      volume INTEGER NOT NULL,
      ltp REAL,
      as_of_timestamp TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS derived_options_metrics (
      symbol TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      pcr_oi REAL NOT NULL,
      pcr_volume REAL NOT NULL,
      max_pain_strike REAL NOT NULL,
      iv_skew_25delta REAL,
      unusual_oi_buildup_strikes TEXT,
      PRIMARY KEY(symbol, as_of_date)
    )
  `);

  // SRC-7: Broker Research Report Aggregation
  await run(`
    CREATE TABLE IF NOT EXISTS broker_research_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      broker_name TEXT NOT NULL,
      report_date TEXT NOT NULL,
      rating TEXT NOT NULL, -- 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL'
      target_price REAL NOT NULL,
      target_horizon_months INTEGER DEFAULT 12,
      source_account TEXT
    )
  `);

  // Seed standard sources if empty
  const countRow = await get<{ count: number }>(`SELECT COUNT(*) as count FROM data_sources`);
  if (!countRow || countRow.count === 0) {
    const seedSources: DataSourceRecord[] = [
      {
        source_id: 'NSE_BHAVCOPY_OFFICIAL',
        display_name: 'NSE/BSE Official Bhavcopy & Corporate Announcements',
        category: 'MARKET_DATA',
        access_method: 'OFFICIAL_API',
        tos_status: 'COMPLIANT',
        reliability_tier: 1,
        refresh_cadence: 'DAILY_POST_MARKET',
        notes: 'Ground truth for prices, corporate actions, and calendar'
      },
      {
        source_id: 'BROKER_APIS_LICENSED',
        display_name: 'Zerodha Kite Connect / Upstox v2',
        category: 'MARKET_DATA',
        access_method: 'OFFICIAL_API',
        tos_status: 'COMPLIANT',
        reliability_tier: 1,
        refresh_cadence: 'REALTIME_STREAM',
        notes: 'Live market feed and holdings sync'
      },
      {
        source_id: 'EXCHANGE_FILINGS_BULK_PLEDGE',
        display_name: 'BSE/NSE Bulk/Block Deals & Promoter Pledge Disclosures',
        category: 'REGULATORY_FILING',
        access_method: 'OFFICIAL_API',
        tos_status: 'COMPLIANT',
        reliability_tier: 1,
        refresh_cadence: 'DAILY_INTRADAY',
        notes: 'Statutory exchange disclosures'
      },
      {
        source_id: 'PUBLISHER_RSS_FEEDS',
        display_name: 'Business News (ET, Mint, BS, Reuters) RSS',
        category: 'NEWS',
        access_method: 'RSS',
        tos_status: 'COMPLIANT',
        reliability_tier: 2,
        refresh_cadence: 'HOURLY',
        notes: 'Headline and snippet ingestion for material events'
      },
      {
        source_id: 'SCREENER_IN_FUNDAMENTALS',
        display_name: 'Screener.in Financial Ratios & Shareholding',
        category: 'FUNDAMENTAL',
        access_method: 'MANUAL_EXPORT',
        tos_status: 'REQUIRES_REVIEW',
        reliability_tier: 2,
        refresh_cadence: 'QUARTERLY_POST_EARNINGS',
        notes: 'Manual authenticated export mode pending official API license'
      },
      {
        source_id: 'TRENDLYNE_ANALYTICS',
        display_name: 'Trendlyne SWOT & Analyst Consensus',
        category: 'TECHNICAL_AGGREGATOR',
        access_method: 'OFFICIAL_API',
        tos_status: 'COMPLIANT',
        reliability_tier: 2,
        refresh_cadence: 'DAILY',
        notes: 'Corroboration input only'
      },
      {
        source_id: 'NSE_FNO_OPTIONS_CHAIN',
        display_name: 'NSE F&O Options Chain & PCR Analytics',
        category: 'OPTIONS',
        access_method: 'OFFICIAL_API',
        tos_status: 'COMPLIANT',
        reliability_tier: 1,
        refresh_cadence: '30_MIN_INTERVAL',
        notes: 'Derivatives positioning and max pain'
      },
      {
        source_id: 'SOCIAL_RETAIL_SENTIMENT',
        display_name: 'Retail Sentiment & Social Chatter',
        category: 'SOCIAL',
        access_method: 'OFFICIAL_API',
        tos_status: 'REQUIRES_REVIEW',
        reliability_tier: 4,
        refresh_cadence: 'DAILY',
        notes: 'Capped low-weight sentiment, corroboration only'
      }
    ];

    for (const s of seedSources) {
      await run(`
        INSERT OR IGNORE INTO data_sources
        (source_id, display_name, category, access_method, tos_status, reliability_tier, refresh_cadence, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [s.source_id, s.display_name, s.category, s.access_method, s.tos_status, s.reliability_tier, s.refresh_cadence, s.notes || '']);
    }
  }
}

export function computeUnifiedConviction(
  symbol: string,
  inputs: ConvictionComponentInput,
  portfolioContext: {
    portfolioDrawdownPct: number;
    calibratedHistoryCount: number;
    adv20DayShares?: number;
    portfolioNavINR?: number;
  }
): FusedConvictionResult {
  const W_TECHNICAL = 0.35;
  const W_FUNDAMENTAL = 0.25;
  const W_FLOW = 0.15;
  const W_OPTIONS = 0.10;
  const W_NEWS = 0.08;
  const W_SENTIMENT = 0.02;
  const W_THIRDPARTY = 0.05;

  const techScore = inputs.technicalProbability !== undefined ? Math.min(1.0, Math.max(0, inputs.technicalProbability)) : 0.5;
  const fundScore = inputs.fundamentalScore !== undefined ? Math.min(1.0, Math.max(0, inputs.fundamentalScore / 100)) : 0.5;
  const flowScore = inputs.institutionalFlowScore !== undefined ? Math.min(1.0, Math.max(0, inputs.institutionalFlowScore / 100)) : 0.5;
  const optionsScore = inputs.optionsPositioningScore !== undefined ? Math.min(1.0, Math.max(0, inputs.optionsPositioningScore / 100)) : 0.5;
  const newsScore = inputs.newsEventScore !== undefined ? Math.min(1.0, Math.max(0, (inputs.newsEventScore + 50) / 100)) : 0.5;
  const rawSentiment = inputs.retailSentimentScore !== undefined ? Math.min(1.0, Math.max(0, (inputs.retailSentimentScore + 20) / 40)) : 0.5;
  const thirdPartyScore = inputs.thirdPartyCorroboration !== undefined ? Math.min(1.0, Math.max(0, inputs.thirdPartyCorroboration / 100)) : 0.5;

  const rawConviction =
    W_TECHNICAL * techScore +
    W_FUNDAMENTAL * fundScore +
    W_FLOW * flowScore +
    W_OPTIONS * optionsScore +
    W_NEWS * newsScore +
    W_SENTIMENT * rawSentiment +
    W_THIRDPARTY * thirdPartyScore;

  const convictionScore = roundINR(rawConviction, 4);

  const isRecommendation = (portfolioContext.calibratedHistoryCount || 0) >= 15 && convictionScore >= 0.65;
  const isInformationalOnly = !isRecommendation;

  let circuitBreakerActive = false;
  let circuitBreakerReason: string | undefined = undefined;
  let maxKellyAllocationPct = 0;

  if (portfolioContext.portfolioDrawdownPct >= 0.25) {
    circuitBreakerActive = true;
    circuitBreakerReason = `Portfolio drawdown of ${(portfolioContext.portfolioDrawdownPct * 100).toFixed(1)}% exceeds the 25% catastrophic risk circuit breaker. New capital deployment locked to 0%.`;
    maxKellyAllocationPct = 0;
  } else if (portfolioContext.portfolioDrawdownPct >= 0.15) {
    circuitBreakerReason = `Portfolio drawdown in yellow zone (${(portfolioContext.portfolioDrawdownPct * 100).toFixed(1)}%). Sizing penalized by 50%.`;
    const baseKelly = isRecommendation ? (convictionScore - 0.5) * 2 * 0.05 : 0;
    maxKellyAllocationPct = roundINR(Math.max(0, baseKelly * 0.5) * 100, 2);
  } else {
    const baseKelly = isRecommendation ? (convictionScore - 0.5) * 2 * 0.05 : 0;
    maxKellyAllocationPct = roundINR(Math.max(0, baseKelly) * 100, 2);
  }

  maxKellyAllocationPct = Math.min(5.0, maxKellyAllocationPct);

  return {
    symbol,
    convictionScore,
    isRecommendation,
    isInformationalOnly,
    componentsBreakdown: {
      technical: { raw: roundINR(techScore, 2), weighted: roundINR(techScore * W_TECHNICAL, 4), weight: W_TECHNICAL, calibrated: (portfolioContext.calibratedHistoryCount || 0) >= 15 },
      fundamental: { raw: roundINR(fundScore, 2), weighted: roundINR(fundScore * W_FUNDAMENTAL, 4), weight: W_FUNDAMENTAL },
      flow: { raw: roundINR(flowScore, 2), weighted: roundINR(flowScore * W_FLOW, 4), weight: W_FLOW },
      options: { raw: roundINR(optionsScore, 2), weighted: roundINR(optionsScore * W_OPTIONS, 4), weight: W_OPTIONS },
      news: { raw: roundINR(newsScore, 2), weighted: roundINR(newsScore * W_NEWS, 4), weight: W_NEWS },
      sentiment: { raw: roundINR(rawSentiment, 2), weighted: roundINR(rawSentiment * W_SENTIMENT, 4), weight: W_SENTIMENT, capped: true },
      thirdParty: { raw: roundINR(thirdPartyScore, 2), weighted: roundINR(thirdPartyScore * W_THIRDPARTY, 4), weight: W_THIRDPARTY }
    },
    circuitBreakerActive,
    circuitBreakerReason,
    maxKellyAllocationPct
  };
}

export async function saveConvictionScore(result: FusedConvictionResult): Promise<void> {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  await run(`
    INSERT INTO unified_conviction_scores
    (symbol, as_of_date, conviction_score, is_recommendation, components_breakdown, hard_circuit_breaker_active, zero_size_reason, max_kelly_fraction, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      as_of_date = excluded.as_of_date,
      conviction_score = excluded.conviction_score,
      is_recommendation = excluded.is_recommendation,
      components_breakdown = excluded.components_breakdown,
      hard_circuit_breaker_active = excluded.hard_circuit_breaker_active,
      zero_size_reason = excluded.zero_size_reason,
      max_kelly_fraction = excluded.max_kelly_fraction,
      created_at = excluded.created_at
  `, [
    result.symbol,
    today,
    result.convictionScore,
    result.isRecommendation ? 1 : 0,
    JSON.stringify(result.componentsBreakdown),
    result.circuitBreakerActive ? 1 : 0,
    result.circuitBreakerReason || null,
    result.maxKellyAllocationPct,
    now
  ]);
}

export async function getConvictionScore(symbol: string): Promise<any | null> {
  const row = await get(`SELECT * FROM unified_conviction_scores WHERE symbol = ?`, [symbol]);
  if (!row) return null;
  return {
    ...row,
    components_breakdown: JSON.parse((row as any).components_breakdown || '{}')
  };
}

// ─── PHASE 7: EXTERNAL INTELLIGENCE HELPER SERVICES ─────────────────────────

export async function getRegisteredDataSources(): Promise<DataSourceRecord[]> {
  return all<DataSourceRecord>(`SELECT * FROM data_sources ORDER BY reliability_tier ASC, source_id ASC`);
}

export async function recordSourceRun(runData: {
  run_id: string;
  source_id: string;
  started_at_utc: string;
  completed_at_utc?: string;
  records_ingested?: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  error_detail?: string;
}): Promise<void> {
  await run(`
    INSERT OR REPLACE INTO source_adapter_runs
    (run_id, source_id, started_at_utc, completed_at_utc, records_ingested, status, error_detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    runData.run_id,
    runData.source_id,
    runData.started_at_utc,
    runData.completed_at_utc || null,
    runData.records_ingested || 0,
    runData.status,
    runData.error_detail || null
  ]);
}

export async function getSourceRuns(limit = 20): Promise<any[]> {
  return all(`SELECT * FROM source_adapter_runs ORDER BY started_at_utc DESC LIMIT ?`, [limit]);
}

// SRC-2: Fundamental Conflicts
export async function recordFundamentalConflict(conflict: {
  symbol: string;
  metric: string;
  source_a: string;
  value_a: number;
  source_b: string;
  value_b: number;
  max_deviation_pct: number;
  as_of: string;
  resolution_note?: string;
}): Promise<void> {
  await run(`
    INSERT INTO fundamental_metric_conflicts
    (symbol, metric, source_a, value_a, source_b, value_b, max_deviation_pct, as_of, resolved, resolution_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `, [
    conflict.symbol.toUpperCase(),
    conflict.metric,
    conflict.source_a,
    conflict.value_a,
    conflict.source_b,
    conflict.value_b,
    conflict.max_deviation_pct,
    conflict.as_of,
    conflict.resolution_note || null
  ]);
}

export async function getFundamentalConflicts(symbol?: string): Promise<any[]> {
  if (symbol) {
    return all(`SELECT * FROM fundamental_metric_conflicts WHERE symbol = ? ORDER BY as_of DESC`, [symbol.toUpperCase()]);
  }
  return all(`SELECT * FROM fundamental_metric_conflicts ORDER BY as_of DESC LIMIT 50`);
}

// SRC-3: News Events
export async function recordNewsEvent(event: {
  event_id: string;
  published_at: string;
  source_id: string;
  headline: string;
  entity_keys: string;
  event_type: string;
  dedup_cluster_id?: string;
  sentiment_score?: number;
}): Promise<void> {
  await run(`
    INSERT OR REPLACE INTO news_events
    (event_id, published_at, source_id, headline, entity_keys, event_type, dedup_cluster_id, sentiment_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    event.event_id,
    event.published_at,
    event.source_id,
    event.headline,
    event.entity_keys,
    event.event_type,
    event.dedup_cluster_id || null,
    event.sentiment_score ?? null
  ]);
}

export async function getNewsEvents(symbol?: string, limit = 50): Promise<any[]> {
  if (symbol) {
    return all(`
      SELECT * FROM news_events
      WHERE entity_keys LIKE ?
      ORDER BY published_at DESC LIMIT ?
    `, [`%${symbol.toUpperCase()}%`, limit]);
  }
  return all(`SELECT * FROM news_events ORDER BY published_at DESC LIMIT ?`, [limit]);
}

// SRC-4: Social Sentiment
export async function recordSocialSentiment(sentiment: {
  symbol: string;
  date: string;
  mention_count: number;
  positive_pct: number;
  negative_pct: number;
  manipulation_risk: 'LOW' | 'MEDIUM' | 'HIGH';
  score_used_in_fusion?: boolean;
}): Promise<void> {
  const used = sentiment.score_used_in_fusion !== undefined
    ? (sentiment.score_used_in_fusion ? 1 : 0)
    : (sentiment.manipulation_risk === 'HIGH' ? 0 : 1);

  await run(`
    INSERT INTO social_sentiment_daily
    (symbol, date, mention_count, positive_pct, negative_pct, manipulation_risk, score_used_in_fusion)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date) DO UPDATE SET
      mention_count = excluded.mention_count,
      positive_pct = excluded.positive_pct,
      negative_pct = excluded.negative_pct,
      manipulation_risk = excluded.manipulation_risk,
      score_used_in_fusion = excluded.score_used_in_fusion
  `, [
    sentiment.symbol.toUpperCase(),
    sentiment.date,
    sentiment.mention_count,
    sentiment.positive_pct,
    sentiment.negative_pct,
    sentiment.manipulation_risk,
    used
  ]);
}

export async function getSocialSentiment(symbol: string): Promise<any[]> {
  return all(`
    SELECT * FROM social_sentiment_daily
    WHERE symbol = ?
    ORDER BY date DESC LIMIT 30
  `, [symbol.toUpperCase()]);
}

// SRC-6: Options Metrics
export async function recordDerivedOptionsMetrics(metrics: {
  symbol: string;
  as_of_date: string;
  pcr_oi: number;
  pcr_volume: number;
  max_pain_strike: number;
  iv_skew_25delta?: number;
  unusual_oi_buildup_strikes?: string[];
}): Promise<void> {
  await run(`
    INSERT INTO derived_options_metrics
    (symbol, as_of_date, pcr_oi, pcr_volume, max_pain_strike, iv_skew_25delta, unusual_oi_buildup_strikes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, as_of_date) DO UPDATE SET
      pcr_oi = excluded.pcr_oi,
      pcr_volume = excluded.pcr_volume,
      max_pain_strike = excluded.max_pain_strike,
      iv_skew_25delta = excluded.iv_skew_25delta,
      unusual_oi_buildup_strikes = excluded.unusual_oi_buildup_strikes
  `, [
    metrics.symbol.toUpperCase(),
    metrics.as_of_date,
    metrics.pcr_oi,
    metrics.pcr_volume,
    metrics.max_pain_strike,
    metrics.iv_skew_25delta ?? null,
    metrics.unusual_oi_buildup_strikes ? JSON.stringify(metrics.unusual_oi_buildup_strikes) : null
  ]);
}

export async function getDerivedOptionsMetrics(symbol: string): Promise<any | null> {
  const row = await get(`
    SELECT * FROM derived_options_metrics
    WHERE symbol = ?
    ORDER BY as_of_date DESC LIMIT 1
  `, [symbol.toUpperCase()]);
  if (!row) return null;
  return {
    ...row,
    unusual_oi_buildup_strikes: (row as any).unusual_oi_buildup_strikes ? JSON.parse((row as any).unusual_oi_buildup_strikes) : []
  };
}

// SRC-7: Broker Research Reports
export async function recordBrokerResearch(report: {
  symbol: string;
  broker_name: string;
  report_date: string;
  rating: 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL';
  target_price: number;
  target_horizon_months?: number;
  source_account?: string;
}): Promise<void> {
  await run(`
    INSERT INTO broker_research_reports
    (symbol, broker_name, report_date, rating, target_price, target_horizon_months, source_account)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    report.symbol.toUpperCase(),
    report.broker_name,
    report.report_date,
    report.rating,
    report.target_price,
    report.target_horizon_months || 12,
    report.source_account || null
  ]);
}

export async function getBrokerResearchReports(symbol: string): Promise<any[]> {
  return all(`
    SELECT * FROM broker_research_reports
    WHERE symbol = ?
    ORDER BY report_date DESC LIMIT 20
  `, [symbol.toUpperCase()]);
}

// SRC-8: Source Reliability Weight Calculation
export async function calculateSourceReliabilityWeight(sourceId: string, asOfDate?: string): Promise<{
  source_id: string;
  reliability_tier: number;
  base_weight: number;
  recency_decay: number;
  final_reliability_weight: number;
}> {
  const src = await get<DataSourceRecord>(`SELECT * FROM data_sources WHERE source_id = ?`, [sourceId]);
  const tier = src ? src.reliability_tier : 3;
  const baseWeightMap: Record<number, number> = { 1: 1.0, 2: 0.75, 3: 0.45, 4: 0.15 };
  const baseWeight = baseWeightMap[tier] || 0.40;

  // Recency decay calculation: 10% decay per 30 days old
  let recency = 1.0;
  if (asOfDate) {
    const ageDays = Math.max(0, (Date.now() - new Date(asOfDate).getTime()) / (1000 * 60 * 60 * 24));
    recency = Math.max(0.2, 1.0 - (ageDays / 30) * 0.10);
  }

  const finalWeight = roundINR(baseWeight * recency, 4);

  return {
    source_id: sourceId,
    reliability_tier: tier,
    base_weight: baseWeight,
    recency_decay: roundINR(recency, 4),
    final_reliability_weight: finalWeight
  };
}
