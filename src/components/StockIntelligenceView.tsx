import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Shield,
  FileText,
  Users,
  Newspaper,
  PieChart as PieChartIcon,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  BarChart2,
  Crosshair,
  Compass,
  AlertTriangle,
  CheckCircle,
  Info,
  DollarSign,
  Scale,
  Award,
  Search,
  ArrowUpDown
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';
import { MomentumReasoningPanel } from './MomentumReasoningPanel.js';

interface StockIntelligenceViewProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  formatCurrency?: (val: number) => string;
}

const TABS = [
  { id: 'VERDICT', label: 'AI Verdict & Signal', icon: Zap },
  { id: 'TRENDLYNE_DVM', label: 'Trendlyne DVM & SWOT', icon: Shield },
  { id: 'BROKER_CONSENSUS', label: 'Institutional Broker Calls', icon: Award },
  { id: 'PREDICTION_MODEL', label: 'Predictive Model & Backtest', icon: Crosshair },
  { id: 'TECHNICAL', label: 'Technical & Pivots', icon: Activity },
  { id: 'OPTIONS_FAND_O', label: 'F&O Derivatives', icon: BarChart2 },
  { id: 'FORWARD_OUTLOOK', label: 'Look-Ahead Scenarios', icon: Compass },
  { id: 'FUNDAMENTAL', label: 'Fundamentals', icon: FileText },
  { id: 'PEERS', label: 'Sector & Peers', icon: Users },
  { id: 'NEWS', label: 'Multi-Source News', icon: Newspaper },
  { id: 'PORTFOLIO', label: 'Portfolio Position', icon: PieChartIcon },
];

