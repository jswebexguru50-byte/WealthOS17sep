import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  Percent,
  Calendar,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  Layers,
  ChevronDown,
  LineChart as LineIcon,
  Calculator,
  RefreshCw,
  Clock,
  Briefcase
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend
} from 'recharts';
import { AdvancedPortfolioAnalyticsDashboard } from './AdvancedPortfolioAnalyticsDashboard.js';
import { formatINR, formatUSD, formatCurrency as formatCurrencyUtil, formatPct } from '../lib/formatters.js';

interface AnalyticsViewProps {
  selectedPortfolio: string;
  setSelectedPortfolio: (portfolio: string) => void;
  portfolios: string[];
  formatCurrency: (val: number) => string;
}

export function AnalyticsView({
  selectedPortfolio,
  setSelectedPortfolio,
  portfolios,
  formatCurrency
}: AnalyticsViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom period XIRR state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customAnalytics, setCustomAnalytics] = useState<any>(null);

  // Scrip level analytics state
  const [scrips, setScrips] = useState<any[]>([]);
  const [includeSold, setIncludeSold] = useState(true);
  const [scripSearch, setScripSearch] = useState('');
  const [sortField, setSortField] = useState<string>('current_value');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  // Trailing periods XIRR state
  const [trailing, setTrailing] = useState<any>(null);

  // Valuation on given date state
  const [valuationDate, setValuationDate] = useState('');
  const [valuationData, setValuationData] = useState<any>(null);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    // Always include full transaction cash flows (including sold stocks) for fair, unbiased XIRR comparison
    let url = `/api/analytics?include_sold=true`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }
    if (startDate) {
      url += `&start_date=${startDate}`;
    }
    if (endDate) {
      url += `&end_date=${endDate}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCustomAnalytics(data.custom);
        setTrailing(data.trailing);
        setScrips(data.scrips || []);
      } else {
        setError(data.message || 'Failed to fetch analytics data.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure while loading analytics feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPortfolio, includeSold]);

  const handleApplyCustomPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAnalytics();
  };

  const handleResetCustomPeriod = () => {
    setStartDate('');
    setEndDate('');
    // State clearing and refetching immediately
    setTimeout(() => {
      fetchAnalytics();
    }, 50);
  };

  const handleCalculateValuation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valuationDate) return;

    setValuationLoading(true);
    setValuationError(null);
    setValuationData(null);

    let url = `/api/analytics/valuation-on-date?date=${valuationDate}`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setValuationData(data);
      } else {
        setValuationError(data.message || 'Failed to calculate historical valuation.');
      }
    } catch (err) {
      console.error(err);
      setValuationError('Network connection failed.');
    } finally {
      setValuationLoading(false);
    }
  };

  // Sort scrips
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedScrips = [...scrips]
    .filter(s => {
      if (!includeSold && (s.is_sold || (s.quantity || 0) <= 0.001)) return false;
      if (!scripSearch) return true;
      const search = scripSearch.toLowerCase();
      return (
        s.symbol?.toLowerCase().includes(search) ||
        s.company_name?.toLowerCase().includes(search) ||
        s.isin?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (aVal < bVal) return sortDirection === 'desc' ? 1 : -1;
      if (aVal > bVal) return sortDirection === 'desc' ? -1 : 1;
      return 0;
    });

  const PERIOD_ORDER: Record<string, number> = {
    '1w': 1,
    '1m': 2,
    '3m': 3,
    '6m': 4,
    '1y': 5,
    '2y': 6,
    '3y': 7,
    '5y': 8,
    'Since Inception': 9999
  };

  // Prepare data for Recharts Trailing periods comparison
  const trailingChartData = trailing
    ? Object.entries(trailing)
        .filter(([period]) => period !== '1d')
        .sort(([a], [b]) => (PERIOD_ORDER[a] ?? 500) - (PERIOD_ORDER[b] ?? 500))
        .map(([period, val]: [string, any]) => {
          const periodLabels: Record<string, string> = {
            '1w': '1 Week (7D)',
            '1m': '1 Month',
            '3m': '3 Months',
            '6m': '6 Months',
            '1y': '1 Year',
            '2y': '2 Years',
            '3y': '3 Years',
            '5y': '5 Years',
            'Since Inception': 'Since Inception'
          };

          return {
            name: periodLabels[period] || period,
            'Portfolio': val.portfolio,
            'Nifty 50': val.benchmarks?.nifty50 || 0,
            'Sensex': val.benchmarks?.sensex || 0,
            'Midcap 100': val.benchmarks?.nifty_midcap || 0,
            'Smallcap 100': val.benchmarks?.nifty_smallcap || 0,
            'Microcap 250': val.benchmarks?.nifty_microcap || 0
          };
        })
    : [];

  const indexDisplayNames: Record<string, string> = {
    nifty50: 'Nifty 50',
    sensex: 'BSE Sensex',
    nifty_midcap: 'Nifty Midcap 100',
    nifty_smallcap: 'Nifty Smallcap 100',
    nifty_microcap: 'Nifty Microcap 250'
  };

  return (
    <div className="space-y-8">
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-emerald-400" />
            Performance & Portfolio XIRR Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Review detailed annualized rate of return computations, index performance benchmarking, scrip level XIRR, and historical valuations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800/80 hover:bg-slate-850 text-xs font-semibold tracking-tight transition-all text-slate-200 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
            Refresh Analytics Data
          </button>
        </div>
      </div>

      {loading && !customAnalytics ? (
        <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Computing historical cash flows and portfolio XIRR values...</p>
        </div>
      ) : error ? (
        <div className="glass-card rounded-2xl p-8 border border-red-500/15 bg-red-950/5 flex flex-col items-center text-center">
          <Info className="w-10 h-10 text-red-400 mb-2" />
          <h3 className="font-display font-bold text-slate-100">Unable to Compute Analytics</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1">{error}</p>
        </div>
      ) : (
        <>
          {/* Custom Date Period & Benchmark Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Custom Period Picker */}
            <div className="glass-card rounded-2xl p-6 lg:col-span-1 flex flex-col justify-between">
              <div>
                <h3 className="font-display font-semibold text-slate-200 mb-2 tracking-tight flex items-center gap-2">
                  <Calendar className="w-4.5 h-4.5 text-emerald-400" />
                  Custom XIRR Period Analyzer
                </h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Filter transactions and cash flows to evaluate internal rate of return (XIRR) between any two dates.
                </p>

                <form onSubmit={handleApplyCustomPeriod} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500/40 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500/40 text-slate-200"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer"
                    >
                      Apply Filter
                    </button>
                    {(startDate || endDate) && (
                      <button
                        type="button"
                        onClick={handleResetCustomPeriod}
                        className="bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-400 text-xs font-semibold py-2 px-3 rounded-xl transition-all cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {customAnalytics && (
                <div className="border-t border-slate-800/60 pt-3.5 mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Period Selected</span>
                    <span className="text-slate-300 font-mono text-[11px]">
                      {customAnalytics.start_date} <span className="text-slate-500">to</span> {customAnalytics.end_date}
                    </span>
                  </div>
                  {customAnalytics.initial_value !== undefined && (
                    <div className="flex items-center justify-between text-xs border-t border-slate-900/60 pt-2">
                      <span className="text-slate-400 text-[11px]">Start Valuation</span>
                      <span className="font-mono text-slate-200 font-semibold text-[11px]">{formatCurrency(customAnalytics.initial_value)}</span>
                    </div>
                  )}
                  {customAnalytics.final_value !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">End Valuation</span>
                      <span className="font-mono text-slate-200 font-semibold text-[11px]">{formatCurrency(customAnalytics.final_value)}</span>
                    </div>
                  )}
                  {customAnalytics.net_investment !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Net Cash Additions</span>
                      <span className="font-mono text-slate-300 text-[11px]">
                        {customAnalytics.net_investment >= 0 ? `+${formatCurrency(customAnalytics.net_investment)}` : formatCurrency(customAnalytics.net_investment)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Period Results */}
            <div className="glass-card rounded-2xl p-6 lg:col-span-2 flex flex-col justify-between">
              <div>
                <h3 className="font-display font-semibold text-slate-200 mb-1 tracking-tight">Period Return Benchmark Comparison</h3>
                <p className="text-xs text-slate-400">Evaluating annualized rate of return (XIRR), absolute period gain, and benchmark comparisons.</p>
              </div>

              {/* 3-Metric Summary Grid: XIRR, Absolute Gain / Loss, Absolute Return (%) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 my-5 p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-lg overflow-hidden">
                {/* 1. XIRR */}
                <div className="min-w-0 text-center sm:text-left border-b sm:border-b-0 sm:border-r border-slate-700/80 pb-3 sm:pb-0 pr-0 sm:pr-4 overflow-hidden">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-emerald-300 font-mono block truncate">Portfolio XIRR</span>
                  <h2
                    title={customAnalytics && customAnalytics.portfolio !== null && customAnalytics.portfolio !== undefined ? formatPct(customAnalytics.portfolio, true) : '0.00%'}
                    className="text-lg sm:text-xl xl:text-2xl font-extrabold font-display text-white tracking-tight mt-1 truncate"
                  >
                    {customAnalytics && customAnalytics.portfolio !== null && customAnalytics.portfolio !== undefined ? formatPct(customAnalytics.portfolio, true) : '0.00%'}
                  </h2>
                  <p className="text-[11px] text-white/90 mt-1 uppercase font-semibold tracking-wide truncate">Annualised rate of return</p>
                </div>

                {/* 2. Absolute Gain / Loss */}
                <div className="min-w-0 text-center sm:text-left border-b sm:border-b-0 sm:border-r border-slate-700/80 pb-3 sm:pb-0 pr-0 sm:pr-4 overflow-hidden">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-200 font-mono block truncate">Absolute Gain / Loss</span>
                  {customAnalytics && customAnalytics.absolute_gain !== undefined ? (
                    <h2
                      title={customAnalytics.absolute_gain >= 0 ? `+${formatCurrency(customAnalytics.absolute_gain)}` : formatCurrency(customAnalytics.absolute_gain)}
                      className={`text-lg sm:text-xl xl:text-2xl font-extrabold font-display tracking-tight mt-1 truncate ${customAnalytics.absolute_gain >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                    >
                      {customAnalytics.absolute_gain >= 0 ? `+${formatCurrency(customAnalytics.absolute_gain)}` : formatCurrency(customAnalytics.absolute_gain)}
                    </h2>
                  ) : (
                    <h2 className="text-lg sm:text-xl xl:text-2xl font-extrabold font-display text-white tracking-tight mt-1 truncate">₹0</h2>
                  )}
                  <p className="text-[11px] text-white/90 mt-1 uppercase font-semibold tracking-wide truncate">Net profit/loss in period</p>
                </div>

                {/* 3. Absolute % Gain / Loss */}
                <div className="min-w-0 text-center sm:text-left overflow-hidden">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-200 font-mono block truncate">Absolute Return (%)</span>
                  {customAnalytics && customAnalytics.absolute_gain_pct !== undefined ? (
                    <h2
                      title={formatPct(customAnalytics.absolute_gain_pct, true)}
                      className={`text-lg sm:text-xl xl:text-2xl font-extrabold font-display tracking-tight mt-1 truncate ${customAnalytics.absolute_gain_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                    >
                      {formatPct(customAnalytics.absolute_gain_pct, true)}
                    </h2>
                  ) : (
                    <h2 className="text-lg sm:text-xl xl:text-2xl font-extrabold font-display text-white tracking-tight mt-1 truncate">0.00%</h2>
                  )}
                  <p className="text-[11px] text-white/90 mt-1 uppercase font-semibold tracking-wide truncate">Simple return on capital</p>
                </div>
              </div>

              {/* Benchmarks Section */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Index Benchmarks (XIRR)</span>
                {customAnalytics && customAnalytics.benchmarks && Object.keys(customAnalytics.benchmarks).length > 0 ? (
                  Object.entries(customAnalytics.benchmarks).map(([key, value]: [string, any]) => {
                    const portValue = customAnalytics.portfolio;
                    const diff = portValue - value;
                    const beatBenchmark = diff >= 0;

                    return (
                      <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950 border border-slate-900/60">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${beatBenchmark ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span className="text-xs text-slate-300 font-semibold">{indexDisplayNames[key] || key}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-xs font-bold text-slate-100">{formatPct(value)}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${beatBenchmark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {formatPct(diff, true)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 italic">No benchmark indices calculated. Ensure Nifty prices are loaded.</p>
                )}
              </div>

              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 border-t border-slate-900 pt-3">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                Index benchmarks replicate your trade cash flows to calculate exactly what return you would have received in that index.
              </div>
            </div>
          </div>

          {/* Trailing XIRR Benchmarking (All Indices) */}
          {trailingChartData.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-display font-semibold text-slate-200 tracking-tight flex items-center gap-2">
                    <Clock className="w-4.5 h-4.5 text-emerald-400" />
                    Trailing Return Benchmarks
                  </h3>
                  <p className="text-xs text-slate-400">Annualised performance comparisons across defined trailing timelines.</p>
                </div>
              </div>

              {/* Chart */}
              <div className="h-80 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trailingChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                    <YAxis tickFormatter={(val) => `${val}%`} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                    <ChartTooltip
                      contentStyle={{ background: 'var(--bg-modal)', borderColor: 'var(--border-card)', borderRadius: '12px', color: 'var(--text-primary)' }}
                      itemStyle={{ color: 'var(--text-secondary)' }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      formatter={(val: any, name: any) => [`${Number(val).toFixed(2)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="Portfolio" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Nifty 50" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Sensex" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Midcap 100" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Smallcap 100" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Microcap 250" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Trailing Data Table */}
              <div className="overflow-x-auto border border-slate-900 rounded-xl mt-6">
                <table className="w-full border-collapse text-left text-xs text-slate-400">
                  <thead className="bg-slate-950 font-semibold text-slate-300 border-b border-slate-900">
                    <tr>
                      <th className="p-3">Trailing Period</th>
                      <th className="p-3 text-right text-emerald-400 font-bold">Absolute Return</th>
                      <th className="p-3 text-right text-cyan-400 font-bold">Annualized (XIRR)</th>
                      <th className="p-3 text-right">Nifty 50</th>
                      <th className="p-3 text-right">Sensex</th>
                      <th className="p-3 text-right">Nifty Midcap 100</th>
                      <th className="p-3 text-right">Nifty Smallcap 100</th>
                      <th className="p-3 text-right">Nifty Microcap 250</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 bg-slate-900/10">
                    {Object.entries(trailing)
                      .filter(([period]) => period !== '1d')
                      .sort(([a], [b]) => (PERIOD_ORDER[a] ?? 500) - (PERIOD_ORDER[b] ?? 500))
                      .map(([period, val]: [string, any]) => {
                      const periodLabels: Record<string, string> = {
                        '1w': '1 Week (7D)',
                        '1m': '1 Month',
                        '3m': '3 Months',
                        '6m': '6 Months',
                        '1y': '1 Year',
                        '2y': '2 Years',
                        '3y': '3 Years',
                        '5y': '5 Years',
                        'Since Inception': 'Since Inception'
                      };
                      const isSubAnnual = ['1w', '1m', '3m', '6m'].includes(period) || val.is_annualized === false;
                      const absRet = val.portfolio_absolute !== undefined ? val.portfolio_absolute : val.portfolio;
                      const xirrRet = isSubAnnual ? null : (val.portfolio_xirr !== undefined ? val.portfolio_xirr : val.portfolio);
                      return (
                        <tr key={period} className="hover:bg-slate-950/40 transition-colors">
                          <td className="p-3 font-semibold text-slate-200">{periodLabels[period] || period}</td>
                          <td className="p-3 text-right font-bold text-emerald-400 font-mono">{formatPct(absRet)}</td>
                          <td className="p-3 text-right font-bold text-cyan-400 font-mono">
                            {isSubAnnual || xirrRet === null ? (
                              <span className="text-slate-500 font-normal text-[11px]" title="GIPS standard: Returns for periods < 1 year are not annualized">N/A (&lt; 1Y)</span>
                            ) : (
                              formatPct(xirrRet)
                            )}
                          </td>
                          <td className="p-3 text-right font-mono">{formatPct(val.benchmarks?.nifty50)}</td>
                          <td className="p-3 text-right font-mono">{formatPct(val.benchmarks?.sensex)}</td>
                          <td className="p-3 text-right font-mono">{formatPct(val.benchmarks?.nifty_midcap)}</td>
                          <td className="p-3 text-right font-mono">{formatPct(val.benchmarks?.nifty_smallcap)}</td>
                          <td className="p-3 text-right font-mono">{formatPct(val.benchmarks?.nifty_microcap)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* GIPS Compliance standard footnote */}
              <div className="mt-3.5 p-3 rounded-xl bg-slate-950/60 border border-slate-900 flex items-center gap-2 text-[11px] text-slate-400">
                <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  <strong className="text-slate-300">GIPS® / CFA Institute Standard:</strong> Returns for periods &lt; 1 year (1W, 1M, 3M, 6M) represent cumulative/absolute holding-period returns and are <span className="text-emerald-400 font-semibold">not annualized</span> to prevent misleading compound rate distortions.
                </span>
              </div>
            </div>
          )}

          {/* Historical Portfolio Valuation on a Given Date */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-semibold text-slate-200 mb-1 tracking-tight flex items-center gap-2">
              <Calculator className="w-4.5 h-4.5 text-emerald-400" />
              Calculation of Valuation on a Given Date
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Pick any date in the past to reconstruct your portfolio holdings list and compute exact historical valuations with actual historical stock closing prices.
            </p>

            <form onSubmit={handleCalculateValuation} className="flex flex-col sm:flex-row gap-3 items-end max-w-xl mb-6">
              <div className="flex-1 w-full">
                <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">Target Date</label>
                <input
                  type="date"
                  required
                  value={valuationDate}
                  onChange={(e) => setValuationDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-emerald-500/40 text-slate-200"
                />
              </div>
              <button
                type="submit"
                disabled={valuationLoading || !valuationDate}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-6 py-3 rounded-xl tracking-wide transition-all cursor-pointer shadow-lg shadow-emerald-500/10 disabled:opacity-50 shrink-0"
              >
                {valuationLoading ? 'Reconstructing Ledger...' : 'Calculate Valuation'}
              </button>
            </form>

            {valuationLoading && (
              <div className="p-12 flex flex-col items-center justify-center space-y-4 border border-dashed border-slate-800 rounded-xl">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                <p className="text-slate-400 text-xs">Rebuilding FIFO holdings and locating historical stock price archives as of {valuationDate}...</p>
              </div>
            )}

            {valuationError && (
              <div className="p-4 border border-red-500/15 bg-red-950/5 text-red-400 rounded-xl text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>{valuationError}</span>
              </div>
            )}

            {valuationData && (
              <div className="space-y-6">
                {/* Metrics Summary Blocks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Invested Cost Basis</span>
                    <h4 className="text-lg font-bold text-slate-200 font-mono mt-1">
                      {formatCurrency(valuationData.total_cost)}
                    </h4>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Historical Value on {valuationData.date}</span>
                    <h4 className="text-lg font-bold text-slate-100 font-mono mt-1">
                      {formatCurrency(valuationData.total_value)}
                    </h4>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Unrealized Profit & Loss (PnL)</span>
                    <h4 className={`text-lg font-bold font-mono mt-1 ${valuationData.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(valuationData.unrealized_pnl)} ({(valuationData.unrealized_pct || 0).toFixed(2)}%)
                    </h4>
                  </div>
                </div>

                {/* Holdings Table */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">Reconstructed Holdings on {valuationData.date}</h4>
                  <div className="overflow-x-auto border border-slate-900 rounded-xl">
                    <table className="w-full border-collapse text-left text-xs text-slate-400">
                      <thead className="bg-slate-950 font-semibold text-slate-300 border-b border-slate-900">
                        <tr>
                          <th className="p-3">Stock Symbol</th>
                          <th className="p-3">Company Name</th>
                          <th className="p-3 text-right">Holding Quantity</th>
                          <th className="p-3 text-right">Avg Buy Price</th>
                          <th className="p-3 text-right">Total Invested</th>
                          <th className="p-3 text-right">LTP (On Date)</th>
                          <th className="p-3 text-right">Value (On Date)</th>
                          <th className="p-3 text-right">Historical PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 bg-slate-900/5">
                        {valuationData.holdings.length > 0 ? (
                          valuationData.holdings.map((h: any) => (
                            <tr key={h.symbol} className="hover:bg-slate-950/30 transition-colors">
                              <td className="p-3 font-semibold text-slate-200">
                                <div>
                                  {h.symbol}
                                  <span className="text-[9px] text-slate-500 font-mono block uppercase">{h.isin}</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-300 truncate max-w-[200px]">{h.company_name}</td>
                              <td className="p-3 text-right font-mono text-slate-200">{h.quantity.toLocaleString()}</td>
                              <td className="p-3 text-right font-mono">{formatCurrency(h.avg_price)}</td>
                              <td className="p-3 text-right font-mono font-medium text-slate-300">{formatCurrency(h.total_cost)}</td>
                              <td className="p-3 text-right font-mono">
                                <div>
                                  {formatCurrency(h.price_on_date)}
                                  <span className="text-[9px] text-slate-500 block font-sans">used {h.date_used}</span>
                                </div>
                              </td>
                              <td className="p-3 text-right font-mono font-semibold text-slate-200">{formatCurrency(h.value_on_date)}</td>
                              <td className={`p-3 text-right font-mono font-bold ${h.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(h.unrealized_pnl)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="p-4 text-center text-slate-500">No active holdings reconstructed on this date.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Individual Stock / Scrip-Level XIRR & Performance */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-900 pb-4">
              <div>
                <h3 className="font-display font-semibold text-slate-200 tracking-tight flex items-center gap-2">
                  <Briefcase className="w-4.5 h-4.5 text-emerald-400" />
                  Individual Stock Performance & XIRR
                </h3>
                <p className="text-xs text-slate-400">Detailed annualized rate of return (XIRR) and investment gains for each distinct security.</p>
              </div>

              {/* Toggles and Searches */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search field */}
                <div className="relative w-48 sm:w-56">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scripSearch}
                    onChange={(e) => setScripSearch(e.target.value)}
                    placeholder="Search scrip symbol..."
                    className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-9 pr-3.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-emerald-500/40 text-slate-200 placeholder:text-slate-500"
                  />
                </div>

                {/* Toggle sold out */}
                <label className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSold}
                    onChange={(e) => setIncludeSold(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  Include Sold Out
                </label>
              </div>
            </div>

            {/* Scrips Table */}
            <div className="overflow-x-auto border border-slate-900 rounded-xl">
              <table className="w-full border-collapse text-left text-xs text-slate-400">
                <thead className="bg-slate-950 font-semibold text-slate-300 border-b border-slate-900">
                  <tr>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100" onClick={() => handleSort('symbol')}>
                      <div className="flex items-center gap-1.5">
                        Scrip / ISIN
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100" onClick={() => handleSort('company_name')}>
                      <div className="flex items-center gap-1.5">
                        Company Name
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('quantity')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Quantity
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('avg_price')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Avg Cost
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('total_cost')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Invested
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('current_value')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Current Value
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('realized_pnl')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Realized PnL
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('unrealized_pnl')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Unrealized PnL
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('net_pnl')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Net Total PnL
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right" onClick={() => handleSort('unrealized_pct')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Absolute Gain %
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="p-3 cursor-pointer select-none hover:text-slate-100 text-right text-emerald-400" onClick={() => handleSort('xirr')}>
                      <div className="flex items-center gap-1.5 justify-end">
                        Scrip XIRR
                        <ArrowUpDown className="w-3 h-3 text-emerald-500/70" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 bg-slate-900/5">
                  {sortedScrips.length > 0 ? (
                    sortedScrips.map((s) => (
                      <tr key={s.symbol} className="hover:bg-slate-950/30 transition-colors">
                        <td className="p-3 font-semibold text-slate-200">
                          <div>
                            {s.symbol}
                            {s.is_sold && (
                              <span className="text-[8px] bg-slate-850 text-slate-400 border border-slate-800/80 px-1 py-0.5 rounded ml-1.5 uppercase tracking-wide font-bold">Sold Out</span>
                            )}
                            <span className="text-[9px] text-slate-500 font-mono block uppercase">{s.isin}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-300 truncate max-w-[200px]">{s.company_name}</td>
                        <td className="p-3 text-right font-mono text-slate-200">{s.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(s.avg_price)}</td>
                        <td className="p-3 text-right font-mono font-medium text-slate-300">{formatCurrency(s.total_cost)}</td>
                        <td className="p-3 text-right font-mono font-medium text-slate-200">{formatCurrency(s.current_value)}</td>
                        <td className="p-3 text-right font-mono font-semibold">
                          <span className={(s.realized_pnl || 0) > 0 ? 'text-emerald-400' : (s.realized_pnl || 0) < 0 ? 'text-red-400' : 'text-slate-500'}>
                            {formatCurrency(s.realized_pnl || 0)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold">
                          <span className={(s.unrealized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {formatCurrency(s.unrealized_pnl || 0)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold">
                          <span className={(s.net_pnl !== undefined ? s.net_pnl : (s.unrealized_pnl + (s.realized_pnl || 0))) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {formatCurrency(s.net_pnl !== undefined ? s.net_pnl : (s.unrealized_pnl + (s.realized_pnl || 0)))}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-mono font-bold text-sm ${(s.unrealized_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPct(s.unrealized_pct, true)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {s.xirr !== null && s.xirr !== undefined ? (
                            <span className={`font-mono font-extrabold text-sm ${s.xirr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatPct(s.xirr)}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-medium italic">N/A</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 italic">No scrips matched your criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
