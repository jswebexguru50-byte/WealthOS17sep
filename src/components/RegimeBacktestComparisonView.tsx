import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Download,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  Layers,
  Award,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Percent,
  Compass,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Table,
  Play,
  Zap,
  ListChecks
} from 'lucide-react';

export interface RegimeSummary {
  regime: string;
  strategyId: string;
  strategyName: string;
  periodStart: string;
  periodEnd: string;
  scripCount: number;
  totalSignals: number;
  winRatePct: number;
  profitFactor: number;
  avgGainPct: number;
  avgLossPct: number;
  totalReturnPct: number;
  periodCagrPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  brierScore: number;
  avgHoldingDays: number;
  bestScrip: string;
  bestScripReturnPct: number;
  worstScrip: string;
  worstScripReturnPct: number;
  reEntriesTotal: number;
}

export interface RegimeTrade {
  id: string;
  symbol: string;
  companyName: string;
  tier: string;
  isFno: boolean;
  regime: string;
  strategyId: string;
  strategyName: string;
  signalDate: string;
  initialEntryDate: string;
  initialEntryPrice: number;
  stopLoss: number;
  targetPrice: number;
  reEntriesCount: number;
  periodCloseDate: string;
  periodClosePrice: number;
  finalExitDate: string;
  finalExitPrice: number;
  tradeStatus: 'HIT_TARGET' | 'STOP_LOSS_HIT' | 'CLOSED_AT_PERIOD_END';
  grossReturnPct: number;
  netReturnPct: number;
  holdingDays: number;
  mfePct: number;
  maePct: number;
  rulesPassedSummary: string;
}

export interface StrategyColumnData {
  status: string;
  signal_date?: string;
  entry_price?: number;
  stop_loss?: number;
  target_price?: number;
  exit_price?: number;
  exit_date?: string;
  trade_outcome?: string;
  net_return_pct: number;
  reentries_count: number;
  holding_days?: number;
}

export interface FullMatrixRow {
  symbol: string;
  company_name: string;
  tier: string;
  regime_id: string;
  regime_type: string;
  regime_start: string;
  regime_end: string;
  candle_count: number;
  data_quality_score: number;
  strategies: Record<string, StrategyColumnData>;
  best_performing_strategy: string;
  max_strategy_return_pct: number;
  combined_signal_agreement: string;
  agreement_count: number;
}

export interface StrategyInfo {
  id: string;
  name: string;
  baseTemplate?: string;
  isBuiltin: boolean;
}

