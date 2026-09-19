import { ResearchHypothesis } from './ResearchHypothesisRegistry';
import { ResearchExperiment } from './ResearchExperimentRegistry';
import { ResearchConfiguration } from './ResearchConfigurationRegistry';

export const PREDECLARED_HYPOTHESES: ResearchHypothesis[] = [
  {
    hypothesisId: 'H-RS-001',
    hypothesisFamilyId: 'HF-RS',
    title: 'Mansfield Relative Strength Breakout Confirmation',
    description: 'Requires scrip 63-day relative strength versus NIFTY 500 index to be positive and rising at breakout.',
    economicMechanism: 'Capital flows concentrate in securities outperforming the broader market during momentum regimes.',
    candidateType: 'CONFIRMATION',
    parentStrategyIds: ['S8', 'S6'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'DAILY_OHLCV', lookbackDays: 63, mandatory: true, frequency: 'EOD' },
      { dataDomain: 'MARKET_INDEX', lookbackDays: 63, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { rsLookback: 63, threshold: 0.0 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Scrips outperforming benchmark index over 63 days exhibit higher breakout follow-through and lower whipsaw rate.',
      mechanism: 'Institutional liquidity momentum selectively supports leading scrips while lagging scrips face selling on rallies.',
      expectedObservableEffect: 'Reduction in false breakout stop-outs, leading to higher win rate and improved R-expectancy.',
      failureMechanism: 'Sudden market rotation out of high-beta momentum into defensive sectors causes simultaneous sharp reversals.',
      dataRequired: ['DAILY_OHLCV', 'MARKET_INDEX'],
      knownLimitations: 'RS can lag sharp V-shaped market bottoms; prone to false signals during choppy sideways index consolidations.',
      predeclaredParameters: { rsLookback: 63, threshold: 0.0 }
    }
  },
  {
    hypothesisId: 'H-TREND-001',
    hypothesisFamilyId: 'HF-TREND',
    title: 'Multi-Timeframe Weekly Trend Alignment',
    description: 'Confirms that weekly 10-period EMA is above weekly 30-period EMA before daily breakout entry.',
    economicMechanism: 'Aligning short-term entries with intermediate-term trend structure reduces counter-trend trap exposure.',
    candidateType: 'CONFIRMATION',
    parentStrategyIds: ['S8', 'S11'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'DAILY_OHLCV', lookbackDays: 150, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { fastWeeklyEma: 10, slowWeeklyEma: 30 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Breakouts aligned with intermediate weekly trend have higher probability of sustaining multi-week extensions.',
      mechanism: 'Higher-timeframe trend filters out low-conviction minor counter-trend bounces.',
      expectedObservableEffect: 'Lower trade frequency, improved average win / average loss ratio, lower peak drawdown.',
      failureMechanism: 'Late entries at extended weekly trends near cyclical blow-off tops.',
      dataRequired: ['DAILY_OHLCV'],
      knownLimitations: 'Introduces lag during rapid structural trend changes.',
      predeclaredParameters: { fastWeeklyEma: 10, slowWeeklyEma: 30 }
    }
  },
  {
    hypothesisId: 'H-VCP-001',
    hypothesisFamilyId: 'HF-VCP',
    title: 'Volatility Contraction Pattern (VCP) Confirmation',
    description: 'Verifies 20-day historical volatility contraction prior to breakout expansion.',
    economicMechanism: 'Decreasing supply float volatility indicates supply absorption before institutional expansion.',
    candidateType: 'FILTER',
    parentStrategyIds: ['S8', 'S12'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'DAILY_OHLCV', lookbackDays: 40, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { contractionRatioThreshold: 0.65 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Prior volatility contraction significantly reduces initial adverse excursion (MAE) upon breakout.',
      mechanism: 'Diminishing volatility reflects supply dry-up, meaning minimal selling resistance remains when buying pressure resumes.',
      expectedObservableEffect: 'Tight initial stop distances feasible, increasing R-multiple realized on profitable runs.',
      failureMechanism: 'False tight consolidation created by low liquidity rather than institutional accumulation.',
      dataRequired: ['DAILY_OHLCV'],
      knownLimitations: 'Requires at least 3-4 weeks of prior consolidation base; eliminates early-stage bottom reversals.',
      predeclaredParameters: { contractionRatioThreshold: 0.65 }
    }
  },
  {
    hypothesisId: 'H-ATR-001',
    hypothesisFamilyId: 'HF-ATR',
    title: 'ATR-Normalized Breakout Expansion Confirmation',
    description: 'Requires breakout candle range to exceed 1.5x of 14-day ATR.',
    economicMechanism: 'Large range breakout expansion demonstrates institutional commitment to break resistance.',
    candidateType: 'CONFIRMATION',
    parentStrategyIds: ['S8', 'S13'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'DAILY_OHLCV', lookbackDays: 20, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { atrMultiplierThreshold: 1.5, atrPeriod: 14 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Breakout bars expanding significantly beyond normal daily ATR confirm aggressive market-order absorption.',
      mechanism: 'Initiating orders overwhelm passive limit depth, causing outsized price expansion.',
      expectedObservableEffect: 'Eliminates sluggish, low-conviction tests of resistance that frequently fail.',
      failureMechanism: 'Exhaustion bars that gap up into illiquidity and immediately reverse (climax tops).',
      dataRequired: ['DAILY_OHLCV'],
      knownLimitations: 'Entry price is higher due to larger bar range, slightly increasing nominal stop distance.',
      predeclaredParameters: { atrMultiplierThreshold: 1.5, atrPeriod: 14 }
    }
  },
  {
    hypothesisId: 'H-VOLUME-001',
    hypothesisFamilyId: 'HF-VOLUME',
    title: 'Volume Expansion Confirmation',
    description: 'Requires breakout volume to be at least 1.75x of 20-day Average Daily Volume (ADV).',
    economicMechanism: 'High turnover confirms broad institutional sponsorship rather than retail retail drift.',
    candidateType: 'CONFIRMATION',
    parentStrategyIds: ['S8', 'S11'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'DAILY_OHLCV', lookbackDays: 20, mandatory: true, frequency: 'EOD' },
      { dataDomain: 'VOLUME_ADV', lookbackDays: 20, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { advMultiplierThreshold: 1.75, advLookback: 20 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Breakout volume exceeding 1.75x ADV indicates institutional institutional participation and supply clearance.',
      mechanism: 'Large block trades and mutual fund/FII accumulation create persistent demand buffer.',
      expectedObservableEffect: 'Sharply increased post-breakout velocity and reduced 5-day retracement probability.',
      failureMechanism: 'High-volume churn/distribution where large sellers use liquidity of breakout to offload blocks.',
      dataRequired: ['DAILY_OHLCV', 'VOLUME_ADV'],
      knownLimitations: 'Can be distorted by block/bulk deals or index rebalancing flows.',
      predeclaredParameters: { advMultiplierThreshold: 1.75, advLookback: 20 }
    }
  },
  {
    hypothesisId: 'H-QUALITY-001',
    hypothesisFamilyId: 'HF-QUALITY',
    title: 'Financial Quality Exclusion Gate',
    description: 'Excludes scrips with negative TTM operating cash flow or severe debt deterioration.',
    economicMechanism: 'Firms with poor financial quality suffer violent insolvency or capital destruction gaps on negative news.',
    candidateType: 'FILTER',
    parentStrategyIds: ['S8', 'S16'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'FINANCIAL_STATEMENTS', lookbackDays: 365, mandatory: true, frequency: 'QUARTERLY' }
    ],
    allowedParameters: { minOcfEbitdaRatio: 0.5 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Filtering out low-quality accounting scrips eliminates severe left-tail downside gap disasters.',
      mechanism: 'Fundamental earnings quality prevents narrative momentum traps in financially fragile scrips.',
      expectedObservableEffect: 'Significant truncation of max loss outliers; lower tail risk and lower portfolio MaxDD.',
      failureMechanism: 'Misses aggressive speculative turnaround rallies in distressed cyclicals.',
      dataRequired: ['FINANCIAL_STATEMENTS'],
      knownLimitations: 'Quarterly financial statements have reporting lag (45 days post-quarter end).',
      predeclaredParameters: { minOcfEbitdaRatio: 0.5 }
    }
  },
  {
    hypothesisId: 'H-LIQUIDITY-001',
    hypothesisFamilyId: 'HF-LIQUIDITY',
    title: 'Liquidity Participation Constraint Gate',
    description: 'Restricts candidate selection to scrips where target order size <= 1.5% of 20-day ADV.',
    economicMechanism: 'Excessive order size relative to market depth generates market impact slippage that destroys net edge.',
    candidateType: 'RISK_CONTROL',
    parentStrategyIds: ['S8', 'S17', 'S18'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'VOLUME_ADV', lookbackDays: 20, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { maxParticipationPct: 0.015 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Strictly limiting order participation to <= 1.5% ADV preserves capacity up to ₹10 Cr with negligible slippage.',
      mechanism: 'Prevents moving market depth and incurring non-linear square-root market impact costs.',
      expectedObservableEffect: 'Realized net P&L remains close to gross P&L across institutional capital scales.',
      failureMechanism: 'Excludes high-momentum micro/small caps with low float that might offer strong individual returns.',
      dataRequired: ['VOLUME_ADV'],
      knownLimitations: 'Reduces total opportunity universe size in mid/small-cap segments.',
      predeclaredParameters: { maxParticipationPct: 0.015 }
    }
  },
  {
    hypothesisId: 'H-MARKET-001',
    hypothesisFamilyId: 'HF-MARKET',
    title: 'Market Regime Alignment Confirmation',
    description: 'Suppresses long breakout entries when NIFTY 500 is in Bear or High Volatility regime.',
    economicMechanism: 'Broad market tailwinds dominate individual scrip momentum; long breakouts fail at high rates in bear regimes.',
    candidateType: 'CONTEXT',
    parentStrategyIds: ['S8', 'S9'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'MARKET_INDEX', lookbackDays: 60, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { allowedRegimes: ['BULL_LOW', 'BULL_NORMAL', 'SIDEWAYS_LOW'] },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Disabling long breakout entries during Bear and High Volatility macro regimes preserves portfolio equity.',
      mechanism: 'Systemic liquidity withdrawals trigger correlations approaching 1.0, pulling down even fundamentally sound scrips.',
      expectedObservableEffect: 'Elimination of consecutive loss clusters during market corrections, greatly improving Sortino ratio.',
      failureMechanism: 'Extended cash drag if market enters prolonged sideways choppy consolidation with strong stock-specific moves.',
      dataRequired: ['MARKET_INDEX'],
      knownLimitations: 'Regime filters can lag sudden violent bottoming bounces (e.g. March 2020 recovery).',
      predeclaredParameters: { allowedRegimes: ['BULL_LOW', 'BULL_NORMAL', 'SIDEWAYS_LOW'] }
    }
  },
  {
    hypothesisId: 'H-SECTOR-001',
    hypothesisFamilyId: 'HF-SECTOR',
    title: 'Sector Relative Strength Confirmation',
    description: 'Requires scrip sector index to be in top 50th percentile of sector momentum versus NIFTY 500.',
    economicMechanism: 'Sector rotation accounts for ~50% of individual equity momentum variance.',
    candidateType: 'CONFIRMATION',
    parentStrategyIds: ['S6', 'S8', 'S12'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'SECTOR_INDEX', lookbackDays: 60, mandatory: true, frequency: 'EOD' },
      { dataDomain: 'MARKET_INDEX', lookbackDays: 60, mandatory: true, frequency: 'EOD' }
    ],
    allowedParameters: { minSectorPercentile: 50 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Scrips belonging to outperforming sectors benefit from sector ETF flows and institutional basket buying.',
      mechanism: 'Industry group momentum creates a rising-tide effect that lifts constituents.',
      expectedObservableEffect: 'Higher percentage of winning trades and extended average holding periods on winners.',
      failureMechanism: 'Sharp sector rotation after parabolic sector rallies leaves late entrants trapped.',
      dataRequired: ['SECTOR_INDEX', 'MARKET_INDEX'],
      knownLimitations: 'Requires robust scrip-to-sector classification mapping.',
      predeclaredParameters: { minSectorPercentile: 50 }
    }
  },
  {
    hypothesisId: 'H-EVENT-001',
    hypothesisFamilyId: 'HF-EVENT',
    title: 'Earnings Announcement Proximity Risk Filter',
    description: 'Suppresses new entries within 3 trading days prior to declared quarterly earnings board meetings.',
    economicMechanism: 'Binary earnings events introduce unhedgeable gap risk that violates normal technical stop parameters.',
    candidateType: 'RISK_CONTROL',
    parentStrategyIds: ['S8', 'S11', 'S13'],
    engineIds: ['CandidateFilterEngine'],
    universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
    requiredData: [
      { dataDomain: 'CORPORATE_ACTIONS', lookbackDays: 30, mandatory: true, frequency: 'EVENT_DRIVEN' }
    ],
    allowedParameters: { embargoDaysPrior: 3 },
    predeclaredWFOId: 'WFO_STANDARD_6W_2020_2026',
    predeclaredStatisticalMethodId: 'IID_BLOCK_BOOTSTRAP_BHFDR',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    status: 'PREDECLARED',
    oosLocked: true,
    rationale: {
      hypothesis: 'Avoiding entries immediately prior to earnings announcements prevents large overnight gap-down stop slippage.',
      mechanism: 'Quarterly earnings surprises cause discontinuous price jumps where stop orders cannot execute at stop price.',
      expectedObservableEffect: 'Drastic reduction in catastrophic slippage losses (> 2R losses eliminated).',
      failureMechanism: 'Misses occasional large post-earnings gap-ups that run for multi-month trends.',
      dataRequired: ['CORPORATE_ACTIONS'],
      knownLimitations: 'Depends on timely corporate disclosure of board meeting dates to stock exchanges.',
      predeclaredParameters: { embargoDaysPrior: 3 }
    }
  }
];
