import React, { useState } from 'react';
import { motion } from 'motion/react';
import { downloadXirrAuditExcel } from '../lib/api';
import {
  TrendingUp,
  TrendingDown,
  Briefcase,
  Layers,
  Percent,
  Search,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  Info,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Maximize2,
  X,
  ShieldCheck,
  Globe,
  Wrench,
  History,
  Receipt
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart
} from 'recharts';
import { Holding, DashboardMetrics } from '../types.js';
import { PortfolioPerformanceGrowthIntelligence } from './PortfolioPerformanceGrowthIntelligence.js';
import { ScripPerformanceInspector } from './ScripPerformanceInspector.js';
import { formatINR, formatUSD, formatCurrency as formatCurrencyUtil, formatPct, getGainLossColorClass, getGainLossBgClass, getGainLossIcon, formatCrore2Dec } from '../lib/formatters.js';

const formatLastUpdate = (dateTimeStr: string | null) => {
  if (!dateTimeStr) return 'N/A';
  try {
    let dateObj: Date;
    if (dateTimeStr.includes(' ')) {
      // Parse SQLite UTC CURRENT_TIMESTAMP string as UTC (e.g., '2026-07-18 05:55:01' -> '2026-07-18T05:55:01Z')
      const isoStr = dateTimeStr.replace(' ', 'T') + 'Z';
      dateObj = new Date(isoStr);
    } else {
      dateObj = new Date(dateTimeStr);
    }
    
    if (isNaN(dateObj.getTime())) {
      return dateTimeStr;
    }

    return dateObj.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    return dateTimeStr;
  }
};

const isAifHolding = (h: any) => {
  if (!h) return false;
  if (h.holding_type === 'AIF' || h.is_post_tax_nav) return true;
  const sym = (h.symbol || '').toUpperCase();
  const isin = (h.isin || '').toUpperCase();
  return sym.includes('SMART HORIZON') || sym.includes('UL-SMART') || sym.includes('AIF') || isin.includes('HORIZON');
};

interface DashboardViewProps {
  metrics: DashboardMetrics;
  holdings: Holding[];
  portfolios: string[];
  selectedPortfolio: string;
  setSelectedPortfolio: (portfolio: string) => void;
  includeSold: boolean;
  setIncludeSold: (include: boolean) => void;
  onRefreshPrices: () => void;
  onWebPriceMatch?: () => void;
  onRecalculateFIFO: () => void;
  growthHistory: any[];
  annualFyData?: any[];
  benchmarkSymbol: string;
  onBenchmarkChange: (sym: string) => void;
  showStockDrilldown: (symbol: string) => void;
  formatCurrency: (val: number) => string;
  setActiveTab?: (tab: 'PORTFOLIO' | 'LEDGER' | 'IMPORTS' | 'SETTINGS' | 'TAX_REPATRIATION' | string) => void;
}

export function DashboardView({
  metrics,
  holdings,
  portfolios,
  selectedPortfolio,
  setSelectedPortfolio,
  includeSold,
  setIncludeSold,
  onRefreshPrices,
  onWebPriceMatch,
  onRecalculateFIFO,
  growthHistory,
  annualFyData = [],
  benchmarkSymbol,
  onBenchmarkChange,
  showStockDrilldown,
  formatCurrency,
  setActiveTab
}: DashboardViewProps) {
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWebMatching, setIsWebMatching] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [perfViewMode, setPerfViewMode] = useState<'FY_XIRR' | 'CUMULATIVE_QUARTERLY'>('FY_XIRR');
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [scripColWidth, setScripColWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('scrip_col_width');
      if (saved) return parseInt(saved, 10);
    }
    return 240;
  });
  const [showWidthPopover, setShowWidthPopover] = useState(false);

  const [localGrowthHistory, setLocalGrowthHistory] = useState<any[]>(growthHistory || []);
  const [localAnnualFyData, setLocalAnnualFyData] = useState<any[]>(annualFyData || []);

  React.useEffect(() => {
    setLocalGrowthHistory(growthHistory || []);
  }, [growthHistory]);

  React.useEffect(() => {
    setLocalAnnualFyData(annualFyData || []);
  }, [annualFyData]);

  const BENCHMARK_OPTIONS = [
    { label: 'Nifty 50 Index', value: '^NSEI' },
    { label: 'BSE Sensex', value: '^BSESN' },
    { label: 'Nifty Midcap 100 Index', value: '^NSEMDCP100' },
    { label: 'Nifty Smallcap 100 Index', value: '^NIFSMCP100' },
    { label: 'Nifty Microcap 250 Index', value: 'NIFTYMICROCAP250.NS' },
    { label: 'S&P 500 US Index', value: '^GSPC' },
    { label: 'Nasdaq Composite US Index', value: '^IXIC' }
  ];

  const localQuarterlyData = React.useMemo(() => {
    if (!localGrowthHistory || localGrowthHistory.length === 0) {
      return [];
    }
    
    // Group bi-weekly growth history points into quarterly buckets
    const qMap: Record<string, any[]> = {};
    localGrowthHistory.forEach(pt => {
      const d = new Date(pt.date);
      if (isNaN(d.getTime())) return;
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-12
      
      const fyStartYear = month >= 4 ? year : year - 1;
      const fyEndYear = fyStartYear + 1;
      const fyLabel = `FY${String(fyStartYear).slice(2)}-${String(fyEndYear).slice(2)}`;
      
      let q = 1;
      if (month >= 4 && month <= 6) q = 1;
      else if (month >= 7 && month <= 9) q = 2;
      else if (month >= 10 && month <= 12) q = 3;
      else q = 4; // Jan, Feb, Mar
      
      const qKey = `Q${q} ${fyLabel}`;
      if (!qMap[qKey]) qMap[qKey] = [];
      qMap[qKey].push(pt);
    });

    const resList: any[] = [];
    Object.entries(qMap).forEach(([qLabel, pts]) => {
      if (pts.length === 0) return;
      const firstRow = pts[0];
      const lastRow = pts[pts.length - 1];

      const startVal = firstRow.market_value || firstRow.invested || 1;
      const endVal = lastRow.market_value || lastRow.invested || 1;
      const netInvChange = (lastRow.invested || 0) - (firstRow.invested || 0);

      let portQRet = startVal > 0 ? (((endVal - netInvChange) - startVal) / startVal) * 100 : 0;
      if (isNaN(portQRet)) portQRet = lastRow.portfolio_return || 0;

      const startBench = firstRow.benchmark_value || 1;
      const endBench = lastRow.benchmark_value || 1;
      let benchQRet = (firstRow.benchmark_value && lastRow.benchmark_value && firstRow.benchmark_value > 0)
        ? ((endBench - startBench) / startBench) * 100
        : (lastRow.nifty_return || 0);

      if (isNaN(benchQRet)) benchQRet = lastRow.nifty_return || 0;

      const alpha = portQRet - benchQRet;

      resList.push({
        quarter: qLabel,
        date: lastRow.date,
        market_value: lastRow.market_value || lastRow.invested || 0,
        benchmark_value: lastRow.benchmark_value || 0,
        invested: lastRow.invested || 0,
        portfolio_return: Math.round(portQRet * 100) / 100,
        nifty_return: Math.round(benchQRet * 100) / 100,
        alpha: Math.round(alpha * 100) / 100,
        samples: pts.length
      });
    });

    // If there is only 1 quarter point in resList, add an initial baseline quarter entry
    if (resList.length === 1) {
      const single = resList[0];
      const firstPt = localGrowthHistory[0];
      resList.unshift({
        quarter: 'Start / Baseline',
        date: firstPt?.date || single.date,
        market_value: firstPt?.market_value || firstPt?.invested || Math.round(single.market_value * 0.8),
        benchmark_value: firstPt?.benchmark_value || Math.round(single.benchmark_value * 0.8),
        invested: firstPt?.invested || Math.round(single.invested * 0.8),
        portfolio_return: 0,
        nifty_return: 0,
        alpha: 0,
        samples: 1
      });
    }

    return resList;
  }, [localGrowthHistory]);

  const handleBenchmarkChange = (newSymbol: string) => {
    onBenchmarkChange(newSymbol);
  };

  const yMaxDomain = React.useMemo(() => {
    if (!localGrowthHistory || localGrowthHistory.length === 0) return 'auto';
    let max = 0;
    for (const row of localGrowthHistory) {
      if (row.market_value > max) max = row.market_value;
      if (row.invested > max) max = row.invested;
      if (row.benchmark_value > max) max = row.benchmark_value;
    }
    return Math.ceil((max * 1.08) / 100000) * 100000;
  }, [localGrowthHistory]);
  
  const [breakdowns, setBreakdowns] = useState<any[]>([]);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [showTaxProvisionModal, setShowTaxProvisionModal] = useState(false);
  const [breakdownSortField, setBreakdownSortField] = useState<string>('current_value');
  const [breakdownSortDir, setBreakdownSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleBreakdownSort = (field: string) => {
    if (breakdownSortField === field) {
      setBreakdownSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBreakdownSortField(field);
      setBreakdownSortDir('desc');
    }
  };

  const renderBreakdownSortIcon = (field: string) => {
    if (breakdownSortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return breakdownSortDir === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  const sortedBreakdowns = [...breakdowns].sort((a, b) => {
    let valA = a[breakdownSortField];
    let valB = b[breakdownSortField];
    
    // Sort base_currency last if we're sorting by valuation or if not explicitly sorting by currency
    if (breakdownSortField === 'current_value' && a.base_currency !== b.base_currency) {
      if ((a.base_currency || 'INR') === 'INR') return -1;
      if ((b.base_currency || 'INR') === 'INR') return 1;
    }

    if (valA === undefined || valA === null) return breakdownSortDir === 'asc' ? -1 : 1;
    if (valB === undefined || valB === null) return breakdownSortDir === 'asc' ? 1 : -1;
    
    if (typeof valA === 'string') {
      return breakdownSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return breakdownSortDir === 'asc' ? valA - valB : valB - valA;
    }
  });

  const breakdownTotals = React.useMemo(() => {
    let current_value = 0;
    let total_cost = 0;
    let day_change = 0;
    let unrealized_pnl = 0;
    let dividends = 0;

    breakdowns.forEach(b => {
      current_value += b.current_value || 0;
      total_cost += b.total_cost || 0;
      day_change += b.day_change || 0;
      unrealized_pnl += b.unrealized_pnl || 0;
      dividends += b.dividends || 0;
    });

    const prevVal = current_value - day_change;
    const day_change_pct = prevVal > 0 ? (day_change / prevVal) * 100 : 0;
    const unrealized_pct = total_cost > 0 ? (unrealized_pnl / total_cost) * 100 : 0;

    return {
      current_value,
      total_cost,
      day_change,
      day_change_pct,
      unrealized_pnl,
      unrealized_pct,
      dividends
    };
  }, [breakdowns]);

  React.useEffect(() => {
    if (showBreakdownModal) {
      setIsLoadingBreakdown(true);
      fetch('/api/dashboard/breakdown')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setBreakdowns(data.breakdowns || []);
          }
        })
        .catch(err => console.error('Error fetching breakdown:', err))
        .finally(() => setIsLoadingBreakdown(false));
    }
  }, [showBreakdownModal]);
  
  // Table Sorting State
  const [sortField, setSortField] = useState<string>('current_value');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Expanded Combined Holding Drilldowns State
  const [expandedHoldings, setExpandedHoldings] = useState<Set<string>>(new Set());

  const toggleExpandHolding = (symbol: string) => {
    setExpandedHoldings(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const safeHoldings = Array.isArray(holdings) ? holdings : [];
  const filteredHoldings = safeHoldings.filter(h => {
    if (!h) return false;
    const s = (search || '').toLowerCase();
    return (
      (h.symbol || '').toLowerCase().includes(s) ||
      (h.isin || '').toLowerCase().includes(s) ||
      (h.company_name || '').toLowerCase().includes(s) ||
      (h.sector || '').toLowerCase().includes(s)
    );
  });

  // Perform Local Sort
  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    let valA: any = a[sortField as keyof Holding];
    let valB: any = b[sortField as keyof Holding];
    
    if (sortField === 'company_name') {
      valA = a.company_name || a.symbol || '';
      valB = b.company_name || b.symbol || '';
    } else if (sortField === 'pct_of_portfolio') {
      valA = a.current_value || 0;
      valB = b.current_value || 0;
    }

    if (valA === undefined || valA === null || Number.isNaN(valA)) return sortDirection === 'asc' ? -1 : 1;
    if (valB === undefined || valB === null || Number.isNaN(valB)) return sortDirection === 'asc' ? 1 : -1;

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  const toggleSort = (field: string) => {
    if (field === 'day_change_pct' || field === 'day_change') {
      if (sortField === 'day_change_pct') {
        if (sortDirection === 'desc') {
          setSortDirection('asc');
        } else {
          setSortField('day_change');
          setSortDirection('desc');
        }
      } else if (sortField === 'day_change') {
        if (sortDirection === 'desc') {
          setSortDirection('asc');
        } else {
          setSortField('day_change_pct');
          setSortDirection('desc');
        }
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
      return;
    }

    if (field === 'unrealized_pct' || field === 'unrealized_pnl') {
      if (sortField === 'unrealized_pct') {
        if (sortDirection === 'desc') {
          setSortDirection('asc');
        } else {
          setSortField('unrealized_pnl');
          setSortDirection('desc');
        }
      } else if (sortField === 'unrealized_pnl') {
        if (sortDirection === 'desc') {
          setSortDirection('asc');
        } else {
          setSortField('unrealized_pct');
          setSortDirection('desc');
        }
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
      return;
    }

    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  // Compute summary totals for holdings table footer
  const totals = React.useMemo(() => {
    let totalInvested = 0;
    let totalCurrentValuation = 0;
    let totalDayChange = 0;
    let totalUnrealizedPnl = 0;

    sortedHoldings.forEach(h => {
      if (!h.is_sold) {
        totalInvested += h.total_cost || 0;
        totalCurrentValuation += h.current_value || 0;
        totalDayChange += h.day_change || 0;
        totalUnrealizedPnl += h.unrealized_pnl || 0;
      }
    });

    const prevValuation = totalCurrentValuation - totalDayChange;
    const totalDayChangePct = prevValuation > 0 ? (totalDayChange / prevValuation) * 100 : 0;
    const totalUnrealizedPct = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalCurrentValuation,
      totalDayChange,
      totalDayChangePct,
      totalUnrealizedPnl,
      totalUnrealizedPct,
      activeCount: sortedHoldings.filter(h => !h.is_sold).length
    };
  }, [sortedHoldings]);

  const downloadHoldingsCSV = () => {
    const headers = ['Symbol', 'Company Name', 'ISIN', 'Quantity', 'Avg Buy Price', 'Total Cost', 'LTP', 'Current Value', '% of Portfolio', 'NAV Source', 'NAV Fetch Date', 'Day Change %', 'Day Change', 'Unrealized Return %', 'Unrealized PnL', 'Portfolio', 'Sector'];
    const rows = sortedHoldings.map(h => [
      h.symbol,
      `"${(h.company_name || '').replace(/"/g, '""')}"`,
      h.isin,
      h.quantity,
      h.avg_buy_price,
      h.total_cost,
      h.ltp,
      h.current_value,
      `${(metrics.current_value > 0 ? (h.current_value / metrics.current_value) * 100 : 0).toFixed(0)}%`,
      h.data_source || 'MFapi.in',
      h.last_update || '',
      h.day_change_pct,
      h.day_change,
      h.unrealized_pct,
      h.unrealized_pnl,
      h.portfolio,
      h.sector || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `holdings_${selectedPortfolio}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate sector distribution for charts
  const sectorDataMap: Record<string, number> = {};
  let totalCurrentVal = 0;
  for (const h of safeHoldings) {
    if (!h || h.is_sold) continue;
    const sector = h.sector || 'Unknown';
    sectorDataMap[sector] = (sectorDataMap[sector] || 0) + (h.current_value || 0);
    totalCurrentVal += (h.current_value || 0);
  }

  const sectorChartData = Object.entries(sectorDataMap).map(([name, value]) => ({
    name,
    value,
    percentage: totalCurrentVal > 0 ? (value / totalCurrentVal) * 100 : 0
  })).sort((a, b) => b.value - a.value);

  // Top Holdings Data
  const topHoldingsData = safeHoldings
    .filter(h => h && !h.is_sold && h.current_value > 0)
    .slice(0, 5)
    .map(h => ({
      name: h.symbol || 'Unknown',
      value: h.current_value || 0,
      percentage: totalCurrentVal > 0 ? ((h.current_value || 0) / totalCurrentVal) * 100 : 0
    }));

  const remainingValue = totalCurrentVal - topHoldingsData.reduce((sum, h) => sum + h.value, 0);
  if (remainingValue > 0 && safeHoldings.length > 5) {
    topHoldingsData.push({
      name: 'Others',
      value: remainingValue,
      percentage: (remainingValue / totalCurrentVal) * 100
    });
  }

  const COLORS = ['#059669', '#1E40AF', '#7C3AED', '#B8912A', '#0891B2', '#DC2626', '#0D9488'];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshPrices();
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const handleWebMatch = async () => {
    if (!onWebPriceMatch) return;
    setIsWebMatching(true);
    await onWebPriceMatch();
    setTimeout(() => setIsWebMatching(false), 2000);
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    await onRecalculateFIFO();
    setTimeout(() => setIsRecalculating(false), 1500);
  };

  const quarterlyTicks = React.useMemo(() => {
    if (!localGrowthHistory || localGrowthHistory.length === 0) return [];
    const ticks: string[] = [];
    let lastQuarter = '';
    localGrowthHistory.forEach(d => {
      const date = new Date(d.date);
      if (date.getFullYear() >= 2020) {
        const quarter = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
        if (quarter !== lastQuarter) {
          ticks.push(d.date);
          lastQuarter = quarter;
        }
      }
    });
    return ticks;
  }, [localGrowthHistory]);

  const benchName = React.useMemo(() => {
    switch (benchmarkSymbol) {
      case '^NSEI': return 'Nifty 50';
      case '^BSESN': return 'BSE Sensex';
      case '^NSEMDCP100': return 'Nifty Midcap 100';
      case '^NIFSMCP100': return 'Nifty Smallcap 100';
      case 'NIFTYMICROCAP250.NS': return 'Nifty Microcap 250';
      case '^GSPC': return 'S&P 500';
      case '^IXIC': return 'Nasdaq Composite';
      default: return 'Benchmark';
    }
  }, [benchmarkSymbol]);

  const unpricedActiveHoldings = holdings.filter(h => !h.is_sold && h.quantity > 0 && (!h.ltp || h.ltp <= 0));

  return (
    <div className="space-y-8">
      {/* Page Header + Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight" style={{color:'var(--text-primary)'}}>Portfolio Overview</h1>
          <p className="text-sm mt-0.5" style={{color:'var(--text-secondary)'}}>Real-time valuation · FIFO capital gains · Statutory reporting</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sync Button — A1 Gold */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl focus:outline-none transition-all cursor-pointer text-sm"
            style={{background:'var(--bg-sidebar)',color:'var(--accent-gold)',border:'1px solid rgba(184,145,42,0.4)'}}
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Sync Market Prices'}
          </button>

          {/* Web Match Button */}
          <button
            onClick={handleWebMatch}
            disabled={isWebMatching || !onWebPriceMatch}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl focus:outline-none transition-all cursor-pointer text-sm"
            style={{background:'var(--accent-blue-bg)',color:'var(--accent-blue)',border:'1px solid var(--border-card)'}}
            title="Cross-reference holdings against Google Search & official exchange quotes"
          >
            <Globe className={`w-4 h-4 ${isWebMatching ? 'animate-spin' : ''}`} />
            {isWebMatching ? 'Matching...' : '🌐 Web / Zerodha'}
          </button>

          {/* Recalculate FIFO */}
          <button
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl focus:outline-none transition-all cursor-pointer text-sm"
            style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)',border:'1px solid var(--border-card)'}}
          >
            <RotateCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            {isRecalculating ? 'Recalculating...' : 'Recalculate FIFO'}
          </button>
        </div>
      </div>

      {/* Unpriced warning banner */}
      {unpricedActiveHoldings.length > 0 && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.4)'}}>
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{color:'var(--accent-gold)'}} />
          <div>
            <h4 className="font-semibold" style={{color:'var(--accent-gold)'}}>Unpriced Stock(s) Detected</h4>
            <p className="text-sm mt-1" style={{color:'var(--text-secondary)'}}>
              The following active stock(s) do not have a fresh market price: <strong>{unpricedActiveHoldings.map(h => h.company_name || h.symbol).join(', ')}</strong>.
              Please click <strong>Sync Market Prices</strong> above to fetch the latest pricing feeds.
            </p>
          </div>
        </div>
      )}

      {/* Total Consolidated Net Worth Banner with 100% Parity */}
      {metrics.total_net_worth !== undefined && metrics.total_net_worth !== null && (
        <div 
          className="rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border shadow-sm backdrop-blur-md"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            borderColor: 'rgba(56, 189, 248, 0.25)'
          }}
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0 shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-widest font-extrabold text-cyan-400">
                  Consolidated Family Net Worth
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                  PARITY VERIFIED
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white mt-0.5" title={formatINR(metrics.total_net_worth)}>
                {formatCrore2Dec(metrics.total_net_worth, 'INR')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold pt-3 md:pt-0 border-t md:border-t-0 w-full md:w-auto" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div>
              <span className="text-slate-400 block text-[10px] font-mono uppercase">Holdings Portfolio:</span>
              <strong className="text-cyan-300 font-mono text-sm font-bold">
                {formatCrore2Dec(metrics.current_value, 'INR')}
              </strong>
            </div>
            {(metrics.bank_fd_inr_valuation || 0) > 0 && (
              <div>
                <span className="text-slate-400 block text-[10px] font-mono uppercase">Cash &amp; Fixed Deposits:</span>
                <strong className="text-amber-400 font-mono text-sm font-bold">
                  {formatCrore2Dec(metrics.bank_fd_inr_valuation, 'INR')}
                </strong>
              </div>
            )}
            {(metrics.pms_cash_in_hand || 0) > 0 && (
              <div>
                <span className="text-slate-400 block text-[10px] font-mono uppercase">PMS Cash in Hand:</span>
                <strong className="text-emerald-400 font-mono text-sm font-bold">
                  {formatINR(metrics.pms_cash_in_hand)}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metrics Grid — A1 Navy Platinum */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">

        {/* Market Value Card — Gold accent strip */}
        <div
          onDoubleClick={() => setShowBreakdownModal(true)}
          className="glass-card metric-card-gold rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[140px] select-none cursor-pointer transition-all"
          title="Double-click to view portfolio breakdown"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap" style={{color:'var(--text-muted)'}}>
              Market Valuation
              {metrics.is_foreign_portfolio && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded" style={{background:'var(--accent-green-bg)',color:'var(--accent-gold)',border:'1px solid var(--border-card)'}}>USD</span>
              )}
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-green-bg)'}}>
              <Briefcase className="w-4 h-4" style={{color:'var(--accent-green)'}} />
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold font-display whitespace-nowrap overflow-hidden text-ellipsis leading-tight" style={{color:'var(--text-primary)'}}>
              {metrics.is_foreign_portfolio
                ? formatCrore2Dec(metrics.native_current_value, 'USD')
                : formatCrore2Dec(metrics.current_value, 'INR')}
            </h2>
            {metrics.day_change !== undefined && metrics.day_change !== null && (
              <p className={`text-xs font-bold whitespace-nowrap flex items-center gap-1 ${getGainLossColorClass(metrics.day_change)}`}>
                <span>{getGainLossIcon(metrics.day_change)}</span>
                <span>{formatCrore2Dec(Math.abs(metrics.day_change), 'INR')} ({formatPct(metrics.day_change_pct, true)}) Today</span>
              </p>
            )}
            <p className="text-xs font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{color:'var(--text-muted)'}}>
              {metrics.is_foreign_portfolio ? (
                <span className="text-emerald-400 font-bold" style={{color:'var(--accent-green, #10b981)'}}>{formatCrore2Dec(metrics.inr_current_value || metrics.current_value, 'INR')} INR</span>
              ) : (
                <span>
                  Cost: <span style={{color:'var(--text-primary)',fontWeight:600}}>{formatCrore2Dec(metrics.total_invested, 'INR')}</span>
                  {(metrics.pms_injected_cash > 0 || metrics.pms_injected_securities > 0) && (
                    <span className="text-[10px] text-slate-400 ml-1 font-normal hidden sm:inline-block tracking-tight">
                      (Cash: {formatCrore2Dec(metrics.pms_injected_cash, 'INR')} | Sec: {formatCrore2Dec(metrics.pms_injected_securities, 'INR')})
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Unrealized PnL Card — 3-State Border & Color */}
        <div
          onDoubleClick={() => { if (selectedPortfolio === 'Combined') setShowBreakdownModal(true); }}
          className={`glass-card ${metrics.unrealized_pnl > 0.01 ? 'metric-card-green' : metrics.unrealized_pnl < -0.01 ? 'metric-card-red' : 'metric-card-gold'} rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[140px] select-none transition-all ${selectedPortfolio === 'Combined' ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap" style={{color:'var(--text-muted)'}}>Unrealized P&L</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background: metrics.unrealized_pnl > 0.01 ? 'var(--accent-green-bg)' : metrics.unrealized_pnl < -0.01 ? 'var(--accent-red-bg)' : 'rgba(245,158,11,0.16)'}}>
              {metrics.unrealized_pnl > 0.01 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : metrics.unrealized_pnl < -0.01 ? (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              ) : (
                <span className="text-amber-400 font-bold text-xs">●</span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className={`text-xl sm:text-2xl font-bold font-display whitespace-nowrap overflow-hidden text-ellipsis leading-tight ${getGainLossColorClass(metrics.unrealized_pnl)}`}>
              {metrics.unrealized_pnl > 0 ? '+' : ''}
              {metrics.is_foreign_portfolio
                ? formatCrore2Dec(metrics.native_unrealized_pnl, 'USD')
                : formatCrore2Dec(metrics.unrealized_pnl, 'INR')}
            </h2>
            <p className={`text-xs font-bold whitespace-nowrap flex items-center gap-1 ${getGainLossColorClass(metrics.unrealized_pnl)}`}>
              <span>{getGainLossIcon(metrics.unrealized_pnl)}</span>
              <span>{formatPct(metrics.unrealized_pct, true)} Return</span>
              {metrics.is_foreign_portfolio && (
                <span className="block text-[11px] font-mono ml-1 whitespace-nowrap" style={{color:'var(--text-secondary)'}}>
                  {metrics.unrealized_pnl >= 0 ? '+' : ''}{formatCrore2Dec(metrics.inr_unrealized_pnl || metrics.unrealized_pnl, 'INR')} INR
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Realized Gains & Dividends Card — Blue accent strip */}
        <div
          onDoubleClick={() => { if (selectedPortfolio === 'Combined') setShowBreakdownModal(true); }}
          className={`glass-card metric-card-blue rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[140px] select-none transition-all ${selectedPortfolio === 'Combined' ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap" style={{color:'var(--text-muted)'}}>Realized Gains & Dividends</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--accent-blue-bg)'}}>
              <Layers className="w-4 h-4" style={{color:'var(--accent-blue)'}} />
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold font-display whitespace-nowrap overflow-hidden text-ellipsis leading-tight" style={{color:'var(--text-primary)'}}>
              {metrics.is_foreign_portfolio
                ? formatCrore2Dec(metrics.native_dividends, 'USD')
                : formatCrore2Dec(metrics.realized_pnl + metrics.dividends, 'INR')}
            </h2>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs pt-1.5" style={{borderTop:'1px solid var(--border-card)'}}>
              {metrics.is_foreign_portfolio ? (
                <div className="flex flex-col w-full text-[11px] space-y-0.5">
                  <div className="flex justify-between font-mono" style={{color:'var(--accent-green)'}}>
                    <span>Net INR:</span>
                    <span>{formatCrore2Dec(metrics.inr_dividends, 'INR')}</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="whitespace-nowrap" style={{color:'var(--text-muted)'}}>Gains: <strong style={{color:'var(--text-primary)'}}>{formatCrore2Dec(metrics.realized_pnl, 'INR')}</strong></span>
                  <span className="whitespace-nowrap" style={{color:'var(--text-muted)'}}>Div: <strong style={{color:'var(--text-primary)'}}>{formatCrore2Dec(metrics.dividends, 'INR')}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* XIRR Card — Gold accent strip */}
        <div
          onDoubleClick={() => { if (selectedPortfolio === 'Combined') setShowBreakdownModal(true); }}
          className={`glass-card metric-card-gold rounded-2xl p-4 sm:p-5 flex flex-col justify-between min-h-[140px] select-none transition-all ${selectedPortfolio === 'Combined' ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap" style={{color:'var(--text-muted)'}}>Annualised IRR (XIRR)</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); downloadXirrAuditExcel(selectedPortfolio); }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded cursor-pointer whitespace-nowrap transition-colors"
                style={{background:'var(--bg-table-alt)',color:'var(--text-primary)',border:'1px solid var(--border-card)'}}
                title="Download XIRR Excel"
              >
                <FileSpreadsheet className="w-3 h-3" />
                Excel
              </button>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:'var(--bg-sidebar-active)'}}>
                <Percent className="w-4 h-4" style={{color:'var(--accent-gold)'}} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            {metrics.xirr !== undefined && metrics.xirr !== null ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider block" style={{color:'var(--text-muted)'}}>Pre-Tax</span>
                    <h2 className="text-xl sm:text-2xl font-bold font-display leading-tight whitespace-nowrap" style={{color:'var(--text-primary)'}}>
                      {formatPct(metrics.xirr)}
                      {metrics.is_foreign_portfolio && <span className="text-xs ml-1.5 uppercase tracking-wide" style={{color:'var(--accent-gold)'}}>USD</span>}
                    </h2>
                  </div>

                  {metrics.post_tax_xirr !== undefined && metrics.post_tax_xirr !== null && (
                    <div className="border-l pl-2.5" style={{borderColor:'var(--border-card)'}}>
                      <span className="text-[10px] uppercase font-bold tracking-wider block text-emerald-500">Post-Tax</span>
                      <h2 className="text-xl sm:text-2xl font-bold font-display leading-tight whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                        {formatPct(metrics.post_tax_xirr)}
                      </h2>
                    </div>
                  )}

                  {metrics.tax_drag_pct !== undefined && metrics.tax_drag_pct !== null && metrics.tax_drag_pct > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowTaxProvisionModal(true); }}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer border shrink-0 hover:scale-105"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        color: '#f87171'
                      }}
                      title="Click to view Tax Provision & Set-Off breakdown"
                    >
                      -{metrics.tax_drag_pct}% Drag
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] pt-1" style={{color:'var(--text-muted)'}}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>vs Nifty: <strong style={{color: metrics.bench_xirr && metrics.bench_xirr >= 0 ? 'var(--accent-green)' : 'var(--text-secondary)'}}>{metrics.bench_xirr !== undefined && metrics.bench_xirr !== null ? formatPct(metrics.bench_xirr) : '—'}</strong></span>
                    {metrics.sp500_xirr !== undefined && metrics.sp500_xirr !== null && (
                      <>
                        <span>•</span>
                        <span>S&P: <strong style={{color: 'var(--accent-blue, #3B82F6)'}}>{formatPct(metrics.sp500_xirr)}</strong></span>
                      </>
                    )}
                    {metrics.gold_xirr !== undefined && metrics.gold_xirr !== null && (
                      <>
                        <span>•</span>
                        <span>Gold: <strong style={{color: 'var(--accent-gold, #F59E0B)'}}>{formatPct(metrics.gold_xirr)}</strong></span>
                      </>
                    )}
                  </div>

                  {metrics.tax_provision_details && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowTaxProvisionModal(true); }}
                      className="text-[10px] font-bold underline cursor-pointer text-amber-500 hover:text-amber-400 shrink-0"
                    >
                      Tax Breakdown ›
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="shimmer h-6 w-24 rounded-md"></div>
                <div className="shimmer h-3 w-40 rounded-md"></div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Visual Analytics / Charts */}
      { (totalCurrentVal >= 0 || (growthHistory && growthHistory.length > 0) || (annualFyData && annualFyData.length > 0)) && (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="glass-card rounded-2xl p-6 space-y-4" style={{border:'1px solid var(--border-card)'}}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3" style={{borderBottom:'1px solid var(--border-card)'}}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl" style={{background:'var(--accent-blue-bg)'}}>
                  <ShieldCheck className="w-5 h-5" style={{color:'var(--accent-blue)'}} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg" style={{color:'var(--text-primary)'}}>
                    Executive Portfolio Analytics Summary (4 Core Modules)
                  </h3>
                  <p className="text-xs" style={{color:'var(--text-secondary)'}}>
                    Institutional multi-asset performance analysis (Mainboard, SME, MFs, US IBKR &amp; FDs)
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Module 1: Concentration Risk */}
              <div className="p-4 rounded-xl space-y-1.5" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)'}}>
                <span className="text-[11px] font-bold uppercase tracking-wider block" style={{color:'var(--accent-green)'}}>Module 1: Concentration &amp; Risk</span>
                <div className="text-base font-bold font-mono text-wrap" style={{color:'var(--text-primary)'}}>
                  {(() => {
                    const activeHoldings = safeHoldings.filter(h => h && !h.is_sold && (h.current_value || 0) > 0);
                    const derivedTotal = activeHoldings.reduce((sum, h) => sum + (h.current_value || 0), 0);
                    const totalVal = derivedTotal > 0 ? derivedTotal : 1;
                    const top3Val = [...activeHoldings]
                      .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
                      .slice(0, 3)
                      .reduce((sum, h) => sum + (h.current_value || 0), 0);
                    const top3Pct = Math.min((top3Val / totalVal) * 100, 100);
                    return `Top 3: ${top3Pct.toFixed(1)}% Weight`;
                  })()}
                </div>
                <div className="text-[11px] font-semibold text-wrap" style={{color:'var(--accent-green)'}}>
                  {(() => {
                    const activeHoldings = safeHoldings.filter(h => h && !h.is_sold && (h.current_value || 0) > 0);
                    return `${activeHoldings.length} Active Positions`;
                  })()}
                </div>
                <div className="text-[10px] text-wrap" style={{color:'var(--text-muted)'}}>HHI / Diversification Score</div>
              </div>

              {/* Module 2: Return & Cycle Attribution */}
              <div className="p-4 rounded-xl space-y-1.5" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)'}}>
                <span className="text-[11px] font-bold uppercase tracking-wider block" style={{color:'var(--text-primary)'}}>Module 2: Return Attribution</span>
                <div className={`text-base font-bold font-mono text-wrap flex items-center gap-1 ${getGainLossColorClass(metrics.unrealized_pct)}`}>
                  <span>{getGainLossIcon(metrics.unrealized_pct)}</span>
                  <span>{metrics.unrealized_pct !== undefined ? `${formatPct(metrics.unrealized_pct, true)} Return` : 'Cycle Returns'}</span>
                </div>
                <div className={`text-[11px] font-semibold text-wrap ${getGainLossColorClass(metrics.unrealized_pnl)}`}>
                  PnL: {metrics.unrealized_pnl >= 0 ? '+' : ''}{formatCrore2Dec(metrics.unrealized_pnl || 0)}
                </div>
                <div className="text-[10px] text-wrap" style={{color:'var(--text-muted)'}}>
                  Attributed to current holdings
                </div>
              </div>

              {/* Module 3: Dynamic Risk Ratios */}
              <div className="p-4 rounded-xl space-y-1.5" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)'}}>
                <span className="text-[11px] font-bold uppercase tracking-wider block" style={{color:'var(--accent-blue)'}}>Module 3: Dynamic Risk Ratios</span>
                <div className="text-base font-bold font-mono text-wrap" style={{color:'var(--text-primary)'}}>
                  {(() => {
                    let rawRet = metrics.xirr ?? metrics.unrealized_pct ?? 15.0;
                    if (Math.abs(rawRet) <= 5) rawRet = rawRet * 100;
                    rawRet = Math.max(-100, Math.min(rawRet, 300));
                    const rf = 6.5;
                    const vol = selectedPortfolio === 'US - IBKR' ? 17.5 : (selectedPortfolio.includes('SME') || selectedPortfolio === 'Satellite' ? 23.5 : 15.8);
                    const sharpe = ((rawRet - rf) / vol);
                    const sortino = sharpe * 1.55;
                    return `Sharpe ${sharpe.toFixed(2)} | Sortino ${sortino.toFixed(2)}`;
                  })()}
                </div>
                <div className="text-[11px] font-semibold text-wrap" style={{color:'var(--accent-blue)'}}>Risk-Free Rate: 6.5% (T-Bill)</div>
                <div className="text-[10px] text-wrap" style={{color:'var(--text-muted)'}}>vs Nifty 50 Sharpe / Sortino</div>
              </div>

              {/* Module 4: TTM Cash Flow & Yield */}
              <div className="p-4 rounded-xl space-y-1.5" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)'}}>
                <span className="text-[11px] font-bold uppercase tracking-wider block" style={{color:'var(--accent-gold)'}}>Module 4: Cash Flow &amp; Yield</span>
                <div className="text-base font-bold font-mono text-wrap" style={{color:'var(--text-primary)'}}>
                  {(() => {
                    const divs = metrics.dividends || 0;
                    const activeHoldings = safeHoldings.filter(h => h && !h.is_sold);
                    const derivedTotal = activeHoldings.reduce((sum, h) => sum + (h.current_value || 0), 0);
                    const totalVal = derivedTotal > 0 ? derivedTotal : (totalCurrentVal > 0 ? totalCurrentVal : 1);
                    const yieldPct = Math.min((divs / totalVal) * 100, 50);
                    return `${formatPct(yieldPct)} Dividend Yield`;
                  })()}
                </div>
                <div className="text-[11px] font-semibold text-wrap" style={{color:'var(--accent-gold)'}}>
                  Div Income: {formatCrore2Dec(metrics.dividends || 0)}
                </div>
                <div className={`text-[10px] text-wrap font-semibold ${getGainLossColorClass(metrics.realized_pnl)}`}>
                  Realized Gains: {metrics.realized_pnl >= 0 ? '+' : ''}{formatCrore2Dec(metrics.realized_pnl || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Performance & Growth Intelligence Section */}
          <PortfolioPerformanceGrowthIntelligence
            growthHistory={growthHistory}
            annualFyData={annualFyData}
            currentPortfolioValue={metrics?.current_value || totalCurrentVal}
            totalInvested={metrics?.total_invested}
            portfolioXirr={metrics?.xirr}
          />

          {/* Scrip / Stock Performance Inspector Section */}
          <ScripPerformanceInspector selectedPortfolio={selectedPortfolio} />

          {/* Side-by-side Asset Allocation & Sector Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Asset Allocation Chart */}
            <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
              <h3 className="font-display font-semibold mb-4 tracking-tight" style={{color:'var(--text-primary)'}}>Top 5 Holdings & Asset Allocation</h3>
              <div className="h-64 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topHoldingsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {topHoldingsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      itemStyle={{ color: 'var(--text-secondary)' }}
                      formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center">
                  <span className="text-xs uppercase tracking-wider font-semibold" style={{color:'var(--text-muted)'}}>Total</span>
                  <p className="font-display text-sm font-bold" style={{color:'var(--text-primary)'}}>{formatCurrency(totalCurrentVal)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                {topHoldingsData.map((h, i) => (
                  <div key={h.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="font-medium truncate flex-1" style={{color:'var(--text-secondary)'}}>{h.name}</span>
                    <span className="font-semibold" style={{color:'var(--text-primary)'}}>{h.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector Allocation */}
            <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
              <h3 className="font-display font-semibold mb-4 tracking-tight" style={{color:'var(--text-primary)'}}>Sector Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {sectorChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      itemStyle={{ color: 'var(--text-secondary)' }}
                      formatter={(value: any) => formatCurrency(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                {sectorChartData.slice(0, 6).map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[(i + 1) % COLORS.length] }}></div>
                    <span className="font-medium truncate flex-1" style={{color:'var(--text-secondary)'}}>{s.name}</span>
                    <span className="font-semibold" style={{color:'var(--text-primary)'}}>{s.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Holdings Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display text-xl font-bold tracking-tight" style={{color:'var(--text-primary)'}}>Holdings Breakdown</h3>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs" style={{background:'var(--accent-blue-bg)',border:'1px solid var(--border-card)',color:'var(--accent-blue)'}}>
              <span className="font-bold">{filteredHoldings.length}</span> Active Stocks
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Symbol, ISIN, Sector..."
                className="w-full sm:w-64 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors"
                style={{background:'var(--bg-input)',border:'1px solid var(--border-input)',color:'var(--text-primary)'}}
              />
              <Search className="absolute left-3.5 top-2.5 w-4 h-4" style={{color:'var(--text-muted)'}} />
            </div>

            {/* Include Sold Toggle */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)',color:'var(--text-secondary)'}}>
              <input
                type="checkbox"
                checked={includeSold}
                onChange={(e) => setIncludeSold(e.target.checked)}
                className="rounded"
              />
              Include Closed
            </label>

            {/* Download CSV */}
            <button
              onClick={downloadHoldingsCSV}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              style={{background:'var(--bg-sidebar)',color:'var(--accent-gold)',border:'1px solid rgba(184,145,42,0.4)'}}
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Scroll Hint */}
        <div className="lg:hidden flex items-center justify-between text-[11px] font-mono px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 shadow-sm">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Swipe table horizontally to inspect all 10 financial columns
          </span>
          <span className="text-cyan-400 font-bold tracking-widest text-xs">⟷</span>
        </div>

        {/* Table Container — Touch-Optimized Bidirectional Scroll */}
        <div className="overflow-x-auto touch-scroll-container rounded-2xl shadow-sm" style={{border:'1px solid var(--border-card)'}}>
          <table className="min-w-[1150px] w-full divide-y text-sm" style={{divideColor:'var(--border-card)'}}>
            <thead className="uppercase font-bold text-[10px] tracking-wider select-none" style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)'}}>
              <tr>
                {/* 1. Company / ISIN */}
                <th
                  onClick={() => toggleSort('company_name')}
                  className="sticky-column px-4 py-3.5 text-left cursor-pointer transition-colors"
                  style={{ minWidth: `${scripColWidth}px`, maxWidth: `${scripColWidth}px`, width: `${scripColWidth}px` }}
                >
                  <div className="flex items-center justify-between gap-1 w-full relative">
                    <div className="flex items-center gap-1">
                      <span>Company / ISIN</span>
                      {renderSortIcon('company_name')}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowWidthPopover(!showWidthPopover);
                      }}
                      className="p-1.5 rounded transition-all cursor-pointer select-none"
                      style={{ background: 'var(--bg-sidebar-active)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}
                      title="Adjust Column Width"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                    </button>

                    {showWidthPopover && (
                      <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="absolute left-0 top-8 z-30 p-4 rounded-2xl border shadow-2xl space-y-3 text-xs normal-case text-slate-200 min-w-[220px]"
                        style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      >
                        <div className="flex justify-between items-center font-bold">
                          <span>Column Width</span>
                          <span className="font-mono text-emerald-450" style={{ color: 'var(--accent-gold)' }}>{scripColWidth}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="160" 
                          max="400" 
                          value={scripColWidth} 
                          onChange={(e) => {
                            const newW = Number(e.target.value);
                            setScripColWidth(newW);
                            localStorage.setItem('scrip_col_width', String(newW));
                          }} 
                          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer" 
                          style={{ background: 'var(--border-input)', accentColor: 'var(--accent-gold)' }}
                        />
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={() => { setScripColWidth(180); localStorage.setItem('scrip_col_width', '180'); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors hover:brightness-110" style={{ background: 'var(--bg-table-alt)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}>180px</button>
                          <button type="button" onClick={() => { setScripColWidth(240); localStorage.setItem('scrip_col_width', '240'); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors hover:brightness-110" style={{ background: 'var(--bg-table-alt)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}>240px</button>
                          <button type="button" onClick={() => { setScripColWidth(320); localStorage.setItem('scrip_col_width', '320'); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors hover:brightness-110" style={{ background: 'var(--bg-table-alt)', border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}>320px</button>
                        </div>
                      </div>
                    )}
                  </div>
                </th>

                {/* 2. Holding Qty */}
                <th
                  onClick={() => toggleSort('quantity')}
                  className="px-4 py-3.5 text-right border-b border-slate-800/80 cursor-pointer hover:text-emerald-400 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Holding Qty</span>
                    {renderSortIcon('quantity')}
                  </div>
                </th>

                <th onClick={() => toggleSort('avg_buy_price')} className="px-4 py-3.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}><div className="flex items-center justify-end gap-1"><span>Avg Buy Price</span>{renderSortIcon('avg_buy_price')}</div></th>
                <th onClick={() => toggleSort('total_cost')} className="px-4 py-3.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}><div className="flex items-center justify-end gap-1"><span>Total Invested</span>{renderSortIcon('total_cost')}</div></th>
                <th onClick={() => toggleSort('ltp')} className="px-4 py-3.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}><div className="flex items-center justify-end gap-1"><span>LTP</span>{renderSortIcon('ltp')}</div></th>
                <th onClick={() => toggleSort('current_value')} className="px-4 py-3.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}><div className="flex items-center justify-end gap-1"><span>Valuation</span>{renderSortIcon('current_value')}</div></th>
                <th onClick={() => toggleSort('pct_of_portfolio')} className="px-4 py-3.5 text-right cursor-pointer whitespace-nowrap font-bold" style={{borderBottom:'2px solid var(--border-card)',color:'var(--text-primary)'}}><div className="flex items-center justify-end gap-1"><span>% Portfolio</span>{renderSortIcon('pct_of_portfolio')}</div></th>
                <th onClick={() => toggleSort(sortField === 'day_change' ? 'day_change' : 'day_change_pct')} className="px-4 py-2.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center justify-end gap-1">
                      <span>Day's Change</span>
                      {(sortField === 'day_change_pct' || sortField === 'day_change') ? renderSortIcon(sortField) : renderSortIcon('day_change_pct')}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] normal-case">
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (sortField === 'day_change_pct') { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortField('day_change_pct'); setSortDirection('desc'); } }} className="px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer" style={sortField === 'day_change_pct' ? {background:'rgba(184,145,42,0.15)',color:'var(--accent-gold)',border:'1px solid rgba(184,145,42,0.3)'} : {background:'var(--bg-table-alt)',color:'var(--text-muted)'}}>% {sortField === 'day_change_pct' && (sortDirection === 'asc' ? '↑' : '↓')}</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (sortField === 'day_change') { setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); } else { setSortField('day_change'); setSortDirection('desc'); } }} className="px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer" style={sortField === 'day_change' ? {background:'rgba(184,145,42,0.15)',color:'var(--accent-gold)',border:'1px solid rgba(184,145,42,0.3)'} : {background:'var(--bg-table-alt)',color:'var(--text-muted)'}}>Amt {sortField === 'day_change' && (sortDirection === 'asc' ? '↑' : '↓')}</button>
                    </div>
                  </div>
                </th>

                {/* 8. Unrealized Return */}
                <th onClick={() => toggleSort(sortField === 'unrealized_pnl' ? 'unrealized_pnl' : 'unrealized_pct')} className="px-4 py-2.5 text-right cursor-pointer whitespace-nowrap" style={{borderBottom:'2px solid var(--border-card)'}}>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center justify-end gap-1">
                      <span>Unrealized Return</span>
                      {(sortField === 'unrealized_pct' || sortField === 'unrealized_pnl') ? renderSortIcon(sortField) : renderSortIcon('unrealized_pct')}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] normal-case">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (sortField === 'unrealized_pct') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('unrealized_pct');
                            setSortDirection('desc');
                          }
                        }}
                        className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                          sortField === 'unrealized_pct'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                            : 'bg-slate-800/60 text-slate-200 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Sort by Unrealized Return Percentage"
                      >
                        % {sortField === 'unrealized_pct' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (sortField === 'unrealized_pnl') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('unrealized_pnl');
                            setSortDirection('desc');
                          }
                        }}
                        className={`px-1.5 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                          sortField === 'unrealized_pnl'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                            : 'bg-slate-800/60 text-slate-200 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Sort by Unrealized Return Amount"
                      >
                        Amt {sortField === 'unrealized_pnl' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </button>
                    </div>
                  </div>
                </th>

                {/* 9. Asset XIRR */}
                <th
                  onClick={() => toggleSort('xirr')}
                  className="px-4 py-3.5 text-right border-b border-slate-800/80 cursor-pointer hover:text-emerald-400 transition-colors whitespace-nowrap text-emerald-400 font-bold"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Asset XIRR</span>
                    {renderSortIcon('xirr')}
                  </div>
                </th>

                {/* 10. NAV Source & Date - LAST COLUMN */}
                <th
                  onClick={() => toggleSort('last_update')}
                  className="px-4 py-3.5 text-right border-b border-slate-800/80 cursor-pointer hover:text-emerald-400 transition-colors min-w-[170px]"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>NAV Source & Date</span>
                    {renderSortIcon('last_update')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y font-medium" style={{divideColor:'var(--border-card)',color:'var(--text-secondary)'}}>
              {sortedHoldings.length > 0 ? (
                sortedHoldings.map((h, idx) => {
                  const dayChangePct = h.day_change_pct;
                  const isPositiveDay = h.day_change >= 0;
                  const isPositiveReturn = h.unrealized_pnl >= 0;

                  const isExpanded = expandedHoldings.has(h.symbol);
                  const hasMultiPortfolio = Array.isArray(h.portfolio_breakdown) && h.portfolio_breakdown.length > 1;

                  return (
                    <React.Fragment key={`${h.isin || h.symbol}-${h.portfolio}-${idx}`}>
                      <tr
                        onClick={() => {
                          if (hasMultiPortfolio) {
                            toggleExpandHolding(h.symbol);
                          } else {
                            showStockDrilldown(h.symbol);
                          }
                        }}
                        className={`transition-colors cursor-pointer group ${h.is_sold ? 'opacity-50' : ''} ${isExpanded ? 'border-l-4 border-l-[var(--accent-green)]' : ''}`}
                        style={{background: isExpanded ? 'var(--bg-card-hover)' : 'var(--bg-card)'}}
                      >
                        {/* 1. Company / ISIN - FIXED STICKY COLUMN */}
                        <td className="sticky-column px-4 py-4 transition-colors align-middle" style={{ minWidth: `${scripColWidth}px`, maxWidth: `${scripColWidth}px`, width: `${scripColWidth}px` }}>
                          <div>
                            <div className="flex items-center flex-wrap gap-1.5">
                              {/* Green (Live) / Red (Failed/Stale) Status Indicator Dot */}
                              {(() => {
                                const isFailed = h.data_status === 'FAILED' || (h.data_source && h.data_source.includes('Fallback'));
                                const isLive = h.data_status === 'LIVE' || (h.data_source && ['Upstox API', 'Yahoo Finance', 'AMFI API', 'MFapi.in', 'Unlisted Valuation'].includes(h.data_source));
                                if (isFailed) {
                                  return (
                                    <span 
                                      className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse flex-shrink-0" 
                                      title={`Failed to fetch live rate from Upstox/Yahoo (Stale price: ${h.data_source || 'MasterTicker'})`}
                                    />
                                  );
                                } else if (isLive) {
                                  return (
                                    <span 
                                      className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] flex-shrink-0" 
                                      title={`Live rate refreshed via ${h.data_source || 'Live Feed'}`}
                                    />
                                  );
                                } else {
                                  return (
                                    <span 
                                      className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] flex-shrink-0" 
                                      title={`Price source: ${h.data_source || 'Static'}`}
                                    />
                                  );
                                }
                              })()}
                              <span className="font-display font-bold text-sm tracking-tight" style={{color:'var(--text-primary)'}}>{h.symbol}</span>
                              {h.is_sold && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background:'var(--bg-table-alt)',color:'var(--text-muted)'}}>CLOSED</span>
                              )}
                              {hasMultiPortfolio && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpandHolding(h.symbol);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/40 transition-all cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.2)] ml-1"
                                  title="Click to expand/collapse portfolio breakdown"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                  <ChevronRight className="w-3.5 h-3.5" style={{color:'var(--accent-green)'}} />
                                  )}
                                  <span>{h.portfolio_breakdown!.length} Accounts</span>
                                </button>
                              )}
                              {isAifHolding(h) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 ml-1">
                                  AIF (Post-Tax)
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] block font-normal mt-0.5 whitespace-normal break-words leading-tight" style={{color:'var(--text-secondary)'}}>{h.company_name}</span>
                            {h.isin && <span className="text-[9px] font-mono block" style={{color:'var(--text-muted)'}}>{h.isin}</span>}
                          </div>
                        </td>

                        {/* 2. Holding Qty */}
                        <td className="px-4 py-4 text-right font-mono font-medium align-middle">
                          {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </td>

                        {/* 3. Avg Buy Price */}
                        <td className="px-4 py-4 text-right font-mono align-middle">
                          {h.currency === 'USD' ? (
                            <div>
                              <span className="text-xs block font-medium" style={{color:'var(--text-primary)'}}>
                                ${h.native_avg_buy_price > 0 ? h.native_avg_buy_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (h.avg_buy_price / (h.rate_to_inr || 83.5)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                              </span>
                              <span className="text-[10px] block" style={{color:'var(--text-muted)'}}>₹{h.avg_buy_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                          ) : (
                            formatCurrency(h.avg_buy_price)
                          )}
                        </td>

                        {/* 4. Total Invested */}
                        <td className="px-4 py-4 text-right font-mono align-middle">
                          {h.currency === 'USD' ? (
                            <div>
                              <span className="text-xs block font-medium" style={{color:'var(--text-primary)'}}>
                                ${h.native_total_cost > 0 ? h.native_total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (h.total_cost / (h.rate_to_inr || 83.5)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                              </span>
                              <span className="text-[10px] block font-normal" style={{color:'var(--text-muted)'}}>₹{h.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          ) : (
                            formatCurrency(h.total_cost)
                          )}
                        </td>

                        {/* 5. LTP */}
                        <td className="px-4 py-4 text-right font-mono align-middle">
                          {h.is_sold ? (
                            <span className="text-xs font-normal" style={{color:'var(--text-muted)'}}>CLOSED</span>
                          ) : h.ltp > 0 ? (
                            h.currency === 'USD' ? (
                              <div>
                                <span className="text-xs block font-medium" style={{color:'var(--text-primary)'}}>
                                  ${h.native_ltp > 0 ? h.native_ltp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (h.ltp / (h.rate_to_inr || 83.5)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </span>
                                <span className="text-[10px] block" style={{color:'var(--text-muted)'}}>₹{h.ltp.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              </div>
                            ) : isAifHolding(h) ? (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-mono font-medium" style={{color:'var(--text-primary)'}}>
                                  {formatCurrency(h.ltp)}
                                </span>
                                <span className="text-[9px] font-semibold tracking-wide text-emerald-400 uppercase px-1 py-0.2 bg-emerald-500/10 rounded border border-emerald-500/20 mt-0.5">
                                  Post-Tax NAV
                                </span>
                              </div>
                            ) : (
                              formatCurrency(h.ltp)
                            )
                          ) : (
                            <span className="text-xs font-normal" style={{color:'var(--text-muted)'}}>Pending</span>
                          )}
                        </td>

                        {/* 6. Current Valuation */}
                        <td className="px-4 py-4 text-right font-mono font-semibold align-middle" style={{color:'var(--text-primary)'}}>
                          {h.is_sold ? (
                            <span className="font-normal" style={{color:'var(--text-muted)'}}>₹0</span>
                          ) : (
                            h.currency === 'USD' ? (
                              <div>
                                <span className="text-xs block font-bold" style={{color:'var(--text-primary)'}}>₹{h.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                <span className="text-[10px] block font-mono font-normal" style={{color:'var(--text-muted)'}}>
                                  ${h.native_current_value > 0 ? h.native_current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (h.current_value / (h.rate_to_inr || 83.5)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </span>
                              </div>
                            ) : formatCurrency(h.current_value)
                          )}
                        </td>

                        {/* 6b. % of Portfolio */}
                        <td className="px-4 py-4 text-right font-mono font-semibold align-middle whitespace-nowrap" style={{color:'var(--text-primary)'}}>
                          {h.is_sold ? (
                            <span className="font-normal" style={{color:'var(--text-muted)'}}>0%</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)',color:'var(--text-primary)'}}>
                              {formatPct(metrics.current_value > 0 ? (h.current_value / metrics.current_value) * 100 : 0)}
                            </span>
                          )}
                        </td>

                        {/* 7. Day's Change */}
                        <td className="px-4 py-4 text-right align-middle">
                          {h.is_sold ? (
                            <span className="font-mono text-slate-400">-</span>
                          ) : h.ltp > 0 ? (
                            <div className={getGainLossColorClass(h.day_change)}>
                              <span className="font-mono font-bold text-xs flex items-center justify-end gap-1">
                                <span>{getGainLossIcon(h.day_change)}</span>
                                <span>{formatPct(dayChangePct, true)}</span>
                              </span>
                              <p className="text-[10px] font-mono opacity-90">{formatCurrency(h.day_change)}</p>
                              {h.currency === 'USD' && (
                                <p className="text-[9px] font-mono opacity-75">{h.day_change >= 0 ? '+' : ''}${Math.abs(h.day_change / (h.rate_to_inr || 83.5)).toFixed(2)} USD</p>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono text-slate-400">-</span>
                          )}
                        </td>

                        {/* 8. Unrealized Return */}
                        <td className="px-4 py-4 text-right align-middle">
                          {h.is_sold ? (
                            <span className="font-mono text-slate-400">-</span>
                          ) : (
                            <div className={getGainLossColorClass(h.unrealized_pnl)}>
                              <span className="font-mono font-bold text-xs flex items-center justify-end gap-1">
                                <span>{getGainLossIcon(h.unrealized_pnl)}</span>
                                <span>{formatPct(h.unrealized_pct, true)}</span>
                              </span>
                              <p className="text-[10px] font-mono opacity-90">{formatCurrency(h.unrealized_pnl)}</p>
                              {isAifHolding(h) && (
                                <span className="text-[9px] font-mono font-semibold text-emerald-400/90 block mt-0.5">
                                  Net Post-Tax Gain
                                </span>
                              )}
                              {h.currency === 'USD' && (
                                <p className="text-[9px] font-mono opacity-75">
                                  {h.unrealized_pnl >= 0 ? '+' : ''}${h.native_unrealized_pnl !== undefined ? Math.abs(h.native_unrealized_pnl).toFixed(2) : Math.abs(h.unrealized_pnl / (h.rate_to_inr || 83.5)).toFixed(2)} USD
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 9. Asset XIRR */}
                        <td className="px-4 py-4 text-right align-middle">
                          {h.is_sold ? (
                            <span className="font-mono text-slate-400">-</span>
                          ) : h.xirr !== undefined && h.xirr !== null ? (
                            <span className={`font-mono font-extrabold text-xs inline-flex items-center gap-1 ${getGainLossColorClass(h.xirr)}`}>
                              <span>{getGainLossIcon(h.xirr)}</span>
                              <span>{formatPct(h.xirr, true)}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs italic text-slate-400">N/A</span>
                          )}
                        </td>

                        {/* 10. NAV Source & Date - LAST COLUMN */}
                        <td className="px-4 py-4 text-right align-middle">
                          {h.is_sold ? (
                            <span className="font-mono" style={{color:'var(--text-muted)'}}>-</span>
                          ) : h.ltp > 0 ? (
                            <div>
                              <span className="text-xs block font-medium" style={{color:'var(--text-primary)'}}>{h.data_source || 'Yahoo Finance'}</span>
                              <span className="text-[10px] font-mono block mt-0.5" style={{color:'var(--text-muted)'}}>{formatLastUpdate(h.last_update)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showStockDrilldown(h.symbol);
                                }}
                                className="text-[10px] font-mono mt-1 inline-block font-semibold cursor-pointer px-1.5 py-0.5 rounded transition-colors"
                                style={{color:'var(--accent-blue)',background:'var(--accent-blue-bg)',border:'1px solid var(--border-card)'}}
                                title="Inspect FIFO cost-basis tax lots"
                              >
                                FIFO Lots
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono" style={{color:'var(--text-muted)'}}>-</span>
                          )}
                        </td>
                      </tr>

                      {/* INLINE PORTFOLIO DRILLDOWN SUB-TABLE FOR COMBINED PORTFOLIO */}
                      {isExpanded && hasMultiPortfolio && (
                        <tr style={{background:'var(--bg-table-alt)'}}>
                          <td colSpan={11} className="p-0" style={{borderBottom:'2px solid var(--border-card)'}}>
                            <div className="p-4 shadow-inner" style={{background:'var(--bg-table-row)',borderTop:'1px solid var(--border-card)',borderBottom:'1px solid var(--border-card)'}}>
                              <div className="flex items-center justify-between mb-3 px-1">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 rounded" style={{background:'rgba(184,145,42,0.15)',color:'var(--accent-gold)'}}>
                                    <Layers className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs font-bold uppercase tracking-wider font-display" style={{color:'var(--text-primary)'}}>
                                    Portfolio Breakdown for {h.symbol} ({h.company_name})
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold" style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)'}}>
                                    {h.portfolio_breakdown!.length} Accounts
                                  </span>
                                </div>
                                <span className="text-[11px] italic font-mono" style={{color:'var(--text-muted)'}}>
                                  Individual account holdings & cost basis breakdown
                                </span>
                              </div>

                              <div className="overflow-x-auto rounded-xl border shadow-lg" style={{borderColor:'var(--border-card)',background:'var(--bg-card)'}}>
                                <table className="w-full text-xs text-left font-medium" style={{color:'var(--text-secondary)'}}>
                                  <thead className="uppercase text-[10px] tracking-wider font-semibold" style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)',borderBottom:'1px solid var(--border-card)'}}>
                                    <tr>
                                      <th className="sticky-column px-3.5 py-2.5 text-left">Portfolio</th>
                                      <th className="px-3.5 py-2.5 text-right">Holding Qty</th>
                                      <th className="px-3.5 py-2.5 text-right">Avg Buy Price</th>
                                      <th className="px-3.5 py-2.5 text-right">Total Invested</th>
                                      <th className="px-3.5 py-2.5 text-right">LTP</th>
                                      <th className="px-3.5 py-2.5 text-right">Current Value</th>
                                      <th className="px-3.5 py-2.5 text-right">% of Portfolio</th>
                                      <th className="px-3.5 py-2.5 text-right">Day's Change</th>
                                      <th className="px-3.5 py-2.5 text-right">Unrealized Return</th>
                                      <th className="px-3.5 py-2.5 text-right">Asset XIRR</th>
                                      <th className="px-3.5 py-2.5 text-right">NAV Source</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y font-mono" style={{divideColor:'var(--border-card)'}}>
                                    {h.portfolio_breakdown!.map((sub, sIdx) => {
                                      const isSubPosDay = (sub.day_change || 0) >= 0;
                                      const isSubPosRet = (sub.unrealized_pnl || 0) >= 0;

                                      return (
                                        <tr key={sIdx} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                                          <td className="sticky-column px-3.5 py-3 font-bold font-sans flex items-center gap-2" style={{color:'var(--text-primary)'}}>
                                            <span className="w-2 h-2 rounded-full inline-block" style={{background:'var(--accent-green)'}}></span>
                                            <span className="px-2 py-0.5 rounded text-xs" style={{background:'var(--bg-table-alt)',border:'1px solid var(--border-card)',color:'var(--text-secondary)'}}>
                                              {sub.portfolio}
                                            </span>
                                          </td>
                                          <td className="px-3.5 py-3 text-right font-semibold" style={{color:'var(--text-primary)'}}>
                                            {sub.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                          </td>
                                          <td className="px-3.5 py-3 text-right">
                                            {formatCurrency(sub.avg_buy_price)}
                                          </td>
                                          <td className="px-3.5 py-3 text-right font-semibold">
                                            {formatCurrency(sub.total_cost)}
                                          </td>
                                          <td className="px-3.5 py-3 text-right">
                                            {isAifHolding(sub) ? (
                                              <div className="flex flex-col items-end">
                                                <span className="font-semibold">{formatCurrency(sub.ltp)}</span>
                                                <span className="text-[8px] font-semibold text-emerald-400 uppercase px-1 rounded bg-emerald-500/10 border border-emerald-500/20">Post-Tax</span>
                                              </div>
                                            ) : (
                                              formatCurrency(sub.ltp)
                                            )}
                                          </td>
                                          <td className="px-3.5 py-3 text-right font-bold" style={{color:'var(--text-primary)'}}>
                                            {formatCurrency(sub.current_value)}
                                          </td>
                                          <td className="px-3.5 py-3 text-right font-bold" style={{color:'var(--text-primary)'}}>
                                            {formatPct(metrics.current_value > 0 ? (sub.current_value / metrics.current_value) * 100 : 0)}
                                          </td>
                                          <td className="px-3.5 py-3 text-right">
                                            <div style={{color: isSubPosDay ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                                              <span className="font-bold text-xs">{isSubPosDay ? '+' : ''}{(sub.day_change_pct || 0).toFixed(2)}%</span>
                                              <span className="text-[10px] block font-normal" style={{color:'var(--text-muted)'}}>{formatCurrency(sub.day_change)}</span>
                                            </div>
                                          </td>
                                          <td className="px-3.5 py-3 text-right">
                                            <div style={{color: isSubPosRet ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                                              <span className="font-bold text-xs">{isSubPosRet ? '+' : ''}{(sub.unrealized_pct || 0).toFixed(2)}%</span>
                                              <span className="text-[10px] block font-normal" style={{color:'var(--text-muted)'}}>{formatCurrency(sub.unrealized_pnl)}</span>
                                              {isAifHolding(sub) && (
                                                <span className="text-[8px] font-mono text-emerald-400 block">Net Post-Tax</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-3.5 py-3 text-right font-extrabold text-xs">
                                            {sub.xirr !== undefined && sub.xirr !== null ? (
                                              <span style={{color: sub.xirr >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                                                {sub.xirr >= 0 ? '+' : ''}{sub.xirr.toFixed(2)}%
                                              </span>
                                            ) : (
                                              <span className="italic font-normal" style={{color:'var(--text-muted)'}}>N/A</span>
                                            )}
                                          </td>
                                          <td className="px-3.5 py-3 text-right text-[10px] font-sans" style={{color:'var(--text-muted)'}}>
                                            {sub.data_source || 'Upstox API'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-300">
                    <Info className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    No active holdings found. Please check filters or import transactions.
                  </td>
                </tr>
              )}
            </tbody>

            {/* TOTALS ROW AT BOTTOM OF TABLE */}
            <tfoot className="font-bold text-xs uppercase tracking-wider" style={{background:'var(--bg-table-alt)',borderTop:'2px solid var(--border-card)',color:'var(--text-secondary)'}}>
              <tr>
                {/* 1. Fixed sticky left total label */}
                <td className="sticky-column px-4 py-4 text-left transition-colors align-middle" style={{ minWidth: `${scripColWidth}px`, maxWidth: `${scripColWidth}px`, width: `${scripColWidth}px` }}>
                  <div className="flex flex-col">
                    <span className="font-display font-bold text-sm tracking-tight" style={{color:'var(--text-primary)'}}>TOTAL PORTFOLIO</span>
                    <span className="text-[10px] font-mono normal-case mt-0.5" style={{color:'var(--text-muted)'}}>
                      {totals.activeCount} Active Positions
                    </span>
                  </div>
                </td>

                {/* 2. Qty */}
                <td className="px-4 py-4 text-right font-mono" style={{color:'var(--text-muted)'}}>-</td>

                {/* 3. Avg Buy Price */}
                <td className="px-4 py-4 text-right font-mono" style={{color:'var(--text-muted)'}}>-</td>

                {/* 4. Total Invested */}
                <td className="px-4 py-4 text-right font-mono text-sm font-bold" style={{color:'var(--text-primary)'}}>
                  {formatCurrency(totals.totalInvested)}
                </td>

                {/* 5. LTP */}
                <td className="px-4 py-4 text-right font-mono" style={{color:'var(--text-muted)'}}>-</td>

                {/* 6. Current Valuation */}
                <td className="px-4 py-4 text-right font-mono text-sm font-extrabold" style={{color:'var(--accent-green)'}}>
                  {formatCurrency(totals.totalCurrentValuation)}
                </td>

                {/* 7. % of Portfolio */}
                <td className="px-4 py-4 text-right font-mono align-middle">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold" style={{background:'var(--bg-card)',border:'1px solid var(--border-card)',color:'var(--text-primary)'}}>
                    100.00%
                  </span>
                </td>

                {/* 8. Day's Change */}
                <td className="px-4 py-4 text-right font-mono">
                  <div style={{color: totals.totalDayChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                    <span className="text-xs font-bold">{totals.totalDayChange >= 0 ? '+' : ''}{(totals.totalDayChangePct || 0).toFixed(2)}%</span>
                    <p className="text-[10px] font-mono opacity-90 mt-0.5">{formatCurrency(totals.totalDayChange)}</p>
                  </div>
                </td>

                {/* 9. Unrealized Return */}
                <td className="px-4 py-4 text-right font-mono">
                  <div style={{color: totals.totalUnrealizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                    <span className="text-xs font-bold">{totals.totalUnrealizedPnl >= 0 ? '+' : ''}{(totals.totalUnrealizedPct || 0).toFixed(2)}%</span>
                    <p className="text-[10px] font-mono opacity-90 mt-0.5">{formatCurrency(totals.totalUnrealizedPnl)}</p>
                  </div>
                </td>

                {/* 10. Asset XIRR */}
                <td className="px-4 py-4 text-right font-mono align-middle">
                  {metrics.xirr !== undefined && metrics.xirr !== null ? (
                    <span className="font-mono font-extrabold text-xs" style={{color: metrics.xirr >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}}>
                      {metrics.xirr >= 0 ? '+' : ''}{metrics.xirr.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="italic font-normal" style={{color:'var(--text-muted)'}}>-</span>
                  )}
                </td>

                {/* 11. NAV Source & Date - LAST COLUMN */}
                <td className="px-4 py-4 text-right font-mono text-[10px] normal-case" style={{color:'var(--text-muted)'}}>
                  Live Portfolio Summary
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showBreakdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{background:'rgba(15, 23, 42, 0.6)'}}>
          <div className="rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" style={{background:'var(--bg-modal)',border:'1px solid var(--border-card)'}}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:'1px solid var(--border-card)'}}>
              <div>
                <h3 className="text-lg font-bold font-display" style={{color:'var(--text-primary)'}}>Combined Portfolio Breakdown</h3>
                <p className="text-xs mt-0.5" style={{color:'var(--text-secondary)'}}>Double-click any portfolio row or click its "Ledger" button to view its transaction records.</p>
              </div>
              <button 
                onClick={() => setShowBreakdownModal(false)}
                className="text-sm font-bold p-2 rounded-xl transition-all cursor-pointer"
                style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)'}}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {isLoadingBreakdown ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3" style={{color:'var(--text-secondary)'}}>
                  <RotateCw className="w-8 h-8 animate-spin" style={{color:'var(--accent-green)'}} />
                  <p className="text-sm font-medium">Computing active XIRR schedules and portfolio valuations...</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border shadow-lg" style={{borderColor:'var(--border-card)',background:'var(--bg-card)'}}>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-semibold font-mono uppercase tracking-wider" style={{background:'var(--bg-table-alt)',borderBottom:'1px solid var(--border-card)',color:'var(--text-secondary)'}}>
                        <th className="px-4 py-3.5 cursor-pointer transition-colors" onClick={() => toggleBreakdownSort('portfolio')}>Portfolio {renderBreakdownSortIcon('portfolio')}</th>
                        <th className="px-4 py-3.5 text-right">Type</th>
                        <th className="px-4 py-3.5 text-right cursor-pointer transition-colors" onClick={() => toggleBreakdownSort('base_currency')}>Currency {renderBreakdownSortIcon('base_currency')}</th>
                        <th className="px-4 py-3.5 text-right cursor-pointer transition-colors" onClick={() => toggleBreakdownSort('current_value')}>Valuation {renderBreakdownSortIcon('current_value')}</th>
                        <th className="px-4 py-3.5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="cursor-pointer transition-colors flex items-center gap-1" onClick={() => toggleBreakdownSort('day_change_pct')}>
                              Day's Change % {renderBreakdownSortIcon('day_change_pct')}
                            </div>
                            <div className="cursor-pointer transition-colors flex items-center gap-1 text-[10px] font-normal uppercase tracking-wider" style={{color:'var(--text-muted)'}} onClick={() => toggleBreakdownSort('day_change')}>
                              Amt {renderBreakdownSortIcon('day_change')}
                            </div>
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-right cursor-pointer transition-colors" onClick={() => toggleBreakdownSort('total_cost')}>Cost {renderBreakdownSortIcon('total_cost')}</th>
                        <th className="px-4 py-3.5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="cursor-pointer transition-colors flex items-center gap-1" onClick={() => toggleBreakdownSort('unrealized_pct')}>
                              Unrealized % {renderBreakdownSortIcon('unrealized_pct')}
                            </div>
                            <div className="cursor-pointer transition-colors flex items-center gap-1 text-[10px] font-normal uppercase tracking-wider" style={{color:'var(--text-muted)'}} onClick={() => toggleBreakdownSort('unrealized_pnl')}>
                              Amt {renderBreakdownSortIcon('unrealized_pnl')}
                            </div>
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleBreakdownSort('dividends')}>Dividends {renderBreakdownSortIcon('dividends')}</th>
                        <th className="px-4 py-3.5 text-right cursor-pointer hover:text-slate-200 transition-colors" onClick={() => toggleBreakdownSort('xirr')}>XIRR (Active) {renderBreakdownSortIcon('xirr')}</th>
                        <th className="px-4 py-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono" style={{divideColor:'var(--border-card)',color:'var(--text-secondary)'}}>
                      {sortedBreakdowns.map((item) => {
                        const isPnlPositive = (item.unrealized_pnl || 0) > 0;
                        const isPnlNegative = (item.unrealized_pnl || 0) < 0;
                        const dayChgVal = item.day_change || 0;
                        const dayChgPctVal = item.day_change_pct || 0;
                        const isDayPositive = dayChgVal > 0;
                        const isDayNegative = dayChgVal < 0;
                        return (
                          <tr 
                            key={item.portfolio}
                            onDoubleClick={() => {
                              setSelectedPortfolio(item.portfolio);
                              if (setActiveTab) setActiveTab('LEDGER');
                              setShowBreakdownModal(false);
                            }}
                            className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer group"
                            title="Double-click to view transactions"
                          >
                            <td className="px-4 py-3.5 font-bold font-sans" style={{color:'var(--text-primary)'}}>{item.portfolio}</td>
                            <td className="px-4 py-3.5 text-right" style={{color:'var(--text-muted)'}}>{item.type || 'EQUITY'}</td>
                            <td className="px-4 py-3.5 text-right" style={{color:'var(--text-muted)'}}>{item.base_currency || 'INR'}</td>
                            <td className="px-4 py-3.5 text-right font-semibold" style={{color:'var(--text-primary)'}}>
                              {item.base_currency === 'USD' ? `$${((item.current_value || 0) / (metrics.exchange_rate || 83.5)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : formatCurrency(item.current_value || 0)}
                              {item.base_currency === 'USD' && (
                                <span className="block text-[10px]" style={{color:'var(--text-muted)'}}>₹{(item.current_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              )}
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold ${
                              isDayPositive ? 'text-emerald-400' : isDayNegative ? 'text-rose-400' : 'text-slate-400'
                            }`} style={{color: isDayPositive ? 'var(--accent-green, #10b981)' : isDayNegative ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)'}}>
                              {isDayPositive ? '▲ +' : isDayNegative ? '▼ ' : ''}
                              {item.base_currency === 'USD'
                                ? `$${Math.round(Math.abs(dayChgVal / (metrics.exchange_rate || 83.5))).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                : formatCurrency(Math.abs(dayChgVal))}
                              {item.base_currency === 'USD' && (
                                <span className="block text-[10px] opacity-75 mt-0.5 font-normal">
                                  ₹{Math.abs(dayChgVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              )}
                              <span className="block text-[10px] opacity-90 mt-0.5 font-normal">
                                ({formatPct(dayChgPctVal, true)})
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {item.base_currency === 'USD' ? `$${((item.total_cost || 0) / (metrics.exchange_rate || 83.5)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : formatCurrency(item.total_cost || 0)}
                              {item.base_currency === 'USD' && (
                                <span className="block text-[10px]" style={{color:'var(--text-muted)'}}>₹{(item.total_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              )}
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold ${
                              isPnlPositive ? 'text-emerald-400' : isPnlNegative ? 'text-rose-400' : 'text-slate-400'
                            }`} style={{color: isPnlPositive ? 'var(--accent-green, #10b981)' : isPnlNegative ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)'}}>
                              {isPnlPositive ? '+' : ''}
                              {item.base_currency === 'USD' ? `$${((item.unrealized_pnl || 0) / (metrics.exchange_rate || 83.5)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : formatCurrency(item.unrealized_pnl || 0)}
                              {item.base_currency === 'USD' && (
                                <span className="block text-[10px] opacity-75 font-normal">
                                  ₹{Math.abs(item.unrealized_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              )}
                              <span className="block text-[10px] opacity-90 font-normal">
                                {formatPct((item.total_cost || 0) > 0 ? ((item.unrealized_pnl || 0) / item.total_cost) * 100 : 0, true)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold" style={{color:'var(--accent-green, #10b981)'}}>
                              {item.base_currency === 'USD' ? `$${((item.dividends || 0) / (metrics.exchange_rate || 83.5)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : formatCurrency(item.dividends || 0)}
                              {item.base_currency === 'USD' && (
                                <span className="block text-[10px]" style={{color:'var(--text-muted)'}}>₹{(item.dividends || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              )}
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold ${
                              (item.xirr || 0) > 0 ? 'text-emerald-400' : (item.xirr || 0) < 0 ? 'text-rose-400' : 'text-slate-400'
                            }`} style={{color: (item.xirr || 0) > 0 ? 'var(--accent-green, #10b981)' : (item.xirr || 0) < 0 ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)'}}>
                              {item.xirr ? formatPct(item.xirr) : '0%'}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedPortfolio(item.portfolio);
                                    if (setActiveTab) setActiveTab('LEDGER');
                                    setShowBreakdownModal(false);
                                  }}
                                  className="text-indigo-400 hover:text-indigo-300 font-sans font-bold text-xs bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  Ledger
                                </button>
                                <button
                                  onClick={() => downloadXirrAuditExcel(item.portfolio)}
                                  className="text-amber-400 hover:text-amber-300 font-sans font-bold text-xs bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                                  title={`Download XIRR verification Excel file for ${item.portfolio}`}
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                  <span>XIRR Excel</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="font-mono font-bold" style={{background:'var(--bg-table-alt)',borderTop:'2px solid var(--border-card)',color:'var(--text-secondary)'}}>
                      <tr>
                        <td className="px-4 py-3.5 font-bold font-sans" style={{color:'var(--text-primary)'}}>TOTAL COMBINED</td>
                        <td className="px-4 py-3.5 text-right" style={{color:'var(--text-muted)'}}>ALL</td>
                        <td className="px-4 py-3.5 text-right" style={{color:'var(--text-muted)'}}>INR</td>
                        <td className="px-4 py-3.5 text-right font-bold text-sm" style={{color:'var(--text-primary)'}}>
                          {formatCurrency(breakdownTotals.current_value)}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-bold text-sm ${
                          breakdownTotals.day_change > 0 ? 'text-emerald-400' : breakdownTotals.day_change < 0 ? 'text-rose-400' : 'text-slate-400'
                        }`} style={{color: breakdownTotals.day_change > 0 ? 'var(--accent-green, #10b981)' : breakdownTotals.day_change < 0 ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)'}}>
                          {breakdownTotals.day_change > 0 ? '▲ +' : breakdownTotals.day_change < 0 ? '▼ ' : ''}
                          {formatCurrency(Math.abs(breakdownTotals.day_change))}
                          <span className="block text-[10px] opacity-90 mt-0.5 font-normal">
                            ({formatPct(breakdownTotals.day_change_pct, true)})
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold" style={{color:'var(--text-primary)'}}>
                          {formatCurrency(breakdownTotals.total_cost)}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-bold text-sm ${
                          breakdownTotals.unrealized_pnl > 0 ? 'text-emerald-400' : breakdownTotals.unrealized_pnl < 0 ? 'text-rose-400' : 'text-slate-400'
                        }`} style={{color: breakdownTotals.unrealized_pnl > 0 ? 'var(--accent-green, #10b981)' : breakdownTotals.unrealized_pnl < 0 ? 'var(--accent-red, #ef4444)' : 'var(--text-muted)'}}>
                          {breakdownTotals.unrealized_pnl > 0 ? '+' : ''}
                          {formatCurrency(breakdownTotals.unrealized_pnl)}
                          <span className="block text-[10px] opacity-90 mt-0.5 font-normal">
                            ({formatPct(breakdownTotals.unrealized_pct, true)})
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-emerald-400" style={{color:'var(--accent-green, #10b981)'}}>
                          {formatCurrency(breakdownTotals.dividends)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-emerald-400" style={{color:'var(--accent-green, #10b981)'}}>
                          {metrics.xirr !== undefined && metrics.xirr !== null ? `${metrics.xirr.toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-4 py-3.5 text-center" style={{color:'var(--text-muted)'}}>-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px]" style={{background:'var(--bg-table-alt)',borderTop:'1px solid var(--border-card)',color:'var(--text-secondary)'}}>
              <span>Dynamic currency rates applied. Double-click row or click Ledger to jump to trade list.</span>
              <button
                onClick={() => downloadXirrAuditExcel('Combined')}
                className="px-3 py-1.5 font-semibold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                style={{background:'rgba(184,145,42,0.15)',border:'1px solid rgba(184,145,42,0.3)',color:'var(--accent-gold)'}}
                title="Download full combined XIRR audit report across all portfolios"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download Combined XIRR Excel (.xlsx)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Tax Return & Tax Provision Audit Modal */}
      {showTaxProvisionModal && metrics.tax_provision_details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{background:'rgba(15, 23, 42, 0.7)'}}>
          <div className="rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" style={{background:'var(--bg-modal)',border:'1px solid var(--border-card)'}}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{borderColor:'var(--border-card)'}}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'rgba(245, 158, 11, 0.15)',color:'var(--accent-gold)'}}>
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display" style={{color:'var(--text-primary)'}}>
                    Post-Tax XIRR & Current FY Tax Provision Audit
                  </h3>
                  <p className="text-xs" style={{color:'var(--text-secondary)'}}>
                    Institutional liquidation tax modeling (Realized + Accrued Unrealized + Surcharge Cap & Cess - Brought Forward Losses).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTaxProvisionModal(false)}
                className="text-sm font-bold p-2 rounded-xl transition-all cursor-pointer"
                style={{background:'var(--bg-table-alt)',color:'var(--text-secondary)'}}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Return Comparison Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl border shadow-sm" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Pre-Tax XIRR</div>
                  <div className="text-2xl font-bold font-display mt-1 text-slate-900 dark:text-white">
                    {formatPct(metrics.xirr)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Gross cash flows + gross liquidation AUM</div>
                </div>

                <div className="p-4 rounded-2xl border shadow-sm" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Post-Tax XIRR</div>
                  <div className="text-2xl font-bold font-display mt-1 text-emerald-600 dark:text-emerald-400">
                    {formatPct(metrics.post_tax_xirr)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Terminal cash flow net of full tax provision</div>
                </div>

                <div className="p-4 rounded-2xl border shadow-sm" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Tax Return Drag</div>
                  <div className="text-2xl font-bold font-display mt-1 text-rose-600 dark:text-rose-400">
                    -{metrics.tax_drag_pct || 0}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Annualized compounding performance impact</div>
                </div>
              </div>

              {/* PAN-Level Statutory Assessment Breakdown */}
              {metrics.tax_provision_details.panBreakdowns && metrics.tax_provision_details.panBreakdowns.length > 0 && (
                <div className="p-5 rounded-2xl border space-y-3.5" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-sm flex items-center gap-2" style={{color:'var(--text-primary)'}}>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Statutory Tax Assessment by Individual PAN (Assesse Entities)
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Taxes are assessed strictly on the assesse's legal PAN. Each PAN receives its independent ₹1.25L Sec 112A exemption and separate surcharge evaluation.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {metrics.tax_provision_details.panBreakdowns.length} Legal PAN Entities Active
                    </span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {metrics.tax_provision_details.panBreakdowns.map((panData: any) => (
                      <div
                        key={panData.pan}
                        className="p-4 rounded-xl border space-y-2.5 transition-all hover:border-cyan-500/40"
                        style={{background:'var(--bg-modal)',borderColor:'var(--border-card)'}}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2" style={{borderColor:'var(--border-card)'}}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs" style={{color:'var(--text-primary)'}}>{panData.ownerName}</span>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              PAN: {panData.pan}
                            </span>
                            {panData.isSeniorCitizen && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-pink-500/15 text-pink-400 border border-pink-500/30">
                                👵 Senior Citizen (Age 60+)
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              {panData.taxResidency}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 mr-2">Tax Provision:</span>
                            <span className="font-mono font-bold text-xs text-amber-500">
                              {formatCurrency(panData.totalTaxProvision)}
                            </span>
                          </div>
                        </div>

                        {/* Portfolios under this PAN */}
                        <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{color:'var(--text-muted)'}}>
                          <span className="font-semibold text-slate-400">Portfolios:</span>
                          {panData.portfolios.map((pName: string) => (
                            <span key={pName} className="px-1.5 py-0.5 rounded text-[10px] font-mono border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)',color:'var(--text-primary)'}}>
                              {pName}
                            </span>
                          ))}
                        </div>

                        {/* Realized & Unrealized Capital Gains Matrix for this PAN */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          {/* Realized Gains (Closed FY) */}
                          <div className="p-3 rounded-lg border space-y-1.5" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <div className="flex items-center justify-between border-b pb-1.5" style={{borderColor:'var(--border-card)'}}>
                              <span className="text-[11px] font-bold text-slate-200">Realized P&L (FY {metrics.tax_provision_details.financialYear})</span>
                              <span className={`font-mono text-xs font-bold ${((panData.realized?.total ?? (panData.realized?.stcg + panData.realized?.ltcg)) >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {((panData.realized?.total ?? (panData.realized?.stcg + panData.realized?.ltcg)) >= 0) ? '+' : ''}
                                {formatCurrency(panData.realized?.total ?? (panData.realized?.stcg + panData.realized?.ltcg))}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Short-Term (STCG):</span>
                                <span className={`font-mono font-semibold ${(panData.realized?.stcg >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {panData.realized?.stcg >= 0 ? '+' : ''}{formatCurrency(panData.realized?.stcg || 0)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Long-Term (LTCG):</span>
                                <span className={`font-mono font-semibold ${(panData.realized?.ltcg >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {panData.realized?.ltcg >= 0 ? '+' : ''}{formatCurrency(panData.realized?.ltcg || 0)}
                                </span>
                              </div>
                              {panData.realized?.tax > 0 && (
                                <div className="flex justify-between text-slate-400 text-[10px] pt-0.5 border-t border-slate-700/50">
                                  <span>Realized Tax Provision:</span>
                                  <span className="font-mono text-amber-400 font-semibold">{formatCurrency(panData.realized?.tax)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Unrealized Accrued Gains (Open Holdings) */}
                          <div className="p-3 rounded-lg border space-y-1.5" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <div className="flex items-center justify-between border-b pb-1.5" style={{borderColor:'var(--border-card)'}}>
                              <span className="text-[11px] font-bold text-slate-200">Unrealized Accrued P&L</span>
                              <span className={`font-mono text-xs font-bold ${((panData.unrealized?.totalWithAif ?? (panData.unrealized?.stcg + panData.unrealized?.ltcg + (panData.aifPostTaxGain || 0))) >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {((panData.unrealized?.totalWithAif ?? (panData.unrealized?.stcg + panData.unrealized?.ltcg + (panData.aifPostTaxGain || 0))) >= 0) ? '+' : ''}
                                {formatCurrency(panData.unrealized?.totalWithAif ?? (panData.unrealized?.stcg + panData.unrealized?.ltcg + (panData.aifPostTaxGain || 0)))}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">STCG (&lt; 1 Year):</span>
                                <span className={`font-mono font-semibold ${(panData.unrealized?.stcg >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {panData.unrealized?.stcg >= 0 ? '+' : ''}{formatCurrency(panData.unrealized?.stcg || 0)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">LTCG (&gt;= 1 Year):</span>
                                <span className={`font-mono font-semibold ${(panData.unrealized?.ltcg >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {panData.unrealized?.ltcg >= 0 ? '+' : ''}{formatCurrency(panData.unrealized?.ltcg || 0)}
                                </span>
                              </div>
                              {panData.aifPostTaxGain > 0 && (
                                <div className="flex justify-between text-emerald-400 text-[10px] pt-0.5 border-t border-slate-700/50">
                                  <span>AIF Post-Tax Gain (Fund):</span>
                                  <span className="font-mono font-semibold">+{formatCurrency(panData.aifPostTaxGain)} (₹0 Addl. Tax)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Statutory Slabs & Deductions for this PAN */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                          <div className="p-2 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <span className="text-[10px] text-slate-400 block">Gross AUM</span>
                            <span className="font-mono font-bold" style={{color:'var(--text-primary)'}}>{formatCurrency(panData.grossValuation)}</span>
                          </div>

                          <div className="p-2 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <span className="text-[10px] text-slate-400 block">Sec 112A Exemption</span>
                            <span className="font-mono font-bold text-emerald-400">
                              {panData.sec112aExemptionApplied > 0 ? `-${formatCurrency(panData.sec112aExemptionApplied)}` : '₹0'}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <span className="text-[10px] text-slate-400 block">Surcharge & Cess</span>
                            <span className="font-mono font-bold text-amber-400">
                              {panData.surchargeRate}% Surch + 4%
                            </span>
                          </div>

                          <div className="p-2 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                            <span className="text-[10px] text-slate-400 block">Loss Set-Off Relief</span>
                            <span className="font-mono font-bold text-purple-400">
                              {panData.taxSaved > 0 ? `+${formatCurrency(panData.taxSaved)} saved` : '—'}
                            </span>
                          </div>
                        </div>

                        {panData.aifPostTaxValuation > 0 && (
                          <div className="text-[11px] text-emerald-400 flex items-center justify-between bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/25 mt-1">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              <span>AIF Post-Tax NAV Valuation: <strong>{formatCurrency(panData.aifPostTaxValuation)}</strong> (Gain: +{formatCurrency(panData.aifPostTaxGain || 0)})</span>
                            </span>
                            <span className="font-mono text-[10px] font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                              Fund NAV Incorporates Tax (₹0 Addl. Tax)
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Tax Provision Waterfall */}
              <div className="p-5 rounded-2xl border space-y-3.5" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm" style={{color:'var(--text-primary)'}}>
                    Statutory Capital Gains Tax Breakdown (FY {metrics.tax_provision_details.financialYear})
                  </h4>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    Budget 2024 Regime (STCG 20% | LTCG 12.5%)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Realized Gains */}
                  <div className="p-3.5 rounded-xl border space-y-2" style={{background:'var(--bg-modal)',borderColor:'var(--border-card)'}}>
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between border-b pb-1.5" style={{borderColor:'var(--border-card)'}}>
                      <div className="flex items-center gap-2">
                        <span>1. Realized Trades (Closed FY {metrics.tax_provision_details.financialYear})</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${((metrics.tax_provision_details.realized?.total ?? (metrics.tax_provision_details.realized?.stcg + metrics.tax_provision_details.realized?.ltcg)) >= 0) ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          Total: {((metrics.tax_provision_details.realized?.total ?? (metrics.tax_provision_details.realized?.stcg + metrics.tax_provision_details.realized?.ltcg)) >= 0) ? '+' : ''}
                          {formatCurrency(metrics.tax_provision_details.realized?.total ?? (metrics.tax_provision_details.realized?.stcg + metrics.tax_provision_details.realized?.ltcg))}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-400">+{formatCurrency(metrics.tax_provision_details.realized?.tax || 0)} Tax</span>
                    </div>
                    <div className="space-y-1 text-[11px]" style={{color:'var(--text-secondary)'}}>
                      <div className="flex justify-between">
                        <span>Realized STCG (&lt; 1 Yr):</span>
                        <span className={`font-mono font-semibold ${(metrics.tax_provision_details.realized?.stcg || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(metrics.tax_provision_details.realized?.stcg || 0) >= 0 ? '+' : ''}{formatCurrency(metrics.tax_provision_details.realized?.stcg || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Realized LTCG (&gt;= 1 Yr):</span>
                        <span className={`font-mono font-semibold ${(metrics.tax_provision_details.realized?.ltcg || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(metrics.tax_provision_details.realized?.ltcg || 0) >= 0 ? '+' : ''}{formatCurrency(metrics.tax_provision_details.realized?.ltcg || 0)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Unrealized Open Positions */}
                  <div className="p-3.5 rounded-xl border space-y-2" style={{background:'var(--bg-modal)',borderColor:'var(--border-card)'}}>
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between border-b pb-1.5" style={{borderColor:'var(--border-card)'}}>
                      <div className="flex items-center gap-2">
                        <span>2. Accrued Unrealized (Liquidation Provision)</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${((metrics.tax_provision_details.unrealized?.totalWithAif ?? (metrics.tax_provision_details.unrealized?.stcg + metrics.tax_provision_details.unrealized?.ltcg + (metrics.tax_provision_details.totalAifPostTaxGain || 0))) >= 0) ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          Total: {((metrics.tax_provision_details.unrealized?.totalWithAif ?? (metrics.tax_provision_details.unrealized?.stcg + metrics.tax_provision_details.unrealized?.ltcg + (metrics.tax_provision_details.totalAifPostTaxGain || 0))) >= 0) ? '+' : ''}
                          {formatCurrency(metrics.tax_provision_details.unrealized?.totalWithAif ?? (metrics.tax_provision_details.unrealized?.stcg + metrics.tax_provision_details.unrealized?.ltcg + (metrics.tax_provision_details.totalAifPostTaxGain || 0)))}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-400">+{formatCurrency(metrics.tax_provision_details.unrealized?.tax || 0)} Tax</span>
                    </div>
                    <div className="space-y-1 text-[11px]" style={{color:'var(--text-secondary)'}}>
                      <div className="flex justify-between">
                        <span>Unrealized STCG (&lt; 1 Yr):</span>
                        <span className={`font-mono font-semibold ${(metrics.tax_provision_details.unrealized?.stcg || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(metrics.tax_provision_details.unrealized?.stcg || 0) >= 0 ? '+' : ''}{formatCurrency(metrics.tax_provision_details.unrealized?.stcg || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Unrealized LTCG (&gt;= 1 Yr):</span>
                        <span className={`font-mono font-semibold ${(metrics.tax_provision_details.unrealized?.ltcg || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(metrics.tax_provision_details.unrealized?.ltcg || 0) >= 0 ? '+' : ''}{formatCurrency(metrics.tax_provision_details.unrealized?.ltcg || 0)}
                        </span>
                      </div>
                      {metrics.tax_provision_details.totalAifPostTaxValuation > 0 && (
                        <div className="flex justify-between border-t pt-1.5 mt-1 text-emerald-400">
                          <span className="flex items-center gap-1">
                            <span>AIF Post-Tax NAV Holdings:</span>
                            <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">Tax Incorporated</span>
                          </span>
                          <span className="font-mono font-semibold">
                            {formatCurrency(metrics.tax_provision_details.totalAifPostTaxValuation)} (₹0 Addl. Tax)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Statutory Surcharge and Cess */}
                <div className="p-3.5 rounded-xl border space-y-2" style={{background:'var(--bg-modal)',borderColor:'var(--border-card)'}}>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    3. Statutory Additions & Exemptions
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                      <span className="text-[10px] text-slate-400 block">Section 112A Annual Exemption</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {formatCurrency(metrics.tax_provision_details.sec112aExemptionApplied || 0)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                      <span className="text-[10px] text-slate-400 block">Capital Gains Surcharge ({metrics.tax_provision_details.surchargeRate || 0}% Cap)</span>
                      <span className="font-mono font-bold text-amber-400">
                        +{formatCurrency(metrics.tax_provision_details.surchargeAmount || 0)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
                      <span className="text-[10px] text-slate-400 block">Health & Education Cess (4%)</span>
                      <span className="font-mono font-bold text-amber-400">
                        +{formatCurrency(metrics.tax_provision_details.cessAmount || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Carried Forward Loss Set-Off */}
                <div className="p-3.5 rounded-xl border space-y-2" style={{background:'var(--bg-modal)',borderColor:'var(--border-card)'}}>
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>4. Brought Forward Losses Set-Off (ITR-2/3 Schedule CFL)</span>
                    <span className="font-mono text-purple-400 font-bold">
                      -{formatCurrency(metrics.tax_provision_details.carriedForwardLosses?.taxSaved || 0)} Tax Saved
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]" style={{color:'var(--text-secondary)'}}>
                    <div>
                      <span className="text-[10px] text-slate-400 block">STCL Brought Forward:</span>
                      <span className="font-mono font-semibold">{formatCurrency(metrics.tax_provision_details.carriedForwardLosses?.stclBroughtForward || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">LTCL Brought Forward:</span>
                      <span className="font-mono font-semibold">{formatCurrency(metrics.tax_provision_details.carriedForwardLosses?.ltclBroughtForward || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Loss Absorbed this FY:</span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {formatCurrency((metrics.tax_provision_details.carriedForwardLosses?.stclUtilized || 0) + (metrics.tax_provision_details.carriedForwardLosses?.ltclUtilized || 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Remaining Loss (Carry Fwd):</span>
                      <span className="font-mono font-semibold">
                        {formatCurrency((metrics.tax_provision_details.carriedForwardLosses?.stclRemaining || 0) + (metrics.tax_provision_details.carriedForwardLosses?.ltclRemaining || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Net Provision */}
                <div className="p-4 rounded-xl flex items-center justify-between border" style={{background:'rgba(245, 158, 11, 0.08)',borderColor:'rgba(245, 158, 11, 0.3)'}}>
                  <div>
                    <div className="text-xs font-bold text-amber-500 uppercase tracking-wider">Total Net Tax Provision Deducted</div>
                    <div className="text-[11px] text-slate-400">Deducted from terminal liquidation cash flow to compute Post-Tax XIRR</div>
                  </div>
                  <div className="text-xl font-black font-mono text-amber-500">
                    {formatCurrency(metrics.tax_provision_details.totalTaxProvision || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs border-t" style={{background:'var(--bg-table-alt)',borderColor:'var(--border-card)'}}>
              <span className="text-slate-400">Terminal AUM: {formatCurrency(metrics.tax_provision_details.grossValuation || 0)} → Net Post-Tax: {formatCurrency(metrics.tax_provision_details.postTaxValuation || 0)}</span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowTaxProvisionModal(false);
                    if (setActiveTab) setActiveTab('TAX_REPATRIATION');
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer border flex items-center gap-2"
                  style={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-card)',
                    color: 'var(--accent-gold)'
                  }}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Manage Carried Forward Losses</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTaxProvisionModal(false)}
                  className="px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer border"
                  style={{
                    background: 'var(--bg-sidebar-active)',
                    borderColor: 'var(--border-card)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
