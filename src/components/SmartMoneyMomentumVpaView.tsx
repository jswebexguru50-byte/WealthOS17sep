import React, { useState, useEffect } from 'react';
import {
  Flame,
  TrendingUp,
  Target,
  Shield,
  ShieldAlert,
  Zap,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ArrowUpRight,
  Sliders,
  RefreshCw,
  Search,
  Check,
  X,
  ChevronRight,
  Info,
  DollarSign,
  Clock,
  ArrowRight,
  BarChart2,
  Crosshair,
  Sparkles
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';

export interface MacroRegimeData {
  regime: 'NORMAL' | 'BEARISH';
  benchmarkSymbol: string;
  currentClose: number;
  sma50: number;
  ratio: number;
  emergencyStopArmed: boolean;
  emergencyStopLossPct: number;
  description: string;
}

export interface TrancheInfo {
  trancheNumber: 1 | 2 | 3;
  allocationPct: number;
  triggerType: string;
  triggerPrice: number;
  orderType: string;
  status: string;
  conditionMet: boolean;
  conditionDetails: string;
  fillPrice?: number;
  fillQuantity?: number;
}

export interface MomentumVpaItem {
  symbol: string;
  companyName: string;
  currentPrice: number;
  stage: 'IMPULSE_ACTIVE' | 'COMPACTING_BASE' | 'ACTIONABLE_TRANCHE_READY' | 'REJECTED';
  stageBadge: string;
  activeActionBadge: string;
  macroRegime: MacroRegimeData;
  impulse: {
    qualified: boolean;
    pointZero: number;
    impulsePeak: number;
    impulseDurationBars: number;
    priceExpansionPct: number;
    cumulativeTurnoverCr: number;
    rejectionReason?: string;
  };
  base: {
    qualified: boolean;
    baseDurationBars: number;
    baseDurationWeeks: number;
    baseHigh: number;
    baseLow: number;
    baseSupport: number;
    retracementFloor: number;
    lowestBaseClose: number;
    holdsUpperQuadrant: boolean;
    atrRatio: number;
    volatilityContracted: boolean;
    volumeDryingRatio: number;
    volumeDryingVerified: boolean;
    vpaAsymmetryRatio: number;
    vpaAsymmetryVerified: boolean;
    isNr4OrNr7: boolean;
    status: string;
    rejectionReason?: string;
  };
  tranches: [TrancheInfo, TrancheInfo, TrancheInfo];
  blendedVwap: number;
  pointZeroStopLoss: number;
  structuralRiskPct: number;
  riskGuardrailPasses: boolean;
  targetMinPrice: number;
  targetMaxPrice: number;
  targetBandPct: string;
  emergencyStopPrice: number | null;
  riskRewardRatio: number;
  probabilityScore: number;
  confidenceLevel: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'SPECULATIVE';
  rationale: string[];
  lastUpdated: string;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  symbol: string;
  alertType: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  headline: string;
  message: string;
  price: number;
  p0: number;
  blendedVwap?: number;
}

interface SmartMoneyMomentumVpaViewProps {
  selectedPortfolio?: string;
}

export const SmartMoneyMomentumVpaView: React.FC<SmartMoneyMomentumVpaViewProps> = ({
  selectedPortfolio = 'Combined'
}) => {
  const [items, setItems] = useState<MomentumVpaItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStage, setSelectedStage] = useState<'ALL' | 'ACTIONABLE_TRANCHE_READY' | 'COMPACTING_BASE' | 'IMPULSE_ACTIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItemForModal, setSelectedItemForModal] = useState<MomentumVpaItem | null>(null);
  const [orderModalItem, setOrderModalItem] = useState<MomentumVpaItem | null>(null);
  const [orderCapital, setOrderCapital] = useState<number>(200000);
  const [orderSubmitting, setOrderSubmitting] = useState<boolean>(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [scanRes, alertRes] = await Promise.all([
        fetch('/api/momentum-vpa/scanner'),
        fetch('/api/momentum-vpa/alerts')
      ]);

      const scanJson = await scanRes.json();
      if (scanJson?.success && Array.isArray(scanJson.data)) {
        setItems(scanJson.data);
      }

      const alertJson = await alertRes.json();
      if (alertJson?.success && Array.isArray(alertJson.data)) {
        setAlerts(alertJson.data);
      }
    } catch (err) {
      console.error('Failed to fetch Momentum VPA data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 45000); // 45s refresh
    return () => clearInterval(interval);
  }, []);

  // Filtered items
  const filteredItems = items.filter(item => {
    const matchesStage = selectedStage === 'ALL' || item.stage === selectedStage;
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStage && matchesSearch;
  });

  const activeRegime = items[0]?.macroRegime || {
    regime: 'NORMAL',
    benchmarkSymbol: 'CNX500',
    currentClose: 24500,
    sma50: 23800,
    ratio: 1.03,
    emergencyStopArmed: false,
    emergencyStopLossPct: 0,
    description: 'NORMAL REGIME: CNX500 >= 50-day SMA. Standard execution with Point Zero structural stop-loss.'
  };

  const handleArmOrder = async () => {
    if (!orderModalItem) return;
    setOrderSubmitting(true);
    setOrderSuccessMsg(null);
    try {
      const res = await fetch('/api/momentum-vpa/orders/arm-staggered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderModalItem.symbol,
          portfolio: selectedPortfolio,
          totalCapital: orderCapital
        })
      });
      const data = await res.json();
      if (data?.success) {
        setOrderSuccessMsg(`Successfully armed 3-Tranche Staggered Bracket Order (${data.data.id})! Hard stop pegged at ₹${orderModalItem.pointZeroStopLoss}.`);
        setTimeout(() => {
          setOrderModalItem(null);
          setOrderSuccessMsg(null);
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to arm staggered order:', err);
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 shadow-2xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Flame className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Smart Money Momentum & VPA Trading Engine
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  WOS-FS-MOM-VPA-01
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Institutional Impulse Detector (+20%, ₹50Cr+ turnover) • 3–5 Week VPA Base Compaction • 3-Tranche Pyramiding • Point Zero (P0) Structural Invalidation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition-all cursor-pointer border border-slate-700 shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Universe
          </button>
        </div>
      </div>

      {/* Stage 0: Macro Market Regime Classifier Banner */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-lg ${
        activeRegime.regime === 'BEARISH'
          ? 'bg-rose-950/30 border-rose-500/50 shadow-rose-950/30'
          : 'bg-emerald-950/20 border-emerald-500/30 shadow-emerald-950/20'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${
            activeRegime.regime === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-black uppercase tracking-wider ${
                activeRegime.regime === 'BEARISH' ? 'text-rose-300' : 'text-emerald-300'
              }`}>
                MACRO REGIME: {activeRegime.regime} MODE ({activeRegime.benchmarkSymbol})
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                CMP: ₹{activeRegime.currentClose} | 50-SMA: ₹{activeRegime.sma50}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              {activeRegime.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {activeRegime.regime === 'BEARISH' ? (
            <span className="px-3 py-1 rounded-xl bg-rose-600/30 border border-rose-500/50 text-rose-200 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              EMERGENCY CAP ACTIVE: -12.0% MAX LOSS
            </span>
          ) : (
            <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              POINT ZERO (P0) STRUCTURAL STOP
            </span>
          )}
        </div>
      </div>

      {/* Real-Time Alert Ticker / Notifications */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-2.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400 animate-pulse" />
              ⚡ REAL-TIME MOMENTUM TRADING BREAKS & ALERTS ({alerts.length})
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Live scanning NIFTY 500 universe
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {alerts.slice(0, 6).map(alert => (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs backdrop-blur-sm ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    : alert.severity === 'SUCCESS'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-950/80 border-slate-800 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-bold text-white font-mono flex items-center gap-1.5">
                    {alert.headline}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    {alert.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage Navigation & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 bg-slate-900/60 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Setups', count: items.length },
            {
              id: 'ACTIONABLE_TRANCHE_READY',
              label: '1. Actionable / Tranche Ready',
              count: items.filter(i => i.stage === 'ACTIONABLE_TRANCHE_READY').length,
              color: 'text-emerald-400'
            },
            {
              id: 'COMPACTING_BASE',
              label: '2. Compacting Base (3–5 Wks)',
              count: items.filter(i => i.stage === 'COMPACTING_BASE').length,
              color: 'text-cyan-400'
            },
            {
              id: 'IMPULSE_ACTIVE',
              label: '3. Impulse Active (+20%)',
              count: items.filter(i => i.stage === 'IMPULSE_ACTIVE').length,
              color: 'text-amber-400'
            }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedStage(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedStage === tab.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                selectedStage === tab.id ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search stock by symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
          />
        </div>
      </div>

      {/* Empty State Fallback when filtered list has 0 items */}
      {filteredItems.length === 0 ? (
        <div className="p-10 rounded-3xl bg-slate-900/80 border border-slate-800 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-950/40">
            <Activity className="w-7 h-7 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white font-display">
              No Scrips in {selectedStage === 'ACTIONABLE_TRANCHE_READY' ? 'Actionable / Tranche Ready' : selectedStage === 'IMPULSE_ACTIVE' ? 'Impulse Active' : 'Selected Stage'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Institutional momentum filters require strict ATR range compaction and Point Zero risk containment. Currently, {items.length} setups are actively monitored across the universe.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              onClick={() => setSelectedStage('ALL')}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md shadow-amber-950/30"
            >
              View All {items.length} Setups
            </button>
            <button
              onClick={fetchData}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rescan Universe
            </button>
          </div>
        </div>
      ) : (
        /* Screen 1: Master Momentum & VPA Screener Cards */
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          {filteredItems.map(item => (
            <div
              key={item.symbol}
              className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-4 shadow-xl min-w-0 overflow-hidden"
            >
              {/* Top Row: Symbol, Price, Stage Badge */}
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base font-bold text-white font-mono">{item.symbol}</span>
                    <span className="text-xs text-slate-400 truncate max-w-[160px]">{item.companyName}</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-cyan-300 mt-0.5">
                    ₹{item.currentPrice.toFixed(2)}
                  </div>
                </div>

                <div className="text-right space-y-1 shrink-0">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border inline-block whitespace-nowrap ${
                    item.stage === 'ACTIONABLE_TRANCHE_READY'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                      : item.stage === 'COMPACTING_BASE'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {item.stageBadge}
                  </span>
                  <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                    Prob: <strong className="text-amber-300">{item.probabilityScore}%</strong> ({item.confidenceLevel})
                  </div>
                </div>
              </div>

              {/* Action Indicator Strip */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <Crosshair className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-slate-300 font-bold truncate">{item.activeActionBadge}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] shrink-0">
                  <span>R:R <strong className="text-emerald-400">{item.riskRewardRatio}:1</strong></span>
                  <span>Risk <strong className="text-rose-400">{item.structuralRiskPct}%</strong></span>
                </div>
              </div>

              {/* 3-Tranche Staggered Execution Matrix */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-slate-500">3-Tranche Staggered Ladder (33/33/34%)</span>
                  <span>Blended VWAP: <strong className="text-cyan-300">₹{item.blendedVwap.toFixed(2)}</strong></span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  {item.tranches.map(t => (
                    <div
                      key={t.trancheNumber}
                      className={`p-2.5 rounded-xl border min-w-0 overflow-hidden ${
                        t.status === 'FILLED'
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                          : t.status === 'ARMED'
                          ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span>T{t.trancheNumber} ({t.allocationPct.toFixed(0)}%)</span>
                        <span className="text-[9px] uppercase px-1 rounded bg-slate-800/60">{t.status}</span>
                      </div>
                      <div className="text-xs font-black mt-1 truncate">
                        ₹{t.triggerPrice.toFixed(0)}
                      </div>
                      <div className="text-[9px] opacity-75 mt-0.5 truncate" title={t.conditionDetails}>
                        {t.triggerType.replace(/_/g, ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Levels Strip: P0 Stop, Target Band, R:R */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="text-slate-500 text-[10px] block uppercase truncate">Point Zero (P0) Stop</span>
                  <strong className="text-rose-400 font-bold block mt-0.5 truncate">₹{item.pointZeroStopLoss.toFixed(2)}</strong>
                  <span className="text-[10px] text-slate-500 block truncate">-{item.structuralRiskPct}% Risk</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="text-slate-500 text-[10px] block uppercase truncate">Target (S1A Model) (+20-25%)</span>
                  <strong className="text-emerald-300 font-bold block mt-0.5 truncate">₹{item.targetMinPrice} - {item.targetMaxPrice}</strong>
                  <span className="text-[10px] text-slate-500 block truncate">Mid: ₹{((item.targetMinPrice + item.targetMaxPrice) / 2).toFixed(0)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="text-slate-500 text-[10px] block uppercase truncate">VPA Asymmetry</span>
                  <strong className="text-cyan-300 font-bold block mt-0.5 truncate">{item.base.vpaAsymmetryRatio}x Vol</strong>
                  <span className="text-[10px] text-slate-500 block truncate">{item.base.baseDurationBars} Bars Compacted</span>
                </div>
              </div>

              {/* Bottom Action Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <button
                  onClick={() => setSelectedItemForModal(item)}
                  className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 font-mono transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>View Diagnostic Breakdown</span>
                  <ChevronRight className="w-3 h-3" />
                </button>

                <button
                  onClick={() => setOrderModalItem(item)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-amber-950/40 whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>1-Tap Arm Staggered Order</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screen 2: Interactive Chart Overlay / Diagnostic Modal */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl relative my-8">
            <button
              onClick={() => setSelectedItemForModal(null)}
              className="absolute right-5 top-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <BarChart2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white font-mono flex items-center gap-2">
                  {selectedItemForModal.symbol} • Interactive Momentum & VPA Overlay
                </h2>
                <p className="text-xs text-slate-400">
                  {selectedItemForModal.companyName} • Macro Regime: <strong className="text-amber-300">{selectedItemForModal.macroRegime.regime}</strong>
                </p>
              </div>
            </div>

            {/* Visual Trading Schematic */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                Order-Flow Execution Geometry
              </div>

              {/* Target Band */}
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-between text-emerald-300">
                <span className="font-bold flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-400" />
                  TARGET (S1A Model) (+20% to +25%)
                </span>
                <span className="font-black">₹{selectedItemForModal.targetMinPrice} - ₹{selectedItemForModal.targetMaxPrice}</span>
              </div>

              {/* Tranche 3 Breakout Level */}
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-cyan-200">
                <span>Tranche 3: Breakout High (+0.1% + 1.5x Vol)</span>
                <span className="font-bold">₹{selectedItemForModal.tranches[2].triggerPrice}</span>
              </div>

              {/* Blended VWAP */}
              <div className="p-3 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 flex items-center justify-between text-amber-200">
                <span className="font-bold flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  DYNAMIC BLENDED ENTRY (VWAP)
                </span>
                <span className="font-black text-sm">₹{selectedItemForModal.blendedVwap.toFixed(2)}</span>
              </div>

              {/* Tranche 2 Re-acceleration */}
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-indigo-200">
                <span>Tranche 2: Momentum Re-acceleration (EMA 9/21 + RSI&gt;60)</span>
                <span className="font-bold">₹{selectedItemForModal.tranches[1].triggerPrice}</span>
              </div>

              {/* Tranche 1 Base Compaction Support */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between text-slate-300">
                <span>Tranche 1: Base Compaction Limit @ Support (NR4/NR7)</span>
                <span className="font-bold">₹{selectedItemForModal.tranches[0].triggerPrice}</span>
              </div>

              {/* Point Zero Primary Stop Loss */}
              <div className="p-3 rounded-xl bg-rose-500/15 border-2 border-rose-500/50 flex items-center justify-between text-rose-300">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  PRIMARY STRUCTURAL STOP-LOSS AREA: POINT ZERO (P0)
                </span>
                <span className="font-black text-sm">₹{selectedItemForModal.pointZeroStopLoss} (-{selectedItemForModal.structuralRiskPct}%)</span>
              </div>

              {/* Bearish Emergency Cap */}
              {selectedItemForModal.emergencyStopPrice && (
                <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/30 flex items-center justify-between text-[11px] text-rose-400">
                  <span>Macro Bearish Drag Emergency Circuit Breaker (-12.0%)</span>
                  <span className="font-bold">₹{selectedItemForModal.emergencyStopPrice}</span>
                </div>
              )}
            </div>

            {/* Diagnostic Rationale List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Mathematical Rationale & Diagnostic Audit
              </h3>
              <div className="space-y-1.5 text-xs text-slate-300">
                {selectedItemForModal.rationale.map((r, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  const item = selectedItemForModal;
                  setSelectedItemForModal(null);
                  setOrderModalItem(item);
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold cursor-pointer transition-all shadow-lg"
              >
                Open 1-Tap Staggered Order Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: 1-Tap Staggered Order Ticket Modal */}
      {orderModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative my-8">
            <button
              onClick={() => setOrderModalItem(null)}
              className="absolute right-5 top-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white font-mono flex items-center gap-2">
                  1-Tap Staggered Bracket Order Ticket
                </h2>
                <p className="text-xs text-slate-400">
                  Deploy 3 equal tranches linked into a unified OMS container for <strong className="text-white">{orderModalItem.symbol}</strong>.
                </p>
              </div>
            </div>

            {/* Capital Allocation Input */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <label className="text-xs font-mono font-bold text-slate-300 block">
                Total Position Capital Allocation (INR)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="25000"
                  min="50000"
                  value={orderCapital}
                  onChange={(e) => setOrderCapital(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 flex-1"
                />
                <span className="text-xs font-mono text-slate-400">
                  Approx ~{Math.floor(orderCapital / (orderModalItem.currentPrice || 1))} Shares
                </span>
              </div>
            </div>

            {/* 3-Tranche Breakdown Summary */}
            <div className="space-y-2 font-mono text-xs">
              <div className="text-[11px] text-slate-400 uppercase font-bold">
                Automated 3-Tranche Split & Bracket Triggers
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Tranche 1 (33.33%): Limit @ Base Support</span>
                  <span className="text-white">₹{orderModalItem.tranches[0].triggerPrice} (~₹{(orderCapital * 0.3333).toFixed(0)})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Tranche 2 (33.33%): Stop-Limit @ EMA Cross</span>
                  <span className="text-white">₹{orderModalItem.tranches[1].triggerPrice} (~₹{(orderCapital * 0.3333).toFixed(0)})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Tranche 3 (33.34%): Stop-Market @ Breakout</span>
                  <span className="text-white">₹{orderModalItem.tranches[2].triggerPrice} (~₹{(orderCapital * 0.3334).toFixed(0)})</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300">
                  <span className="text-[10px] block uppercase">Hard Stop (Point Zero P0)</span>
                  <span className="font-bold">₹{orderModalItem.pointZeroStopLoss} (-{orderModalItem.structuralRiskPct}%)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300">
                  <span className="text-[10px] block uppercase">Target (S1A Model) (+20-25%)</span>
                  <span className="font-bold">₹{orderModalItem.targetMinPrice} - ₹{orderModalItem.targetMaxPrice}</span>
                </div>
              </div>
            </div>

            {orderSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{orderSuccessMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setOrderModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleArmOrder}
                disabled={orderSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                {orderSubmitting ? 'Arming Bracket Container...' : 'Confirm & Arm Staggered Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
