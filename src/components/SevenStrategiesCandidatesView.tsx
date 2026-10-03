/**
 * src/components/SevenStrategiesCandidatesView.tsx
 *
 * NRI WealthOS - Seven Strategies 90-Day Candidates Hub & Fundamental Integration
 *
 * Displays all qualified candidates from today's 7 institutional strategies:
 * 1. S1a: VPA Three-Leg Reclaim
 * 2. S1b: VPA Trough Reversal
 * 3. S2a: Institutional FVG & Consequent Encroachment (CE)
 * 4. S3a: HH/HL ATR Compression
 * 5. S4a: Gap Running Breakouts
 * 6. S4b: RSI-Supported Gap Breakout
 * 7. S5a: Minervini Winning Stocks
 * + Multi-Strategy Convergence
 *
 * Includes 1-click launch into FERE 360° Forensic Deep Dive Modal for fundamental verification.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  TrendingUp,
  Activity,
  ShieldCheck,
  Target,
  ChevronDown,
  ChevronUp,
  Sliders,
  Table as TableIcon,
  LayoutGrid,
  Download,
  AlertTriangle,
  Info,
  CheckCircle2,
  Zap,
  Flame,
  Award,
  Eye,
  FileText
} from 'lucide-react';
import FereForensicDeepDiveModal from './FereForensicDeepDiveModal.js';
import { downloadCsv } from '../lib/csvExport.js';

export type StrategyTab = 'CONVERGENCE' | 'S1a' | 'S1b' | 'S2a' | 'S3a' | 'S4a' | 'S4b' | 'S5a' | 'ALL';

interface CandidateResult {
  symbol: string;
  strategyId: 'S1a' | 'S1b' | 'S2a' | 'S3a' | 'S4a' | 'S4b' | 'S5a';
  strategyName: string;
  strategyColor: string;
  signalDate: string;
  cmp: number;
  entry: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskReward: number | null;
  candlePattern?: string;
  rsiValue?: number | null;
  keyParameters: Record<string, string | number | boolean | null>;
  ruleChecks: Array<{
    name: string;
    passed: boolean;
    actualValue: string | number;
    benchmarkRule: string;
    explanation?: string;
  }>;
  forwardReturns?: {
    fwd5b?: number | null;
    fwd10b?: number | null;
    fwd20b?: number | null;
  };
  fereStatus: string | null;
  hasFereEvidence: boolean;
  
  // IDs
  candidateId?: string;
  candidateIdStatus?: string;
  lifecycleStatus?: string;
  signalId?: string;
  signalIdStatus?: string;
  signalFingerprintSource?: string;


  // Enriched fields
  sector?: string | null;
  industry?: string | null;
  marketCapCategory?: string | null;
  qglpStatus?: string | null;
  missingCriticalDataCount?: number;
}

interface ConvergenceStock {
  symbol: string;
  strategies: Array<{
    strategyId: string;
    strategyName: string;
    strategyColor: string;
    signalDate: string;
    cmp: number;
  }>;
  convergenceCount: number;
  distinctStrategyCount?: number;
  distinctStrategies?: string[];
  latestDate: string;
  cmp: number;
  fereStatus: string | null;
  candidates: CandidateResult[];
  
  // IDs
  candidateId?: string;
  candidateIdStatus?: string;
  signalIds?: string[];
  lifecycleStatus?: string;

  // Enriched fields
  sector?: string | null;
  industry?: string | null;
  marketCapCategory?: string | null;
  qglpStatus?: string | null;
  missingCriticalDataCount?: number;
}

interface ScanData {
  success: boolean;
  generatedAt: string;
  reportFiles: Record<string, string | null>;
  summary: {
    totalSignalsAcrossAll: number;
    uniqueCandidatesCount: number;
    convergenceCount: number;
    strategyCounts: Record<string, number>;
  };
  convergence: ConvergenceStock[];
  strategies: Record<string, {
    meta: {
      id: string;
      name: string;
      tagline: string;
      color: string;
      badgeBg: string;
      badgeText: string;
    };
    count: number;
    candidates: CandidateResult[];
  }>;
}

interface SevenStrategiesCandidatesViewProps {
  onSelectStock?: (symbol: string, context?: { candidateId?: string, signalIds?: string[], recommendedDate?: string, strategyIds?: string[] }) => void;
  selectedPortfolio?: string;
}

export const SevenStrategiesCandidatesView: React.FC<SevenStrategiesCandidatesViewProps> = ({
  onSelectStock
}) => {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StrategyTab>('CONVERGENCE');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [filterFereOnly, setFilterFereOnly] = useState<boolean>(false);
  const [filterMinRR, setFilterMinRR] = useState<number>(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(25);

  // FERE Forensic Modal State
  const [fereModalSymbol, setFereModalSymbol] = useState<string | null>(null);
  const [isFereModalOpen, setIsFereModalOpen] = useState<boolean>(false);

  const fetchData = async (refresh = false, newLimit = limit) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (refresh) params.set('refresh', 'true');
      if (newLimit !== null) params.set('limit', String(newLimit));
      const url = `/api/strategies/seven-strategies-candidates${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || 'Failed to load seven strategies candidates');
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to strategies service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openFereModal = (symbol: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFereModalSymbol(symbol);
    setIsFereModalOpen(true);
  };

  // Filtered candidates based on activeTab, searchQuery, and filter criteria
  const filteredCandidates = useMemo(() => {
    if (!data) return [];

    let list: CandidateResult[] = [];

    if (activeTab === 'ALL') {
      const all: CandidateResult[] = [];
      Object.values(data.strategies).forEach((s: any) => all.push(...(s.candidates || [])));
      list = all;
    } else if (activeTab === 'CONVERGENCE') {
      return []; // Handled separately in convergence view
    } else {
      list = data.strategies[activeTab]?.candidates || [];
    }

    return list.filter(item => {
      const matchesSearch = !searchQuery || item.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFere = !filterFereOnly || item.fereStatus === 'VERIFIED_PARTIAL';
      const matchesRR = !filterMinRR || (item.riskReward !== null && item.riskReward >= filterMinRR);
      return matchesSearch && matchesFere && matchesRR;
    });
  }, [data, activeTab, searchQuery, filterFereOnly, filterMinRR]);

  // Filtered convergence items
  const filteredConvergence = useMemo(() => {
    if (!data || activeTab !== 'CONVERGENCE') return [];
    return data.convergence.filter(item => {
      const matchesSearch = !searchQuery || item.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFere = !filterFereOnly || item.fereStatus === 'VERIFIED_PARTIAL';
      return matchesSearch && matchesFere;
    });
  }, [data, activeTab, searchQuery, filterFereOnly]);

  const handleExportCsv = () => {
    if (!data) return;
    if (activeTab === 'CONVERGENCE') {
      const headers = ['Symbol', 'Candidate ID', 'Convergence Count', 'Strategies', 'CMP (₹)', 'Latest Signal Date', 'Sector', 'Market Cap', 'QGLP Status', 'FERE Status'];
      const rows = filteredConvergence.map(c => [
        c.symbol,
        c.candidateId ?? '',
        c.convergenceCount,
        c.strategies.map(s => s.strategyId).join(', '),
        c.cmp,
        c.latestDate,
        c.sector ?? '',
        c.marketCapCategory ?? '',
        c.qglpStatus ?? '',
        c.fereStatus ?? '',
      ]);
      downloadCsv(`7_Strategies_Convergence_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    } else {
      const headers = ['Symbol', 'Candidate ID', 'Signal ID', 'Strategy', 'Strategy Name', 'Signal Date', 'CMP (₹)', 'Entry (₹)', 'Stop Loss (₹)', 'Target 1 (₹)', 'Target 2 (₹)', 'R:R', 'Sector', 'Market Cap', 'QGLP Status', 'FERE Status'];
      const rows = filteredCandidates.map(c => [
        c.symbol,
        c.candidateId ?? '',
        c.signalId ?? '',
        c.strategyId,
        c.strategyName,
        c.signalDate,
        c.cmp,
        c.entry ?? '',
        c.stopLoss ?? '',
        c.target1 ?? '',
        c.target2 ?? '',
        c.riskReward ?? '',
        c.sector ?? '',
        c.marketCapCategory ?? '',
        c.qglpStatus ?? '',
        c.fereStatus ?? ''
      ]);
      downloadCsv(`Strategy_${activeTab}_Candidates_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    }
  };

  const getFereBadge = (status: string) => {
    if (status === 'VERIFIED_PARTIAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
          <ShieldCheck className="w-3 h-3 text-emerald-400" /> FERE Verified
        </span>
      );
    }
    if (status === 'DATA_INSUFFICIENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
          <Info className="w-3 h-3 text-amber-400" /> FERE Partial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-800/40 border border-slate-700/50">
        No FERE Card
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Top Header & Telemetry Banner ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Institutional Quant
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                90-Session Recursion
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FERE Integrated
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-400" />
              7 Strategies Candidate Hub
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Deterministic quant candidates from S1a, S1b, S2a, S3a, S4a, S4b, and S5a.
              Examine setup parameters, measured rule thresholds, and immediately proceed to
              audited 3-year fundamental & forensic analysis via the FERE 360° engine.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center rounded-xl bg-slate-800/80 border border-slate-700/60 p-0.5 text-xs font-semibold">
              <button
                onClick={() => { setLimit(25); fetchData(false, 25); }}
                className={`px-2.5 py-1 rounded-lg transition ${limit === 25 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Top 25
              </button>
              <button
                onClick={() => { setLimit(50); fetchData(false, 50); }}
                className={`px-2.5 py-1 rounded-lg transition ${limit === 50 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Top 50
              </button>
              <button
                onClick={() => { setLimit(null); fetchData(false, null); }}
                className={`px-2.5 py-1 rounded-lg transition ${limit === null ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All
              </button>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition cursor-pointer"
              title="Reload report data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!data}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition cursor-pointer shadow-lg shadow-blue-600/20"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mt-5 pt-5 border-t border-slate-800/80">
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">Cross-Convergence</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">{data.summary.convergenceCount}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S1a VPA Reclaim</div>
              <div className="text-lg font-bold text-blue-400 mt-0.5">{data.summary.strategyCounts.S1a}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S1b Trough Rev</div>
              <div className="text-lg font-bold text-purple-400 mt-0.5">{data.summary.strategyCounts.S1b}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S2a FVG & CE</div>
              <div className="text-lg font-bold text-orange-400 mt-0.5">{data.summary.strategyCounts.S2a}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S3a ATR Compress</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">{data.summary.strategyCounts.S3a}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S4a Gap Breakout</div>
              <div className="text-lg font-bold text-cyan-400 mt-0.5">{data.summary.strategyCounts.S4a}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S4b RSI Gap Break</div>
              <div className="text-lg font-bold text-teal-400 mt-0.5">{data.summary.strategyCounts.S4b}</div>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase text-slate-500">S5a Minervini</div>
              <div className="text-lg font-bold text-rose-400 mt-0.5">{data.summary.strategyCounts.S5a}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Strategy Tabs Navigation ────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-2xl border border-slate-800 bg-slate-900/80">
        <button
          onClick={() => setActiveTab('CONVERGENCE')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'CONVERGENCE'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Multi-Convergence
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/30 text-amber-200">
              {data.summary.convergenceCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S1a')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S1a'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          S1a: VPA 3-Leg
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/30 text-blue-200">
              {data.summary.strategyCounts.S1a}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S1b')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S1b'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          S1b: Trough Reversal
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/30 text-purple-200">
              {data.summary.strategyCounts.S1b}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S2a')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S2a'
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Target className="w-3.5 h-3.5 text-orange-400" />
          S2a: FVG & CE
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-orange-500/30 text-orange-200">
              {data.summary.strategyCounts.S2a}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S3a')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S3a'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          S3a: ATR Compress
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/30 text-emerald-200">
              {data.summary.strategyCounts.S3a}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S4a')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S4a'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-cyan-400" />
          S4a: Gap Breakout
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/30 text-cyan-200">
              {data.summary.strategyCounts.S4a}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S4b')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S4b'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-teal-400" />
          S4b: RSI Gap Break
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-teal-500/30 text-teal-200">
              {data.summary.strategyCounts.S4b}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('S5a')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'S5a'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Award className="w-3.5 h-3.5 text-rose-400" />
          S5a: Minervini
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500/30 text-rose-200">
              {data.summary.strategyCounts.S5a}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ALL'
              ? 'bg-slate-700 text-white border border-slate-600 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          All Signals
          {data && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-700 text-slate-300">
              {data.summary.totalSignalsAcrossAll}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter Controls ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol (e.g. DIVYADHAN, TANLA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterFereOnly}
              onChange={(e) => setFilterFereOnly(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 cursor-pointer"
            />
            <span>FERE Verified Only</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {activeTab !== 'CONVERGENCE' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Min R:R:</span>
              <select
                value={filterMinRR}
                onChange={(e) => setFilterMinRR(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value={0}>Any R:R</option>
                <option value={1.5}>≥ 1.5R</option>
                <option value={2.0}>≥ 2.0R</option>
                <option value={3.0}>≥ 3.0R</option>
              </select>
            </div>
          )}

          <div className="flex items-center border border-slate-800 rounded-lg p-0.5 bg-slate-950">
            <button
              onClick={() => setViewMode('CARDS')}
              className={`p-1.5 rounded cursor-pointer transition ${viewMode === 'CARDS' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              title="Card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 rounded cursor-pointer transition ${viewMode === 'TABLE' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              title="Table view"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading / Error State ─────────────────────────────────────────── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-sm">Loading 7-strategy recursive 90-session candidates...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ── MULTI-STRATEGY CONVERGENCE VIEW ───────────────────────────────── */}
      {!loading && activeTab === 'CONVERGENCE' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Cross-Strategy Convergence Engine</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stocks that triggered qualification criteria across multiple independent quant strategies within the 90-session window.
                  Highest institutional conviction setups.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20">
              {filteredConvergence.length} Candidates
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConvergence.map((item) => {
              const isMultiDistinct = (item.distinctStrategyCount || 1) > 1;
              return (
                <div
                  key={item.symbol}
                  className={`p-4 rounded-xl border transition-all hover:border-slate-700/80 bg-slate-900/90 flex flex-col justify-between ${
                    isMultiDistinct ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onSelectStock && onSelectStock(item.symbol, { candidateId: item.candidateId, signalIds: item.signalIds || (item.signalId ? [item.signalId] : []), recommendedDate: item.signalDate || item.recommendedDate, strategyIds: item.distinctStrategies || item.strategies?.map(s => s.strategyId) || [] })}
                            className="text-base font-bold text-white tracking-wide hover:text-indigo-400 hover:underline cursor-pointer"
                            title="Analyze candidate in 360° view"
                          >
                            {item.symbol}
                          </span>
                          {isMultiDistinct && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                              {item.distinctStrategyCount} Strategies
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          Signal CMP: <span className="font-bold text-white">₹{item.cmp.toFixed(2)}</span>
                        </div>
                        {item.candidateId && (
                          <div className="text-[9px] font-mono text-slate-500 mt-0.5" title="Stable Deterministic Candidate ID">
                            ID: <span className="text-slate-400 cursor-copy" onClick={() => navigator.clipboard.writeText(item.candidateId!)}>{item.candidateId}</span>
                          </div>
                        )}
                      </div>
                      {getFereBadge(item.fereStatus)}
                    </div>

                    {/* Matched Strategies Pills */}
                    <div className="mt-3">
                      <div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5">Matched Setups:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.strategies.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold border flex items-center gap-1"
                            style={{
                              backgroundColor: `${s.strategyColor}15`,
                              borderColor: `${s.strategyColor}40`,
                              color: s.strategyColor
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.strategyColor }} />
                            {s.strategyId} ({s.signalDate.slice(5)})
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Specific Rules Met preview */}
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] space-y-1">
                      {item.candidates.slice(0, 2).map((cand, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-300">
                          <span className="font-semibold" style={{ color: cand.strategyColor }}>{cand.strategyId}:</span>
                          <span className="font-mono text-slate-400 truncate max-w-[180px]">
                            {cand.entry ? `Entry ₹${cand.entry.toFixed(1)} | Stop ₹${cand.stopLoss?.toFixed(1) ?? 'N/A'}` : 'Stage 2 Trend Confirmed'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Enrichment Badges */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.marketCapCategory && item.marketCapCategory !== 'UNAVAILABLE' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {item.marketCapCategory.replace('_', ' ')}
                        </span>
                      )}
                      {item.sector && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[120px]" title={item.sector}>
                          {item.sector}
                        </span>
                      )}
                      {(item as any).stockMomentumStatus && (item as any).stockMomentumStatus !== 'DATA_INSUFFICIENT' && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${(item as any).stockMomentumStatus === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`} title="Stock Momentum">
                          STK: {(item as any).stockMomentumStatus}
                        </span>
                      )}
                      {(item as any).sectorMomentumStatus && (item as any).sectorMomentumStatus !== 'DATA_INSUFFICIENT' && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${(item as any).sectorMomentumStatus.includes('BULLISH') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`} title="Sector Momentum">
                          SEC: {(item as any).sectorMomentumStatus}
                        </span>
                      )}
                      {(item as any).qglpStatus && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${(item as any).qglpStatus === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : (item as any).qglpStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          QGLP: {(item as any).qglpStatus} {item.missingCriticalDataCount ? `(-${item.missingCriticalDataCount})` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar: FERE 360° & Dossier */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => openFereModal(item.symbol, e)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer"
                      title="Open verified 3-year fundamental trends, red flags, and MCA filings"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      FERE 360° Deep Dive
                    </button>
                    {onSelectStock && (
                      <div className="flex items-center gap-1">
                        <button
                          disabled={!(item as any).canBacktest}
                          className={`p-1.5 rounded-lg border transition ${
                            (item as any).canBacktest 
                              ? 'text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 cursor-pointer'
                              : 'text-slate-600 bg-slate-800/30 border-slate-700/30 cursor-not-allowed'
                          }`}
                          title={(item as any).canBacktest ? "Run Backtest" : "Backtest Blocker: Missing Technical OHLCV History"}
                        >
                          <Activity className="w-4 h-4" />
                        </button>
                        <button
                          disabled={!(item as any).canPaperTrade}
                          className={`p-1.5 rounded-lg border transition ${
                            (item as any).canPaperTrade
                              ? 'text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 cursor-pointer'
                              : 'text-slate-600 bg-slate-800/30 border-slate-700/30 cursor-not-allowed'
                          }`}
                          title={(item as any).canPaperTrade ? "Add to Paper Trade" : "Paper Trade Blocker: Missing Latest CMP"}
                        >
                          <Target className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onSelectStock(item.symbol, { candidateId: item.candidateId, signalIds: item.signalIds || (item.signalId ? [item.signalId] : []), recommendedDate: item.signalDate || item.recommendedDate, strategyIds: item.distinctStrategies || item.strategies?.map(s => s.strategyId) || (item.strategyId ? [item.strategyId] : []) })}
                          disabled={!(item as any).canAnalyze}
                          className={`p-1.5 rounded-lg border transition ${
                            (item as any).canAnalyze
                              ? 'text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border-slate-700/50 cursor-pointer'
                              : 'text-slate-600 bg-slate-800/30 border-slate-700/30 cursor-not-allowed'
                          }`}
                          title={(item as any).canAnalyze ? "Open Quant Dossier" : "Analyze Blocker: Unknown Symbol Identity"}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SINGLE STRATEGY / ALL CANDIDATES VIEW ─────────────────────────── */}
      {!loading && activeTab !== 'CONVERGENCE' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Showing <span className="font-bold text-white">{filteredCandidates.length}</span> qualified candidates for{' '}
              <span className="font-bold text-blue-400">{activeTab === 'ALL' ? 'All Strategies' : activeTab}</span>
            </div>
          </div>

          {filteredCandidates.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-500">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No candidates matching the current criteria in this strategy.</p>
              {activeTab === 'S4a' && (
                <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
                  S4a (Gap Running Breakout) enforces strict weekly pivot date + ATR pullback compaction.
                  Check S4b (RSI-Supported Gap Breakout) for 36 qualified gap-breakout candidates!
                </p>
              )}
            </div>
          ) : viewMode === 'CARDS' ? (
            /* Cards Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCandidates.map((c, idx) => (
                <div
                  key={`${c.strategyId}_${c.symbol}_${idx}`}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 hover:border-slate-700 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onSelectStock && onSelectStock(c.symbol, { candidateId: c.candidateId, signalIds: c.signalIds || (c.signalId ? [c.signalId] : []), recommendedDate: c.signalDate || c.recommendedDate, strategyIds: [c.strategyId] })}
                            className="text-base font-bold text-white tracking-wide hover:text-indigo-400 hover:underline cursor-pointer"
                            title="Analyze candidate in 360° view"
                          >
                            {c.symbol}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                            style={{
                              backgroundColor: `${c.strategyColor}15`,
                              borderColor: `${c.strategyColor}40`,
                              color: c.strategyColor
                            }}
                          >
                            {c.strategyId}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          Signal Date: <span className="text-slate-300">{c.signalDate}</span> | CMP: <span className="font-bold text-white">₹{c.cmp.toFixed(2)}</span>
                        </div>
                        {c.signalId && (
                          <div className="text-[9px] font-mono text-slate-500 mt-0.5" title="Stable Deterministic Signal ID">
                            ID: <span className="text-slate-400 cursor-copy" onClick={() => navigator.clipboard.writeText(c.signalId!)}>{c.signalId}</span>
                          </div>
                        )}
                      </div>
                      {getFereBadge(c.fereStatus)}
                    </div>

                    {/* Trade Levels: Entry, Stop, Targets */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[10px] font-mono mt-3">
                      <div>
                        <span className="text-slate-500 block">Entry</span>
                        <span className="font-semibold text-emerald-400">{c.entry ? `₹${c.entry.toFixed(1)}` : 'At CMP'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Stop</span>
                        <span className="font-semibold text-rose-400">{c.stopLoss ? `₹${c.stopLoss.toFixed(1)}` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">R:R / Target</span>
                        <span className="font-semibold text-amber-400">
                          {c.riskReward ? `${c.riskReward.toFixed(1)}R` : (c.target1 ? `₹${c.target1.toFixed(1)}` : 'N/A')}
                        </span>
                      </div>
                    </div>

                    {/* Strategy Parameters Pills */}
                    <div className="mt-3">
                      <div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5">Measured Parameters Met:</div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(c.keyParameters)
                          .filter(([_, val]) => val !== null && val !== undefined)
                          .slice(0, 6)
                          .map(([paramKey, val]) => (
                            <span
                              key={paramKey}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 border border-slate-700/60 text-slate-300"
                            >
                              <span className="text-slate-500">{paramKey}:</span> <span className="font-bold text-white">{String(val)}</span>
                            </span>
                          ))}
                      </div>
                    </div>

                    {/* Rule Checks Accordion */}
                    {c.ruleChecks.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => setExpandedRow(expandedRow === `${c.strategyId}_${c.symbol}_${idx}` ? null : `${c.strategyId}_${c.symbol}_${idx}`)}
                          className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 py-1 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Rule checks ({c.ruleChecks.length})
                          </span>
                          {expandedRow === `${c.strategyId}_${c.symbol}_${idx}` ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {expandedRow === `${c.strategyId}_${c.symbol}_${idx}` && (
                          <div className="mt-1.5 p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-[10px] font-mono">
                            {c.ruleChecks.map((rc, rIdx) => (
                              <div key={rIdx} className="text-slate-300 border-b border-slate-800/40 pb-1 last:border-0 last:pb-0">
                                <div className="font-semibold text-white">{rc.name}:</div>
                                <div className="text-slate-400">{rc.actualValue} ({rc.benchmarkRule})</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => openFereModal(c.symbol, e)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      FERE 360° Deep Dive
                    </button>
                    {onSelectStock && (
                      <button
                        onClick={() => onSelectStock(c.symbol, { candidateId: c.candidateId, signalIds: c.signalIds || (c.signalId ? [c.signalId] : []), recommendedDate: c.latestDate || c.recommendedDate, strategyIds: c.strategies?.map(s => s.strategyId) || [] })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition cursor-pointer"
                        title="Open Quant Dossier"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* High Density Table View */
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-mono uppercase text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">Symbol</th>
                    <th className="py-2.5 px-3 font-semibold">Strategy</th>
                    <th className="py-2.5 px-3 font-semibold">Signal Date</th>
                    <th className="py-2.5 px-3 font-semibold">CMP (₹)</th>
                    <th className="py-2.5 px-3 font-semibold">Entry (₹)</th>
                    <th className="py-2.5 px-3 font-semibold">Stop Loss (₹)</th>
                    <th className="py-2.5 px-3 font-semibold">R:R</th>
                    <th className="py-2.5 px-3 font-semibold">Key Parameters</th>
                    <th className="py-2.5 px-3 font-semibold">FERE Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredCandidates.map((c, idx) => (
                    <tr key={`${c.strategyId}_${c.symbol}_${idx}`} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3">
                        <div
                          onClick={() => onSelectStock && onSelectStock(c.symbol, { candidateId: c.candidateId, signalIds: c.signalIds || (c.signalId ? [c.signalId] : []), recommendedDate: c.signalDate || c.recommendedDate, strategyIds: [c.strategyId] })}
                          className="font-bold text-white hover:text-indigo-400 hover:underline cursor-pointer"
                          title="Analyze candidate in 360° view"
                        >
                          {c.symbol}
                        </div>
                        {c.signalId && (
                          <div className="text-[8px] text-slate-500 truncate max-w-[100px]" title="Copy Signal ID" onClick={() => navigator.clipboard.writeText(c.signalId!)}>
                            {c.signalId.split('-').pop()}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold border"
                          style={{
                            backgroundColor: `${c.strategyColor}15`,
                            borderColor: `${c.strategyColor}40`,
                            color: c.strategyColor
                          }}
                        >
                          {c.strategyId}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{c.signalDate}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">₹{c.cmp.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-emerald-400">{c.entry ? `₹${c.entry.toFixed(2)}` : '—'}</td>
                      <td className="py-2.5 px-3 text-rose-400">{c.stopLoss ? `₹${c.stopLoss.toFixed(2)}` : '—'}</td>
                      <td className="py-2.5 px-3 text-amber-400">{c.riskReward ? `${c.riskReward.toFixed(1)}R` : '—'}</td>
                      <td className="py-2.5 px-3 text-[10px] text-slate-400 max-w-xs truncate">
                        {Object.entries(c.keyParameters)
                          .filter(([_, v]) => v !== null)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' | ')}
                      </td>
                      <td className="py-2.5 px-3">{getFereBadge(c.fereStatus)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => openFereModal(c.symbol, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer"
                        >
                          <ShieldCheck className="w-3 h-3 text-amber-400" /> FERE 360°
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FERE 360° Forensic Deep Dive Modal ────────────────────────────── */}
      <FereForensicDeepDiveModal
        symbol={fereModalSymbol}
        isOpen={isFereModalOpen}
        onClose={() => setIsFereModalOpen(false)}
        onSelectSymbol={(sym) => {
          if (onSelectStock) onSelectStock(sym, { candidateId: undefined, signalIds: undefined });
        }}
      />
    </div>
  );
};

export default SevenStrategiesCandidatesView;
