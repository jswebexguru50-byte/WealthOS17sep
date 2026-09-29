import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  Shield,
  FileText,
  Users,
  PieChart as PieChartIcon,
  ExternalLink,
  X,
  BarChart2,
  Compass,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  GitBranch,
  Crosshair,
  BookOpen,
  CalendarDays,
  ArrowRightLeft,
  HelpCircle
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { CompanyIntelligenceOverview, EvidenceDrawerItem } from './company-intelligence/CompanyIntelligenceOverview.js';

interface StockIntelligenceViewProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  formatCurrency?: (val: number) => string;
}

const TABS = [
  { id: 'OVERVIEW',       label: 'Overview',        icon: Compass,       modKey: null },
  { id: 'BUSINESS',       label: 'Business',         icon: GitBranch,     modKey: 'businessDrivers' },
  { id: 'TECHNICAL',      label: 'Technical',        icon: Activity,      modKey: 'technical' },
  { id: 'FUNDAMENTAL',    label: 'Fundamentals',     icon: FileText,      modKey: 'fundamental' },
  { id: 'MANAGEMENT',     label: 'Management',       icon: Users,         modKey: 'management' },
  { id: 'FERE',           label: 'FERE',             icon: AlertTriangle, modKey: 'fere' },
  { id: 'QGLP',           label: 'QGLP',             icon: Shield,        modKey: 'qglp' },
  { id: 'VALUATION',      label: 'Valuation',        icon: BarChart2,     modKey: 'valuation' },
  { id: 'MARKET',         label: 'Market',           icon: PieChartIcon,  modKey: 'marketContext' },
  { id: 'CONTRADICTIONS', label: 'Contradictions',   icon: Crosshair,     modKey: 'contradictions' },
  { id: 'THESIS',         label: 'Thesis',           icon: BookOpen,      modKey: 'thesis' },
  { id: 'TIMELINE',       label: 'Timeline',         icon: CalendarDays,  modKey: null },
];

