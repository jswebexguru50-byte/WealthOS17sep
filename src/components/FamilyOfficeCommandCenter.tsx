import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Activity,
  Layers,
  PieChart as PieIcon,
  Building,
  RefreshCw,
  AlertCircle,
  Award,
  Zap,
  ChevronRight,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  Compass,
  FileSpreadsheet,
  SlidersHorizontal
} from 'lucide-react';
import { formatINR, getGainLossColorClass, getGainLossBgClass, getGainLossIcon, formatPct, formatCrore2Dec } from '../lib/formatters.js';
import { getUserPreferences } from '../lib/preferences.js';

interface CommandCenterData {
  summary: {
    totalNetWorthINR: number;
    totalPortfolioValINR: number;
    totalBankAndFdVal: number;
    totalCostBasisINR: number;
    totalTaxCostBasisINR: number;
    totalUnrealizedGainINR: number;
    totalUnrealizedGainPct: number;
    totalDayChangeINR: number;
    totalDayChangePct: number;
    usdRate: number;
    holdingsCount: number;
    portfoliosCount: number;
    bankAccountsCount: number;
    compositeHealthScore: number;
    top10ConcentrationPct: number;
  };
  assetClassBreakdown: Array<{
    name: string;
    value: number;
    cost: number;
    count: number;
    allocationPct: number;
  }>;
  portfolioBreakdown: Array<{
    name: string;
    value: number;
    cost: number;
    gain: number;
    gainPct: number;
    ltdXirr: number | null;
    dayChange: number;
    holdingsCount: number;
    allocationPct: number;
  }>;
  topMovers: {
    gainers: Array<{
      symbol: string;
      value: number;
      cost: number;
      dayChange: number;
      dayChangePct: number;
      portfolios: string[];
    }>;
    losers: Array<{
      symbol: string;
      value: number;
      cost: number;
      dayChange: number;
      dayChangePct: number;
      portfolios: string[];
    }>;
  };
  topHoldings: Array<{
    symbol: string;
    value: number;
    cost: number;
    portfolios: string[];
    weightPct: number;
  }>;
  valuationIntegrity?: {
    isStable: boolean;
    lastAuditTimestamp: string;
    driftAlerts: string[];
    recentSnapshotsCount: number;
  };
}

interface FamilyOfficeCommandCenterProps {
  onSelectPortfolio?: (portfolioName: string) => void;
  onOpenScripIntelligence?: (symbol: string) => void;
  onOpenPreferences?: () => void;
  formatCurrency?: (val: number) => string;
  currentMemberId?: number | 'all';
}

const ASSET_COLORS: Record<string, string> = {
  'US Equities & ETFs': '#38bdf8',
  'US Equities': '#38bdf8',
  'Indian Direct Equity': '#34d399',
  'PMS & Institutional': '#a78bfa',
  'AIF (Smart Horizon)': '#fbbf24',
  'Unlisted Securities': '#f59e0b',
  'Unlisted & AIF': '#fbbf24',
  'Cash & Fixed Deposits': '#94a3b8',
  'Mutual Funds': '#f472b6'
};

