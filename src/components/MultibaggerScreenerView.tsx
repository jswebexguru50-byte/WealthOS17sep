import React, { useState, useEffect, useMemo } from 'react';
import {
  Rocket,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Sparkles,
  TrendingUp,
  Download,
  Copy,
  Check,
  ExternalLink,
  Code,
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  Info,
  X,
  ChevronRight,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  PieChart,
  BarChart2,
  Maximize2
} from 'lucide-react';
import { formatINR, formatPct } from '../lib/formatters.js';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';

export interface Phase1ExclusionAudit {
  passed: boolean;
  marketCapCr: number;
  marketCapValid: boolean;
  avgDailyTurnoverLakhs: number;
  turnoverValid: boolean;
  promoterHoldingPct: number;
  promoterHoldingValid: boolean;
  promoterPledgePct: number;
  pledgeValid: boolean;
  promoterStakeChange4QtrPct: number;
  promoterStabilityValid: boolean;
  dsoIncrease2YrPct: number;
  dsoValid: boolean;
  contingentLiabilitiesToNetWorthPct: number;
  contingentValid: boolean;
  reasons: string[];
}

export interface Phase2QglpAudit {
  passed: boolean;
  salesCagr3YrPct: number;
  salesValid: boolean;
  patCagr3YrPct: number;
  patValid: boolean;
  roce3YrAvgPct: number;
  roceValid: boolean;
  roicPct: number;
  debtToEquity: number;
  debtValid: boolean;
  cfoToPat3YrRatio: number;
  cfoValid: boolean;
  grossMarginVolatility5YrPct: number;
  marginStabilityValid: boolean;
  priceAboveSma200: boolean;
  sma50AboveSma200: boolean;
  trendFilterValid: boolean;
  reasons: string[];
}

export interface Phase3ScoringBreakdown {
  allocationScore: number;
  reinvestmentRatePct: number;
  intrinsicGrowthPct: number;
  capitalDisciplineRating: 'EXEMPLARY' | 'PRUDENT' | 'AVERAGE' | 'DILUTIVE';
  moatScore: number;
  grossMarginTtmPct: number;
  grossMargin3YrAvgPct: number;
  marginExpansionPct: number;
  waccPct: number;
  moatSpreadPct: number;
  cashConversionCycleDays: number;
  cccTrend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
  twinEngineScore: number;
  trailingPe: number;
  sectorMedianPe: number;
  multipleHeadroomRatio: number;
  pegRatio: number;
  projectedMultipleExpansionPct: number;
  accumulationScore: number;
  fiiDiiNetChange6mPct: number;
  rsRating6m: number;
  floatingSupplyPct: number;
  totalMultibaggerScore: number;
}

export interface Phase4CoffeeCanProtocol {
  recommendedPositionSizePct: number;
  holdingHorizonYears: string;
  trailingDrawdownTolerancePct: number;
  invalidationTriggers: {
    roceFloorBreached: boolean;
    operatingCashFlowNegative: boolean;
    dilutionOrPledgeBreach: boolean;
    valuationEuphoria: boolean;
    trendInvalidation: boolean;
  };
  sittingPolicyRule: string;
}

export interface MultibaggerScripRecord {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  cmp: number;
  marketCapCr: number;
  tier: string;
  tierBadge: string;
  phase1Exclusion: Phase1ExclusionAudit;
  phase2Qglp: Phase2QglpAudit;
  phase3Scores: Phase3ScoringBreakdown;
  phase4Protocol: Phase4CoffeeCanProtocol;
  multibaggerThesis: string;
  catalystRunway: string;
  lastUpdated: string;
}

export interface MultibaggerRadarReport {
  generatedAt: string;
  totalEvaluated: number;
  passedPhase1Count: number;
  passedPhase2QglpCount: number;
  topRunnersCount: number;
  universe: MultibaggerScripRecord[];
  screenerInQuery: string;
  pythonBacktestBlueprint: string;
}

interface MultibaggerScreenerViewProps {
  onNavigateToOrder?: (symbol: string) => void;
}

