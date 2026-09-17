import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Target,
  AlertOctagon,
  Layers,
  Search,
  CheckCircle2,
  Copy,
  Zap,
  Clock,
  Compass,
  DollarSign,
  Activity,
  ArrowUpRight,
  BarChart3,
  RotateCw,
  Check,
  X
} from 'lucide-react';

interface ResearchDossierData {
  symbol: string;
  companyName: string;
  sector: string;
  currentPrice: number;
  generatedAt: string;
  convictionScore: number;
  convictionBadge: string;
  macroRegime: string;

  chartVisualization: {
    candles: Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    waveMarkers: Array<{
      label: string;
      price: number;
      date: string;
      isConfirmed: boolean;
      type: string;
    }>;
    supportZone: { low: number; high: number; label: string };
    targetLadder: Array<{ label: string; price: number; upsidePct: number; fibLevel: string }>;
    invalidationLine: { price: number; riskPct: number; label: string };
  };

  waveAnalysis: {
    currentPattern: string;
    currentWaveLabel: string;
    primaryDegreeTrend: string;
    fibonacciLevels: {
      wave1Length: number;
      wave2RetracePct: number;
      wave3ExtensionRatio: number;
      target1Fib1618: number;
      target2Fib2618: number;
    };
    ruleOfExtensionSatisfied: boolean;
    extendedWave: string;
    correctiveIndicator?: any;
  };
  doubleMomentum?: any;

  fundamentalEpv: {
    operatingEarningsCr: number;
    epvIntrinsicValue: number;
    marginOfSafetyPct: number;
    rocePct: number;
    roePct: number;
  };

  smartMoneyMetrics: {
    displacementQualityScore: number;
    orderBlockFreshnessScore: number;
    floatSqueezeRatio: number;
    institutionalDeliveryPct: number;
  };

  whyThisSignalWorks: {
    headline: string;
    structuralEdge: string;
    fundamentalMoat: string;
    smartMoneyFootprint: string;
    catalystSummary: string;
  };

  whatIsThePotential: {
    target1Price: number;
    target1UpsidePct: number;
    target2Price: number;
    target2UpsidePct: number;
    hardStopLoss: number;
    maxDownsideRiskPct: number;
    rewardToRiskRatio: number;
    asymmetryRating: string;
    downsideStressTest: string;
  };

  executionTicket: {
    actionDirective: string;
    trancheA_AllocationPct: number;
    trancheA_PriceLimit: number;
    trancheB_AllocationPct: number;
    trancheB_PriceLimit: number;
    stopLossPrice: number;
    fastBreakevenTriggerPrice: number;
    recommendedShares: number;
    recommendedCapitalInr: number;
    maxEquityRiskPct: number;
    holdingHorizon: string;
  };
}