export const RegimeBacktestComparisonView: React.FC = () => {
  const [summaries, setSummaries] = useState<RegimeSummary[]>([]);
  const [trades, setTrades] = useState<RegimeTrade[]>([]);
  const [matrixRows, setMatrixRows] = useState<FullMatrixRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [matrixLoading, setMatrixLoading] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [selectedRegime, setSelectedRegime] = useState<string>('ALL');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ALL');
  const [agreementFilter, setAgreementFilter] = useState<string>('ALL');
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'matrix' | 'ledger' | 'trades' | 'comparison' | 'custom'>('ledger');

  const [customStrategies, setCustomStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'NEOWAVE']));
  const [universeCount, setUniverseCount] = useState<number>(750);
  const [regimeCount, setRegimeCount] = useState<number>(3);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/regime-backtest/summary');
      const json = await res.json();
      if (json.success && json.data) {
        setSummaries(json.data);
      }
    } catch (e) {
      console.error('Failed to load regime backtest summaries:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatrixLedger = async () => {
    try {
      setMatrixLoading(true);
      const params = new URLSearchParams();
      if (selectedRegime !== 'ALL') params.set('regimeId', selectedRegime);
      if (searchSymbol.trim()) params.set('symbol', searchSymbol.trim());
      if (agreementFilter !== 'ALL') params.set('minAgreement', agreementFilter);

      const res = await fetch(`/api/v1/regime-backtest/ledger?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMatrixRows(json.data);
      }
    } catch (e) {
      console.error('Failed to load full matrix ledger:', e);
    } finally {
      setMatrixLoading(false);
    }
  };

  const fetchTrades = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedRegime !== 'ALL') params.set('regime', selectedRegime);
      if (selectedStrategy !== 'ALL') params.set('strategyId', selectedStrategy);
      if (searchSymbol.trim()) params.set('symbol', searchSymbol.trim());

      const res = await fetch(`/api/v1/regime-backtest/trades?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setTrades(json.data);
      }
    } catch (e) {
      console.error('Failed to load trades:', e);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch universe count
        const universeRes = await fetch('/api/v1/regime-backtest/universe-count');
        const universeJson = await universeRes.json();
        if (universeJson.success) {
          setUniverseCount(universeJson.count || 750);
        }
      } catch (e) {
        console.error('Failed to fetch universe count:', e);
      }

      await fetchSummary();
      await fetchMatrixLedger();

      // Fetch custom strategies
      try {
        const customRes = await fetch('/api/strategies/custom');
        const customJson = await customRes.json();
        if (customJson.success) {
          const filtered = customJson.data.filter((s: any) => s.backtest_win_rate != null);
          const strategies = filtered.map((s: any) => ({
            id: s.id,
            name: s.name,
            baseTemplate: s.base_template_id,
            isBuiltin: false
          }));
          setCustomStrategies(strategies);
        }
      } catch (e) {
        console.error('Failed to fetch custom strategies:', e);
      }
    };

    initializeData();
  }, []);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchMatrixLedger();
    } else if (activeTab === 'trades') {
      fetchTrades();
    }
    setPage(1);
  }, [activeTab, selectedRegime, selectedStrategy, agreementFilter, searchSymbol]);

  const handleRunBacktest = async () => {
    try {
      setRunning(true);
      const res = await fetch('/api/v1/regime-backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyIds: Array.from(selectedStrategies) })
      });
      const json = await res.json();
      if (json.success) {
        await fetchSummary();
        await fetchMatrixLedger();
        await fetchTrades();
      }
    } catch (e) {
      console.error('Run backtest error:', e);
    } finally {
      setRunning(false);
    }
  };

  const formatRegimeLabel = (regime: string) => {
    switch (regime) {
      case 'BULLISH_2023_2024':
        return { label: 'Bullish (2023–2024)', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'BEARISH_2024_2025':
        return { label: 'Bearish (2024–2025)', badge: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'SIDEWAYS_2025':
        return { label: 'Sideways (2025)', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      default:
        return { label: regime, badge: 'bg-slate-700 text-slate-300 border-slate-600' };
    }
  };

  const filteredSummaries = summaries.filter(s => {
    if (selectedRegime !== 'ALL' && s.regime !== selectedRegime) return false;
    if (selectedStrategy !== 'ALL' && s.strategyId !== selectedStrategy) return false;
    return true;
  });

  const getStrategyName = (strategyId: string): string => {
    const names: Record<string, string> = {
      'S1': 'Strategy 1: VPA Base Breakout',
      'S2': 'Strategy 2: Institutional FVG/CE',
      'S3': 'Strategy 3: HH/HL Compaction',
      'S4': 'Strategy 4: HH/HL + SMA200 + VPA',
      'S5': 'Strategy 5: 50 EMA Pullback VCP',
      'S6': 'Strategy 6: Relative Strength Breakout',
      'S7': 'Strategy 7: RSI Mean-Reversion Dip',
      'S8': 'Strategy 8: High-Tight Flag',
      'S9': 'Strategy 9: Volume Dry-Up + RS',
      'S10': 'Strategy 10: Trendline ORB'
    };
    return names[strategyId] || strategyId;
  };

  // Get all unique strategies from summaries
  const allAvailableStrategies = useMemo(() => {
    const strategies = new Map<string, StrategyInfo>();
    const builtins = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];

    builtins.forEach(id => {
      const name = getStrategyName(id);
      strategies.set(id, { id, name, isBuiltin: true });
    });

    customStrategies.forEach(s => {
      strategies.set(s.id, s);
    });

    return Array.from(strategies.values());
  }, [customStrategies]);

  const toggleStrategy = (id: string) => {
    const newSet = new Set(selectedStrategies);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStrategies(newSet);
  };

  const selectAll = () => {
    setSelectedStrategies(new Set(allAvailableStrategies.map(s => s.id)));
  };

  const selectBuiltins = () => {
    setSelectedStrategies(new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']));
  };

  const selectCustom = () => {
    setSelectedStrategies(new Set(customStrategies.map(s => s.id)));
  };

  const clearAll = () => {
    setSelectedStrategies(new Set());
  };

  // Client-side pagination for Matrix Ledger
  const totalPages = Math.ceil(matrixRows.length / pageSize) || 1;
  const paginatedMatrixRows = matrixRows.slice((page - 1) * pageSize, page * pageSize);

  const totalScenarios = universeCount * regimeCount * selectedStrategies.size;

  const renderStatusCell = (status: string, returnPct: number, entry?: number, exit?: number, outcome?: string) => {
    if (status === 'TRIGGERED') {
      const isPositive = returnPct > 0;
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> TRIGGERED
            </span>
            <span className={`text-[11px] font-black ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? `+${returnPct.toFixed(1)}%` : `${returnPct.toFixed(1)}%`}
            </span>
          </div>
          {entry && (
            <div className="text-[10px] text-slate-400">
              ₹{entry.toFixed(1)} → ₹{exit ? exit.toFixed(1) : '-'} <span className="text-slate-500">({outcome})</span>
            </div>
          )}
        </div>
      );
    }
    if (status === 'NO_SETUP') {
      return (
        <div className="flex items-center gap-1 text-slate-500 text-[11px]">
          <XCircle className="w-3 h-3 text-slate-600" />
          <span>No Setup Found</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-slate-600 text-[11px]">
        <HelpCircle className="w-3 h-3 text-slate-700" />
        <span>&lt;10 Candles</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* ── HEADER HERO ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Full Universe Matrix
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {universeCount * regimeCount} Ledger Rows ({universeCount} × {regimeCount} Regimes)
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Dynamic Multi-Strategy Regime Backtest & Empirical Confluence
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl mt-1">
              Zero survivorship bias backtest ledger with dynamic strategy selection. Exactly {regimeCount} rows per scrip with selected strategies mapped into columns side-by-side. Unmet setups and partial data are explicitly accounted for.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunBacktest}
              disabled={running || selectedStrategies.size === 0}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              {running ? `Simulating ${totalScenarios.toLocaleString()} Scenarios...` : 'Re-Run Backtest'}
            </button>
            <a
              href="/api/v1/regime-backtest/export-csv"
              download={`FullUniverseBacktestMatrix_${universeCount}x${regimeCount}.csv`}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Full Matrix CSV
            </a>
          </div>
        </div>

        {/* 3 Regime Highlights Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Period 1: Bullish Regime (16M)</div>
              <div className="text-sm font-bold text-white">{universeCount} Equities Evaluated • <span className="text-emerald-400">+363.6% Max VPA</span></div>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Period 2: Bearish Regime (6M)</div>
              <div className="text-sm font-bold text-white">{universeCount} Equities Evaluated • <span className="text-amber-400">FVG Defense</span></div>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Period 3: Sideways Regime (6M)</div>
              <div className="text-sm font-bold text-white">{universeCount} Equities Evaluated • <span className="text-indigo-400">Alpha Rotation</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MULTI-STRATEGY SELECTION PANEL ────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Select Strategies to Backtest</h3>
          <span className="ml-auto text-xs text-slate-400 font-medium">
            {selectedStrategies.size}/{allAvailableStrategies.length} selected
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {allAvailableStrategies.map(strategy => (
            <label key={strategy.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={selectedStrategies.has(strategy.id)}
                onChange={() => toggleStrategy(strategy.id)}
                className="w-4 h-4 rounded border-slate-600 accent-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-300">{strategy.id}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            Select All
          </button>
          <button
            onClick={selectBuiltins}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            Built-ins Only
          </button>
          {customStrategies.length > 0 && (
            <button
              onClick={selectCustom}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              Custom Only
            </button>
          )}
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-xs font-semibold bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={handleRunBacktest}
            disabled={running || selectedStrategies.size === 0}
            className="ml-auto px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-all flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5" />
            Run Backtest ({selectedStrategies.size} × {regimeCount})
          </button>
        </div>
      </div>

      {/* ── NAVIGATION TABS & FILTERS ────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ledger' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Table className="w-3.5 h-3.5" /> Full Universe Matrix ({matrixRows.length})
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'matrix' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📊 Strategy Summary Cards
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'comparison' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            📈 Strategy Comparison
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'trades' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🔍 Triggered Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            ⚙️ Methodology
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Regime:</span>
            <select
              value={selectedRegime}
              onChange={(e) => setSelectedRegime(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All 3 Regimes</option>
              <option value="BULLISH_2023_2024">Bullish (2023–2024)</option>
              <option value="BEARISH_2024_2025">Bearish (2024–2025)</option>
              <option value="SIDEWAYS_2025">Sideways (2025)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium">Strategy:</span>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Strategies ({allAvailableStrategies.length})</option>
              {allAvailableStrategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {activeTab === 'ledger' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Confluence:</span>
              <select
                value={agreementFilter}
                onChange={(e) => setAgreementFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Confluences</option>
                <option value="10">10/10 Full Confluence Only</option>
                <option value="7">≥7/10 High Confluence</option>
                <option value="5">≥5/10 Half Confluence</option>
                <option value="4">≥4/10 Confluence</option>
                <option value="3">≥3/10 Triple Confluence</option>
                <option value="2">≥2/10 Double Confluence</option>
                <option value="1">≥1/10 Triggered</option>
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search scrip (e.g. RELIANCE)..."
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-indigo-500 w-48"
            >
            </input>
          </div>
        </div>
      </div>

      {/* ── TAB: FULL UNIVERSE MATRIX ──────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Table className="w-4 h-4 text-indigo-400" />
                Full-Universe Regime Matrix — {regimeCount} Rows Per Scrip ({universeCount} Equities × {regimeCount} Regimes = {universeCount * regimeCount} Lines)
              </h2>
              <span className="text-xs text-slate-400">
                Displaying {matrixRows.length} total rows. Page {page} of {totalPages}.
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg px-2 py-1"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={999999}>All ({universeCount * regimeCount})</option>
              </select>

              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs rounded border border-slate-700"
                >
                  Prev
                </button>
                <span className="px-2 text-xs font-bold text-indigo-400">{page}/{totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs rounded border border-slate-700"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3">Scrip / Equity</th>
                  <th className="p-3">Regime</th>
                  {allAvailableStrategies.map(strat => (
                    <th key={strat.id} className="p-3">{strat.name}</th>
                  ))}
                  <th className="p-3 text-center">Confluence</th>
                  <th className="p-3 text-right">Best Strat</th>
                  <th className="p-3 text-right">Max Return %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {matrixLoading ? (
                  <tr>
                    <td colSpan={allAvailableStrategies.length + 5} className="p-8 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                      Loading Full Universe Matrix Rows ({universeCount * regimeCount} rows)...
                    </td>
                  </tr>
                ) : paginatedMatrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={allAvailableStrategies.length + 5} className="p-8 text-center text-slate-400">
                      No matching records found for "{searchSymbol}". Try adjusting search or filters.
                    </td>
                  </tr>
                ) : (
                  paginatedMatrixRows.map((row, idx) => {
                    const reg = formatRegimeLabel(row.regime_id);
                    const agreementPill =
                      row.agreement_count === allAvailableStrategies.length
                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 font-black'
                        : row.agreement_count >= Math.ceil(allAvailableStrategies.length * 0.75)
                        ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 font-bold'
                        : row.agreement_count >= Math.ceil(allAvailableStrategies.length * 0.5)
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : row.agreement_count >= 1
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-slate-950 text-slate-600 border-slate-800';

                    return (
                      <tr key={`${row.symbol}_${row.regime_id}_${idx}`} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-white text-xs">{row.symbol}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{row.company_name}</div>
                          <span className="text-[9px] text-slate-500 uppercase">{row.tier}</span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${reg.badge}`}>
                            {reg.label.split(' ')[0]}
                          </span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">{row.candle_count} bars</span>
                        </td>
                        {allAvailableStrategies.map(strat => {
                          const stratData = row.strategies?.[strat.id];
                          return (
                            <td key={strat.id} className="p-3">
                              {stratData ? renderStatusCell(stratData.status, stratData.net_return_pct, stratData.entry_price, stratData.exit_price, stratData.trade_outcome) : (
                                <div className="text-slate-600 text-[11px]">N/A</div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${agreementPill}`}>
                            {row.combined_signal_agreement}
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-indigo-300">
                          {row.best_performing_strategy}
                        </td>
                        <td className="p-3 text-right font-black">
                          <span className={row.max_strategy_return_pct > 0 ? 'text-emerald-400' : row.max_strategy_return_pct < 0 ? 'text-red-400' : 'text-slate-500'}>
                            {row.max_strategy_return_pct > 0 ? `+${row.max_strategy_return_pct.toFixed(1)}%` : `${row.max_strategy_return_pct.toFixed(1)}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer pagination */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40">
            <div>
              Showing {Math.min(matrixRows.length, (page - 1) * pageSize + 1)}–{Math.min(matrixRows.length, page * pageSize)} of {matrixRows.length} matrix rows
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg border border-slate-700"
              >
                Previous Page
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg border border-slate-700"
              >
                Next Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: STRATEGY SUMMARY CARDS ───────────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-amber-400" />
              Per-Strategy Performance Summary Cards
            </h2>
            <p className="text-xs text-slate-400">
              {filteredSummaries.length} strategy-regime combinations. Select a regime above to filter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSummaries.map((s, idx) => {
              const reg = formatRegimeLabel(s.regime);
              const isPositive = s.totalReturnPct > 0;
              const sharpeGood = s.sharpeRatio >= 1.0;

              return (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl hover:border-indigo-500/30 transition-all"
                >
                  <div className={`p-4 border-b border-slate-800 ${reg.badge}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${reg.badge}`}>
                          {reg.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{s.strategyName}</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-medium">Total Signals</div>
                        <div className="text-lg font-black text-indigo-400 mt-1">{s.totalSignals}</div>
                      </div>
                      <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-medium">Win Rate</div>
                        <div className={`text-lg font-black mt-1 ${s.winRatePct >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {s.winRatePct}%
                        </div>
                      </div>
                      <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-medium">Profit Factor</div>
                        <div className="text-lg font-black text-slate-300 mt-1">{s.profitFactor.toFixed(2)}</div>
                      </div>
                      <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-medium">Sharpe Ratio</div>
                        <div className={`text-lg font-black mt-1 ${sharpeGood ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {s.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-medium mb-1">Net Return</div>
                      <div className={`text-2xl font-black ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? `+${s.totalReturnPct.toFixed(1)}%` : `${s.totalReturnPct.toFixed(1)}%`}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[10px]">
                      <div>
                        <span className="text-slate-400">CAGR:</span>
                        <div className="font-bold text-white">{s.periodCagrPct > 0 ? `+${s.periodCagrPct}%` : `${s.periodCagrPct}%`}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Max Drawdown:</span>
                        <div className="font-bold text-red-400">{s.maxDrawdownPct}%</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Avg Hold:</span>
                        <div className="font-bold text-white">{s.avgHoldingDays}d</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Re-entries:</span>
                        <div className="font-bold text-indigo-400">{s.reEntriesTotal}</div>
                      </div>
                    </div>

                    <div className="bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/30 text-[10px]">
                      <span className="text-slate-400">Best Stock: </span>
                      <span className="font-bold text-emerald-400">{s.bestScrip}</span>
                      <span className="text-slate-500 ml-1">(+{s.bestScripReturnPct.toFixed(1)}%)</span>
                    </div>

                    <a
                      href={`/api/v1/regime-backtest/export-csv?strategyId=${s.strategyId}&regime=${s.regime}`}
                      download={`Strategy_${s.strategyId}_${s.regime}_Results.csv`}
                      className="w-full px-3 py-2 text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Results
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSummaries.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <p>No strategy-regime combinations available. Run a backtest first.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: STRATEGY COMPARISON ──────────────────────────────────────────── */}
      {activeTab === 'comparison' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Cross-Strategy Performance Comparison
            </h2>
            <span className="text-xs text-slate-400">
              All metrics for all {filteredSummaries.length} strategies
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3.5">Strategy</th>
                  <th className="p-3.5">Regime</th>
                  <th className="p-3.5 text-center">Signals</th>
                  <th className="p-3.5 text-center">Win %</th>
                  <th className="p-3.5 text-center">Profit Factor</th>
                  <th className="p-3.5 text-right">Net Return %</th>
                  <th className="p-3.5 text-right">CAGR %</th>
                  <th className="p-3.5 text-center">Sharpe</th>
                  <th className="p-3.5 text-center">Max DD %</th>
                  <th className="p-3.5 text-center">Avg Hold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredSummaries.map((s, idx) => {
                  const reg = formatRegimeLabel(s.regime);
                  const isPositive = s.totalReturnPct > 0;
                  const bestSharpe = Math.max(...filteredSummaries.map(x => x.sharpeRatio));
                  const isBestSharpe = s.sharpeRatio === bestSharpe;

                  return (
                    <tr key={idx} className={`hover:bg-slate-800/40 transition-colors ${isBestSharpe ? 'bg-indigo-950/30 border-l-2 border-l-indigo-500' : ''}`}>
                      <td className="p-3.5 font-semibold text-white">
                        {s.strategyName}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${reg.badge}`}>
                          {reg.label.split(' ')[0]}
                        </span>
                      </td>
                      <td className="p-3.5 text-center text-slate-300 font-bold">
                        {s.totalSignals}
                      </td>
                      <td className="p-3.5 text-center font-bold">
                        <span className={s.winRatePct >= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                          {s.winRatePct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-200">
                        {s.profitFactor.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-right font-black">
                        <span className={`px-2 py-0.5 rounded ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isPositive ? `+${s.totalReturnPct.toFixed(1)}%` : `${s.totalReturnPct.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-300">
                        {s.periodCagrPct > 0 ? `+${s.periodCagrPct}%` : `${s.periodCagrPct}%`}
                      </td>
                      <td className="p-3.5 text-center font-bold">
                        <span className={`${isBestSharpe ? 'text-emerald-400 font-black' : s.sharpeRatio >= 1.0 ? 'text-emerald-400' : s.sharpeRatio > 0 ? 'text-slate-300' : 'text-red-400'}`}>
                          {s.sharpeRatio.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-bold text-red-400">
                        {s.maxDrawdownPct}%
                      </td>
                      <td className="p-3.5 text-center text-slate-400">
                        {s.avgHoldingDays}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-950/40 border-t border-slate-800">
            <p className="text-xs text-slate-400">
              <strong>Winner:</strong> Strategy with highest Sharpe ratio is highlighted. Best risk-adjusted returns.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB 2: INDIVIDUAL TRADES EXPLORER ─────────────────────────────────── */}
      {activeTab === 'trades' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Granular Trade Audit Ledger (Point-in-Time Executions)
            </h2>
            <span className="text-xs text-slate-400">
              Showing {trades.length} Executed Signals
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3">Symbol</th>
                  <th className="p-3">Strategy</th>
                  <th className="p-3">Regime</th>
                  <th className="p-3">Signal Date</th>
                  <th className="p-3">Entry Price</th>
                  <th className="p-3">Stop Loss</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Period Close</th>
                  <th className="p-3">Final Exit</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Net Return %</th>
                  <th className="p-3 text-center">Hold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {trades.map((t) => {
                  const reg = formatRegimeLabel(t.regime);
                  const isPos = t.netReturnPct > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white">{t.symbol}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{t.companyName}</div>
                      </td>
                      <td className="p-3 font-semibold text-slate-300">
                        {t.strategyName.replace(/Alignment & Base Compaction Breakout|Institutional Inflow & |Sequential /g, '')}
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${reg.badge}`}>
                          {reg.label.split(' ')[0]}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{t.signalDate}</td>
                      <td className="p-3 font-bold text-white">₹{t.initialEntryPrice.toFixed(2)}</td>
                      <td className="p-3 text-red-400 font-medium">₹{t.stopLoss.toFixed(2)}</td>
                      <td className="p-3 text-emerald-400 font-medium">₹{t.targetPrice.toFixed(2)}</td>
                      <td className="p-3 text-slate-300">₹{t.periodClosePrice.toFixed(2)}</td>
                      <td className="p-3 text-slate-300">
                        ₹{t.finalExitPrice.toFixed(2)}
                        <span className="text-[10px] text-slate-500 block">{t.finalExitDate}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          t.tradeStatus === 'HIT_TARGET'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : t.tradeStatus === 'STOP_LOSS_HIT'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-indigo-500/20 text-indigo-400'
                        }`}>
                          {t.tradeStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-right font-black">
                        <span className={isPos ? 'text-emerald-400' : 'text-red-400'}>
                          {isPos ? `+${t.netReturnPct.toFixed(2)}%` : `${t.netReturnPct.toFixed(2)}%`}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-400">{t.holdingDays}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── TAB: METHODOLOGY & AUDIT ──────────────────────────────────────────── */}
      {activeTab === 'custom' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-indigo-400" />
              Dynamic Multi-Strategy Backtesting Methodology & Audit
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Complete explanation of the dynamic framework: {universeCount}-stock universe × {regimeCount} regimes = {universeCount * regimeCount} rows with configurable strategy selection.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                <span>1.</span> Zero Survivorship Bias Framework
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Every stock in the {universeCount}-stock universe is backtested across all {regimeCount} regimes, producing exactly {universeCount * regimeCount} matrix rows. Stocks with no setup or insufficient data are explicitly marked <code>NO_SETUP</code> or <code>INSUFFICIENT_DATA</code>, preventing silent filtering.
              </p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400">
                {universeCount} scrips × {regimeCount} regimes = {universeCount * regimeCount} guaranteed ledger rows
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                <span>2.</span> Dynamic Strategy Selection & Columnar Mapping
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Select any combination of {allAvailableStrategies.length} available strategies (built-in S1–S4 + custom strategies). Each stock gets {regimeCount} rows (one per regime), with selected strategies mapped into adjacent columns. Confluence scores automatically calculated based on active strategies.
              </p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300">
                {selectedStrategies.size} selected × {regimeCount} regimes = {selectedStrategies.size * regimeCount} scenarios
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                <span>3.</span> Multi-Format Export & Downloads
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Full Universe Matrix CSV (all regimes × all strategies), per-strategy result exports (filtered CSV), and strategy comparison matrix. All exports use UTF-8 BOM encoding for compatibility with Excel and institutional reporting tools.
              </p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300">
                GET /api/v1/regime-backtest/export-csv [?strategyId=...&regime=...]
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                <span>4.</span> Per-Strategy Summary Cards & Comparison Tab
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                View performance metrics for each strategy-regime combination: total signals, win rate, profit factor, Sharpe ratio, CAGR, max drawdown, and best-performing stock. Strategy Comparison tab ranks all strategies by risk-adjusted returns.
              </p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300">
                Metrics: Win %, Profit Factor, Sharpe, CAGR, Max DD, Avg Hold
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-indigo-500/20 rounded-xl p-4 mt-4">
            <h3 className="text-sm font-bold text-indigo-300 mb-2">Current Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
              <div><span className="text-slate-400">Universe:</span> <span className="font-bold text-white">{universeCount} stocks</span></div>
              <div><span className="text-slate-400">Regimes:</span> <span className="font-bold text-white">{regimeCount}</span></div>
              <div><span className="text-slate-400">Total Rows:</span> <span className="font-bold text-white">{universeCount * regimeCount}</span></div>
              <div><span className="text-slate-400">Selected Strategies:</span> <span className="font-bold text-white">{selectedStrategies.size}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
