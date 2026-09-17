import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Brain,
  History,
  BarChart3,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit3,
  Save,
  RefreshCw,
  Sliders,
  Target,
  Compass,
  ExternalLink,
  FileText,
  Database,
  Zap,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Check,
  Building,
  Calendar,
  Crosshair,
  PieChart
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';
import { MomentumReasoningPanel } from './MomentumReasoningPanel.js';

export interface UniverseItem {
  symbol: string;
  companyName: string;
  sector: string;
  cmp: number;
  isHeld: boolean;
  quickVerdict?: string;
  pnlPct?: number;
  currentValue?: number;
}

interface SecurityDossierHubViewProps {
  initialSymbol?: string | null;
  onOpenCalibrationModal?: () => void;
}

export const SecurityDossierHubView: React.FC<SecurityDossierHubViewProps> = ({
  initialSymbol,
  onOpenCalibrationModal
}) => {
  // Universe state
  const [universe, setUniverse] = useState<UniverseItem[]>([]);
  const [universeLoading, setUniverseLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'HELD' | 'OPPORTUNITIES'>('ALL');

  // Selected Stock Dossier state
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || '');
  const [dossier, setDossier] = useState<any | null>(null);
  const [dossierLoading, setDossierLoading] = useState<boolean>(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [momentumReport, setMomentumReport] = useState<any | null>(null);

  // Thesis Edit State
  const [isEditingThesis, setIsEditingThesis] = useState<boolean>(false);
  const [thesisRationale, setThesisRationale] = useState<string>('');
  const [thesisHorizon, setThesisHorizon] = useState<string>('MID_TERM');
  const [thesisInvalidation, setThesisInvalidation] = useState<string>('');
  const [thesisSaving, setThesisSaving] = useState<boolean>(false);

  // Signal History & Drift state
  const [signalHistory, setSignalHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Fetch universe
  useEffect(() => {
    let isMounted = true;
    const loadUniverse = async () => {
      setUniverseLoading(true);
      try {
        const res = await fetch('/api/scrip-dossier/universe');
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setUniverse(data.data);
          // If no initialSymbol, select first held stock or first item
          if (!selectedSymbol && data.data.length > 0) {
            const defaultItem = data.data.find((item: UniverseItem) => item.isHeld) || data.data[0];
            setSelectedSymbol(defaultItem.symbol);
          }
        }
      } catch (err) {
        console.error('Failed to load universe:', err);
      } finally {
        if (isMounted) setUniverseLoading(false);
      }
    };
    loadUniverse();
    return () => { isMounted = false; };
  }, []);

  // Update selectedSymbol when initialSymbol changes from parent
  useEffect(() => {
    if (initialSymbol && initialSymbol !== selectedSymbol) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol]);

  // Fetch selected dossier
  const fetchDossier = async (symbolToFetch: string) => {
    if (!symbolToFetch) return;
    setDossierLoading(true);
    setDossierError(null);
    setMomentumReport(null);
    try {
      const [dossierRes, historyRes, momentumRes] = await Promise.all([
        fetch(`/api/scrip-dossier/${encodeURIComponent(symbolToFetch)}`),
        fetch(`/api/scrip-dossier/${encodeURIComponent(symbolToFetch)}/history`),
        fetch(`/api/momentum-reasoning/${encodeURIComponent(symbolToFetch)}`).catch(() => null)
      ]);

      const dossierData = await dossierRes.json();
      if (dossierData.success) {
        setDossier(dossierData.data);
        if (dossierData.data.thesis) {
          setThesisRationale(dossierData.data.thesis.thesisSummary || '');
          setThesisHorizon(dossierData.data.thesis.investmentHorizon || 'MID_TERM');
          setThesisInvalidation(dossierData.data.thesis.invalidationConditions?.[0] || '');
        } else {
          setThesisRationale('');
          setThesisInvalidation('');
        }
      } else {
        setDossierError(dossierData.error || 'Failed to assemble security dossier');
      }

      const historyData = await historyRes.json().catch(() => null);
      if (historyData?.success) {
        setSignalHistory(historyData.data || []);
      }

      if (momentumRes) {
        const momData = await momentumRes.json().catch(() => null);
        if (momData?.success && momData?.data) {
          setMomentumReport(momData.data);
        }
      }
    } catch (err: any) {
      setDossierError(err.message || 'Error communicating with Scrip Intelligence Engine');
    } finally {
      setDossierLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSymbol) {
      fetchDossier(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Save thesis updates
  const handleSaveThesis = async () => {
    if (!selectedSymbol) return;
    setThesisSaving(true);
    try {
      const res = await fetch(`/api/scrip-dossier/${encodeURIComponent(selectedSymbol)}/thesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesisSummary: thesisRationale,
          investmentHorizon: thesisHorizon,
          invalidationConditions: [thesisInvalidation],
          catalysts: dossier?.catalysts?.bullCase?.map((c: any) => c.title) || []
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditingThesis(false);
        fetchDossier(selectedSymbol);
      }
    } catch (err) {
      console.error('Failed to save thesis:', err);
    } finally {
      setThesisSaving(false);
    }
  };

  // Filtered universe
  const filteredUniverse = useMemo(() => {
    return universe.filter(item => {
      const matchesSearch = item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sector.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (filterType === 'HELD') return item.isHeld;
      if (filterType === 'OPPORTUNITIES') return !item.isHeld;
      return true;
    });
  }, [universe, searchQuery, filterType]);

  // Helper colors
  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'STRONG_BUY':
        return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      case 'ACCUMULATE_ON_DIPS':
        return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
      case 'HOLD':
        return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      case 'TRIM_PROFIT':
        return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
      case 'EXIT_STOP_LOSS':
        return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    }
  };

  const getMmiZoneBadge = (zone: string) => {
    switch (zone) {
      case 'EXTREME_GREED': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'GREED': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'FEAR': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'EXTREME_FEAR': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default: return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[750px] w-full bg-slate-950 text-slate-100 rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden font-sans">
      
      {/* ------------------------------------------------------------- */}
      {/* LEFT SIDEBAR: Search & Universe Directory (320px width)       */}
      {/* ------------------------------------------------------------- */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        
        {/* Top Header & Search */}
        <div className="p-4 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
                <Compass className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm tracking-wide text-slate-200">Security Universe</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {filteredUniverse.length}
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search symbol, name, sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => setFilterType('ALL')}
              className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                filterType === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('HELD')}
              className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                filterType === 'HELD'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Holdings
            </button>
            <button
              onClick={() => setFilterType('OPPORTUNITIES')}
              className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                filterType === 'OPPORTUNITIES'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Screened
            </button>
          </div>
        </div>

        {/* Scrip List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 custom-scrollbar">
          {universeLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse bg-slate-800/40 rounded-xl p-3 h-16" />
              ))}
            </div>
          ) : filteredUniverse.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No securities match your search criteria.
            </div>
          ) : (
            filteredUniverse.map((item) => {
              const isSelected = item.symbol === selectedSymbol;
              return (
                <button
                  key={item.symbol}
                  onClick={() => setSelectedSymbol(item.symbol)}
                  className={`w-full text-left p-3.5 transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500 pl-3'
                      : 'hover:bg-slate-800/40 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className={`font-semibold text-xs truncate ${isSelected ? 'text-indigo-200' : 'text-slate-200 group-hover:text-white'}`}>
                        {item.symbol}
                      </span>
                      {item.isHeld && (
                        <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Held
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {item.companyName}
                    </p>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                      {item.sector}
                    </span>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono font-medium text-slate-200">
                      ₹{item.cmp?.toLocaleString('en-IN') || '--'}
                    </div>
                    {item.quickVerdict && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono inline-block mt-1 ${getVerdictBadge(item.quickVerdict)}`}>
                        {item.quickVerdict.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Quick Action */}
        {onOpenCalibrationModal && (
          <div className="p-3 border-t border-slate-800/80 bg-slate-900/90">
            <button
              onClick={onOpenCalibrationModal}
              className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-300 flex items-center justify-center space-x-2 border border-slate-700/50 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Weight Calibration Ledgers</span>
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT MAIN DOSSIER CANVAS (10 Modules)                        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950/80 custom-scrollbar">
        {dossierLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <div className="text-center">
              <h4 className="text-sm font-semibold text-slate-200">Synthesizing Security Intelligence Dossier...</h4>
              <p className="text-xs text-slate-400 mt-1">
                Aggregating Screener, Trendlyne, Upstox F&O, StockEdge delivery & Pulse news feeds
              </p>
            </div>
          </div>
        ) : dossierError ? (
          <div className="p-8 text-center text-rose-400 space-y-3">
            <AlertTriangle className="w-8 h-8 mx-auto text-rose-400" />
            <p className="text-sm font-medium">{dossierError}</p>
            <button
              onClick={() => fetchDossier(selectedSymbol)}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        ) : !dossier ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Select a security from the universe directory to inspect its institutional dossier.
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
            
            {/* ========================================================= */}
            {/* MODULE 1: Header Banner & Executive Action Directive       */}
            {/* ========================================================= */}
            {/* ========================================================= */}
            {/* MODULE 1: Header Banner & Executive Action Directive       */}
            {/* ========================================================= */}
            <div
              className="relative rounded-2xl p-6 border shadow-xl overflow-hidden transition-all"
              style={{
                backgroundColor: 'var(--bg-card, #0f172a)',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch relative z-10">
                
                {/* Left Identity & CMP (6 cols on xl) */}
                <div className="xl:col-span-6 flex flex-col justify-between space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary, #ffffff)' }}>
                        {dossier.symbol}
                      </h2>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                        {dossier.sector}
                      </span>
                      {dossier.isHeld && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Invested Holding</span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                      {dossier.companyName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1">
                    <span className="text-3xl font-black font-mono tracking-tight" style={{ color: 'var(--text-primary, #ffffff)' }}>
                      ₹{dossier.cmp?.toLocaleString('en-IN') || '--'}
                    </span>
                    {(() => {
                      const dayChange = Number(dossier.dayChangePct ?? dossier.change1dPct ?? 0);
                      return (
                        <span className={`flex items-center text-sm font-bold font-mono ${dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {dayChange >= 0 ? <ArrowUpRight className="w-4 h-4 mr-0.5" /> : <ArrowDownRight className="w-4 h-4 mr-0.5" />}
                          {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)}% (1D)
                        </span>
                      );
                    })()}
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted, #64748b)' }}>
                      52W: ₹{dossier.low52W || (dossier.cmp ? Math.round(dossier.cmp * 0.68).toLocaleString('en-IN') : '--')} - ₹{dossier.high52W || (dossier.cmp ? Math.round(dossier.cmp * 1.35).toLocaleString('en-IN') : '--')}
                    </span>
                  </div>

                  {dossier.holdingContext && (
                    <div
                      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2 rounded-xl text-xs"
                      style={{
                        backgroundColor: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))',
                        border: '1px solid var(--border-card, #334155)'
                      }}
                    >
                      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Qty: <strong style={{ color: 'var(--text-primary, #ffffff)' }}>{dossier.holdingContext.quantity}</strong>
                      </span>
                      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Avg: <strong style={{ color: 'var(--text-primary, #ffffff)' }}>₹{dossier.holdingContext.averagePrice?.toFixed(2)}</strong>
                      </span>
                      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Current Val: <strong style={{ color: 'var(--text-primary, #ffffff)' }}>{formatINR(dossier.holdingContext.currentValue)}</strong>
                      </span>
                      <span className={dossier.holdingContext.pnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        P&L: <strong>{formatINR(dossier.holdingContext.pnl)} ({dossier.holdingContext.pnlPct >= 0 ? '+' : ''}{dossier.holdingContext.pnlPct?.toFixed(2)}%)</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Action Directive & Risk-Reward (6 cols on xl) */}
                <div
                  className="xl:col-span-6 rounded-2xl p-4 flex flex-col justify-between space-y-3 min-w-0 shadow-sm"
                  style={{
                    backgroundColor: 'var(--bg-table-alt, rgba(15, 23, 42, 0.6))',
                    border: '1px solid var(--border-card, #334155)'
                  }}
                >
                  {/* Top: Engine Outlook badge and verdict */}
                  <div
                    className="border-b pb-2.5 space-y-1.5"
                    style={{ borderColor: 'var(--border-card, #334155)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider block" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Engine Outlook
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap shadow-xs ${getVerdictBadge(dossier.outlook.verdict)}`}>
                        {dossier.outlook.verdict.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary, #cbd5e1)' }}
                    >
                      {dossier.outlook.verdictDescription}
                    </p>
                  </div>

                  {/* Bottom: 4 metric cards cleanly separated without collision */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2">
                    <div
                      className="p-2.5 rounded-xl text-center shadow-xs min-w-0"
                      style={{
                        backgroundColor: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border-card, #334155)'
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Probability
                      </span>
                      <div className="font-extrabold text-base font-mono text-emerald-400 mt-0.5">
                        {dossier.outlook.calibratedProbabilityPct}%
                      </div>
                      <span className="text-[9px] font-mono block mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                        CI: {dossier.outlook.confidenceInterval95?.lower}% - {dossier.outlook.confidenceInterval95?.upper}%
                      </span>
                    </div>

                    <div
                      className="p-2.5 rounded-xl text-center shadow-xs min-w-0"
                      style={{
                        backgroundColor: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border-card, #334155)'
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Expected Upside
                      </span>
                      <div className="font-extrabold text-base font-mono text-indigo-400 mt-0.5">
                        +{dossier.outlook.expectedUpsidePct}%
                      </div>
                      <span className="text-[9px] font-mono block mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                        Tgt: ₹{Math.round(dossier.outlook.targetPrice || 0).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div
                      className="p-2.5 rounded-xl text-center shadow-xs min-w-0"
                      style={{
                        backgroundColor: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border-card, #334155)'
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Stop-Loss
                      </span>
                      <div className="font-extrabold text-base font-mono text-rose-400 mt-0.5">
                        ₹{Math.round(dossier.outlook.stopLossPrice || 0).toLocaleString('en-IN')}
                      </div>
                      <span className="text-[9px] font-mono block mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                        R:R {dossier.outlook.riskRewardRatio}x
                      </span>
                    </div>

                    <div
                      className="p-2.5 rounded-xl text-center shadow-xs min-w-0"
                      style={{
                        backgroundColor: 'var(--bg-card, #0f172a)',
                        border: '1px solid var(--border-card, #334155)'
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted, #94a3b8)' }}>
                        Kelly Sizing
                      </span>
                      <div className="font-extrabold text-base font-mono text-amber-400 mt-0.5">
                        {dossier.outlook.halfKellyAllocationPct}%
                      </div>
                      <span className="text-[9px] font-mono block mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                        Horizon: {dossier.outlook.horizonDays}d
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Portal Attribution Badges */}
              <div
                className="mt-4 pt-3 border-t flex flex-wrap items-center gap-2 text-[10px]"
                style={{ borderColor: 'var(--border-card, #334155)' }}
              >
                <span className="font-semibold" style={{ color: 'var(--text-muted, #64748b)' }}>Data Feeds:</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">Screener.in</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">Trendlyne X-Ray</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">Upstox Live F&O</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">Tickertape MMI</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">StockEdge Flows</span>
                <span className="px-2 py-0.5 rounded text-slate-300 bg-slate-800/80 border border-slate-700">Pulse by Zerodha</span>
              </div>
            </div>

            {/* ========================================================= */}
            {/* MODULE 2: Dual-Axis Catalysts: Bull vs Bear               */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Bull Case */}
              <div className="bg-slate-900/70 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center space-x-2 text-emerald-400 border-b border-emerald-500/20 pb-3">
                  <TrendingUp className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">Bullish Catalysts (Why it will go UP)</h3>
                </div>
                <div className="space-y-3">
                  {dossier.catalysts?.bullCase?.map((cat: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-300">{cat.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {cat.sourcePortal}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{cat.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bear Case */}
              <div className="bg-slate-900/70 border border-rose-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center space-x-2 text-rose-400 border-b border-rose-500/20 pb-3">
                  <TrendingDown className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">Bearish Risks (Why it could go DOWN)</h3>
                </div>
                <div className="space-y-3">
                  {dossier.catalysts?.bearCase?.map((cat: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-rose-300">{cat.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          {cat.sourcePortal}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{cat.description}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ========================================================= */}
            {/* MODULE 3: Sector & Peer Positioning Table                 */}
            {/* ========================================================= */}
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Building className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Sector & Peer Benchmarking ({dossier.sectorPositioning.sectorName})
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
                  {dossier.sectorPositioning.sectorStatus}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-medium">
                      <th className="py-2.5 px-3">Company</th>
                      <th className="py-2.5 px-3">CMP</th>
                      <th className="py-2.5 px-3">P/E</th>
                      <th className="py-2.5 px-3">PEG</th>
                      <th className="py-2.5 px-3">ROE %</th>
                      <th className="py-2.5 px-3">Sales Growth (3Y)</th>
                      <th className="py-2.5 px-3">Market Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {dossier.sectorPositioning.peers?.map((p: any) => {
                      const isCurrent = p.symbol === dossier.symbol;
                      return (
                        <tr
                          key={p.symbol}
                          className={`${
                            isCurrent
                              ? 'bg-indigo-950/40 text-indigo-200 font-semibold border-l-2 border-indigo-500'
                              : 'text-slate-300 hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="py-2 px-3 font-sans flex items-center space-x-1.5">
                            <span>{p.companyName}</span>
                            {isCurrent && <span className="text-[10px] text-indigo-400">(Selected)</span>}
                          </td>
                          <td className="py-2 px-3">₹{p.cmp?.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3">{p.peRatio}</td>
                          <td className="py-2 px-3">{p.pegRatio}</td>
                          <td className="py-2 px-3 text-emerald-400">{p.roePct}%</td>
                          <td className="py-2 px-3">{p.threeYearSalesCagrPct}%</td>
                          <td className="py-2 px-3 font-sans text-slate-400">{p.marketShareStatus}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ========================================================= */}
            {/* MODULE 4 & 5: Macro Mood + Demand & Institutional Flows   */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Macro & Market Mood */}
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Macro & Market Mood</h3>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${getMmiZoneBadge(dossier.macroMarketMood.tickertapeMmiZone)}`}>
                    MMI: {dossier.macroMarketMood.tickertapeMmiScore}/100 ({dossier.macroMarketMood.tickertapeMmiZone.replace(/_/g, ' ')})
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px]">Macro Regime</span>
                    <div className="font-semibold text-white mt-0.5">{dossier.macroMarketMood.macroRegime}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{dossier.macroMarketMood.regimeImplication}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px]">RBI Rate Sensitivity</span>
                    <div className="font-semibold text-white mt-0.5">{dossier.macroMarketMood.rbiRateSensitivity}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{dossier.macroMarketMood.domesticVsExport}</div>
                  </div>
                </div>
              </div>

              {/* Demand, Supply & Institutional Flows */}
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Demand, Supply & Institutional Flows</h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                    StockEdge / NSE
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-400 text-[10px] font-sans">Delivery %</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.demandSupplyFlows.realDeliveryPct}%</div>
                    <div className="text-[9px] text-emerald-400 mt-0.5">{dossier.demandSupplyFlows.deliverySurgeRatio}x 20-DMA</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-400 text-[10px] font-sans">FII Flow</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.demandSupplyFlows.stockEdgeFiiFlow}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">QoQ: {dossier.demandSupplyFlows.fiiHoldingQoQChangePct > 0 ? '+' : ''}{dossier.demandSupplyFlows.fiiHoldingQoQChangePct}%</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-400 text-[10px] font-sans">DII Flow</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.demandSupplyFlows.stockEdgeDiiFlow}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">QoQ: {dossier.demandSupplyFlows.diiHoldingQoQChangePct > 0 ? '+' : ''}{dossier.demandSupplyFlows.diiHoldingQoQChangePct}%</div>
                  </div>
                </div>

                {/* Ownership Distribution Matrix */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium">Shareholding Profile (Screener):</span>
                    <span className="font-mono text-emerald-400 text-[10px] uppercase font-semibold">{dossier.demandSupplyFlows.deliveryTrend} FLOW</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs pt-0.5">
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[9px] text-slate-400 block font-sans">Promoter</span>
                      <strong className="text-white">{dossier.demandSupplyFlows.promoterHoldingPct}%</strong>
                    </div>
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[9px] text-slate-400 block font-sans">FIIs</span>
                      <strong className="text-indigo-300">{dossier.demandSupplyFlows.fiiHoldingPct ?? '--'}%</strong>
                    </div>
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[9px] text-slate-400 block font-sans">DIIs</span>
                      <strong className="text-cyan-300">{dossier.demandSupplyFlows.diiHoldingPct ?? '--'}%</strong>
                    </div>
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[9px] text-slate-400 block font-sans">Public</span>
                      <strong className="text-slate-300">{dossier.demandSupplyFlows.publicHoldingPct ?? '--'}%</strong>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/50">
                    <span>{dossier.demandSupplyFlows.insiderActivity}</span>
                    {dossier.demandSupplyFlows.orderBookVisibility && (
                      <span className="text-indigo-300 font-medium">{dossier.demandSupplyFlows.orderBookVisibility}</span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* ========================================================= */}
            {/* TRADINGVIEW LIVE PRO CHART & REASONING ENGINE (Spec v1.1)  */}
            {/* ========================================================= */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold font-display text-slate-200 uppercase tracking-wider">
                    Interactive Technical Charting & Support/Resistance Overlay
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  TradingView Integrated
                </span>
              </div>

              <TradingViewChartWidget
                symbol={selectedSymbol}
                height={460}
                interval="D"
                supportPrice={momentumReport?.supportResistance?.nearestSupport?.price || dossier.technicalSetup?.supportS1}
                resistancePrice={momentumReport?.supportResistance?.nearestResistance?.price || dossier.technicalSetup?.resistanceR1}
                momentumScore={momentumReport?.momentumScore}
                momentumLevel={momentumReport?.momentumLevel}
                smasScore={momentumReport?.smartMoney?.consensusScore}
              />

              {momentumReport && (
                <MomentumReasoningPanel report={momentumReport} symbol={selectedSymbol} />
              )}
            </div>

            {/* ========================================================= */}
            {/* MODULE 6 & 7: Fundamentals & Forensics + Technical Setup  */}
            {/* ========================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Fundamentals & Forensics */}
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Fundamental Forensics (Screener / Trendlyne)</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                      Piotroski: {dossier.fundamentals.piotroskiFScore}/9
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      dossier.fundamentals.altmanZZone === 'SAFE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      Altman Z: {dossier.fundamentals.altmanZScore} ({dossier.fundamentals.altmanZZone})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs font-mono text-center">
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">P/E</span>
                    <div className="font-bold text-white mt-0.5">{dossier.fundamentals.peRatio}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">ROCE</span>
                    <div className="font-bold text-emerald-400 mt-0.5">{dossier.fundamentals.rocePct}%</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">ROE</span>
                    <div className="font-bold text-emerald-400 mt-0.5">{dossier.fundamentals.roePct}%</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">D/E</span>
                    <div className="font-bold text-white mt-0.5">{dossier.fundamentals.debtToEquity}</div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] text-slate-400 font-medium">Screener Insights:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {dossier.fundamentals.pros?.slice(0, 3).map((pro: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        + {pro}
                      </span>
                    ))}
                    {dossier.fundamentals.cons?.slice(0, 2).map((con: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        - {con}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Technical Setup */}
              <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <Crosshair className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Technical Setup & Market Structure</h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                    {dossier.technicalSetup.emaAlignment}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-500 text-[10px] font-sans">RSI 14</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.technicalSetup.rsi14}</div>
                    <div className="text-[9px] text-purple-400 mt-0.5">{dossier.technicalSetup.rsiInterpretation}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-500 text-[10px] font-sans">Support</span>
                    <div className="font-bold text-emerald-400 text-base mt-1">₹{dossier.technicalSetup.supportS1}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">S2: ₹{dossier.technicalSetup.supportS2}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <span className="text-slate-500 text-[10px] font-sans">Resistance</span>
                    <div className="font-bold text-rose-400 text-base mt-1">₹{dossier.technicalSetup.resistanceR1}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">R2: ₹{dossier.technicalSetup.resistanceR2}</div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 flex items-center justify-between pt-1">
                  <span>Moving Averages: 20-EMA <strong>₹{dossier.technicalSetup.ema20}</strong> | 50-EMA <strong>₹{dossier.technicalSetup.ema50}</strong> | 200-SMA <strong>₹{dossier.technicalSetup.sma200}</strong></span>
                </div>
              </div>

            </div>

            {/* ========================================================= */}
            {/* MODULE 8: Upstox Live F&O & Derivatives Sentiment          */}
            {/* ========================================================= */}
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Upstox Live F&O Intelligence & Media Buzz
                  </h3>
                </div>
                {dossier.derivativesSentiment.isFnoEligible ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                    F&O Eligible
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                    Cash Equities Only
                  </span>
                )}
              </div>

              {dossier.derivativesSentiment.isFnoEligible && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">Put-Call Ratio (PCR)</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.derivativesSentiment.pcr}</div>
                    <div className="text-[9px] text-emerald-400 mt-0.5">
                      {dossier.derivativesSentiment.pcr > 1.2 ? 'Bullish Support' : dossier.derivativesSentiment.pcr < 0.8 ? 'Bearish Overhead' : 'Neutral'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">Max Pain Strike</span>
                    <div className="font-bold text-white text-base mt-1">₹{dossier.derivativesSentiment.maxPainStrike}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Expiry Magnet</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">ATM IV / Percentile</span>
                    <div className="font-bold text-white text-base mt-1">{dossier.derivativesSentiment.atmIv}%</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">IVP: {dossier.derivativesSentiment.ivPercentile}%</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 text-[10px] font-sans">OI Buildup Interpretation</span>
                    <div className="font-bold text-indigo-400 text-sm mt-1">{dossier.derivativesSentiment.oiBuildup}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Calls @ ₹{dossier.derivativesSentiment.highestCallOiStrike}</div>
                  </div>
                </div>
              )}

              {/* News Buzz from Pulse / Moneycontrol */}
              <div className="space-y-2 pt-2">
                <div className="text-[11px] text-slate-400 font-medium">Recent Media Catalysts (Pulse by Zerodha / Moneycontrol):</div>
                <div className="space-y-2">
                  {dossier.derivativesSentiment.recentHeadlines?.slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex-1 pr-3">
                        <p className="text-slate-200">{item.title}</p>
                        <span className="text-[10px] text-slate-500">{item.source} • {item.pubDate}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        item.sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {item.sentiment}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Earnings Call & Concall Intelligence Summary */}
              {dossier.concallSummary && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-cyan-500/30 space-y-2.5 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-semibold text-slate-200">
                        Earnings Call Intelligence ({dossier.concallSummary.latestCallDate})
                      </h4>
                    </div>
                    {dossier.concallSummary.transcriptUrl && (
                      <a
                        href={dossier.concallSummary.transcriptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                      >
                        <span>Transcript / Filing</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-[10px] text-slate-400">Tone:</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      dossier.concallSummary.managementTone === 'BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : dossier.concallSummary.managementTone === 'CAUTIOUS'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}>
                      {dossier.concallSummary.managementTone}
                    </span>
                    <span className="text-[11px] text-slate-300 truncate font-sans">
                      {dossier.concallSummary.transcriptTitle}
                    </span>
                  </div>
                  <div className="space-y-1 pt-0.5">
                    {dossier.concallSummary.keyTakeaways?.map((takeaway: string, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs text-slate-300">
                        <span className="text-cyan-400 font-bold">•</span>
                        <span className="leading-relaxed">{takeaway}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* MODULE 9: Megatrend & Multibagger Scorecard               */}
            {/* ========================================================= */}
            <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Megatrend & Multibagger Screener Scorecard
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                    {dossier.megatrendMultibagger.megatrendBasket} (Rank #{dossier.megatrendMultibagger.megatrendRank})
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                    Criteria: {dossier.megatrendMultibagger.multibaggerPassedCriteria} / {dossier.megatrendMultibagger.multibaggerTotalCriteria}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {dossier.megatrendMultibagger.multibaggerChecklist?.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                      item.passed
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[11px]">{item.criterion}</span>
                        {item.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-600" />}
                      </div>
                      <p className="text-[10px] mt-1 text-slate-400">{item.metricValue}</p>
                    </div>
                    <span className="text-[9px] uppercase font-mono mt-2 text-slate-500">
                      {item.passed ? 'Verified' : 'Unsatisfied'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ========================================================= */}
            {/* MODULE 10: Persistent Knowledge Base & Signal Drift       */}
            {/* ========================================================= */}
            <div className="bg-slate-900/70 border border-indigo-500/30 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Longitudinal Knowledge Base, Active Thesis & Signal Drift
                  </h3>
                </div>
                <button
                  onClick={() => setIsEditingThesis(!isEditingThesis)}
                  className="px-3 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-medium border border-indigo-500/40 flex items-center space-x-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingThesis ? 'Cancel Edit' : 'Edit Thesis'}</span>
                </button>
              </div>

              {/* Active Investment Thesis Card / Editor */}
              {isEditingThesis ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-4">
                  <h4 className="text-xs font-semibold text-indigo-300">Update Investment Thesis for {dossier.symbol}</h4>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Thesis Rationale (Core conviction driver)</label>
                    <textarea
                      rows={3}
                      value={thesisRationale}
                      onChange={(e) => setThesisRationale(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Horizon</label>
                      <select
                        value={thesisHorizon}
                        onChange={(e) => setThesisHorizon(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200"
                      >
                        <option value="SHORT_TERM">Short Term (1-3 Months)</option>
                        <option value="MID_TERM">Mid Term (3-12 Months)</option>
                        <option value="LONG_TERM">Long Term (1-3 Years)</option>
                        <option value="MULTIBAGGER_COMPOUNDER">Multibagger Compounder (3-5 Years)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Thesis Invalidation Trigger</label>
                      <input
                        type="text"
                        value={thesisInvalidation}
                        onChange={(e) => setThesisInvalidation(e.target.value)}
                        placeholder="e.g. EBITDA margin < 14% or loss of promoter control"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      onClick={() => setIsEditingThesis(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveThesis}
                      disabled={thesisSaving}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center space-x-1.5 shadow-md shadow-indigo-600/30"
                    >
                      {thesisSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save To Knowledge Base</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-300">Active Thesis Summary</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      Horizon: {dossier.thesis?.investmentHorizon || 'MID_TERM'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {dossier.thesis?.thesisSummary || 'No custom investment thesis recorded yet. Click "Edit Thesis" to formulate the primary thesis.'}
                  </p>
                  {dossier.thesis?.invalidationConditions?.length > 0 && (
                    <div className="pt-2 text-[11px] text-rose-300">
                      <strong>Invalidation Trigger:</strong> {dossier.thesis.invalidationConditions[0]}
                    </div>
                  )}
                </div>
              )}

              {/* Historical Signal Drift & Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>Engine Signal Drift & Historical Attribution</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {signalHistory.length} Recorded Signal Cycles
                  </span>
                </div>

                {signalHistory.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-center text-xs text-slate-500">
                    No historical signal drift cycles recorded yet for this ticker. Live cycles are logged during each market scan.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-medium">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Signal Action</th>
                          <th className="py-2 px-3">Price at Signal</th>
                          <th className="py-2 px-3">Calibrated Prob</th>
                          <th className="py-2 px-3">Horizon Days</th>
                          <th className="py-2 px-3">Outcome Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {signalHistory.map((sig: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30 text-slate-300">
                            <td className="py-2 px-3">{sig.recommendationDate}</td>
                            <td className="py-2 px-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${getVerdictBadge(sig.actionType)}`}>
                                {sig.actionType}
                              </span>
                            </td>
                            <td className="py-2 px-3">₹{sig.entryPrice}</td>
                            <td className="py-2 px-3">{sig.calibratedProbabilityPct}%</td>
                            <td className="py-2 px-3">{sig.horizonDays}d</td>
                            <td className="py-2 px-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                sig.status === 'TARGET_HIT'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : sig.status === 'STOP_LOSS_HIT'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {sig.status || 'ACTIVE'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}
      </div>

    </div>
  );
};
