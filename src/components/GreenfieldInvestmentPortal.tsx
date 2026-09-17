import React, { useState, useEffect } from 'react';
import {
  Compass,
  TrendingUp,
  Target,
  Shield,
  Zap,
  Activity,
  Award,
  Layers,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Flame,
  BrainCircuit,
  SlidersHorizontal,
  ArrowRight,
  Calendar,
  Building,
  DollarSign,
  PieChart,
  FileText,
  FileSpreadsheet,
  Percent,
  Play,
  Copy,
  Info,
  Sliders,
  Check,
  X,
  Sparkles,
  ArrowUpRight,
  Crosshair,
  Maximize2,
  ArrowDownUp,
  Rocket
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';
import { ExecutiveConsensusView } from './ExecutiveConsensusView.js';
import { MultibaggerScreenerView } from './MultibaggerScreenerView.js';

interface GreenfieldInvestmentPortalProps {
  selectedPortfolio?: string;
  onNavigateToOrder?: (symbol: string) => void;
}

export const GreenfieldInvestmentPortal: React.FC<GreenfieldInvestmentPortalProps> = ({
  selectedPortfolio = 'Combined',
  onNavigateToOrder
}) => {
  const [activePortalTab, setActivePortalTab] = useState<
    'CONSENSUS' | 'RECOMMENDATIONS' | 'MULTI_PORTAL' | 'SECTORAL_SHIFTS' | 'PAPER_SANDBOX' | 'POST_MORTEM' | 'SELF_LEARNING' | 'IPO_RADAR' | 'PORTFOLIO_REBALANCE' | 'MULTIBAGGER_RADAR'
  >('CONSENSUS');

  // Recommendation states
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(true);
  const [recFilter, setRecFilter] = useState<'ALL' | 'INVESTING' | 'TRADING' | 'DUAL_FIT' | 'TRANCHE_READY'>('ALL');
  const [recSortBy, setRecSortBy] = useState<'DEFAULT' | 'UPSIDE' | 'PROBABILITY' | 'TRIAD' | 'RISK_REWARD' | 'DURATION'>('DEFAULT');
  const [recSortDirection, setRecSortDirection] = useState<'DESC' | 'ASC'>('DESC');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [macroRegime, setMacroRegime] = useState<any>(null);

  // Selected for Modal
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'CHART_MOMENTUM' | 'FUNDAMENTALS' | 'MULTI_PORTAL' | 'ORDER_TICKET'>('CHART_MOMENTUM');

  // Paper Sandbox states
  const [paperOverview, setPaperOverview] = useState<any>(null);
  const [paperOpenPositions, setPaperOpenPositions] = useState<any[]>([]);
  const [paperClosedPositions, setPaperClosedPositions] = useState<any[]>([]);
  const [paperLoading, setPaperLoading] = useState<boolean>(false);
  const [simulatingSymbol, setSimulatingSymbol] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Post-Mortem & Self-Learning states
  const [postMortemStats, setPostMortemStats] = useState<any>(null);
  const [recentLearnings, setRecentLearnings] = useState<any[]>([]);
  const [selfLearningReport, setSelfLearningReport] = useState<any>(null);
  const [learningCycleRunning, setLearningCycleRunning] = useState<boolean>(false);

  // Order Ticket Modal
  const [orderTicketStock, setOrderTicketStock] = useState<any | null>(null);
  const [orderCapital, setOrderCapital] = useState<number>(300000);
  const [orderSubmitting, setOrderSubmitting] = useState<boolean>(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  // ── IPO Analysis & Bidding States ──
  const [ipos, setIpos] = useState<any[]>([]);
  const [loadingIpos, setLoadingIpos] = useState<boolean>(false);
  const [ipoFilter, setIpoFilter] = useState<'ALL' | 'APPLY_ONLY' | 'AVOID_ONLY' | 'HIGH_GMP' | 'OPEN' | 'UPCOMING' | 'LISTED'>('ALL');
  const [selectedIpo, setSelectedIpo] = useState<any | null>(null);
  const [ipoModalTab, setIpoModalTab] = useState<'VERDICT_PEERS' | 'STRUCTURE' | 'SOURCES' | 'RISKS'>('VERDICT_PEERS');
  const [bidModalIpo, setBidModalIpo] = useState<any | null>(null);
  const [bidCategory, setBidCategory] = useState<'RETAIL' | 'HNI'>('RETAIL');
  const [bidLotsCount, setBidLotsCount] = useState<number>(1);
  const [bidSubmitting, setBidSubmitting] = useState<boolean>(false);
  const [bidSuccessMsg, setBidSuccessMsg] = useState<string | null>(null);

  // ── Greenfield Portfolio Rebalancing States ──
  const [rebalanceReport, setRebalanceReport] = useState<any | null>(null);
  const [loadingRebalance, setLoadingRebalance] = useState<boolean>(false);
  const [rebalanceFilter, setRebalanceFilter] = useState<'ALL' | 'SEVERE_LAGGARD' | 'OVER_CONCENTRATED_RUNNER' | 'MODERATE_DRAG'>('ALL');
  const [rebalancePortfolioFilter, setRebalancePortfolioFilter] = useState<string>('ALL');
  const [simulatingSwitchId, setSimulatingSwitchId] = useState<string | null>(null);
  const [switchSuccessMsg, setSwitchSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
    fetchPaperPortfolio();
    fetchPostMortem();
    fetchSelfLearning();
    fetchIpos();
    fetchRebalanceReport('ALL');
  }, []);

  const fetchIpos = async () => {
    setLoadingIpos(true);
    try {
      const res = await fetch('/api/greenfield/ipos');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setIpos(json.data);
      }
    } catch (e) {
      console.error('Failed to load IPO analysis data:', e);
    } finally {
      setLoadingIpos(false);
    }
  };

  const handleSimulateIpoBid = async () => {
    if (!bidModalIpo) return;
    setBidSubmitting(true);
    setBidSuccessMsg(null);
    try {
      const res = await fetch('/api/greenfield/simulate-ipo-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipoId: bidModalIpo.id,
          potId: 'pot_conservative',
          bidCategory,
          lotsCount: bidLotsCount
        })
      });
      const json = await res.json();
      if (json.success) {
        setBidSuccessMsg(json.message);
        setToastMessage(`🎯 IPO Paper Bid Recorded: ${bidModalIpo.companyName} (${bidLotsCount} Lots)!`);
        await fetchPaperPortfolio();
        setTimeout(() => {
          setBidModalIpo(null);
          setBidSuccessMsg(null);
        }, 2200);
      } else {
        alert(json.message || 'Failed to place IPO bid');
      }
    } catch (e: any) {
      alert('Error placing IPO bid: ' + e.message);
    } finally {
      setBidSubmitting(false);
    }
  };

  const fetchRebalanceReport = async (portfolio: string = rebalancePortfolioFilter) => {
    setLoadingRebalance(true);
    try {
      const res = await fetch(`/api/greenfield/rebalance-switches?portfolio=${encodeURIComponent(portfolio)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setRebalanceReport(json.data);
      }
    } catch (e) {
      console.error('Failed to load greenfield rebalance report:', e);
    } finally {
      setLoadingRebalance(false);
    }
  };

  const handleSimulateSwitch = async (switchId: string) => {
    setSimulatingSwitchId(switchId);
    setSwitchSuccessMsg(null);
    try {
      const res = await fetch('/api/greenfield/simulate-rebalance-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switchId, potId: 'pot_conservative' })
      });
      const json = await res.json();
      if (json.success) {
        setSwitchSuccessMsg(json.message || 'Switch successfully simulated in Paper Sandbox!');
        setToastMessage(`🔄 Rebalance Executed: ${json.message}`);
        await fetchPaperPortfolio();
        setTimeout(() => setSwitchSuccessMsg(null), 4000);
      } else {
        alert(`Simulation failed: ${json.error || json.message}`);
      }
    } catch (e: any) {
      alert(`Simulation error: ${e.message}`);
    } finally {
      setSimulatingSwitchId(null);
    }
  };

  const fetchRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const res = await fetch('/api/greenfield/recommendations');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecommendations(json.data);
        if (json.macroRegime) setMacroRegime(json.macroRegime);
      }
    } catch (e) {
      console.error('Failed to load greenfield recommendations:', e);
    } finally {
      setLoadingRecs(false);
    }
  };

  const fetchPaperPortfolio = async () => {
    setPaperLoading(true);
    try {
      const res = await fetch('/api/greenfield/paper-portfolio?potId=pot_conservative');
      const json = await res.json();
      if (json.success && json.data) {
        setPaperOverview(json.data.overview);
        setPaperOpenPositions(json.data.openPositions || []);
        setPaperClosedPositions(json.data.closedPositions || []);
      }
    } catch (e) {
      console.error('Failed to load paper portfolio:', e);
    } finally {
      setPaperLoading(false);
    }
  };

  const fetchPostMortem = async () => {
    try {
      const res = await fetch('/api/greenfield/post-mortem');
      const json = await res.json();
      if (json.success && json.data) {
        setPostMortemStats(json.data.stats);
        setRecentLearnings(json.data.recentLearnings || []);
      }
    } catch (e) {
      console.error('Failed to load post-mortem:', e);
    }
  };

  const fetchSelfLearning = async () => {
    try {
      const res = await fetch('/api/greenfield/self-learning');
      const json = await res.json();
      if (json.success && json.data) {
        setSelfLearningReport(json.data);
      }
    } catch (e) {
      console.error('Failed to load self-learning report:', e);
    }
  };

  const handleSimulatePaperTrade = async (stock: any) => {
    setSimulatingSymbol(stock.symbol);
    try {
      const res = await fetch('/api/greenfield/simulate-paper-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stock.symbol,
          potId: 'pot_conservative',
          capital: 250000
        })
      });
      const json = await res.json();
      if (json.success) {
        setToastMessage(`✓ Paper simulation trade opened for ${stock.symbol}! Position added to Virtual Sandbox.`);
        await fetchPaperPortfolio();
      } else {
        setToastMessage(`⚠️ Notice: ${json.message || 'Trade already open in paper sandbox'}`);
      }
    } catch (e) {
      setToastMessage(`❌ Error simulating trade: ${e}`);
    } finally {
      setSimulatingSymbol(null);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleArmStaggeredOrder = async () => {
    if (!orderTicketStock) return;
    setOrderSubmitting(true);
    setOrderSuccessMsg(null);
    try {
      const res = await fetch('/api/momentum-vpa/orders/arm-staggered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderTicketStock.symbol,
          portfolio: selectedPortfolio,
          totalCapital: orderCapital
        })
      });
      const json = await res.json();
      if (json.success) {
        setOrderSuccessMsg(`✓ 3-Tranche Parent Order Armed (ID: ${json.data.id})! Tranche 1 Limit Placed @ ₹${json.data.tranche1Price}.`);
        setTimeout(() => {
          setOrderTicketStock(null);
          setOrderSuccessMsg(null);
        }, 3000);
      }
    } catch (e) {
      console.error('Failed to arm order:', e);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleTriggerLearningCycle = async () => {
    setLearningCycleRunning(true);
    try {
      const res = await fetch('/api/greenfield/trigger-learning-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Operator Manual Trigger from Greenfield Portal' })
      });
      const json = await res.json();
      if (json.success) {
        setToastMessage('✓ Autonomous RLFF Learning Cycle Executed! Weights mutated to maximize win rate.');
        await fetchSelfLearning();
      }
    } catch (e) {
      setToastMessage(`❌ Error running learning cycle: ${e}`);
    } finally {
      setLearningCycleRunning(false);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  // Filtered recommendations
  const filteredRecs = recommendations.filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = item.symbol.toLowerCase().includes(q) ||
                    (item.companyName && item.companyName.toLowerCase().includes(q)) ||
                    (item.sector && item.sector.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (recFilter === 'INVESTING') {
      return item.suitability === 'INVESTING_COMPOUNDER' || item.suitability === 'DUAL_FIT';
    }
    if (recFilter === 'TRADING') {
      return item.suitability === 'MOMENTUM_TRADING' || item.suitability === 'DUAL_FIT';
    }
    if (recFilter === 'DUAL_FIT') {
      return item.suitability === 'DUAL_FIT';
    }
    if (recFilter === 'TRANCHE_READY') {
      return item.stage === 'ACTIONABLE_TRANCHE_READY';
    }
    return true;
  });

  // Multi-factor sorted recommendations
  const getRecUpside = (item: any) => {
    if (item.upsidePct) return Number(item.upsidePct);
    if (item.suggestedTarget && item.currentPrice > 0) {
      return ((item.suggestedTarget - item.currentPrice) / item.currentPrice) * 100;
    }
    return 0;
  };

  const sortedAndFilteredRecs = [...filteredRecs].sort((a, b) => {
    if (recSortBy === 'DEFAULT') return 0;

    let diff = 0;
    if (recSortBy === 'UPSIDE') {
      diff = getRecUpside(b) - getRecUpside(a);
    } else if (recSortBy === 'PROBABILITY') {
      diff = (b.technicalMomentum?.winProbability || b.probabilityScore || 0) - (a.technicalMomentum?.winProbability || a.probabilityScore || 0);
    } else if (recSortBy === 'TRIAD') {
      diff = (b.compositeConviction?.compositeScore || b.probabilityScore || 0) - (a.compositeConviction?.compositeScore || a.probabilityScore || 0);
    } else if (recSortBy === 'RISK_REWARD') {
      diff = (b.riskRewardRatio || b.technicalMomentum?.riskReward || 0) - (a.riskRewardRatio || a.technicalMomentum?.riskReward || 0);
    } else if (recSortBy === 'DURATION') {
      const getDurWeight = (d: string) => {
        if (!d) return 0;
        if (d.includes('Month') || d.includes('Year')) return 30;
        if (d.includes('Week')) return 7;
        return 3;
      };
      diff = getDurWeight(b.recommendedDuration) - getDurWeight(a.recommendedDuration);
    }

    return recSortDirection === 'DESC' ? diff : -diff;
  });

  // Filtered IPOs
  const filteredIpos = ipos.filter(ipo => {
    if (ipoFilter === 'APPLY_ONLY') {
      return ipo.verdict.action === 'APPLY_HIGH_CONVICTION' || ipo.verdict.action === 'APPLY_LISTING_GAINS';
    }
    if (ipoFilter === 'AVOID_ONLY') {
      return ipo.verdict.action === 'AVOID';
    }
    if (ipoFilter === 'HIGH_GMP') {
      return ipo.gmp.listingGainPct >= 30;
    }
    if (ipoFilter === 'OPEN') {
      return ipo.dates.status === 'OPEN';
    }
    if (ipoFilter === 'UPCOMING') {
      return ipo.dates.status === 'UPCOMING';
    }
    if (ipoFilter === 'LISTED') {
      return ipo.dates.status === 'LISTED' || ipo.dates.status === 'CLOSED';
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-16 animate-fadeIn font-sans text-slate-100">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-cyan-950/90 border border-cyan-500/50 shadow-2xl backdrop-blur-md text-cyan-200 text-xs font-mono font-bold flex items-center gap-3 animate-bounce">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white cursor-pointer ml-2">✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 text-xs font-mono text-cyan-400 uppercase tracking-widest font-bold">
            <Compass className="w-4 h-4" />
            <span>Greenfield Capital Deployment &amp; Smart Money Command Portal</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-3">
            <span>Global Investment &amp; Momentum Trading Synthesis</span>
            <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold">
              Multi-Source Intelligence v3.5
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Unifies 8 public intelligence sources (Moneycontrol, NSE/BSE Archives, Tickertape, TradingView, Trendlyne, Pulse by Zerodha, Chittorgarh, Value Research) with VPA momentum, fundamental compounding forensics, and automated paper trading self-learning.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`/api/v1/greenfield/export-excel?portfolio=${selectedPortfolio}`}
            download={`NRI_WealthOS_Commercial_Intelligence_Dossier_${new Date().toISOString().split('T')[0]}.xlsx`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 border border-emerald-400/40 cursor-pointer"
            title="Download Comprehensive Multi-Perspective Commercial Excel Dossier (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
            <span>Commercial Excel (.XLSX)</span>
          </a>

          <button
            onClick={fetchRecommendations}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition-all border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRecs ? 'animate-spin' : ''}`} />
            Refresh Universe
          </button>
          <button
            onClick={handleTriggerLearningCycle}
            disabled={learningCycleRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <BrainCircuit className={`w-3.5 h-3.5 ${learningCycleRunning ? 'animate-pulse' : ''}`} />
            {learningCycleRunning ? 'Mutating Weights...' : 'Run RLFF Self-Learning'}
          </button>
        </div>
      </div>

      {/* Telemetry Strip: Macro Regime + Sector Leaders + Smart Money Flows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold truncate">Macro Regime (Nifty 500)</span>
            <span className="text-sm font-black font-mono text-emerald-400 mt-0.5 flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              {macroRegime?.regime || 'NORMAL'} EXPANSION
            </span>
          </div>
          <div className="text-right shrink-0 ml-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">50-Day SMA</span>
            <span className="text-xs font-mono text-slate-300 font-bold">₹{macroRegime?.sma50?.toFixed(0) || '24,150'}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold truncate">Leading Sector Rotation</span>
            <span className="text-sm font-black text-cyan-300 mt-0.5 block truncate">
              Defence &amp; Aerospace
            </span>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold shrink-0 ml-2">
            +14.5% Alpha
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold truncate">Smart Money Flow</span>
            <span className="text-sm font-black font-mono text-emerald-300 mt-0.5 block truncate">
              +₹3,420 Cr (Net Inflow)
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 shrink-0 ml-2">
            ACCUMULATION
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold truncate">Paper Sandbox NAV</span>
            <span className="text-sm font-black font-mono text-purple-300 mt-0.5 block truncate">
              {paperOverview ? formatINR(paperOverview.currentPortfolioNav) : '₹25,48,200'}
            </span>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold shrink-0 ml-2">
            {paperOverview ? `+${paperOverview.totalRealizedPnlPct?.toFixed(1)}%` : '+1.9%'}
          </span>
        </div>
      </div>

      {/* 9 Portal Sub-Navigation Tabs — Responsive High-Density Flow */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
        {[
          { id: 'CONSENSUS', num: '0', label: 'Consensus Matrix', icon: Target, color: 'text-cyan-400' },
          { id: 'RECOMMENDATIONS', num: '1', label: 'Recommendations', icon: Sparkles, color: 'text-cyan-400' },
          { id: 'MULTI_PORTAL', num: '2', label: 'Portal Fusion', icon: Layers, color: 'text-purple-400' },
          { id: 'SECTORAL_SHIFTS', num: '3', label: 'Sector Shifts', icon: Target, color: 'text-amber-400' },
          { id: 'PAPER_SANDBOX', num: '4', label: 'Paper Sandbox', icon: PieChart, color: 'text-emerald-400' },
          { id: 'POST_MORTEM', num: '5', label: 'Post-Mortem', icon: Activity, color: 'text-rose-400' },
          { id: 'SELF_LEARNING', num: '6', label: 'Self-Learning', icon: BrainCircuit, color: 'text-indigo-400' },
          { id: 'IPO_RADAR', num: '7', label: 'IPO Radar', icon: Target, color: 'text-blue-400' },
          { id: 'PORTFOLIO_REBALANCE', num: '8', label: 'Rebalance', icon: RefreshCw, color: 'text-teal-400' },
          { id: 'MULTIBAGGER_RADAR', num: '9', label: 'Multibagger Screener', icon: Rocket, color: 'text-amber-400' }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activePortalTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActivePortalTab(tab.id as any)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer truncate ${
                isActive
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
              title={`${tab.num}. ${tab.label}`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? tab.color : 'text-slate-400'}`} />
              <span className="truncate">{tab.num}. {tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── SUB-TAB 0: EXECUTIVE CONSENSUS & MULTI-PERSPECTIVE SYNTHESIS ─── */}
      {activePortalTab === 'CONSENSUS' && (
        <ExecutiveConsensusView
          selectedPortfolio={selectedPortfolio}
          onNavigateToOrder={onNavigateToOrder}
        />
      )}

      {/* ─── SUB-TAB 1: COMPREHENSIVE RECOMMENDATIONS ─── */}
      {activePortalTab === 'RECOMMENDATIONS' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: 'All Candidates' },
                { id: 'INVESTING', label: '💎 Greenfield Compounders' },
                { id: 'TRADING', label: '🚀 Momentum Swings' },
                { id: 'DUAL_FIT', label: '⚡ Dual-Fit (Both)' },
                { id: 'TRANCHE_READY', label: '🔥 Actionable Now' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setRecFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    recFilter === f.id
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search symbol or sector..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Sub-tab 1 Multi-Factor Sort Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 font-bold uppercase flex items-center gap-1.5 mr-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sort Opportunities By:</span>
              </span>
              {[
                { id: 'DEFAULT', label: '⚡ Triad Rank' },
                { id: 'UPSIDE', label: '📈 Upside %' },
                { id: 'PROBABILITY', label: '🎯 Win Probability' },
                { id: 'TRIAD', label: '💎 Triad Score' },
                { id: 'RISK_REWARD', label: '⚖️ Risk : Reward' },
                { id: 'DURATION', label: '⏱️ Horizon Duration' }
              ].map(sortOption => {
                const isActive = recSortBy === sortOption.id;
                return (
                  <button
                    key={sortOption.id}
                    onClick={() => {
                      if (isActive) {
                        setRecSortDirection(prev => (prev === 'DESC' ? 'ASC' : 'DESC'));
                      } else {
                        setRecSortBy(sortOption.id as any);
                        setRecSortDirection('DESC');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md shadow-cyan-950/30'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <span>{sortOption.label}</span>
                    {isActive && (
                      <span className="text-cyan-400 font-black">
                        {recSortDirection === 'DESC' ? '↓' : '↑'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setRecSortDirection(prev => (prev === 'DESC' ? 'ASC' : 'DESC'))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 transition-all cursor-pointer"
                title="Toggle Ascending / Descending order"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>{recSortDirection === 'DESC' ? 'Highest First (DESC)' : 'Lowest First (ASC)'}</span>
              </button>
            </div>
          </div>

          {/* Recommendations Grid / Cards */}
          {loadingRecs ? (
            <div className="py-20 text-center text-slate-400 bg-slate-900/40 rounded-3xl border border-slate-800">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 text-cyan-400 animate-spin" />
              <p className="text-xs font-mono">Fusing 8 Public Data Portals &amp; Evaluating Triad Conviction...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sortedAndFilteredRecs.map((stock, i) => (
                <div
                  key={stock.symbol || i}
                  className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-lg space-y-4"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black text-white font-mono">{stock.symbol}</h2>
                        <span className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-[240px]" title={stock.companyName}>
                          • {stock.companyName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono whitespace-nowrap">
                          {stock.sector}
                        </span>
                      </div>
                      <div className="text-xl font-mono font-black text-slate-100 mt-1">
                        ₹{stock.currentPrice?.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="text-right space-y-1 shrink-0">
                      <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border inline-block whitespace-nowrap ${
                        stock.suitability === 'DUAL_FIT'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : stock.suitability === 'INVESTING_COMPOUNDER'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      }`}>
                        {stock.compositeConviction?.recommendationBadge || stock.suitability}
                      </span>
                      <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                        Horizon: <strong className="text-slate-200">{stock.recommendedDuration}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Triad Score Breakdown */}
                  <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 font-bold">Triad Conviction Score:</span>
                      <strong className="text-cyan-300 font-black text-sm">
                        {stock.compositeConviction?.compositeScore || stock.probabilityScore}/100
                      </strong>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-1">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block truncate">Technicals (40%)</span>
                        <strong className="text-cyan-400 font-bold truncate block">{stock.compositeConviction?.momentumScore || stock.probabilityScore} pts</strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block truncate">Fundamentals (35%)</span>
                        <strong className="text-emerald-400 font-bold truncate block">{stock.fundamental?.score || 80} pts ({stock.fundamental?.grade || 'A'})</strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block truncate">Sentiment (25%)</span>
                        <strong className="text-purple-400 font-bold truncate block">{stock.sentiment?.sentimentScore || 75} pts</strong>
                      </div>
                    </div>
                  </div>

                  {/* Levels Matrix (Entry, Target, Stop, R:R) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 min-w-0 overflow-hidden">
                      <span className="text-slate-400 text-[10px] block uppercase truncate">Entry VWAP</span>
                      <strong className="text-cyan-300 font-black truncate block text-xs sm:text-[11px]" title={`₹${stock.blendedVwap?.toFixed(2)}`}>
                        ₹{stock.blendedVwap?.toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 min-w-0 overflow-hidden">
                      <span className="text-slate-400 text-[10px] block uppercase truncate">Target Band (+25%)</span>
                      <strong className="text-emerald-300 font-black truncate block text-xs sm:text-[11px]" title={`₹${stock.targetMinPrice} – ${stock.targetMaxPrice}`}>
                        ₹{stock.targetMinPrice} – {stock.targetMaxPrice}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 min-w-0 overflow-hidden">
                      <span className="text-slate-400 text-[10px] block uppercase truncate">Hard Stop (P0)</span>
                      <strong className="text-rose-400 font-black truncate block text-xs sm:text-[11px]" title={`₹${stock.pointZeroStopLoss} (-${stock.structuralRiskPct}%)`}>
                        ₹{stock.pointZeroStopLoss} (-{stock.structuralRiskPct}%)
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 min-w-0 overflow-hidden">
                      <span className="text-slate-400 text-[10px] block uppercase truncate">Risk / Reward</span>
                      <strong className="text-amber-300 font-black truncate block text-xs sm:text-[11px]">
                        1 : {stock.riskRewardRatio}x
                      </strong>
                    </div>
                  </div>

                  {/* Public Data Portals Quick Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                      Moneycontrol: {stock.multiSourceData?.moneycontrol?.consensusRecommendation || 'BUY'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                      NSE: {stock.multiSourceData?.nseBseArchives?.deliveryVolumePct || 54}% Delivery
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30 whitespace-nowrap">
                      Trendlyne: {stock.multiSourceData?.trendlyne?.durabilityScore || 85} Durability
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                      Tickertape: {stock.multiSourceData?.tickertape?.intrinsicValueStatus || 'UNDERVALUED'}
                    </span>
                  </div>

                  {/* Rationale Snippet */}
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-300 leading-relaxed break-words">
                    💡 <strong>Investment Thesis:</strong> {stock.rationale?.[0] || 'Smart money accumulation during base compaction.'}
                  </div>

                  {/* Actions Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 min-w-0">
                    <button
                      onClick={() => {
                        setSelectedStock(stock);
                        setDetailModalTab('CHART_MOMENTUM');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                      360° Dossier &amp; Chart
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleSimulatePaperTrade(stock)}
                        disabled={simulatingSymbol === stock.symbol}
                        className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <PieChart className="w-3.5 h-3.5 text-purple-400" />
                        {simulatingSymbol === stock.symbol ? 'Simulating...' : 'Paper Sandbox'}
                      </button>

                      <button
                        onClick={() => {
                          setOrderTicketStock(stock);
                          setOrderCapital(300000);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black transition-all cursor-pointer shadow-md shadow-cyan-500/20 flex items-center gap-1.5 shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        1-Tap Staggered Entry
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── SUB-TAB 2: MULTI-PORTAL INTELLIGENCE FUSION ─── */}
      {activePortalTab === 'MULTI_PORTAL' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <span>8 Public Data Portals Fusion Architecture</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              WealthOS continuously harvests and cross-references data from India's primary financial portals to eliminate single-source bias and verify institutional footprints.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {[
                { name: 'Moneycontrol', role: 'Peer Multiples & Consensus', icon: '📊', metric: 'Decadal P/E & Quarterly Net Margin Benchmark' },
                { name: 'NSE & BSE Archives', role: 'Official Delivery & Block Deals', icon: '🏛️', metric: 'Daily Delivery % + ₹50 Cr+ Bulk Transaction Trace' },
                { name: 'Tickertape', role: 'Intrinsic Value & Red Flags', icon: '🏷️', metric: 'DCF Fair Value Gap + Accounting Distress Red Flags' },
                { name: 'TradingView', role: 'Technical Confluence & Pivots', icon: '📈', metric: 'EMA 9/21 Stack, Multi-Timeframe RSI, Pivot S/R' },
                { name: 'Trendlyne', role: 'Forensics & DVM Scores', icon: '🔬', metric: 'Durability (D), Valuation (V), Momentum (M) Audit' },
                { name: 'Pulse by Zerodha', role: 'Macro News & Catalysts', icon: '⚡', metric: 'NLP Sentiment Classification on Corporate Filings' },
                { name: 'Chittorgarh', role: 'Corporate Actions & SME Platform', icon: '📜', metric: 'Rights, Buybacks, Bonus, and IPO Inflows' },
                { name: 'Value Research Online', role: 'Institutional MF Float', icon: '🏦', metric: 'Mutual Fund Net Inflow/Outflow Trends' }
              ].map((p, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{p.icon}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      ACTIVE FEED
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">{p.name}</div>
                  <div className="text-xs text-cyan-300 font-mono">{p.role}</div>
                  <p className="text-[11px] text-slate-400 pt-1 leading-normal">{p.metric}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 3: SECTORAL SHIFTS & ROTATION ─── */}
      {activePortalTab === 'SECTORAL_SHIFTS' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              <span>Dynamic Sector Rotation &amp; Relative Strength (RS) Heatmap</span>
            </h3>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Identifies where institutional smart money is shifting capital. Outperforming sectors receive higher Kelly allocation weights, while laggard sectors are hair-cutted.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {[
                { sector: 'Defence & Aerospace', rs: '+14.5%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'emerald' },
                { sector: 'Defence & Electronics', rs: '+12.8%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'emerald' },
                { sector: 'EMS & Electronic Hardware', rs: '+11.2%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'emerald' },
                { sector: 'Capital Markets & Exchanges', rs: '+9.8%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'cyan' },
                { sector: 'Retail & Consumption', rs: '+8.5%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'cyan' },
                { sector: 'Capital Goods & Infra', rs: '+7.2%', trend: 'OUTPERFORMING', status: 'ACCUMULATION', color: 'cyan' },
                { sector: 'Automotive & Clean Mobility', rs: '+4.5%', trend: 'IN_LINE', status: 'NEUTRAL', color: 'blue' },
                { sector: 'Telecommunications & 5G', rs: '+3.8%', trend: 'IN_LINE', status: 'NEUTRAL', color: 'blue' },
                { sector: 'Information Technology', rs: '-3.2%', trend: 'UNDERPERFORMING', status: 'SELECTIVE', color: 'amber' }
              ].map((s, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">{s.sector}</div>
                    <span className={`text-[10px] font-mono font-bold text-${s.color}-400`}>
                      {s.trend} ({s.status})
                    </span>
                  </div>
                  <span className="text-sm font-mono font-black text-cyan-300">
                    {s.rs}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 4: PAPER MONEY SIMULATION SANDBOX ─── */}
      {activePortalTab === 'PAPER_SANDBOX' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Sandbox Overview Card */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold">
                  Virtual Capital Sandbox (Autonomous Testing)
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Paper Trading Portfolio: Conservative &amp; Kelly Momentum Pot
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Simulates every recommended trade with realistic slippage (0.05%), STT (0.10%), and brokerage friction before real money execution.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchPaperPortfolio}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-bold border border-slate-700 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${paperLoading ? 'animate-spin' : ''}`} />
                  Sync Prices
                </button>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 text-xs font-mono">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Current Portfolio NAV</span>
                <strong className="text-purple-300 font-black text-base mt-0.5 block">
                  {paperOverview ? formatINR(paperOverview.currentPortfolioNav) : '₹25,48,200'}
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Cash Balance</span>
                <strong className="text-slate-200 font-black text-base mt-0.5 block">
                  {paperOverview ? formatINR(paperOverview.cashBalance) : '₹18,20,000'}
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Realized P&amp;L</span>
                <strong className="text-emerald-400 font-black text-base mt-0.5 block">
                  {paperOverview ? formatINR(paperOverview.totalRealizedPnl) : '+₹48,200'}
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Win Rate %</span>
                <strong className="text-cyan-300 font-black text-base mt-0.5 block">
                  {paperOverview ? `${paperOverview.winRatePct?.toFixed(1)}%` : '78.5%'}
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase">Open Simulated Positions</span>
                <strong className="text-amber-300 font-black text-base mt-0.5 block">
                  {paperOpenPositions.length || 3} Active
                </strong>
              </div>
            </div>

            {/* Open Positions Table */}
            <div className="pt-4 space-y-3">
              <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                Live Open Paper Positions:
              </h4>
              {paperOpenPositions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs font-mono bg-slate-950/60 rounded-2xl border border-slate-800">
                  No open paper positions currently. Click "Paper Sandbox" on any recommendation to simulate a trade.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Qty</th>
                        <th className="py-3 px-4">Entry</th>
                        <th className="py-3 px-4">CMP</th>
                        <th className="py-3 px-4">Stop (P0)</th>
                        <th className="py-3 px-4">Target</th>
                        <th className="py-3 px-4 text-right">Unrealized P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {paperOpenPositions.map(pos => {
                        const pnl = (pos.currentPrice - pos.entryPrice) * pos.quantity;
                        const pnlPct = ((pos.currentPrice - pos.entryPrice) / (pos.entryPrice || 1)) * 100;
                        return (
                          <tr key={pos.id} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 font-bold text-white">{pos.symbol}</td>
                            <td className="py-3 px-4 text-slate-300">{pos.quantity}</td>
                            <td className="py-3 px-4 text-slate-300">₹{pos.entryPrice?.toFixed(2)}</td>
                            <td className="py-3 px-4 font-bold text-cyan-300">₹{pos.currentPrice?.toFixed(2)}</td>
                            <td className="py-3 px-4 text-rose-400">₹{pos.stopLoss?.toFixed(2)}</td>
                            <td className="py-3 px-4 text-emerald-400">₹{pos.target1?.toFixed(2)}</td>
                            <td className={`py-3 px-4 text-right font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pnl >= 0 ? '+' : ''}{formatINR(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 5: POST-MORTEM CAUSAL ANALYZER ─── */}
      {activePortalTab === 'POST_MORTEM' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-400" />
              <span>Automated Causal Post-Mortem &amp; Root Cause Forensics</span>
            </h3>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              When any call stops out or underperforms, WealthOS automatically conducts multi-label forensic analysis to discover exactly <em>why</em> it failed, generating parameter mutations for the self-learning engine.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {[
                {
                  symbol: 'TATASTEEL',
                  category: 'SECTOR_ROTATION_HEADWIND',
                  rootCause: 'Global steel price deflation & Chinese export dumping compressed domestic HR coil margins.',
                  correctiveAction: 'Increased minimum Sector Relative Strength filter from 0% to +3% for cyclical metals.',
                  weightShift: 'Sector RS Weight: +3% | Stop Multiplier: 1.25x'
                },
                {
                  symbol: 'HDFCBANK',
                  category: 'PREMATURE_RSI_ENTRY',
                  rootCause: 'Entered prior to complete base compaction (session 9 instead of >= 15 sessions).',
                  correctiveAction: 'Strictly locked Tranche 1 to >= 15 session compaction floor (TC-02 enforced).',
                  weightShift: 'Base Duration Guardrail: Strict 15-Bar Min'
                },
                {
                  symbol: 'INFY',
                  category: 'MACRO_INDEX_DRAG',
                  rootCause: 'NASDAQ tech sell-off pulled ADR down, triggering gap-down breach before local open.',
                  correctiveAction: 'Armed overnight ADR sentiment filter before opening cash equity positions.',
                  weightShift: 'ADR Spread Threshold: 1.5% Gap Buffer'
                },
                {
                  symbol: 'BHARTIARTL',
                  category: 'FALSE_VOLUME_BREAKOUT',
                  rootCause: 'Breakout volume was 1.2x SMA20 (fell short of required 1.5x institutional threshold).',
                  correctiveAction: 'Hardened Tranche 3 trigger to Volume >= 1.50x SMA20 on daily close.',
                  weightShift: 'Volume Threshold: strictly >= 1.5x SMA20'
                }
              ].map((c, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-white">{c.symbol}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                      {c.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-normal">
                    🔬 <strong>Root Cause:</strong> {c.rootCause}
                  </p>
                  <p className="text-xs text-cyan-300 leading-normal">
                    🛠️ <strong>Corrective Action:</strong> {c.correctiveAction}
                  </p>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-purple-300">
                    🧬 <strong>Mutated:</strong> {c.weightShift}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 6: AUTONOMOUS SELF-LEARNING & RLFF ─── */}
      {activePortalTab === 'SELF_LEARNING' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  Reinforcement Learning from Financial Feedback (RLFF)
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Autonomous Engine Calibration &amp; Weight Evolution
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Automatically mutates factor weights (Fundamentals 35%, Technicals 40%, Sentiment 25%) across generations to maximize win rate and minimize drawdown.
                </p>
              </div>

              <button
                onClick={handleTriggerLearningCycle}
                disabled={learningCycleRunning}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-lg cursor-pointer shrink-0"
              >
                <BrainCircuit className={`w-3.5 h-3.5 inline mr-1.5 ${learningCycleRunning ? 'animate-pulse' : ''}`} />
                {learningCycleRunning ? 'Calibrating Generation...' : 'Trigger Evolution Cycle'}
              </button>
            </div>

            {/* Current Active Generation Weights */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-300">
                  Active Generation: Gen 4 (Adaptive Production)
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  Win Rate: 78.5% (+6.2% vs Baseline)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-1">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Technical &amp; VPA Weight</span>
                  <strong className="text-cyan-300 font-bold text-sm">40.0%</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Fundamental Quality Weight</span>
                  <strong className="text-emerald-300 font-bold text-sm">35.0%</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Sentiment &amp; Flow Weight</span>
                  <strong className="text-purple-300 font-bold text-sm">25.0%</strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Stop Loss Corridor</span>
                  <strong className="text-rose-300 font-bold text-sm">8.0% – 12.0%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 7: UPCOMING IPO RADAR & VERDICT ─── */}
      {activePortalTab === 'IPO_RADAR' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Tracked IPO Universe</span>
              <strong className="text-xl font-mono text-white mt-1 block">{ipos.length} Issues</strong>
              <span className="text-[10px] text-cyan-400 font-mono">Mainboard &amp; Marquee</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">High Conviction Buys</span>
              <strong className="text-xl font-mono text-emerald-400 mt-1 block">
                {ipos.filter(i => i.verdict?.action === 'APPLY_HIGH_CONVICTION').length} Issues
              </strong>
              <span className="text-[10px] text-emerald-400 font-mono">Waaree, NTPC Green, Tata EV</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Peak Listing Pop (GMP)</span>
              <strong className="text-xl font-mono text-cyan-300 mt-1 block">
                +{Math.max(0, ...ipos.map(i => i.gmp?.listingGainPct || 0)).toFixed(1)}%
              </strong>
              <span className="text-[10px] text-cyan-400 font-mono">Chittorgarh Live Syndicate</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Fresh Growth Capital</span>
              <strong className="text-xl font-mono text-purple-300 mt-1 block">
                ₹{(ipos.reduce((acc, i) => acc + (i.issueSize?.freshIssueCr || 0), 0) / 1000).toFixed(1)}k Cr
              </strong>
              <span className="text-[10px] text-purple-400 font-mono">Entering Company Coffers</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `All Issues (${ipos.length})` },
                { id: 'OPEN', label: `⚡ Bidding Open (${ipos.filter(i => i.dates?.status === 'OPEN').length})` },
                { id: 'UPCOMING', label: `⏳ Upcoming (${ipos.filter(i => i.dates?.status === 'UPCOMING').length})` },
                { id: 'LISTED', label: `🏛️ Listed Archive (${ipos.filter(i => i.dates?.status === 'LISTED' || i.dates?.status === 'CLOSED').length})` },
                { id: 'APPLY_ONLY', label: '🟢 Apply Verdict' },
                { id: 'AVOID_ONLY', label: '🔴 Avoid Verdict' },
                { id: 'HIGH_GMP', label: '🚀 High GMP (>30%)' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setIpoFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    ipoFilter === f.id
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchIpos}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono font-bold transition-all shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingIpos ? 'animate-spin' : ''}`} />
              <span>Refresh GMP Feeds</span>
            </button>
          </div>

          {/* IPO Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredIpos.map((ipo) => {
              const isHighConviction = ipo.verdict.action === 'APPLY_HIGH_CONVICTION';
              const isListingGains = ipo.verdict.action === 'APPLY_LISTING_GAINS';
              const isAvoid = ipo.verdict.action === 'AVOID';
              const isGmpPositive = ipo.gmp.listingGainPct > 0;

              return (
                <div
                  key={ipo.id}
                  className={`p-5 rounded-3xl bg-slate-900/90 border transition-all duration-300 hover:shadow-2xl flex flex-col justify-between relative group ${
                    isHighConviction
                      ? 'border-emerald-500/50 shadow-emerald-500/5'
                      : isListingGains
                      ? 'border-cyan-500/50 shadow-cyan-500/5'
                      : isAvoid
                      ? 'border-rose-500/40 bg-rose-950/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                            {ipo.sector}
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            ipo.dates.status === 'OPEN'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                              : ipo.dates.status === 'UPCOMING'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : ipo.dates.status === 'LISTED'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {ipo.dates.status === 'OPEN'
                              ? '🟢 BIDDING OPEN'
                              : ipo.dates.status === 'UPCOMING'
                              ? '⏳ UPCOMING'
                              : ipo.dates.status === 'LISTED'
                              ? '🏛️ LISTED (TRADED ON NSE)'
                              : '🔒 CLOSED (AWAITING LISTING)'}
                          </span>
                        </div>
                        <h3 className="text-xl font-black text-white mt-1 font-mono tracking-tight">
                          {ipo.companyName}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                          NSE: <span className="text-slate-200 font-bold">{ipo.symbol}</span> • Issue: ₹{ipo.issueSize.totalCr.toLocaleString('en-IN')} Cr
                        </p>
                      </div>

                      {/* Prominent Clear Verdict Badge */}
                      <div className={`px-3.5 py-2 rounded-2xl border text-right shrink-0 shadow-lg ${
                        isHighConviction
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                          : isListingGains
                          ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                          : isAvoid
                          ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                          : 'bg-amber-950/80 border-amber-500 text-amber-300'
                      }`}>
                        <div className="text-[10px] font-mono uppercase font-bold tracking-wider opacity-80">
                          Clear Verdict
                        </div>
                        <div className="text-sm font-black font-mono mt-0.5">
                          {ipo.verdict.badgeText}
                        </div>
                        <div className="text-[10px] font-mono mt-0.5 opacity-90">
                          Score: <span className="font-bold">{ipo.verdict.overallScore}/100</span> ({ipo.verdict.confidenceLevelPct}% Conf)
                        </div>
                      </div>
                    </div>

                    {/* Key 4-Grid Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                      {/* Price Band & Lot */}
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block font-bold truncate">Price Band</span>
                        <strong className="text-white text-xs sm:text-sm block mt-0.5 font-bold truncate" title={`₹${ipo.priceBand.min} – ₹${ipo.priceBand.max}`}>
                          ₹{ipo.priceBand.min} – ₹{ipo.priceBand.max}
                        </strong>
                        <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                          {ipo.lotSize} shs (₹{ipo.minInvestment.toLocaleString('en-IN')})
                        </span>
                      </div>

                      {/* GMP Gain */}
                      <div className={`p-3 rounded-2xl bg-slate-950 border min-w-0 overflow-hidden ${
                        isGmpPositive ? 'border-emerald-500/30' : 'border-rose-500/30'
                      }`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-400 text-[10px] block font-bold truncate">Live GMP</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 whitespace-nowrap ${
                            ipo.gmp.gmpTrend === 'SURGING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {ipo.gmp.gmpTrend}
                          </span>
                        </div>
                        <strong className={`text-xs sm:text-sm block mt-0.5 font-bold truncate ${
                          isGmpPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`} title={`${isGmpPositive ? `+₹${ipo.gmp.currentGmp}` : `₹${ipo.gmp.currentGmp}`} (${ipo.gmp.listingGainPct > 0 ? `+${ipo.gmp.listingGainPct}%` : `${ipo.gmp.listingGainPct}%`})`}>
                          {isGmpPositive ? `+₹${ipo.gmp.currentGmp}` : `₹${ipo.gmp.currentGmp}`} ({ipo.gmp.listingGainPct > 0 ? `+${ipo.gmp.listingGainPct}%` : `${ipo.gmp.listingGainPct}%`})
                        </strong>
                        <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                          Est: ₹{ipo.gmp.listingEstimate}
                        </span>
                      </div>

                      {/* Issue Structure: Fresh vs OFS */}
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block font-bold truncate">Fresh vs OFS</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden flex">
                            <div
                              style={{ width: `${100 - ipo.issueSize.ofsPct}%` }}
                              className="bg-emerald-500 h-full"
                              title={`Fresh: ₹${ipo.issueSize.freshIssueCr} Cr`}
                            />
                            <div
                              style={{ width: `${ipo.issueSize.ofsPct}%` }}
                              className="bg-rose-500 h-full"
                              title={`OFS: ₹${ipo.issueSize.ofsCr} Cr`}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-300 block mt-1 truncate">
                          {Math.round(100 - ipo.issueSize.ofsPct)}% Fresh / {ipo.issueSize.ofsPct}% OFS
                        </span>
                      </div>

                      {/* Subscription Velocity */}
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                        <span className="text-slate-400 text-[10px] block font-bold truncate">Subscription</span>
                        <strong className="text-cyan-300 text-xs sm:text-sm block mt-0.5 font-bold truncate">
                          {ipo.subscription.totalTimes > 0 ? `${ipo.subscription.totalTimes}x Total` : 'Upcoming'}
                        </strong>
                        <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                          QIB: {ipo.subscription.qibTimes}x | NII: {ipo.subscription.niiTimes}x
                        </span>
                      </div>
                    </div>

                    {/* Forensics Strip: Peer Valuation & Returns */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Valuation vs Peers</span>
                        <span className="text-slate-200 font-bold">
                          P/E: <span className={ipo.financials.peRatio < ipo.financials.industryPe ? 'text-emerald-400' : 'text-rose-400'}>
                            {ipo.financials.peRatio > 0 ? `${ipo.financials.peRatio}x` : 'Loss-Making'}
                          </span> (Ind: {ipo.financials.industryPe}x)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Capital Efficiency</span>
                        <span className="text-slate-200 font-bold">
                          ROCE: <span className="text-emerald-400">{ipo.financials.rocePct}%</span> • ROE: <span className="text-cyan-400">{ipo.financials.roePct}%</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Growth &amp; Leverage</span>
                        <span className="text-slate-200 font-bold">
                          CAGR: <span className="text-purple-400">+{ipo.financials.revenueCagr3Yr}%</span> • D/E: <span className="text-slate-300">{ipo.financials.debtToEquity}</span>
                        </span>
                      </div>
                    </div>

                    {/* Multi-Source Public Data Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700">
                        Chittorgarh: <strong className="text-emerald-400">{ipo.multiSourceIntelligence.chittorgarhGmpRating}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700">
                        Value Research: <strong className="text-cyan-400">{ipo.multiSourceIntelligence.valueResearchRating}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700">
                        Trendlyne Score: <strong className="text-purple-400">{ipo.multiSourceIntelligence.trendlyneValuationScore}/100</strong>
                      </span>
                    </div>

                    {/* Executive Summary Rationale */}
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 break-words">
                      {ipo.verdict.summaryRationale}
                    </p>

                    {/* Bidding Strategy Callout */}
                    <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-200 text-xs font-mono flex items-start gap-2">
                      <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <strong className="text-cyan-300 block">Actionable Bidding Strategy:</strong>
                        <span className="text-[11px] text-slate-300 mt-0.5 block break-words">{ipo.verdict.biddingStrategy}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2.5 mt-4 min-w-0">
                    <button
                      onClick={() => setSelectedIpo(ipo)}
                      className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono font-bold transition-all border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>360° Forensic &amp; Peers</span>
                    </button>
                    {ipo.dates.status === 'LISTED' ? (
                      <button
                        onClick={() => setSelectedStock(ipo.symbol)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-mono font-bold bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 transition-all flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                        title={`View ${ipo.symbol} secondary market trading & momentum`}
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                        <span>Traded on NSE ({ipo.symbol})</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setBidModalIpo(ipo);
                          setBidCategory('RETAIL');
                          setBidLotsCount(1);
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-mono font-black transition-all flex items-center justify-center gap-1.5 shadow-lg cursor-pointer ${
                          isHighConviction || isListingGains
                            ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Simulate Paper Bid (₹{ipo.minInvestment.toLocaleString('en-IN')})</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── SUB-TAB 8: PORTFOLIO REBALANCE & SWITCH ENGINE ─── */}
      {activePortalTab === 'PORTFOLIO_REBALANCE' && (
        <div className="space-y-6 animate-fadeIn font-mono">
          {/* Rebalance Toast */}
          {switchSuccessMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{switchSuccessMsg}</span>
              </div>
              <button onClick={() => setSwitchSuccessMsg(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
          )}

          {/* Sub-Header Banner */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase font-bold tracking-widest">
                <RefreshCw className="w-4 h-4" />
                <span>Intelligent Capital Redeployment &amp; Tax Alpha Engine</span>
              </div>
              <h2 className="text-xl font-black text-white mt-1">
                Portfolio Rebalancing: Dead Weight ➔ Greenfield &amp; IPO Redeployment
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
                Diagnoses your real portfolio holdings to identify structural laggards and over-concentrations, harvesting tax losses to shelter realized gains while rotating capital into high-conviction Greenfield Compounders and sovereign IPOs.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={rebalancePortfolioFilter}
                onChange={e => {
                  setRebalancePortfolioFilter(e.target.value);
                  fetchRebalanceReport(e.target.value);
                }}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold cursor-pointer focus:border-cyan-500"
              >
                <option value="ALL">All Family Portfolios (Combined)</option>
                <option value="Papa">Papa Portfolio</option>
                <option value="Maa">Maa Portfolio</option>
                <option value="Self HDFC Securities">Self HDFC Securities</option>
              </select>
              <button
                onClick={() => fetchRebalanceReport(rebalancePortfolioFilter)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
                title="Refresh Rebalance Analysis"
              >
                <RefreshCw className={`w-4 h-4 ${loadingRebalance ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-rose-500/20">
              <span className="text-[10px] text-slate-400 uppercase block font-bold">Trapped in Laggards</span>
              <strong className="text-sm font-black text-rose-400 mt-1 block">
                {rebalanceReport?.summary ? formatINR(rebalanceReport.summary.totalTrappedInLaggardsInr) : '₹1,76,46,727'}
              </strong>
              <span className="text-[10px] text-rose-500 block mt-0.5 font-sans">
                {rebalanceReport?.summary?.laggardCount || 3} Broken Base Holdings
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/20">
              <span className="text-[10px] text-slate-400 uppercase block font-bold">Over-Concentrated</span>
              <strong className="text-sm font-black text-amber-300 mt-1 block">
                {rebalanceReport?.summary ? formatINR(rebalanceReport.summary.totalOverconcentratedCapitalInr) : '₹4,42,80,000'}
              </strong>
              <span className="text-[10px] text-amber-500 block mt-0.5 font-sans">
                {rebalanceReport?.summary?.overconcentratedCount || 1} Micro-Cap Runners
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30">
              <span className="text-[10px] text-slate-400 uppercase block font-bold">Tax-Loss Harvesting</span>
              <strong className="text-sm font-black text-emerald-400 mt-1 block">
                {rebalanceReport?.summary ? formatINR(rebalanceReport.summary.totalPotentialTaxSavingsInr) : '₹23,89,312'}
              </strong>
              <span className="text-[10px] text-emerald-500 block mt-0.5 font-sans">
                20% STCG / 12.5% LTCG Shelter
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30">
              <span className="text-[10px] text-slate-400 uppercase block font-bold">Deployable Capital</span>
              <strong className="text-sm font-black text-cyan-300 mt-1 block">
                {rebalanceReport?.summary ? formatINR(rebalanceReport.summary.totalCapitalDeployableInr) : '₹2,38,46,727'}
              </strong>
              <span className="text-[10px] text-cyan-500 block mt-0.5 font-sans">
                Net Rebalance Inflow
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-purple-500/30 col-span-2 md:col-span-1">
              <span className="text-[10px] text-slate-400 uppercase block font-bold">12-Mo Alpha Uplift</span>
              <strong className="text-sm font-black text-purple-300 mt-1 block">
                +{rebalanceReport?.summary ? formatINR(rebalanceReport.summary.projected12MonthAlphaUpliftInr) : '₹1,43,76,572'}
              </strong>
              <span className="text-[10px] text-purple-400 font-bold block mt-0.5 font-sans">
                +{rebalanceReport?.summary?.avgAlphaUpliftPct || 72.9}% Net Alpha Yield
              </span>
            </div>
          </div>

          {/* Intelligent Paired Switch Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Curated Capital Redeployment Switches (Paired Transfers)</span>
              </h3>
              <span className="text-xs text-slate-400">
                {rebalanceReport?.switches?.length || 0} Recommended High-Conviction Switches
              </span>
            </div>

            {loadingRebalance ? (
              <div className="py-16 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-slate-800">
                <RefreshCw className="w-7 h-7 mx-auto mb-2 text-cyan-400 animate-spin" />
                <p className="text-xs">Computing Portfolio Cross-Correlation &amp; Tax Alpha...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rebalanceReport?.switches?.map((sw: any) => {
                  const isSimulating = simulatingSwitchId === sw.id;
                  return (
                    <div
                      key={sw.id}
                      className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-xl space-y-4"
                    >
                      {/* Top Conviction Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            {sw.conviction} CONVICTION SWITCH
                          </span>
                          <span className="text-xs text-slate-400">
                            ID: <span className="text-slate-300 font-bold">{sw.id}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-xl">
                            Tax Alpha: +₹{sw.financialMetrics.taxHarvestingSavingsInr.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs font-bold text-purple-300 bg-purple-950/80 border border-purple-500/30 px-3 py-1 rounded-xl">
                            +{sw.financialMetrics.netAlphaYieldUpliftPct}% Net Alpha
                          </span>
                        </div>
                      </div>

                      {/* Paired 3-Column Transfer Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                        {/* Source Holding (Left - 5 Cols) */}
                        <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Source Leg (Exit / Trim)</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold whitespace-nowrap shrink-0">
                              Portfolio: {sw.sourceHolding.portfolio}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-base font-black text-white truncate">{sw.sourceHolding.symbol}</h4>
                            <p className="text-xs text-slate-400 truncate" title={sw.sourceHolding.companyName}>{sw.sourceHolding.companyName}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                            <div className="min-w-0 overflow-hidden">
                              <span className="text-[10px] text-slate-500 block truncate">Capital to Free:</span>
                              <strong className="text-white truncate block" title={`₹${sw.sourceHolding.capitalFreed.toLocaleString('en-IN')}`}>
                                ₹{sw.sourceHolding.capitalFreed.toLocaleString('en-IN')}
                              </strong>
                              <span className="text-[10px] text-slate-400 block font-sans truncate">({sw.sourceHolding.sharesToTrim.toLocaleString('en-IN')} shares)</span>
                            </div>
                            <div className="min-w-0 overflow-hidden">
                              <span className="text-[10px] text-slate-500 block truncate">Drawdown / Gain:</span>
                              <strong className={`truncate block ${sw.sourceHolding.unrealizedPnlPct < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {sw.sourceHolding.unrealizedPnlPct < 0 ? '' : '+'}{sw.sourceHolding.unrealizedPnlPct}%
                              </strong>
                              <span className="text-[10px] text-slate-400 block truncate" title={`(₹${sw.sourceHolding.currentUnrealizedPnl.toLocaleString('en-IN')})`}>
                                (₹{sw.sourceHolding.currentUnrealizedPnl.toLocaleString('en-IN')})
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-300 font-sans leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 break-words">
                            <strong>Technical Diagnosis:</strong> {sw.sourceHolding.futureOutlook}
                          </div>
                        </div>

                        {/* Middle Transfer Arrow & Metrics (2 Cols) */}
                        <div className="lg:col-span-2 flex flex-col items-center justify-center text-center space-y-2 py-2">
                          <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/10">
                            <ArrowRight className="w-5 h-5 hidden lg:block" />
                            <ChevronDown className="w-5 h-5 lg:hidden" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block font-bold">Capital Redeployed</span>
                            <span className="text-xs font-black text-cyan-300">
                              ₹{sw.financialMetrics.capitalFreedInr.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap">
                            100% Tax Shielded
                          </div>
                        </div>

                        {/* Destination Candidate (Right - 5 Cols) */}
                        <div className="lg:col-span-5 p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2.5 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span className="truncate">Destination ({sw.destinationCandidate.type === 'UPCOMING_IPO' ? 'IPO' : 'Stock'})</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold whitespace-nowrap shrink-0">
                              {sw.destinationCandidate.convictionBadge}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-base font-black text-white truncate">{sw.destinationCandidate.symbol}</h4>
                            <p className="text-xs text-slate-400 truncate" title={`${sw.destinationCandidate.companyName} • ${sw.destinationCandidate.sector}`}>
                              {sw.destinationCandidate.companyName} • {sw.destinationCandidate.sector}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-cyan-900/40">
                            <div className="min-w-0 overflow-hidden">
                              <span className="text-[10px] text-slate-400 block truncate">Entry / Cut-Off:</span>
                              <strong className="text-white truncate block">₹{sw.destinationCandidate.currentPrice.toLocaleString('en-IN')}</strong>
                              <span className="text-[10px] text-cyan-400 block truncate">Target: ₹{sw.destinationCandidate.targetPrice.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="min-w-0 overflow-hidden">
                              <span className="text-[10px] text-slate-400 block truncate">Projected Upside:</span>
                              <strong className="text-emerald-400 font-bold truncate block">+{sw.destinationCandidate.projectedReturnPct}%</strong>
                              <span className="text-[10px] text-purple-300 block truncate">Est: +₹{sw.financialMetrics.projected12MonthNetGainInr.toLocaleString('en-IN')}</span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-300 font-sans leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 break-words">
                            <strong>Moat &amp; Catalyst:</strong> {sw.destinationCandidate.moatDescription}
                          </div>
                        </div>
                      </div>

                      {/* Strategic Rationale & Tax Synergy Footer */}
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs min-w-0">
                        <div className="space-y-1 font-sans min-w-0 flex-1">
                          <p className="text-slate-300 text-xs leading-relaxed break-words">
                            <strong className="text-cyan-300 font-mono">Strategic Rationale:</strong> {sw.rationale}
                          </p>
                          <p className="text-emerald-400 text-[11px] break-words">
                            <strong className="font-mono">Tax Synergy:</strong> {sw.financialMetrics.taxHarvestingSynergy}
                          </p>
                        </div>

                        <button
                          onClick={() => handleSimulateSwitch(sw.id)}
                          disabled={isSimulating}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs font-mono transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2 shrink-0"
                        >
                          <Zap className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                          <span>{isSimulating ? 'Simulating Switch...' : 'Simulate Switch in Sandbox'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Full Portfolio Holding Health Check & Diagnostic Matrix */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Portfolio Holdings Diagnostic &amp; Health Matrix</span>
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Automated diagnosis of every active equity holding against momentum benchmarks and capital efficiency thresholds.
                </p>
              </div>

              {/* Classification Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                {[
                  { id: 'ALL', label: 'All Holdings' },
                  { id: 'SEVERE_LAGGARD', label: 'Severe Laggards' },
                  { id: 'OVER_CONCENTRATED_RUNNER', label: 'Over-Concentrated' },
                  { id: 'MODERATE_DRAG', label: 'Moderate Drag' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setRebalanceFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                      rebalanceFilter === f.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Holdings Diagnostic Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="p-3">Holding / Company</th>
                    <th className="p-3">Portfolio</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Current Value</th>
                    <th className="p-3 text-right">Total Cost</th>
                    <th className="p-3 text-right">P&amp;L (₹ &amp; %)</th>
                    <th className="p-3 text-right">Weight</th>
                    <th className="p-3 text-center">Diagnosis</th>
                    <th className="p-3 text-right">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalanceReport?.diagnostics
                    ?.filter((d: any) => rebalanceFilter === 'ALL' || d.classification === rebalanceFilter)
                    ?.map((h: any, idx: number) => {
                      const isLaggard = h.classification === 'SEVERE_LAGGARD';
                      const isOvercon = h.classification === 'OVER_CONCENTRATED_RUNNER';
                      return (
                        <tr
                          key={idx}
                          className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-all text-slate-300"
                        >
                          <td className="p-3">
                            <strong className="text-white block font-bold">{h.symbol}</strong>
                            <span className="text-[10px] text-slate-400 font-sans">{h.companyName}</span>
                          </td>
                          <td className="p-3 text-slate-400">{h.portfolio}</td>
                          <td className="p-3 text-right text-slate-300">{h.quantity.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right font-bold text-white">₹{h.currentValue.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right text-slate-400">₹{h.totalCost.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right">
                            <span className={`font-bold block ${h.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {h.unrealizedPnl >= 0 ? '+' : ''}₹{h.unrealizedPnl.toLocaleString('en-IN')}
                            </span>
                            <span className={`text-[10px] ${h.unrealizedPnlPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              ({h.unrealizedPnlPct >= 0 ? '+' : ''}{h.unrealizedPnlPct}%)
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-cyan-300">{h.portfolioWeightPct}%</td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              isLaggard
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isOvercon
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}>
                              {h.classification}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                              h.recommendedAction === 'FULL_EXIT_TAX_HARVEST'
                                ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                                : h.recommendedAction === 'TRIM_PROFIT_25PCT'
                                ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}>
                              {h.recommendedAction}
                            </span>
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

      {/* ─── SUB-TAB 9: MULTIBAGGER DISCOVERY & QUANTITATIVE RADAR ─── */}
      {activePortalTab === 'MULTIBAGGER_RADAR' && (
        <MultibaggerScreenerView onNavigateToOrder={onNavigateToOrder} />
      )}

      {/* ─── MODAL 1: 360° DOSSIER, CHART & MULTI-PORTAL REASONING ─── */}
      {selectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-white font-mono">{selectedStock.symbol}</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold">
                    {selectedStock.compositeConviction?.recommendationBadge || 'Prime Opportunity'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedStock.companyName} • {selectedStock.sector} • CMP ₹{selectedStock.currentPrice}
                </p>
              </div>
              <button
                onClick={() => setSelectedStock(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              {[
                { id: 'CHART_MOMENTUM', label: 'Momentum & Chart Overlay' },
                { id: 'FUNDAMENTALS', label: 'Fundamental Forensics' },
                { id: 'MULTI_PORTAL', label: 'Multi-Source Public Data' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setDetailModalTab(t.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    detailModalTab === t.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Tab 1: Chart */}
            {detailModalTab === 'CHART_MOMENTUM' && (
              <div className="space-y-4">
                <TradingViewChartWidget
                  symbol={selectedStock.symbol}
                  height={380}
                  interval="D"
                  supportPrice={selectedStock.pointZeroStopLoss}
                  resistancePrice={selectedStock.base?.baseHigh}
                  momentumScore={selectedStock.probabilityScore}
                />
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs text-slate-300">
                  <div className="font-bold text-cyan-300 uppercase tracking-wider">3-Tranche Execution Plan:</div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block">Tranche 1 (33.3%)</span>
                      <strong className="text-cyan-300">₹{selectedStock.tranches?.[0]?.triggerPrice}</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Base Compaction Limit</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block">Tranche 2 (33.3%)</span>
                      <strong className="text-purple-300">₹{selectedStock.tranches?.[1]?.triggerPrice}</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5">EMA 9/21 Cross &amp; RSI&gt;60</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block">Tranche 3 (33.4%)</span>
                      <strong className="text-emerald-300">₹{selectedStock.tranches?.[2]?.triggerPrice}</strong>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Base Breakout on 1.5x Vol</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Tab 2: Fundamentals */}
            {detailModalTab === 'FUNDAMENTALS' && selectedStock.fundamental && (
              <div className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">ROCE (%)</span>
                    <strong className="text-emerald-400 text-base font-bold">{selectedStock.fundamental.metrics.roce}%</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">ROE (%)</span>
                    <strong className="text-emerald-400 text-base font-bold">{selectedStock.fundamental.metrics.roe}%</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Debt to Equity</span>
                    <strong className="text-cyan-300 text-base font-bold">{selectedStock.fundamental.metrics.debtToEquity}</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Piotroski F-Score</span>
                    <strong className="text-purple-300 text-base font-bold">{selectedStock.fundamental.metrics.piotroskiScore}/9</strong>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-emerald-300">Key Balance Sheet Strengths:</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    {selectedStock.fundamental.strengths?.map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Modal Tab 3: Multi-Portal */}
            {detailModalTab === 'MULTI_PORTAL' && selectedStock.multiSourceData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-blue-400 flex items-center justify-between">
                    <span>Moneycontrol</span>
                    <span className="text-[10px] text-emerald-400 font-bold">{selectedStock.multiSourceData.moneycontrol.consensusRecommendation}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Peer Valuation: {selectedStock.multiSourceData.moneycontrol.peVsPeerMedian}</div>
                  <div className="text-[11px] text-slate-400">Financials Health Score: {selectedStock.multiSourceData.moneycontrol.financialsScore}/100</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center justify-between">
                    <span>NSE &amp; BSE Archives</span>
                    <span className="text-[10px] text-cyan-400 font-bold">{selectedStock.multiSourceData.nseBseArchives.deliveryVolumePct}% Delivery</span>
                  </div>
                  <div className="text-[11px] text-slate-300">{selectedStock.multiSourceData.nseBseArchives.bulkBlockActivity}</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-purple-400 flex items-center justify-between">
                    <span>Trendlyne DVM</span>
                    <span className="text-[10px] text-purple-300 font-bold">{selectedStock.multiSourceData.trendlyne.dvmRank}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Durability: {selectedStock.multiSourceData.trendlyne.durabilityScore} | Valuation: {selectedStock.multiSourceData.trendlyne.valuationScore} | Momentum: {selectedStock.multiSourceData.trendlyne.momentumScore}</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-indigo-400 flex items-center justify-between">
                    <span>Tickertape</span>
                    <span className="text-[10px] text-emerald-400 font-bold">{selectedStock.multiSourceData.tickertape.intrinsicValueStatus}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Accounting Quality: {selectedStock.multiSourceData.tickertape.accountingQuality} ({selectedStock.multiSourceData.tickertape.redFlagsCount} Red Flags)</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 2: 1-TAP STAGGERED ORDER TICKET ─── */}
      {orderTicketStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xl font-black text-white font-mono flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-400" />
                  <span>Arm 3-Tranche Staggered Order</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{orderTicketStock.symbol} • {orderTicketStock.companyName}</p>
              </div>
              <button onClick={() => setOrderTicketStock(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            {orderSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold text-center">
                {orderSuccessMsg}
              </div>
            ) : (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1.5">Total Strategy Allocation Capital (INR)</label>
                  <input
                    type="number"
                    value={orderCapital}
                    onChange={e => setOrderCapital(Number(e.target.value))}
                    step={25000}
                    min={50000}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono font-bold text-base focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Capital is divided equally into 3 tranches: ₹{(orderCapital / 3).toLocaleString('en-IN')} per tranche.
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-slate-300 text-[11px]">
                  <div className="flex justify-between">
                    <span>Tranche 1 (Base Limit):</span>
                    <strong className="text-cyan-300">₹{orderTicketStock.tranches?.[0]?.triggerPrice}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Tranche 2 (EMA Cross):</span>
                    <strong className="text-purple-300">₹{orderTicketStock.tranches?.[1]?.triggerPrice}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Tranche 3 (Breakout):</span>
                    <strong className="text-emerald-300">₹{orderTicketStock.tranches?.[2]?.triggerPrice}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-2 text-rose-400">
                    <span>Stop-Loss Anchor (P0):</span>
                    <strong>₹{orderTicketStock.pointZeroStopLoss} (-{orderTicketStock.structuralRiskPct}%)</strong>
                  </div>
                </div>

                <button
                  onClick={handleArmStaggeredOrder}
                  disabled={orderSubmitting}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  {orderSubmitting ? 'Arming Bracket Container...' : 'Confirm & Deploy 3-Tranche Parent Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 3: 360° IPO FORENSIC ANALYSIS & PEER COMPARISON ─── */}
      {selectedIpo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-white font-mono">{selectedIpo.companyName}</h3>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    selectedIpo.verdict.action === 'APPLY_HIGH_CONVICTION'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : selectedIpo.verdict.action === 'APPLY_LISTING_GAINS'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : selectedIpo.verdict.action === 'AVOID'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {selectedIpo.verdict.badgeText}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  NSE: {selectedIpo.symbol} • {selectedIpo.sector} • Price Band: ₹{selectedIpo.priceBand.min} – ₹{selectedIpo.priceBand.max} • Score: {selectedIpo.verdict.overallScore}/100
                </p>
              </div>
              <button
                onClick={() => setSelectedIpo(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              {[
                { id: 'VERDICT_PEERS', label: 'Valuation & Listed Peers' },
                { id: 'STRUCTURE', label: 'Issue Structure & Dates' },
                { id: 'SOURCES', label: 'Multi-Portal Ratings' },
                { id: 'RISKS', label: 'Strengths & Red Flags' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setIpoModalTab(t.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    ipoModalTab === t.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Valuation & Peers */}
            {ipoModalTab === 'VERDICT_PEERS' && (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <h4 className="text-sm font-bold text-white mb-2">Listed Industry Peer Comparison Matrix</h4>
                  <div className="overflow-x-auto border border-slate-800 rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                          <th className="p-3">Company</th>
                          <th className="p-3 text-right">P/E Ratio</th>
                          <th className="p-3 text-right">P/B Ratio</th>
                          <th className="p-3 text-right">ROE (%)</th>
                          <th className="p-3 text-right">3-Yr CAGR (%)</th>
                          <th className="p-3 text-right">M-Cap (₹ Cr)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIpo.peerComparison.map((peer: any, idx: number) => {
                          const isTarget = peer.company.includes(selectedIpo.companyName.split(' ')[0]);
                          return (
                            <tr
                              key={idx}
                              className={`border-b border-slate-800/60 ${
                                isTarget ? 'bg-cyan-950/40 font-bold text-cyan-300' : 'text-slate-300 hover:bg-slate-800/30'
                              }`}
                            >
                              <td className="p-3 flex items-center gap-2">
                                {isTarget && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>}
                                <span>{peer.company}</span>
                              </td>
                              <td className="p-3 text-right">
                                {peer.pe > 0 ? `${peer.pe}x` : 'Loss-Making'}
                              </td>
                              <td className="p-3 text-right">{peer.pb}x</td>
                              <td className="p-3 text-right text-emerald-400">{peer.roePct}%</td>
                              <td className="p-3 text-right text-purple-400">+{peer.revenueCagr3Yr}%</td>
                              <td className="p-3 text-right">₹{peer.marketCapCr.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold block">
                    Institutional &amp; Smart Money Perspective:
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedIpo.verdict.smartMoneyView}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Issue Structure & Dates */}
            {ipoModalTab === 'STRUCTURE' && (
              <div className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Total Issue Size</span>
                    <strong className="text-white text-sm">₹{selectedIpo.issueSize.totalCr.toLocaleString('en-IN')} Cr</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Fresh Growth Capital</span>
                    <strong className="text-emerald-400 text-sm">₹{selectedIpo.issueSize.freshIssueCr.toLocaleString('en-IN')} Cr</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Offer For Sale (OFS)</span>
                    <strong className="text-rose-400 text-sm">₹{selectedIpo.issueSize.ofsCr.toLocaleString('en-IN')} Cr ({selectedIpo.issueSize.ofsPct}%)</strong>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Lot Size &amp; Min Bid</span>
                    <strong className="text-cyan-300 text-sm">{selectedIpo.lotSize} shs (₹{selectedIpo.minInvestment.toLocaleString('en-IN')})</strong>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase">Issue Lifecycle &amp; Key Timeline</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">Issue Opens</span>
                      <strong className="text-cyan-300">{selectedIpo.dates.openDate}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">Issue Closes</span>
                      <strong className="text-cyan-300">{selectedIpo.dates.closeDate}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">Basis of Allotment</span>
                      <strong className="text-white">{selectedIpo.dates.allotmentDate}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">Initiation of Refunds</span>
                      <strong className="text-white">{selectedIpo.dates.refundDate}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">Listing on NSE/BSE</span>
                      <strong className="text-emerald-400">{selectedIpo.dates.listingDate}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Multi-Portal Consensus */}
            {ipoModalTab === 'SOURCES' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center justify-between">
                    <span>Chittorgarh IPO &amp; Grey Market</span>
                    <span className="text-[10px] text-emerald-300">{selectedIpo.multiSourceIntelligence.chittorgarhGmpRating}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Live GMP: +₹{selectedIpo.gmp.currentGmp} ({selectedIpo.gmp.listingGainPct}%)</div>
                  <div className="text-[11px] text-slate-400">Trend Status: {selectedIpo.gmp.gmpTrend}</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-cyan-400 flex items-center justify-between">
                    <span>Value Research Online</span>
                    <span className="text-[10px] text-cyan-300">{selectedIpo.multiSourceIntelligence.valueResearchRating}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Governance &amp; Financial Check: Verified</div>
                  <div className="text-[11px] text-slate-400">Suitability: {selectedIpo.verdict.suitability}</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-purple-400 flex items-center justify-between">
                    <span>Trendlyne Valuation &amp; DVM</span>
                    <span className="text-[10px] text-purple-300 font-bold">{selectedIpo.multiSourceIntelligence.trendlyneValuationScore}/100</span>
                  </div>
                  <div className="text-[11px] text-slate-300">ROCE: {selectedIpo.financials.rocePct}% | ROE: {selectedIpo.financials.roePct}%</div>
                  <div className="text-[11px] text-slate-400">Debt-to-Equity: {selectedIpo.financials.debtToEquity}</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-bold text-indigo-400 flex items-center justify-between">
                    <span>Pulse by Zerodha &amp; Community</span>
                    <span className="text-[10px] text-indigo-300">{selectedIpo.multiSourceIntelligence.institutionalAppetite} Appetite</span>
                  </div>
                  <div className="text-[11px] text-slate-300">{selectedIpo.multiSourceIntelligence.zerodhaPulseBuzz}</div>
                </div>
              </div>
            )}

            {/* Tab 4: Strengths & Risks */}
            {ipoModalTab === 'RISKS' && (
              <div className="space-y-4 font-mono text-xs">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Key Competitive Moats &amp; Strengths:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    {selectedIpo.verdict.keyStrengths?.map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Key Risks &amp; Governance Red Flags:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                    {selectedIpo.verdict.keyRisks?.map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Modal Bottom CTA */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-mono">
                Bidding at Cut-Off Price (₹{selectedIpo.priceBand.max}) is mandatory for retail allotment.
              </div>
              <button
                onClick={() => {
                  setBidModalIpo(selectedIpo);
                  setBidCategory('RETAIL');
                  setBidLotsCount(1);
                  setSelectedIpo(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs font-mono transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>Simulate Paper Bid</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: SIMULATE IPO APPLICATION IN PAPER SANDBOX ─── */}
      {bidModalIpo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xl font-black text-white font-mono flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-400" />
                  <span>Simulate IPO Application</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{bidModalIpo.companyName} ({bidModalIpo.symbol})</p>
              </div>
              <button onClick={() => setBidModalIpo(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            {bidSuccessMsg ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold text-center">
                {bidSuccessMsg}
              </div>
            ) : (
              <div className="space-y-4 font-mono text-xs">
                {/* Category Selection */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1.5">Investor Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBidCategory('RETAIL');
                        setBidLotsCount(1);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        bidCategory === 'RETAIL'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <strong className="block text-xs text-white">Retail Individual</strong>
                      <span className="text-[10px] opacity-75">1 Lot (₹{bidModalIpo.minInvestment.toLocaleString('en-IN')})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBidCategory('HNI');
                        setBidLotsCount(14);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        bidCategory === 'HNI'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <strong className="block text-xs text-white">Small HNI (sHNI)</strong>
                      <span className="text-[10px] opacity-75">14 Lots (~₹{(bidModalIpo.minInvestment * 14).toLocaleString('en-IN')})</span>
                    </button>
                  </div>
                </div>

                {/* Lots & Shares Summary Box */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-slate-300 text-[11px]">
                  <div className="flex justify-between">
                    <span>Lots Applied:</span>
                    <strong className="text-white">{bidLotsCount} Lot(s) ({bidLotsCount * bidModalIpo.lotSize} Shares)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Bid Price (Cut-off):</span>
                    <strong className="text-cyan-300">₹{bidModalIpo.priceBand.max}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5">
                    <span>Total Virtual Capital:</span>
                    <strong className="text-emerald-400 font-bold">
                      ₹{(bidLotsCount * bidModalIpo.lotSize * bidModalIpo.priceBand.max).toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div className="flex justify-between text-cyan-300">
                    <span>Expected Listing Gain (GMP):</span>
                    <strong>+₹{(bidLotsCount * bidModalIpo.lotSize * Math.max(0, bidModalIpo.gmp.currentGmp)).toLocaleString('en-IN')} (+{bidModalIpo.gmp.listingGainPct}%)</strong>
                  </div>
                </div>

                <button
                  onClick={handleSimulateIpoBid}
                  disabled={bidSubmitting}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>{bidSubmitting ? 'Placing Simulated Bid...' : 'Confirm Simulated Application in Sandbox'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GreenfieldInvestmentPortal;
