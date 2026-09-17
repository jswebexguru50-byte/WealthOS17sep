import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  PieChart as PieIcon, 
  Layers, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye, 
  Search, 
  SlidersHorizontal, 
  Download, 
  Filter,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ChevronRight,
  DollarSign,
  Coins,
  Globe,
  ShieldCheck,
  Info,
  Radio,
  Activity
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { getGainLossColorClass, getGainLossBgClass, getGainLossIcon, formatPct } from '../lib/formatters.js';
import { TradingViewChartWidget } from './TradingViewChartWidget.js';
import { MomentumReasoningPanel } from './MomentumReasoningPanel.js';
import { AutonomousSmartMoneySentinelView } from './AutonomousSmartMoneySentinelView.js';
import { SmartMoneyTimeframe } from '../server/services/SmartMoneyFlowEngine.js';

interface InstitutionalAnalyticsHubProps {
  selectedPortfolio: string;
  setSelectedPortfolio: (p: string) => void;
  portfolios: string[];
  formatCurrency?: (val: number) => string;
  showStockDrilldown?: (sym: string) => void;
}

export function InstitutionalAnalyticsHub({
  selectedPortfolio,
  setSelectedPortfolio,
  portfolios,
  formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v),
  showStockDrilldown
}: InstitutionalAnalyticsHubProps) {
  const [activeSubTab, setActiveSubTab] = useState<'TODAY' | 'HOLDINGS' | 'PERFORMANCE' | 'EQUITY_EXPOSURE' | 'SMART_MONEY' | 'AUTONOMOUS_SENTINEL'>('TODAY');
  const [holdingsViewBy, setHoldingsViewBy] = useState<'SECTOR' | 'MARKET_CAP' | 'ASSET'>('SECTOR');
  const [donutMetric, setDonutMetric] = useState<'CURRENT_VALUE' | 'INVESTED'>('CURRENT_VALUE');
  const [moversTab, setMoversTab] = useState<'GAINERS' | 'LOSERS'>('GAINERS');
  const [performancePeriod, setPerformancePeriod] = useState<string>('ALL');
  const [realReturnView, setRealReturnView] = useState<'INR' | 'USD' | 'GOLD'>('USD');

  // Smart Money Radar States (Spec v1.1)
  const [smartMoneyTimeframe, setSmartMoneyTimeframe] = useState<SmartMoneyTimeframe>('1W');
  const [sectorFlows, setSectorFlows] = useState<any[]>([]);
  const [smartStocks, setSmartStocks] = useState<{ topAccumulation: any[]; topDistribution: any[] }>({ topAccumulation: [], topDistribution: [] });
  const [smartMoneyLoading, setSmartMoneyLoading] = useState<boolean>(false);
  const [smartMoneyFilter, setSmartMoneyFilter] = useState<'ALL' | 'ACCUMULATION' | 'DISTRIBUTION'>('ALL');
  
  // Interactive TradingView & Reasoning Modal States
  const [tvModalSymbol, setTvModalSymbol] = useState<string | null>(null);
  const [tvMomentumReport, setTvMomentumReport] = useState<any | null>(null);
  const [tvLoading, setTvLoading] = useState<boolean>(false);

  // Smart Money Radar Multi-Table Sorting & Search
  const [smartMoneyStockSearch, setSmartMoneyStockSearch] = useState<string>('');
  const [smartMoneySortField, setSmartMoneySortField] = useState<string>('smasScore');
  const [smartMoneySortDir, setSmartMoneySortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedStockBuyersSymbol, setExpandedStockBuyersSymbol] = useState<string | null>(null);

  // Equity Exposure Search & Sort
  const [exposureSearch, setExposureSearch] = useState<string>('');
  const [exposureSortField, setExposureSortField] = useState<string>('totalNetExposure');
  const [exposureSortDir, setExposureSortDir] = useState<'asc' | 'desc'>('desc');

  // Institutional Mutual Fund Lookthrough Top 12 Holdings Blueprint
  const MF_LOOKTHROUGH_WEIGHTS = React.useMemo(() => ({
    DEFAULT: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financial Services', weight: 0.095 },
      { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Financial Services', weight: 0.082 },
      { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Oil & Gas', weight: 0.078 },
      { symbol: 'INFY', name: 'Infosys Ltd', sector: 'Information Technology', weight: 0.058 },
      { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology', weight: 0.042 },
      { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', weight: 0.038 },
      { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'Capital Goods', weight: 0.036 },
      { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecommunication', weight: 0.034 },
      { symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'Financial Services', weight: 0.029 },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Financial Services', weight: 0.025 },
      { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', sector: 'Financial Services', weight: 0.023 },
      { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financial Services', weight: 0.022 }
    ]
  }), []);

  type SortField = 'asset' | 'valuation' | 'xirr' | 'invested' | 'withdrawal' | 'gain' | 'realised' | 'unrealised';
  const [sortField, setSortField] = useState<SortField>('valuation');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Data states
  const [loading, setLoading] = useState(true);
  const [holdingsData, setHoldingsData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [tickerMasterMap, setTickerMasterMap] = useState<Record<string, any>>({});
  const [marketBenchmarks, setMarketBenchmarks] = useState<any[]>([
    { name: 'My Portfolio', returnPct: 0 },
    { name: 'BSE Sensex', returnPct: -0.09 },
    { name: 'Nifty 50', returnPct: -0.12 },
    { name: 'Nifty Midcap 100', returnPct: -0.53 }
  ]);

  // Watchlist custom items
  const [watchlist, setWatchlist] = useState<any[]>([
    { symbol: 'RELIANCE', name: 'Reliance Industries', price: 1310.00, dayChange: -7.00, dayChangePct: -0.53 },
    { symbol: 'TCS', name: 'Tata Consultancy Services', price: 2361.00, dayChange: -14.00, dayChangePct: -0.59 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 727.00, dayChange: 2.00, dayChangePct: 0.28 },
    { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1417.00, dayChange: 10.20, dayChangePct: 0.73 },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', price: 2077.00, dayChange: -15.00, dayChangePct: -0.72 }
  ]);

  useEffect(() => {
    fetchData();
  }, [selectedPortfolio, performancePeriod]);

  const fetchData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const portQuery = selectedPortfolio && selectedPortfolio !== 'Combined' ? `portfolios=${encodeURIComponent(selectedPortfolio)}` : '';
      let dateQuery = '';
      const now = new Date();
      if (performancePeriod === '1Y') {
        const d = new Date(now.getTime() - 365 * 86400000);
        dateQuery = `start_date=${d.toISOString().slice(0, 10)}`;
      } else if (performancePeriod === '3Y') {
        const d = new Date(now.getTime() - 3 * 365.25 * 86400000);
        dateQuery = `start_date=${d.toISOString().slice(0, 10)}`;
      } else if (performancePeriod === '5Y') {
        const d = new Date(now.getTime() - 5 * 365.25 * 86400000);
        dateQuery = `start_date=${d.toISOString().slice(0, 10)}`;
      } else if (performancePeriod === 'FY25') {
        dateQuery = `start_date=2024-04-01&end_date=2025-03-31`;
      }

      const refreshParam = forceRefresh ? 'nocache=true&refresh=true' : '';
      const params = [portQuery, dateQuery, 'include_sold=true', refreshParam].filter(Boolean).join('&');
      const paramStr = params ? `?${params}` : '';
      const portParamParts = [portQuery, 'include_sold=true', refreshParam].filter(Boolean).join('&');
      const portParam = portParamParts ? `?${portParamParts}` : '';

      // Stage 1: Load Dashboard & MasterTickers first for instant (<50ms) rendering
      const [dashRes, masterRes] = await Promise.all([
        fetch(`/api/dashboard${portParam}`).then(r => r.json()).catch(() => ({ holdings: [], metrics: {} })),
        fetch('/api/master-tickers').then(r => r.json()).catch(() => ({ tickers: [] }))
      ]);

      let list = (dashRes && dashRes.holdings && dashRes.holdings.length > 0) ? [...dashRes.holdings] : [];
      setHoldingsData(list);
      setMetrics(dashRes.metrics || {});

      // Build master ticker lookup map for sector & market cap
      const mMap: Record<string, any> = {};
      (masterRes.tickers || masterRes || []).forEach((t: any) => {
        if (t.symbol) mMap[t.symbol.toUpperCase()] = t;
        if (t.isin) mMap[t.isin.toUpperCase()] = t;
      });
      setTickerMasterMap(mMap);

      // Compute portfolio day change accurately
      const totalVal = dashRes.metrics?.current_value || 0;
      const portDayPct = dashRes.metrics?.day_change_pct !== undefined && dashRes.metrics?.day_change_pct !== null
        ? dashRes.metrics.day_change_pct
        : (() => {
            const totalDayChange = list.reduce((s: number, h: any) => s + (h.day_change || 0), 0);
            const prevVal = totalVal - totalDayChange;
            return prevVal > 0 ? (totalDayChange / prevVal) * 100 : 0;
          })();

      // Fetch dynamic live market benchmarks in parallel
      fetch('/api/market-benchmarks')
        .then(r => r.json())
        .then(benchRes => {
          const liveBenchmarks = (benchRes?.benchmarks && benchRes.benchmarks.length > 0)
            ? benchRes.benchmarks
            : [
                { name: 'BSE Sensex', returnPct: -0.09 },
                { name: 'Nifty 50', returnPct: -0.12 },
                { name: 'Nifty Midcap 100', returnPct: -0.53 }
              ];
          setMarketBenchmarks([
            { name: 'My Portfolio', returnPct: Math.round(portDayPct * 100) / 100 },
            ...liveBenchmarks.map((b: any) => ({ name: b.name, returnPct: b.returnPct }))
          ]);
        })
        .catch(() => {
          setMarketBenchmarks([
            { name: 'My Portfolio', returnPct: Math.round(portDayPct * 100) / 100 },
            { name: 'BSE Sensex', returnPct: -0.09 },
            { name: 'Nifty 50', returnPct: -0.12 },
            { name: 'Nifty Midcap 100', returnPct: -0.53 }
          ]);
        });

      // UI is ready to display immediately!
      setLoading(false);

      // Stage 2: Load detailed multi-period and scrip XIRR analytics
      fetch(`/api/analytics${paramStr}`)
        .then(r => r.json())
        .then(analyticsRes => {
          if (analyticsRes && analyticsRes.success) {
            setAnalyticsData(analyticsRes);
            if (analyticsRes.scrips && analyticsRes.scrips.length > 0) {
              const scripMap = new Map<string, any>();
              analyticsRes.scrips.forEach((s: any) => {
                if (s.symbol) scripMap.set(String(s.symbol).toUpperCase(), s);
                if (s.isin) scripMap.set(String(s.isin).toUpperCase(), s);
              });

              setHoldingsData(prevList => {
                const currentBase = prevList.length > 0 ? [...prevList] : (dashRes.holdings || []);
                let updated = currentBase.map((h: any) => {
                  const symUpper = String(h.symbol || '').toUpperCase();
                  const isinUpper = String(h.isin || '').toUpperCase();
                  const s = scripMap.get(symUpper) || scripMap.get(isinUpper);
                  if (s) {
                    return {
                      ...h,
                      xirr: s.xirr !== undefined && s.xirr !== null ? s.xirr : h.xirr,
                      total_withdrawal: s.total_withdrawal || 0,
                      realized_pnl: s.realized_pnl || 0,
                      total_gain: s.total_gain !== undefined ? s.total_gain : ((h.unrealized_pnl || 0) + (s.realized_pnl || 0))
                    };
                  }
                  return h;
                });

                // Include historical / sold scrips from analyticsRes that are not in list
                const existingSymbols = new Set(updated.map((h: any) => String(h.symbol || '').toUpperCase()));
                analyticsRes.scrips.forEach((s: any) => {
                  const sSym = String(s.symbol || '').toUpperCase();
                  if (!existingSymbols.has(sSym) && (s.current_value > 0 || (s.realized_pnl || 0) !== 0 || (s.total_withdrawal || 0) > 0)) {
                    updated.push({
                      symbol: s.symbol,
                      company_name: s.company_name,
                      isin: s.isin,
                      quantity: s.quantity || 0,
                      avg_price: s.avg_price || 0,
                      total_cost: s.total_cost || 0,
                      ltp: s.ltp || 0,
                      current_value: s.current_value || 0,
                      realized_pnl: s.realized_pnl || 0,
                      unrealized_pnl: s.unrealized_pnl || 0,
                      total_withdrawal: s.total_withdrawal || 0,
                      total_gain: s.total_gain || 0,
                      unrealized_pct: s.unrealized_pct || 0,
                      xirr: s.xirr,
                      is_sold: s.is_sold || false,
                      day_change: 0,
                      day_change_pct: 0
                    });
                    existingSymbols.add(sSym);
                  }
                });

                return updated;
              });
            }

            if (analyticsRes.summary && (!dashRes.metrics || Object.keys(dashRes.metrics).length === 0)) {
              setMetrics({
                total_invested: analyticsRes.summary.total_cost,
                current_value: analyticsRes.summary.current_value,
                unrealized_pnl: analyticsRes.summary.unrealized_pnl,
                unrealized_pct: analyticsRes.summary.unrealized_pct,
                xirr: analyticsRes.custom?.portfolio
              });
            }
          }
        })
        .catch(err => {
          console.warn('[InstitutionalAnalyticsHub] Non-critical background analytics warning:', err);
        });

    } catch (e) {
      console.error('Error fetching analytics data:', e);
      setLoading(false);
    }
  };

  const fetchSmartMoneyData = async (tf: SmartMoneyTimeframe = smartMoneyTimeframe) => {
    setSmartMoneyLoading(true);
    try {
      const [secRes, stockRes] = await Promise.all([
        fetch(`/api/smart-money/sectors?timeframe=${tf}`).then(r => r.json()).catch(() => ({ sectors: [] })),
        fetch(`/api/smart-money/stocks?timeframe=${tf}&limit=30`).then(r => r.json()).catch(() => ({ topAccumulation: [], topDistribution: [] }))
      ]);

      if (secRes?.success && Array.isArray(secRes.sectors)) {
        setSectorFlows(secRes.sectors);
      }
      if (stockRes?.success) {
        setSmartStocks({
          topAccumulation: stockRes.topAccumulation || [],
          topDistribution: stockRes.topDistribution || []
        });
      }
    } catch (err) {
      console.error('Failed to load Smart Money flows:', err);
    } finally {
      setSmartMoneyLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'SMART_MONEY') {
      fetchSmartMoneyData(smartMoneyTimeframe);
    }
  }, [activeSubTab, smartMoneyTimeframe]);

  const openTradingViewModal = async (symbol: string) => {
    setTvModalSymbol(symbol);
    setTvLoading(true);
    setTvMomentumReport(null);
    try {
      const res = await fetch(`/api/momentum-reasoning/${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (data?.success && data?.data) {
        setTvMomentumReport(data.data);
      }
    } catch (err) {
      console.error('Failed to load momentum report for modal:', err);
    } finally {
      setTvLoading(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const handleHubSortToggle = (
    currentField: string,
    currentDir: 'asc' | 'desc',
    newField: string,
    setField: (f: string) => void,
    setDir: (d: 'asc' | 'desc') => void
  ) => {
    if (currentField === newField) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      setField(newField);
      setDir('desc');
    }
  };

  const renderHubSortHeader = (
    label: string,
    field: string,
    curField: string,
    curDir: 'asc' | 'desc',
    onSort: (f: string) => void,
    align: 'left' | 'right' | 'center' = 'left',
    extraClass: string = ''
  ) => {
    const active = curField === field;
    return (
      <th
        onClick={() => onSort(field)}
        className={`py-3 px-4 select-none cursor-pointer hover:text-white transition-colors group ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        } ${extraClass}`}
      >
        <div className={`inline-flex items-center gap-1.5 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}>
          <span className={active ? 'text-purple-400 font-bold' : ''}>{label}</span>
          <span className="text-[10px]">
            {active ? (
              curDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-purple-400 inline" /> : <ChevronDown className="w-3.5 h-3.5 text-purple-400 inline" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline opacity-60" />
            )}
          </span>
        </div>
      </th>
    );
  };

  const sortedHoldingsData = useMemo(() => {
    const data = [...holdingsData];
    data.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      
      const getXirr = (h: any) => h.xirr !== undefined && h.xirr !== null ? h.xirr : (h.total_cost > 0 ? (h.unrealized_pnl / h.total_cost) * 100 : 0);

      switch (sortField) {
        case 'asset':
          valA = a.company_name || a.symbol || '';
          valB = b.company_name || b.symbol || '';
          break;
        case 'valuation':
          valA = a.current_value || 0;
          valB = b.current_value || 0;
          break;
        case 'xirr':
          valA = getXirr(a);
          valB = getXirr(b);
          break;
        case 'invested':
          valA = a.total_cost || 0;
          valB = b.total_cost || 0;
          break;
        case 'withdrawal':
          valA = a.total_withdrawal || 0;
          valB = b.total_withdrawal || 0;
          break;
        case 'gain':
          valA = (a.unrealized_pnl || 0) + (a.realized_pnl || 0);
          valB = (b.unrealized_pnl || 0) + (b.realized_pnl || 0);
          break;
        case 'unrealised':
          valA = a.unrealized_pnl || 0;
          valB = b.unrealized_pnl || 0;
          break;
        case 'realised':
          valA = a.realized_pnl || 0;
          valB = b.realized_pnl || 0;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [holdingsData, sortField, sortDirection]);

  const performanceTotals = useMemo(() => {
    let valuation = 0;
    let invested = 0;
    let withdrawal = 0;
    let gain = 0;
    let realised = 0;
    let unrealised = 0;
    holdingsData.forEach(h => {
      valuation += h.current_value || 0;
      invested += h.total_cost || 0;
      withdrawal += h.total_withdrawal || 0;
      const uPnl = h.unrealized_pnl || 0;
      const rPnl = h.realized_pnl || 0;
      unrealised += uPnl;
      realised += rPnl;
      gain += (uPnl + rPnl);
    });
    return { valuation, invested, withdrawal, gain, realised, unrealised };
  }, [holdingsData]);

  // Top gainers and losers
  const { topGainers, topLosers } = useMemo(() => {
    const sorted = [...holdingsData].filter(h => (h.current_value || 0) > 0);
    sorted.sort((a, b) => (b.day_change_pct || 0) - (a.day_change_pct || 0));
    return {
      topGainers: sorted.slice(0, 6),
      topLosers: [...sorted].reverse().slice(0, 6)
    };
  }, [holdingsData]);

  // Sector breakdown data
  const sectorData = useMemo(() => {
    const sMap: Record<string, { value: number; cost: number }> = {};
    let totalVal = 0;
    holdingsData.forEach(h => {
      const sym = (h.symbol || '').toUpperCase();
      const isin = (h.isin || '').toUpperCase();
      const meta = tickerMasterMap[sym] || tickerMasterMap[isin];
      const sector = meta?.sector || h.sector || 'Diversified / Other';
      const val = h.current_value || 0;
      const cost = h.total_cost || 0;
      totalVal += val;

      if (!sMap[sector]) sMap[sector] = { value: 0, cost: 0 };
      sMap[sector].value += val;
      sMap[sector].cost += cost;
    });

    const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B', '#F97316', '#14B8A6'];
    return Object.entries(sMap)
      .map(([name, data], idx) => ({
        name,
        value: Math.round(donutMetric === 'CURRENT_VALUE' ? data.value : data.cost),
        pct: totalVal > 0 ? (data.value / totalVal) * 100 : 0,
        color: colors[idx % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsData, tickerMasterMap, donutMetric]);

  // Market Cap breakdown data
  const marketCapData = useMemo(() => {
    const cMap: Record<string, { value: number; cost: number }> = {
      'Large Cap': { value: 0, cost: 0 },
      'Mid Cap': { value: 0, cost: 0 },
      'Small Cap': { value: 0, cost: 0 },
      'Other / Unlisted': { value: 0, cost: 0 }
    };
    let totalVal = 0;

    holdingsData.forEach(h => {
      const sym = (h.symbol || '').toUpperCase();
      const isin = (h.isin || '').toUpperCase();
      const meta = tickerMasterMap[sym] || tickerMasterMap[isin];
      const cap = meta?.market_cap_category || (meta?.market_cap > 200000000000 ? 'Large Cap' : meta?.market_cap > 50000000000 ? 'Mid Cap' : meta?.market_cap > 0 ? 'Small Cap' : 'Large Cap');
      const val = h.current_value || 0;
      const cost = h.total_cost || 0;
      totalVal += val;

      if (cMap[cap]) {
        cMap[cap].value += val;
        cMap[cap].cost += cost;
      } else {
        cMap['Other / Unlisted'].value += val;
        cMap['Other / Unlisted'].cost += cost;
      }
    });

    const capColors: Record<string, string> = {
      'Large Cap': '#2563EB',
      'Mid Cap': '#8B5CF6',
      'Small Cap': '#F59E0B',
      'Other / Unlisted': '#64748B'
    };

    return Object.entries(cMap)
      .filter(([_, d]) => d.value > 0 || d.cost > 0)
      .map(([name, data]) => ({
        name,
        value: Math.round(donutMetric === 'CURRENT_VALUE' ? data.value : data.cost),
        pct: totalVal > 0 ? (data.value / totalVal) * 100 : 0,
        color: capColors[name] || '#94A3B8'
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsData, tickerMasterMap, donutMetric]);

  // Asset Class breakdown data
  const assetClassData = useMemo(() => {
    const aMap: Record<string, { value: number; cost: number }> = {};
    let totalVal = 0;

    holdingsData.forEach(h => {
      const port = h.portfolio || '';
      let assetClass = 'Stocks & Equity ETFs';
      if (port.includes('MF') || (h.isin && h.isin.startsWith('INF'))) {
        assetClass = 'Mutual Funds';
      } else if (port.includes('FD') || port.includes('Cash') || h.sector?.includes('Cash')) {
        assetClass = 'Fixed Deposits & Bank';
      } else if (port.includes('Unlisted')) {
        assetClass = 'Unlisted Equity';
      } else if (port.includes('US') || h.currency === 'USD') {
        assetClass = 'Global Equity';
      }

      const val = h.current_value || 0;
      const cost = h.total_cost || 0;
      totalVal += val;

      if (!aMap[assetClass]) aMap[assetClass] = { value: 0, cost: 0 };
      aMap[assetClass].value += val;
      aMap[assetClass].cost += cost;
    });

    const aColors: Record<string, string> = {
      'Stocks & Equity ETFs': '#10B981',
      'Mutual Funds': '#2563EB',
      'Fixed Deposits & Bank': '#F59E0B',
      'Unlisted Equity': '#8B5CF6',
      'Global Equity': '#06B6D4'
    };

    return Object.entries(aMap)
      .map(([name, data]) => ({
        name,
        value: Math.round(donutMetric === 'CURRENT_VALUE' ? data.value : data.cost),
        pct: totalVal > 0 ? (data.value / totalVal) * 100 : 0,
        color: aColors[name] || '#64748B'
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdingsData, donutMetric]);

  // Active donut data based on sub-toggle
  const activeDonutList = useMemo(() => {
    if (holdingsViewBy === 'SECTOR') return sectorData;
    if (holdingsViewBy === 'MARKET_CAP') return marketCapData;
    return assetClassData;
  }, [holdingsViewBy, sectorData, marketCapData, assetClassData]);

  // Institutional Multi-Asset Equity Exposure Engine (Direct Stocks + Mutual Fund Underlying Lookthrough)
  const equityExposureData = useMemo(() => {
    const exposureMap: Record<string, {
      symbol: string;
      name: string;
      sector: string;
      directValue: number;
      indirectValue: number;
      totalValue: number;
    }> = {};

    let totalEquityAum = 0;

    holdingsData.forEach(h => {
      const val = h.current_value || 0;
      if (val <= 0) return;

      const isin = (h.isin || '').toUpperCase();
      const sym = (h.symbol || '').toUpperCase();
      const p = (h.portfolio || '').toLowerCase();
      const isMf = isin.startsWith('INF') || p.includes('mf') || p.includes('mutual') || (h.asset_class && h.asset_class.toLowerCase().includes('mutual'));
      const isBank = p.includes('cash') || p.includes('fd') || sym.includes('FD') || (h.asset_class && h.asset_class.toLowerCase().includes('fixed'));

      if (isBank) return;

      if (isMf) {
        totalEquityAum += val;
        // Decompose mutual fund AUM into underlying company exposures
        const weights = MF_LOOKTHROUGH_WEIGHTS.DEFAULT;
        weights.forEach(item => {
          const underlyingVal = val * item.weight;
          if (!exposureMap[item.symbol]) {
            exposureMap[item.symbol] = {
              symbol: item.symbol,
              name: item.name,
              sector: item.sector,
              directValue: 0,
              indirectValue: 0,
              totalValue: 0
            };
          }
          exposureMap[item.symbol].indirectValue += underlyingVal;
          exposureMap[item.symbol].totalValue += underlyingVal;
        });
      } else {
        // Direct Equity stock
        totalEquityAum += val;
        const name = h.company_name || h.symbol || sym;
        const sector = h.sector || 'Equities';
        if (!exposureMap[sym]) {
          exposureMap[sym] = {
            symbol: sym,
            name,
            sector,
            directValue: 0,
            indirectValue: 0,
            totalValue: 0
          };
        }
        exposureMap[sym].directValue += val;
        exposureMap[sym].totalValue += val;
      }
    });

    const list = Object.values(exposureMap).map(item => ({
      ...item,
      directPct: totalEquityAum > 0 ? (item.directValue / totalEquityAum) * 100 : 0,
      indirectPct: totalEquityAum > 0 ? (item.indirectValue / totalEquityAum) * 100 : 0,
      totalPct: totalEquityAum > 0 ? (item.totalValue / totalEquityAum) * 100 : 0
    }));

    list.sort((a, b) => b.totalValue - a.totalValue);

    return {
      totalEquityAum,
      items: list
    };
  }, [holdingsData, MF_LOOKTHROUGH_WEIGHTS]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header & Sub-Tab Navigation Bar */}
      <div 
        className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-3xl border shadow-sm"
        style={{
          background: 'var(--bg-card, #0F172A)',
          borderColor: 'var(--border-card, #1E293B)'
        }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="p-2.5 rounded-2xl flex items-center justify-center font-bold"
            style={{
              background: 'var(--bg-table-alt, #1E293B)',
              color: 'var(--text-primary, #F8FAFC)'
            }}
          >
            <BarChart3 className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-display tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Institutional Analytics & Exposures
            </h2>
            <p className="text-xs text-slate-400">
              Institutional grade: Real-time asset classes, underlying stock lookthrough, market cap, and XIRR performance.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Refresh button */}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* Sub-Tab Navigation Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-800 dark:bg-slate-800 border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveSubTab('TODAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === 'TODAY'
                  ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Today
            </button>
            <button
              onClick={() => setActiveSubTab('HOLDINGS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === 'HOLDINGS'
                  ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              Holdings
            </button>
            <button
              onClick={() => setActiveSubTab('PERFORMANCE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === 'PERFORMANCE'
                  ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Performance & XIRR
            </button>
            <button
              onClick={() => setActiveSubTab('EQUITY_EXPOSURE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === 'EQUITY_EXPOSURE'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Equity Lookthrough
            </button>
            <button
              onClick={() => {
                window.location.hash = '#opportunity-engine';
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap bg-gradient-to-r from-purple-900/80 to-indigo-900/80 hover:from-purple-800 hover:to-indigo-800 text-purple-200 hover:text-white border border-purple-500/40 shadow-sm"
              title="Smart Flow Radar & Autonomous Sentinel are unified inside Opportunity Engine"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
              <span>Opportunity Engine & Sentinel</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black border border-emerald-500/30">
                UNIFIED
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: TODAY VIEW */}
      {activeSubTab === 'TODAY' && (
        <div className="space-y-6">
          {/* Top KPI Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Asset Class Valuation */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-800 dark:bg-slate-800 text-slate-300">
                  Portfolio Valuation
                </span>
                <span className="text-xs text-slate-400 font-mono">Live</span>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl sm:text-3xl font-mono font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(metrics.current_value || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">
                  Total Active Portfolio Assets
                </span>
              </div>
            </div>

            {/* Card 2: Today's Gain */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Today's Gain / Loss</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${getGainLossBgClass(metrics.day_change_pct)}`}>
                  {getGainLossIcon(metrics.day_change_pct)} {formatPct(metrics.day_change_pct, true)}
                </span>
              </div>
              <div className="mt-4">
                <h3 className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${getGainLossColorClass(metrics.day_change)}`}>
                  {formatCurrency(metrics.day_change || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Intraday market movement</span>
              </div>
            </div>

            {/* Card 3: Unrealised Gain */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Unrealised Total Profit</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${getGainLossBgClass(metrics.unrealized_pct)}`}>
                  {getGainLossIcon(metrics.unrealized_pct)} {formatPct(metrics.unrealized_pct, true)}
                </span>
              </div>
              <div className="mt-4">
                <h3 className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${getGainLossColorClass(metrics.unrealized_pnl)}`}>
                  {formatCurrency(metrics.unrealized_pnl || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Open holding paper returns</span>
              </div>
            </div>
          </div>

          {/* Middle Row: Benchmark Relative Chart & Asset Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Relative Performance Chart */}
            <div 
              className="lg:col-span-7 p-6 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                    Today's Performance vs Benchmarks
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    See how your portfolio assets are moving today compared to key market indices.
                  </p>
                </div>
                <span className="p-2 rounded-xl bg-slate-800 dark:bg-slate-800 text-slate-500">
                  <SlidersHorizontal className="w-4 h-4" />
                </span>
              </div>

              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marketBenchmarks} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #64748B)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--text-secondary, #64748B)', fontSize: 11 }} unit="%" />
                    <Tooltip 
                      formatter={(val: any) => [`${val}%`, 'Day Return']}
                      contentStyle={{ background: 'var(--bg-modal, #0F172A)', border: '1px solid var(--border-card, #334155)', borderRadius: '0.75rem', color: '#FFF' }}
                    />
                    <Bar dataKey="returnPct" radius={[6, 6, 0, 0]}>
                      {marketBenchmarks.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.returnPct >= 0 ? '#10B981' : '#EF4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Asset Allocation Donut Mini */}
            <div 
              className="lg:col-span-5 p-6 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                  Asset Allocation
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              <div className="h-44 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetClassData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={3}
                    >
                      {assetClassData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(metrics.current_value || 0)}
                  </span>
                  <span className="text-[10px] text-slate-400">Total Value</span>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 mt-2 max-h-24 overflow-y-auto pr-1">
                {assetClassData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      <span className="text-slate-300 truncate max-w-[130px]">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-200">
                      {item.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Row: Today's Movers & Real-Time Watchlist */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Today's Movers Card */}
            <div className="lg:col-span-6 p-6 rounded-3xl border border-slate-800 bg-slate-900 text-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-black font-display text-white">
                    Today's Movers
                  </h4>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    onClick={() => setMoversTab('GAINERS')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      moversTab === 'GAINERS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Top Gainers
                  </button>
                  <button
                    onClick={() => setMoversTab('LOSERS')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      moversTab === 'LOSERS' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Top Losers
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-800/80 mt-2 flex-1">
                {(moversTab === 'GAINERS' ? topGainers : topLosers).map((scrip, idx) => {
                  const dayPct = scrip.day_change_pct || 0;
                  const dayAmt = (scrip.day_change || 0) * (scrip.quantity || 1);
                  const isPos = dayPct >= 0;
                  return (
                    <div 
                      key={idx}
                      onClick={() => showStockDrilldown && showStockDrilldown(scrip.symbol)}
                      className="py-3 flex items-center justify-between hover:bg-slate-800/60 px-2 rounded-xl transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="text-xs font-black text-white block font-display tracking-tight">
                          {scrip.company_name || scrip.symbol}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-300">
                          {formatCurrency(scrip.current_value || 0)}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className={`text-xs font-black flex items-center justify-end gap-0.5 ${
                          dayPct >= 2 ? 'text-emerald-400' :
                          dayPct > 0 ? 'text-teal-400' :
                          dayPct >= -2 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {isPos ? '▲' : '▼'} {Math.abs(dayPct).toFixed(2)}%
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 block">
                          ({formatCurrency(dayAmt)})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Watchlist Card */}
            <div className="lg:col-span-6 p-6 rounded-3xl border border-slate-800 bg-slate-900 text-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-black font-display text-white">
                    Watchlist & Market Indices
                  </h4>
                </div>
                <span className="text-[11px] text-slate-400 font-mono font-bold">Live Feeds</span>
              </div>

              <div className="divide-y divide-slate-800/80 mt-2 flex-1">
                {watchlist.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between hover:bg-slate-800/60 px-2 rounded-xl transition-colors">
                    <div className="flex items-center gap-2.5">
                      <GripVertical className="w-3.5 h-3.5 text-slate-500 cursor-grab" />
                      <div>
                        <span className="text-xs font-black text-white block font-display tracking-tight">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                          NSE: {item.symbol}
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-xs font-black text-white block">
                        ₹{item.price.toFixed(2)}
                      </span>
                      <span className={`text-[11px] font-black ${
                        item.dayChangePct >= 2 ? 'text-emerald-400' :
                        item.dayChangePct > 0 ? 'text-teal-400' :
                        item.dayChangePct >= -2 ? 'text-amber-400' :
                        'text-rose-400'
                      }`}>
                        {item.dayChange >= 0 ? '+' : ''}{item.dayChange.toFixed(2)} ({item.dayChangePct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: HOLDINGS & EXPOSURE BREAKDOWN */}
      {activeSubTab === 'HOLDINGS' && (
        <div className="space-y-6">
          {/* Controls Bar: Dimension Selector & Metric Toggle */}
          <div 
            className="p-4 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
            style={{
              background: 'var(--bg-card, #0F172A)',
              borderColor: 'var(--border-card, #1E293B)'
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">View By:</span>
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-800 dark:bg-slate-800">
                <button
                  onClick={() => setHoldingsViewBy('SECTOR')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    holdingsViewBy === 'SECTOR' ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Sector
                </button>
                <button
                  onClick={() => setHoldingsViewBy('MARKET_CAP')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    holdingsViewBy === 'MARKET_CAP' ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Market Cap
                </button>
                <button
                  onClick={() => setHoldingsViewBy('ASSET')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    holdingsViewBy === 'ASSET' ? 'bg-slate-950 dark:bg-slate-950 text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Asset Class
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">Weightage Metric:</span>
              <select
                value={donutMetric}
                onChange={(e) => setDonutMetric(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 dark:bg-slate-800 border border-slate-800 text-slate-200 cursor-pointer"
              >
                <option value="CURRENT_VALUE">Current Valuation (₹)</option>
                <option value="INVESTED">Amount Invested (Cost ₹)</option>
              </select>
            </div>
          </div>

          {/* Allocation Breakdown Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Donut Chart with Legend */}
            <div 
              className="lg:col-span-7 p-6 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold font-display capitalize" style={{ color: 'var(--text-primary)' }}>
                    {holdingsViewBy.replace('_', ' ')} Exposure Breakdown
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Interactive distribution chart with percentage portfolio weightages.
                  </p>
                </div>
              </div>

              <div className="h-64 w-full relative flex items-center justify-center my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeDonutList}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={3}
                    >
                      {activeDonutList.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(metrics.current_value || 0)}
                  </span>
                  <span className="text-[10px] text-slate-400">Total Portfolio Value</span>
                </div>
              </div>

              {/* Dynamic Legend Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                {activeDonutList.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                      <span className="font-semibold text-slate-200 truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-white block">{item.pct.toFixed(1)}%</span>
                      <span className="text-[10px] text-slate-400">{formatCurrency(item.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Summary KPI Cards */}
            <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
              <div 
                className="p-5 rounded-3xl border shadow-sm"
                style={{
                  background: 'var(--bg-card, #0F172A)',
                  borderColor: 'var(--border-card, #1E293B)'
                }}
              >
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amount Invested</span>
                <h3 className="text-2xl font-mono font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(metrics.total_invested || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Cost basis of open positions</span>
              </div>

              <div 
                className="p-5 rounded-3xl border shadow-sm"
                style={{
                  background: 'var(--bg-card, #0F172A)',
                  borderColor: 'var(--border-card, #1E293B)'
                }}
              >
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Market Value</span>
                <h3 className="text-2xl font-mono font-bold mt-2 text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(metrics.current_value || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">As on today's closing prices</span>
              </div>

              <div 
                className="p-5 rounded-3xl border shadow-sm"
                style={{
                  background: 'var(--bg-card, #0F172A)',
                  borderColor: 'var(--border-card, #1E293B)'
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unrealised Gain</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                    {(metrics.unrealized_pct || 0).toFixed(2)}% ↑
                  </span>
                </div>
                <h3 className="text-2xl font-mono font-bold mt-2 text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(metrics.unrealized_pnl || 0)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">Net holding capital appreciation</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PERFORMANCE & XIRR ATTRIBUTION TABLE */}
      {activeSubTab === 'PERFORMANCE' && (
        <div className="space-y-6">
          {/* ── Macro & Real Return Attribution Suite ── */}
          <div
            className="p-6 rounded-3xl border shadow-xl backdrop-blur-md space-y-6"
            style={{
              background: 'var(--bg-card, #0F172A)',
              borderColor: 'var(--border-card, #1E293B)'
            }}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--border-card)' }}>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      Macro & Real Returns Attribution
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {selectedPortfolio || 'Combined'} • Inception: {analyticsData?.macroRealReturns?.usd?.first_investment_date || analyticsData?.custom?.start_date || '2008-02-25'}
                      </span>
                      {analyticsData?.macroRealReturns?.usd?.is_us_portfolio && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          USD-NATIVE (0% DEVALUATION)
                        </span>
                      )}
                    </h3>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      True purchasing power benchmarking adjusted for USD/INR currency devaluation and physical Gold appreciation.
                    </p>
                  </div>
                </div>
              </div>

              {/* View Switcher: INR vs USD vs GOLD */}
              <div className="flex items-center gap-1.5 p-1 rounded-2xl border shrink-0" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <button
                  onClick={() => setRealReturnView('USD')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    realReturnView === 'USD'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'hover:opacity-80'
                  }`}
                  style={{ color: realReturnView === 'USD' ? '#fff' : 'var(--text-secondary)' }}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Real USD (Currency Adjusted)
                </button>

                <button
                  onClick={() => setRealReturnView('GOLD')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    realReturnView === 'GOLD'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'hover:opacity-80'
                  }`}
                  style={{ color: realReturnView === 'GOLD' ? '#fff' : 'var(--text-secondary)' }}
                >
                  <Coins className="w-3.5 h-3.5" />
                  Gold Purchasing Power
                </button>

                <button
                  onClick={() => setRealReturnView('INR')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    realReturnView === 'INR'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'hover:opacity-80'
                  }`}
                  style={{ color: realReturnView === 'INR' ? '#fff' : 'var(--text-secondary)' }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Domestic INR (Nominal)
                </button>
              </div>
            </div>

            {/* 3 Real Return Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Valuation & Money-Weighted XIRR */}
              <div className="p-4 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                    {realReturnView === 'USD' ? 'Real USD Net Worth & XIRR' : realReturnView === 'GOLD' ? 'Gold Purchasing Power & XIRR' : 'Domestic INR Net Worth & XIRR'}
                  </span>
                  <div className="text-2xl font-black font-mono mt-1" style={{ color: 'var(--text-primary)' }}>
                    {realReturnView === 'USD'
                      ? `$${(((metrics.current_value || analyticsData?.summary?.current_value || 0)) / (analyticsData?.macroRealReturns?.usd?.currentRate || 95.53) / 1000000).toFixed(2)}M USD`
                      : realReturnView === 'GOLD'
                      ? `${Math.round((analyticsData?.macroRealReturns?.gold?.equivalentGoldGrams || (((metrics.current_value || analyticsData?.summary?.current_value || 0)) / 9580))).toLocaleString('en-IN')} Grams Gold`
                      : formatCurrency(metrics.current_value || analyticsData?.summary?.current_value || 0)}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs font-bold font-mono flex items-center justify-between" style={{ color: 'var(--accent-green)' }}>
                      <span>Active Open Holdings:</span>
                      <span>
                        {realReturnView === 'USD' 
                          ? (analyticsData?.macroRealReturns?.usd?.custom?.portfolio_usd_xirr !== undefined ? `${analyticsData.macroRealReturns.usd.custom.portfolio_usd_xirr >= 0 ? '+' : ''}${analyticsData.macroRealReturns.usd.custom.portfolio_usd_xirr.toFixed(2)}% p.a.` : '—')
                          : (metrics.xirr !== undefined && metrics.xirr !== null ? `${metrics.xirr >= 0 ? '+' : ''}${metrics.xirr.toFixed(2)}% p.a.` : (analyticsData?.custom?.portfolio !== undefined && analyticsData?.custom?.portfolio !== null ? `${analyticsData.custom.portfolio >= 0 ? '+' : ''}${analyticsData.custom.portfolio.toFixed(2)}% p.a.` : '—'))}
                      </span>
                    </div>
                    <div className="text-xs font-bold font-mono flex items-center justify-between text-blue-400">
                      <span>Full Lifetime Inception:</span>
                      <span>
                        {realReturnView === 'USD'
                          ? (analyticsData?.macroRealReturns?.usd?.custom?.portfolio_usd_xirr !== undefined ? `${analyticsData.macroRealReturns.usd.custom.portfolio_usd_xirr >= 0 ? '+' : ''}${analyticsData.macroRealReturns.usd.custom.portfolio_usd_xirr.toFixed(2)}% p.a.` : '—')
                          : (analyticsData?.custom?.portfolio !== undefined && analyticsData?.custom?.portfolio !== null ? `${analyticsData.custom.portfolio >= 0 ? '+' : ''}${analyticsData.custom.portfolio.toFixed(2)}% p.a.` : (metrics.xirr !== undefined && metrics.xirr !== null ? `${metrics.xirr >= 0 ? '+' : ''}${metrics.xirr.toFixed(2)}% p.a.` : '—'))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] mt-3 pt-2 border-t font-medium" style={{ borderColor: 'var(--border-card)', color: 'var(--text-muted)' }}>
                  {realReturnView === 'USD' 
                    ? (analyticsData?.macroRealReturns?.usd?.currentRate
                        ? `Live Rate: 1 USD = ₹${analyticsData.macroRealReturns.usd.currentRate.toFixed(2)} • $${(((metrics.current_value || analyticsData?.summary?.current_value || 0)) / analyticsData.macroRealReturns.usd.currentRate / 1000000).toFixed(2)}M Pegged`
                        : 'USD/INR live rate pending feed tick...')
                    : realReturnView === 'GOLD'
                    ? (analyticsData?.macroRealReturns?.gold?.equivalentGoldSovereigns
                        ? `Equivalent to ~${Math.round(analyticsData.macroRealReturns.gold.equivalentGoldSovereigns).toLocaleString('en-IN')} Gold Sovereigns (8g)`
                        : 'Gold Sovereign conversion pending live bullion feed...')
                    : `Active Open: ${metrics.xirr !== undefined && metrics.xirr !== null ? `${metrics.xirr.toFixed(2)}%` : '—'} | Lifetime: ${analyticsData?.custom?.portfolio !== undefined && analyticsData?.custom?.portfolio !== null ? `${analyticsData.custom.portfolio.toFixed(2)}%` : '—'}`}
                </div>
              </div>

              {/* Card 2: Currency Drag / Gold Benchmark */}
              <div className="p-4 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                    {realReturnView === 'USD' ? 'Annualized Currency Devaluation' : realReturnView === 'GOLD' ? 'Physical Gold Price Compounding' : 'Domestic Benchmark (Nifty 50)'}
                  </span>
                  <div className="text-2xl font-black font-mono mt-1" style={{ color: realReturnView === 'USD' ? 'var(--accent-rose)' : 'var(--accent-gold)' }}>
                    {realReturnView === 'USD'
                      ? `-${(analyticsData?.macroRealReturns?.usd?.custom?.inr_devaluation_cagr ?? 4.00).toFixed(2)}% p.a.`
                      : realReturnView === 'GOLD'
                      ? `+${(analyticsData?.macroRealReturns?.gold?.custom?.gold_appreciation_cagr ?? 10.03).toFixed(2)}% p.a.`
                      : (analyticsData?.custom?.benchmarks?.nifty50 !== undefined ? `+${analyticsData.custom.benchmarks.nifty50.toFixed(2)}% p.a.` : (analyticsData?.trailing?.['Since Inception']?.benchmarks?.nifty50 !== undefined ? `+${analyticsData.trailing['Since Inception'].benchmarks.nifty50.toFixed(2)}% p.a.` : '—'))}
                  </div>
                  <div className="text-xs font-mono font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {realReturnView === 'USD'
                      ? `Effective Asset-Weighted Drag (USD: ${(analyticsData?.macroRealReturns?.usd?.usd_weight_pct ?? 17.0)}% | INR: ${(analyticsData?.macroRealReturns?.usd?.inr_weight_pct ?? 83.0)}%)`
                      : realReturnView === 'GOLD'
                      ? `Gold 24K surged ${(analyticsData?.macroRealReturns?.gold?.custom?.gold_appreciation_total_pct ?? 711.9).toFixed(1)}% (₹11.8k → ₹95.8k/10g)`
                      : `Nifty 50 Cash-Flow Matched Return (${selectedPortfolio || 'Combined'})`}
                  </div>
                </div>
                <div className="text-[11px] mt-3 pt-2 border-t font-medium" style={{ borderColor: 'var(--border-card)', color: 'var(--text-muted)' }}>
                  {realReturnView === 'USD' ? 'USD/INR Purchasing Drag (Weighted)' : realReturnView === 'GOLD' ? 'Physical Bullion Benchmark' : 'Large Cap Equity Benchmark'}
                </div>
              </div>

              {/* Card 3: Real Alpha */}
              {(() => {
                const usdAlphaVal = analyticsData?.macroRealReturns?.usd?.custom?.usd_alpha_over_sp500;
                const goldAlphaVal = analyticsData?.macroRealReturns?.gold?.custom?.alpha_over_gold;
                const portRet = analyticsData?.custom?.portfolio ?? metrics.xirr;
                const sensexRet = analyticsData?.custom?.benchmarks?.sensex ?? analyticsData?.trailing?.['Since Inception']?.benchmarks?.sensex;
                const inrAlphaVal = (portRet !== undefined && portRet !== null && sensexRet !== undefined && sensexRet !== null)
                  ? (portRet - sensexRet)
                  : null;

                const currentAlphaVal = realReturnView === 'USD' ? usdAlphaVal : realReturnView === 'GOLD' ? goldAlphaVal : inrAlphaVal;
                const isPositive = currentAlphaVal !== undefined && currentAlphaVal !== null ? currentAlphaVal >= 0 : true;

                return (
                  <div className="p-4 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <div>
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                        {realReturnView === 'USD' ? 'Real USD Alpha vs S&P 500' : realReturnView === 'GOLD' ? 'Purchasing Power Alpha vs Gold' : 'Alpha vs BSE Sensex'}
                      </span>
                      <div className="text-2xl font-black font-mono mt-1" style={{ color: isPositive ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                        {currentAlphaVal !== undefined && currentAlphaVal !== null
                          ? `${currentAlphaVal >= 0 ? '+' : ''}${currentAlphaVal.toFixed(2)}% p.a.`
                          : '—'}
                      </div>
                      <div className="text-xs font-mono font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {realReturnView === 'USD' ? (
                          usdAlphaVal !== undefined && usdAlphaVal !== null ? (
                            `${usdAlphaVal >= 0 ? 'Outperforming' : 'Trailing'} S&P 500 USD CAGR by ${usdAlphaVal >= 0 ? '+' : ''}${usdAlphaVal.toFixed(2)}% p.a.`
                          ) : 'Excess compounding over S&P 500'
                        ) : realReturnView === 'GOLD' ? (
                          goldAlphaVal !== undefined && goldAlphaVal !== null ? (
                            `${goldAlphaVal >= 0 ? 'Outperforming' : 'Trailing'} Gold 24K CAGR by ${goldAlphaVal >= 0 ? '+' : ''}${goldAlphaVal.toFixed(2)}% p.a.`
                          ) : 'Excess compounding over Physical Gold'
                        ) : (
                          inrAlphaVal !== null ? (
                            `${inrAlphaVal >= 0 ? 'Outperforming' : 'Trailing'} Sensex (${sensexRet?.toFixed(2)}%) by ${inrAlphaVal >= 0 ? '+' : ''}${inrAlphaVal.toFixed(2)}% p.a.`
                          ) : 'Sensex Cash-Flow Matched Benchmark'
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] mt-3 pt-2 border-t font-medium" style={{ borderColor: 'var(--border-card)', color: 'var(--text-muted)' }}>
                      {isPositive ? 'Excess Compounding Over Benchmark' : 'Underperformance vs Benchmark Drag'}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Multi-Period Real Return Comparison Matrix */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Multi-Period {realReturnView === 'USD' ? 'USD Real Return & Currency Drag' : realReturnView === 'GOLD' ? 'Gold Purchasing Power Matrix' : 'Domestic Benchmark Comparison'}
                </h4>
                <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--text-muted)' }}>
                  Exact Cash-Flow Matched Attribution ({selectedPortfolio || 'Combined'})
                </span>
              </div>

              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-card)' }}>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="font-bold border-b font-mono" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}>
                    {realReturnView === 'USD' ? (
                      <tr>
                        <th className="py-3 px-4">TIME WINDOW</th>
                        <th className="py-3 px-4 text-right">PORTFOLIO INR</th>
                        <th className="py-3 px-4 text-right">USD/INR DRAG</th>
                        <th className="py-3 px-4 text-right">REAL PORTFOLIO USD</th>
                        <th className="py-3 px-4 text-right">S&P 500 (USD)</th>
                        <th className="py-3 px-4 text-right">REAL USD ALPHA</th>
                        <th className="py-3 px-4 text-right">NIFTY 50 (IN USD)</th>
                      </tr>
                    ) : realReturnView === 'GOLD' ? (
                      <tr>
                        <th className="py-3 px-4">TIME WINDOW</th>
                        <th className="py-3 px-4 text-right">PORTFOLIO INR</th>
                        <th className="py-3 px-4 text-right">GOLD 24K MOVE</th>
                        <th className="py-3 px-4 text-right">PORTFOLIO IN GOLD TERMS</th>
                        <th className="py-3 px-4 text-right">GOLD RETURN (P.A.)</th>
                        <th className="py-3 px-4 text-right">REAL ALPHA VS GOLD</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="py-3 px-4">TIME WINDOW</th>
                        <th className="py-3 px-4 text-right">ABSOLUTE RETURN</th>
                        <th className="py-3 px-4 text-right">ANNUALIZED (XIRR/CAGR)</th>
                        <th className="py-3 px-4 text-right text-indigo-400">BSE 500 TRI (PMS BENCHMARK)</th>
                        <th className="py-3 px-4 text-right">NIFTY 50</th>
                        <th className="py-3 px-4 text-right">BSE SENSEX</th>
                        <th className="py-3 px-4 text-right">NIFTY MIDCAP 100</th>
                        <th className="py-3 px-4 text-right">NIFTY SMALLCAP 250</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-card)', background: 'var(--bg-card)' }}>
                    {[
                      { key: '1w', label: '1 Week Trailing (7D)' },
                      { key: '1m', label: '1 Month Trailing' },
                      { key: '3m', label: '3 Months Trailing' },
                      { key: '6m', label: '6 Months Trailing' },
                      { key: '1y', label: '1 Year Trailing' },
                      { key: '2y', label: '2 Years Trailing (CAGR)' },
                      { key: '3y', label: '3 Years Trailing (CAGR)' },
                      { key: '5y', label: '5 Years Trailing (CAGR)' },
                      { key: 'active', label: 'Active Open Positions (Current Holdings Cost → LTP)' },
                      { key: 'inception', label: `Since Inception (${analyticsData?.macroRealReturns?.usd?.inception_years || (analyticsData?.custom?.start_date ? ((Date.now() - new Date(analyticsData.custom.start_date).getTime()) / (365.25 * 86400000)).toFixed(1) : '18.5')}Y • All Historical Trades: ${analyticsData?.macroRealReturns?.usd?.first_investment_date || analyticsData?.custom?.start_date || '2008-02-25'})` }
                    ].map((row) => {
                      const isInc = row.key === 'inception';
                      const isActive = row.key === 'active';
                      const trailingKey = isInc ? 'Since Inception' : row.key;
                      
                      const usdTrailingItem = analyticsData?.macroRealReturns?.usd?.trailing?.[trailingKey] || analyticsData?.macroRealReturns?.usd?.trailing?.[row.key] || {};
                      const goldTrailingItem = analyticsData?.macroRealReturns?.gold?.trailing?.[trailingKey] || analyticsData?.macroRealReturns?.gold?.trailing?.[row.key] || {};
                      const inrTrailingItem = analyticsData?.trailing?.[trailingKey] || analyticsData?.trailing?.[row.key] || {};
                      const trailingBench = inrTrailingItem.benchmarks || {};

                      const isSubAnnualPeriod = ['1w', '1m', '3m', '6m'].includes(row.key) || (inrTrailingItem.is_annualized === false);

                      // Domestic INR
                      const portINRAbs = isActive
                        ? metrics.unrealized_pct
                        : isInc
                        ? analyticsData?.custom?.absolute_gain_pct
                        : (inrTrailingItem.portfolio_absolute ?? inrTrailingItem.portfolio);

                      const portINRXirr = isSubAnnualPeriod
                        ? null
                        : isActive
                        ? (metrics.xirr ?? analyticsData?.custom?.portfolio)
                        : isInc
                        ? analyticsData?.custom?.portfolio
                        : (inrTrailingItem.portfolio_xirr ?? inrTrailingItem.portfolio);

                      const bse500 = (isInc || isActive)
                        ? (analyticsData?.custom?.benchmarks?.bse500 ?? trailingBench.bse500)
                        : trailingBench.bse500;

                      const nifty50 = (isInc || isActive)
                        ? (analyticsData?.custom?.benchmarks?.nifty50 ?? trailingBench.nifty50)
                        : trailingBench.nifty50;

                      const sensex = (isInc || isActive)
                        ? (analyticsData?.custom?.benchmarks?.sensex ?? trailingBench.sensex)
                        : trailingBench.sensex;

                      const midcap = (isInc || isActive)
                        ? (analyticsData?.custom?.benchmarks?.nifty_midcap ?? trailingBench.nifty_midcap)
                        : trailingBench.nifty_midcap;

                      const smallcap = (isInc || isActive)
                        ? (analyticsData?.custom?.benchmarks?.nifty_smallcap ?? trailingBench.nifty_smallcap)
                        : trailingBench.nifty_smallcap;

                      // USD Real Returns
                      const portINR = (isInc || isActive)
                        ? (analyticsData?.custom?.portfolio ?? metrics.xirr ?? usdTrailingItem.portfolio_inr ?? 0)
                        : (usdTrailingItem.portfolio_inr ?? inrTrailingItem.portfolio ?? 0);

                      const deval = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.usd?.custom?.inr_devaluation_cagr ?? usdTrailingItem.usd_inr_devaluation ?? 4.00)
                        : (usdTrailingItem.usd_inr_devaluation ?? 0);

                      const portUSD = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.usd?.custom?.portfolio_usd_xirr ?? usdTrailingItem.portfolio_usd ?? 0)
                        : (usdTrailingItem.portfolio_usd ?? 0);

                      const sp500 = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.usd?.custom?.sp500_usd_cagr ?? usdTrailingItem.sp500_usd ?? 8.85)
                        : (usdTrailingItem.sp500_usd ?? 0);

                      const usdAlpha = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.usd?.custom?.usd_alpha_over_sp500 ?? usdTrailingItem.usd_alpha_over_sp500 ?? 0)
                        : (usdTrailingItem.usd_alpha_over_sp500 ?? 0);

                      const niftyUSD = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.usd?.custom?.nifty50_usd_cagr ?? usdTrailingItem.nifty50_usd ?? 0)
                        : (usdTrailingItem.nifty50_usd ?? 0);

                      // Gold Terms
                      const goldReturn = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.gold?.custom?.gold_appreciation_cagr ?? goldTrailingItem.gold_return_inr ?? 10.03)
                        : (goldTrailingItem.gold_return_inr ?? 0);

                      const portVsGold = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.gold?.custom?.portfolio_gold_matched_xirr ?? goldTrailingItem.portfolio_in_gold_terms ?? 0)
                        : (goldTrailingItem.portfolio_in_gold_terms ?? 0);

                      const goldAlpha = (isInc || isActive)
                        ? (analyticsData?.macroRealReturns?.gold?.custom?.alpha_over_gold ?? goldTrailingItem.alpha_over_gold ?? 0)
                        : (goldTrailingItem.alpha_over_gold ?? 0);

                      return (
                        <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
                            {row.label}
                          </td>

                          {realReturnView === 'USD' ? (
                            <>
                              <td className="py-3 px-4 text-right font-bold" style={{ color: portINR >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                                {portINR >= 0 ? '+' : ''}{portINR.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-rose-500">
                                -{Math.abs(deval).toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-black" style={{ color: portUSD >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                                {portUSD >= 0 ? '+' : ''}{portUSD.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {sp500 >= 0 ? '+' : ''}{sp500.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-bold">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] border ${usdAlpha >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                  {usdAlpha >= 0 ? '+' : ''}{usdAlpha.toFixed(2)}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-muted)' }}>
                                {niftyUSD >= 0 ? '+' : ''}{niftyUSD.toFixed(2)}%
                              </td>
                            </>
                          ) : realReturnView === 'GOLD' ? (
                            <>
                              <td className="py-3 px-4 text-right font-bold" style={{ color: portINR >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                                {portINR >= 0 ? '+' : ''}{portINR.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-amber-500">
                                +{goldReturn.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-black" style={{ color: portVsGold >= 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                                {portVsGold >= 0 ? '+' : ''}{portVsGold.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                +{goldReturn.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-right font-bold">
                                <span className={`px-2 py-0.5 rounded-md text-[11px] border ${goldAlpha >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                  {goldAlpha >= 0 ? '+' : ''}{goldAlpha.toFixed(2)}%
                                </span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-4 text-right font-black" style={{ color: (portINRAbs !== undefined && portINRAbs !== null && portINRAbs >= 0) ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
                                {portINRAbs !== undefined && portINRAbs !== null ? `${portINRAbs >= 0 ? '+' : ''}${portINRAbs.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-bold">
                                {isSubAnnualPeriod ? (
                                  <span className="text-slate-400 dark:text-slate-500 font-sans text-[11px] font-normal" title="GIPS Standard (CFA Institute): Sub-annual periods (< 1 Year) are non-annualized">
                                    N/A (&lt;1Y)
                                  </span>
                                ) : portINRXirr !== undefined && portINRXirr !== null ? (
                                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${portINRXirr >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                    {portINRXirr >= 0 ? '+' : ''}{portINRXirr.toFixed(2)}% p.a.
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-indigo-400">
                                {bse500 !== undefined && bse500 !== null ? `${bse500 >= 0 ? '+' : ''}${bse500.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {nifty50 !== undefined && nifty50 !== null ? `${nifty50 >= 0 ? '+' : ''}${nifty50.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {sensex !== undefined && sensex !== null ? `${sensex >= 0 ? '+' : ''}${sensex.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {midcap !== undefined && midcap !== null ? `${midcap >= 0 ? '+' : ''}${midcap.toFixed(2)}%` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {smallcap !== undefined && smallcap !== null ? `${smallcap >= 0 ? '+' : ''}${smallcap.toFixed(2)}%` : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* GIPS Compliance Footnote */}
              <div className="mt-3.5 px-4 py-2.5 rounded-xl bg-slate-900/40 dark:bg-slate-900/60 border border-slate-800/60 flex items-start sm:items-center gap-2 text-[11px] text-slate-400">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  <strong className="text-slate-200">GIPS® / CFA Institute Performance Presentation Standard:</strong> Returns for periods of less than one year (1W, 1M, 3M, 6M) are presented strictly as cumulative/absolute holding-period returns and are <span className="text-emerald-400 font-semibold">not annualized</span> to prevent distorted compound figures.
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div 
            className="p-4 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
            style={{
              background: 'var(--bg-card, #0F172A)',
              borderColor: 'var(--border-card, #1E293B)'
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Period:</span>
              <select
                value={performancePeriod}
                onChange={(e) => setPerformancePeriod(e.target.value)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 dark:bg-slate-800 border border-slate-800 text-slate-200 cursor-pointer"
              >
                <option value="ALL">All to Date (Inception to Today)</option>
                <option value="1Y">1 Year Trailing</option>
                <option value="3Y">3 Years Trailing</option>
                <option value="5Y">5 Years Trailing</option>
                <option value="FY25">FY 2024-2025</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                Showing {holdingsData.length} Scrips with Money-Weighted Returns
              </span>
            </div>
          </div>

          {/* Performance Table */}
          <div 
            className="rounded-3xl border shadow-sm overflow-hidden"
            style={{
              background: 'var(--bg-card, #0F172A)',
              borderColor: 'var(--border-card, #1E293B)'
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead 
                  className="font-bold border-b text-slate-300"
                  style={{
                    background: 'var(--bg-table-alt, #F8FAFC)',
                    borderColor: 'var(--border-card, #1E293B)'
                  }}
                >
                  <tr>
                    <th className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('asset')}>ASSET NAME {renderSortIcon('asset')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('valuation')}>CLOSING VALUATION {renderSortIcon('valuation')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('xirr')}>XIRR (%) {renderSortIcon('xirr')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('invested')}>TOTAL INVESTMENT {renderSortIcon('invested')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('withdrawal')}>TOTAL WITHDRAWAL {renderSortIcon('withdrawal')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('gain')}>TOTAL GAIN {renderSortIcon('gain')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('realised')}>REALISED GAIN {renderSortIcon('realised')}</th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => toggleSort('unrealised')}>UNREALISED GAIN {renderSortIcon('unrealised')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {sortedHoldingsData.map((h, idx) => {
                    const val = h.current_value || 0;
                    const cost = h.total_cost || 0;
                    const withdrawal = h.total_withdrawal || 0;
                    const rPnl = h.realized_pnl || 0;
                    const unPnl = h.unrealized_pnl || 0;
                    const unPct = h.unrealized_pct || (cost > 0 ? (unPnl / cost) * 100 : 0);
                    const totalGain = unPnl + rPnl;
                    const xirr = h.xirr !== undefined && h.xirr !== null ? h.xirr : (cost > 0 ? (unPnl / cost) * 100 : null);
                    const isTotalPos = totalGain >= 0;
                    const isUnPos = unPnl >= 0;
                    const isRPos = rPnl >= 0;

                    return (
                      <tr 
                        key={idx}
                        onClick={() => showStockDrilldown && showStockDrilldown(h.symbol)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          <div>
                            <span>{h.company_name || h.symbol}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">{h.symbol}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-200">
                          {formatCurrency(val)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${getGainLossColorClass(xirr)}`}>
                          {xirr !== null ? `${getGainLossIcon(xirr)} ${formatPct(xirr, true)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {formatCurrency(cost)}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {formatCurrency(withdrawal)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${getGainLossColorClass(totalGain)}`}>
                          {formatCurrency(totalGain)}
                          <span className="text-[10px] block opacity-90">{cost > 0 ? `${((totalGain / cost) * 100).toFixed(2)}%` : `${unPct.toFixed(2)}%`}</span>
                        </td>
                        <td className={`py-3 px-4 text-right font-medium ${getGainLossColorClass(rPnl)}`}>
                          {formatCurrency(rPnl)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${getGainLossColorClass(unPnl)}`}>
                          {formatCurrency(unPnl)}
                          <span className="text-[10px] block opacity-90">{unPct.toFixed(2)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="font-bold border-t text-slate-300 font-mono" style={{ background: 'var(--bg-table-alt, #F8FAFC)', borderColor: 'var(--border-card, #1E293B)' }}>
                  <tr>
                    <td className="py-3 px-4 font-sans">TOTAL</td>
                    <td className="py-3 px-4 text-right font-bold text-white">{formatCurrency(performanceTotals.valuation)}</td>
                    <td className="py-3 px-4 text-right">
                      {performanceTotals.invested > 0 ? (
                        <span className={getGainLossColorClass(performanceTotals.gain)}>
                          {getGainLossIcon(performanceTotals.gain)} {((performanceTotals.gain / performanceTotals.invested) * 100).toFixed(2)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-white">{formatCurrency(performanceTotals.invested)}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(performanceTotals.withdrawal)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={getGainLossColorClass(performanceTotals.gain)}>
                        {formatCurrency(performanceTotals.gain)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={getGainLossColorClass(performanceTotals.realised)}>
                        {formatCurrency(performanceTotals.realised)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={getGainLossColorClass(performanceTotals.unrealised)}>
                        {formatCurrency(performanceTotals.unrealised)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: EQUITY EXPOSURE LOOKTHROUGH */}
      {activeSubTab === 'EQUITY_EXPOSURE' && (
        <div className="space-y-6">
          {/* Top KPI Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total Equity Exposure */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300">
                  Total Equity AUM
                </span>
                <span className="text-xs text-slate-400 font-mono">Consolidated</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-mono font-black text-white">
                  {formatCurrency(equityExposureData.totalEquityAum)}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">
                  Direct Stocks + Mutual Fund Holdings
                </span>
              </div>
            </div>

            {/* Direct Equity Value */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300">
                  Direct Stocks
                </span>
                <span className="text-xs text-slate-400 font-mono">Demat</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-mono font-black text-emerald-400">
                  {formatCurrency(equityExposureData.items.reduce((acc, i) => acc + i.directValue, 0))}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">
                  Individual Listed Shares
                </span>
              </div>
            </div>

            {/* Mutual Fund Indirect Equity */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300">
                  Mutual Fund Lookthrough
                </span>
                <span className="text-xs text-slate-400 font-mono">Indirect</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-mono font-black text-blue-400">
                  {formatCurrency(equityExposureData.items.reduce((acc, i) => acc + i.indirectValue, 0))}
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">
                  Underlying Scheme Holdings
                </span>
              </div>
            </div>

            {/* Lookthrough Scrip Count */}
            <div 
              className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300">
                  Unique Companies
                </span>
                <span className="text-xs text-slate-400 font-mono">Coverage</span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-mono font-black text-purple-300">
                  {equityExposureData.items.length} Companies
                </h3>
                <span className="text-xs text-slate-400 mt-1 block">
                  {equityExposureData.items.filter(i => i.totalPct > 10).length > 0 
                    ? `⚠️ ${equityExposureData.items.filter(i => i.totalPct > 10).length} Over-Concentrated (>10%)`
                    : '✓ Optimal Single-Stock Diversification'}
                </span>
              </div>
            </div>
          </div>

          {/* Equity Exposure Table */}
          <div 
            className="rounded-3xl border shadow-sm overflow-hidden"
            style={{
              background: 'var(--bg-card, #0F172A)',
              borderColor: 'var(--border-card, #1E293B)'
            }}
          >
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white font-display">
                  Consolidated Company Exposure (Direct + Mutual Funds)
                </h3>
                <p className="text-xs text-slate-400">
                  Aggregates your direct demat stock portfolio with your mutual fund schemes to reveal true single-company risk.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search company, symbol, sector..."
                    value={exposureSearch}
                    onChange={(e) => setExposureSearch(e.target.value)}
                    className="pl-8 pr-7 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-60 transition"
                  />
                  {exposureSearch && (
                    <button
                      onClick={() => setExposureSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                  Top {Math.min(50, equityExposureData.items.length)} Holdings
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 z-10 font-bold uppercase tracking-wider text-[11px] bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    {renderHubSortHeader('Company Name / Symbol', 'name', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'left')}
                    {renderHubSortHeader('Sector', 'sector', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'left')}
                    {renderHubSortHeader('Direct Stock (₹)', 'directValue', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'right')}
                    {renderHubSortHeader('Fund Indirect (₹)', 'indirectValue', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'right')}
                    {renderHubSortHeader('Total Net Exposure', 'totalNetExposure', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'right')}
                    {renderHubSortHeader('Portfolio %', 'portfolioPct', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'right')}
                    <th className="py-3 px-4 w-40">Concentration Strip</th>
                    {renderHubSortHeader('Risk Flag', 'riskFlag', exposureSortField, exposureSortDir, (f) => handleHubSortToggle(exposureSortField, exposureSortDir, f, setExposureSortField, setExposureSortDir), 'center')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {(() => {
                    let list = [...equityExposureData.items];
                    if (exposureSearch.trim()) {
                      const q = exposureSearch.toLowerCase().trim();
                      list = list.filter((item: any) => {
                        const sym = (item.symbol || '').toLowerCase();
                        const name = (item.name || '').toLowerCase();
                        const sec = (item.sector || '').toLowerCase();
                        return sym.includes(q) || name.includes(q) || sec.includes(q);
                      });
                    }

                    list.sort((a: any, b: any) => {
                      let aVal: any = 0;
                      let bVal: any = 0;
                      if (exposureSortField === 'name') {
                        aVal = a.name || a.symbol || '';
                        bVal = b.name || b.symbol || '';
                        return exposureSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                      } else if (exposureSortField === 'sector') {
                        aVal = a.sector || '';
                        bVal = b.sector || '';
                        return exposureSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                      } else if (exposureSortField === 'directValue') {
                        aVal = a.directValue || 0;
                        bVal = b.directValue || 0;
                      } else if (exposureSortField === 'indirectValue') {
                        aVal = a.indirectValue || 0;
                        bVal = b.indirectValue || 0;
                      } else if (exposureSortField === 'totalNetExposure') {
                        aVal = a.totalValue || 0;
                        bVal = b.totalValue || 0;
                      } else if (exposureSortField === 'portfolioPct') {
                        aVal = a.totalPct || 0;
                        bVal = b.totalPct || 0;
                      } else if (exposureSortField === 'riskFlag') {
                        aVal = a.totalPct > 10 ? 3 : a.totalPct >= 5 ? 2 : 1;
                        bVal = b.totalPct > 10 ? 3 : b.totalPct >= 5 ? 2 : 1;
                      }
                      return exposureSortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                    });

                    if (list.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400 font-sans">
                            {exposureSearch ? `No company exposures matching "${exposureSearch}".` : 'No equity exposures available.'}
                          </td>
                        </tr>
                      );
                    }

                    return list.slice(0, 50).map((item, idx) => {
                      const isHighRisk = item.totalPct > 10;
                      const isModerateRisk = item.totalPct >= 5 && item.totalPct <= 10;

                      return (
                        <tr 
                          key={item.symbol}
                          className="hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-3 px-4 text-center text-slate-500 font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-sans font-bold text-white">
                            <div 
                              className="cursor-pointer hover:text-cyan-400 transition-colors"
                              onClick={() => showStockDrilldown && showStockDrilldown(item.symbol)}
                            >
                              <span>{item.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">{item.symbol}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-300">
                            {item.sector}
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-400 font-bold">
                            {item.directValue > 0 ? formatCurrency(item.directValue) : '-'}
                            {item.directValue > 0 && (
                              <span className="text-[10px] text-slate-500 block">({item.directPct.toFixed(1)}%)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-blue-400 font-bold">
                            {item.indirectValue > 0 ? formatCurrency(item.indirectValue) : '-'}
                            {item.indirectValue > 0 && (
                              <span className="text-[10px] text-slate-500 block">({item.indirectPct.toFixed(1)}%)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-white font-bold text-sm">
                            {formatCurrency(item.totalValue)}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-sm">
                            <span className={isHighRisk ? 'text-rose-400' : isModerateRisk ? 'text-amber-400' : 'text-cyan-400'}>
                              {item.totalPct.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${isHighRisk ? 'bg-rose-500' : isModerateRisk ? 'bg-amber-500' : 'bg-cyan-500'}`}
                                style={{ width: `${Math.min(100, item.totalPct * 3.5)}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isHighRisk ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                Over-Concentrated
                              </span>
                            ) : isModerateRisk ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Moderate
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Balanced
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: SMART MONEY & SECTOR FLOW RADAR (Spec v1.1) */}
      {activeSubTab === 'SMART_MONEY' && (
        <div className="space-y-6">
          {/* Header Controls & Multi-Timeframe Switcher */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-purple-950/20 to-slate-950 border border-purple-900/40 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
                    INSTITUTIONAL LIQUIDITY TRACKER
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">≥ 30-min Real-Time Cadence</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                  Smart Money Flow & Sector Accumulation Radar
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
                  Tracks institutional block deals, delivery volume surge ratios, rolling VWAP accumulation, and F&O OI build-up across sectors and top scrips.
                </p>
              </div>

              {/* 7 Multi-Timeframe Switcher Buttons */}
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-inner overflow-x-auto max-w-full">
                {(['1D', '3D', '1W', '15D', '3W', '1M', '3M'] as SmartMoneyTimeframe[]).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setSmartMoneyTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      smartMoneyTimeframe === tf
                        ? 'bg-purple-600 text-white shadow-md ring-1 ring-purple-400/50'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {tf === '1D' ? '1 Day' : tf === '3D' ? '3 Days' : tf === '1W' ? '1 Week' : tf === '15D' ? '15 Days' : tf === '3W' ? '3 Weeks' : tf === '1M' ? '1 Month' : '3 Months'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sector Smart Money Heatmap Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Sector-Level Institutional Net Inflows & Outflows ({smartMoneyTimeframe} Window)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {sectorFlows.length} Sectors Analyzed
              </span>
            </div>

            {smartMoneyLoading ? (
              <div className="p-12 text-center text-slate-400 rounded-3xl bg-slate-900/60 border border-slate-800">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 text-purple-400 animate-spin" />
                <p className="text-xs font-medium">Computing Multi-Timeframe Sector Smart Money Net Flows...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sectorFlows.map(sec => {
                  const isInflow = sec.netFlowCr >= 0;
                  const isStrong = Math.abs(sec.netFlowCr) > 100 || sec.averageSmas >= 70;

                  return (
                    <div
                      key={sec.sector}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                        sec.flowDirection === 'STRONG_INFLOW'
                          ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-500 shadow-sm shadow-emerald-950/40'
                          : sec.flowDirection === 'MODERATE_INFLOW'
                          ? 'bg-emerald-950/10 border-emerald-800/30 hover:border-emerald-700'
                          : sec.flowDirection === 'HEAVY_OUTFLOW'
                          ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500 shadow-sm shadow-rose-950/40'
                          : sec.flowDirection === 'MODERATE_OUTFLOW'
                          ? 'bg-rose-950/10 border-rose-800/30 hover:border-rose-700'
                          : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* Top: Sector & Badge */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h5 className="font-bold text-sm text-white truncate" title={sec.sector}>
                            {sec.sector}
                          </h5>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                              isInflow ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {sec.flowDirection.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Net Flow & SMAS Score */}
                        <div className="grid grid-cols-2 gap-2 my-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Net Inst. Flow</span>
                            <span className={`text-sm font-mono font-black ${isInflow ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isInflow ? `+₹${sec.netFlowCr} Cr` : `₹${sec.netFlowCr} Cr`}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-medium">Avg SMAS Score</span>
                            <span className="text-sm font-mono font-black text-purple-300">
                              {sec.averageSmas}<span className="text-[10px] text-slate-500">/100</span>
                            </span>
                          </div>
                        </div>

                        {/* Accumulation Breadth Progress Bar */}
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>Acc. Breadth: {sec.accumulationBreadthPct}%</span>
                            <span>Dist: {sec.distributionBreadthPct}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${sec.accumulationBreadthPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${sec.distributionBreadthPct}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Top Inflow Stocks */}
                      {sec.topInflowStocks && sec.topInflowStocks.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/60 text-[11px]">
                          <span className="text-[10px] text-slate-500 block mb-1">Top Accumulating Scrips:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {sec.topInflowStocks.map((stk: any) => (
                              <button
                                key={stk.symbol}
                                onClick={() => openTradingViewModal(stk.symbol)}
                                className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/60 text-slate-200 hover:text-purple-300 text-[10px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <span>{stk.symbol}</span>
                                <span className="text-emerald-400 font-bold">{stk.smas}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Accumulation & Distribution Stocks Radar */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold font-display text-white">
                  Top Smart Money Accumulation & Distribution Stocks ({smartMoneyTimeframe})
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click any stock to launch its interactive TradingView Chart and Calibrated Reasoning Trace.
                </p>
              </div>

              {/* Search & Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search scrip, sector, buyer..."
                    value={smartMoneyStockSearch}
                    onChange={(e) => setSmartMoneyStockSearch(e.target.value)}
                    className="pl-8 pr-7 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-44 sm:w-56 transition"
                  />
                  {smartMoneyStockSearch && (
                    <button
                      onClick={() => setSmartMoneyStockSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setSmartMoneyFilter('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      smartMoneyFilter === 'ALL' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Scrips
                  </button>
                  <button
                    onClick={() => setSmartMoneyFilter('ACCUMULATION')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      smartMoneyFilter === 'ACCUMULATION' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Top Accumulation
                  </button>
                  <button
                    onClick={() => setSmartMoneyFilter('DISTRIBUTION')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      smartMoneyFilter === 'DISTRIBUTION' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Top Distribution
                  </button>
                </div>
              </div>
            </div>

            {/* Stocks Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    {renderHubSortHeader('Scrip & Sector', 'symbol', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'left')}
                    {renderHubSortHeader('Big Institutional Buyers', 'buyers', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'left')}
                    {renderHubSortHeader('CMP (₹)', 'cmp', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'right')}
                    {renderHubSortHeader('SMAS Score', 'smasScore', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'center')}
                    {renderHubSortHeader('Classification', 'classification', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'center')}
                    {renderHubSortHeader('Net Flow (Cr)', 'netFlow', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'right')}
                    {renderHubSortHeader('Delivery Surge', 'delivery', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'right')}
                    {renderHubSortHeader('VWAP Bias', 'vwap', smartMoneySortField, smartMoneySortDir, (f) => handleHubSortToggle(smartMoneySortField, smartMoneySortDir, f, setSmartMoneySortField, setSmartMoneySortDir), 'right')}
                    <th className="py-3 px-4 text-center">Interactive Chart & Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(() => {
                    let list = [
                      ...smartStocks.topAccumulation,
                      ...smartStocks.topDistribution
                    ];
                    if (smartMoneyFilter === 'ACCUMULATION') list = smartStocks.topAccumulation;
                    if (smartMoneyFilter === 'DISTRIBUTION') list = smartStocks.topDistribution;

                    if (smartMoneyStockSearch.trim()) {
                      const q = smartMoneyStockSearch.toLowerCase().trim();
                      list = list.filter((stk: any) => {
                        const sym = (stk.symbol || '').toLowerCase();
                        const comp = (stk.companyName || '').toLowerCase();
                        const sec = (stk.sector || '').toLowerCase();
                        const buyers = Array.isArray(stk.topBuyers) ? stk.topBuyers.map((b: any) => (b.buyerName || '').toLowerCase()).join(' ') : '';
                        return sym.includes(q) || comp.includes(q) || sec.includes(q) || buyers.includes(q);
                      });
                    }

                    list.sort((a: any, b: any) => {
                      let aVal: any = 0;
                      let bVal: any = 0;
                      if (smartMoneySortField === 'symbol') {
                        aVal = a.symbol || '';
                        bVal = b.symbol || '';
                        return smartMoneySortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                      } else if (smartMoneySortField === 'cmp') {
                        aVal = a.cmp || 0;
                        bVal = b.cmp || 0;
                      } else if (smartMoneySortField === 'smasScore') {
                        aVal = a.smasScore || 0;
                        bVal = b.smasScore || 0;
                      } else if (smartMoneySortField === 'classification') {
                        aVal = a.classification || '';
                        bVal = b.classification || '';
                        return smartMoneySortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                      } else if (smartMoneySortField === 'netFlow') {
                        aVal = a.netInstitutionalFlowCr || 0;
                        bVal = b.netInstitutionalFlowCr || 0;
                      } else if (smartMoneySortField === 'delivery') {
                        aVal = a.deliverySurgeRatio || 0;
                        bVal = b.deliverySurgeRatio || 0;
                      } else if (smartMoneySortField === 'vwap') {
                        aVal = a.vwapDivergencePct || 0;
                        bVal = b.vwapDivergencePct || 0;
                      } else if (smartMoneySortField === 'buyers') {
                        aVal = a.topBuyers?.[0]?.netBoughtCr || 0;
                        bVal = b.topBuyers?.[0]?.netBoughtCr || 0;
                      }
                      return smartMoneySortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                    });

                    if (list.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400 font-sans">
                            {smartMoneyStockSearch ? `No scrips matching "${smartMoneyStockSearch}".` : 'No smart money stock anomalies detected for selected timeframe.'}
                          </td>
                        </tr>
                      );
                    }

                    return list.slice(0, 40).map((stk: any) => {
                      const isAcc = stk.classification === 'SUSTAINED_ACCUMULATION' || stk.classification === 'EARLY_ACCUMULATION';
                      const isDist = stk.classification === 'AGGRESSIVE_DISTRIBUTION' || stk.classification === 'EARLY_DISTRIBUTION';
                      const buyers = stk.topBuyers || [];
                      const isBuyersExpanded = expandedStockBuyersSymbol === stk.symbol;

                      return (
                        <React.Fragment key={`${stk.symbol}_${stk.timeframe}`}>
                          <tr className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-sans font-bold text-white">
                              <div
                                onClick={() => openTradingViewModal(stk.symbol)}
                                className="cursor-pointer hover:text-purple-400 transition-colors"
                              >
                                <span>{stk.companyName || stk.symbol}</span>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {stk.symbol} · {stk.sector}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {buyers.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {buyers.slice(0, 2).map((b: any, bIdx: number) => {
                                      const isMf = b.buyerCategory === 'DOMESTIC_MUTUAL_FUND';
                                      const isFpi = b.buyerCategory === 'FOREIGN_PORTFOLIO_INVESTOR';
                                      return (
                                        <span
                                          key={bIdx}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                                            isMf
                                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                              : isFpi
                                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                          }`}
                                          title={`${b.buyerName} (${b.buyerCategory}) bought ₹${b.netBoughtCr}Cr`}
                                        >
                                          <span className="truncate max-w-[100px]">{b.buyerName}</span>
                                          <span className="text-emerald-400 font-extrabold">+₹{b.netBoughtCr}Cr</span>
                                        </span>
                                      );
                                    })}
                                    {buyers.length > 2 && (
                                      <button
                                        onClick={() => setExpandedStockBuyersSymbol(isBuyersExpanded ? null : stk.symbol)}
                                        className="text-[10px] font-mono text-purple-400 hover:text-purple-300 underline cursor-pointer"
                                      >
                                        +{buyers.length - 2} more
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setExpandedStockBuyersSymbol(isBuyersExpanded ? null : stk.symbol)}
                                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-purple-300 transition cursor-pointer font-mono"
                                    >
                                      <ChevronRight className={`w-3 h-3 transition-transform ${isBuyersExpanded ? 'rotate-90 text-purple-400' : ''}`} />
                                      <span>{isBuyersExpanded ? 'Hide Ledger' : `All ${buyers.length} Buyers Ledger`}</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-mono italic">
                                  Scanning SAST / Bulk Deploys...
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white">
                              ₹{stk.cmp?.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-lg font-bold ${
                                isAcc ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : isDist ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-700/30 text-slate-300'
                              }`}>
                                {stk.smasScore}/100
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              <span className={`text-[10px] font-bold ${isAcc ? 'text-emerald-400' : isDist ? 'text-rose-400' : 'text-slate-400'}`}>
                                {stk.classification?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-bold">
                              <span className={stk.netInstitutionalFlowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {stk.netInstitutionalFlowCr >= 0 ? `+₹${stk.netInstitutionalFlowCr}Cr` : `₹${stk.netInstitutionalFlowCr}Cr`}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              {stk.deliverySurgeRatio}x ({stk.deliveryPct}%)
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={stk.vwapDivergencePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {stk.vwapDivergencePct >= 0 ? `+${stk.vwapDivergencePct}%` : `${stk.vwapDivergencePct}%`}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => openTradingViewModal(stk.symbol)}
                                className="px-3 py-1 rounded-xl bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 mx-auto"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Analyze Chart</span>
                              </button>
                            </td>
                          </tr>

                          {/* Expandable Accordion Ledger for All Big Institutional Buyers */}
                          {isBuyersExpanded && buyers.length > 0 && (
                            <tr className="bg-slate-950/90 border-b border-purple-500/30 animate-fadeIn">
                              <td colSpan={9} className="p-4 pl-8">
                                <div className="p-4 rounded-2xl bg-slate-900 border border-purple-500/30 space-y-3 shadow-inner">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase border border-purple-500/40">
                                        Verified Exchange Disclosures (SEBI SAST / AMFI)
                                      </span>
                                      <h5 className="text-xs font-bold text-white">
                                        All Big Institutional Buyers in {stk.symbol} ({buyers.length} Disclosed)
                                      </h5>
                                    </div>
                                    <button
                                      onClick={() => setExpandedStockBuyersSymbol(null)}
                                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                                    >
                                      Close ✕
                                    </button>
                                  </div>

                                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                                    <table className="w-full text-xs text-left border-collapse font-mono">
                                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                                        <tr>
                                          <th className="py-2 px-3 font-sans">Institutional Buyer</th>
                                          <th className="py-2 px-3 font-sans">Category</th>
                                          <th className="py-2 px-3 text-right">Net Bought</th>
                                          <th className="py-2 px-3 text-right">Shares Bought</th>
                                          <th className="py-2 px-3 text-right">Stake Change</th>
                                          <th className="py-2 px-3 text-right">Avg Entry</th>
                                          <th className="py-2 px-3 text-center">Deal Type</th>
                                          <th className="py-2 px-3 text-right font-sans">Filing Ref</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-850">
                                        {buyers.map((b: any, bIdx: number) => (
                                          <tr key={bIdx} className="hover:bg-slate-800/40 transition">
                                            <td className="py-2 px-3 font-bold text-white font-sans">
                                              {b.buyerName}
                                            </td>
                                            <td className="py-2 px-3">
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                b.buyerCategory === 'DOMESTIC_MUTUAL_FUND'
                                                  ? 'bg-blue-500/20 text-blue-300'
                                                  : b.buyerCategory === 'FOREIGN_PORTFOLIO_INVESTOR'
                                                  ? 'bg-purple-500/20 text-purple-300'
                                                  : 'bg-emerald-500/20 text-emerald-300'
                                              }`}>
                                                {String(b.buyerCategory).replace(/_/g, ' ')}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                              +₹{b.netBoughtCr} Cr
                                            </td>
                                            <td className="py-2 px-3 text-right text-slate-300">
                                              {b.sharesBought?.toLocaleString('en-IN') || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-purple-300">
                                              +{b.stakeChangePct}%
                                            </td>
                                            <td className="py-2 px-3 text-right text-slate-300">
                                              ₹{b.avgAccumulationPrice?.toLocaleString('en-IN') || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[9px] text-slate-300">
                                                {String(b.dealType || 'BLOCK_DEAL').replace(/_/g, ' ')}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 text-right text-[10px] text-slate-400">
                                              {b.filingReference || 'EXCHANGE_FEED'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TRADINGVIEW & REASONING TRACE MODAL ─────────────────────────────── */}
      {tvModalSymbol && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                    <span>{tvModalSymbol} — Interactive Chart & Reasoning</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                      TradingView Pro
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live technical momentum, support/resistance levels, and multi-timeframe smart money trace.
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setTvModalSymbol(null); setTvMomentumReport(null); }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-sm font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* TradingView Chart */}
            <TradingViewChartWidget
              symbol={tvModalSymbol}
              height={440}
              interval="D"
              supportPrice={tvMomentumReport?.supportResistance?.nearestSupport?.price}
              resistancePrice={tvMomentumReport?.supportResistance?.nearestResistance?.price}
              momentumScore={tvMomentumReport?.momentumScore}
              momentumLevel={tvMomentumReport?.momentumLevel}
              smasScore={tvMomentumReport?.smartMoney?.consensusScore}
            />

            {/* Momentum & Reasoning Engine Panel */}
            {tvLoading ? (
              <div className="p-8 text-center text-slate-400 rounded-2xl bg-slate-950/60 border border-slate-800">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 text-blue-400 animate-spin" />
                <p className="text-xs font-medium">Assembling 6-Component Momentum Breakdown & Reasoning Trace...</p>
              </div>
            ) : tvMomentumReport ? (
              <MomentumReasoningPanel report={tvMomentumReport} symbol={tvModalSymbol} />
            ) : null}
          </div>
        </div>
      )}

      {/* SUB-TAB 6: FULLY AUTONOMOUS SMART MONEY SENTINEL */}
      {activeSubTab === 'AUTONOMOUS_SENTINEL' && (
        <AutonomousSmartMoneySentinelView />
      )}
    </div>
  );
}
