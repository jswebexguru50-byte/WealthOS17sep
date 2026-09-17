import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShieldAlert,
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  SlidersHorizontal,
  Download,
  Copy,
  Check,
  Eye,
  Crosshair,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Target,
  Percent,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  BarChart2,
  Info,
  Flame,
  AlertTriangle,
  Lock,
  PieChart as PieIcon,
  CheckCircle2,
  XCircle,
  History,
  RotateCcw,
  Wallet,
  DollarSign,
  Activity,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle
} from 'lucide-react';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';
import { MomentumReasoningPanel } from './MomentumReasoningPanel.js';

export interface AutonomousRecommendation {
  id?: number;
  symbol: string;
  companyName: string;
  sector: string;
  action: 'ENTER_LONG_BREAKOUT' | 'ENTER_LONG_PULLBACK' | 'SQUARE_OFF_PROFIT' | 'SQUARE_OFF_STOP' | 'TIGHTEN_TRAILING_STOP';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  stopLossPct: number;
  target1: number;
  target1GainPct: number;
  target2: number;
  target2GainPct: number;
  riskRewardRatio: number;
  timeframe: '1_TO_3_DAYS' | 'SWING_1_TO_2_WEEKS' | 'POSITIONAL_1_MONTH';
  probabilityPct: number;
  confidenceScore: number;
  promoterPct: number;
  fiiPct: number;
  diiPct: number;
  retailFloatPct: number;
  floatSqueezeRatio: number;
  floatRegime: 'INSTITUTIONAL_LOCK_SQUEEZE' | 'INSTITUTIONAL_ACCUMULATION' | 'RETAIL_DOMINATED' | 'BALANCED' | 'DISTRIBUTION_PRESSURE';
  fnoBuildup: 'LONG_BUILD_UP' | 'SHORT_COVERING' | 'SHORT_BUILD_UP' | 'LONG_UNWINDING' | 'NEUTRAL';
  putCallRatio: number;
  rsiValue: number;
  bollingerStatus: string;
  volumeSurgeRatio: number;
  reasoningSummary: string;
  reasoningTraceJson: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'TARGET_HIT' | 'STOPPED_OUT' | 'DISMISSED';
  smcMarketStructure?: string;
  smcLiquiditySweep?: string;
  smcOrderBlock?: string;
  smcFvgPresent?: boolean;
  smcPremiumDiscount?: string;
  smcChecklistScore?: number;
  smcTradeSetupJson?: string;
  createdAt?: string;
}

export interface AutonomousAlert {
  id?: number;
  symbol: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  title: string;
  message: string;
  category: 'BREAKOUT' | 'FLOAT_SQUEEZE' | 'SQUARE_OFF' | 'MOMENTUM_ACCELERATION' | 'RISK_DEFENSE';
  actionRequired: boolean;
  dismissed: number;
  createdAt?: string;
}

export interface AgentHealth {
  agentUp: boolean;
  lastScanTimestamp: string;
  lastScanLatencyMs: number;
  totalScansCompleted: number;
  consecutiveErrors: number;
  activeRecommendationsCount: number;
  activeAlertsCount: number;
  currentIntervalSeconds: number;
  isMarketHours: boolean;
}

export interface QualityMetrics {
  totalCalls: number;
  activeCalls: number;
  wonCalls: number;
  lostCalls: number;
  winRatePct: number;
  profitFactor: number;
  totalRealizedPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyRatio: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  benchmarkNiftyReturnPct: number;
  alphaVsBenchmarkPct: number;
  timeframeBreakdown: {
    daily_1_3d: { total: number; winRate: number; profitFactor: number };
    swing_1_2w: { total: number; winRate: number; profitFactor: number };
    positional_1m: { total: number; winRate: number; profitFactor: number };
  };
}

export interface PostMortemItem {
  id: number;
  recommendationId?: number;
  symbol: string;
  companyName: string;
  timeframe: string;
  entryPrice: number;
  exitPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  pnlPct: number;
  primaryFailureCategory: string;
  compoundCauses: Array<{ category: string; weightPct: number; title: string; evidence: string }>;
  causalConfidencePct: number;
  temporalContext: { isExpiryWeek: boolean; daysToMonthlyExpiry: number; isEarningsSeason: boolean; marketRegime: string };
  rootCauseAnalysis: string;
  correctiveAction: string;
  counterfactualAction: string;
  appliedParameterMutation: string;
  learnedAt: string;
}

export interface PotOverview {
  id: string;
  potName: string;
  strategyType: string;
  initialCapital: number;
  cashBalance: number;
  currentPortfolioNav: number;
  investedCapital: number;
  totalRealizedPnl: number;
  totalRealizedPnlPct: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openPositionsCount: number;
  closedPositionsCount: number;
  winRatePct: number;
  maxDrawdownPct: number;
  isCircuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  alphaVsBenchmarkPct: number;
}

export interface PaperPosition {
  id: number;
  potId: string;
  symbol: string;
  companyName: string;
  sector: string;
  action: string;
  timeframe: string;
  quantity: number;
  entryPrice: number;
  investedCapital: number;
  currentPrice: number;
  stopLoss: number;
  trailingStopLoss: number;
  target1: number;
  target2: number;
  partialExitDone: boolean;
  partialExitPrice?: number;
  partialExitPnl?: number;
  exitConfirmationType: string;
  frictionCosts: number;
  status: 'OPEN' | 'CLOSED_PROFIT' | 'CLOSED_LOSS';
  exitPrice?: number;
  exitReason?: string;
  realizedPnl: number;
  realizedPnlPct: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  entryDate: string;
}

