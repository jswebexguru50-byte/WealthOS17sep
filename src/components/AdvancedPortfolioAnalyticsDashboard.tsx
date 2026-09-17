import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Layers,
  ShieldCheck,
  Zap,
  BarChart2,
  PieChart as PieChartIcon,
  Activity,
  ArrowUpRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const AdvancedPortfolioAnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeModule, setActiveModule] = useState<'m1' | 'm2' | 'm3' | 'm4'>('m1');

  useEffect(() => {
    fetch('/api/portfolio-analytics')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setData(resData.analytics);
        }
      })
      .catch((err) => console.error('Error fetching analytics:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="glass-card rounded-2xl p-8 border border-slate-800 animate-pulse text-center">
        <Activity className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-400 font-semibold">Computing Multi-Asset Analytics Engine (2008–2026)...</p>
      </div>
    );
  }

  const m1 = data.module1_xirr_engine;
  const m2 = data.module2_rolling_alpha;
  const m3 = data.module3_risk_adjusted;
  const m4 = data.module4_allocation_drift;

  return (
    <div className="space-y-6">
      {/* Engine Title & Module Navigation Bar */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800/80 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display font-bold text-slate-100 text-2xl tracking-tight">
                Institutional Multi-Asset Analytics Engine
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculated across 8,600+ transactions (2008–2026) | Indian Mainboard, SME, MFs, US IBKR & Bank FDs
              </p>
            </div>
          </div>
        </div>

        {/* 4 Module Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveModule('m1')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeModule === 'm1'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Module 1: Daily XIRR
          </button>

          <button
            onClick={() => setActiveModule('m2')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeModule === 'm2'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Zap className="w-4 h-4" />
            Module 2: Rolling & Cycles
          </button>

          <button
            onClick={() => setActiveModule('m3')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeModule === 'm3'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Module 3: Sharpe & Sortino
          </button>

          <button
            onClick={() => setActiveModule('m4')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeModule === 'm4'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Module 4: Drift & Liquidity
          </button>
        </div>
      </div>

      {/* MODULE 1: DAILY TRANSACTIONAL XIRR ENGINE */}
      {activeModule === 'm1' && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                MODULE 1: Daily Transactional XIRR & Dynamic Benchmark
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Extended Internal Rate of Return dynamically matched against Nifty 500 TRI & S&P 500 TRI on exact cash flow dates.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-2xl space-y-2">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">Portfolio Absolute XIRR</span>
              <span className="text-3xl font-bold text-emerald-300 font-mono">{m1.portfolio_xirr}%</span>
              <span className="text-xs text-emerald-400/80 block">Current Valuation: ₹{((m1?.portfolio_valuation || 0) / 10000000).toFixed(2)} Cr</span>
            </div>

            <div className="bg-blue-950/20 border border-blue-500/30 p-5 rounded-2xl space-y-2">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider block">Dynamic Benchmark XIRR</span>
              <span className="text-3xl font-bold text-blue-300 font-mono">{m1?.benchmark_xirr || 0}%</span>
              <span className="text-xs text-blue-400/80 block">Simulated Valuation: ₹{((m1?.benchmark_valuation || 0) / 10000000).toFixed(2)} Cr</span>
            </div>

            <div className="bg-teal-950/30 border border-teal-500/40 p-5 rounded-2xl space-y-2">
              <span className="text-xs font-semibold text-teal-300 uppercase tracking-wider block">Money-Weighted Alpha</span>
              <span className="text-3xl font-bold text-teal-200 font-mono">+{m1?.xirr_alpha || 0}%</span>
              <span className="text-xs text-teal-400 block">+₹{((m1?.wealth_alpha_inr || 0) / 10000000).toFixed(2)} Cr Excess Wealth (+{m1?.wealth_alpha_pct || 0}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 2: ROLLING RETURNS & HISTORICAL CYCLE ALPHA */}
      {activeModule === 'm2' && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              MODULE 2: Rolling Returns & Historical Cycle Alpha
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              3-Year & 5-Year rolling CAGRs to eliminate recency bias + Historical Market Cycle Alpha.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rolling CAGRs */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Rolling Returns (CAGR %)</h4>
              <div className="space-y-3">
                {m2.rolling_returns.map((r: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{r.period}</span>
                      <span className="text-[11px] text-slate-400">Nifty 500 TRI: {r.nifty500}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-400 font-mono block">{r.portfolio}%</span>
                      <span className="text-xs font-semibold text-teal-400">Alpha: +{r.alpha}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Market Cycles */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Historical Cycle Outperformance</h4>
              <div className="space-y-3">
                {m2.historical_cycles.map((c: any, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{c.cycle}</span>
                      <span className="text-[11px] text-slate-400">Benchmark Return: {c.nifty500}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-400 font-mono block">{c.portfolio}%</span>
                      <span className="text-xs font-semibold text-teal-400">Alpha: +{c.alpha}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Microcap & SME Tracking Card */}
          <div className="bg-purple-950/20 border border-purple-800/40 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block">Active SME & Micro-cap Equity Performance</span>
              <span className="text-xs text-purple-400 mt-0.5 block">Compared strictly against Nifty Microcap 250 & Nifty SME Emerge</span>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-purple-300 font-mono block">{m2.sme_tracking.sme_portfolio_xirr}% XIRR</span>
              <span className="text-xs text-purple-400">Microcap 250: {m2.sme_tracking.nifty_microcap250_xirr}% (Alpha: +{m2.sme_tracking.sme_alpha}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 3: RISK-ADJUSTED RETURNS (SHARPE & SORTINO) */}
      {activeModule === 'm3' && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              MODULE 3: Risk-Adjusted Returns (Sharpe & Sortino Ratios)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Annualized Volatility, 91-Day Indian T-Bill Yield ($R_f = {m3.risk_free_rate}\%$), & Downside Semi-Deviation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* My Portfolio */}
            <div className="bg-emerald-950/20 border border-emerald-500/40 p-5 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">My Portfolio</span>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sharpe Ratio:</span>
                  <strong className="text-emerald-300 font-mono">{m3.portfolio.sharpe_ratio}</strong>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sortino Ratio:</span>
                  <strong className="text-emerald-300 font-mono">{m3.portfolio.sortino_ratio}</strong>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-2 border-t border-emerald-900/50">
                  <span>Ann. Volatility:</span>
                  <span>{m3.portfolio.annualized_volatility}%</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Downside Volatility:</span>
                  <span>{m3.portfolio.downside_volatility}%</span>
                </div>
              </div>
            </div>

            {/* Nifty 50 TRI */}
            <div className="bg-blue-950/20 border border-blue-500/40 p-5 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">Nifty 50 TRI</span>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sharpe Ratio:</span>
                  <strong className="text-blue-300 font-mono">{m3.nifty50_tri.sharpe_ratio}</strong>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sortino Ratio:</span>
                  <strong className="text-blue-300 font-mono">{m3.nifty50_tri.sortino_ratio}</strong>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-2 border-t border-blue-900/50">
                  <span>Ann. Volatility:</span>
                  <span>{m3.nifty50_tri.annualized_volatility}%</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Downside Volatility:</span>
                  <span>{m3.nifty50_tri.downside_volatility}%</span>
                </div>
              </div>
            </div>

            {/* S&P 500 TRI */}
            <div className="bg-purple-950/20 border border-purple-500/40 p-5 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider block">S&P 500 TRI</span>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sharpe Ratio:</span>
                  <strong className="text-purple-300 font-mono">{m3.sp500_tri.sharpe_ratio}</strong>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Sortino Ratio:</span>
                  <strong className="text-purple-300 font-mono">{m3.sp500_tri.sortino_ratio}</strong>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-2 border-t border-purple-900/50">
                  <span>Ann. Volatility:</span>
                  <span>{m3.sp500_tri.annualized_volatility}%</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Downside Volatility:</span>
                  <span>{m3.sp500_tri.downside_volatility}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 4: ASSET ALLOCATION DRIFT & LIQUIDITY TIERING */}
      {activeModule === 'm4' && (
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              MODULE 4: Asset Allocation Drift (±5%) & Liquidity Tiering
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Automated alerts when any bucket drifts by &gt; ±5% + 3-Tier Liquidity Segmentation.
            </p>
          </div>

          {/* Allocation Drift Matrix */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Target vs Actual Allocation Drift</h4>
            <div className="space-y-3">
              {m4.allocation_buckets.map((b: any, idx: number) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{b.bucket}</span>
                      {b.alert_triggered && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          Drift Warning ({b.drift_pct > 0 ? '+' : ''}{b.drift_pct}%)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">Valuation: ₹{((b?.value_inr || 0) / 10000000).toFixed(2)} Cr</span>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-right">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Actual</span>
                      <strong className="text-emerald-300 font-mono">{b.actual_pct}%</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Target</span>
                      <strong className="text-slate-300 font-mono">{b.target_pct}%</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Liquidity Tiers */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Portfolio Liquidity Tiers</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {m4.liquidity_tiers.map((t: any, idx: number) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-200 block">{t.tier}</span>
                  <span className="text-xl font-bold text-emerald-400 font-mono block">₹{((t?.value_inr || 0) / 10000000).toFixed(2)} Cr</span>
                  <span className="text-xs text-slate-400 block">{t.pct}% of Total Portfolio</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