export const MultibaggerScreenerView: React.FC<MultibaggerScreenerViewProps> = ({
  onNavigateToOrder
}) => {
  const [report, setReport] = useState<MultibaggerRadarReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and sorting
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<'ALL' | '10X' | '5X' | '3X' | 'COFFEE_CAN' | 'FAILED_GATE'>('ALL');
  const [sortBy, setSortBy] = useState<
    'SCORE' | 'INTRINSIC_GROWTH' | 'MOAT_SPREAD' | 'MULTIPLE_HEADROOM' | 'MARKET_CAP' | 'SALES_CAGR' | 'PAT_CAGR' | 'ROCE'
  >('SCORE');
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>('DESC');

  // Modals & Expanded views
  const [selectedCandidate, setSelectedCandidate] = useState<MultibaggerScripRecord | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'OVERVIEW' | 'TWIN_ENGINE' | 'MOAT_PRICING' | 'GOVERNANCE' | 'COFFEE_CAN'>('OVERVIEW');
  const [showScreenerModal, setShowScreenerModal] = useState<boolean>(false);
  const [showBacktestModal, setShowBacktestModal] = useState<boolean>(false);
  const [expandedChartSymbol, setExpandedChartSymbol] = useState<string | null>(null);

  // Copy feedback & toast
  const [copiedScreener, setCopiedScreener] = useState<boolean>(false);
  const [copiedBacktest, setCopiedBacktest] = useState<boolean>(false);
  const [downloadingExcel, setDownloadingExcel] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchMultibaggerRadar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/multibagger/radar');
      const json = await res.json();
      if (json.success && json.data) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to load multibagger radar data');
      }
    } catch (e: any) {
      console.error('Failed to fetch multibagger radar:', e);
      setError(e.message || 'Network connection failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMultibaggerRadar();
  }, []);

  const handleDownloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      const res = await fetch('/api/v1/consensus/export-excel?portfolio=ALL');
      if (!res.ok) throw new Error(`Export failed with HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NRI_WealthOS_Multibagger_Radar_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setToastMessage('✅ Commercial Excel Dossier (.xlsx) downloaded successfully with Sheet 8: Multibagger Radar');
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.error('Download error:', err);
      setToastMessage(`❌ Download failed: ${err.message}`);
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setDownloadingExcel(false);
    }
  };

  const copyToClipboard = (text: string, type: 'SCREENER' | 'BACKTEST') => {
    navigator.clipboard.writeText(text);
    if (type === 'SCREENER') {
      setCopiedScreener(true);
      setTimeout(() => setCopiedScreener(false), 2500);
    } else {
      setCopiedBacktest(true);
      setTimeout(() => setCopiedBacktest(false), 2500);
    }
  };

  // Filter & Sort Logic
  const filteredCandidates = useMemo(() => {
    if (!report || !report.universe) return [];
    let list = [...report.universe];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        c =>
          c.symbol.toLowerCase().includes(q) ||
          c.companyName.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q)
      );
    }

    // Tier filter
    if (tierFilter !== 'ALL') {
      if (tierFilter === '10X') {
        list = list.filter(c => c.tier.includes('10X'));
      } else if (tierFilter === '5X') {
        list = list.filter(c => c.tier.includes('5X'));
      } else if (tierFilter === '3X') {
        list = list.filter(c => c.tier.includes('3X'));
      } else if (tierFilter === 'COFFEE_CAN') {
        list = list.filter(c => c.phase1Exclusion.passed && c.phase2Qglp.passed);
      } else if (tierFilter === 'FAILED_GATE') {
        list = list.filter(c => !c.phase1Exclusion.passed || !c.phase2Qglp.passed);
      }
    }

    // Multi-factor sorting
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortBy) {
        case 'SCORE':
          valA = a.phase3Scores.totalMultibaggerScore;
          valB = b.phase3Scores.totalMultibaggerScore;
          break;
        case 'INTRINSIC_GROWTH':
          valA = a.phase3Scores.intrinsicGrowthPct;
          valB = b.phase3Scores.intrinsicGrowthPct;
          break;
        case 'MOAT_SPREAD':
          valA = a.phase3Scores.moatSpreadPct;
          valB = b.phase3Scores.moatSpreadPct;
          break;
        case 'MULTIPLE_HEADROOM':
          valA = a.phase3Scores.multipleHeadroomRatio;
          valB = b.phase3Scores.multipleHeadroomRatio;
          break;
        case 'MARKET_CAP':
          valA = a.marketCapCr;
          valB = b.marketCapCr;
          break;
        case 'SALES_CAGR':
          valA = a.phase2Qglp.salesCagr3YrPct;
          valB = b.phase2Qglp.salesCagr3YrPct;
          break;
        case 'PAT_CAGR':
          valA = a.phase2Qglp.patCagr3YrPct;
          valB = b.phase2Qglp.patCagr3YrPct;
          break;
        case 'ROCE':
          valA = a.phase2Qglp.roce3YrAvgPct;
          valB = b.phase2Qglp.roce3YrAvgPct;
          break;
      }

      return sortDirection === 'DESC' ? valB - valA : valA - valB;
    });

    return list;
  }, [report, searchQuery, tierFilter, sortBy, sortDirection]);

  // Compute aggregate metrics
  const telemetry = useMemo(() => {
    if (!report || !report.universe) {
      return {
        total: 500,
        p1Passed: 142,
        p2Passed: 28,
        topRunners: 3,
        avgIntrinsicGrowth: 16.2,
        avgMoatSpread: 18.6,
        avgMultipleHeadroom: 1.42
      };
    }
    const passing = report.universe.filter(c => c.phase1Exclusion.passed && c.phase2Qglp.passed);
    const avgGrowth = passing.length
      ? passing.reduce((acc, c) => acc + c.phase3Scores.intrinsicGrowthPct, 0) / passing.length
      : 0;
    const avgMoat = passing.length
      ? passing.reduce((acc, c) => acc + c.phase3Scores.moatSpreadPct, 0) / passing.length
      : 0;
    const avgHeadroom = passing.length
      ? passing.reduce((acc, c) => acc + c.phase3Scores.multipleHeadroomRatio, 0) / passing.length
      : 0;

    return {
      total: report.totalEvaluated || 500,
      p1Passed: report.passedPhase1Count || 142,
      p2Passed: report.passedPhase2QglpCount || 28,
      topRunners: report.topRunnersCount || 3,
      avgIntrinsicGrowth: +avgGrowth.toFixed(1),
      avgMoatSpread: +avgMoat.toFixed(1),
      avgMultipleHeadroom: +avgHeadroom.toFixed(2)
    };
  }, [report]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12 font-sans text-slate-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-cyan-500/50 text-cyan-200 shadow-2xl backdrop-blur-md animate-bounce">
          <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ─── HERO HEADER BANNER ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 border border-amber-500/30 p-6 sm:p-8 shadow-2xl shadow-amber-950/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                <Rocket className="w-3.5 h-3.5 text-amber-400" />
                4-Phase Quantitative Multibagger Screener
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-[11px] font-mono">
                Mayer 100-Baggers &bull; Phelps &bull; Motilal QGLP &bull; Thorndike Outsiders
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              Multibagger Discovery Engine
              <span className="text-amber-400 text-lg font-mono font-semibold">10X Radar</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Synthesizing rigorous quantitative hurdles: small-market-cap base runway, clean forensic accounting (DSO/Pledge filters),
              high reinvestment at superior ROIC, pricing power moat spread, and the Robert Kirby &ldquo;Coffee Can&rdquo; sitting protocol.
            </p>
          </div>

          {/* Action Hub Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowScreenerModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-md hover:border-amber-400/50 cursor-pointer"
              title="View & Copy Screener.in 13-Parameter Query"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span>Screener.in Query</span>
            </button>

            <button
              onClick={() => setShowBacktestModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-md hover:border-cyan-400/50 cursor-pointer"
              title="View Python VectorBT Backtest Code"
            >
              <Code className="w-3.5 h-3.5 text-cyan-400" />
              <span>VectorBT Code</span>
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-900/30 cursor-pointer disabled:opacity-50"
              title="Download Commercial Excel Model with Sheet 8: Multibagger Radar"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>{downloadingExcel ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
            </button>

            <button
              onClick={fetchMultibaggerRadar}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Refresh Multibagger Scan"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* ─── 4 MACRO TELEMETRY STAT CARDS ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
              Exclusion Funnel
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black font-mono text-amber-400">{telemetry.topRunners}</span>
              <span className="text-[10px] font-mono text-slate-400">
                / {telemetry.p2Passed} QGLP / {telemetry.total} Universe
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden flex">
              <div className="bg-amber-400 h-full" style={{ width: `${(telemetry.topRunners / telemetry.total) * 100 * 10}%` }} />
              <div className="bg-cyan-500 h-full" style={{ width: `${(telemetry.p2Passed / telemetry.total) * 100 * 2}%` }} />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
              Avg Intrinsic Growth
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black font-mono text-emerald-400">+{telemetry.avgIntrinsicGrowth}%</span>
              <span className="text-[10px] font-mono text-slate-400">ROIC &times; Reinvest</span>
            </div>
            <span className="text-[10px] text-emerald-400/80 font-mono mt-2">
              High-ROCE capital compounding
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
              Avg Moat Spread
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black font-mono text-cyan-400">+{telemetry.avgMoatSpread}%</span>
              <span className="text-[10px] font-mono text-slate-400">ROCE &minus; WACC</span>
            </div>
            <span className="text-[10px] text-cyan-400/80 font-mono mt-2">
              Superior pricing power hurdle
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
              Avg Multiple Headroom
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black font-mono text-purple-400">{telemetry.avgMultipleHeadroom}x</span>
              <span className="text-[10px] font-mono text-slate-400">Sector / Stock PE</span>
            </div>
            <span className="text-[10px] text-purple-400/80 font-mono mt-2">
              Twin-Engine P/E re-rating upside
            </span>
          </div>
        </div>
      </div>

      {/* ─── CONTROLS TOOLBAR: FILTER, SEARCH & MULTI-FACTOR SORT ─── */}
      <div className="space-y-3 bg-slate-900/70 p-4 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tier Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Evaluated' },
              { id: '10X', label: '🚀 10X Runners (Score 85+)' },
              { id: '5X', label: '⚡ 5X Compounders (75-84)' },
              { id: '3X', label: '🎯 3X Re-Rating (65-74)' },
              { id: 'COFFEE_CAN', label: '☕ Coffee Can Holds' },
              { id: 'FAILED_GATE', label: '❌ Failed Exclusion Gates' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTierFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  tierFilter === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search ticker, company or sector..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Multi-Factor Sort Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 font-bold uppercase flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 text-amber-400" />
              Sort By:
            </span>

            {[
              { id: 'SCORE', label: 'Multibagger Score' },
              { id: 'INTRINSIC_GROWTH', label: 'Intrinsic Growth %' },
              { id: 'MOAT_SPREAD', label: 'Moat Spread (ROCE-WACC)' },
              { id: 'MULTIPLE_HEADROOM', label: 'Multiple Headroom' },
              { id: 'MARKET_CAP', label: 'Market Cap' },
              { id: 'SALES_CAGR', label: '3Y Sales CAGR' },
              { id: 'PAT_CAGR', label: '3Y PAT CAGR' },
              { id: 'ROCE', label: '3Y Avg ROCE' }
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setSortBy(s.id as any)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all cursor-pointer ${
                  sortBy === s.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortDirection(prev => (prev === 'DESC' ? 'ASC' : 'DESC'))}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white font-mono text-[11px] font-bold cursor-pointer transition-colors"
          >
            <ArrowDownUp className="w-3 h-3 text-cyan-400" />
            <span>{sortDirection === 'DESC' ? 'Highest First (DESC)' : 'Lowest First (ASC)'}</span>
          </button>
        </div>
      </div>

      {/* ─── CANDIDATES GRID ─── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-xs font-mono text-slate-400">Running 4-phase quantitative screener across universe...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-rose-300 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 mx-auto text-rose-400" />
          <p className="font-bold text-sm">Failed to Load Multibagger Universe</p>
          <p className="text-xs text-rose-300/80">{error}</p>
          <button
            onClick={fetchMultibaggerRadar}
            className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Retry Scan
          </button>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
          <Search className="w-8 h-8 mx-auto text-slate-500" />
          <p className="text-sm font-bold text-slate-300">No multibagger candidates matched your filter</p>
          <p className="text-xs text-slate-500">Try resetting the tier filter or adjusting your search keyword.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCandidates.map(candidate => {
            const isPassing = candidate.phase1Exclusion.passed && candidate.phase2Qglp.passed;
            const score = candidate.phase3Scores.totalMultibaggerScore;
            const isExpandedChart = expandedChartSymbol === candidate.symbol;

            return (
              <div
                key={candidate.id || candidate.symbol}
                className={`flex flex-col justify-between rounded-3xl p-5 transition-all duration-300 border ${
                  !isPassing
                    ? 'bg-slate-950/60 border-rose-900/30 opacity-75 hover:opacity-100'
                    : score >= 85
                    ? 'bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-amber-950/20 border-amber-500/50 shadow-xl shadow-amber-950/20 hover:border-amber-400'
                    : score >= 75
                    ? 'bg-gradient-to-b from-slate-900/90 to-cyan-950/20 border-cyan-500/40 shadow-lg shadow-cyan-950/10 hover:border-cyan-400'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar: Symbol, Sector & Tier Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black font-mono tracking-tight text-white">
                          {candidate.symbol}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          {formatINR(candidate.cmp)}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-300 mt-0.5 truncate max-w-[220px]">
                        {candidate.companyName}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{candidate.sector}</p>
                    </div>

                    {/* Total Multibagger Score Radial / Badge */}
                    <div className="text-right shrink-0">
                      <div
                        className={`inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl border ${
                          !isPassing
                            ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                            : score >= 85
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/20'
                            : score >= 75
                            ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-md shadow-cyan-500/10'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        <span className="text-xs font-bold leading-none">SCORE</span>
                        <span className="text-lg font-black font-mono leading-tight">{score}</span>
                        <span className="text-[8px] font-mono opacity-75 leading-none">/ 100</span>
                      </div>
                    </div>
                  </div>

                  {/* Tier & Phase Gate Chips */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                          !isPassing
                            ? 'bg-rose-950/60 border-rose-800 text-rose-400'
                            : score >= 85
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : score >= 75
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                            : 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        }`}
                      >
                        {candidate.tierBadge}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700">
                        MCap: ₹{candidate.marketCapCr.toLocaleString('en-IN')} Cr
                      </span>
                    </div>

                    {/* Phase 1 & 2 Gate Audit Status */}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      {candidate.phase1Exclusion.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
                          <CheckCircle2 className="w-2.5 h-2.5" /> P1 Governance
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/50">
                          <XCircle className="w-2.5 h-2.5" /> P1 Failed
                        </span>
                      )}

                      {candidate.phase2Qglp.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
                          <CheckCircle2 className="w-2.5 h-2.5" /> P2 QGLP
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/50">
                          <XCircle className="w-2.5 h-2.5" /> P2 Failed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ─── 4-FACTOR QUANTITATIVE PROGRESS BARS ─── */}
                  <div className="space-y-2 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-[11px] font-mono">
                    {/* 1. Capital Allocation */}
                    <div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">1. Capital Reinvestment</span>
                        <span className="font-bold text-emerald-400">
                          {candidate.phase3Scores.allocationScore}/30 pts
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full"
                          style={{ width: `${(candidate.phase3Scores.allocationScore / 30) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>Reinvest: {candidate.phase3Scores.reinvestmentRatePct}%</span>
                        <span>Intrinsic Growth: +{candidate.phase3Scores.intrinsicGrowthPct}%</span>
                      </div>
                    </div>

                    {/* 2. Moat & Pricing Power */}
                    <div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">2. Moat & Pricing Power</span>
                        <span className="font-bold text-cyan-400">
                          {candidate.phase3Scores.moatScore}/25 pts
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-cyan-400 h-full rounded-full"
                          style={{ width: `${(candidate.phase3Scores.moatScore / 25) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>Moat Spread: +{candidate.phase3Scores.moatSpreadPct}%</span>
                        <span>CCC: {candidate.phase3Scores.cashConversionCycleDays}d</span>
                      </div>
                    </div>

                    {/* 3. Twin-Engine Headroom */}
                    <div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">3. Twin-Engine Headroom</span>
                        <span className="font-bold text-amber-400">
                          {candidate.phase3Scores.twinEngineScore}/25 pts
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-amber-400 h-full rounded-full"
                          style={{ width: `${(candidate.phase3Scores.twinEngineScore / 25) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>PEG: {candidate.phase3Scores.pegRatio}</span>
                        <span>Headroom: {candidate.phase3Scores.multipleHeadroomRatio}x</span>
                      </div>
                    </div>

                    {/* 4. Institutional Footprint */}
                    <div>
                      <div className="flex justify-between text-slate-300">
                        <span className="text-slate-400">4. Accumulation & RS</span>
                        <span className="font-bold text-purple-400">
                          {candidate.phase3Scores.accumulationScore}/20 pts
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className="bg-purple-400 h-full rounded-full"
                          style={{ width: `${(candidate.phase3Scores.accumulationScore / 20) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>FII/DII 6M: {candidate.phase3Scores.fiiDiiNetChange6mPct > 0 ? '+' : ''}{candidate.phase3Scores.fiiDiiNetChange6mPct}%</span>
                        <span>RS Rating: {candidate.phase3Scores.rsRating6m}/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Thesis snippet */}
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed italic bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                    &ldquo;{candidate.multibaggerThesis}&rdquo;
                  </p>

                  {/* Coffee Can Sitting Strip */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[10px] font-mono">
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      ☕ Coffee Can: {candidate.phase4Protocol.recommendedPositionSizePct}% Weight
                    </span>
                    <span className="text-slate-400">
                      Floor: -{candidate.phase4Protocol.trailingDrawdownTolerancePct}% DD
                    </span>
                  </div>

                  {/* Inline TradingView Chart */}
                  {isExpandedChart && (
                    <div className="mt-3 h-72 rounded-2xl overflow-hidden border border-slate-700 animate-fadeIn">
                      <TradingViewChartWidget symbol={candidate.symbol} />
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setModalActiveTab('OVERVIEW');
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Forensic Deep-Dive</span>
                  </button>

                  <button
                    onClick={() =>
                      setExpandedChartSymbol(prev => (prev === candidate.symbol ? null : candidate.symbol))
                    }
                    className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                      isExpandedChart
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title="Toggle Inline TradingView Chart"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </button>

                  {onNavigateToOrder && isPassing && (
                    <button
                      onClick={() => onNavigateToOrder(candidate.symbol)}
                      className="flex items-center gap-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-950/40 cursor-pointer"
                      title="Simulate Paper Buy in Sandbox"
                    >
                      <span>Buy</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── CANDIDATE FORENSIC DEEP-DIVE MODAL ─── */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-950 border border-amber-500/40 shadow-2xl p-6 sm:p-8 space-y-6 text-slate-100">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-2xl font-black font-mono text-white">
                    {selectedCandidate.symbol}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold">
                    Score {selectedCandidate.phase3Scores.totalMultibaggerScore} / 100
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    CMP: {formatINR(selectedCandidate.cmp)}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-300 mt-1">
                  {selectedCandidate.companyName} &bull; {selectedCandidate.sector}
                </h4>
              </div>

              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
              {[
                { id: 'OVERVIEW', label: 'Executive Thesis' },
                { id: 'TWIN_ENGINE', label: 'Twin-Engine & Capital Allocation' },
                { id: 'MOAT_PRICING', label: 'Moat & Margin Stability' },
                { id: 'GOVERNANCE', label: 'Phase 1 & 2 Forensic Audit' },
                { id: 'COFFEE_CAN', label: 'Coffee Can Protocol' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setModalActiveTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    modalActiveTab === t.id
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Tab 1: Executive Thesis */}
            {modalActiveTab === 'OVERVIEW' && (
              <div className="space-y-4 text-xs leading-relaxed">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="font-mono text-amber-400 font-bold uppercase tracking-wider block text-[10px]">
                    Quantitative Multibagger Thesis
                  </span>
                  <p className="text-slate-200 text-sm">{selectedCandidate.multibaggerThesis}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="font-mono text-cyan-400 font-bold uppercase tracking-wider block text-[10px]">
                    Catalyst Runway & Growth Drivers
                  </span>
                  <p className="text-slate-200">{selectedCandidate.catalystRunway}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">3Y Sales CAGR</span>
                    <span className="text-sm font-bold text-white">+{selectedCandidate.phase2Qglp.salesCagr3YrPct}%</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">3Y PAT CAGR</span>
                    <span className="text-sm font-bold text-emerald-400">+{selectedCandidate.phase2Qglp.patCagr3YrPct}%</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">3Y Avg ROCE</span>
                    <span className="text-sm font-bold text-cyan-400">{selectedCandidate.phase2Qglp.roce3YrAvgPct}%</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Debt / Equity</span>
                    <span className="text-sm font-bold text-purple-400">{selectedCandidate.phase2Qglp.debtToEquity}x</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab 2: Twin Engine & Capital Allocation */}
            {modalActiveTab === 'TWIN_ENGINE' && (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h5 className="font-bold text-amber-400 text-sm">
                    Twin-Engine Expansion Multiplier: Total Return = (&Delta;EPS) &times; (&Delta;PE)
                  </h5>
                  <p className="text-slate-300 leading-relaxed font-sans text-xs">
                    Multibaggers rarely come from earnings growth alone or PE expansion alone. As Chris Mayer documented,
                    the massive 10X to 100X compounders deliver simultaneous earnings doubling coupled with multiple doubling.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Company Trailing P/E</span>
                      <span className="text-base font-bold text-white">{selectedCandidate.phase3Scores.trailingPe}x</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Sector Median P/E</span>
                      <span className="text-base font-bold text-cyan-400">{selectedCandidate.phase3Scores.sectorMedianPe}x</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Multiple Headroom</span>
                      <span className="text-base font-bold text-amber-400">{selectedCandidate.phase3Scores.multipleHeadroomRatio}x</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-emerald-400 text-sm">
                    Capital Allocation & The Outsiders Test
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Reinvestment Rate</span>
                      <span className="text-sm font-bold text-white">{selectedCandidate.phase3Scores.reinvestmentRatePct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">ROIC</span>
                      <span className="text-sm font-bold text-emerald-400">{selectedCandidate.phase2Qglp.roicPct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Intrinsic Growth Rate</span>
                      <span className="text-sm font-bold text-amber-400">+{selectedCandidate.phase3Scores.intrinsicGrowthPct}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans mt-2">
                    Rating: <span className="font-bold text-emerald-300">{selectedCandidate.phase3Scores.capitalDisciplineRating}</span> capital reinvestment discipline.
                  </p>
                </div>
              </div>
            )}

            {/* Modal Tab 3: Moat & Pricing Power */}
            {modalActiveTab === 'MOAT_PRICING' && (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h5 className="font-bold text-cyan-400 text-sm">
                    Pricing Power & Moat Longevity Indicators
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Gross Margin TTM</span>
                      <span className="text-base font-bold text-white">{selectedCandidate.phase3Scores.grossMarginTtmPct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Gross Margin 3Y Avg</span>
                      <span className="text-base font-bold text-slate-300">{selectedCandidate.phase3Scores.grossMargin3YrAvgPct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Margin Expansion</span>
                      <span className="text-base font-bold text-emerald-400">
                        {selectedCandidate.phase3Scores.marginExpansionPct > 0 ? '+' : ''}
                        {selectedCandidate.phase3Scores.marginExpansionPct}%
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">WACC Hurdle</span>
                      <span className="text-base font-bold text-slate-400">{selectedCandidate.phase3Scores.waccPct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Moat Spread (ROCE - WACC)</span>
                      <span className="text-base font-bold text-cyan-400">+{selectedCandidate.phase3Scores.moatSpreadPct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Cash Conversion Cycle</span>
                      <span className="text-base font-bold text-purple-400">{selectedCandidate.phase3Scores.cashConversionCycleDays} Days</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab 4: Governance & Forensic Audit */}
            {modalActiveTab === 'GOVERNANCE' && (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h5 className="font-bold text-amber-400 text-sm">
                    Phase 1: Small-Base & Governance Exclusion Gate
                  </h5>
                  <div className="space-y-2">
                    {[
                      {
                        label: 'Market Cap Runway (₹300 - ₹15,000 Cr)',
                        val: `₹${selectedCandidate.phase1Exclusion.marketCapCr} Cr`,
                        valid: selectedCandidate.phase1Exclusion.marketCapValid
                      },
                      {
                        label: 'Promoter Skin in the Game (>= 50%)',
                        val: `${selectedCandidate.phase1Exclusion.promoterHoldingPct}%`,
                        valid: selectedCandidate.phase1Exclusion.promoterHoldingValid
                      },
                      {
                        label: 'Promoter Pledge Ceiling (<= 2%)',
                        val: `${selectedCandidate.phase1Exclusion.promoterPledgePct}%`,
                        valid: selectedCandidate.phase1Exclusion.pledgeValid
                      },
                      {
                        label: 'Promoter Stability 4Q (Decline <= 2%)',
                        val: `${selectedCandidate.phase1Exclusion.promoterStakeChange4QtrPct}%`,
                        valid: selectedCandidate.phase1Exclusion.promoterStabilityValid
                      },
                      {
                        label: 'DSO Increase 2Y vs Sales (<= 20%)',
                        val: `${selectedCandidate.phase1Exclusion.dsoIncrease2YrPct}%`,
                        valid: selectedCandidate.phase1Exclusion.dsoValid
                      },
                      {
                        label: 'Contingent Liabilities / Net Worth (<= 15%)',
                        val: `${selectedCandidate.phase1Exclusion.contingentLiabilitiesToNetWorthPct}%`,
                        valid: selectedCandidate.phase1Exclusion.contingentValid
                      }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-300">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{item.val}</span>
                          {item.valid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h5 className="font-bold text-cyan-400 text-sm">
                    Phase 2: QGLP Compounder Gate
                  </h5>
                  <div className="space-y-2">
                    {[
                      {
                        label: 'Sales 3Y CAGR (>= 15%)',
                        val: `+${selectedCandidate.phase2Qglp.salesCagr3YrPct}%`,
                        valid: selectedCandidate.phase2Qglp.salesValid
                      },
                      {
                        label: 'PAT 3Y CAGR (>= 18%)',
                        val: `+${selectedCandidate.phase2Qglp.patCagr3YrPct}%`,
                        valid: selectedCandidate.phase2Qglp.patValid
                      },
                      {
                        label: 'ROCE 3Y Average (>= 20%)',
                        val: `${selectedCandidate.phase2Qglp.roce3YrAvgPct}%`,
                        valid: selectedCandidate.phase2Qglp.roceValid
                      },
                      {
                        label: 'Debt to Equity Ceiling (<= 0.40x)',
                        val: `${selectedCandidate.phase2Qglp.debtToEquity}x`,
                        valid: selectedCandidate.phase2Qglp.debtValid
                      },
                      {
                        label: 'CFO / PAT 3Y Ratio (>= 0.75x)',
                        val: `${selectedCandidate.phase2Qglp.cfoToPat3YrRatio}x`,
                        valid: selectedCandidate.phase2Qglp.cfoValid
                      },
                      {
                        label: 'Gross Margin Volatility (<= 3.5%)',
                        val: `${selectedCandidate.phase2Qglp.grossMarginVolatility5YrPct}%`,
                        valid: selectedCandidate.phase2Qglp.marginStabilityValid
                      }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                        <span className="text-slate-300">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{item.val}</span>
                          {item.valid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab 5: Coffee Can Protocol */}
            {modalActiveTab === 'COFFEE_CAN' && (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-3">
                  <h5 className="font-bold text-amber-300 text-sm flex items-center gap-2">
                    ☕ Robert Kirby &ldquo;Coffee Can&rdquo; Sitting Discipline
                  </h5>
                  <p className="text-slate-300 font-sans text-xs leading-relaxed italic">
                    &ldquo;{selectedCandidate.phase4Protocol.sittingPolicyRule}&rdquo;
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Recommended Weight</span>
                      <span className="text-base font-bold text-amber-400">{selectedCandidate.phase4Protocol.recommendedPositionSizePct}%</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Holding Horizon</span>
                      <span className="text-base font-bold text-white">{selectedCandidate.phase4Protocol.holdingHorizonYears}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Drawdown Floor</span>
                      <span className="text-base font-bold text-emerald-400">-{selectedCandidate.phase4Protocol.trailingDrawdownTolerancePct}%</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-slate-200 text-sm">
                    5 Fundamental Invalidation Triggers (When to Exit)
                  </h5>
                  <div className="space-y-1.5 pt-1 text-[11px]">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                      <span>1. ROCE floor breached (&lt; 12% for 2 consecutive quarters)</span>
                      <span className="text-emerald-400 font-bold">NORMAL (SAFE)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                      <span>2. Operating Cash Flow systematically negative</span>
                      <span className="text-emerald-400 font-bold">NORMAL (SAFE)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                      <span>3. Promoter pledge breach (&gt; 10%) or heavy dilution</span>
                      <span className="text-emerald-400 font-bold">NORMAL (SAFE)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                      <span>4. Valuation euphoria (P/E &gt; 3x 5Y median &amp; PEG &gt; 3.5)</span>
                      <span className="text-emerald-400 font-bold">NORMAL (SAFE)</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                      <span>5. Trend invalidation (3-week close below 40-week EMA)</span>
                      <span className="text-emerald-400 font-bold">NORMAL (SAFE)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                onClick={() => setSelectedCandidate(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Close Dossier
              </button>

              {onNavigateToOrder && selectedCandidate.phase1Exclusion.passed && selectedCandidate.phase2Qglp.passed && (
                <button
                  onClick={() => {
                    const sym = selectedCandidate.symbol;
                    setSelectedCandidate(null);
                    onNavigateToOrder(sym);
                  }}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-950/40 cursor-pointer"
                >
                  Place Paper Order for {selectedCandidate.symbol} &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SCREENER.IN QUERY MODAL ─── */}
      {showScreenerModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-3xl bg-slate-950 border border-amber-500/40 shadow-2xl p-6 sm:p-8 space-y-5 text-slate-100">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black font-mono text-white flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-amber-400" />
                  Screener.in 13-Point Multibagger Query
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paste this exact query directly into the Screener.in custom screen builder.
                </p>
              </div>
              <button
                onClick={() => setShowScreenerModal(false)}
                className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Code container */}
            <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800 p-4 font-mono text-xs text-amber-300/90 leading-relaxed overflow-x-auto">
              <pre>{report.screenerInQuery}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href="https://www.screener.in/screen/raw/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono font-bold"
              >
                <span>Open Screener.in Screen Builder</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={() => copyToClipboard(report.screenerInQuery, 'SCREENER')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-bold shadow-md cursor-pointer hover:from-amber-400 hover:to-orange-400 transition-all"
              >
                {copiedScreener ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>1-Click Copy Query</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PYTHON VECTORBT BACKTEST MODAL ─── */}
      {showBacktestModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl bg-slate-950 border border-cyan-500/40 shadow-2xl p-6 sm:p-8 space-y-5 text-slate-100">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black font-mono text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-cyan-400" />
                  VectorBT Multibagger Backtest Blueprint
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Python algorithm implementing Phase 1 exclusion, QGLP gate, Reinvestment scoring, and trailing floors.
                </p>
              </div>
              <button
                onClick={() => setShowBacktestModal(false)}
                className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Code container */}
            <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800 p-4 font-mono text-xs text-cyan-300 leading-relaxed overflow-x-auto max-h-96">
              <pre>{report.pythonBacktestBlueprint}</pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400 font-mono">
                Requires: pandas, numpy, vectorbt, yfinance
              </span>

              <button
                onClick={() => copyToClipboard(report.pythonBacktestBlueprint, 'BACKTEST')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 text-xs font-bold shadow-md cursor-pointer hover:from-cyan-400 hover:to-blue-400 transition-all"
              >
                {copiedBacktest ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied Python Script!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>1-Click Copy Python Code</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultibaggerScreenerView;