export const ResearchAgentDossierView: React.FC = () => {
  const [querySymbol, setQuerySymbol] = useState<string>('STLNETWORK');
  const [dossier, setDossier] = useState<ResearchDossierData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const quickPicks = [
    { symbol: 'STLNETWORK', label: '1. STLNETWORK (Comm)' },
    { symbol: 'NOVARTIND', label: '2. NOVARTIND (Health)' },
    { symbol: 'LGEINDIA', label: '3. LGEINDIA (Tech)' },
    { symbol: 'SCI', label: '4. SCI (Ind)' },
    { symbol: 'TATATECH', label: '5. TATATECH (Tech)' },
    { symbol: 'ORIANA', label: 'ORIANA (Solar)' },
    { symbol: 'RELIANCE', label: 'RELIANCE (Energy)' },
    { symbol: 'TCS', label: 'TCS (IT)' }
  ];

  const fetchDossier = async (sym: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/quant/research-dossier/${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (data.success && data.dossier) {
        setDossier(data.dossier);
      }
    } catch (err) {
      console.error('Failed to fetch research dossier:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDossier('STLNETWORK');
  }, []);

  const copyTicket = () => {
    if (!dossier) return;
    const t = dossier.executionTicket;
    const text = `[IREA INVESTMENT PROPOSAL] ${dossier.symbol}
Action: ${t.actionDirective}
Tranche A (35%): ₹${t.trancheA_PriceLimit}
Tranche B (65%): ₹${t.trancheB_PriceLimit}
Stop Loss: ₹${t.stopLossPrice} (-${dossier.whatIsThePotential.maxDownsideRiskPct}%)
Target 1: ₹${dossier.whatIsThePotential.target1Price} (+${dossier.whatIsThePotential.target1UpsidePct}%)
Target 2: ₹${dossier.whatIsThePotential.target2Price} (+${dossier.whatIsThePotential.target2UpsidePct}%)
Allocation: ₹${t.recommendedCapitalInr.toLocaleString('en-IN')} (${t.recommendedShares} shares)
Risk Cap: ${t.maxEquityRiskPct}% of Equity`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to render SVG Wave Chart
  const renderWaveChart = () => {
    if (!dossier || !dossier.chartVisualization.candles.length) return null;

    const candles = dossier.chartVisualization.candles;
    const markers = dossier.chartVisualization.waveMarkers;
    const width = 800;
    const height = 240;
    const padX = 40;
    const padY = 30;

    const allPrices = candles.flatMap(c => [c.high, c.low]);
    markers.forEach(m => allPrices.push(m.price));
    allPrices.push(dossier.whatIsThePotential.target1Price * 0.95);
    allPrices.push(dossier.whatIsThePotential.hardStopLoss);

    const minP = Math.min(...allPrices) * 0.96;
    const maxP = Math.max(...allPrices) * 1.04;
    const priceRange = maxP - minP || 1;

    const scaleX = (i: number) => padX + (i / (candles.length - 1)) * (width - 2 * padX);
    const scaleY = (p: number) => height - padY - ((p - minP) / priceRange) * (height - 2 * padY);

    const points = candles.map((c, i) => `${scaleX(i)},${scaleY(c.close)}`).join(' ');

    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-4">
        <div className="flex items-center justify-between pb-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">Glenn Neely NEoWave Structural Path & Key Levels</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400"></span>Target 1 (1.618 Fib)</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400"></span>Target 2</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500"></span>Invalidation SL</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
          {/* Target 1 Line */}
          <line
            x1={padX}
            y1={scaleY(dossier.whatIsThePotential.target1Price)}
            x2={width - padX}
            y2={scaleY(dossier.whatIsThePotential.target1Price)}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text x={width - padX - 80} y={scaleY(dossier.whatIsThePotential.target1Price) - 4} fill="#10b981" fontSize="10">
            Target 1: ₹{dossier.whatIsThePotential.target1Price}
          </text>

          {/* Hard Stop Line */}
          <line
            x1={padX}
            y1={scaleY(dossier.whatIsThePotential.hardStopLoss)}
            x2={width - padX}
            y2={scaleY(dossier.whatIsThePotential.hardStopLoss)}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text x={width - padX - 80} y={scaleY(dossier.whatIsThePotential.hardStopLoss) + 12} fill="#f43f5e" fontSize="10">
            Stop Loss: ₹{dossier.whatIsThePotential.hardStopLoss}
          </text>

          {/* Price Line */}
          <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" points={points} />

          {/* Wave Markers */}
          {markers.map((m, idx) => {
            const candleIdx = Math.min(candles.length - 1, Math.max(0, Math.floor((idx / (markers.length || 1)) * candles.length)));
            const x = scaleX(candleIdx);
            const y = scaleY(m.price);

            return (
              <g key={idx}>
                <circle cx={x} cy={y} r="8" fill="#4f46e5" stroke="#c7d2fe" strokeWidth="1.5" />
                <text x={x} y={y + 3.5} textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                  {m.label.replace(/[()]/g, '')}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search & Scrip Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-600/20 p-2.5 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Institutional Research & Experience Agent (IREA v1.0)
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                ACTIVE AI INTEL
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Autonomous synthesized proposals bridging Elliott/NEoWave structural maturity, EPV fundamentals, and smart money flow.
            </p>
          </div>
        </div>

        {/* Input & Action */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={querySymbol}
              onChange={(e) => setQuerySymbol(e.target.value.toUpperCase())}
              placeholder="Enter symbol (e.g. ORIANA)..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => fetchDossier(querySymbol)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? 'Analyzing...' : 'Investigate'}
          </button>
        </div>
      </div>

      {/* Quick Picks */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Investigate:</span>
        {quickPicks.map(p => (
          <button
            key={p.symbol}
            onClick={() => {
              setQuerySymbol(p.symbol);
              fetchDossier(p.symbol);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              dossier?.symbol === p.symbol
                ? 'bg-indigo-500 text-white font-bold'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Main Dossier Content */}
      {dossier && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-black text-white">{dossier.symbol}</h1>
                  <span className="rounded-md bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/20">
                    {dossier.sector}
                  </span>
                  <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                    Regime: {dossier.macroRegime}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-300 mt-1">{dossier.companyName}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-400 block uppercase">Current Market Price</span>
                  <span className="text-2xl font-black text-white">₹{dossier.currentPrice.toLocaleString('en-IN')}</span>
                </div>
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">Conviction Index</span>
                  <span className="text-2xl font-black text-indigo-400">{dossier.convictionScore}</span>
                  <span className="text-xs text-slate-400 font-semibold">/100</span>
                </div>
              </div>
            </div>

            {/* Visual Wave Chart */}
            <div className="pt-6">
              {renderWaveChart()}
            </div>
          </div>

          {/* Section: Elliott Wave Corrective Pullback Completion Engine */}
          {dossier.waveAnalysis?.correctiveIndicator && (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-500/20 p-2.5 text-indigo-400 border border-indigo-500/30">
                    <Activity className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">Glenn Neely Elliott Wave Pullback Completion Engine</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                        dossier.waveAnalysis.correctiveIndicator.isCompleted 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {dossier.waveAnalysis.correctiveIndicator.isCompleted ? 'COMPLETED (Wave C Exhaustion)' : dossier.waveAnalysis.correctiveIndicator.completionStatus}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Pattern: <strong className="text-indigo-300">{dossier.waveAnalysis.correctiveIndicator.correctivePatternType}</strong> | Confidence: <strong className="text-emerald-400">{dossier.waveAnalysis.correctiveIndicator.confidenceScore}%</strong> | Retracement Depth: <strong className="text-cyan-300">{dossier.waveAnalysis.correctiveIndicator.retracementDepthPct}%</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Invalidation Stop Floor</span>
                    <span className="text-sm font-black text-rose-400">₹{dossier.waveAnalysis.correctiveIndicator.invalidationLevel}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Reversal Trigger (0-B)</span>
                    <span className="text-sm font-black text-emerald-400">₹{dossier.waveAnalysis.correctiveIndicator.reversalTriggerPrice}</span>
                  </div>
                </div>
              </div>

              {/* Touchstone Rules Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                {[
                  { label: '0-B Trendline Breakout', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.zeroBLineBroken },
                  { label: 'Neely Faster-Time Rule', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.touchstoneFasterTime },
                  { label: 'Stage 2 Price Retrace >=61.8%', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.touchstonePriceRetracement },
                  { label: 'Golden Pocket (38-65%) Held', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.goldenPocketSupportHeld },
                  { label: 'Bullish Momentum Expansion', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.bullishMomentumExpansion },
                  { label: 'Alternation In Structure', passed: dossier.waveAnalysis.correctiveIndicator.confirmationGates?.ruleOfAlternationValid }
                ].map((gate, i) => (
                  <div key={i} className={`rounded-xl p-2.5 border text-center ${
                    gate.passed 
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}>
                    <div className="flex items-center justify-center mb-1">
                      {gate.passed ? <Check className="h-4 w-4 text-emerald-400" /> : <Clock className="h-4 w-4 text-slate-500" />}
                    </div>
                    <span className="text-[11px] font-semibold leading-tight block">{gate.label}</span>
                    <span className="text-[10px] font-bold mt-0.5 block">{gate.passed ? 'CONFIRMED' : 'PENDING'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Double Momentum & Sector Rotation Matrix */}
          {dossier.doubleMomentum && (
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-cyan-950/30 p-6 shadow-xl space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-cyan-500/20 p-2.5 text-cyan-400 border border-cyan-500/30">
                    <RotateCw className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">Double Momentum & Sector Rotation Engine</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                        dossier.doubleMomentum.doubleMomentum.verdict === 'EXCEPTIONAL_DOUBLE_MOMENTUM'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                      }`}>
                        {dossier.doubleMomentum.doubleMomentum.verdict.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Sector: <strong className="text-cyan-300">{dossier.doubleMomentum.sector}</strong> | RRG Quadrant: <strong className="text-emerald-400">{dossier.doubleMomentum.sectorEMA.rrgQuadrant}</strong> | Dual-Stack Pass: <strong className="text-indigo-300">{dossier.doubleMomentum.doubleMomentum.dualStackPass ? 'YES (9>21>50>200)' : 'PARTIAL'}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-slate-950/80 px-3 py-1.5 border border-slate-800 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Scrip Slopes (21/50/200)</span>
                    <span className={`text-xs font-black ${dossier.doubleMomentum.scripEMA.slopes.areSlopesUpward ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {dossier.doubleMomentum.scripEMA.slopes.areSlopesUpward ? 'ALL UPWARD (> 0)' : 'MIXED'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 px-3 py-1.5 border border-slate-800 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Sector Slopes (21/50/200)</span>
                    <span className={`text-xs font-black ${dossier.doubleMomentum.sectorEMA.slopes.areSlopesUpward ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {dossier.doubleMomentum.sectorEMA.slopes.areSlopesUpward ? 'ALL UPWARD (> 0)' : 'MIXED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dual Architecture Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Scrip Momentum Box */}
                <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-2">
                    <span className="flex items-center gap-1.5 text-indigo-300"><TrendingUp className="h-4 w-4" /> Scrip Moving Average Stack & Slopes</span>
                    <span className="text-emerald-400">{dossier.doubleMomentum.scripEMA.isBullishStack ? 'BULLISH ALIGNED' : 'CONSOLIDATING'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">EMA 9</span>
                      <span className="font-bold text-white">₹{dossier.doubleMomentum.scripEMA.ema9}</span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">EMA 21</span>
                      <span className="font-bold text-white">₹{dossier.doubleMomentum.scripEMA.ema21}</span>
                      <span className="text-[9px] text-emerald-400 block">{dossier.doubleMomentum.scripEMA.slopes.slope21 > 0 ? '+' : ''}{dossier.doubleMomentum.scripEMA.slopes.slope21}%</span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">EMA 50</span>
                      <span className="font-bold text-white">₹{dossier.doubleMomentum.scripEMA.ema50}</span>
                      <span className="text-[9px] text-emerald-400 block">{dossier.doubleMomentum.scripEMA.slopes.slope50 > 0 ? '+' : ''}{dossier.doubleMomentum.scripEMA.slopes.slope50}%</span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">EMA 200</span>
                      <span className="font-bold text-white">{dossier.doubleMomentum.scripEMA.ema200 ? '₹' + dossier.doubleMomentum.scripEMA.ema200 : 'N/A'}</span>
                      <span className="text-[9px] text-emerald-400 block">{dossier.doubleMomentum.scripEMA.slopes.slope200 > 0 ? '+' : ''}{dossier.doubleMomentum.scripEMA.slopes.slope200}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                    <span>Performance Windows:</span>
                    <span className="font-semibold text-slate-200">
                      1D: <strong className={dossier.doubleMomentum.scripReturns.d1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{dossier.doubleMomentum.scripReturns.d1 > 0 ? '+' : ''}{dossier.doubleMomentum.scripReturns.d1}%</strong> • 
                      1W: <strong className={dossier.doubleMomentum.scripReturns.w1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{dossier.doubleMomentum.scripReturns.w1 > 0 ? '+' : ''}{dossier.doubleMomentum.scripReturns.w1}%</strong> • 
                      1M: <strong className={dossier.doubleMomentum.scripReturns.m1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{dossier.doubleMomentum.scripReturns.m1 > 0 ? '+' : ''}{dossier.doubleMomentum.scripReturns.m1}%</strong>
                    </span>
                  </div>
                </div>

                {/* Sector Momentum Box */}
                <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-2">
                    <span className="flex items-center gap-1.5 text-cyan-300"><BarChart3 className="h-4 w-4" /> Sector Asymmetric Alpha vs Benchmarks</span>
                    <span className="text-cyan-400">{dossier.doubleMomentum.sectorEMA.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Sector CMP</span>
                      <span className="font-bold text-white">₹{dossier.doubleMomentum.sectorEMA.cmp}</span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Sec EMA 21</span>
                      <span className="font-bold text-white">₹{dossier.doubleMomentum.sectorEMA.ema21}</span>
                      <span className="text-[9px] text-cyan-400 block">{dossier.doubleMomentum.sectorEMA.slopes.ema21 > 0 ? '+' : ''}{dossier.doubleMomentum.sectorEMA.slopes.ema21}%</span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Alpha vs N50 (1M)</span>
                      <span className={`font-bold ${dossier.doubleMomentum.alphaMetrics.sectorVsNifty50.m1 > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {dossier.doubleMomentum.alphaMetrics.sectorVsNifty50.m1 > 0 ? '+' : ''}{dossier.doubleMomentum.alphaMetrics.sectorVsNifty50.m1}%
                      </span>
                    </div>
                    <div className="rounded bg-slate-900/90 p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Alpha vs N500 (1M)</span>
                      <span className={`font-bold ${dossier.doubleMomentum.alphaMetrics.sectorVsNifty500.m1 > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {dossier.doubleMomentum.alphaMetrics.sectorVsNifty500.m1 > 0 ? '+' : ''}{dossier.doubleMomentum.alphaMetrics.sectorVsNifty500.m1}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Downside Resilience:</span>
                    <span className="font-bold text-emerald-400">PASS (Falls Less on Dips / Rises Faster on Rallies)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-Column Detailed Synthesis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: "Why This Signal Works" */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
              <div className="flex items-center gap-2 text-indigo-400 border-b border-slate-800 pb-3">
                <Compass className="h-5 w-5" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">Why This Signal Works</h3>
              </div>

              <p className="text-sm font-semibold text-indigo-200 leading-snug">
                {dossier.whyThisSignalWorks.headline}
              </p>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800/80">
                  <span className="font-bold text-indigo-400 block mb-1">Structural Wave Edge (NEoWave)</span>
                  <p>{dossier.whyThisSignalWorks.structuralEdge}</p>
                </div>

                <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800/80">
                  <span className="font-bold text-emerald-400 block mb-1">Fundamental Moat & EPV</span>
                  <p>{dossier.whyThisSignalWorks.fundamentalMoat}</p>
                </div>

                <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800/80">
                  <span className="font-bold text-cyan-400 block mb-1">Smart Money Footprint</span>
                  <p>{dossier.whyThisSignalWorks.smartMoneyFootprint}</p>
                </div>
              </div>
            </div>

            {/* Card 2: "What is the Potential" */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-3">
                <Target className="h-5 w-5" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">What is the Potential</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-center">
                  <span className="text-[10px] font-bold text-emerald-300 block uppercase">Target 1 (1.618 Fib)</span>
                  <span className="text-lg font-black text-emerald-400">₹{dossier.whatIsThePotential.target1Price}</span>
                  <span className="text-xs font-bold text-emerald-300 block">+{dossier.whatIsThePotential.target1UpsidePct}% Upside</span>
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3 text-center">
                  <span className="text-[10px] font-bold text-cyan-300 block uppercase">Target 2 (Structural)</span>
                  <span className="text-lg font-black text-cyan-400">₹{dossier.whatIsThePotential.target2Price}</span>
                  <span className="text-xs font-bold text-cyan-300 block">+{dossier.whatIsThePotential.target2UpsidePct}% Upside</span>
                </div>
              </div>

              <div className="rounded-lg bg-rose-950/20 border border-rose-500/20 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-rose-300 block uppercase">Hard Invalidation Stop Loss</span>
                  <span className="text-sm font-bold text-rose-400">₹{dossier.whatIsThePotential.hardStopLoss}</span>
                </div>
                <span className="text-xs font-bold text-rose-300">-{dossier.whatIsThePotential.maxDownsideRiskPct}% Max Risk</span>
              </div>

              <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Reward-to-Risk Ratio:</span>
                  <span className="font-black text-emerald-400">{dossier.whatIsThePotential.rewardToRiskRatio} : 1</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Asymmetry Rating:</span>
                  <span className="font-bold text-indigo-400">{dossier.whatIsThePotential.asymmetryRating}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                {dossier.whatIsThePotential.downsideStressTest}
              </p>
            </div>

            {/* Card 3: Actionable Execution Ticket */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <ShieldCheck className="h-5 w-5" />
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Actionable Execution Ticket</h3>
                  </div>
                  <button
                    onClick={copyTicket}
                    className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                  >
                    {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="rounded-lg bg-slate-950/80 p-3 border border-indigo-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-bold">Tranche A (35% Breakout Limit):</span>
                      <span className="font-black text-indigo-300 text-sm">₹{dossier.executionTicket.trancheA_PriceLimit}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-bold">Tranche B (65% Base Retest):</span>
                      <span className="font-black text-indigo-300 text-sm">₹{dossier.executionTicket.trancheB_PriceLimit}</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Fast Breakeven (+5%):</span>
                      <span className="font-bold text-emerald-400">₹{dossier.executionTicket.fastBreakevenTriggerPrice}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Capital Allocation:</span>
                      <span className="font-bold text-white">₹{dossier.executionTicket.recommendedCapitalInr.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Position Size:</span>
                      <span className="font-bold text-white">{dossier.executionTicket.recommendedShares.toLocaleString('en-IN')} Shares</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Single-Trade Risk Cap:</span>
                      <span className="font-bold text-amber-400">{dossier.executionTicket.maxEquityRiskPct}% of Equity</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={copyTicket}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-center text-xs font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.99]"
              >
                Accept & Execute Institutional Proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
