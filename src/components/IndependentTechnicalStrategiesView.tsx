import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  Zap,
  AlertTriangle,
  Award,
  Flame,
  Radio,
  Download,
  ArrowUpDown,
  Table as TableIcon,
  Play,
  X,
  Sliders,
  Plus
} from 'lucide-react';
import { downloadCsv } from '../lib/csvExport.js';
import StrategyBuilderPanel from './StrategyBuilderPanel.js';

// ── Re-export all types from original file ──
export interface RuleCheck {
  id: string;
  name: string;
  passed: boolean;
  actualValue: string | number;
  benchmarkRule: string;
  explanation: string;
}

export interface Strategy1Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number;
  peakHigh: number;
  impulseDurationBars: number;
  impulseGainPct: number;
  baseDurationBars: number;
  retracementFloor: number;
  lowestBaseClose: number;
  atrRatio: number;
  volumeDryingRatio: number;
  vpaAsymmetryRatio: number;
  isNr4: boolean;
  isNr7: boolean;
  ema9: number;
  ema21: number;
  ema9OverEma21: boolean;
  rsi14: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  preceding52WeekLow?: number | null;
  p0DistancePctFrom52wLow?: number | null;
  isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy2Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  impulseGainPct: number;
  cumulativeTurnoverCr: number;
  institutionalInflowDate: string;
  institutionalDayTurnoverCr: number;
  institutionalVolumeRatio: number;
  pullbackDurationBars: number;
  pullbackDropPct: number;
  pullbackVolumeDrying: boolean;
  priceRangeCompacted: boolean;
  priceContractionAtEntry?: boolean;
  vpaAlignmentAtEntry?: boolean;
  entryRangeContractionRatio?: number;
  entryVolumeDryingRatio?: number;
  activeFvg: {
    topPrice: number;
    bottomPrice: number;
    ceLevel: number;
    sizePct: number;
  } | null;
  entryZone: {
    recommendedEntryPrice: number;
    fvgTop: number;
    fvgBottom: number;
    ceLevel: number;
  } | null;
  invalidationStopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  preceding52WeekLow?: number | null;
  p0DistancePctFrom52wLow?: number | null;
  isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy3Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number;
  h1: number;
  l1: number;
  h2: number;
  l2: number;
  p0Date?: string;
  h1Date?: string;
  l1Date?: string;
  h2Date?: string;
  l2Date?: string;
  sma200AtP0?: number | null;
  p0DistancePctFromSma200?: number | null;
  impulseGainPct: number;
  impulseCumulativeTurnoverCr: number;
  impulseDurationBars: number;
  smartMoneyInImpulse: boolean;
  firstPullbackDurationBars: number;
  firstPullbackDropPct: number;
  firstPullbackVolumeDrying: boolean;
  firstPullbackRangeCompacted: boolean;
  secondLegGainPct: number;
  secondPullbackDurationBars: number;
  secondPullbackRangeCompacted: boolean;
  recommendedEntryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  smartMoneyInvolvedInLastMove: boolean;
  smartMoneyNotification: string;
  preceding52WeekLow?: number | null;
  p0DistancePctFrom52wLow?: number | null;
  isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy4Result {
  qualified: boolean;
  symbol: string;
  companyName: string;
  cmp: number;
  p0: number;
  h1: number;
  l1: number;
  h2: number;
  l2: number;
  p0Date?: string;
  h1Date?: string;
  l1Date?: string;
  h2Date?: string;
  l2Date?: string;
  sma200AtP0: number | null;
  p0SmaDeviationPct: number | null;
  p0NearSma200: boolean;
  entryVpaContraction: boolean;
  vpaDryingRatio: number;
  rangeContractionRatio: number;
  impulseGainPct: number;
  impulseCumulativeTurnoverCr: number;
  impulseDurationBars: number;
  smartMoneyInImpulse: boolean;
  firstPullbackDurationBars: number;
  firstPullbackDropPct: number;
  firstPullbackVolumeDrying: boolean;
  firstPullbackRangeCompacted: boolean;
  secondLegGainPct: number;
  secondPullbackDurationBars: number;
  secondPullbackRangeCompacted: boolean;
  recommendedEntryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  smartMoneyInvolvedInLastMove: boolean;
  smartMoneyNotification: string;
  preceding52WeekLow?: number | null;
  p0DistancePctFrom52wLow?: number | null;
  isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy5Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  ema50: number | null; sma200: number | null; rsi14: number | null;
  atr14: number | null; volumeDryingRatio: number | null; atrBelowAverage: boolean;
  stopLoss: number | null; target1: number | null; target2: number | null;
  riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy6Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  high52w: number | null; base20RangePct: number | null; volumeSurgeRatio: number | null;
  rsi14: number | null; stopLoss: number | null; target1: number | null; target2: number | null;
  riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy7Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  rsi14: number | null; lowerBB: number | null; capitulationCandle: boolean;
  reversalConfirmed: boolean; requiresNextOpenEntry: boolean;
  stopLoss: number | null; target1: number | null; target2: number | null;
  riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy8Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  flagPoleGainPct: number | null; flagRangePct: number | null; adrPct: number | null;
  volumeSurgeRatio: number | null; stopLoss: number | null; target1: number | null;
  target2: number | null; riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy9Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  volumeDryUpRatio: number | null; adrPct: number | null; volumeSurgeRatio: number | null;
  stopLoss: number | null; target1: number | null; target2: number | null;
  riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export interface Strategy10Result {
  qualified: boolean; symbol: string; companyName: string; cmp: number;
  lowerHighsCount: number | null; trendlineBreak: boolean; requiresIntradayConfirmation: boolean;
  stopLoss: number | null; target1: number | null; target2: number | null;
  riskRewardRatio: number | null; signalStatus?: string; signalAge?: number;
  preceding52WeekLow?: number | null; p0DistancePctFrom52wLow?: number | null; isAtPreceding52WeekLow?: boolean;
  ruleChecks: RuleCheck[];
}

export type AnyStrategyResult = Strategy1Result | Strategy2Result | Strategy3Result | Strategy4Result
  | Strategy5Result | Strategy6Result | Strategy7Result | Strategy8Result | Strategy9Result | Strategy10Result;

export interface MultiConvergenceMatch {
  symbol: string;
  companyName: string;
  cmp: number;
  matchedStrategies: ('STRATEGY_1' | 'STRATEGY_2' | 'STRATEGY_3' | 'STRATEGY_4' | 'STRATEGY_5' | 'STRATEGY_6' | 'STRATEGY_7' | 'STRATEGY_8' | 'STRATEGY_9' | 'STRATEGY_10')[];
  convergenceCount: number;
  strategy1?: Strategy1Result;
  strategy2?: Strategy2Result;
  strategy3?: Strategy3Result;
  strategy4?: Strategy4Result;
  strategy5?: Strategy5Result;
  strategy6?: Strategy6Result;
  strategy7?: Strategy7Result;
  strategy8?: Strategy8Result;
  strategy9?: Strategy9Result;
  strategy10?: Strategy10Result;
}

export interface IndependentTechnicalScanReport {
  generatedAt: string;
  totalUniverseScanned: number;
  strategy1Matches: Strategy1Result[];
  strategy2Matches: Strategy2Result[];
  strategy3Matches: Strategy3Result[];
  strategy4Matches?: Strategy4Result[];
  strategy5Matches?: Strategy5Result[];
  strategy6Matches?: Strategy6Result[];
  strategy7Matches?: Strategy7Result[];
  strategy8Matches?: Strategy8Result[];
  strategy9Matches?: Strategy9Result[];
  strategy10Matches?: Strategy10Result[];
  multiConvergenceMatches: MultiConvergenceMatch[];
}

export interface ComparisonMatrixRow {
  symbol: string; companyName: string; cmp: number;
  s1Qualified: boolean; s1?: Strategy1Result;
  s2Qualified: boolean; s2?: Strategy2Result;
  s3Qualified: boolean; s3?: Strategy3Result;
  s4Qualified: boolean; s4?: Strategy4Result;
  s5Qualified: boolean; s5?: Strategy5Result;
  s6Qualified: boolean; s6?: Strategy6Result;
  s7Qualified: boolean; s7?: Strategy7Result;
  s8Qualified: boolean; s8?: Strategy8Result;
  s9Qualified: boolean; s9?: Strategy9Result;
  s10Qualified: boolean; s10?: Strategy10Result;
  convergenceCount: number;
  bestRiskReward: number;
  bestTarget: number;
  bestStopLoss: number;
  smartMoneyAlert: string;
}

export interface IndependentTechnicalStrategiesViewProps {
  onSelectSymbol?: (symbol: string) => void;
}

interface StrategyLibraryItem {
  id: string;
  name: string;
  description?: string;
  isBuiltIn: boolean;
}

interface ScanProgressItem {
  strategyId: string;
  strategyName: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  qualified: number;
  total: number;
  error?: string;
}

interface Strategy {
  id: string;
  name: string;
  short_name?: string;
  description?: string;
  isBuiltIn?: boolean;
  is_preset?: boolean;
}

interface ScanResults {
  [strategyId: string]: Array<{ symbol: string; companyName?: string }>;
}

export const IndependentTechnicalStrategiesView: React.FC<IndependentTechnicalStrategiesViewProps> = ({
  onSelectSymbol
}) => {
  // ── Core state ──
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ── Phase B: All strategies + cached results ──
  const [allStrategies, setAllStrategies] = useState<Strategy[]>([]);
  const [cachedResults, setCachedResults] = useState<ScanResults | null>(null);
  const [latestScanMetadata, setLatestScanMetadata] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Left panel state ──
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(true);
  const [strategyLibrary, setStrategyLibrary] = useState<StrategyLibraryItem[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(new Set(['STRATEGY_1', 'STRATEGY_2', 'STRATEGY_3', 'STRATEGY_4']));
  const [universeCount, setUniverseCount] = useState<number>(0);
  const [scanProgress, setScanProgress] = useState<ScanProgressItem[]>([]);
  const [liveProgress, setLiveProgress] = useState<{
    percent: number;
    scanned: number;
    total: number;
    current_symbol?: string;
    qualified_count?: number;
    status?: string;
  } | null>(null);

  // ── Right panel state ──
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'INDIVIDUAL' | 'CONVERGENCE' | 'PROGRESS'>('MATRIX');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Table search & sort
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string>('convergenceCount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Scrip inspector
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [inspectedScrip, setInspectedScrip] = useState<any>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [filterPreceding52wLow, setFilterPreceding52wLow] = useState<boolean>(false);

  // ── Strategy Builder Panel ──
  const [showStrategyBuilder, setShowStrategyBuilder] = useState<boolean>(false);

  // Initialize: fetch strategy library, universe count, and cached results
  useEffect(() => {
    const initializeITAS = async () => {
      try {
        const [libRes, countRes, cachedRes] = await Promise.all([
          fetch('/api/strategies/library'),
          fetch('/api/strategies/universe-count'),
          fetch('/api/strategies/scan-cache/latest')
        ]);

        // Load all strategies (built-in + custom)
        if (libRes.ok) {
          const libJson = await libRes.json();
          const allStrats = libJson.success
            ? (Array.isArray(libJson.data) ? libJson.data : (libJson.data?.all || libJson.data?.presets || []))
            : [];
          if (allStrats.length > 0) {
            const normalized = allStrats.map((s: any) => ({
              ...s,
              isBuiltIn: !!(s.is_preset || s.isBuiltIn)
            }));
            setStrategyLibrary(normalized);
            setAllStrategies(normalized);
            // Default selection: select ALL built-in strategies (remove the previous 4 limit)
            const builtInIds = normalized.filter((s: any) => s.isBuiltIn).map((s: any) => s.id);
            if (builtInIds.length > 0) {
              setSelectedStrategies(new Set(builtInIds));
            }
            console.log(`[ITAS] Loaded ${normalized.length} strategies`);
          }
        }

        // Load universe count
        if (countRes.ok) {
          const countJson = await countRes.json();
          if (countJson.success) {
            const count = typeof countJson.count === 'number'
              ? countJson.count
              : (typeof countJson.data === 'number'
                ? countJson.data
                : (countJson.data?.count ?? 0));
            setUniverseCount(count);
          }
        }

        // Load cached pre-calculated results (instant - from 5 min background scan)
        if (cachedRes.ok) {
          const cachedData = await cachedRes.json();
          if (cachedData.success) {
            setCachedResults(cachedData.data?.results || null);
            setLatestScanMetadata(cachedData.data?.metadata);
            console.log(`[ITAS] Loaded cached results`);
          }
        }

        // Check if a scan is currently running in background
        try {
          const progressRes = await fetch('/api/strategies/progress');
          if (progressRes.ok) {
            const pData = await progressRes.json();
            if (pData.status === 'RUNNING') {
              setIsRefreshing(true);
              setLiveProgress({
                percent: pData.percent ?? 0,
                scanned: pData.scanned ?? 0,
                total: pData.total ?? 3000,
                current_symbol: pData.current_symbol || '',
                qualified_count: pData.qualified_count || 0,
                status: 'RUNNING'
              });
            }
          }
        } catch {}
      } catch (err: any) {
        console.error('[ITAS] Init error:', err);
      }
    };
    initializeITAS();
  }, []);

  // Poll scan progress while loading
  useEffect(() => {
    if (!loading || scanProgress.length === 0) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch('/api/technical-strategies/scan-progress');
        const j = await r.json();
        if (j.success && Array.isArray(j.data)) setScanProgress(j.data);
      } catch { /* silent */ }
    }, 1500);
    return () => clearInterval(iv);
  }, [loading]);

  // Poll progress while refreshing cached results
  useEffect(() => {
    if (!isRefreshing) return;
    const checkProgress = async () => {
      try {
        const progressRes = await fetch('/api/strategies/progress');
        const pData = await progressRes.json();
        
        if (pData.status === 'RUNNING') {
          setLiveProgress({
            percent: pData.percent ?? 0,
            scanned: pData.scanned ?? 0,
            total: pData.total ?? 3000,
            current_symbol: pData.current_symbol || '',
            qualified_count: pData.qualified_count || 0,
            status: 'RUNNING'
          });

          if (pData.strategy_matches) {
            const stratNames: { [k: string]: string } = {
              'S1_VPA_BASE_BREAKOUT': 'VPA Base Breakout',
              'S2_INSTITUTIONAL_FVG_CE': 'Institutional FVG/CE',
              'S3_HH_HL_COMPACTION': 'HH/HL Compaction',
              'S4_HH_HL_SMA200_VPA': 'HH/HL + SMA200 + VPA',
              'S5_50EMA_PULLBACK_VCP': '50 EMA Pullback VCP',
              'S6_RS_BREAKOUT': 'RS Breakout (Nifty 500)',
              'S7_RSI_MEAN_REVERSION': 'RSI Mean-Reversion Dip',
              'S8_HIGH_TIGHT_FLAG': 'High Tight Flag (HTF)',
              'S9_VOLUME_DRYUP_RS': 'Volume Dry-Up + RS',
              'S10_TRENDLINE_ORB': 'Trendline ORB'
            };
            const items: ScanProgressItem[] = Object.keys(stratNames).map(id => ({
              strategyId: id,
              strategyName: stratNames[id],
              status: 'running',
              qualified: pData.strategy_matches[id] || 0,
              total: pData.scanned || pData.total || 3000
            }));
            setScanProgress(items);
          }
        } else if (pData.status === 'IDLE') {
          clearInterval(progressInterval);
          setLiveProgress(null);
          // Scan finished, reload cache
          try {
            const cachedRes = await fetch('/api/strategies/scan-cache/latest');
            if (cachedRes.ok) {
              const cachedData = await cachedRes.json();
              if (cachedData.success) {
                setCachedResults(cachedData.data?.results || null);
                setLatestScanMetadata(cachedData.data?.metadata);
              }
            }
          } catch {}
          setIsRefreshing(false);
        }
      } catch { /* silent */ }
    };
    
    const progressInterval = setInterval(checkProgress, 1000);
    checkProgress();
    return () => clearInterval(progressInterval);
  }, [isRefreshing]);

  const handleRefreshNow = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/strategies/scan-multi/background', { method: 'POST' });
      if (!res.ok) {
        setError('Failed to start refresh');
        setIsRefreshing(false);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
      setIsRefreshing(false);
    }
  };

  const handleStrategyBuilderSave = async (newStrategy: any) => {
    try {
      const res = await fetch('/api/strategies/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStrategy)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to save strategy');
      }

      const result = await res.json();
      console.log('[ITAS] Strategy saved:', result);

      // Refresh strategy library
      const libRes = await fetch('/api/strategies/library');
      if (libRes.ok) {
        const libJson = await libRes.json();
        const allStrats = libJson.success
          ? (Array.isArray(libJson.data) ? libJson.data : (libJson.data?.all || libJson.data?.presets || []))
          : [];
        const normalized = allStrats.map((s: any) => ({
          ...s,
          isBuiltIn: !!(s.is_preset || s.isBuiltIn)
        }));
        setAllStrategies(normalized);
        setStrategyLibrary(normalized);
      }

      // Trigger refresh to include new strategy
      handleRefreshNow();

      setShowStrategyBuilder(false);
    } catch (err: any) {
      console.error('[ITAS] Strategy save error:', err);
      setError(err.message || 'Failed to save strategy');
    }
  };

  // Helper to format time
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  // Helper to calculate minutes ago
  const calculateMinutesAgo = () => {
    if (!latestScanMetadata?.timestamp) return 'Unknown';
    try {
      const scanTime = new Date(latestScanMetadata.timestamp).getTime();
      const now = new Date().getTime();
      const diffMinutes = Math.floor((now - scanTime) / 60000);
      return diffMinutes;
    } catch {
      return 'Unknown';
    }
  };

  const handleRunSelected = async () => {
    // Instead of a synchronous scan, we just trigger the background engine to refresh the cache.
    // The background engine already scans ALL active strategies against the entire universe.
    await handleRefreshNow();
    setActiveTab('MATRIX');
  };

  const handleRunAll = async () => {
    setSelectedStrategies(new Set(strategyLibrary.map(s => s.id)));
    setTimeout(() => handleRunSelected(), 0);
  };

  const toggleStrategy = (id: string) => {
    const newSet = new Set(selectedStrategies);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStrategies(newSet);
  };

  // Build Master Comparison Matrix Rows
  const masterComparisonRows: ComparisonMatrixRow[] = useMemo(() => {
    if (!cachedResults) return [];
    const rowsList: any[] = [];
    if (Array.isArray(cachedResults)) {
      rowsList.push(...cachedResults);
    } else if (typeof cachedResults === 'object' && cachedResults !== null) {
      for (const [sId, arr] of Object.entries(cachedResults)) {
        if (Array.isArray(arr)) {
          for (const item of arr) {
            rowsList.push({ ...item, strategy_id: item.strategy_id || sId });
          }
        }
      }
    }
    if (rowsList.length === 0) return [];

    const map = new Map<string, ComparisonMatrixRow>();

    const getOrCreate = (sym: string): ComparisonMatrixRow => {
      if (!map.has(sym)) {
        map.set(sym, {
          symbol: sym, companyName: sym, cmp: 0,
          s1Qualified: false, s2Qualified: false, s3Qualified: false, s4Qualified: false,
          s5Qualified: false, s6Qualified: false, s7Qualified: false,
          s8Qualified: false, s9Qualified: false, s10Qualified: false,
          convergenceCount: 0, bestRiskReward: 0, bestTarget: 0, bestStopLoss: 0, smartMoneyAlert: ''
        });
      }
      return map.get(sym)!;
    };

    // Add all strategy matches from cache
    for (const m of rowsList) {
      if (!m.qualified) continue;
      
      const row = getOrCreate(m.symbol);
      row.cmp = m.entry_price || m.cmp || row.cmp;
      
      // Parse JSON rule checks
      let ruleChecks = [];
      if (m.rule_checks_json) {
        try { ruleChecks = typeof m.rule_checks_json === 'string' ? JSON.parse(m.rule_checks_json) : m.rule_checks_json; } catch(e) {}
      } else if (Array.isArray(m.ruleChecks)) {
        ruleChecks = m.ruleChecks;
      }
      
      const mappedStratData: any = {
        symbol: m.symbol,
        companyName: m.companyName || m.symbol,
        cmp: m.entry_price || m.cmp || row.cmp,
        riskRewardRatio: m.rr_ratio || m.riskRewardRatio,
        target1: m.target1,
        target2: m.target2,
        stopLoss: m.stop_loss || m.stopLoss,
        ruleChecks: ruleChecks,
        smartMoneyInvolvedInLastMove: false,
        smartMoneyNotification: ''
      };

      if (m.strategy_id === 'S1_VPA_BASE_BREAKOUT') { row.s1Qualified = true; row.s1 = mappedStratData; }
      else if (m.strategy_id === 'S2_INSTITUTIONAL_FVG_CE') { row.s2Qualified = true; row.s2 = mappedStratData; }
      else if (m.strategy_id === 'S3_HH_HL_COMPACTION') { row.s3Qualified = true; row.s3 = mappedStratData; }
      else if (m.strategy_id === 'S4_HH_HL_SMA200_VPA') { row.s4Qualified = true; row.s4 = mappedStratData; }
      else if (m.strategy_id === 'S5_50EMA_PULLBACK_VCP') { row.s5Qualified = true; row.s5 = mappedStratData; }
      else if (m.strategy_id === 'S6_RS_BREAKOUT') { row.s6Qualified = true; row.s6 = mappedStratData; }
      else if (m.strategy_id === 'S7_RSI_MEAN_REVERSION') { row.s7Qualified = true; row.s7 = mappedStratData; }
      else if (m.strategy_id === 'S8_HIGH_TIGHT_FLAG') { row.s8Qualified = true; row.s8 = mappedStratData; }
      else if (m.strategy_id === 'S9_VOLUME_DRYUP_RS') { row.s9Qualified = true; row.s9 = mappedStratData; }
      else if (m.strategy_id === 'S10_TRENDLINE_ORB') { row.s10Qualified = true; row.s10 = mappedStratData; }
    }

    // Compute convergence count and best R:R for each row
    const list = Array.from(map.values()).map(row => {
      const count = [row.s1Qualified, row.s2Qualified, row.s3Qualified, row.s4Qualified,
        row.s5Qualified, row.s6Qualified, row.s7Qualified, row.s8Qualified, row.s9Qualified, row.s10Qualified]
        .filter(Boolean).length;
      const rr = Math.max(
        row.s1?.riskRewardRatio || 0, row.s2?.riskRewardRatio || 0,
        row.s3?.riskRewardRatio || 0, row.s4?.riskRewardRatio || 0,
        row.s5?.riskRewardRatio || 0, row.s6?.riskRewardRatio || 0,
        row.s7?.riskRewardRatio || 0, row.s8?.riskRewardRatio || 0,
        row.s9?.riskRewardRatio || 0, row.s10?.riskRewardRatio || 0
      );
      const target = Math.max(
        row.s1?.target1 || 0, row.s2?.target1 || 0, row.s3?.target1 || 0, row.s4?.target1 || 0,
        row.s5?.target1 || 0, row.s6?.target1 || 0, row.s7?.target1 || 0,
        row.s8?.target1 || 0, row.s9?.target1 || 0, row.s10?.target1 || 0
      );
      const sl = row.s4?.stopLoss || row.s3?.stopLoss || row.s2?.invalidationStopLoss || row.s1?.stopLoss || 0;
      return { ...row, convergenceCount: count, bestRiskReward: rr, bestTarget: target, bestStopLoss: sl };
    });

    return list;
  }, [cachedResults]);

  // Filtered & Sorted rows
  const filteredComparisonRows = useMemo(() => {
    let list = [...masterComparisonRows];
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(r => r.symbol.toLowerCase().includes(q) || r.companyName.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let valA: any = (a as any)[sortColumn];
      let valB: any = (b as any)[sortColumn];

      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc'
        ? Number(valA || 0) - Number(valB || 0)
        : Number(valB || 0) - Number(valA || 0);
    });

    return list;
  }, [masterComparisonRows, tableSearch, sortColumn, sortDirection]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'symbol' || col === 'companyName' ? 'asc' : 'desc');
    }
  };

  // CSV Export functions
  const handleExportMatrixCsv = () => {
    const headers = [
      'Symbol', 'Company Name', 'CMP (INR)', 'Convergence Count', 'Best Risk Reward Ratio',
      'Strategy 1: VPA Compaction', 'Strategy 2: FVG Pullback', 'Strategy 3: HH HL Compaction',
      'Strategy 4: SMA200+VPA', 'Strategy 5: 50EMA VCP', 'Strategy 6: RS Break',
      'Strategy 7: RSI Dip', 'Strategy 8: HTF', 'Strategy 9: VDU-RS', 'Strategy 10: TL-ORB'
    ];

    const rows = filteredComparisonRows.map(r => [
      r.symbol,
      r.companyName,
      r.cmp,
      `${r.convergenceCount}/10`,
      r.bestRiskReward ? `${r.bestRiskReward}x` : '--',
      r.s1Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s2Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s3Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s4Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s5Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s6Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s7Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s8Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s9Qualified ? 'QUALIFIED ✓' : 'FAILED ✗',
      r.s10Qualified ? 'QUALIFIED ✓' : 'FAILED ✗'
    ]);

    downloadCsv('itas_comparison_matrix', headers, rows);
  };

  const handleExportConvergenceCsv = () => {
    if (!convergenceAnalysis || convergenceAnalysis.length === 0) return;
    const headers = ['Symbol', 'Company Name', 'CMP (INR)', 'Convergence Count'];
    const rows = convergenceAnalysis.map(c => [
      c.symbol,
      c.companyName,
      c.cmp,
      `${c.count}/10`
    ]);
    downloadCsv('itas_convergence_setups', headers, rows);
  };

  // Helper to map strategy ID to qualified field
  const getQualifiedField = (strategyId: string): keyof ComparisonMatrixRow => {
    const idUpper = strategyId.toUpperCase();
    const mapping: Record<string, keyof ComparisonMatrixRow> = {
      'STRATEGY_1': 's1Qualified',
      'STRATEGY_2': 's2Qualified',
      'STRATEGY_3': 's3Qualified',
      'STRATEGY_4': 's4Qualified',
      'STRATEGY_5': 's5Qualified',
      'STRATEGY_6': 's6Qualified',
      'STRATEGY_7': 's7Qualified',
      'STRATEGY_8': 's8Qualified',
      'STRATEGY_9': 's9Qualified',
      'STRATEGY_10': 's10Qualified',
    };
    return mapping[idUpper] || 's1Qualified';
  };

  // Build convergence analysis from cached results
  const convergenceAnalysis = useMemo(() => {
    if (!cachedResults || !masterComparisonRows) return [];

    const convergenceMap = new Map<string, { count: number; companyName: string; cmp: number }>();

    masterComparisonRows.forEach(row => {
      let convergenceCount = 0;
      // Count strategies that qualified for this symbol
      if (row.s1Qualified) convergenceCount++;
      if (row.s2Qualified) convergenceCount++;
      if (row.s3Qualified) convergenceCount++;
      if (row.s4Qualified) convergenceCount++;
      if (row.s5Qualified) convergenceCount++;
      if (row.s6Qualified) convergenceCount++;
      if (row.s7Qualified) convergenceCount++;
      if (row.s8Qualified) convergenceCount++;
      if (row.s9Qualified) convergenceCount++;
      if (row.s10Qualified) convergenceCount++;

      if (convergenceCount >= 3) {
        convergenceMap.set(row.symbol, {
          count: convergenceCount,
          companyName: row.companyName,
          cmp: row.cmp
        });
      }
    });

    return Array.from(convergenceMap.entries())
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [masterComparisonRows, cachedResults]);

  return (
    <div className="flex gap-4 h-screen text-slate-100 font-sans bg-slate-950">
      {/* ── LEFT PANEL (320px COLLAPSIBLE) ── */}
      <div
        className={`transition-all duration-300 overflow-hidden flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-lg ${
          leftPanelOpen ? 'w-80' : 'w-14'
        }`}
      >
        <button
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          className="w-full p-3 flex items-center justify-between text-white hover:bg-slate-800 transition border-b border-slate-800"
        >
          {leftPanelOpen && <span className="text-xs font-bold uppercase">Strategy Builder</span>}
          <ChevronDown className={`w-4 h-4 transition-transform ${leftPanelOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>

        {leftPanelOpen && (
          <div className="flex-1 overflow-y-auto space-y-4 p-4">
            {/* Strategy Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase">Strategy Preset</label>
              <select className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white cursor-pointer focus:outline-none focus:border-indigo-500">
                <option>Select Preset...</option>
                <option>4-Strategy (S1-S4)</option>
                <option>All 10 Strategies</option>
                <option>Momentum Only (S5-S10)</option>
              </select>
              <div className="flex gap-1 text-[10px]">
                <button className="flex-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition">+ New</button>
                <button className="flex-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer transition">Clone</button>
              </div>
            </div>

            {/* Multi-Select Strategies */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase flex items-center justify-between">
                <span>Select Strategies</span>
                <span className="text-[10px] text-indigo-400">{selectedStrategies.size}/{strategyLibrary.length}</span>
              </label>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {strategyLibrary.map(strategy => (
                  <label key={strategy.id} className="flex items-center gap-2 cursor-pointer group p-2 rounded hover:bg-slate-800 transition">
                    <input
                      type="checkbox"
                      checked={selectedStrategies.has(strategy.id)}
                      onChange={() => toggleStrategy(strategy.id)}
                      className="w-3 h-3 rounded cursor-pointer accent-indigo-500"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition font-medium">{strategy.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Run Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                onClick={handleRunSelected}
                disabled={loading || selectedStrategies.size === 0}
                className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
              >
                <Play className="w-3 h-3" />
                Run Selected ({selectedStrategies.size})
              </button>
              <button
                onClick={handleRunAll}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Run All ({strategyLibrary.length})
              </button>
            </div>

            {/* Universe Info */}
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-[11px] text-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold">Universe</span>
                <span className="text-indigo-400 font-mono text-[10px]">{universeCount.toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-slate-400">All NSE equities ever traded</p>
            </div>

            {/* 52-Week Filter */}
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800 transition">
              <input
                type="checkbox"
                checked={filterPreceding52wLow}
                onChange={e => setFilterPreceding52wLow(e.target.checked)}
                className="w-3 h-3 rounded cursor-pointer accent-amber-500"
              />
              <span className="text-xs text-slate-300 font-medium">52-Week Low Origin</span>
            </label>

            {/* ── PARAMETER GROUPS PANEL ── */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                <Sliders className="w-3 h-3 text-indigo-400" /> Parameter Groups
              </label>
              <p className="text-[10px] text-slate-500">Showing parameters for the selected strategy preset. Use the Parameter Editor to modify and save custom strategies.</p>

              {/* Show parameter families for first selected strategy */}
              {strategyLibrary.length > 0 && (() => {
                const firstId = Array.from(selectedStrategies)[0];
                const strat = strategyLibrary.find(s => s.id === firstId);
                if (!strat || !(strat as any).parameters) return null;
                const params = (strat as any).parameters;

                const families: Array<{ key: string; label: string; color: string; items: string[] }> = [
                  { key: 'universe', label: '🌍 Universe & Liquidity', color: 'text-sky-400', items: [
                    `Market Cap ≥ ${params.universe?.marketCapFloorCr ?? 0} Cr`,
                    `ADTV ≥ ${params.universe?.adtvFloorCr ?? 0} Cr`,
                    `Index: ${params.universe?.indexMembership ?? 'ANY'}`,
                  ]},
                  { key: 'trend', label: '📈 Trend Alignment', color: 'text-emerald-400', items: [
                    `RSI Period: ${params.trend?.rsiPeriod ?? 14}`,
                    `RSI Floor: ${params.trend?.rsiBullishFloor ?? 50}`,
                    `Above SMA200: ${params.trend?.priceAboveSma200 ? 'Yes' : 'No'}`,
                  ]},
                  { key: 'impulse', label: '⚡ Impulse / Momentum', color: 'text-amber-400', items: [
                    `Min Gain: ${params.impulse?.impulseGainMinPct ?? 15}%`,
                    `Duration: ${params.impulse?.impulseDurationMinBars ?? 4}–${params.impulse?.impulseDurationMaxBars ?? 25} bars`,
                  ]},
                  { key: 'pullback', label: '🔄 Pullback / Base', color: 'text-violet-400', items: [
                    `Base: ${params.pullback?.baseDurationMinBars ?? 10}–${params.pullback?.baseDurationMaxBars ?? 30} bars`,
                    `Consolidation ≤ ${params.pullback?.consolidationRangeMaxPct ?? 12}%`,
                  ]},
                  { key: 'volume', label: '📊 Volume', color: 'text-cyan-400', items: [
                    `Drying ≤ ${params.volume?.volumeDryingRatio ?? 0.8}×`,
                    `Surge ≥ ${params.volume?.volumeSurgeMultiplier ?? 2}×`,
                    `VPA Asymmetry ≥ ${params.volume?.vpaAsymmetryRatioMin ?? 1.15}×`,
                  ]},
                  { key: 'volatility', label: '🌀 Volatility', color: 'text-pink-400', items: [
                    `ATR Contraction ≤ ${params.volatility?.atrContractionRatioMax ?? 0.85}`,
                    `NR4: ${params.volatility?.nr4Enabled ? 'On' : 'Off'} | NR7: ${params.volatility?.nr7Enabled ? 'On' : 'Off'}`,
                  ]},
                  { key: 'entry', label: '🎯 Entry Trigger', color: 'text-orange-400', items: [
                    `Type: ${params.entry?.entryTriggerType ?? 'VPA_BASE_BREAKOUT'}`,
                    `Lookback: ${params.entry?.breakoutLookbackBars ?? 20} bars`,
                  ]},
                  { key: 'risk', label: '🛡️ Risk Management', color: 'text-red-400', items: [
                    `SL: ${params.risk?.stopLossMethod ?? 'FIXED_PCT'}`,
                    `T1: ${params.risk?.target1Method ?? 'RR_MULTIPLE'} (${params.risk?.target1RRMultiplier ?? 2}×)`,
                    `Trail: ${params.risk?.trailingStopMethod ?? 'EMA_CLOSE'}`,
                    `Max Risk: ${params.risk?.maxPortfolioRiskPct ?? 1}% portfolio`,
                  ]},
                ];

                return (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-indigo-300 font-bold mb-1">
                      📋 {strat.name}
                    </div>
                    {families.map(fam => (
                      <details key={fam.key} className="group">
                        <summary className={`flex items-center gap-1.5 text-[11px] font-bold cursor-pointer py-1 px-2 rounded hover:bg-slate-800 transition list-none ${fam.color}`}>
                          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                          {fam.label}
                        </summary>
                        <div className="mt-1 ml-4 space-y-1">
                          {fam.items.map((item, i) => (
                            <div key={i} className="text-[10px] text-slate-400 bg-slate-800/50 rounded px-2 py-0.5 font-mono">
                              {item}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                    <a
                      href="#strategy-editor"
                      className="block w-full text-center mt-2 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 transition cursor-pointer border border-slate-700"
                    >
                      ✏️ Open Full Parameter Editor
                    </a>
                  </div>
                );
              })()}
            </div>

          </div>
        )}
      </div>

      {/* ── RIGHT PANEL (MAIN CONTENT) ── */}
      <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-800 to-indigo-950/40 border-b border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Crosshair className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-black text-white">ITAS - Phase 2 Refactor</h1>
                <p className="text-xs text-slate-400">Scanning {allStrategies.length} Strategies × {universeCount.toLocaleString()} Stocks</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs text-slate-400 font-mono">
                {latestScanMetadata && `Last Updated: ${formatTime(latestScanMetadata.timestamp)} (${calculateMinutesAgo()} min ago)`}
              </div>
              {!latestScanMetadata && (
                <div className="text-xs text-amber-400">No cached results yet. Run a scan first.</div>
              )}
            </div>
          </div>

          {/* Progress bar while refreshing */}
          {isRefreshing && (
            <div className="space-y-2 p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 shadow-inner">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                  </span>
                  <span className="text-white font-bold">
                    Scanning 10 Strategies across Universe
                    {liveProgress?.current_symbol ? ` • Processing ${liveProgress.current_symbol}` : ''}
                  </span>
                </div>
                <span className="text-indigo-300 font-mono font-bold text-xs">
                  {liveProgress?.percent || 0}% ({liveProgress?.scanned?.toLocaleString() || 0} / {liveProgress?.total?.toLocaleString() || '3,000'})
                  {liveProgress?.qualified_count !== undefined ? ` • ${liveProgress.qualified_count} Setups Found` : ''}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-300 rounded-full" 
                  style={{ width: `${Math.max(4, liveProgress?.percent || 0)}%` }} 
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 bg-slate-950/50 flex-wrap">
          <button
            onClick={() => setActiveTab('MATRIX')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'MATRIX'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Comparison Matrix
            {masterComparisonRows.length > 0 && <span className="text-[10px] ml-1">({masterComparisonRows.length})</span>}
          </button>

          <button
            onClick={() => setActiveTab('CONVERGENCE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
              activeTab === 'CONVERGENCE'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Convergence Highlights
            {convergenceAnalysis.length > 0 && <span className="text-[10px] ml-1">({convergenceAnalysis.length})</span>}
          </button>

          <button
            onClick={() => setActiveTab('PROGRESS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'PROGRESS'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Scan Progress
          </button>

          <div className="flex-1" />

          {/* Refresh button */}
          <button
            onClick={handleRefreshNow}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>

          {/* New Strategy button */}
          <button
            onClick={() => setShowStrategyBuilder(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Strategy
          </button>

          <button
            onClick={() => window.open('/api/strategies/export/excel', '_blank')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            placeholder="Search by symbol or company..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {error && (
            <div className="m-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {activeTab === 'PROGRESS' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                    {isRefreshing ? 'Real-Time Strategy Scanner Progress' : 'Strategy Universe Scan Breakdown'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isRefreshing 
                      ? `Scanning active universe (${liveProgress?.scanned || 0} / ${liveProgress?.total || '3,000'} stocks evaluated)` 
                      : `Pre-calculated cache status for ${universeCount.toLocaleString()} stocks`}
                  </p>
                </div>
                {liveProgress?.current_symbol && (
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                    Current: {liveProgress.current_symbol}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scanProgress.map(item => (
                  <div key={item.strategyId} className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2 hover:border-slate-600 transition">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${item.status === 'running' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
                        {item.strategyName}
                      </span>
                      <span className="text-cyan-400 font-mono font-bold">{item.qualified} Qualified Setups</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300 rounded-full" 
                        style={{ width: `${Math.min(100, Math.max(5, (item.qualified / Math.max(1, item.total)) * 1000))}%` }} 
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Status: {item.status.toUpperCase()}</span>
                      <span>Evaluated: {item.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && activeTab === 'MATRIX' && filteredComparisonRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-800 text-slate-300 border-b border-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">
                      <button onClick={() => handleSort('symbol')} className="flex items-center gap-1 hover:text-white transition">
                        Symbol {sortColumn === 'symbol' && (sortDirection === 'asc' ? '▲' : '▼')}
                      </button>
                    </th>
                    <th className="py-2 px-3 text-right">CMP (₹)</th>
                    {allStrategies.map(strat => (
                      <th key={strat.id} className="py-2 px-3 text-center" title={strat.name}>
                        <span className="text-[10px]">{strat.short_name || strat.name}</span>
                      </th>
                    ))}
                    <th className="py-2 px-3 text-center">
                      <button onClick={() => handleSort('convergenceCount')} className="flex items-center gap-1 hover:text-white transition">
                        Conv {sortColumn === 'convergenceCount' && (sortDirection === 'asc' ? '▲' : '▼')}
                      </button>
                    </th>
                    <th className="py-2 px-3 text-right">
                      <button onClick={() => handleSort('bestRiskReward')} className="flex items-center gap-1 hover:text-white transition">
                        R:R {sortColumn === 'bestRiskReward' && (sortDirection === 'asc' ? '▲' : '▼')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredComparisonRows.map(row => (
                    <tr key={row.symbol} className="hover:bg-slate-800 transition">
                      <td className="py-2 px-3 font-bold text-white">{row.symbol}</td>
                      <td className="py-2 px-3 text-right">₹{row.cmp.toLocaleString()}</td>
                      {allStrategies.map(strat => {
                        const qualifiedField = getQualifiedField(strat.id);
                        const isQualified = (row as any)[qualifiedField];
                        return (
                          <td key={strat.id} className="py-2 px-3 text-center">
                            {isQualified ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 inline" />
                            ) : (
                              <XCircle className="w-3 h-3 text-slate-600 inline" />
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          row.convergenceCount >= 3 ? 'bg-purple-500/30 text-purple-300' : 'text-slate-400'
                        }`}>
                          {row.convergenceCount}/{allStrategies.length}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">{row.bestRiskReward ? `${row.bestRiskReward}x` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && activeTab === 'CONVERGENCE' && convergenceAnalysis && convergenceAnalysis.length > 0 && (
            <div className="p-4 flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
              {convergenceAnalysis.map(item => (
                <div key={item.symbol} className="min-w-[280px] w-[280px] bg-slate-800/60 border border-slate-700 p-4 rounded-xl shadow-lg relative group">
                  <div className="absolute top-3 right-3 text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded text-[10px] font-bold">
                    {item.count} Strategies
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    {item.symbol}
                  </h3>
                  <div className="text-xs text-slate-400 truncate mb-3">₹{item.cmp?.toLocaleString() || '0.00'}</div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-2xl font-black text-slate-200">₹{item.cmp?.toLocaleString() || '0.00'}</div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setTableSearch(item.symbol);
                      setActiveTab('MATRIX');
                    }}
                    className="w-full mt-2 py-2 text-xs font-bold text-slate-900 bg-slate-100 hover:bg-white rounded transition-colors uppercase tracking-wider"
                  >
                    View Detail Matrix
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && activeTab === 'CONVERGENCE' && (!convergenceAnalysis || convergenceAnalysis.length === 0) && (
            <div className="p-8 text-center text-slate-500">
              <Sparkles className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-300 mb-1">No convergence matches found.</p>
              <p className="text-xs text-slate-400">Run multiple strategies to see convergence highlights.</p>
            </div>
          )}

          {/* Convergence Analysis Summary (shown after MATRIX tab) */}
          {!loading && activeTab === 'MATRIX' && filteredComparisonRows.length > 0 && convergenceAnalysis.length > 0 && (
            <div className="p-4 border-t border-slate-800 bg-slate-800/50">
              <h2 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Top Convergence Opportunities (3+ Strategies)
              </h2>
              <div className="space-y-2">
                {convergenceAnalysis.map((item, idx) => {
                  const pct = Math.round((item.count / allStrategies.length) * 100);
                  return (
                    <div key={item.symbol} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900 border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 w-4 text-right">{idx + 1}.</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-white">{item.symbol}</span>
                          <span className="text-slate-400 text-[10px]">₹{item.cmp.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-purple-300 text-[10px] font-bold whitespace-nowrap">{item.count}/{allStrategies.length} ({pct}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && activeTab === 'MATRIX' && filteredComparisonRows.length === 0 && !cachedResults && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Activity className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-300 mb-1">No cached results yet. Refreshing...</p>
              <p className="text-xs text-slate-400">Choose from {allStrategies.length} available strategies</p>
            </div>
          )}
        </div>
      </div>

      {/* Strategy Builder Panel Modal */}
      <StrategyBuilderPanel
        isOpen={showStrategyBuilder}
        onClose={() => setShowStrategyBuilder(false)}
        onSave={handleStrategyBuilderSave}
      />
    </div>
  );
};

export default IndependentTechnicalStrategiesView;