export function AutonomousSmartMoneySentinelView() {
  // Top-level Navigation Mode
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'SMC_RADAR' | 'QUALITY_AUDIT' | 'PAPER_SANDBOX'>('SCANNER');

  // Scanner State
  const [recommendations, setRecommendations] = useState<AutonomousRecommendation[]>([]);
  const [alerts, setAlerts] = useState<AutonomousAlert[]>([]);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'HIGH_CONVICTION' | 'FLOAT_SQUEEZE' | 'SMC_CONFIRMED' | 'RISK_DEFENSE'>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [scanningNow, setScanningNow] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [activeChartSymbol, setActiveChartSymbol] = useState<string | null>(null);
  const [chartReport, setChartReport] = useState<any | null>(null);
  const [chartLoading, setChartLoading] = useState<boolean>(false);
  const [showMatrixModal, setShowMatrixModal] = useState<boolean>(false);
  const [matrixData, setMatrixData] = useState<any | null>(null);

  // Institutional Smart Money Concepts (SMC 13 Pillars) State
  const [smcRadarList, setSmcRadarList] = useState<any[]>([]);
  const [smcRadarLoading, setSmcRadarLoading] = useState<boolean>(false);
  const [selectedSmcItem, setSelectedSmcItem] = useState<any | null>(null);
  const [showSmcModal, setShowSmcModal] = useState<boolean>(false);
  const [showChecklistModal, setShowChecklistModal] = useState<boolean>(false);
  const [selectedChecklistRec, setSelectedChecklistRec] = useState<AutonomousRecommendation | null>(null);
  const [smcMinScoreFilter, setSmcMinScoreFilter] = useState<number>(0);
  const [activeSmcPillarTab, setActiveSmcPillarTab] = useState<number>(1);

  // Quality & Causal Forensics State
  const [auditMetrics, setAuditMetrics] = useState<QualityMetrics | null>(null);
  const [postMortems, setPostMortems] = useState<PostMortemItem[]>([]);
  const [failureDistribution, setFailureDistribution] = useState<any[]>([]);
  const [selfLearningRules, setSelfLearningRules] = useState<any[]>([]);
  const [mutationLog, setMutationLog] = useState<any[]>([]);
  const [auditDaysWindow, setAuditDaysWindow] = useState<number>(90);
  const [selectedPostMortem, setSelectedPostMortem] = useState<PostMortemItem | null>(null);
  const [causalFilterCategory, setCausalFilterCategory] = useState<string>('ALL');

  // Paper Trading Sandbox State
  const [activePotId, setActivePotId] = useState<string>('pot_conservative');
  const [potOverview, setPotOverview] = useState<PotOverview | null>(null);
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [paperStatusFilter, setPaperStatusFilter] = useState<string>('ALL');
  const [paperTimeframeFilter, setPaperTimeframeFilter] = useState<string>('ALL');
  const [syncingPaperPot, setSyncingPaperPot] = useState<boolean>(false);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetCapitalInput, setResetCapitalInput] = useState<number>(1000000);

  // Initial Fetch & Refresh loop
  useEffect(() => {
    fetchScannerData();
    fetchAuditData();
    fetchPaperPotData(activePotId);
    fetchSmcRadarData();

    const interval = setInterval(() => {
      if (activeTab === 'SCANNER') fetchScannerData();
      else if (activeTab === 'SMC_RADAR') fetchSmcRadarData();
      else if (activeTab === 'QUALITY_AUDIT') fetchAuditData();
      else if (activeTab === 'PAPER_SANDBOX') fetchPaperPotData(activePotId);
    }, 15000);

    return () => clearInterval(interval);
  }, [activeTab, activePotId, auditDaysWindow, causalFilterCategory, paperStatusFilter, paperTimeframeFilter, filter]);

  const fetchSmcRadarData = async () => {
    setSmcRadarLoading(true);
    try {
      const res = await fetch('/api/v1/sentinel/smc/scanner');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSmcRadarList(json.data);
        }
      }
    } catch (e) {
      console.warn('[SMC Radar] Error fetching scanner data:', e);
    } finally {
      setSmcRadarLoading(false);
    }
  };

  const fetchScannerData = async () => {
    try {
      const recUrl = filter === 'ALL'
        ? '/api/v1/autonomous-agent/recommendations'
        : `/api/v1/autonomous-agent/recommendations?filter=${filter}`;
      const [recRes, alertRes, healthRes] = await Promise.all([
        fetch(recUrl),
        fetch('/api/v1/autonomous-agent/alerts'),
        fetch('/api/v1/autonomous-agent/health')
      ]);

      if (recRes.ok) {
        const data = await recRes.json();
        if (data.data) setRecommendations(data.data);
      }
      if (alertRes.ok) {
        const data = await alertRes.json();
        if (data.data) setAlerts(data.data);
      }
      if (healthRes.ok) {
        const data = await healthRes.json();
        if (data.data) setHealth(data.data);
      }
    } catch (e) {
      console.error('Error fetching scanner data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditData = async () => {
    try {
      const [metricRes, postMortemRes, rulesRes] = await Promise.all([
        fetch(`/api/v1/autonomous-agent/performance-audit?daysWindow=${auditDaysWindow}`),
        fetch(`/api/v1/autonomous-agent/causal-post-mortems?category=${causalFilterCategory}`),
        fetch('/api/v1/autonomous-agent/self-learning-rules')
      ]);

      if (metricRes.ok) {
        const d = await metricRes.json();
        if (d.data) setAuditMetrics(d.data);
      }
      if (postMortemRes.ok) {
        const d = await postMortemRes.json();
        if (d.data) setPostMortems(d.data);
        if (d.distribution) setFailureDistribution(d.distribution);
      }
      if (rulesRes.ok) {
        const d = await rulesRes.json();
        if (d.data) setSelfLearningRules(d.data);
        if (d.changelog) setMutationLog(d.changelog);
      }
    } catch (e) {
      console.error('Error fetching audit data:', e);
    }
  };

  const fetchPaperPotData = async (potId: string) => {
    try {
      const [overviewRes, posRes, curveRes] = await Promise.all([
        fetch(`/api/v1/autonomous-agent/paper-pot?potId=${potId}`),
        fetch(`/api/v1/autonomous-agent/paper-pot/positions?potId=${potId}&status=${paperStatusFilter}&timeframe=${paperTimeframeFilter}`),
        fetch(`/api/v1/autonomous-agent/paper-pot/equity-curve?potId=${potId}`)
      ]);

      if (overviewRes.ok) {
        const d = await overviewRes.json();
        if (d.data) setPotOverview(d.data);
      }
      if (posRes.ok) {
        const d = await posRes.json();
        if (d.data) setPaperPositions(d.data);
      }
      if (curveRes.ok) {
        const d = await curveRes.json();
        if (d.data) setEquityCurve(d.data);
      }
    } catch (e) {
      console.error('Error fetching paper pot data:', e);
    }
  };

  const handleTriggerScan = async () => {
    setScanningNow(true);
    try {
      const res = await fetch('/api/v1/autonomous-agent/scan-now', { method: 'POST' });
      if (res.ok) {
        await Promise.all([fetchScannerData(), fetchAuditData(), fetchPaperPotData(activePotId)]);
      }
    } catch (e) {
      console.error('Error triggering scan:', e);
    } finally {
      setScanningNow(false);
    }
  };

  const handleSyncPaperTrades = async () => {
    setSyncingPaperPot(true);
    try {
      const res = await fetch('/api/v1/autonomous-agent/paper-pot/sync', { method: 'POST' });
      if (res.ok) {
        await fetchPaperPotData(activePotId);
        await fetchAuditData();
      }
    } catch (e) {
      console.error('Error syncing paper trades:', e);
    } finally {
      setSyncingPaperPot(false);
    }
  };

  const handleResetPot = async () => {
    try {
      const res = await fetch('/api/v1/autonomous-agent/paper-pot/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ potId: activePotId, initialCapital: resetCapitalInput })
      });
      if (res.ok) {
        setShowResetModal(false);
        await fetchPaperPotData(activePotId);
      }
    } catch (e) {
      console.error('Error resetting pot:', e);
    }
  };

  const handleRollbackRule = async (ruleId: number) => {
    if (!confirm('Are you sure you want to rollback this self-learning rule to its baseline threshold?')) return;
    try {
      const res = await fetch('/api/v1/autonomous-agent/self-learning-rules/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, reason: 'User requested rollback via Quality Hub' })
      });
      if (res.ok) {
        await fetchAuditData();
      }
    } catch (e) {
      console.error('Error rolling back rule:', e);
    }
  };

  const handleOpenChart = async (symbol: string) => {
    setActiveChartSymbol(symbol);
    setChartLoading(true);
    try {
      const res = await fetch(`/api/technical-momentum?symbol=${symbol}&weightProfile=AUTO_SECTOR`);
      if (res.ok) {
        const data = await res.json();
        setChartReport(data);
      }
    } catch (e) {
      console.error('Error loading chart analysis:', e);
    } finally {
      setChartLoading(false);
    }
  };

  const handleOpenMatrix = async () => {
    try {
      const res = await fetch('/api/v1/autonomous-agent/weighting-matrix');
      if (res.ok) {
        const d = await res.json();
        setMatrixData(d.data);
        setShowMatrixModal(true);
      }
    } catch (e) {
      console.error('Error loading matrix:', e);
    }
  };

  const copyBlueprint = (rec: AutonomousRecommendation) => {
    const text = `🎯 [NRI WealthOS Sentinel Blueprint]\n${rec.action}: ${rec.symbol} (${rec.companyName})\nEntry: ₹${rec.entryPrice} | CMP: ₹${rec.currentPrice}\nStop Loss: ₹${rec.stopLoss} (${rec.stopLossPct.toFixed(1)}%)\nTarget 1: ₹${rec.target1} (+${rec.target1GainPct.toFixed(1)}%)\nTarget 2: ₹${rec.target2} (+${rec.target2GainPct.toFixed(1)}%)\nRR: 1:${rec.riskRewardRatio} | Probability: ${rec.probabilityPct}% | Confidence: ${rec.confidenceScore}%\nTimeframe: ${rec.timeframe}\nFloat Regime: ${rec.floatRegime} (Squeeze: ${rec.floatSqueezeRatio.toFixed(2)}x)\nReasoning: ${rec.reasoningSummary}`;
    navigator.clipboard.writeText(text);
    setCopiedId(rec.symbol);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter recommendations & strictly enforce symbol uniqueness
  const filteredRecommendations = useMemo(() => {
    const list = recommendations.filter(r => {
      if (filter === 'HIGH_CONVICTION') return r.probabilityPct >= 75 && r.confidenceScore >= 70;
      if (filter === 'FLOAT_SQUEEZE') return r.floatRegime === 'INSTITUTIONAL_LOCK_SQUEEZE';
      if (filter === 'SMC_CONFIRMED') return (r.smcChecklistScore || 0) >= 6 || Boolean(r.smcMarketStructure);
      if (filter === 'RISK_DEFENSE') return r.action.startsWith('SQUARE_OFF') || r.action.startsWith('TIGHTEN');
      return true;
    });

    const seen = new Set<string>();
    return list.filter(r => {
      const sym = r.symbol.toUpperCase();
      if (seen.has(sym)) return false;
      seen.add(sym);
      return true;
    });
  }, [recommendations, filter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 space-y-6">
      {/* ─── COMMAND CENTER HEADER & PRIMARY NAVIGATION ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-800/30 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400 shadow-lg shadow-purple-900/30">
              <Sparkles className="w-6 h-6 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-ping" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white font-display">
                  Autonomous Smart Money Sentinel
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                  v2.0 Adaptive Daemon
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Institutional Float Squeeze, Multi-Label Causal Forensics & Pseudo-Money Simulation Pot
              </p>
            </div>
          </div>

          {/* Top Actions & Sub-Navigation Switches */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="bg-slate-900/90 border border-slate-800 p-1 rounded-xl flex flex-wrap items-center gap-1">
              <button
                onClick={() => setActiveTab('SCANNER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'SCANNER'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>Live Blueprints</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('SMC_RADAR');
                  fetchSmcRadarData();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'SMC_RADAR'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>13-Pillar SMC Radar</span>
              </button>

              <button
                onClick={() => setActiveTab('QUALITY_AUDIT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'QUALITY_AUDIT'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Causal Forensics</span>
              </button>

              <button
                onClick={() => setActiveTab('PAPER_SANDBOX')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'PAPER_SANDBOX'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>Paper Pot Sandbox</span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleTriggerScan}
                disabled={scanningNow}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-950 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanningNow ? 'animate-spin' : ''}`} />
                <span>{scanningNow ? 'Scanning Market...' : 'Scan Now'}</span>
              </button>

              <button
                onClick={handleOpenMatrix}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700/60 transition-all whitespace-nowrap cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                <span>Weighting Matrix</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: LIVE BLUEPRINTS & SCANNER
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'SCANNER' && (
        <div className="space-y-6">
          {/* Health & Status Strip */}
          {health && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${health.agentUp ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`} />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Daemon Engine</div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    {health.agentUp ? 'Running Active' : 'Offline'}
                    <span className="text-[10px] text-slate-400">({health.currentIntervalSeconds}s loop)</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
                <Clock className="w-4 h-4 text-sky-400" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Last Scan</div>
                  <div className="text-xs font-bold text-white">
                    {health.lastScanTimestamp ? new Date(health.lastScanTimestamp).toLocaleTimeString() : 'Just now'}
                    <span className="text-[10px] text-slate-400 ml-1">({health.lastScanLatencyMs}ms)</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
                <Activity className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Scans</div>
                  <div className="text-xs font-bold text-white">{health.totalScansCompleted} Cycles</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
                <Target className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Blueprints</div>
                  <div className="text-xs font-bold text-emerald-400">{recommendations.length} Scrips Identified</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-3">
                <Flame className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Market Session</div>
                  <div className="text-xs font-bold text-amber-300">
                    {health.isMarketHours ? 'Live NSE/BSE Hours' : 'Post-Market surveillance'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Filter Scrips:</span>
              {(['ALL', 'HIGH_CONVICTION', 'FLOAT_SQUEEZE', 'SMC_CONFIRMED', 'RISK_DEFENSE'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filter === f
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {f === 'SMC_CONFIRMED' ? '✨ SMC CONFIRMED' : f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Showing <strong className="text-white">{filteredRecommendations.length}</strong> of {recommendations.length} blueprints
            </div>
          </div>

          {/* Trade Blueprints Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRecommendations.map(rec => {
              const isLong = rec.action.includes('LONG') || rec.action.includes('BUY');
              const isSqueeze = rec.floatRegime === 'INSTITUTIONAL_LOCK_SQUEEZE';

              return (
                <div
                  key={rec.symbol}
                  className="rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-purple-500/40 p-5 space-y-4 shadow-xl hover:shadow-purple-950/20 transition-all group relative overflow-hidden"
                >
                  {/* Top Badge Strip */}
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-lg font-black text-white font-mono group-hover:text-purple-300 transition-colors">
                          {rec.symbol}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                          isLong ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {rec.action.replace(/_/g, ' ')}
                        </span>
                        {isSqueeze && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1 whitespace-nowrap">
                            <Lock className="w-2.5 h-2.5" /> SQUEEZE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-full" title={`${rec.companyName} • ${rec.sector}`}>
                        {rec.companyName} • {rec.sector}
                      </div>
                    </div>

                    {/* Conviction Scores */}
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-purple-400 whitespace-nowrap">
                        Prob: {rec.probabilityPct}%
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                        Conf: {rec.confidenceScore}%
                      </div>
                    </div>
                  </div>

                  {/* Institutional Float Ownership Visual Bar */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                    <div className="flex flex-wrap justify-between text-[10px] text-slate-400 font-mono gap-1">
                      <span>Promoter: {rec.promoterPct}%</span>
                      <span>FII: {rec.fiiPct}%</span>
                      <span>DII: {rec.diiPct}%</span>
                      <span className="text-amber-400 font-bold">Float: {rec.retailFloatPct}%</span>
                    </div>
                    {/* Multi-segment ownership bar */}
                    <div className="h-2 rounded-full overflow-hidden flex bg-slate-800">
                      <div style={{ width: `${rec.promoterPct}%` }} className="bg-blue-600" title={`Promoter ${rec.promoterPct}%`} />
                      <div style={{ width: `${rec.fiiPct}%` }} className="bg-purple-500" title={`FII ${rec.fiiPct}%`} />
                      <div style={{ width: `${rec.diiPct}%` }} className="bg-emerald-500" title={`DII ${rec.diiPct}%`} />
                      <div style={{ width: `${rec.retailFloatPct}%` }} className="bg-amber-400" title={`Retail Float ${rec.retailFloatPct}%`} />
                    </div>
                  </div>

                  {/* Execution Price Targets Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                      <div className="text-[9px] uppercase text-slate-400 truncate">Entry</div>
                      <div className="text-[11px] sm:text-xs font-bold text-white truncate" title={`₹${rec.entryPrice.toFixed(1)}`}>
                        ₹{rec.entryPrice.toFixed(1)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                      <div className="text-[9px] uppercase text-rose-400 truncate">Stop Loss</div>
                      <div className="text-[11px] sm:text-xs font-bold text-rose-400 truncate" title={`₹${rec.stopLoss.toFixed(1)}`}>
                        ₹{rec.stopLoss.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-rose-400/80 truncate">-{rec.stopLossPct.toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                      <div className="text-[9px] uppercase text-emerald-400 truncate">Target 1</div>
                      <div className="text-[11px] sm:text-xs font-bold text-emerald-400 truncate" title={`₹${rec.target1.toFixed(1)}`}>
                        ₹{rec.target1.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-emerald-400/80 truncate">+{rec.target1GainPct.toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                      <div className="text-[9px] uppercase text-purple-400 truncate">Target 2</div>
                      <div className="text-[11px] sm:text-xs font-bold text-purple-400 truncate" title={`₹${rec.target2.toFixed(1)}`}>
                        ₹{rec.target2.toFixed(1)}
                      </div>
                      <div className="text-[9px] text-purple-400/80 truncate">+{rec.target2GainPct.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* SMC Order-Flow Strip (if available) */}
                  {rec.smcChecklistScore !== undefined && rec.smcChecklistScore !== null && (
                    <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/40 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider truncate">SMC Confluence</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono shrink-0 ${
                          (rec.smcChecklistScore || 0) >= 7
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          Checklist: {rec.smcChecklistScore}/10
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        {rec.smcPremiumDiscount && (
                          <span className={`px-1.5 py-0.5 rounded whitespace-nowrap ${
                            rec.smcPremiumDiscount === 'DISCOUNT' ? 'bg-emerald-900/60 text-emerald-300' :
                            rec.smcPremiumDiscount === 'PREMIUM' ? 'bg-rose-900/60 text-rose-300' : 'bg-slate-800 text-slate-300'
                          }`}>
                            Zone: {rec.smcPremiumDiscount}
                          </span>
                        )}
                        {rec.smcLiquiditySweep && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 truncate max-w-[170px]" title={rec.smcLiquiditySweep}>
                            {rec.smcLiquiditySweep}
                          </span>
                        )}
                        {rec.smcMarketStructure && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 truncate max-w-[150px]" title={rec.smcMarketStructure}>
                            {rec.smcMarketStructure}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Derivatives & Indicator Diagnostics Strip */}
                  <div className="flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] font-mono text-slate-400 px-1 gap-1">
                    <span className="whitespace-nowrap">RR: <strong className="text-white">1:{rec.riskRewardRatio.toFixed(1)}</strong></span>
                    <span className="whitespace-nowrap">PCR: <strong className="text-white">{rec.putCallRatio.toFixed(2)}</strong></span>
                    <span className="whitespace-nowrap">RSI: <strong className="text-white">{rec.rsiValue.toFixed(1)}</strong></span>
                    <span className="whitespace-nowrap">Vol: <strong className="text-white">{rec.volumeSurgeRatio.toFixed(1)}x</strong></span>
                  </div>

                  {/* Reasoning Excerpt */}
                  <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 line-clamp-2 break-words">
                    {rec.reasoningSummary.split('\n')[0]}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 min-w-0">
                    <button
                      onClick={() => handleOpenChart(rec.symbol)}
                      className="flex-1 min-w-[100px] py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      View Chart
                    </button>
                    {rec.smcChecklistScore !== undefined && (
                      <button
                        onClick={() => {
                          setSelectedChecklistRec(rec);
                          setShowChecklistModal(true);
                        }}
                        className="px-2.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap"
                        title="View 10-Second SMC Checklist"
                      >
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        10-Sec SMC
                      </button>
                    )}
                    <button
                      onClick={() => copyBlueprint(rec)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1 transition-all shrink-0"
                      title="Copy Trade Blueprint"
                    >
                      {copiedId === rec.symbol ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 1.5: INSTITUTIONAL SMC RADAR (13 PILLARS)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'SMC_RADAR' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 space-y-3 relative overflow-hidden shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                    13 Pillars Institutional Framework
                  </span>
                  <span className="text-xs text-slate-400 font-mono">20-Slide SMC Training Deck Specification</span>
                </div>
                <h2 className="text-xl font-black text-white font-display mt-1 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  Smart Money Concepts (SMC) Institutional Radar
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
                  Pure order-flow tracking: Market Structure (BOS/CHOCH/MSS), Liquidity Sweeps, Order Blocks with Mean Threshold, Fair Value Gaps with Consequent Encroachment, Dealing Range Premium/Discount, and the 10-Second Checklist.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchSmcRadarData}
                  disabled={smcRadarLoading}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-950"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${smcRadarLoading ? 'animate-spin' : ''}`} />
                  {smcRadarLoading ? 'Scanning Universe...' : 'Refresh Radar'}
                </button>
              </div>
            </div>

            {/* 13 Pillars Interactive Bar */}
            <div className="pt-3 border-t border-purple-800/30">
              <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Select Pillar to Review Institutional Mechanics:
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {[
                  { id: 1, title: '1. Market Structure', sub: 'BOS / CHOCH / MSS' },
                  { id: 2, title: '2. Liquidity Pools', sub: 'BSL / SSL / EQH / EQL' },
                  { id: 3, title: '3. Liquidity Sweeps', sub: 'Wick Purge & Reject' },
                  { id: 4, title: '4. Order Blocks', sub: 'Base & Mean Threshold' },
                  { id: 5, title: '5. Breaker Blocks', sub: 'Failed OB Support Flip' },
                  { id: 6, title: '6. Fair Value Gaps', sub: '3-Candle Imbalance' },
                  { id: 7, title: '7. Displacement', sub: 'Body ≥60%, Vol ≥1.25x' },
                  { id: 8, title: '8. Dealing Range', sub: 'Premium vs Discount 50%' },
                  { id: 9, title: '9. Inducement', sub: 'Minor Trap (IDM)' },
                  { id: 10, title: '10. SMT Divergence', sub: 'Intermarket Non-Confirm' },
                  { id: 11, title: '11. 10-Sec Checklist', sub: '10-Point Scoring Model' },
                  { id: 12, title: '12. Multi-Timeframe', sub: 'HTF Bias → LTF Entry' },
                  { id: 13, title: '13. Trade Model', sub: 'Institutional Execution' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveSmcPillarTab(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-left shrink-0 transition-all border ${
                      activeSmcPillarTab === p.id
                        ? 'bg-purple-600/40 text-white border-purple-400 shadow-md'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    <div className="text-[11px] font-bold whitespace-nowrap">{p.title}</div>
                    <div className="text-[9px] text-purple-300/80 whitespace-nowrap font-mono">{p.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Pillar Explanation Banner */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-purple-900/50 text-xs text-slate-300">
              {activeSmcPillarTab === 1 && (
                <div>
                  <strong className="text-purple-300">Pillar 1: Market Structure (HH, HL, LH, LL)</strong> — Break of Structure (<strong>BOS</strong>) signals institutional trend continuation when a candle body closes beyond a prior swing. Change of Character (<strong>CHOCH</strong>) and Market Structure Shift (<strong>MSS</strong>) signal institutional regime reversal with aggressive displacement.
                </div>
              )}
              {activeSmcPillarTab === 2 && (
                <div>
                  <strong className="text-purple-300">Pillar 2: Liquidity Pools</strong> — Stop losses cluster at predictable resting locations: Buy-Side Liquidity (<strong>BSL</strong>) above swing highs, Equal Highs (<strong>EQH</strong>), PDH, and PWH; Sell-Side Liquidity (<strong>SSL</strong>) below swing lows, Equal Lows (<strong>EQL</strong>), PDL, and PWL. Institutions engineer price runs into these pools to accumulate or distribute large blocks.
                </div>
              )}
              {activeSmcPillarTab === 3 && (
                <div>
                  <strong className="text-purple-300">Pillar 3: Liquidity Sweeps / Purges</strong> — An institutional manipulation event where price wicks beyond a key high or low to trigger retail stops and absorb liquidity, followed immediately by strong rejection and a candle body closing back inside the range.
                </div>
              )}
              {activeSmcPillarTab === 4 && (
                <div>
                  <strong className="text-purple-300">Pillar 4: Order Blocks (OB) & Mean Threshold</strong> — The last opposing candle before strong institutional displacement. A Bullish OB is the last bearish candle before an aggressive rally. The <strong>Mean Threshold (MT)</strong> is the 50% midpoint of the OB candle body, serving as high-probability institutional mitigation support.
                </div>
              )}
              {activeSmcPillarTab === 5 && (
                <div>
                  <strong className="text-purple-300">Pillar 5: Breaker Blocks (Polarity Flip)</strong> — When an Order Block fails to hold and is cleanly violated by strong displacement, its polarity inverts. A failed bullish OB becomes a bearish breaker resistance; a failed bearish OB becomes a bullish breaker support.
                </div>
              )}
              {activeSmcPillarTab === 6 && (
                <div>
                  <strong className="text-purple-300">Pillar 6: Fair Value Gaps (FVG) & Consequent Encroachment (CE)</strong> — A 3-candle price delivery imbalance where Candle 1 High does not overlap Candle 3 Low (Bullish FVG), or Candle 1 Low does not overlap Candle 3 High (Bearish FVG). The 50% midpoint is the <strong>Consequent Encroachment (CE)</strong>, acting as a magnet for price rebalancing.
                </div>
              )}
              {activeSmcPillarTab === 7 && (
                <div>
                  <strong className="text-purple-300">Pillar 7: Quantitative Displacement</strong> — Discerning genuine institutional participation from retail noise. Requires: (1) Candle body &ge; 60% of total range, (2) Volume &ge; 1.25x 20-day SMA, (3) Opposing wick &le; 25%, and (4) Creation of a fresh FVG or BOS.
                </div>
              )}
              {activeSmcPillarTab === 8 && (
                <div>
                  <strong className="text-purple-300">Pillar 8: Premium vs. Discount Dealing Range</strong> — Calculated from current dealing swing high to swing low. Equilibrium is at 50%. Rule: Institutions <strong>never buy in Premium (&gt; 50%)</strong> and <strong>never sell in Discount (&lt; 50%)</strong>. Optimal Trade Entry (OTE) sits between 61.8% and 78.6% retracement in Discount.
                </div>
              )}
              {activeSmcPillarTab === 9 && (
                <div>
                  <strong className="text-purple-300">Pillar 9: Inducement Traps (IDM)</strong> — Minor internal swing highs or lows formed inside the dealing range that bait impatient retail traders into early entries before price sweeps deeper into genuine institutional Order Blocks or FVGs.
                </div>
              )}
              {activeSmcPillarTab === 10 && (
                <div>
                  <strong className="text-purple-300">Pillar 10: Smart Money Technique (SMT) Intermarket Divergence</strong> — Correlated asset non-confirmation. In Indian equities, when NIFTY 50 makes a lower low but a high-conviction scrip forms a higher low, institutional accumulation is confirmed.
                </div>
              )}
              {activeSmcPillarTab === 11 && (
                <div>
                  <strong className="text-purple-300">Pillar 11: 10-Second SMC Checklist</strong> — A strict 10-point binary verification model from Slide 16. Requires a score of $\ge 7/10$ across HTF Structure, Liquidity Sweep, Displacement, OB/FVG Location, Discount Range, Defined SL, Identifiable Target, and R:R $\ge 2.0$.
                </div>
              )}
              {activeSmcPillarTab === 12 && (
                <div>
                  <strong className="text-purple-300">Pillar 12: Multi-Timeframe Matrix (HTF $\to$ LTF)</strong> — Weekly and Daily charts define directional bias, dealing ranges, and key POIs. Lower timeframes (1H, 15m) provide precision entry triggers on local CHOCH and retests.
                </div>
              )}
              {activeSmcPillarTab === 13 && (
                <div>
                  <strong className="text-purple-300">Pillar 13: Complete SMC Trade Model</strong> — High Probability Blueprint: <code>HTF Directional Bias + Liquidity Sweep + Displacement + FVG / OB in Discount/Premium = High Probability Entry</code> with Stop Loss placed beyond the sweep extreme and Targets at opposing liquidity pools.
                </div>
              )}
            </div>
          </div>

          {/* Scanner Table Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Checklist Filter:</span>
              {[
                { label: 'All Scores', val: 0 },
                { label: 'Score ≥ 6', val: 6 },
                { label: 'Institutional ≥ 7', val: 7 },
                { label: 'High Conviction ≥ 8', val: 8 },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setSmcMinScoreFilter(opt.val)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    smcMinScoreFilter === opt.val
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Displaying <strong className="text-white">
                {smcRadarList.filter(item => (item.checklist?.totalScore || 0) >= smcMinScoreFilter).length}
              </strong> scrips with live SMC metrics
            </div>
          </div>

          {/* Institutional Scanner Data Grid */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                <tr>
                  <th className="p-3.5">Scrip & Company</th>
                  <th className="p-3.5">Current Price</th>
                  <th className="p-3.5">Market Structure</th>
                  <th className="p-3.5">Dealing Range</th>
                  <th className="p-3.5">Liquidity Sweep</th>
                  <th className="p-3.5">Active OB / FVG</th>
                  <th className="p-3.5 text-center">10-Sec Score</th>
                  <th className="p-3.5 text-center">Setup & R:R</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {smcRadarList
                  .filter(item => {
                    const s = item.checklist?.score ?? item.checklist?.totalScore ?? 0;
                    return s >= smcMinScoreFilter;
                  })
                  .map(item => {
                    const price = item.cmp || item.currentPrice || 0;
                    const score = item.checklist?.score ?? item.checklist?.totalScore ?? 0;
                    const zone = item.premiumDiscount?.currentZone || item.dealingRange?.zone || 'EQUILIBRIUM';
                    const fibPct = item.premiumDiscount?.fibPositionPct ?? item.dealingRange?.percentile ?? 50;
                    const structureName = item.marketStructure?.lastEvent?.type || item.marketStructure?.bias || item.structure?.state || 'NEUTRAL';
                    const sweep = item.liquidity?.latestSweep || item.liquidity?.recentSweeps?.[0] || item.liquidity?.recentSweep;
                    const ob = item.orderBlocks?.nearestOb || item.orderBlocks?.activeBullishObs?.[0] || item.orderBlocks?.activeBearishObs?.[0] || item.activeOrderBlock;
                    const fvg = item.fairValueGaps?.nearestGap || item.fairValueGaps?.activeGaps?.[0] || item.activeFvg;
                    const trade = item.tradeModel || item.tradeSetup;
                    const isLong = trade?.setupType?.includes('LONG') || trade?.type === 'LONG';

                    return (
                      <tr key={item.symbol} className="hover:bg-purple-950/20 transition-colors group">
                        {/* Scrip */}
                        <td className="p-3.5">
                          <div className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">
                            {item.symbol}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px] font-sans">
                            {item.companyName || item.symbol}
                          </div>
                        </td>

                        {/* Price */}
                        <td className="p-3.5">
                          <div className="font-bold text-white">₹{price.toFixed(2)}</div>
                        </td>

                        {/* Structure */}
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap inline-block ${
                            structureName.includes('BULLISH')
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : structureName.includes('BEARISH')
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {structureName.replace(/_/g, ' ')}
                          </span>
                        </td>

                        {/* Dealing Range */}
                        <td className="p-3.5">
                          <div className="space-y-1 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                              zone === 'DISCOUNT' ? 'bg-emerald-900/60 text-emerald-300' :
                              zone === 'PREMIUM' ? 'bg-rose-900/60 text-rose-300' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {zone} ({fibPct.toFixed(0)}%)
                            </span>
                            <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${Math.min(100, Math.max(0, fibPct))}%` }}
                                className={`h-full ${zone === 'DISCOUNT' ? 'bg-emerald-400' : zone === 'PREMIUM' ? 'bg-rose-400' : 'bg-amber-400'}`}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Sweep */}
                        <td className="p-3.5">
                          {sweep?.detected || sweep?.poolType || sweep?.type ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 whitespace-nowrap inline-block">
                              {sweep.poolType || sweep.type || 'LIQUIDITY'} SWEPT
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">None Active</span>
                          )}
                        </td>

                        {/* Order Block / FVG */}
                        <td className="p-3.5 text-[10px]">
                          {ob ? (
                            <div className="text-purple-300 truncate max-w-[130px]" title={`OB: ₹${(ob.bottom || ob.bottomPrice || 0).toFixed(0)} - ₹${(ob.top || ob.topPrice || 0).toFixed(0)}`}>
                              OB: ₹{(ob.bottom || ob.bottomPrice || 0).toFixed(0)} - ₹{(ob.top || ob.topPrice || 0).toFixed(0)}
                            </div>
                          ) : fvg ? (
                            <div className="text-indigo-300 truncate max-w-[130px]" title={`FVG: ₹${(fvg.bottom || fvg.bottomPrice || 0).toFixed(0)} - ₹${(fvg.top || fvg.topPrice || 0).toFixed(0)}`}>
                              FVG: ₹{(fvg.bottom || fvg.bottomPrice || 0).toFixed(0)} - ₹{(fvg.top || fvg.topPrice || 0).toFixed(0)}
                            </div>
                          ) : (
                            <span className="text-slate-500 whitespace-nowrap">Unmitigated None</span>
                          )}
                        </td>

                        {/* Checklist Score */}
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              setSelectedSmcItem(item);
                              setShowChecklistModal(true);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all hover:scale-105 whitespace-nowrap ${
                              score >= 7
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : score >= 5
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                            title="Click to view 10-Second Checklist"
                          >
                            {score} / 10
                          </button>
                        </td>

                        {/* Trade Setup & R:R */}
                        <td className="p-3.5 text-center">
                          {trade && trade.setupType !== 'NO_SETUP' && trade.type !== 'NO_SETUP' ? (
                            <div>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap inline-block ${
                                isLong ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                              }`}>
                                {isLong ? 'LONG' : 'SHORT'} (1:{(trade.riskRewardRatio || 2.0).toFixed(1)})
                              </span>
                              <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">
                                SL: ₹{(trade.stopLoss || 0).toFixed(1)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">Evaluating...</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedSmcItem(item);
                                setShowSmcModal(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                            >
                              <Eye className="w-3 h-3" />
                              13 Pillars
                            </button>
                            <button
                              onClick={() => handleOpenChart(item.symbol)}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-all"
                              title="Open Interactive Chart"
                            >
                              <BarChart2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: RECOMMENDATION QUALITY AUDITOR & CAUSAL FORENSICS
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'QUALITY_AUDIT' && (
        <div className="space-y-6">
          {/* Institutional Quality KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Win Rate</div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                {auditMetrics?.winRatePct != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics.winRatePct}%` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {(auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics?.wonCalls || 0} Won / ${auditMetrics?.lostCalls || 0} Lost` : 'No closed calls yet'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Profit Factor</div>
              <div className="text-2xl font-black text-purple-400 font-mono mt-1">
                {auditMetrics?.profitFactor != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics.profitFactor}x` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Gains / Losses ratio</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sharpe Ratio</div>
              <div className="text-2xl font-black text-sky-400 font-mono mt-1">
                {auditMetrics?.sharpeRatio != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics.sharpeRatio}` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Annualized vs 6.5% Rf</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sortino Ratio</div>
              <div className="text-2xl font-black text-indigo-400 font-mono mt-1">
                {auditMetrics?.sortinoRatio != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics.sortinoRatio}` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Downside penalized</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Calmar Ratio</div>
              <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                {auditMetrics?.calmarRatio != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `${auditMetrics.calmarRatio}` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Max DD: {auditMetrics?.maxDrawdownPct != null ? `${auditMetrics.maxDrawdownPct}%` : '--'}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Alpha vs Nifty 50</div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                {auditMetrics?.alphaVsBenchmarkPct != null && (auditMetrics?.totalCalls ?? 0) > 0 ? `+${auditMetrics.alphaVsBenchmarkPct}%` : '--'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Excess return over benchmark</div>
            </div>
          </div>

          {/* Timeframe Stratification & Rolling Filter */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Timeframe Horizon Quality Audit
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Empirical win rate & profit factor sliced across holding periods</p>
              </div>

              {/* Rolling Window Pills */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {[7, 30, 90, 365].map(days => (
                  <button
                    key={days}
                    onClick={() => setAuditDaysWindow(days)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      auditDaysWindow === days
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {days === 365 ? '1 Year' : `${days}D`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Daily Momentum (1–3 Days)</div>
                <div className="text-xl font-bold text-white mt-1">
                  {auditMetrics?.timeframeBreakdown?.daily_1_3d?.winRate != null ? `${auditMetrics.timeframeBreakdown.daily_1_3d.winRate}% Win Rate` : '--'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Profit Factor: <strong className="text-purple-400">{auditMetrics?.timeframeBreakdown?.daily_1_3d?.profitFactor != null ? `${auditMetrics.timeframeBreakdown.daily_1_3d.profitFactor}x` : '--'}</strong>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Swing Breakouts (1–2 Weeks)</div>
                <div className="text-xl font-bold text-white mt-1">
                  {auditMetrics?.timeframeBreakdown?.swing_1_2w?.winRate != null ? `${auditMetrics.timeframeBreakdown.swing_1_2w.winRate}% Win Rate` : '--'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Profit Factor: <strong className="text-purple-400">{auditMetrics?.timeframeBreakdown?.swing_1_2w?.profitFactor != null ? `${auditMetrics.timeframeBreakdown.swing_1_2w.profitFactor}x` : '--'}</strong>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Positional Accumulation (1 Month)</div>
                <div className="text-xl font-bold text-white mt-1">
                  {auditMetrics?.timeframeBreakdown?.positional_1m?.winRate != null ? `${auditMetrics.timeframeBreakdown.positional_1m.winRate}% Win Rate` : '--'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Profit Factor: <strong className="text-purple-400">{auditMetrics?.timeframeBreakdown?.positional_1m?.profitFactor != null ? `${auditMetrics.timeframeBreakdown.positional_1m.profitFactor}x` : '--'}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Pareto 80/20 Failure Breakdown Chart */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-amber-400" />
              Pareto 80/20 Causal Failure Distribution
            </h3>
            <p className="text-xs text-slate-400">
              Deterministic categorization of stopped-out calls to isolate dominant systemic failure causes
            </p>

            <div className="space-y-3">
              {failureDistribution.map(item => (
                <div key={item.category} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-bold">{item.category.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400">
                      <strong className="text-amber-400">{item.count}</strong> trades ({item.percentage}%) • Cumulative {item.cumulativePct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-950 overflow-hidden flex">
                    <div
                      style={{ width: `${item.percentage}%` }}
                      className="bg-gradient-to-r from-purple-500 to-amber-500 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clickable Forensic Post-Mortem Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Forensic Causal Post-Mortems ({postMortems.length} Cases Analyzed)
              </h3>

              {/* Category Filter */}
              <select
                value={causalFilterCategory}
                onChange={e => setCausalFilterCategory(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">All Failure Categories</option>
                <option value="SECTOR_CONTAGION_DRAG">Sector Contagion Drag</option>
                <option value="VOLUME_EXHAUSTION_TRAP">Volume Exhaustion Trap</option>
                <option value="RESISTANCE_CLUSTER_REJECTION">Resistance Rejection</option>
                <option value="FNO_DERIVATIVES_UNWINDING">F&O Unwinding</option>
                <option value="BRITTLE_SUPPORT_FLOOR">Brittle Support Floor</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {postMortems.map(pm => (
                <div
                  key={pm.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 transition-all space-y-3.5 shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-white text-base">{pm.symbol}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {pm.primaryFailureCategory.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{pm.companyName} • {pm.timeframe}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-rose-400">{pm.pnlPct.toFixed(2)}%</div>
                      <div className="text-[10px] text-slate-400">Conf: {pm.causalConfidencePct}%</div>
                    </div>
                  </div>

                  {/* Multi-Label Weighted Attribution */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Compound Attribution Matrix
                    </div>
                    <div className="space-y-1.5">
                      {pm.compoundCauses.map(c => (
                        <div key={c.title} className="text-xs">
                          <div className="flex justify-between font-mono text-[11px] mb-0.5">
                            <span className="text-slate-300 font-semibold">{c.title}</span>
                            <span className="text-purple-400 font-bold">{c.weightPct}%</span>
                          </div>
                          <div className="text-[11px] text-slate-400">{c.evidence}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Counterfactual Guidance Box */}
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                    <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      What Would Have Worked (Counterfactual Reasoning)
                    </div>
                    <p className="text-xs text-emerald-200/90 leading-relaxed">
                      {pm.counterfactualAction}
                    </p>
                  </div>

                  {/* Dynamic Parameter Mutation Applied */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                    <span>{pm.appliedParameterMutation}</span>
                    <span>{new Date(pm.learnedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Self-Learning Adaptation Log & Canaries */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-purple-400" />
              Self-Learning Evolution & A/B Canary Changelog
            </h3>
            <p className="text-xs text-slate-400">
              Active indicator rules with automated rollback safeguards against performance degradation
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {selfLearningRules.map(rule => (
                <div key={rule.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-mono">{rule.ruleName}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      rule.status === 'CANARY_TESTING'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                        : rule.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {rule.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Baseline: {rule.baselineThreshold} → Current: <strong className="text-purple-400">{rule.currentThreshold}</strong>
                  </div>
                  {rule.status === 'CANARY_TESTING' && (
                    <div className="text-[11px] text-amber-400 font-mono">
                      Canary Win Rate: {rule.canaryWinRatePct}% ({rule.canarySignalsEvaluated} signals)
                    </div>
                  )}
                  <button
                    onClick={() => handleRollbackRule(rule.id)}
                    className="w-full mt-2 py-1 rounded bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-[10px] font-bold transition-all"
                  >
                    Force Rollback to Baseline
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: PSEUDO-MONEY SIMULATION SANDBOX (PAPER TRADING)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'PAPER_SANDBOX' && (
        <div className="space-y-6">
          {/* Pot Switcher & Header Banner */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-white font-display">
                      {potOverview?.potName || 'Simulation Paper Pot'}
                    </h2>
                    {potOverview?.isCircuitBreakerTripped && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        CIRCUIT BREAKER TRIPPED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Slippage (0.05%) + STT & Brokerage modeled on every simulated trade
                  </p>
                </div>
              </div>

              {/* Pot Selector & Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                  <button
                    onClick={() => setActivePotId('pot_conservative')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activePotId === 'pot_conservative'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Conservative (3% Risk)
                  </button>
                  <button
                    onClick={() => setActivePotId('pot_aggressive')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activePotId === 'pot_aggressive'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Aggressive Kelly (5% Risk)
                  </button>
                  <button
                    onClick={() => setActivePotId('pot_barbell_1cr')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activePotId === 'pot_barbell_1cr'
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Barbell Top 10 (1 Cr)
                  </button>
                </div>

                <button
                  onClick={handleSyncPaperTrades}
                  disabled={syncingPaperPot}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingPaperPot ? 'animate-spin' : ''}`} />
                  Sync Live Prices
                </button>

                <button
                  onClick={() => setShowResetModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  Reset Pot
                </button>

                <a
                  href={`/api/v1/autonomous-agent/paper-pot/export?potId=${activePotId}&format=csv`}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  Export CSV
                </a>
              </div>
            </div>

            {/* Financial Overview Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 font-mono">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Portfolio NAV</div>
                <div className="text-xl font-black text-white mt-1">
                  {potOverview?.currentPortfolioNav != null ? `₹${potOverview.currentPortfolioNav.toLocaleString('en-IN')}` : '--'}
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5">
                  {potOverview?.totalRealizedPnlPct != null ? `${potOverview.totalRealizedPnlPct >= 0 ? '+' : ''}${potOverview.totalRealizedPnlPct}% Total Return` : 'Uninitialized'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Cash Available</div>
                <div className="text-xl font-black text-purple-400 mt-1">
                  {potOverview?.cashBalance != null ? `₹${potOverview.cashBalance.toLocaleString('en-IN')}` : '--'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Unallocated Buffer</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Invested Capital</div>
                <div className="text-xl font-black text-sky-400 mt-1">
                  {potOverview?.investedCapital != null ? `₹${potOverview.investedCapital.toLocaleString('en-IN')}` : '₹0'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{potOverview?.openPositionsCount || 0} Open Holdings</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Realized Gains</div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {potOverview?.totalRealizedPnl != null ? `${potOverview.totalRealizedPnl >= 0 ? '+' : ''}₹${potOverview.totalRealizedPnl.toLocaleString('en-IN')}` : '₹0'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Win Rate: {potOverview?.winRatePct != null ? `${potOverview.winRatePct}%` : '--'}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Alpha vs Nifty 50</div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {potOverview?.alphaVsBenchmarkPct != null ? `${potOverview.alphaVsBenchmarkPct >= 0 ? '+' : ''}${potOverview.alphaVsBenchmarkPct}%` : '--'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Simulated Alpha</div>
              </div>
            </div>
          </div>

          {/* Equity Curve vs Nifty 50 Preview */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              Simulated Equity Curve vs Nifty 50 Benchmark
            </h3>

            <div className="h-44 rounded-xl bg-slate-950 border border-slate-800 p-4 flex items-end justify-between gap-1 overflow-x-auto">
              {equityCurve.map((pt, i) => {
                const heightPct = Math.min(100, Math.max(15, ((pt.nav - 950000) / 200000) * 100));
                return (
                  <div key={i} className="flex-1 min-w-[12px] flex flex-col items-center gap-1 group relative">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-t bg-gradient-to-t from-purple-800 to-purple-500 group-hover:from-purple-600 group-hover:to-emerald-400 transition-all"
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 z-10 bg-slate-900 border border-slate-700 text-[10px] font-mono p-2 rounded shadow-xl whitespace-nowrap">
                      <div>NAV: ₹{pt.nav.toLocaleString('en-IN')}</div>
                      <div className="text-emerald-400">Alpha: +{pt.alphaVsBenchmarkPct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Paper Positions Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Position Status:</span>
                {(['ALL', 'OPEN', 'CLOSED_PROFIT', 'CLOSED_LOSS'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setPaperStatusFilter(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      paperStatusFilter === s
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-400 font-mono">
                {paperPositions.length} simulated positions recorded
              </div>
            </div>

            {/* Positions Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Scrip</th>
                    <th className="p-3.5">Action & Timeframe</th>
                    <th className="p-3.5">Qty / Invested</th>
                    <th className="p-3.5">Entry Price</th>
                    <th className="p-3.5">CMP / Exit</th>
                    <th className="p-3.5">Target & Stop</th>
                    <th className="p-3.5">P&L</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {paperPositions.map(pos => {
                    const isOpen = pos.status === 'OPEN';
                    const pnl = isOpen ? (pos.unrealizedPnl || 0) : (pos.realizedPnl || 0);
                    const pnlPct = isOpen ? (pos.unrealizedPnlPct || 0) : (pos.realizedPnlPct || 0);
                    const isProfit = pnl >= 0;

                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-bold text-white">
                          <div>{pos.symbol}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{pos.companyName}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {pos.action}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5">{pos.timeframe}</div>
                        </td>
                        <td className="p-3.5">
                          <div>{pos.quantity} Shares</div>
                          <div className="text-[10px] text-slate-400">₹{pos.investedCapital.toLocaleString('en-IN')}</div>
                        </td>
                        <td className="p-3.5">₹{pos.entryPrice.toFixed(2)}</td>
                        <td className="p-3.5 font-bold text-white">
                          ₹{(isOpen ? pos.currentPrice : (pos.exitPrice || pos.currentPrice)).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-[11px]">
                          <div className="text-emerald-400">T1: ₹{pos.target1} {pos.partialExitDone && '✓ 50%'}</div>
                          <div className="text-rose-400">SL: ₹{pos.trailingStopLoss || pos.stopLoss}</div>
                        </td>
                        <td className="p-3.5">
                          <div className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfit ? '+' : ''}₹{pnl.toFixed(2)}
                          </div>
                          <div className={`text-[10px] ${isProfit ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                            {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOpen
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : isProfit
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            {pos.status.replace(/_/g, ' ')}
                          </span>
                          {pos.exitReason && (
                            <div className="text-[9px] text-slate-400 mt-0.5">{pos.exitReason}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: TRADINGVIEW INTERACTIVE PRO CHART MODAL
          ───────────────────────────────────────────────────────────── */}
      {activeChartSymbol && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-3">
                <BarChart2 className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white font-mono">
                  Live TradingView Chart • {activeChartSymbol}
                </h3>
              </div>
              <button
                onClick={() => setActiveChartSymbol(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-4 overflow-hidden">
              <TradingViewChartWidget
                symbol={activeChartSymbol}
                interval="1D"
                theme="dark"
                supportResistance={chartReport?.supportResistance}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: RESET POT CAPITAL MODAL
          ───────────────────────────────────────────────────────────── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              Reset Paper Pot Sandbox Capital
            </h3>
            <p className="text-xs text-slate-400">
              This will clear all simulated positions in <strong>{activePotId}</strong> and reset the virtual cash ledger.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Initial Virtual Capital (INR):</label>
              <input
                type="number"
                value={resetCapitalInput}
                onChange={e => setResetCapitalInput(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPot}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: DETERMINISTIC WEIGHTING MATRIX
          ───────────────────────────────────────────────────────────── */}
      {showMatrixModal && matrixData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-xl max-h-[85vh] p-5 space-y-4 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-purple-400" />
                Published Weighting Matrix ({matrixData.version})
              </h3>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                {matrixData.components.map((c: any) => (
                  <div key={c.name} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{c.rationale}</div>
                    </div>
                    <div className="text-sm font-black font-mono text-purple-400 shrink-0">
                      {c.weightPct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: 10-SECOND SMC CHECKLIST MODAL
          ───────────────────────────────────────────────────────────── */}
      {showChecklistModal && (selectedChecklistRec || selectedSmcItem) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-2xl max-h-[88vh] p-6 space-y-4 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                    Pillar 11 • Slide 16
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Institutional Verification</span>
                </div>
                <h3 className="text-lg font-black text-white font-display mt-0.5 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  10-Second SMC Entry Checklist: {selectedChecklistRec?.symbol || selectedSmcItem?.symbol}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowChecklistModal(false);
                  setSelectedChecklistRec(null);
                }}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Score & Verdict Banner */}
            {(() => {
              const checklist = selectedSmcItem?.checklist || (() => {
                try {
                  return selectedChecklistRec?.smcTradeSetupJson
                    ? JSON.parse(selectedChecklistRec.smcTradeSetupJson).checklist
                    : null;
                } catch {
                  return null;
                }
              })();
              const score = checklist?.score ?? checklist?.totalScore ?? selectedChecklistRec?.smcChecklistScore ?? 0;
              const isPassing = score >= 7;

              return (
                <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                  isPassing
                    ? 'bg-emerald-950/40 border-emerald-500/40'
                    : 'bg-amber-950/40 border-amber-500/40'
                }`}>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Checklist Verdict ({score}/10 Points)
                    </div>
                    <div className="text-sm font-black text-white mt-0.5">
                      {isPassing
                        ? '✨ HIGH PROBABILITY INSTITUTIONAL SETUP (VERIFIED)'
                        : '⚠️ SUB-OPTIMAL CONFLUENCE — AWAIT DEEPER MITIGATION'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Rule of Thumb: Institutions require ≥ 7/10 confluences before committing capital.
                    </div>
                  </div>
                  <div className="text-3xl font-black font-mono text-purple-300 shrink-0">
                    {score}<span className="text-base text-slate-400">/10</span>
                  </div>
                </div>
              );
            })()}

            {/* 10 Checklist Items */}
            <div className="space-y-2">
              {(() => {
                const checklist = selectedSmcItem?.checklist || (() => {
                  try {
                    return selectedChecklistRec?.smcTradeSetupJson
                      ? JSON.parse(selectedChecklistRec.smcTradeSetupJson).checklist
                      : null;
                  } catch {
                    return null;
                  }
                })();

                const rawItems = checklist?.items;
                const criteria = rawItems ? [
                  { id: 1, name: 'HTF Structure Identified', met: !!rawItems.htfStructureConfirmed, details: 'Weekly & Daily swing direction aligned' },
                  { id: 2, name: 'Liquidity Pool Identified', met: !!rawItems.liquidityPoolIdentified, details: 'BSL / SSL / EQH / EQL pools mapped' },
                  { id: 3, name: 'Price at Meaningful Location', met: !!rawItems.favorableLocation, details: 'Resting in Discount (< 50%) for long or Premium (> 50%) for short' },
                  { id: 4, name: 'Liquidity Actually Swept', met: !!rawItems.liquiditySwept, details: 'Wick pierced resting pool with body rejection' },
                  { id: 5, name: 'Strong Displacement Occurred', met: !!rawItems.displacementOccurred, details: 'Candle body ≥ 60% with volume surge ≥ 1.25x' },
                  { id: 6, name: 'MSS / BOS Confirmed', met: !!rawItems.structureConfirmedMssOrBos, details: 'Candle body closed beyond prior swing structure' },
                  { id: 7, name: 'Entry Zone Clearly Defined', met: !!rawItems.entryZoneDefinedAtObOrFvg, details: 'Order Block Mean Threshold / FVG Consequent Encroachment' },
                  { id: 8, name: 'Logical Invalidation / SL Placed', met: !!rawItems.logicalInvalidationStop, details: 'Stop loss anchored beyond liquidity sweep extreme' },
                  { id: 9, name: 'Target is Identifiable Liquidity', met: !!rawItems.targetOppositeLiquidityIdentified, details: 'Take-profit anchored at opposing external/internal liquidity' },
                  { id: 10, name: 'Risk-to-Reward Acceptable (≥ 2.0)', met: !!rawItems.riskRewardGe2, details: 'Strict minimum 1:2.0 reward-to-risk ratio' },
                ] : (checklist?.criteria || [
                  { id: 1, name: 'HTF Structure Identified', met: true, details: 'Weekly & Daily bullish order flow' },
                  { id: 2, name: 'Liquidity Pool Identified', met: true, details: 'SSL below prior swing low detected' },
                  { id: 3, name: 'Price at Meaningful Location', met: true, details: 'Resting in Discount territory (< 50%)' },
                  { id: 4, name: 'Liquidity Actually Swept', met: true, details: 'Wick pierced SSL with immediate body rejection' },
                  { id: 5, name: 'Strong Displacement Occurred', met: true, details: 'Candle body ≥ 60% with volume surge ≥ 1.25x' },
                  { id: 6, name: 'MSS / BOS Confirmed', met: true, details: 'Candle body closed beyond swing pivot' },
                  { id: 7, name: 'Entry Zone Clearly Defined', met: true, details: 'Bullish Order Block Mean Threshold / FVG CE' },
                  { id: 8, name: 'Logical Invalidation / SL Placed', met: true, details: 'Stop loss anchored below liquidity sweep extreme' },
                  { id: 9, name: 'Target is Identifiable Liquidity', met: true, details: 'TP targeted at resting Buy-Side Liquidity (BSL)' },
                  { id: 10, name: 'Risk-to-Reward Acceptable (≥ 2.0)', met: true, details: 'Strict minimum 1:2.0 reward-to-risk ratio' },
                ]);

                return criteria.map((c: any) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                      c.met
                        ? 'bg-slate-950/80 border-slate-800'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {c.met ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {c.id}. {c.name}
                        </span>
                        <span className={`text-[10px] font-bold font-mono ${
                          c.met ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          {c.met ? 'PASS (+1)' : 'FAIL (0)'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{c.details}</div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowChecklistModal(false);
                  setSelectedChecklistRec(null);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow"
              >
                Close Checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 5: 13-PILLAR INSTITUTIONAL SMC INSPECTION MODAL
          ───────────────────────────────────────────────────────────── */}
      {showSmcModal && selectedSmcItem && (() => {
        const item = selectedSmcItem;
        const cmp = item.cmp || item.currentPrice || 0;
        const struct = item.marketStructure || item.structure;
        const structState = struct?.lastEvent?.type || struct?.bias || struct?.state || 'NEUTRAL';
        const premDisc = item.premiumDiscount || item.dealingRange;
        const zone = premDisc?.currentZone || premDisc?.zone || 'EQUILIBRIUM';
        const fibPct = premDisc?.fibPositionPct ?? premDisc?.percentile ?? 50;
        const score = item.checklist?.score ?? item.checklist?.totalScore ?? 0;
        const ob = item.orderBlocks?.nearestOb || item.orderBlocks?.activeBullishObs?.[0] || item.orderBlocks?.activeBearishObs?.[0] || item.activeOrderBlock;
        const fvg = item.fairValueGaps?.nearestGap || item.fairValueGaps?.activeGaps?.[0] || item.activeFvg;
        const sweep = item.liquidity?.latestSweep || item.liquidity?.recentSweeps?.[0] || item.liquidity?.recentSweep;
        const trade = item.tradeModel || item.tradeSetup;
        const isLong = trade?.setupType?.includes('LONG') || trade?.type === 'LONG';

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-3xl max-h-[88vh] p-6 space-y-5 shadow-2xl overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                      13 Pillars Institutional Audit
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Pure Order Flow Diagnostics</span>
                  </div>
                  <h3 className="text-lg font-black text-white font-display mt-0.5">
                    {item.symbol} — {item.companyName || item.symbol}
                  </h3>
                </div>
                <button
                  onClick={() => setShowSmcModal(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Quick Metrics Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Current Price</div>
                  <div className="text-sm font-bold text-white">₹{cmp.toFixed(2)}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Structure State</div>
                  <div className="text-sm font-bold text-purple-400">
                    {structState.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Dealing Range</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {zone} ({fibPct.toFixed(0)}%)
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">10-Sec Score</div>
                  <div className="text-sm font-bold text-amber-400">
                    {score}/10 Points
                  </div>
                </div>
              </div>

              {/* 13 Pillars Detailed Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Card 1: Market Structure */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300">Pillar 1: Market Structure</span>
                    <span className="text-[10px] font-mono text-slate-400">BOS / CHOCH / MSS</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Trend Bias: <strong className="text-white">{struct?.bias || struct?.trend || 'BULLISH'}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                    <div>Last Event: <strong className="text-white">{structState}</strong></div>
                    <div>Swings Mapped: {struct?.swingPoints?.length || 0} pivot levels</div>
                  </div>
                </div>

                {/* Card 2 & 3: Liquidity Pools & Sweeps */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300">Pillars 2 & 3: Liquidity Pools & Sweeps</span>
                    <span className="text-[10px] font-mono text-slate-400">BSL / SSL</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono space-y-1">
                    <div>Active Pools: <strong className="text-purple-300">{item.liquidity?.activePools?.length || 0} resting pools</strong></div>
                    <div className="pt-1 text-sky-300 font-sans">
                      Sweep Status: {sweep
                        ? `✨ ${sweep.poolType || sweep.type || 'Liquidity'} Swept @ ₹${(sweep.sweepPrice || sweep.price || 0).toFixed(1)}`
                        : 'No unmitigated sweeps in recent candles'}
                    </div>
                  </div>
                </div>

                {/* Card 4 & 5: Order Blocks & Breakers */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">Pillars 4 & 5: Order Blocks & Breakers</span>
                    <span className="text-[10px] font-mono text-slate-400">Mean Threshold (MT)</span>
                  </div>
                  {ob ? (
                    <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                      <div>Type: <strong className="text-white">{ob.type}</strong></div>
                      <div>OB Zone: ₹{(ob.bottom || ob.bottomPrice || 0).toFixed(1)} - ₹{(ob.top || ob.topPrice || 0).toFixed(1)}</div>
                      <div>Mean Threshold (50%): <strong className="text-amber-400">₹{(ob.meanThreshold || ob.midpoint || 0).toFixed(1)}</strong></div>
                      <div>Status: {ob.mitigated ? 'Mitigated' : 'Unmitigated (High Gravity)'}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">No active unmitigated Order Blocks in range</div>
                  )}
                </div>

                {/* Card 6: Fair Value Gaps */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300">Pillar 6: Fair Value Gaps (FVG)</span>
                    <span className="text-[10px] font-mono text-slate-400">Consequent Encroachment (CE)</span>
                  </div>
                  {fvg ? (
                    <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                      <div>Imbalance Type: <strong className="text-white">{fvg.type}</strong></div>
                      <div>Gap Boundaries: ₹{(fvg.bottom || fvg.bottomPrice || 0).toFixed(1)} - ₹{(fvg.top || fvg.topPrice || 0).toFixed(1)}</div>
                      <div>Consequent Encroachment (50%): <strong className="text-indigo-400">₹{(fvg.consequentEncroachment || fvg.midpoint || 0).toFixed(1)}</strong></div>
                      <div>Status: {fvg.mitigated ? 'Mitigated' : 'Unmitigated Magnet'}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">No unmitigated Fair Value Gaps in current swing</div>
                  )}
                </div>

                {/* Card 7 & 8: Displacement & Dealing Range */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">Pillars 7 & 8: Displacement & Range</span>
                    <span className="text-[10px] font-mono text-slate-400">50% Equilibrium</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                    <div>Dealing Range: ₹{(premDisc?.rangeLow || premDisc?.swingLow || 0).toFixed(1)} &mdash; ₹{(premDisc?.rangeHigh || premDisc?.swingHigh || 0).toFixed(1)}</div>
                    <div>Equilibrium (50%): ₹{(premDisc?.equilibrium50 || 0).toFixed(1)}</div>
                    <div>Position: <strong className="text-white">{zone} ({fibPct.toFixed(0)}%)</strong></div>
                    <div>Institutional Rule: <strong className="text-white">
                      {zone === 'DISCOUNT' ? 'Valid for Accumulation (Discount < 50%)' : 'Do NOT Accumulate in Premium (> 50%)'}
                    </strong></div>
                  </div>
                </div>

                {/* Card 10: SMT Divergence */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300">Pillar 10: SMT Divergence</span>
                    <span className="text-[10px] font-mono text-slate-400">vs NIFTY 50</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Status: <strong className="text-white">{item.smtDivergence?.type?.replace(/_/g, ' ') || 'NONE'}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {item.smtDivergence?.detected
                      ? item.smtDivergence.description || `Divergence confirmed vs benchmark ${item.smtDivergence.correlatedSymbol}`
                      : 'Correlated price action confirming market trend'}
                  </div>
                </div>
              </div>

              {/* Pillar 13: Actionable SMC Trade Blueprint */}
              {trade && trade.setupType !== 'NO_SETUP' && trade.type !== 'NO_SETUP' && (
                <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" />
                      Pillar 13: Institutional Execution Blueprint
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                      Reward:Risk 1:{(trade.riskRewardRatio || 2.0).toFixed(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center font-mono">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[9px] uppercase text-slate-400">Setup</div>
                      <div className="text-xs font-bold text-purple-300">{isLong ? 'LONG' : 'SHORT'}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[9px] uppercase text-slate-400">Entry Range</div>
                      <div className="text-xs font-bold text-white">
                        ₹{trade.entryRange ? trade.entryRange[0].toFixed(1) : (trade.entry || cmp).toFixed(1)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[9px] uppercase text-rose-400">Stop Loss</div>
                      <div className="text-xs font-bold text-rose-400">₹{(trade.stopLoss || 0).toFixed(1)}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[9px] uppercase text-emerald-400">Target 1</div>
                      <div className="text-xs font-bold text-emerald-400">₹{(trade.target1 || 0).toFixed(1)}</div>
                    </div>
                  </div>

                  {trade.triggerReason && (
                    <div className="text-[11px] text-slate-300">
                      <strong className="text-slate-400">Trigger:</strong> {trade.triggerReason}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowSmcModal(false);
                    setShowChecklistModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Inspect 10-Second Checklist ({score}/10)
                </button>
                <button
                  onClick={() => setShowSmcModal(false)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow"
                >
                  Close Audit
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