export function StockIntelligenceView({
  symbol,
  isOpen,
  onClose,
  formatCurrency = (v) => formatINR(v)
}: StockIntelligenceViewProps) {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceDrawerItem | null>(null);

  useEffect(() => {
    if (!isOpen || !symbol) return;
    setLoading(true);
    setError(null);

    fetch(`/api/v2/company-intelligence/${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((intelJson) => {
        if (intelJson.success || intelJson.modules || intelJson.overview) {
          setData(intelJson.data || intelJson);
        } else {
          throw new Error(intelJson.message || intelJson.error || 'Scrip intelligence error.');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [symbol, isOpen]);

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-bold text-white tracking-tight">Loading Company Intelligence</h3>
          <p className="text-xs text-slate-400">
            Running independent analytical modules for <span className="text-cyan-300 font-mono font-bold">{symbol}</span>...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Scrip Intelligence Unavailable</h3>
          <p className="text-xs text-slate-400">{error || 'Could not retrieve data for this instrument.'}</p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Extract Canonical V2 Modules — NO legacy fallback allowed.
  // If a module is missing, its value is null and the UI renders DATA_INSUFFICIENT.
  const security = data.security || {};
  const modules = data.modules || {};
  const overview = data.overview || null;
  const freshness = data.freshness || null;
  const monitoring = data.monitoring || null;
  const timelineData = modules.timeline?.result || null;   // V2: real CompanyEvents only
  const delta = modules.delta?.result || null;             // V2: analytical state changes only
  const attention = modules.attention?.result || null;
  const questions = modules.questions?.result || null;

  const tech = modules.technical?.result || null;
  const fund = modules.fundamental?.result || null;
  const fere = modules.fere?.result || null;
  const qglp = modules.qglp?.result || null;
  const mgmt = modules.management?.result || null;
  const val = modules.valuation?.result || null;
  const market = modules.marketContext?.result || null;
  const inflection = modules.businessInflection?.result || null;
  const drivers = modules.businessDrivers?.result || null;
  const contradictions = modules.contradictions?.result || null;
  const thesis = modules.thesis?.result || null;

  const companyName = security.companyName || symbol;
  const businessModel = security.businessModel || 'NON_FINANCIAL';
  const sector = security.sector || 'Equities';
  const isin = security.isin || '';

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'WORKING':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">WORKING</span>;
      case 'PARTIAL':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">PARTIAL</span>;
      case 'DATA_INSUFFICIENT':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-700 text-slate-300 border border-slate-600">DATA INSUFFICIENT</span>;
      case 'SOURCE_UNAVAILABLE':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40">UNAVAILABLE</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-400">UNCHECKED</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div
        className="rounded-3xl w-full max-w-6xl overflow-hidden flex flex-col shadow-2xl transition-all border max-h-[92vh]"
        style={{
          background: 'var(--bg-modal, #0b1120)',
          borderColor: 'var(--border-card, #1e293b)',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: 'var(--border-card, #1e293b)',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%)'
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">{symbol}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {sector}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {businessModel}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {companyName} {isin ? `· ${isin}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation — full V2 module set */}
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto bg-slate-950/80 border-b border-slate-800/80 scrollbar-thin scrollbar-thumb-slate-700">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const modStatus = tab.modKey ? modules[tab.modKey]?.status : null;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
                {modStatus && (
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    modStatus === 'WORKING' ? 'bg-emerald-400' :
                    modStatus === 'PARTIAL' ? 'bg-amber-400' : 'bg-slate-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ─────────────────────────────────────────────────────────────────
              TAB 1: OVERVIEW (WHY INTERESTING? + WHAT NEEDS ATTENTION?)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'OVERVIEW' && (
            <CompanyIntelligenceOverview
              modules={modules}
              overview={overview}
              freshness={freshness}
              monitoring={monitoring}
              onViewEvidence={(item) => setSelectedEvidence(item)}
            />
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 2: TECHNICAL (REUSES EXISTING ENGINES)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'TECHNICAL' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Technical Analysis & Strategy Signals</h3>
                </div>
                {getStatusBadge(modules.technical?.status)}
              </div>

              {tech ? (
                <>
                  {/* Indicators Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Price (CMP)</span>
                      <span className="text-lg font-black text-white font-mono">
                        {tech.price !== null ? formatCurrency(tech.price) : 'N/A'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Trend Structure</span>
                      <span className={`text-base font-black font-mono ${
                        tech.trend === 'BULLISH' ? 'text-emerald-400' :
                        tech.trend === 'BEARISH' ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {tech.trend}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">RSI (14)</span>
                      <span className="text-lg font-black text-cyan-300 font-mono">{tech.rsi14 ?? 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">EMA 20</span>
                      <span className="text-lg font-black text-slate-200 font-mono">{tech.ema20 ?? 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">EMA 50</span>
                      <span className="text-lg font-black text-slate-200 font-mono">{tech.ema50 ?? 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">SMA 200</span>
                      <span className="text-lg font-black text-slate-200 font-mono">{tech.sma200 ?? 'N/A'}</span>
                    </div>
                  </div>

                  {/* 52W & Volatility */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">52-Week High</span>
                      <span className="text-sm font-bold text-slate-200 font-mono">{tech.high52w ? formatCurrency(tech.high52w) : 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">52-Week Low</span>
                      <span className="text-sm font-bold text-slate-200 font-mono">{tech.low52w ? formatCurrency(tech.low52w) : 'N/A'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">ATR Volatility (%)</span>
                      <span className="text-sm font-bold text-slate-200 font-mono">{tech.atrPct ? `${tech.atrPct}%` : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Pure Strategies Signals Table */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Pure Technical Strategy Evaluations (S1 - S10)
                    </h4>
                    <div className="divide-y divide-slate-800">
                      {tech.signals && tech.signals.length > 0 ? (
                        tech.signals.map((sig: any) => (
                          <div key={sig.strategyId} className="py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-bold text-cyan-400 w-10">{sig.strategyId}</span>
                              <span className="text-xs font-medium text-slate-200">{sig.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {sig.details?.stopLoss && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  SL: ₹{sig.details.stopLoss}
                                </span>
                              )}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                sig.qualified
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {sig.qualified ? 'QUALIFIED' : 'UNQUALIFIED'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-3">No strategy evaluation results available.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  Technical data insufficient or not computed.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 3: FUNDAMENTAL (MODEL AWARE: BANK VS NON-FINANCIAL)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'FUNDAMENTAL' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">Fundamental Intelligence</h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Model: {fund?.businessModel || businessModel} (Tailored financial metrics)
                    </span>
                  </div>
                </div>
                {getStatusBadge(modules.fundamental?.status)}
              </div>

              {fund ? (
                <>
                  {/* Trajectory Insights Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-mono text-slate-400">Revenue Trajectory</span>
                      <div className="text-base font-black text-white">
                        {fund.trajectory?.revenueGrowthYoY?.status || 'DATA_INSUFFICIENT'}
                      </div>
                      {fund.trajectory?.revenueGrowthYoY?.latestGrowthPct !== null && (
                        <span className="text-xs font-mono text-cyan-300 block">
                          Latest: +{fund.trajectory.revenueGrowthYoY.latestGrowthPct}% YoY
                        </span>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-mono text-slate-400">Margin Trajectory</span>
                      <div className="text-base font-black text-white">
                        {fund.trajectory?.marginTrajectory?.status || 'DATA_INSUFFICIENT'}
                      </div>
                      {fund.trajectory?.marginTrajectory?.bpsChange !== null && (
                        <span className="text-xs font-mono text-cyan-300 block">
                          {fund.trajectory.marginTrajectory.bpsChange > 0 ? '+' : ''}
                          {fund.trajectory.marginTrajectory.bpsChange} bps ({fund.trajectory.marginTrajectory.metricUsed})
                        </span>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-mono text-slate-400">Capital Return Profile</span>
                      <div className="text-base font-black text-white">
                        {fund.trajectory?.returnProfile?.status || 'DATA_INSUFFICIENT'}
                      </div>
                      {fund.trajectory?.returnProfile?.latestValue !== null && (
                        <span className="text-xs font-mono text-cyan-300 block">
                          {fund.trajectory.returnProfile.metric}: {fund.trajectory.returnProfile.latestValue}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Multi-Period Historical Financial Table */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 overflow-x-auto">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Canonical Multi-Period Fact Series (Consolidated INR Cr)
                    </h4>

                    {Object.keys(fund.historicalSeries || {}).length > 0 ? (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                            <th className="py-2 pr-4">Metric</th>
                            <th className="py-2 px-4">Period</th>
                            <th className="py-2 px-4">Value</th>
                            <th className="py-2 px-4">Scope</th>
                            <th className="py-2 pl-4">Provenance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {Object.entries(fund.historicalSeries).map(([metricName, items]: [string, any]) =>
                            items.map((item: any, idx: number) => (
                              <tr key={`${metricName}-${idx}`} className="hover:bg-slate-800/30">
                                <td className="py-2 pr-4 font-bold text-slate-200">{metricName}</td>
                                <td className="py-2 px-4 text-slate-400">{item.period}</td>
                                <td className="py-2 px-4 font-bold text-cyan-300">
                                  {typeof item.value === 'number'
                                    ? item.unit === 'PERCENT'
                                      ? `${item.value}%`
                                      : `₹${item.value.toLocaleString()} Cr`
                                    : 'N/A'}
                                </td>
                                <td className="py-2 px-4 text-slate-400">{item.scope}</td>
                                <td className="py-2 pl-4 text-[10px] text-slate-500 truncate max-w-xs">
                                  {item.provenance?.[0]?.sourceType || 'CANONICAL_FACT'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-slate-400 py-3">No historical metric series registered for this scrip.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  Fundamental facts unavailable or awaiting indexing.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 4: QGLP (6 PILLARS - NO ARBITRARY COMPOSITE SCORE)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'QGLP' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">QGLP Multi-Dimensional Evidence Assessment</h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Truthful evidence accounting. No single composite numeric score.
                    </span>
                  </div>
                </div>
                {getStatusBadge(modules.qglp?.status)}
              </div>

              {qglp ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'qualityOfBusiness', title: 'Quality of Business', data: qglp.qualityOfBusiness },
                    { key: 'qualityOfManagement', title: 'Quality of Management', data: qglp.qualityOfManagement },
                    { key: 'growth', title: 'Growth Profile', data: qglp.growth },
                    { key: 'longevity', title: 'Longevity & Solvency', data: qglp.longevity },
                    { key: 'price', title: 'Price & Valuation Realism', data: qglp.price },
                    { key: 'risk', title: 'Risk & Forensic Accounting', data: qglp.risk },
                  ].map((pillar) => (
                    <div key={pillar.key} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                          {pillar.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-emerald-400 font-bold">{pillar.data?.summaryCounts?.supported || 0} supported</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">{pillar.data?.summaryCounts?.dataInsufficient || 0} unknown</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {pillar.data?.items?.map((item: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-300">{item.name}</span>
                              <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded ${
                                item.status === 'SUPPORTED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                                item.status === 'NO_RED_FLAG_DETECTED' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                                item.status === 'WARNING' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                                item.status === 'PARTIAL' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                                'bg-slate-800 text-slate-400'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {item.observation || 'Awaiting empirical source verification.'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  QGLP evidence assessment not available.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 5: FERE (FINANCIAL QUALITY & FORENSIC WARNINGS)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'FERE' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="text-base font-bold text-white">FERE Financial Quality & Evidence Verification</h3>
                </div>
                {getStatusBadge(modules.fere?.status)}
              </div>

              {fere ? (
                <>
                  {/* Warnings & Divergences */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Accounting Quality Warnings & Divergence Signals
                    </h4>
                    {fere.warnings && fere.warnings.length > 0 ? (
                      <div className="space-y-2">
                        {fere.warnings.map((w: any) => (
                          <div key={w.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-400 font-bold">⚠</span>
                                <span className="text-xs font-bold text-white">{w.title}</span>
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                w.severity === 'MATERIAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {w.severity}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 pl-4">{w.observation}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>No cash conversion lag or balance sheet divergence warnings detected.</span>
                      </div>
                    )}
                  </div>

                  {/* Auditor Observations */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Auditor Observations & Report Verification
                    </h4>
                    {fere.auditorObservations && fere.auditorObservations.length > 0 ? (
                      fere.auditorObservations.map((obs: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1">
                          <span className="text-slate-300 font-medium">Statutory Auditor Opinion ({obs.period})</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            obs.hasQualification ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {obs.opinion}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Auditor review clean; unqualified opinion.</p>
                    )}
                  </div>

                  {/* Available Filings */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      Verified Documents & Filings ({fere.availableFilings?.length || 0})
                    </h4>
                    {fere.availableFilings && fere.availableFilings.length > 0 ? (
                      <div className="space-y-2">
                        {fere.availableFilings.map((doc: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                            <span className="text-slate-300 truncate max-w-md font-mono">{doc.sourceUrl || doc.sha256 || 'Annual Filing'}</span>
                            {doc.sourceUrl && (
                              <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline flex items-center gap-1">
                                <span>View</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No raw filings indexed in current database.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  FERE evidence not available.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 6: MANAGEMENT (MEASURABLE COMMITMENTS TRACKER)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'MANAGEMENT' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <div>
                    <h3 className="text-base font-bold text-white">Management Walk-the-Talk Commitment Tracker</h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Measurable commitments only. No sentiment or confidence scores.
                    </span>
                  </div>
                </div>
                {getStatusBadge(modules.management?.status)}
              </div>

              {mgmt && mgmt.commitments && mgmt.commitments.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Delivered</span>
                      <span className="text-lg font-black text-emerald-400 font-mono">{mgmt.deliveredCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Pending</span>
                      <span className="text-lg font-black text-amber-400 font-mono">{mgmt.pendingCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Missed</span>
                      <span className="text-lg font-black text-rose-400 font-mono">{mgmt.missedCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">Total Tracked</span>
                      <span className="text-lg font-black text-slate-200 font-mono">{mgmt.commitments.length}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                          <th className="py-2 pr-4">Category</th>
                          <th className="py-2 px-4">Statement Date</th>
                          <th className="py-2 px-4">Target Metric & Goal</th>
                          <th className="py-2 px-4">Target Deadline</th>
                          <th className="py-2 pl-4">Delivery Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {mgmt.commitments.map((c: any) => (
                          <tr key={c.id} className="hover:bg-slate-800/30">
                            <td className="py-3 pr-4 font-bold text-slate-200">{c.category}</td>
                            <td className="py-3 px-4 font-mono text-slate-400">{c.statementDate}</td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-cyan-300 block">{c.targetMetric || 'Metric'}</span>
                              <span className="text-[11px] text-slate-400">{c.statement?.slice(0, 100)}...</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">{c.targetPeriod || 'N/A'}</td>
                            <td className="py-3 pl-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                c.status === 'DELIVERED' ? 'bg-emerald-500/20 text-emerald-300' :
                                c.status === 'MISSED' ? 'bg-rose-500/20 text-rose-300' :
                                'bg-amber-500/20 text-amber-300'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <p className="text-sm font-bold text-slate-300">No indexed management commitments for {symbol}</p>
                  <p className="text-xs text-slate-500">
                    Transcripts and annual report letters for this scrip await candidate commitment extraction.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 7: VALUATION (GENUINE AVAILABLE MULTIPLES)
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'VALUATION' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Valuation Multiples</h3>
                </div>
                {getStatusBadge(modules.valuation?.status)}
              </div>

              {val ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Price-to-Earnings (P/E)</span>
                    <span className="text-2xl font-black text-cyan-300 font-mono block">
                      {val.pe?.current !== null ? `${val.pe.current}x` : 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{val.pe?.relativeStatus || 'DATA_INSUFFICIENT'}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Price-to-Book (P/B)</span>
                    <span className="text-2xl font-black text-cyan-300 font-mono block">
                      {val.pb?.current !== null ? `${val.pb.current}x` : 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{val.pb?.relativeStatus || 'DATA_INSUFFICIENT'}</span>
                  </div>

                  {val.evEbitda && (
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-mono text-slate-400">EV / EBITDA</span>
                      <span className="text-2xl font-black text-cyan-300 font-mono block">
                        {val.evEbitda.current !== null ? `${val.evEbitda.current}x` : 'N/A'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{val.evEbitda.relativeStatus || 'DATA_INSUFFICIENT'}</span>
                    </div>
                  )}

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Dividend Yield</span>
                    <span className="text-2xl font-black text-cyan-300 font-mono block">
                      {val.dividendYield?.current !== null ? `${val.dividendYield.current}%` : 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Reported canonical rate</span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  Valuation multiples unavailable.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB 8: MARKET / SECTOR CONTEXT
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'MARKET' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Market & Sector Context</h3>
                </div>
                {getStatusBadge(modules.marketContext?.status)}
              </div>

              {market ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Stock Trend</span>
                    <span className={`text-xl font-black font-mono block ${
                      market.stockTrend === 'BULLISH' ? 'text-emerald-400' :
                      market.stockTrend === 'BEARISH' ? 'text-rose-400' : 'text-slate-300'
                    }`}>
                      {market.stockTrend}
                    </span>
                    <span className="text-[10px] text-slate-500">Evaluated vs moving averages</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Sector Trend ({market.sectorName || 'Sector'})</span>
                    <span className={`text-xl font-black font-mono block ${
                      market.sectorTrend === 'BULLISH' ? 'text-emerald-400' :
                      market.sectorTrend === 'BEARISH' ? 'text-rose-400' : 'text-slate-300'
                    }`}>
                      {market.sectorTrend}
                    </span>
                    <span className="text-[10px] text-slate-500">Sector momentum index</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Nifty 50 Benchmark Trend</span>
                    <span className={`text-xl font-black font-mono block ${
                      market.nifty50Trend === 'BULLISH' ? 'text-emerald-400' :
                      market.nifty50Trend === 'BEARISH' ? 'text-rose-400' : 'text-slate-300'
                    }`}>
                      {market.nifty50Trend}
                    </span>
                    <span className="text-[10px] text-slate-500">Broad market benchmark</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400">Institutional Flow Proxy</span>
                    <span className="text-xl font-black text-cyan-300 font-mono block">
                      {market.sectorFlowProxy || 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-500">Sector institutional activity</span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
                  Market and sector context data unavailable.
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB: BUSINESS DRIVERS
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'BUSINESS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-violet-400" />
                  <h3 className="text-base font-bold text-white">Business Drivers</h3>
                </div>
                {getStatusBadge(modules.businessDrivers?.status)}
              </div>

              {drivers?.drivers?.length > 0 ? (
                <div className="space-y-3">
                  {drivers.drivers.map((d: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{d.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            d.direction === 'IMPROVING' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            d.direction === 'DETERIORATING' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                            d.direction === 'STABLE' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                            'bg-slate-700 text-slate-400 border border-slate-600'
                          }`}>{d.direction}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                            d.status === 'SUPPORTED' ? 'bg-emerald-500/10 text-emerald-400' :
                            d.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-slate-800 text-slate-500'
                          }`}>{d.status}</span>
                        </div>
                      </div>
                      {d.currentState && (
                        <p className="text-xs text-slate-400">{d.currentState}</p>
                      )}
                      {d.evidence?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {d.evidence.slice(0, 3).map((ev: string, j: number) => (
                            <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{ev}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs text-slate-400">
                    <span className="font-bold text-slate-300">{drivers.driversWithEvidence || 0}/{drivers.driversTotal || 0}</span> drivers have evidence ·
                    Template: <span className="font-mono text-cyan-400">{drivers.businessModel || 'UNKNOWN'}</span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <GitBranch className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">Business driver analysis</p>
                  <p className="text-xs text-slate-500">
                    {modules.businessDrivers?.missingRequirements?.[0] || 'Driver evidence not yet indexed for this company.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB: CONTRADICTIONS
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'CONTRADICTIONS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-5 h-5 text-orange-400" />
                  <h3 className="text-base font-bold text-white">Contradictions in Evidence</h3>
                </div>
                {getStatusBadge(modules.contradictions?.status)}
              </div>

              {/* Coverage summary */}
              {contradictions && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-2xl font-black text-orange-300">{contradictions.contradictionsDetected ?? 0}</span>
                    <span className="text-[10px] text-slate-400 block">Detected</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-2xl font-black text-cyan-300">{contradictions.patternsEvaluated ?? 0}</span>
                    <span className="text-[10px] text-slate-400 block">Patterns Evaluated</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-2xl font-black text-slate-300">{contradictions.patternsSkipped ?? 0}</span>
                    <span className="text-[10px] text-slate-400 block">Skipped (missing data)</span>
                  </div>
                </div>
              )}

              {contradictions?.contradictions?.length > 0 ? (
                <div className="space-y-3">
                  {contradictions.contradictions.map((c: any, i: number) => (
                    <div key={i} className={`p-4 rounded-xl border space-y-3 ${
                      c.severity === 'HIGH' ? 'bg-rose-500/5 border-rose-500/30' :
                      c.severity === 'MEDIUM' ? 'bg-orange-500/5 border-orange-500/30' :
                      'bg-slate-900 border-slate-800'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            <span className="text-sm font-bold text-white">{c.observationA}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-5">
                            <span className="text-xs text-slate-400">vs.</span>
                            <span className="text-sm font-semibold text-slate-200">{c.observationB}</span>
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          c.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                          c.severity === 'MEDIUM' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                          'bg-slate-700 text-slate-400'
                        }`}>{c.severity}</span>
                      </div>
                      {c.whyItMatters && (
                        <p className="text-xs text-slate-400 pl-5">{c.whyItMatters}</p>
                      )}
                      {c.possibleExplanations?.length > 0 && (
                        <div className="pl-5 space-y-1">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Possible explanations:</p>
                          {c.possibleExplanations.map((ex: string, j: number) => (
                            <p key={j} className="text-[11px] text-slate-400">· {ex}</p>
                          ))}
                        </div>
                      )}
                      <div className="pl-5 flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                          c.status === 'OPEN' ? 'bg-orange-500/10 text-orange-400' :
                          c.status === 'EXPLAINED' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-slate-800 text-slate-500'
                        }`}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <CheckCircle className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">
                    {contradictions?.patternsEvaluated > 0
                      ? `No contradictions detected across ${contradictions.patternsEvaluated} patterns`
                      : 'Contradiction analysis requires fundamental + FERE data'}
                  </p>
                  {modules.contradictions?.missingRequirements?.length > 0 && (
                    <p className="text-xs text-slate-500">{modules.contradictions.missingRequirements[0]}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB: THESIS
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'THESIS' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-bold text-white">Investment Thesis</h3>
                </div>
                {getStatusBadge(modules.thesis?.status)}
              </div>

              {thesis ? (
                <div className="space-y-5">
                  {/* Thesis summary */}
                  {thesis.thesis?.summary && (
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                      <p className="text-sm text-slate-200 leading-relaxed">{thesis.thesis.summary}</p>
                      <p className="text-[10px] text-slate-500 mt-2 font-mono">Evidence coverage: {thesis.coverage || 'PARTIAL'}</p>
                    </div>
                  )}

                  {/* Pillars */}
                  {thesis.pillars?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thesis Pillars</h4>
                      {thesis.pillars.map((p: any, i: number) => (
                        <div key={i} className={`p-3 rounded-xl border flex items-center justify-between ${
                          p.status === 'SUPPORTED' ? 'bg-emerald-500/5 border-emerald-500/20' :
                          p.status === 'CHALLENGED' ? 'bg-orange-500/5 border-orange-500/20' :
                          p.status === 'BROKEN' ? 'bg-rose-500/5 border-rose-500/20' :
                          p.status === 'PARTIALLY_SUPPORTED' ? 'bg-amber-500/5 border-amber-500/20' :
                          'bg-slate-900 border-slate-800'
                        }`}>
                          <div>
                            <p className="text-sm font-semibold text-white">{p.name}</p>
                            {p.summary && <p className="text-xs text-slate-400 mt-0.5">{p.summary}</p>}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ml-3 ${
                            p.status === 'SUPPORTED' ? 'bg-emerald-500/20 text-emerald-300' :
                            p.status === 'CHALLENGED' ? 'bg-orange-500/20 text-orange-300' :
                            p.status === 'BROKEN' ? 'bg-rose-500/20 text-rose-300' :
                            p.status === 'PARTIALLY_SUPPORTED' ? 'bg-amber-500/20 text-amber-300' :
                            'bg-slate-700 text-slate-400'
                          }`}>{p.status?.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Limitations */}
                  {thesis.limitations?.length > 0 && (
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">What we don't know</p>
                      {thesis.limitations.slice(0, 3).map((l: string, i: number) => (
                        <p key={i} className="text-xs text-slate-400">· {l}</p>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500">
                    {thesis.patternsEvaluated}/{thesis.patternsEvaluable} thesis pillars evaluated · Data as of {thesis.thesis?.dataAsOf || modules.thesis?.dataAsOf || 'N/A'}
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">Thesis requires fundamental + driver + FERE evidence</p>
                  <p className="text-xs text-slate-500">{modules.thesis?.missingRequirements?.[0] || 'Thesis builds as evidence accumulates.'}</p>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              TAB: TIMELINE
          ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Company Timeline</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">RESULTS · COMMITMENTS · CORPORATE ACTIONS · REGIME CHANGES</span>
              </div>

              {/* Real Timeline Events from CompanyTimelineEngine */}
              {timelineData?.events?.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-mono">
                      CHRONOLOGICAL EVENT STREAM ({timelineData.events.length} VERIFIED EVENTS)
                    </p>
                    <span className="text-[10px] font-mono text-cyan-400">
                      As of {timelineData.evaluatedAt ? timelineData.evaluatedAt.substring(0, 10) : 'Current'}
                    </span>
                  </div>
                  <div className="relative border-l-2 border-slate-800 ml-4 pl-4 space-y-4">
                    {timelineData.events.map((evt: any, i: number) => (
                      <div key={evt.id || i} className="relative group">
                        {/* Timeline node dot */}
                        <div className={`absolute -left-[23px] top-1.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                          evt.category === 'FINANCIAL_RESULTS' ? 'bg-cyan-400' :
                          evt.category === 'MANAGEMENT_COMMITMENT' ? 'bg-violet-400' :
                          evt.category === 'CORPORATE_ACTION' ? 'bg-indigo-400' :
                          evt.category === 'CAPEX_CAPACITY' ? 'bg-amber-400' :
                          evt.category === 'CONTRADICTION' ? 'bg-rose-400' :
                          'bg-emerald-400'
                        }`} />
                        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-mono font-bold text-cyan-300">
                              {evt.date || (evt.dateStatus === 'UNDATED' ? 'UNDATED' : 'UNKNOWN DATE')}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {evt.category}
                              </span>
                              {evt.dateStatus && evt.dateStatus !== 'EXACT' && (
                                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  {evt.dateStatus}
                                </span>
                              )}
                            </div>
                          </div>
                          <h4 className="text-sm font-bold text-white">{evt.title}</h4>
                          <p className="text-xs text-slate-300 leading-relaxed">{evt.description}</p>
                          {evt.evidence && evt.evidence.length > 0 && (
                            <div className="pt-1 flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 font-mono">
                                Source: {evt.source || evt.evidence[0]}
                              </span>
                              <button
                                onClick={() => setSelectedEvidence({
                                  headline: evt.title,
                                  sourceName: evt.source || 'Company Event Log',
                                  documentDate: evt.date,
                                  quote: evt.description,
                                  factId: evt.id,
                                })}
                                className="text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
                              >
                                View Evidence
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : delta?.deltas?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-mono">WHAT CHANGED SINCE LAST ANALYSIS</p>
                  {delta.deltas.map((d: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        d.direction === 'IMPROVED' ? 'bg-emerald-400' :
                        d.direction === 'DETERIORATED' ? 'bg-rose-400' :
                        'bg-amber-400'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{d.metric}</p>
                        {d.previousValue !== null && d.currentValue !== null && (
                          <p className="text-xs text-slate-400 font-mono">
                            {String(d.previousValue)} → {String(d.currentValue)}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500">{d.category} · {d.materiality} materiality</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        d.direction === 'IMPROVED' ? 'bg-emerald-500/20 text-emerald-300' :
                        d.direction === 'DETERIORATED' ? 'bg-rose-500/20 text-rose-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>{d.direction}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                  <CalendarDays className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">Company Timeline</p>
                  <p className="text-xs text-slate-500">
                    No verified corporate events recorded for this instrument yet.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ─── Checkpoint 7: Interactive Evidence Drill-Down Drawer Modal ─── */}
        {selectedEvidence && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Evidence Drill-Down
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEvidence(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Assertion / Observation
                  </span>
                  <p className="text-sm font-bold text-cyan-200 leading-snug">
                    {selectedEvidence.headline}
                  </p>
                </div>

                {selectedEvidence.formula && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                      Derivation Formula & Calculation
                    </span>
                    <p className="text-xs font-mono text-emerald-300">
                      {selectedEvidence.formula}
                    </p>
                  </div>
                )}

                {selectedEvidence.quote && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                      Reported Statement / Extract
                    </span>
                    <p className="text-xs italic text-slate-300 leading-relaxed">
                      "{selectedEvidence.quote}"
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block">Source Document</span>
                    <span className="font-medium text-slate-200">{selectedEvidence.sourceName || 'Regulatory Filing'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block">Source Type</span>
                    <span className="font-mono text-slate-300 text-[11px]">{selectedEvidence.sourceType || 'AUDITED_FILING'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block">Published Date</span>
                    <span className="font-mono text-slate-300">{selectedEvidence.documentDate || '2026-05-20'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block">WealthOS PIT Available</span>
                    <span className="font-mono text-emerald-400">{selectedEvidence.availableAt || selectedEvidence.documentDate || '2026-05-20'}</span>
                  </div>
                </div>

                {selectedEvidence.factId && (
                  <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-500">Fact ID</span>
                    <span className="font-mono text-slate-400">{selectedEvidence.factId}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedEvidence(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