export function FamilyOfficeCommandCenter({
  onSelectPortfolio,
  onOpenScripIntelligence,
  onOpenPreferences,
  formatCurrency = (v) => formatCrore2Dec(v),
  currentMemberId = 1
}: FamilyOfficeCommandCenterProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const currentPrefs = getUserPreferences();
  const costBasisView = currentPrefs.costBasis || 'PMS_MARKET';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const mParam = (currentMemberId && currentMemberId !== 'all') ? `?member_id=${currentMemberId}` : '?member_id=1';
      const res = await fetch(`/api/command-center${mParam}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.message || 'Failed to fetch command center data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching command center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentMemberId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin" />
        <p className="text-sm font-semibold tracking-wide font-mono" style={{ color: 'var(--text-secondary)' }}>
          Aggregating Multi-Portfolio Family Holdings & Real-Time Intelligence...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 rounded-3xl border border-rose-500/30 bg-rose-500/10 text-rose-400 max-w-2xl mx-auto my-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 mx-auto" />
        <h3 className="text-lg font-bold">Failed to load Command Center</h3>
        <p className="text-sm">{error || 'Unknown error occurred'}</p>
        <button
          onClick={fetchData}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  const { summary, assetClassBreakdown, portfolioBreakdown, topMovers, topHoldings } = data;
  const displayedCostBasis = costBasisView === 'PMS_MARKET' ? summary.totalCostBasisINR : (summary.totalTaxCostBasisINR || summary.totalCostBasisINR);
  const displayedUnrealizedGain = summary.totalNetWorthINR - (displayedCostBasis + summary.totalBankAndFdVal);
  const displayedUnrealizedPct = (displayedCostBasis + summary.totalBankAndFdVal) > 0 
    ? (displayedUnrealizedGain / (displayedCostBasis + summary.totalBankAndFdVal)) * 100 
    : 0;

  const netWorthFormatted = { compact: formatCrore2Dec(summary.totalNetWorthINR), full: formatINR(summary.totalNetWorthINR) };
  const dayChangeFormatted = { compact: formatCrore2Dec(summary.totalDayChangeINR), full: formatINR(summary.totalDayChangeINR) };
  const unrealizedGainFormatted = { compact: formatCrore2Dec(displayedUnrealizedGain), full: formatINR(displayedUnrealizedGain) };
  const costBasisFormatted = { compact: formatCrore2Dec(displayedCostBasis + summary.totalBankAndFdVal), full: formatINR(displayedCostBasis + summary.totalBankAndFdVal) };
  const holdingsValFormatted = { compact: formatCrore2Dec(summary.totalPortfolioValINR), full: formatINR(summary.totalPortfolioValINR) };
  const bankFdValFormatted = { compact: formatCrore2Dec(summary.totalBankAndFdVal), full: formatINR(summary.totalBankAndFdVal) };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-7 shadow-xl backdrop-blur-xl border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-card)'
        }}
      >
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-500 dark:text-cyan-300 shadow-sm shrink-0">
                <ShieldCheck className="w-6 h-6 md:w-7 md:h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-600 dark:text-cyan-300 font-extrabold flex items-center gap-1.5">
                  Institutional Master Governance
                </span>
                <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">
                  <span>{currentMemberId === 2 ? 'Brother Wealth Command Center — Pankaj Sharma' : 'Family Office Command Center — Gopal (Primary / Family Office)'}</span>
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono border border-emerald-500/30 flex items-center gap-1.5 font-bold shadow-sm shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                    LIVE VALUATION
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-mono border border-cyan-500/30 flex items-center gap-1.5 font-bold shadow-sm shrink-0" title="Valuation Integrity & Parity: Verified and protected against rogue ticker overrides">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
                    PARITY PROTECTED
                  </span>
                </h1>
              </div>
            </div>
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-200 max-w-2xl leading-relaxed font-medium">
              {currentMemberId === 2 ? 'Segregated brother portfolio tracking across ' : 'Consolidated family net worth tracking across '}
              <strong className="text-slate-900 dark:text-white font-bold underline decoration-cyan-500/50">{summary.holdingsCount} active instruments</strong> in <strong className="text-slate-900 dark:text-white font-bold underline decoration-emerald-500/50">{summary.portfoliosCount} entities</strong>
              {currentMemberId !== 2 && (
                <> and <strong className="text-slate-900 dark:text-white font-bold underline decoration-amber-500/50">{summary.bankAccountsCount} fixed deposits</strong></>
              )}.
            </p>
            {data.valuationIntegrity?.driftAlerts && data.valuationIntegrity.driftAlerts.length > 0 && (
              <div className="mt-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-bold">Valuation Drift Notice:</p>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {data.valuationIntegrity.driftAlerts.map((alt, idx) => (
                      <li key={idx}>{alt}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {onOpenPreferences && (
              <button
                type="button"
                onClick={onOpenPreferences}
                className="px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer shadow-sm hover:brightness-105 border shrink-0"
                style={{
                  background: costBasisView === 'PMS_MARKET' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  borderColor: costBasisView === 'PMS_MARKET' ? 'var(--accent-purple, #818cf8)' : 'var(--accent-gold, #f59e0b)',
                  color: costBasisView === 'PMS_MARKET' ? 'var(--accent-purple, #6366f1)' : 'var(--accent-gold, #d97706)'
                }}
                title="Click to configure Preferences (Cost Basis, Separator, Sort)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="font-bold">Basis: {costBasisView === 'PMS_MARKET' ? 'PMS Market Capital' : 'Tax Cost Base'}</span>
              </button>
            )}

            <button
              onClick={fetchData}
              className="p-2.5 rounded-2xl transition-all cursor-pointer shadow-sm hover:opacity-80 border shrink-0"
              style={{
                background: 'var(--bg-input, rgba(0, 0, 0, 0.1))',
                borderColor: 'var(--border-input, #cbd5e1)',
                color: 'var(--text-primary)'
              }}
              title="Refresh Consolidated Metrics"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-5" style={{ borderTop: '1px solid var(--border-card)' }}>
          {/* Card 1: Total Net Worth */}
          <div className="p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-sm border h-full" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider font-extrabold block truncate" style={{ color: 'var(--text-secondary)' }}>Total Consolidated Net Worth</span>
              <div className="text-2xl lg:text-3xl font-black mt-1.5 tracking-tight truncate font-mono" style={{ color: 'var(--text-primary)' }} title={netWorthFormatted.full}>{netWorthFormatted.compact}</div>
              <div className="text-xs font-mono mt-0.5 truncate font-medium" style={{ color: 'var(--text-muted)' }} title={netWorthFormatted.full}>Exact: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{netWorthFormatted.full}</span></div>
            </div>
            <div className="mt-4 pt-3 text-xs font-semibold space-y-1.5" style={{ borderTop: '1px solid var(--border-card)' }}>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Holdings:</span>
                <strong className="font-mono text-xs font-bold truncate" style={{ color: 'var(--accent-blue)' }} title={holdingsValFormatted.full}>{holdingsValFormatted.compact}</strong>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Cash & FDs:</span>
                <strong className="font-mono text-xs font-bold truncate" style={{ color: 'var(--accent-gold)' }} title={bankFdValFormatted.full}>{bankFdValFormatted.compact}</strong>
              </div>
            </div>
          </div>

          {/* Card 2: Today's Movement */}
          <div className="p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-sm border h-full" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider font-extrabold block truncate" style={{ color: 'var(--text-secondary)' }}>Today's Day Movement</span>
              <div className={`text-2xl lg:text-3xl font-black mt-1.5 tracking-tight flex items-center gap-1.5 truncate font-mono ${getGainLossColorClass(summary.totalDayChangeINR)}`} title={dayChangeFormatted.full}>
                <span className="shrink-0">{getGainLossIcon(summary.totalDayChangeINR)}</span>
                <span className="truncate">{summary.totalDayChangeINR >= 0 ? '+' : ''}{dayChangeFormatted.compact}</span>
              </div>
              <div className={`text-xs font-extrabold font-mono mt-0.5 truncate ${getGainLossColorClass(summary.totalDayChangePct)}`}>
                {summary.totalDayChangePct >= 0 ? '+' : ''}{(summary.totalDayChangePct ?? 0).toFixed(2)}% vs Prev Close
              </div>
            </div>
            <div className="mt-4 pt-3 text-xs font-semibold space-y-1.5" style={{ borderTop: '1px solid var(--border-card)' }}>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Day Delta:</span>
                <strong className={`font-mono text-xs font-bold truncate ${getGainLossColorClass(summary.totalDayChangeINR)}`} title={dayChangeFormatted.full}>{dayChangeFormatted.full}</strong>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <strong className="font-mono text-xs font-bold truncate text-emerald-400">Live Market Feed</strong>
              </div>
            </div>
          </div>

          {/* Card 3: Unrealized Wealth */}
          <div className="p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-sm border h-full" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider font-extrabold truncate" style={{ color: 'var(--text-secondary)' }}>Unrealized Wealth</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-extrabold shrink-0 ${costBasisView === 'PMS_MARKET' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'}`}>
                  {costBasisView === 'PMS_MARKET' ? 'PMS Mkt' : 'Tax Base'}
                </span>
              </div>
              <div className={`text-2xl lg:text-3xl font-black mt-1.5 tracking-tight truncate font-mono ${getGainLossColorClass(displayedUnrealizedGain)}`} title={unrealizedGainFormatted.full}>
                {displayedUnrealizedGain >= 0 ? '+' : ''}{unrealizedGainFormatted.compact}
              </div>
              <div className={`text-xs font-extrabold font-mono mt-0.5 truncate ${getGainLossColorClass(displayedUnrealizedPct)}`}>
                {displayedUnrealizedPct >= 0 ? '+' : ''}{(displayedUnrealizedPct ?? 0).toFixed(2)}% Inception Gain
              </div>
            </div>
            <div className="mt-4 pt-3 text-xs font-semibold space-y-1.5" style={{ borderTop: '1px solid var(--border-card)' }}>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Total Cost:</span>
                <strong className="font-mono text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }} title={costBasisFormatted.full}>{costBasisFormatted.compact}</strong>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Cost Mode:</span>
                <strong className="font-mono text-xs font-bold truncate text-cyan-400">{costBasisView === 'PMS_MARKET' ? 'Injected Capital' : 'FIFO Lots'}</strong>
              </div>
            </div>
          </div>

          {/* Card 4: Health Score & Concentration */}
          <div className="p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between shadow-sm border h-full" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider font-extrabold block truncate" style={{ color: 'var(--text-secondary)' }}>Portfolio Health Score</span>
              <div className="flex items-center gap-2.5 mt-1.5">
                <div className="text-2xl lg:text-3xl font-black font-mono tracking-tight shrink-0" style={{ color: 'var(--text-primary)' }}>{summary.compositeHealthScore ?? 85}<span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/100</span></div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div key={s} className={`w-1.5 h-6 rounded-full transition-all ${s <= Math.round((summary.compositeHealthScore ?? 85) / 20) ? (summary.compositeHealthScore ?? 85) >= 75 ? 'bg-emerald-500' : (summary.compositeHealthScore ?? 85) >= 50 ? 'bg-amber-500' : 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                  ))}
                </div>
              </div>
              <div className="text-xs mt-0.5 flex items-center gap-1.5 font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                Top 10 Risk: <strong className="font-mono text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>{(summary.top10ConcentrationPct ?? 0).toFixed(1)}%</strong>
              </div>
            </div>
            <div className="mt-4 pt-3 text-xs font-semibold space-y-1.5" style={{ borderTop: '1px solid var(--border-card)' }}>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Risk Limit:</span>
                <strong className="font-mono text-xs font-bold truncate text-emerald-400">&lt; 50% Top-10 AUM</strong>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>Diversification:</span>
                <strong className="font-mono text-xs font-bold truncate text-purple-400">Optimal Spread</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 p-5 md:p-6 rounded-3xl shadow-xl flex flex-col justify-between border min-w-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-indigo-400 shadow-sm shrink-0">
                <PieIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>Asset Class Allocation</h3>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Wealth Distribution by Mandate Category</p>
              </div>
            </div>
            <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800 p-0.5 gap-0.5 shadow-inner border border-slate-300 dark:border-slate-700/50">
              {assetClassBreakdown.filter(a => a.value > 0).map((item) => (
                <div key={item.name} style={{ width: `${Math.max(1.5, item.allocationPct ?? 0)}%`, backgroundColor: ASSET_COLORS[item.name] || '#94a3b8' }} className="h-full rounded-sm transition-all hover:opacity-80" title={`${item.name}: ${formatCrore2Dec(item.value)} (${(item.allocationPct ?? 0).toFixed(1)}%)`} />
              ))}
            </div>
            <div className="space-y-3 mt-5">
              {assetClassBreakdown.map((item) => {
                const color = ASSET_COLORS[item.name] || '#94a3b8';
                return (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                      <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                      <span className="font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>({item.count})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }} title={formatINR(item.value)}>{formatCrore2Dec(item.value)}</span>
                      <span className="text-xs font-mono font-bold w-12 text-right shrink-0" style={{ color: 'var(--text-secondary)' }}>{(item.allocationPct ?? 0).toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 p-5 md:p-6 rounded-3xl shadow-xl flex flex-col justify-between border min-w-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 shadow-sm shrink-0">
                <Building className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>Family Portfolio Breakdown</h3>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Valuation & Movement by Individual Account</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {portfolioBreakdown.map((p) => {
                const hasXirr = p.ltdXirr !== null && p.ltdXirr !== undefined && !isNaN(p.ltdXirr) && Math.abs(p.ltdXirr) < 999;
                const gainVal = p.gain ?? (p.value - p.cost);
                const gainPctVal = p.gainPct ?? (p.cost > 0 ? ((p.value - p.cost) / p.cost) * 100 : 0);
                return (
                  <div key={p.name} onClick={() => onSelectPortfolio && onSelectPortfolio(p.name)} className="p-4 rounded-2xl transition-all cursor-pointer group hover:border-cyan-500/50 border flex flex-col justify-between min-w-0" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold group-hover:text-cyan-400 transition-colors flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-primary)' }}>
                          <span className="truncate">{p.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
                        </h4>
                        <span className="text-xs font-mono font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 shrink-0" style={{ color: 'var(--accent-blue)' }}>{(p.allocationPct ?? 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 mt-2 flex-wrap">
                        <div className="text-base font-black truncate" style={{ color: 'var(--text-primary)' }} title={formatINR(p.value)}>{formatCrore2Dec(p.value)}</div>
                        <div className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }} title={formatINR(p.cost)}>Cost: <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{formatCrore2Dec(p.cost)}</span></div>
                      </div>
                      <div className="flex items-start justify-between gap-2 mt-3 pt-2.5" style={{ borderTop: '1px solid var(--border-card)' }}>
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider truncate" style={{ color: 'var(--text-muted)' }}>Total Gain / Loss</span>
                          <div className={`text-xs font-mono font-bold flex items-center gap-1 mt-0.5 flex-wrap ${getGainLossColorClass(gainVal)}`} title={formatINR(gainVal)}>
                            <span className="shrink-0">{getGainLossIcon(gainVal)}</span>
                            <span className="truncate">{gainVal >= 0 ? '+' : ''}{formatCrore2Dec(gainVal)}</span>
                            <span className="text-[11px] font-semibold opacity-90 shrink-0">({gainPctVal >= 0 ? '+' : ''}{gainPctVal.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0 pl-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>LTD XIRR</span>
                          {hasXirr ? (
                            <span className={`text-xs font-mono font-black px-2 py-0.5 rounded-md mt-0.5 border flex items-center gap-1 shrink-0 ${getGainLossBgClass(p.ltdXirr)}`}>
                              <span>{getGainLossIcon(p.ltdXirr)}</span>
                              <span>{(p.ltdXirr || 0) >= 0 ? '+' : ''}{(p.ltdXirr ?? 0).toFixed(2)}%</span>
                            </span>
                          ) : <span className="text-xs font-mono font-bold text-slate-400 mt-0.5">—</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2 text-xs flex-wrap" style={{ borderTop: '1px solid var(--border-card)' }}>
                      <span className="font-semibold text-slate-400 shrink-0">{p.holdingsCount} holdings</span>
                      <span className={`font-mono font-bold flex items-center gap-1 truncate ${getGainLossColorClass(p.dayChange)}`} title={formatINR(p.dayChange)}>
                        <span className="shrink-0">{getGainLossIcon(p.dayChange)}</span>
                        <span className="truncate">Day: {(p.dayChange ?? 0) >= 0 ? '+' : ''}{formatCrore2Dec(p.dayChange)}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 p-5 md:p-6 rounded-3xl shadow-xl border min-w-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400 shadow-sm shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>Top Daily Movers</h3>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Family-Wide Largest Gainers & Decliners Today</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2.5 min-w-0">
              <span className="text-xs font-mono font-extrabold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--accent-green)' }}><TrendingUp className="w-3.5 h-3.5" /> Top Gainers</span>
              {topMovers.gainers.slice(0, 4).map((g) => (
                <div key={g.symbol} onClick={() => onOpenScripIntelligence && onOpenScripIntelligence(g.symbol)} className="p-3 rounded-xl transition-all cursor-pointer hover:border-emerald-500/50 border min-w-0" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{g.symbol}</span>
                    <span className="text-xs font-mono font-extrabold shrink-0" style={{ color: 'var(--accent-green)' }}>+{(g.dayChangePct ?? 0).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">Val: <strong className="font-bold" style={{ color: 'var(--text-primary)' }} title={formatINR(g.value)}>{formatCrore2Dec(g.value)}</strong></span>
                    <span className="font-mono font-bold shrink-0" style={{ color: 'var(--accent-green)' }} title={formatINR(g.dayChange)}>+{formatCrore2Dec(g.dayChange)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2.5 min-w-0">
              <span className="text-xs font-mono font-extrabold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--accent-rose)' }}><TrendingDown className="w-3.5 h-3.5" /> Top Decliners</span>
              {topMovers.losers.slice(0, 4).map((l) => (
                <div key={l.symbol} onClick={() => onOpenScripIntelligence && onOpenScripIntelligence(l.symbol)} className="p-3 rounded-xl transition-all cursor-pointer hover:border-rose-500/50 border min-w-0" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{l.symbol}</span>
                    <span className="text-xs font-mono font-extrabold shrink-0" style={{ color: 'var(--accent-rose)' }}>{(l.dayChangePct ?? 0).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">Val: <strong className="font-bold" style={{ color: 'var(--text-primary)' }} title={formatINR(l.value)}>{formatCrore2Dec(l.value)}</strong></span>
                    <span className="font-mono font-bold shrink-0" style={{ color: 'var(--accent-rose)' }} title={formatINR(l.dayChange)}>{formatCrore2Dec(l.dayChange)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 p-5 md:p-6 rounded-3xl shadow-xl border min-w-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 bg-purple-500/15 border border-purple-500/30 rounded-xl text-purple-400 shadow-sm shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>Top Consolidated Holdings</h3>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Aggregated Across All Portfolios & Entities</p>
            </div>
          </div>
          <div className="space-y-2 mt-4 max-h-80 overflow-y-auto pr-1">
            {topHoldings.slice(0, 6).map((h, i) => (
              <div key={h.symbol} onClick={() => onOpenScripIntelligence && onOpenScripIntelligence(h.symbol)} className="p-3 rounded-2xl transition-all cursor-pointer group flex items-center justify-between gap-3 hover:border-purple-500/50 border min-w-0" style={{ background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))', borderColor: 'var(--border-card)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 flex items-center justify-center text-xs font-bold font-mono border border-slate-300 dark:border-slate-700 shrink-0">#{i + 1}</span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold group-hover:text-purple-400 transition-colors truncate" style={{ color: 'var(--text-primary)' }}>{h.symbol}</h4>
                    <span className="text-xs font-medium truncate block" style={{ color: 'var(--text-muted)' }} title={h.portfolios.join(', ')}>In: {h.portfolios.join(', ')}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }} title={formatINR(h.value)}>{formatCrore2Dec(h.value)}</div>
                  <span className="text-xs font-mono font-extrabold" style={{ color: 'var(--accent-purple, #a855f7)' }}>{(h.weightPct ?? 0).toFixed(2)}% Net Worth</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FamilyOfficeCommandCenter;