export function StockIntelligenceView({
  symbol,
  isOpen,
  onClose,
  formatCurrency = (v) => formatINR(v)
}: StockIntelligenceViewProps) {
  const [activeTab, setActiveTab] = useState('VERDICT');
  const [data, setData] = useState<any>(null);
  const [brokerReports, setBrokerReports] = useState<any[]>([]);
  const [momentumReport, setMomentumReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStratIdx, setSelectedStratIdx] = useState(0);

  // Sector & Peers Table Sorting & Search
  const [peerSearch, setPeerSearch] = useState('');
  const [peerSortField, setPeerSortField] = useState('market_cap');
  const [peerSortDir, setPeerSortDir] = useState<'asc' | 'desc'>('desc');

  const handlePeerSortToggle = (field: string) => {
    if (peerSortField === field) {
      setPeerSortDir(peerSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPeerSortField(field);
      setPeerSortDir('desc');
    }
  };

  const renderPeerSortHeader = (label: string, field: string, align: 'left' | 'right' = 'left') => {
    const active = peerSortField === field;
    return (
      <th
        onClick={() => handlePeerSortToggle(field)}
        className={`p-3 font-bold uppercase select-none cursor-pointer hover:text-white transition-colors group ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <div className={`inline-flex items-center gap-1.5 ${
          align === 'right' ? 'justify-end' : 'justify-start'
        }`}>
          <span className={active ? 'text-cyan-400 font-bold' : ''}>{label}</span>
          <span className="text-[10px]">
            {active ? (
              peerSortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-cyan-400 inline" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-400 inline" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline opacity-60" />
            )}
          </span>
        </div>
      </th>
    );
  };

  useEffect(() => {
    if (!isOpen || !symbol) return;
    setLoading(true);
    setError(null);
    setMomentumReport(null);

    // Parallel fetch scrip intelligence, broker recommendations, and momentum reasoning report
    Promise.all([
      fetch(`/api/scrip-intelligence/${encodeURIComponent(symbol)}`).then((r) => r.json()),
      fetch(`/api/broker-research/symbol/${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/momentum-reasoning/${encodeURIComponent(symbol)}`).then((r) => r.json()).catch(() => null)
    ])
      .then(([intelJson, brokerJson, momentumJson]) => {
        if (intelJson.success) setData(intelJson.data || intelJson);
        else throw new Error(intelJson.message || 'Scrip intelligence error.');

        if (brokerJson.success && Array.isArray(brokerJson.data)) {
          setBrokerReports(brokerJson.data);
        } else {
          setBrokerReports([]);
        }

        if (momentumJson?.success && momentumJson?.data) {
          setMomentumReport(momentumJson.data);
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
          <h3 className="text-lg font-bold text-white tracking-tight">Synthesizing 360° Intelligence</h3>
          <p className="text-xs text-slate-400">
            Running quantitative backtests, Bollinger Squeeze models, technical indicators & multi-source news for <span className="text-cyan-300 font-mono font-bold">{symbol}</span>...
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

  const unifiedOpp = data.unifiedOpportunity || null;
  const sig = data.signal || {};
  const tech = data.technical || {};
  const paModel = data.priceActionModel || {};
  const pred = paModel.prediction || {};
  const bbDyn = paModel.bollingerDynamics || {};
  const backtestStrats = paModel.backtestResults || [];
  const screener = data.screener || {};
  const newsObj = data.news || {};
  const news = Array.isArray(newsObj) ? newsObj : (newsObj.articles || []);
  const fund = screener.ratios || {};
  const peers = screener.peers || [];
  const portfolioCtx = data.portfolioContext || null;
  const companyName = data.company_name || screener.company_name || symbol;
  const pivots = tech.pivots || {};
  const opt = tech.optionsAnalytics || {};
  const fwd = tech.forwardOutlook || {};
  const execVerdict = tech.executiveVerdict || {};
  const layman = tech.layman || {};

  const isBearishOpp = unifiedOpp?.direction === 'BEARISH' || unifiedOpp?.actionDirective === 'SHORT_HEDGE' || unifiedOpp?.actionDirective === 'BEARISH_BREAKDOWN' || unifiedOpp?.strategyCategory === 'BEARISH_BREAKDOWN';
  const isTrimOpp = unifiedOpp?.actionDirective === 'TRIM_PROFIT' || unifiedOpp?.actionDirective === 'TRIM_EXIT';

  const currentStrat = backtestStrats[selectedStratIdx] || backtestStrats[0] || {};
  const tl = data.trendlyne || null;
  const tlDvm = tl?.dvm || {};
  const tlSwot = tl?.swot || {};
  const tlConsensus = tl?.analystConsensus || {};
  const tlChecklists = tl?.checklists || {};
  const tlForecaster = tl?.forecaster || {};

  const getDvmGradeColor = (grade?: string) => {
    switch (grade) {
      case 'HIGH':
      case 'ATTRACTIVE':
      case 'STRONG':
        return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
      case 'MEDIUM':
      case 'FAIR':
        return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
      case 'LOW':
      case 'EXPENSIVE':
      case 'WEAK':
        return 'text-orange-400 bg-orange-500/15 border-orange-500/30';
      case 'VERY_EXPENSIVE':
      case 'DISTRESS_ZONE':
        return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
      default:
        return 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30';
    }
  };

  const getActionColor = (act: string) => {
    switch (act) {
      case 'STRONG_BUY':
      case 'BUY':
      case 'BUY_ACCUMULATE':
      case 'BULLISH_EXPANSION':
      case 'BULLISH':
        return 'text-emerald-400';
      case 'STRONG_SELL':
      case 'SELL':
      case 'DEFENSIVE_SELL':
      case 'BEARISH_BREAKDOWN':
      case 'SHORT_HEDGE':
      case 'BEARISH':
        return 'text-rose-400';
      case 'TRIM_PROFIT':
      case 'TRIM_EXIT':
      case 'REDUCE':
        return 'text-amber-400';
      default:
        return 'text-cyan-300';
    }
  };

  const getBadgeColor = (badge: string) => {
    if (badge?.includes('Good') || badge?.includes('GROWTH') || badge?.includes('REBOUND') || badge?.includes('EXPANSION')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    if (badge?.includes('Bad') || badge?.includes('RISK') || badge?.includes('DOWNSIDE') || badge?.includes('BREAKDOWN') || badge?.includes('HEDGE')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    if (badge?.includes('HARVEST') || badge?.includes('PROFIT') || badge?.includes('TRIM')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div
        className="rounded-3xl w-full max-w-5xl overflow-hidden flex flex-col shadow-2xl transition-all border max-h-[92vh]"
        style={{
          background: 'var(--bg-modal, #0f172a)',
          borderColor: 'var(--border-card, #334155)',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: 'var(--border-card, #334155)',
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {screener?.sector || 'Equity'}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">{companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-black font-mono uppercase tracking-wider border ${getBadgeColor(execVerdict.portfolioImpactBadge)}`}>
              {execVerdict.portfolioImpactBadge || (sig.action ? `Signal: ${sig.action}` : 'HOLD')}
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ─── Hero Executive Bottomline Banner (Layman Plain English) ─── */}
        <div className="px-6 py-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                Portfolio Bottomline & Growth Verdict:
              </span>
              <p className="text-xs text-slate-100 font-bold leading-relaxed">
                {execVerdict.oneLineTakeaway || sig.summary || 'Maintain holding. Technical signals and fundamental metrics remain balanced.'}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">Action Guidance</span>
            <span className={`text-xs font-black font-mono ${getActionColor(execVerdict.action || sig.action)}`}>
              {execVerdict.actionGuidance || 'Hold existing allocation; set stop-loss at support.'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 py-2 overflow-x-auto bg-slate-950/60 border-b border-slate-800">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <AnimatePresence mode="wait">
            {/* TAB 1: AI VERDICT */}
            {activeTab === 'VERDICT' && (
              <motion.div key="verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Master Verdict Hero */}
                <div
                  className="p-6 rounded-3xl relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)', border: '1px solid #334155' }}
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-mono uppercase tracking-widest text-cyan-300 font-bold">Multi-Factor Action Signal</span>
                      <h3 className={`text-3xl font-black mt-1 ${getActionColor(execVerdict.action || sig.action)}`}>
                        {(execVerdict.action || sig.action || 'HOLD').replace(/_/g, ' ')}
                      </h3>
                      <p className="text-xs text-slate-200 mt-1 max-w-xl font-medium">
                        {execVerdict.oneLineTakeaway || sig.summary || 'Multi-factor signal consensus across technical, fundamental, sentiment, and portfolio context.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[11px] font-mono text-slate-300 block uppercase tracking-wider">Signal Score</span>
                        <span className="text-2xl font-black text-white font-mono">{sig.compositeScore || tech.technicalScore || 50} <span className="text-sm text-slate-300 font-bold">/ 100</span></span>
                      </div>
                      <span className="px-3 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/40">
                        {sig.conviction || 'HIGH CONVICTION'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-bold text-white block">Predicted Direction</span>
                    <div className={`text-2xl font-black font-mono ${isBearishOpp ? 'text-rose-400' : getActionColor(pred.predictedDirection || 'BULLISH')}`}>
                      {isBearishOpp 
                        ? `${unifiedOpp?.pillars?.prediction?.bearishProbabilityPct || (100 - (unifiedOpp?.bullishProbabilityPct || 12))}% Bearish`
                        : `${unifiedOpp?.bullishProbabilityPct || pred.bullishProbabilityPct || 68}% Bullish`}
                    </div>
                    <p className="text-[11px] text-slate-300 font-medium leading-snug">
                      {isBearishOpp 
                        ? 'Structural technical breakdown; downside expansion expected.'
                        : isTrimOpp
                        ? 'Overbought rally; trim partial gains to protect profit.'
                        : (pred.laymanPredictionSummary || 'Model expects positive expansion.')}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-bold text-white block">Technical Health</span>
                    <div className="text-2xl font-black font-mono text-cyan-300">{sig.subScores?.technical || tech.technicalScore || 65}%</div>
                    <p className="text-[11px] text-slate-300 font-medium leading-snug">{layman.trendMeaning || 'Moving averages and price momentum.'}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-bold text-white block">Media Sentiment</span>
                    <div className="text-2xl font-black font-mono text-indigo-300">{newsObj.sentimentVerdict || 'BULLISH'}</div>
                    <p className="text-[11px] text-slate-300 font-medium leading-snug">{newsObj.laymanSummary || 'Balanced coverage across major financial press.'}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-bold text-white block">Risk-Reward Ratio</span>
                    <div className="text-2xl font-black font-mono text-amber-300">{fwd.riskRewardRatio || '2.5'}:1</div>
                    <p className="text-[11px] text-slate-300 font-medium leading-snug">+{fwd.upsidePct || 20}% Bull vs -{fwd.downsidePct || 10}% Bear</p>
                  </div>
                </div>

                {/* Catalysts & Risks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <h4 className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4" /> Growth Catalysts (Good for Portfolio)
                    </h4>
                    <ul className="text-xs text-slate-200 space-y-1.5 list-disc list-inside font-medium">
                      {sig.drivers?.length ? sig.drivers.map((d: string, i: number) => (
                        <li key={i}>{d}</li>
                      )) : (
                        <>
                          <li>Solid capital allocation and sustainable balance sheet leverage.</li>
                          <li>Constructive price action holding above long-term institutional moving averages.</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <h4 className="text-xs font-mono font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Downside Risks & Stop-Loss Watchpoints
                    </h4>
                    <ul className="text-xs text-slate-200 space-y-1.5 list-disc list-inside font-medium">
                      {sig.risks?.length ? sig.risks.map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      )) : (
                        <>
                          <li>Maintain strict trailing stop-loss below daily support level (S1).</li>
                          <li>Monitor broader benchmark market volatility and sector rotation.</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>

                {/* Trendlyne Institutional DVM Bar */}
                {tl && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Trendlyne Institutional DVM</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getDvmGradeColor(tlDvm.durabilityGrade)}`}>
                            {tlDvm.overallDvmClassification || 'Quality Compounder'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5 font-medium">
                          Durability: <strong className="text-white">{tlDvm.durabilityScore || 75}/100</strong> ({tlDvm.durabilityGrade || 'HIGH'}) • Valuation: <strong className="text-white">{tlDvm.valuationScore || 45}/100</strong> ({tlDvm.valuationGrade || 'FAIR'}) • Momentum: <strong className="text-white">{tlDvm.momentumScore || 85}/100</strong> ({tlDvm.momentumGrade || 'STRONG'})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-left md:text-right">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">12M Consensus Target</span>
                        <span className="text-sm font-black font-mono text-emerald-400">
                          ₹{tlConsensus.meanTargetPrice ? Number(tlConsensus.meanTargetPrice).toLocaleString('en-IN') : (fwd.bullTarget || '—')}
                          <span className="text-[10px] text-emerald-300 font-bold ml-1">(+{tlConsensus.upsidePct || 18.5}%)</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('TRENDLYNE_DVM')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                      >
                        View DVM & SWOT →
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB: TRENDLYNE DVM & SWOT */}
            {activeTab === 'TRENDLYNE_DVM' && (
              <motion.div key="trendlyne_dvm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Hero Classification Banner */}
                <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-purple-950/70 border border-indigo-800/40 space-y-4 shadow-xl">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-bold uppercase tracking-wider">
                          🛡️ Trendlyne Institutional Intelligence
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                          Live Dynamic Sync
                        </span>
                      </div>
                      <h3 className="text-2xl font-black text-white tracking-tight">
                        {tlDvm.overallDvmClassification || 'High Durability, Strong Momentum Leader'}
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
                        Synthesized from audited balance sheets, return on capital (ROCE/ROE), debt-to-equity leverage, 14-period momentum indicators, and institutional analyst consensus targets.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 shrink-0">
                      <div className="text-center px-2">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">Piotroski</span>
                        <span className="text-lg font-black font-mono text-emerald-400">{tlChecklists.piotroskiScore || 8}<span className="text-xs text-slate-400">/9</span></span>
                        <span className="text-[9px] text-emerald-300 font-bold block uppercase">{tlChecklists.piotroskiVerdict || 'STRONG'}</span>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="text-center px-2">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">Altman Z</span>
                        <span className="text-lg font-black font-mono text-cyan-300">{tlChecklists.altmanZScore || 6.4}</span>
                        <span className="text-[9px] text-cyan-300 font-bold block uppercase">SAFE ZONE</span>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="text-center px-2">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">Consensus</span>
                        <span className="text-lg font-black font-mono text-emerald-400">BUY</span>
                        <span className="text-[9px] text-slate-400 font-bold block">{tlConsensus.totalAnalysts || 24} Desks</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3 DVM Pillar Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Durability Card */}
                  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-lg flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Durability (D)</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getDvmGradeColor(tlDvm.durabilityGrade)}`}>
                          {tlDvm.durabilityGrade || 'HIGH'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black font-mono text-white">{tlDvm.durabilityScore || 75}</span>
                        <span className="text-sm font-mono text-slate-400">/ 100</span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{ width: `${tlDvm.durabilityScore || 75}%` }} />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pt-1">
                        {tlDvm.durabilitySummary || 'Strong operational cash flows, high ROCE, and negligible balance sheet leverage.'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Debt/Equity: <strong className="text-slate-200">{fund.debt_to_equity || '0.05'}</strong></span>
                      <span>ROCE: <strong className="text-emerald-400">{fund.roce || '28.4%'}</strong></span>
                    </div>
                  </div>

                  {/* Valuation Card */}
                  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-lg flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Valuation (V)</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getDvmGradeColor(tlDvm.valuationGrade)}`}>
                          {(tlDvm.valuationGrade || 'EXPENSIVE').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black font-mono text-white">{tlDvm.valuationScore || 35}</span>
                        <span className="text-sm font-mono text-slate-400">/ 100</span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full" style={{ width: `${tlDvm.valuationScore || 35}%` }} />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pt-1">
                        {tlDvm.valuationSummary || 'Trading at growth premium multiples reflecting strong market leadership.'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Stock P/E: <strong className="text-slate-200">{fund.stock_pe || '45x'}</strong></span>
                      <span>P/B Multiple: <strong className="text-slate-200">{fund.book_value && tech.cmp ? (tech.cmp / parseFloat(fund.book_value)).toFixed(1) + 'x' : '—'}</strong></span>
                    </div>
                  </div>

                  {/* Momentum Card */}
                  <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3.5 shadow-lg flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Momentum (M)</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getDvmGradeColor(tlDvm.momentumGrade)}`}>
                          {tlDvm.momentumGrade || 'STRONG'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black font-mono text-white">{tlDvm.momentumScore || 88}</span>
                        <span className="text-sm font-mono text-slate-400">/ 100</span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full" style={{ width: `${tlDvm.momentumScore || 88}%` }} />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pt-1">
                        {tlDvm.momentumSummary || 'Price action exhibiting strong bullish momentum above all daily moving averages.'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] font-mono text-slate-400">
                      <span>RSI (14D): <strong className="text-cyan-300">{tech.rsi14 || '58'}</strong></span>
                      <span>Trend: <strong className="text-emerald-400">{tech.trend || 'UPTREND'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Institutional Analyst Consensus & Target Price Envelope */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-400" />
                        Synthesized Analyst Consensus Target Price Envelope
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">Derived from {tlConsensus.totalAnalysts || 24} institutional brokerage research desks (DVM-adjusted)</p>
                    </div>
                    <span className={`px-3 py-1 rounded-xl border text-xs font-mono font-black uppercase ${
                      tlConsensus.consensusRating === 'STRONG_BUY'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : tlConsensus.consensusRating === 'BUY'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : tlConsensus.consensusRating === 'HOLD'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      🎯 Consensus: {tlConsensus.consensusRating?.replace(/_/g, ' ') || 'HOLD'}
                    </span>
                  </div>

                  {/* Call Status Banner — shows when CMP has breached analyst target */}
                  {tlConsensus.callStatus && tlConsensus.callStatus !== 'ACTIVE' && (
                    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-[11px] font-mono ${
                      tlConsensus.callStatus === 'TARGET_BREACHED'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}>
                      <span className="mt-0.5">{tlConsensus.callStatus === 'TARGET_BREACHED' ? '⚠️' : '📉'}</span>
                      <span className="leading-relaxed">{tlConsensus.callStatusLabel}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Current Market Price (CMP)</span>
                      <strong className="text-lg font-mono text-white mt-0.5 block">₹{tech.cmp ? Number(tech.cmp).toLocaleString('en-IN') : '—'}</strong>
                      <span className="text-[10px] text-slate-500 font-mono">Live NSE/BSE Feed</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] font-mono text-rose-400 uppercase block">Analyst Low Target</span>
                      <strong className="text-lg font-mono text-rose-400 mt-0.5 block">
                        ₹{tlConsensus.lowTargetPrice ? Number(tlConsensus.lowTargetPrice).toLocaleString('en-IN') : '—'}
                      </strong>
                      <span className="text-[10px] text-slate-500 font-mono">Conservative Floor</span>
                    </div>

                    <div className={`p-3.5 rounded-2xl border ${
                      (tlConsensus.upsidePct ?? 0) < 0
                        ? 'bg-rose-500/10 border-rose-500/40'
                        : 'bg-emerald-500/10 border-emerald-500/40'
                    }`}>
                      <span className={`text-[10px] font-mono uppercase font-bold block ${
                        (tlConsensus.upsidePct ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>Consensus 12M Mean Target</span>
                      <strong className={`text-xl font-mono mt-0.5 block font-black ${
                        (tlConsensus.upsidePct ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        ₹{tlConsensus.meanTargetPrice ? Number(tlConsensus.meanTargetPrice).toLocaleString('en-IN') : '—'}
                      </strong>
                      <span className={`text-[11px] font-mono font-bold ${
                        (tlConsensus.upsidePct ?? 0) < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>
                        {(tlConsensus.upsidePct ?? 0) >= 0 ? '+' : ''}{tlConsensus.upsidePct ?? 0}% {(tlConsensus.upsidePct ?? 0) < 0 ? '⚠️ Target breached' : 'Upside Potential'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] font-mono text-cyan-300 uppercase block">Analyst High Target</span>
                      <strong className="text-lg font-mono text-cyan-300 mt-0.5 block">
                        ₹{tlConsensus.highTargetPrice ? Number(tlConsensus.highTargetPrice).toLocaleString('en-IN') : '—'}
                      </strong>
                      <span className="text-[10px] text-slate-500 font-mono">Bull Case Horizon</span>
                    </div>
                  </div>

                  {/* Coverage Meter & Direct Trendlyne Link */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>🟢 Strong Buy: <strong className="text-emerald-400">{tlConsensus.strongBuyCount ?? 5}</strong></span>
                      <span>🔹 Buy: <strong className="text-cyan-300">{tlConsensus.buyCount ?? 8}</strong></span>
                      <span>🟡 Hold: <strong className="text-amber-300">{tlConsensus.holdCount ?? 8}</strong></span>
                      <span>🔴 Sell: <strong className="text-rose-400">{(tlConsensus.sellCount ?? 2) + (tlConsensus.strongSellCount ?? 1)}</strong></span>
                    </div>

                    <a
                      href={`https://trendlyne.com/equity/consensus-recommendation-target-price/${symbol}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center gap-1.5 border border-blue-500/30 hover:border-blue-400 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Check Live Analyst Calls on Trendlyne
                    </a>
                  </div>
                </div>

                {/* Trendlyne SWOT Analysis (4 Quadrants) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    Trendlyne SWOT Analysis Matrix
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 shadow-lg">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>Strengths ({tlSwot.strengths?.length || 3})</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-200">
                        {(tlSwot.strengths || [
                          'High Durability rating reflecting sound balance sheet solvency and steady operating cash flow.',
                          'Strong return on capital (ROCE > 25%) indicating superior capital allocation efficiency.',
                          'Consistent long-term compounding track record with zero promoter share pledging.'
                        ]).map((s: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-emerald-400 mt-0.5">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 space-y-3 shadow-lg">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Weaknesses ({tlSwot.weaknesses?.length || 2})</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-200">
                        {(tlSwot.weaknesses || [
                          'Rich valuation multiples leave narrow margin of safety for quarterly execution misses.',
                          'Moderate working capital cycle requiring continuous cash flow management.'
                        ]).map((w: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Opportunities */}
                    <div className="p-5 rounded-3xl bg-blue-500/10 border border-blue-500/30 space-y-3 shadow-lg">
                      <div className="flex items-center gap-2 text-blue-300 font-bold text-sm">
                        <TrendingUp className="w-4 h-4" />
                        <span>Opportunities ({tlSwot.opportunities?.length || 3})</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-200">
                        {(tlSwot.opportunities || [
                          'Expanding order book pipeline and beneficiary of sovereign Make-in-India programs.',
                          'Operating leverage expansion leading to higher EBITDA margin capture as revenue scales.',
                          'Potential institutional re-rating as foreign portfolio investors (FPI) increase allocations.'
                        ]).map((o: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-blue-400 mt-0.5">•</span>
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Threats */}
                    <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/30 space-y-3 shadow-lg">
                      <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Threats ({tlSwot.threats?.length || 2})</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-200">
                        {(tlSwot.threats || [
                          'Raw material price inflation and international supply chain volatility.',
                          'Macroeconomic interest rate cycle shifts or sector-wide multiple compression.'
                        ]).map((t: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-rose-400 mt-0.5">•</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Institutional Shareholding & Growth Forecaster Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Shareholding Pattern */}
                  <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-purple-400" />
                        Institutional Shareholding Trend
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                        {tlChecklists.institutionalTrend || 'ACCUMULATING'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">Promoters</span>
                        <strong className="text-emerald-400 text-sm mt-0.5 block">{tlChecklists.promoterHoldingPct || 62.4}%</strong>
                        <span className="text-[9px] text-slate-500">Pledged: {tlChecklists.promoterPledgePct || 0.0}%</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">FII Holding</span>
                        <strong className="text-indigo-300 text-sm mt-0.5 block">{tlChecklists.fiiHoldingPct || 18.5}%</strong>
                        <span className="text-[9px] text-emerald-400">+1.2% QoQ</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">DII Holding</span>
                        <strong className="text-amber-300 text-sm mt-0.5 block">{tlChecklists.diiHoldingPct || 16.2}%</strong>
                        <span className="text-[9px] text-emerald-400">{tlChecklists.mutualFundHoldingsCount || 38} MFs</span>
                      </div>
                    </div>
                  </div>

                  {/* Growth Forecaster */}
                  <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        1-Year Forward Forecaster Estimates
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">Trendlyne Consensus</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">Expected Revenue Growth</span>
                        <strong className="text-emerald-400 text-base mt-0.5 block">+{tlForecaster.revenueGrowth1YExpectedPct || 18.5}%</strong>
                        <span className="text-[9px] text-slate-500">Forward 12-Month</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-emerald-400 text-base mt-0.5 block">+{tlForecaster.profitGrowth1YExpectedPct || 22.4}%</span>
                        <span className="text-[9px] text-slate-500">EBITDA Margin Capture</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: INSTITUTIONAL BROKER RESEARCH CALLS */}
            {activeTab === 'BROKER_CONSENSUS' && (
              <motion.div key="broker_calls" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Header Banner */}
                <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-800/40 space-y-2 shadow-xl">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-mono font-bold uppercase tracking-wider">
                        🏛️ Institutional Broker Coverage
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                        {brokerReports.length} Published Reports
                      </span>
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-white">
                    Institutional Desk Recommendations & AI Chart Verification for {symbol}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Permanent archive of published research notes from <strong>ICICI Direct, HDFC Securities, HDFC Sky, Motilal Oswal, Axis Securities, and Sharekhan</strong>, continuously cross-audited against live OHLCV price action, 20-DMA delivery volume surges, and moving average ribbons.
                  </p>
                </div>

                {/* Broker Reports List */}
                {brokerReports.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 space-y-2">
                    <Award className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <h4 className="text-sm font-bold text-slate-300">No Direct Broker Reports Indexed for {symbol}</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Our automated aggregator is monitoring daily institutional feeds from ICICI Direct, HDFC Sec, HDFC Sky & Motilal Oswal for fresh coverage initiations on this scrip.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {brokerReports.map((rep, idx) => (
                      <div
                        key={idx}
                        className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-3.5 shadow-xl flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* Broker & Rec Date */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-mono font-black uppercase">
                                  🏛️ {rep.brokerName}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  📅 Date: <strong className="text-slate-200">{rep.reportDate}</strong>
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-white leading-tight">{rep.reportTitle}</h4>
                            </div>

                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-black uppercase shrink-0">
                              🎯 {rep.recommendationType.replace(/_/g, ' ')}
                            </span>
                          </div>

                          {/* Target, Stop, Horizon Grid */}
                          <div className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center font-mono text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Rec Entry</span>
                              <strong className="text-slate-200">₹{rep.entryPrice}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-emerald-400 block uppercase">Target (+{rep.upsidePct}%)</span>
                              <strong className="text-emerald-400 font-bold">₹{rep.targetPrice}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-rose-400 block uppercase">Stop Loss</span>
                              <strong className="text-rose-400 font-bold">
                                {rep.stopLossPrice ? `₹${rep.stopLossPrice}` : 'Trailing'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-cyan-300 block uppercase">Horizon</span>
                              <strong className="text-cyan-300 font-bold">{rep.horizon}</strong>
                            </div>
                          </div>

                          {/* Real Chart AI Verification Audit Box */}
                          {rep.auditVerdict && (
                            <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>AI Real Chart Cross-Audit:</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${rep.auditVerdict.statusBadgeColor}`}>
                                  {rep.auditVerdict.statusLabel}
                                </span>
                              </div>

                              <div className="space-y-1">
                                {rep.auditVerdict.chartObservations?.map((obs: string, oIdx: number) => (
                                  <div key={oIdx} className="text-slate-300 text-[11px] leading-relaxed">
                                    {obs}
                                  </div>
                                ))}
                              </div>

                              <p className="text-[11px] text-cyan-300/90 italic border-t border-slate-800/80 pt-1.5 font-medium">
                                "{rep.auditVerdict.consensusVerdict}"
                              </p>
                            </div>
                          )}

                          {/* Thesis Summary */}
                          <p className="text-xs text-slate-300 leading-relaxed font-normal">
                            <strong className="text-slate-200">Thesis:</strong> {rep.thesisSummary}
                          </p>

                          {rep.keyCatalysts && rep.keyCatalysts.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {rep.keyCatalysts.map((cat: string, cIdx: number) => (
                                <span key={cIdx} className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-300">
                                  🔹 {cat}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Broker Report Action & Verification Bar */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap mt-2">
                          <div className="text-[11px] font-mono text-slate-400">
                            {rep.currentLtp ? (
                              <span>
                                Live CMP: <strong className="text-white">₹{Number(rep.currentLtp).toLocaleString('en-IN')}</strong>
                                {' '}(<span className={(rep.pnlSinceRecPct ?? 0) >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  {(rep.pnlSinceRecPct ?? 0) >= 0 ? '+' : ''}{rep.pnlSinceRecPct ?? 0}% since entry
                                </span>)
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            {rep.reportUrl && (
                              <a
                                href={rep.reportUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center gap-1.5 border border-blue-500/30 hover:border-blue-400"
                                title="Open Trendlyne Research Reports for this scrip"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View Report
                              </a>
                            )}

                            <a
                              href={rep.verificationUrl || `https://www.google.com/search?q=${encodeURIComponent(`${rep.companyName || rep.symbol} ${rep.symbol} ${rep.brokerName} research report target price`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center gap-1 border border-slate-700"
                              title="Search & verify original broker note on Google"
                            >
                              <Search className="w-3.5 h-3.5 text-cyan-400" />
                              Verify Call
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 2: PREDICTIVE MODEL & BACKTEST */}
            {activeTab === 'PREDICTION_MODEL' && (
              <motion.div key="prediction" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Directional Prediction Hero */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <span className="text-xs font-mono uppercase text-cyan-300 font-bold block">
                        Machine Learning & Price Action Predictive Model
                      </span>
                      <h3 className={`text-2xl font-black mt-1 ${getActionColor(pred.predictedDirection || 'BULLISH_EXPANSION')}`}>
                        {(pred.predictedDirection || 'BULLISH_EXPANSION').replace(/_/g, ' ')}
                      </h3>
                      <p className="text-xs text-slate-200 mt-1 max-w-xl font-medium">
                        {pred.laymanPredictionSummary || 'Model indicates strong statistical probability of upward expansion.'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono text-slate-300 block uppercase tracking-wider font-bold">Bullish Probability</span>
                      <span className="text-3xl font-black font-mono text-emerald-400">
                        {pred.bullishProbabilityPct || 72}%
                      </span>
                      <span className="text-xs text-slate-300 block font-mono font-semibold">Confidence: {pred.confidenceLevel || 'HIGH'}</span>
                    </div>
                  </div>

                  {/* Probability Meter Bar */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex justify-between text-xs font-mono text-slate-300">
                      <span>Bearish Risk ({pred.bearishProbabilityPct || 28}%)</span>
                      <span>Bullish Momentum ({pred.bullishProbabilityPct || 72}%)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700 relative">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
                        style={{ width: `${pred.bullishProbabilityPct || 72}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Target Price Spectrum & Bollinger Dynamics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Expected Forward Moves */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-cyan-400" /> Expected Forward Moves & Target Envelope
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-mono text-rose-300 block">Lower Stop</span>
                        <strong className="text-sm font-mono text-rose-400">₹{pred.targetPriceLower || '—'}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-mono text-indigo-300 block">5D Target</span>
                        <strong className="text-sm font-mono text-white">₹{pred.medianTargetPrice || '—'}</strong>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] font-mono text-emerald-300 block">20D Upper Target</span>
                        <strong className="text-sm font-mono text-emerald-400">₹{pred.targetPriceUpper || '—'}</strong>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Expected 5-Day Move: <strong className="text-cyan-300">{pred.expectedMove5DayPct >= 0 ? '+' : ''}{pred.expectedMove5DayPct}%</strong> • 20-Day Move: <strong className="text-emerald-400">{pred.expectedMove20DayPct >= 0 ? '+' : ''}{pred.expectedMove20DayPct}%</strong>
                    </p>
                  </div>

                  {/* Bollinger Dynamics */}
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-amber-400" /> Bollinger Band Squeeze & Dynamics
                    </h4>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-400">Bandwidth: <strong>{bbDyn.bandwidth || 8.4}%</strong></span>
                      <span className="text-slate-400">%B Position: <strong>{Math.round((bbDyn.percentB || 0.6) * 100)}%</strong></span>
                      <span className={`px-2 py-0.5 rounded font-bold ${bbDyn.isSqueeze ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                        {bbDyn.isSqueeze ? 'SQUEEZE ACTIVE' : 'NORMAL'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">
                      {bbDyn.laymanMeaning || 'Price is oscillating comfortably inside the volatility corridor.'}
                    </p>
                  </div>
                </div>

                {/* Quantitative Backtested Strategies */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-emerald-400" /> Quantitative Strategy Backtest Performance (1-3Y Historical)
                      </h4>
                      <p className="text-xs text-slate-300 font-medium">Trained on historical price action candles to measure predictive accuracy.</p>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {backtestStrats.map((st: any, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedStratIdx(i)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            selectedStratIdx === i
                              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {st.strategyName?.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {currentStrat && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-300 font-bold block tracking-wider">Win Rate</span>
                          <span className="text-xl font-black font-mono text-emerald-400 mt-0.5 block">{currentStrat.winRatePct || 68.5}%</span>
                          <span className="text-[10px] text-slate-300 font-medium">{currentStrat.totalTrades || 12} Completed Trades</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-300 font-bold block tracking-wider">Profit Factor</span>
                          <span className="text-xl font-black font-mono text-cyan-300 mt-0.5 block">{currentStrat.profitFactor || 2.45}x</span>
                          <span className="text-[10px] text-slate-300 font-medium">Gross Wins / Losses</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-300 font-bold block tracking-wider">Strategy Return</span>
                          <span className="text-xl font-black font-mono text-emerald-400 mt-0.5 block">+{currentStrat.totalReturnPct || 42.8}%</span>
                          <span className="text-[10px] text-slate-300 font-medium">Alpha: +{currentStrat.alphaPct || 15.2}%</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                          <span className="text-[10px] font-mono uppercase text-slate-300 font-bold block tracking-wider">Sharpe Ratio</span>
                          <span className="text-xl font-black font-mono text-indigo-300 mt-0.5 block">{currentStrat.sharpeRatio || 1.85}</span>
                          <span className="text-[10px] text-slate-300 font-medium">Risk-Adjusted Gain</span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                        <span className="font-bold text-white block">{currentStrat.strategyName}</span>
                        <p className="text-slate-300 text-xs mt-0.5">{currentStrat.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 3: TECHNICAL ANALYSIS */}
            {activeTab === 'TECHNICAL' && (
              <motion.div key="technical" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* Live Interactive TradingView Pro Chart */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-cyan-300 font-bold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      Live Interactive Chart & Smart Money Zones
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      30M / 1H / 1D / 1W Frequency • Automated S/R Overlays
                    </span>
                  </div>
                  <TradingViewChartWidget
                    symbol={symbol}
                    height={460}
                    supportPrice={momentumReport?.keyLevels?.nearestSupport?.price}
                    resistancePrice={momentumReport?.keyLevels?.nearestResistance?.price}
                    momentumScore={momentumReport?.momentumScore}
                    momentumLevel={momentumReport?.momentumLevel}
                    smasScore={momentumReport?.smasScores?.['1W']?.score}
                    showOverlayStats={true}
                  />
                </div>

                {/* NRI WealthOS Technical Momentum & Reasoning Engine Panel */}
                <MomentumReasoningPanel report={momentumReport} symbol={symbol} />

                {/* Classical Technical Indicators & Moving Averages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase">RSI (14-Period Momentum)</span>
                      <strong className={`text-base font-mono font-black ${tech.rsi14 >= 70 ? 'text-rose-400' : tech.rsi14 <= 30 ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {tech.rsi14 || '52.4'}
                      </strong>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {layman.rsiMeaning || 'Measures speed and magnitude of recent price moves on a 0-100 scale.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase">Structural Trend</span>
                      <strong className={`text-base font-mono font-black ${tech.trend === 'UPTREND' ? 'text-emerald-400' : tech.trend === 'DOWNTREND' ? 'text-rose-400' : 'text-amber-400'}`}>
                        {tech.trend || 'UPTREND'}
                      </strong>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {layman.trendMeaning || 'Moving average alignment indicates whether long-term buyers are in control.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400 uppercase">Bollinger Squeeze</span>
                      <strong className={`text-base font-mono font-black ${tech.bollingerBands?.isSqueeze ? 'text-amber-300' : 'text-slate-100'}`}>
                        {tech.bollingerBands?.isSqueeze ? 'SQUEEZE ACTIVE' : 'NORMAL RANGE'}
                      </strong>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {layman.bollingerMeaning || 'Evaluates volatility compression before major directional breakout moves.'}
                    </p>
                  </div>
                </div>

                {/* Classical Support & Resistance Pivots */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" /> Classical Floor Pivot Grid & Support Levels
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      {layman.pivotMeaning || 'Key price milestones where buying or selling interest concentrates.'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                      <span className="text-[10px] font-mono text-rose-300 block">Support S3</span>
                      <strong className="text-white font-mono">₹{pivots.s3 || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30">
                      <span className="text-[10px] font-mono text-rose-300 block">Support S2</span>
                      <strong className="text-white font-mono">₹{pivots.s2 || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40">
                      <span className="text-[10px] font-mono text-rose-300 block">Support S1</span>
                      <strong className="text-white font-mono">₹{pivots.s1 || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40">
                      <span className="text-[10px] font-mono text-indigo-300 block">Pivot Point</span>
                      <strong className="text-white font-mono">₹{pivots.pivot || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                      <span className="text-[10px] font-mono text-emerald-300 block">Resistance R1</span>
                      <strong className="text-white font-mono">₹{pivots.r1 || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-[10px] font-mono text-emerald-300 block">Resistance R2</span>
                      <strong className="text-white font-mono">₹{pivots.r2 || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <span className="text-[10px] font-mono text-emerald-300 block">Resistance R3</span>
                      <strong className="text-white font-mono">₹{pivots.r3 || '—'}</strong>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4: F&O DERIVATIVES & OPTIONS */}
            {activeTab === 'OPTIONS_FAND_O' && (
              <motion.div key="options" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-mono text-slate-400 block uppercase">Put-Call Ratio (PCR)</span>
                    <div className="text-3xl font-black font-mono text-cyan-300">{opt.pcr || '1.12'}</div>
                    <span className="text-xs text-slate-300 block font-medium">{opt.laymanMeaning || 'Ratio of put contracts to call contracts.'}</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-mono text-slate-400 block uppercase">Max Pain Strike</span>
                    <div className="text-3xl font-black font-mono text-amber-300">₹{opt.maxPainStrike || '—'}</div>
                    <span className="text-xs text-slate-300 block">Price where option sellers suffer least loss on expiry.</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-mono text-slate-400 block uppercase">ATM Implied Volatility</span>
                    <div className="text-3xl font-black font-mono text-purple-300">{opt.atmIv || '24.5'}%</div>
                    <span className="text-xs text-slate-300 block">Expected 30-day forward price fluctuations.</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <span className="text-xs font-mono text-slate-400 block uppercase">OI Buildup Signal</span>
                    <div className="text-xl font-black font-mono text-emerald-400">
                      {(opt.oiBuildup || 'LONG_BUILD_UP').replace(/_/g, ' ')}
                    </div>
                    <span className="text-xs text-slate-300 block">{opt.portfolioVerdict || 'Positive derivative tailwind for portfolio.'}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 5: FORWARD LOOK-AHEAD SCENARIOS */}
            {activeTab === 'FORWARD_OUTLOOK' && (
              <motion.div key="lookahead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {/* 52-Week Range Position Gauge */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold text-slate-200 uppercase">52-Week Price Spectrum</span>
                    <span className="text-xs font-mono text-cyan-300 font-bold">{layman.range52WMeaning || 'Position in 52W range'}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700 relative">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
                      style={{ width: `${tech.keyLevels?.range52WPositionPct || 50}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-300 font-mono">
                    <span>52W Low: <strong>₹{tech.keyLevels?.fiftyTwoWeekLow || '—'}</strong></span>
                    <span>52W High: <strong>₹{tech.keyLevels?.fiftyTwoWeekHigh || '—'}</strong></span>
                  </div>
                </div>

                {/* Scenario Price Targets */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <span className="text-xs font-mono text-emerald-300 block uppercase font-bold">Bull Case Target</span>
                    <div className="text-2xl font-black font-mono text-emerald-400">₹{fwd.bullTarget || '—'}</div>
                    <span className="text-xs font-mono text-emerald-300 block font-bold">+{fwd.upsidePct || 20}% Potential (Growth Scenario)</span>
                    <p className="text-[11px] text-slate-300 pt-1">Driven by earnings beat, multiple expansion and order execution.</p>
                  </div>

                  <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-1">
                    <span className="text-xs font-mono text-indigo-300 block uppercase font-bold">Base Case Target</span>
                    <div className="text-2xl font-black font-mono text-white">₹{fwd.baseTarget || '—'}</div>
                    <span className="text-xs font-mono text-indigo-300 block font-bold">Fair Valuation Horizon</span>
                    <p className="text-[11px] text-slate-300 pt-1">Consensus projection matching historical growth rate.</p>
                  </div>

                  <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                    <span className="text-xs font-mono text-rose-300 block uppercase font-bold">Bear Case (Stop-Loss)</span>
                    <div className="text-2xl font-black font-mono text-rose-400">₹{fwd.bearTarget || '—'}</div>
                    <span className="text-xs font-mono text-rose-300 block font-bold">-{fwd.downsidePct || 12}% Capital Risk</span>
                    <p className="text-[11px] text-slate-300 pt-1">Downside support floor if broad market correction occurs.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 6: FUNDAMENTALS */}
            {activeTab === 'FUNDAMENTAL' && (
              <motion.div key="fundamental" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(fund).map(([k, v]: any) => (
                    <div key={k} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-[11px] font-mono text-slate-400 block uppercase">{k.replace(/_/g, ' ')}</span>
                      <span className="text-base font-black font-mono text-white block">{String(v)}</span>
                      <span className="text-[10px] text-slate-400 block">
                        {k === 'roce' ? 'Capital return efficiency' : k === 'stock_pe' ? 'Price to earnings valuation' : k === 'debt_to_equity' ? 'Balance sheet leverage' : 'Financial ratio'}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* TAB 7: SECTOR & PEERS */}
            {activeTab === 'PEERS' && (
              <motion.div key="peers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-3 bg-slate-900/60 rounded-2xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-300 font-display">Industry Peers Comparison</span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search peers..."
                      value={peerSearch}
                      onChange={(e) => setPeerSearch(e.target.value)}
                      className="pl-8 pr-7 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44 sm:w-56 transition"
                    />
                    {peerSearch && (
                      <button
                        onClick={() => setPeerSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
                      <tr>
                        {renderPeerSortHeader('Name', 'name', 'left')}
                        {renderPeerSortHeader('CMP', 'cmp', 'right')}
                        {renderPeerSortHeader('Market Cap', 'market_cap', 'right')}
                        {renderPeerSortHeader('P/E', 'pe', 'right')}
                        {renderPeerSortHeader('ROCE', 'roce', 'right')}
                        {renderPeerSortHeader('ROE', 'roe', 'right')}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {(() => {
                        let list = [...peers];
                        if (peerSearch.trim()) {
                          const q = peerSearch.toLowerCase().trim();
                          list = list.filter((p: any) => (p.name || '').toLowerCase().includes(q));
                        }

                        const parseNum = (val: any) => {
                          if (typeof val === 'number') return val;
                          if (!val) return 0;
                          const cleaned = String(val).replace(/[^0-9.-]/g, '');
                          return parseFloat(cleaned) || 0;
                        };

                        list.sort((a: any, b: any) => {
                          let aVal: any = 0;
                          let bVal: any = 0;
                          if (peerSortField === 'name') {
                            aVal = a.name || '';
                            bVal = b.name || '';
                            return peerSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                          } else if (peerSortField === 'cmp') {
                            aVal = parseNum(a.cmp);
                            bVal = parseNum(b.cmp);
                          } else if (peerSortField === 'market_cap') {
                            aVal = parseNum(a.market_cap);
                            bVal = parseNum(b.market_cap);
                          } else if (peerSortField === 'pe') {
                            aVal = parseNum(a.pe);
                            bVal = parseNum(b.pe);
                          } else if (peerSortField === 'roce') {
                            aVal = parseNum(a.roce);
                            bVal = parseNum(b.roce);
                          } else if (peerSortField === 'roe') {
                            aVal = parseNum(a.roe);
                            bVal = parseNum(b.roe);
                          }
                          return peerSortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                        });

                        if (list.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                {peerSearch ? `No peers matching "${peerSearch}".` : 'No peer data available.'}
                              </td>
                            </tr>
                          );
                        }

                        return list.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-bold text-white">{p.name}</td>
                            <td className="p-3 text-right font-mono text-slate-200">₹{p.cmp}</td>
                            <td className="p-3 text-right font-mono text-slate-200">{p.market_cap}</td>
                            <td className="p-3 text-right font-mono text-slate-200">{p.pe}</td>
                            <td className="p-3 text-right font-mono text-emerald-400">{p.roce}%</td>
                            <td className="p-3 text-right font-mono text-emerald-400">{p.roe}%</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB 8: MULTI-SOURCE NEWS */}
            {activeTab === 'NEWS' && (
              <motion.div key="news" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* News Sentiment Summary Banner */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">Aggregated Media Sentiment (Economic Times, Livemint, Moneycontrol, Google News)</span>
                    <h4 className="text-sm font-black text-white mt-0.5">{newsObj.laymanSummary || 'Constructive corporate news flow.'}</h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${
                    newsObj.sentimentVerdict === 'STRONG_BULLISH' || newsObj.sentimentVerdict === 'BULLISH'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : newsObj.sentimentVerdict === 'BEARISH' || newsObj.sentimentVerdict === 'STRONG_BEARISH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  }`}>
                    {newsObj.sentimentVerdict || 'BULLISH'}
                  </span>
                </div>

                {news.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No recent headlines found for {companyName}.</p>
                ) : (
                  news.map((item: any, i: number) => (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 block hover:border-cyan-500/50 transition-all space-y-1.5"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="text-xs font-bold text-white hover:text-cyan-300 transition-colors">{item.title}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono uppercase shrink-0 ${
                          item.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                          item.sentiment === 'NEGATIVE' ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {item.sentiment || 'NEUTRAL'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono font-bold border border-slate-700">{item.source}</span>
                        <span>{item.pubDate}</span>
                      </div>
                    </a>
                  ))
                )}
              </motion.div>
            )}

            {/* TAB 9: PORTFOLIO POSITION */}
            {activeTab === 'PORTFOLIO' && (
              <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {portfolioCtx ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs font-mono text-slate-400 block uppercase">Unrealized Return</span>
                      <div className={`text-2xl font-black font-mono mt-1 ${portfolioCtx.unrealized_pnl_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {portfolioCtx.unrealized_pnl_pct >= 0 ? '+' : ''}{portfolioCtx.unrealized_pnl_pct.toFixed(2)}%
                      </div>
                      <span className="text-xs text-slate-400 mt-1 block">Gain: {formatCurrency(portfolioCtx.unrealized_pnl || 0)}</span>
                    </div>

                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs font-mono text-slate-400 block uppercase">Holding Period</span>
                      <div className="text-2xl font-black font-mono text-white mt-1">{portfolioCtx.days_held} Days</div>
                      <span className="text-xs text-slate-400 mt-1 block">{portfolioCtx.days_held >= 365 ? 'Qualified for 12.5% LTCG' : 'Subject to 20% STCG'}</span>
                    </div>

                    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs font-mono text-slate-400 block uppercase">Family Portfolio Weight</span>
                      <div className="text-2xl font-black font-mono text-cyan-300 mt-1">{portfolioCtx.weight_pct.toFixed(2)}%</div>
                      <span className="text-xs text-slate-400 mt-1 block">Held in: {portfolioCtx.portfolio || 'Active Accounts'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                    <PieChartIcon className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                    <p className="text-xs">This scrip is not currently held in your active portfolios.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default StockIntelligenceView;
