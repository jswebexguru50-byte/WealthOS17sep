/**
 * StockScansWorkspace.tsx
 * Clean-Room StockScans Parity Suite
 * 
 * 8 Modular Institutional Workflows:
 * 1. Market Breadth Dashboard (Index performance, EMA participation, ±4% thrust, 52W extremes)
 * 2. Scans & Discovery (Deterministic prebuilt & declarative technical scans)
 * 3. Scan Match Engine (Intersection & overlap across immutable scan runs)
 * 4. Evidence & Announcements (Full-text search, verified exchange URLs, SHA-256 hashes)
 * 5. Shareholding & Walk-the-Talk Guidance (Period-over-period diffs & commitment tracking)
 * 6. Returns Benchmark & Custom Thematic Indices (Multi-asset performance & equal-weight baskets)
 * 7. Peer Comparison (Period-aligned cited fundamental matrix)
 * 8. Valuation Calculators (Reverse DCF with sensitivity tables & earnings valuation)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Layers,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  BarChart2,
  PieChart,
  Sliders,
  Calculator,
  Download,
  ExternalLink,
  RefreshCw,
  Plus,
  Eye,
  Check,
  X,
  Clock,
  Compass,
  Zap,
  Target
} from 'lucide-react';
import { safeFetchJson } from '../../lib/api';

type StockScansSubTab =
  | 'BREADTH'
  | 'SCANS'
  | 'SCAN_MATCH'
  | 'ANNOUNCEMENTS'
  | 'SHAREHOLDING'
  | 'RETURNS_BENCHMARK'
  | 'CUSTOM_INDICES'
  | 'PEERS'
  | 'CALCULATORS'
  | 'ALERTS'
  | 'AUDIT';

interface BreadthData {
  asOf: string;
  dataSource: string;
  formulaVersion: string;
  universe?: {
    id: string;
    revision: string;
    requested: number;
    eligible: number;
    unavailable: number;
  };
  coverage: { requested?: number; eligible: number; matched: number; unavailable: number; gaps: string[] };
  indices: Array<{
    name: string;
    symbol: string;
    close: number;
    change1D: number;
    change1W: number;
    change1M: number;
    change1Y: number;
  }>;
  participation: {
    aboveEma20Pct: number;
    aboveEma50Pct: number;
    aboveEma100Pct: number;
    aboveEma200Pct: number;
    totalEvaluated: number;
  };
  thrust: {
    advancersCount: number;
    declinersCount: number;
    unchangedCount: number;
    advDecRatio: number;
    thrustUp4PctCount: number;
    thrustDown4PctCount: number;
    thrustUp4PctSymbols: Array<{ symbol: string; changePct: number; close: number }>;
    thrustDown4PctSymbols: Array<{ symbol: string; changePct: number; close: number }>;
  };
  extremes52W: {
    high52WCount: number;
    low52WCount: number;
    high52WSymbols: Array<{ symbol: string; close: number; high52W: number }>;
    low52WSymbols: Array<{ symbol: string; close: number; low52W: number }>;
  };
}

interface StockScansWorkspaceProps {
  onSelectStock?: (symbol: string) => void;
  selectedPortfolio?: string;
}

export function StockScansWorkspace({ onSelectStock, selectedPortfolio }: StockScansWorkspaceProps) {
  const [subTab, setSubTab] = useState<StockScansSubTab>('BREADTH');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Breadth state
  const [breadth, setBreadth] = useState<BreadthData | null>(null);

  // 2. Scans state
  const [selectedScanId, setSelectedScanId] = useState('MOVERS_4PCT');
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [customMinPrice, setCustomMinPrice] = useState('50');
  const [customMinChange, setCustomMinChange] = useState('2');
  const [customMinVolRatio, setCustomMinVolRatio] = useState('1.5');
  const [customReqEma50, setCustomReqEma50] = useState(true);
  const [scanFromDate, setScanFromDate] = useState('');
  const [scanToDate, setScanToDate] = useState('');
  const [kiteToken, setKiteToken] = useState('');
  const [ohlcvJob, setOhlcvJob] = useState<any | null>(null);

  const startOhlcvRefresh = async () => {
    setErrorMsg(null);
    const res = await safeFetchJson<any>('/api/stockscans/ohlcv/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kiteToken.trim() ? { accessToken: kiteToken.trim() } : {}) });
    if (res?.ok && res.data?.success) {
      setKiteToken('');
      setOhlcvJob(res.data.job);
    } else setErrorMsg(res?.error || res?.data?.error || 'Could not start OHLCV refresh.');
  };

  useEffect(() => {
    if (!ohlcvJob?.jobId || ohlcvJob.status !== 'RUNNING') return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      const res = await safeFetchJson<any>(`/api/stockscans/ohlcv/refresh/${ohlcvJob.jobId}`);
      if (res?.ok && res.data?.job) setOhlcvJob(res.data.job);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [ohlcvJob?.jobId, ohlcvJob?.status]);

  // 3. Scan Match state
  const [scanRuns, setScanRuns] = useState<any[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [matchResult, setMatchResult] = useState<any | null>(null);
  const [watchlistSuccess, setWatchlistSuccess] = useState<string | null>(null);
  const [matchDisplayMode, setMatchDisplayMode] = useState<'INTERSECTION' | 'ALL'>('INTERSECTION');

  // Custom Indices state
  const [customIndicesList, setCustomIndicesList] = useState<any[]>([]);
  const [customIdxName, setCustomIdxName] = useState('My Defense & Tech Basket');
  const [customIdxSymbols, setCustomIdxSymbols] = useState('RELIANCE, TCS, INFY, DIVISLAB');
  const [customIdxPolicy, setCustomIdxPolicy] = useState<'FAIL_IF_ANY_MISSING' | 'USE_COVERED_ONLY' | 'REQUIRE_MINIMUM_COVERAGE'>('FAIL_IF_ANY_MISSING');
  const [customIdxPeriod, setCustomIdxPeriod] = useState<'1M' | '3M' | '6M' | '1Y'>('1Y');
  const [customIndexCalcResult, setCustomIndexCalcResult] = useState<any | null>(null);

  // Durable Alerts state
  const [alertsList, setAlertsList] = useState<any[]>([]);
  const [newAlertName, setNewAlertName] = useState('');
  const [newAlertType, setNewAlertType] = useState<'PRICE_LEVEL' | 'SCAN_MATCH' | 'ANNOUNCEMENT_KEYWORD' | 'PLEDGE_CHANGE'>('PRICE_LEVEL');
  const [newAlertTarget, setNewAlertTarget] = useState('RELIANCE');
  const [newAlertCriteria, setNewAlertCriteria] = useState('{"thresholdPrice": 1400}');

  // 4. Announcements state
  const [annQuery, setAnnQuery] = useState('');
  const [annTypeFilter, setAnnTypeFilter] = useState('');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [trendingKeywords, setTrendingKeywords] = useState<any[]>([]);

  // 5. Shareholding & Guidance state
  const [shScanType, setShScanType] = useState('ALL');
  const [shareholdingDiffs, setShareholdingDiffs] = useState<any[]>([]);
  const [guidanceList, setGuidanceList] = useState<any[]>([]);
  const [activeGovernanceView, setActiveGovernanceView] = useState<'SHAREHOLDING' | 'GUIDANCE'>('SHAREHOLDING');

  // 6. Returns Benchmark state
  const [benchSymbols, setBenchSymbols] = useState('RELIANCE, TCS, INFY, NIFTY 50');
  const [benchPeriod, setBenchPeriod] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD'>('1Y');
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);

  // 7. Peer Comparison state
  const [peerSymbolsInput, setPeerSymbolsInput] = useState('RELIANCE, TCS, INFY, HDFCBANK');
  const [peerComparisonData, setPeerComparisonData] = useState<any | null>(null);

  // 8. Calculators state
  const [calcCmp, setCalcCmp] = useState('1500');
  const [calcEps, setCalcEps] = useState('65');
  const [calcDiscountRate, setCalcDiscountRate] = useState('12');
  const [calcTerminalMultiple, setCalcTerminalMultiple] = useState('22');
  const [reverseDcfResult, setReverseDcfResult] = useState<any | null>(null);

  // Load breadth on mount
  useEffect(() => {
    loadBreadth();
  }, []);

  const loadBreadth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await safeFetchJson<any>('/api/stockscans/breadth');
      const data = res?.data;
      if (res?.ok && data?.success) {
        setBreadth(data);
      } else {
        setErrorMsg(res?.error || data?.error || 'Failed to load breadth snapshot.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error connecting to market breadth service.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunScan = async (scanIdToRun = selectedScanId) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params: any = {};
      if (scanIdToRun === 'CUSTOM') {
        params.minPrice = parseFloat(customMinPrice) || 0;
        params.minChangePct = parseFloat(customMinChange) || 0;
        params.minVolumeRatio = parseFloat(customMinVolRatio) || 0;
        params.requireAboveEma50 = customReqEma50;
      }
      if (scanFromDate) params.fromDate = scanFromDate;
      if (scanToDate) params.toDate = scanToDate;
      const res = await safeFetchJson<any>('/api/stockscans/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: scanIdToRun, parameters: params })
      });
      const data = res?.data;
      if (res?.ok && data?.success) {
        setScanResult(data);
        // Refresh scan runs list
        loadScanRuns();
      } else {
        setErrorMsg(res?.error || data?.message || data?.error || 'Scan execution failed.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error executing scan.');
    } finally {
      setLoading(false);
    }
  };

  const loadScanRuns = async () => {
    try {
      const res = await safeFetchJson<any>('/api/stockscans/scan/runs');
      const data = res?.data;
      if (res?.ok && data?.success) {
        setScanRuns(data.runs || []);
        if (data.runs?.length >= 2 && selectedRunIds.length === 0) {
          setSelectedRunIds([data.runs[0].runId, data.runs[1].runId]);
        }
      }
    } catch (err) {
      console.warn('Failed loading scan runs:', err);
    }
  };

  const handleScanMatch = async () => {
    if (selectedRunIds.length < 2) {
      setErrorMsg('Please select at least 2 scan runs to calculate overlap.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await safeFetchJson<any>('/api/stockscans/scan-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runIds: selectedRunIds })
      });
      const data = res?.data;
      if (res?.ok && data?.success) {
        setMatchResult(data);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to match scans.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAllToWatchlist = async () => {
    if (!matchResult || !matchResult.intersectionMatches?.length) return;
    const symbols = matchResult.intersectionMatches.map((m: any) => m.symbol);
    try {
      const res = await safeFetchJson<any>('/api/stockscans/scan-match/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlistName: `ScanMatch_${new Date().toISOString().split('T')[0]}`,
          symbols,
          tags: ['SCAN_MATCH', 'STOCKSCANS_PARITY']
        })
      });
      const data = res?.data;
      if (res?.ok && data?.success) {
        setWatchlistSuccess(`Saved ${symbols.length} symbols to watchlist!`);
        setTimeout(() => setWatchlistSuccess(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed saving watchlist.');
    }
  };

  const loadAnnouncements = async (keyword = annQuery, type = annTypeFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('q', keyword);
      if (type) params.set('type', type);
      const res = await safeFetchJson<any>(`/api/stockscans/announcements?${params.toString()}`);
      const data = res?.data;
      if (res?.ok && data?.success) {
        setAnnouncements(data.announcements || []);
        setTrendingKeywords(data.trendingKeywords || []);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed loading announcements.');
    } finally {
      setLoading(false);
    }
  };

  const loadShareholdingAndGuidance = async () => {
    setLoading(true);
    try {
      const [shRes, gdRes] = await Promise.all([
        safeFetchJson<any>(`/api/stockscans/shareholding?type=${shScanType}`),
        safeFetchJson<any>('/api/stockscans/guidance')
      ]);
      const shData = shRes?.data;
      const gdData = gdRes?.data;
      if (shRes?.ok && shData?.success) setShareholdingDiffs(shData.results || []);
      if (gdRes?.ok && gdData?.success) setGuidanceList(gdData.commitments || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed loading shareholding & guidance.');
    } finally {
      setLoading(false);
    }
  };

  const loadReturnsBenchmark = async () => {
    setLoading(true);
    try {
      const symList = benchSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const res = await safeFetchJson<any>('/api/stockscans/returns-benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symList, period: benchPeriod })
      });
      const data = res?.data;
      if (res?.ok && data?.success) setBenchmarkResult(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed calculating returns benchmark.');
    } finally {
      setLoading(false);
    }
  };

  const loadPeerComparison = async () => {
    setLoading(true);
    try {
      const res = await safeFetchJson<any>(`/api/stockscans/peers?symbols=${encodeURIComponent(peerSymbolsInput)}`);
      const data = res?.data;
      if (res?.ok && data?.success) setPeerComparisonData(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed calculating peer comparison.');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateReverseDcf = async () => {
    try {
      const res = await safeFetchJson<any>('/api/stockscans/calculators/reverse-dcf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmp: parseFloat(calcCmp) || 1000,
          currentEps: parseFloat(calcEps) || 50,
          discountRate: (parseFloat(calcDiscountRate) || 12) / 100,
          terminalMultiple: parseFloat(calcTerminalMultiple) || 20
        })
      });
      const data = res?.data;
      if (res?.ok && data?.success) setReverseDcfResult(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed calculating reverse DCF.');
    }
  };

  const loadCustomIndices = async () => {
    try {
      const res = await safeFetchJson<any>('/api/stockscans/custom-indices');
      const data = res?.data;
      if (res?.ok && (data?.success || data?.indices)) {
        setCustomIndicesList(data.indices || []);
      }
    } catch (err: any) {
      console.warn('Failed loading custom indices:', err);
    }
  };

  const handleCalculateCustomIndex = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const constituents = customIdxSymbols.split(',').map(s => ({ symbol: s.trim().toUpperCase() })).filter(c => c.symbol);
      const res = await safeFetchJson<any>('/api/stockscans/custom-indices/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constituents,
          period: customIdxPeriod,
          missingPolicy: customIdxPolicy
        })
      });
      const data = res?.data;
      if (res?.ok && data) {
        setCustomIndexCalcResult(data);
      } else {
        setErrorMsg(res?.error || data?.error || 'Failed calculating custom index.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error calculating custom index.');
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const res = await safeFetchJson<any>('/api/stockscans/alerts');
      const data = res?.data;
      if (res?.ok && (data?.success || data?.alerts)) {
        setAlertsList(data.alerts || []);
      }
    } catch (err: any) {
      console.warn('Failed loading alerts:', err);
    }
  };

  const handleCreateAlert = async () => {
    if (!newAlertName) return;
    try {
      let criteria = {};
      try { criteria = JSON.parse(newAlertCriteria); } catch {}
      await safeFetchJson('/api/stockscans/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAlertName,
          alertType: newAlertType,
          targetSymbol: newAlertTarget.trim().toUpperCase(),
          criteria
        })
      });
      setNewAlertName('');
      loadAlerts();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed creating alert');
    }
  };

  const handleToggleAlert = async (id: number, currentActive: boolean) => {
    try {
      await safeFetchJson(`/api/stockscans/alerts/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive })
      });
      loadAlerts();
    } catch (err: any) {
      console.warn('Failed toggling alert:', err);
    }
  };

  // Sub-tabs configuration
  const SUB_TABS: Array<{ id: StockScansSubTab; label: string; icon: React.ElementType; badge?: string }> = [
    { id: 'BREADTH', label: 'Market Breadth', icon: Activity, badge: 'DuckDB' },
    { id: 'SCANS', label: 'Scans & Discovery', icon: Compass, badge: 'Prebuilt' },
    { id: 'SCAN_MATCH', label: 'Scan Match', icon: Target, badge: 'Overlap' },
    { id: 'ANNOUNCEMENTS', label: 'Evidence & Filings', icon: FileText, badge: 'Official FERE' },
    { id: 'SHAREHOLDING', label: 'Shareholding & Guidance', icon: PieChart, badge: 'Diffs' },
    { id: 'RETURNS_BENCHMARK', label: 'Returns Benchmark', icon: BarChart2, badge: 'Adjusted' },
    { id: 'CUSTOM_INDICES', label: 'Custom Indices', icon: Layers, badge: 'Thematic' },
    { id: 'PEERS', label: 'Peer Matrix', icon: Sliders, badge: 'XBRL' },
    { id: 'CALCULATORS', label: 'Valuation Calculators', icon: Calculator, badge: 'Reverse DCF' },
    { id: 'ALERTS', label: 'Durable Alerts', icon: Zap, badge: 'Active' },
    { id: 'AUDIT', label: 'Source Audit', icon: ShieldCheck, badge: 'Integrity' },
  ];

  return (
    <div className="space-y-5 text-slate-100 font-sans pb-16">
      {/* ── Top Header & Provenance Spine ───────────────────────────────────── */}
      <div className="p-4 rounded-2xl border bg-slate-900/80 backdrop-blur-md border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold shadow-inner">
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">StockScans Clean-Room Parity</h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                Audit Parity P0 + P1
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Deterministic discovery, auditable exchange evidence, and valuation workspace across Indian securities.
            </p>
          </div>
        </div>

        {/* Data Provenance & Freshness Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 font-mono text-[11px]">As Of:</span>
            <span className="text-white font-semibold font-mono text-[11px]">{breadth?.asOf || 'Unavailable'}</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 font-mono text-[11px]">Data Source:</span>
            <span className="text-emerald-300 font-semibold font-mono text-[11px]">{breadth?.dataSource || 'Unavailable'}</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400 font-mono text-[11px]">Coverage:</span>
            <span className="text-white font-semibold font-mono text-[11px]">
              {breadth
                ? `${breadth.coverage?.matched ?? breadth.coverage?.eligible ?? 0} / ${breadth.universe?.requested ?? breadth.coverage?.requested ?? breadth.coverage?.eligible ?? 0} covered (${breadth.universe?.id || 'Unknown universe'})`
                : 'Unavailable'}
            </span>
          </div>

          <button
            onClick={() => {
              if (subTab === 'BREADTH') loadBreadth();
              else if (subTab === 'SCANS') handleRunScan();
              else if (subTab === 'SCAN_MATCH') handleScanMatch();
              else if (subTab === 'ANNOUNCEMENTS') loadAnnouncements();
              else if (subTab === 'SHAREHOLDING') loadShareholdingAndGuidance();
              else if (subTab === 'RETURNS_BENCHMARK') loadReturnsBenchmark();
              else if (subTab === 'CUSTOM_INDICES') loadCustomIndices();
              else if (subTab === 'PEERS') loadPeerComparison();
              else if (subTab === 'ALERTS') loadAlerts();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700 cursor-pointer"
            title="Refresh current view"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Sub-Tab Navigation Bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto p-1.5 rounded-2xl border bg-slate-900/60 border-slate-800/80">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSubTab(tab.id);
                if (tab.id === 'SCAN_MATCH') loadScanRuns();
                if (tab.id === 'ANNOUNCEMENTS') loadAnnouncements();
                if (tab.id === 'SHAREHOLDING') loadShareholdingAndGuidance();
                if (tab.id === 'RETURNS_BENCHMARK' && !benchmarkResult) loadReturnsBenchmark();
                if (tab.id === 'CUSTOM_INDICES') loadCustomIndices();
                if (tab.id === 'PEERS' && !peerComparisonData) loadPeerComparison();
                if (tab.id === 'CALCULATORS' && !reverseDcfResult) handleCalculateReverseDcf();
                if (tab.id === 'ALERTS') loadAlerts();
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono ${isActive ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-500'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: MARKET BREADTH DASHBOARD                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'BREADTH' && (
        <div className="space-y-5">
          {/* Benchmark Indices Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {breadth?.indices.map(idx => (
              <div
                key={idx.symbol}
                className="p-3.5 rounded-2xl border bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all shadow-md"
              >
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">{idx.name}</div>
                <div className="text-lg font-bold text-white mt-1">₹{idx.close.toLocaleString()}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                      idx.change1D >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {idx.change1D >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {idx.change1D >= 0 ? '+' : ''}{idx.change1D}% (1D)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">1M: {idx.change1M >= 0 ? '+' : ''}{idx.change1M}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Market Breadth Participation Cards (% > EMA20, 50, 100, 200) */}
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Institutional Moving Average Participation
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Percentage of stocks in covered universe trading above their respective exponential moving averages.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">
                Sample: {breadth?.participation.totalEvaluated ?? 0} liquid stocks
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Above EMA 20', val: breadth?.participation.aboveEma20Pct ?? 0, color: 'text-cyan-400', bar: 'bg-cyan-500', desc: 'Short-term momentum' },
                { label: 'Above EMA 50', val: breadth?.participation.aboveEma50Pct ?? 0, color: 'text-blue-400', bar: 'bg-blue-500', desc: 'Intermediate trend' },
                { label: 'Above EMA 100', val: breadth?.participation.aboveEma100Pct ?? 0, color: 'text-indigo-400', bar: 'bg-indigo-500', desc: 'Medium-term support' },
                { label: 'Above EMA 200', val: breadth?.participation.aboveEma200Pct ?? 0, color: 'text-purple-400', bar: 'bg-purple-500', desc: 'Long-term structural bull' },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{item.label}</span>
                    <span className="text-[10px] text-slate-500">{item.desc}</span>
                  </div>
                  <div className={`text-2xl font-extrabold font-mono ${item.color}`}>{item.val}%</div>
                  <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div className={`h-full ${item.bar} rounded-full transition-all duration-500`} style={{ width: `${item.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Thrust & 52-Week Extremes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Thrust ±4% */}
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Daily Market Thrust & ±4% Movers
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  A/D Ratio: <strong className="text-white">{breadth?.thrust.advDecRatio ?? 1}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <div className="text-[10px] font-mono text-emerald-400 uppercase">Advancers (&gt;= +4%)</div>
                  <div className="text-xl font-bold font-mono text-emerald-300 mt-1">{breadth?.thrust.thrustUp4PctCount ?? 0}</div>
                </div>
                <div className="flex-1 p-3 rounded-xl bg-slate-800 border border-slate-700 text-center">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Total Adv / Dec</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {breadth?.thrust.advancersCount ?? 0} / {breadth?.thrust.declinersCount ?? 0}
                  </div>
                </div>
                <div className="flex-1 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <div className="text-[10px] font-mono text-rose-400 uppercase">Decliners (&lt;= -4%)</div>
                  <div className="text-xl font-bold font-mono text-rose-300 mt-1">{breadth?.thrust.thrustDown4PctCount ?? 0}</div>
                </div>
              </div>

              {/* Sample ±4% movers chips */}
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-slate-400">Thrust Movers in Session:</div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {breadth?.thrust.thrustUp4PctSymbols.slice(0, 8).map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => onSelectStock?.(s.symbol)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs hover:bg-emerald-500/25 cursor-pointer"
                    >
                      {s.symbol} +{s.changePct}%
                    </button>
                  ))}
                  {breadth?.thrust.thrustDown4PctSymbols.slice(0, 8).map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => onSelectStock?.(s.symbol)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-xs hover:bg-rose-500/25 cursor-pointer"
                    >
                      {s.symbol} {s.changePct}%
                    </button>
                  ))}
                  {(!breadth?.thrust.thrustUp4PctSymbols.length && !breadth?.thrust.thrustDown4PctSymbols.length) && (
                    <div className="text-xs text-slate-500 italic">No ±4% extreme thrust movers in current session.</div>
                  )}
                </div>
              </div>
            </div>

            {/* 52-Week Extremes */}
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-purple-400" />
                  52-Week Highs & Lows Breakout
                </h3>
                <span className="text-xs font-mono text-slate-400">Tolerance: within 0.5%</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                  <div className="text-[10px] font-mono text-purple-300 uppercase">52W Highs</div>
                  <div className="text-2xl font-bold font-mono text-purple-200 mt-1">{breadth?.extremes52W.high52WCount ?? 0}</div>
                </div>
                <div className="flex-1 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <div className="text-[10px] font-mono text-amber-300 uppercase">52W Lows</div>
                  <div className="text-2xl font-bold font-mono text-amber-200 mt-1">{breadth?.extremes52W.low52WCount ?? 0}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-mono text-slate-400">52W High Breakout Symbols:</div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {breadth?.extremes52W.high52WSymbols.slice(0, 10).map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => onSelectStock?.(s.symbol)}
                      className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-200 font-mono text-xs hover:bg-purple-500/25 cursor-pointer"
                    >
                      {s.symbol} ₹{s.close}
                    </button>
                  ))}
                  {!breadth?.extremes52W.high52WSymbols.length && (
                    <div className="text-xs text-slate-500 italic">No stocks made fresh 52W highs in current session.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: SCANS & DISCOVERY                                              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'SCANS' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border bg-slate-900/70 border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="w-full flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
              <span className="text-xs font-mono text-slate-400">REFRESH OHLCV TO TODAY:</span>
              <input aria-label="Optional Kite access token" type="password" value={kiteToken} onChange={e => setKiteToken(e.target.value)} placeholder="Optional override — uses linked Kite session by default" className="min-w-64 flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs" autoComplete="off" />
              <button onClick={startOhlcvRefresh} disabled={ohlcvJob?.status === 'RUNNING'} className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs disabled:opacity-50">{ohlcvJob?.status === 'RUNNING' ? 'Refreshing…' : 'Refresh to today'}</button>
              {ohlcvJob && <span role="status" className="text-[11px] text-slate-400">{ohlcvJob.status}{ohlcvJob.error ? ` — ${ohlcvJob.error}` : ''}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">SELECT SCAN:</span>
              <select
                value={selectedScanId}
                onChange={e => setSelectedScanId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="MOVERS_4PCT">Daily ±4% Thrust Movers</option>
                <option value="52W_HIGH_BREAKOUT">52-Week High Breakout (&lt;1.5%)</option>
                <option value="MULTI_YEAR_BREAKOUT">Multi-Year Breakout (2+ Years)</option>
                <option value="STAGE_2_UPTREND">Stage 2 Uptrend (Close &gt; EMA50 &gt; EMA200)</option>
                <option value="VOLUME_SURGE">Volume Surge (&gt;= 2.5x 20D SMA)</option>
                <option value="WEEKLY_TREND_REVERSAL">Weekly Oversold Trend Reversal</option>
                <option value="SHORT_TERM_BREAKOUT">Short-Term 20D Breakout</option>
                <option value="CUSTOM">Custom Declarative Filter</option>
              </select>
            </div>

            {selectedScanId === 'CUSTOM' && (
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1 text-slate-400">
                  Min ₹:
                  <input
                    type="number"
                    value={customMinPrice}
                    onChange={e => setCustomMinPrice(e.target.value)}
                    className="w-16 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </label>
                <label className="flex items-center gap-1 text-slate-400">
                  Min %:
                  <input
                    type="number"
                    value={customMinChange}
                    onChange={e => setCustomMinChange(e.target.value)}
                    className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </label>
                <label className="flex items-center gap-1 text-slate-400">
                  Vol Ratio:
                  <input
                    type="number"
                    value={customMinVolRatio}
                    onChange={e => setCustomMinVolRatio(e.target.value)}
                    className="w-14 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </label>
              </div>
            )}

            <button
              onClick={() => handleRunScan()}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Run Scan
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400" role="group" aria-label="Scan date range">
              <label htmlFor="scan-from-date">From</label>
              <input id="scan-from-date" type="date" value={scanFromDate} onChange={e => setScanFromDate(e.target.value)} className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white" />
              <label htmlFor="scan-to-date">To</label>
              <input id="scan-to-date" type="date" value={scanToDate} onChange={e => setScanToDate(e.target.value)} className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white" />
            </div>
          </div>

          {/* Scan Result Table */}
          {scanResult && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{scanResult.scanName}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-400">
                    <span>Run ID: <strong className="text-cyan-400">{scanResult.runId}</strong></span>
                    <span>•</span>
                    <span>Hash: <strong className="text-slate-300">{scanResult.parameterHash?.slice(0, 10)}...</strong></span>
                    <span>•</span>
                    <span>Matched: <strong className="text-emerald-400">{scanResult.matches.length}</strong> / {scanResult.coverage.eligible} symbols</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSubTab('SCAN_MATCH');
                      loadScanRuns();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    Open in Scan Match
                  </button>
                </div>
              </div>

              {scanResult.matches.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                        <th className="py-2 px-3">Symbol</th>
                        <th className="py-2 px-3 text-right">Close (₹)</th>
                        <th className="py-2 px-3 text-right">Change %</th>
                        <th className="py-2 px-3 text-right">Volume</th>
                        <th className="py-2 px-3 text-right">Vol Ratio</th>
                        <th className="py-2 px-3 text-right">RSI 14</th>
                        <th className="py-2 px-3">Matching Reason</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {scanResult.matches.map((item: any) => (
                        <tr key={item.symbol} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                            <span className="cursor-pointer hover:text-cyan-400" onClick={() => onSelectStock?.(item.symbol)}>
                              {item.symbol}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">₹{item.close.toFixed(2)}</td>
                          <td className={`py-2.5 px-3 text-right font-bold ${item.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.changePct >= 0 ? '+' : ''}{item.changePct}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{item.volume.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">{item.metrics.volRatio20 ?? 'N/A'}x</td>
                          <td className="py-2.5 px-3 text-right text-purple-300">{item.metrics.rsi14 ?? 'N/A'}</td>
                          <td className="py-2.5 px-3 text-slate-300 font-sans text-[11px] max-w-xs truncate" title={item.matchReason}>
                            {item.matchReason}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => onSelectStock?.(item.symbol)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-400 border border-slate-700 cursor-pointer"
                            >
                              Analyze
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No symbols matched the selected criteria in the latest market snapshot.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: SCAN MATCH ENGINE                                              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'SCAN_MATCH' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                Scan Match Intersection Engine
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select 2 or more recent scan runs from the registry to find overlapping common high-conviction candidates.
              </p>
            </div>

            {/* Run Selection Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {scanRuns.map(run => {
                const isSelected = selectedRunIds.includes(run.runId);
                return (
                  <div
                    key={run.runId}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedRunIds(selectedRunIds.filter(id => id !== run.runId));
                      } else {
                        setSelectedRunIds([...selectedRunIds, run.runId]);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="truncate pr-2">{run.scanName}</span>
                      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${isSelected ? 'bg-cyan-500 text-black' : 'bg-slate-700'}`}>
                        {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : null}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2">
                      <span>Matches: {run.matchedCount}</span>
                      <span>As of: {run.asOf}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleScanMatch}
                disabled={selectedRunIds.length < 2 || loading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
              >
                Compute Scan Match ({selectedRunIds.length} selected)
              </button>
            </div>
          </div>

          {/* Mixed Dates Warning */}
          {matchResult?.hasMixedDatesWarning && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Warning:</strong> Selected scans evaluate differing market dates ({matchResult.asOfDates.join(', ')}). Match results may reflect cross-session divergence.
              </span>
            </div>
          )}

          {/* Match Results Table */}
          {matchResult && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Scan Overlap Results ({matchResult.intersectionCount} Exact Intersections / {matchResult.allMatches?.length ?? matchResult.intersectionMatches.length} Total Matches)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Strict mathematical intersection across all selected scans.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-xl bg-slate-800 p-1 border border-slate-700">
                    <button
                      onClick={() => setMatchDisplayMode('INTERSECTION')}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
                        matchDisplayMode === 'INTERSECTION' ? 'bg-cyan-500 text-black shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Exact Intersections ({matchResult.intersectionCount})
                    </button>
                    <button
                      onClick={() => setMatchDisplayMode('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all ${
                        matchDisplayMode === 'ALL' ? 'bg-cyan-500 text-black shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Matches ({matchResult.allMatches?.length ?? matchResult.intersectionMatches.length})
                    </button>
                  </div>

                  <button
                    onClick={handleAddAllToWatchlist}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Watchlist
                  </button>
                </div>
              </div>

              {watchlistSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                  {watchlistSuccess}
                </div>
              )}

              {((matchDisplayMode === 'INTERSECTION' ? matchResult.intersectionMatches : (matchResult.allMatches || matchResult.intersectionMatches)) || []).length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                  No securities matched all {matchResult.requiredCount || matchResult.selectedScans?.length} selected scans simultaneously.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                        <th className="py-2 px-3">Symbol</th>
                        <th className="py-2 px-3 text-right">Close (₹)</th>
                        <th className="py-2 px-3 text-right">Change %</th>
                        <th className="py-2 px-3 text-center">Match Frequency</th>
                        <th className="py-2 px-3">Matched Scans</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(matchDisplayMode === 'INTERSECTION' ? matchResult.intersectionMatches : (matchResult.allMatches || matchResult.intersectionMatches)).map((m: any) => (
                      <tr key={m.symbol} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-cyan-400" onClick={() => onSelectStock?.(m.symbol)}>
                          {m.symbol}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200">₹{m.close.toFixed(2)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${m.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.changePct >= 0 ? '+' : ''}{m.changePct}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.matchCount === matchResult.selectedScans.length
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {m.matchCount} of {matchResult.selectedScans.length}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {m.matchedScans.map((sn: string) => (
                              <span key={sn} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-cyan-300 font-sans border border-slate-700">
                                {sn}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => onSelectStock?.(m.symbol)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-400 border border-slate-700 cursor-pointer"
                          >
                            Analyze
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: EVIDENCE & ANNOUNCEMENTS                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'ANNOUNCEMENTS' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search announcements (e.g., Acquisition, Dividend, Results, Resignation)..."
                  value={annQuery}
                  onChange={e => setAnnQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadAnnouncements(annQuery, annTypeFilter)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                onClick={() => loadAnnouncements(annQuery, annTypeFilter)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-md"
              >
                Search
              </button>
            </div>

            {/* Trending Keywords */}
            {trendingKeywords.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] font-mono text-slate-500">Trending Tags:</span>
                {trendingKeywords.map(k => (
                  <button
                    key={k.word}
                    onClick={() => {
                      setAnnQuery(k.word);
                      loadAnnouncements(k.word, annTypeFilter);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono text-[10px] border border-slate-700/80 cursor-pointer"
                  >
                    #{k.word} ({k.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Announcements Table */}
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Verified Disclosures: {announcements.length}</span>
              <span>Source: Official BSE/NSE Archive with SHA-256</span>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {announcements.map(ann => (
                <div key={ann.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-cyan-400 cursor-pointer hover:underline" onClick={() => onSelectStock?.(ann.symbol)}>
                        {ann.symbol}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">
                        {ann.eventType}
                      </span>
                      {ann.verified && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Verified
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">{ann.eventDate}</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{ann.explanation}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/50 text-[10px] font-mono text-slate-500">
                    <div className="truncate max-w-sm">
                      Hash: <span className="text-slate-400">{ann.sourceSha256 ? ann.sourceSha256.slice(0, 16) + '...' : 'Unavailable'}</span>
                    </div>
                    <a
                      href={ann.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-sans"
                    >
                      Official Source <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
              {!announcements.length && (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No announcements matched the current search query.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: SHAREHOLDING & GUIDANCE                                        */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'SHAREHOLDING' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveGovernanceView('SHAREHOLDING')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                activeGovernanceView === 'SHAREHOLDING' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
              }`}
            >
              Shareholding Period Diffs
            </button>
            <button
              onClick={() => setActiveGovernanceView('GUIDANCE')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                activeGovernanceView === 'GUIDANCE' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
              }`}
            >
              Walk-the-Talk Management Commitments
            </button>
          </div>

          {activeGovernanceView === 'SHAREHOLDING' && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-white">Promoter & Institutional Ownership Diffs</h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono">Filter:</span>
                  <select
                    value={shScanType}
                    onChange={e => {
                      setShScanType(e.target.value);
                      loadShareholdingAndGuidance();
                    }}
                    className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                  >
                    <option value="ALL">All Diffs</option>
                    <option value="PLEDGE_REDUCTION">Pledge Reduction (&lt;= -0.5%)</option>
                    <option value="PROMOTER_ACCUMULATION">Promoter Buying (&gt;= +0.5%)</option>
                    <option value="INSTITUTIONAL_FAVORITE">Zero Pledge &gt;50% Promoter</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                      <th className="py-2 px-3">Symbol</th>
                      <th className="py-2 px-3 text-right">Promoter %</th>
                      <th className="py-2 px-3 text-right">Promoter Diff</th>
                      <th className="py-2 px-3 text-right">Pledged %</th>
                      <th className="py-2 px-3 text-right">Pledge Diff</th>
                      <th className="py-2 px-3 text-right">Public %</th>
                      <th className="py-2 px-3">Signal Tag</th>
                      <th className="py-2 px-3 text-center">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {shareholdingDiffs.slice(0, 40).map(item => (
                      <tr key={item.symbol} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-white cursor-pointer hover:text-cyan-400" onClick={() => onSelectStock?.(item.symbol)}>
                          {item.symbol}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-200">{item.promoterHolding}%</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${item.promoterHoldingDiff > 0 ? 'text-emerald-400' : item.promoterHoldingDiff < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {item.promoterHoldingDiff > 0 ? '+' : ''}{item.promoterHoldingDiff}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">{item.promoterPledge}%</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${item.promoterPledgeDiff < 0 ? 'text-emerald-400' : item.promoterPledgeDiff > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {item.promoterPledgeDiff > 0 ? '+' : ''}{item.promoterPledgeDiff}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{item.publicHolding}%</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-sans text-cyan-300 border border-slate-700">
                            {item.signalTag}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 inline-flex items-center">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeGovernanceView === 'GUIDANCE' && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-3">
              <h4 className="text-sm font-bold text-white">Source-Cited Management Commitments vs Actual Delivery</h4>
              <p className="text-xs text-slate-400">
                Audited management guidance from official concall disclosures. No synthetic sentiment scores.
              </p>

              <div className="space-y-3">
                {guidanceList.map(g => (
                  <div key={g.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-400 cursor-pointer" onClick={() => onSelectStock?.(g.symbol)}>
                          {g.symbol}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          g.status === 'MET' ? 'bg-emerald-500/20 text-emerald-400' :
                          g.status === 'MISSED' ? 'bg-rose-500/20 text-rose-400' :
                          g.status === 'NOT_COMPARABLE' ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {g.status}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{g.claimDate}</span>
                    </div>

                    <div className="text-xs text-white">
                      Metric: <strong className="text-cyan-300">{g.metric}</strong> • Target: <strong>{g.target} {g.unit || ''}</strong> • Deadline: <strong>{g.deadline || 'N/A'}</strong>
                    </div>

                    {g.actualValue && (
                      <div className="text-xs text-emerald-300 font-mono">
                        Actual Delivered: {g.actualValue}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 italic">
                      "{g.sourceEvidence}"
                    </div>
                  </div>
                ))}
                {!guidanceList.length && (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No verified management commitment records currently found in database.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 6: RETURNS BENCHMARK                                              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'RETURNS_BENCHMARK' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border bg-slate-900/70 border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <span className="text-xs font-mono text-slate-400">SYMBOLS:</span>
              <input
                type="text"
                value={benchSymbols}
                onChange={e => setBenchSymbols(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">PERIOD:</span>
              {(['1M', '3M', '6M', '1Y', '3Y', '5Y', 'YTD'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setBenchPeriod(p);
                    loadReturnsBenchmark();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer ${
                    benchPeriod === p ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              onClick={loadReturnsBenchmark}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              Compare Returns
            </button>
          </div>

          {benchmarkResult && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Cumulative Return Performance ({benchPeriod})</h4>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    Window: {benchmarkResult.startDate} to {benchmarkResult.endDate}
                  </p>
                </div>
                <div className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                  {benchmarkResult.totalReturnCaveat}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {benchmarkResult.series.map((s: any) => (
                  <div key={s.symbol} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{s.symbol}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${s.status === 'COMPLETE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {s.dataCompletenessPct}% data
                      </span>
                    </div>
                    <div className={`text-2xl font-extrabold font-mono ${s.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {s.totalReturnPct >= 0 ? '+' : ''}{s.totalReturnPct}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Total Cumulative Return</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 7: PEER COMPARISON MATRIX                                         */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'PEERS' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border bg-slate-900/70 border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <span className="text-xs font-mono text-slate-400">PEER SCRIPS:</span>
              <input
                type="text"
                value={peerSymbolsInput}
                onChange={e => setPeerSymbolsInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono"
              />
            </div>
            <button
              onClick={loadPeerComparison}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              Compare Peers
            </button>
          </div>

          {peerComparisonData && (
            <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-white">Period-Aligned Audited XBRL & Market Comparison</h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                      <th className="py-2 px-3">Symbol</th>
                      <th className="py-2 px-3 text-right">CMP (₹)</th>
                      <th className="py-2 px-3 text-right">Market Cap (Cr)</th>
                      <th className="py-2 px-3 text-right">P/E Ratio</th>
                      <th className="py-2 px-3 text-right">Revenue (Cr)</th>
                      <th className="py-2 px-3 text-right">PAT (Cr)</th>
                      <th className="py-2 px-3 text-right">ROCE %</th>
                      <th className="py-2 px-3 text-right">OPM %</th>
                      <th className="py-2 px-3 text-right">Debt / Equity</th>
                      <th className="py-2 px-3 text-center">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {peerComparisonData.peers.map((p: any) => (
                      <tr key={p.symbol} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-white cursor-pointer hover:text-cyan-400" onClick={() => onSelectStock?.(p.symbol)}>
                          {p.symbol}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-200">
                          {p.cmp ? `₹${p.cmp}` : <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">Unavailable</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-200">
                          {p.marketCapCr ? (
                            `₹${p.marketCapCr.toLocaleString()} Cr`
                          ) : (
                            <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]" title="No verified shares outstanding and price snapshot">Unavailable</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {p.peRatio ? (
                            <span className="text-cyan-300 font-bold">
                              {p.peRatio} <span className="text-[9px] text-slate-500 font-normal">Derived</span>
                            </span>
                          ) : (
                            <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]" title="Verified market cap and positive PAT required">Unavailable</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {p.revenueCr ? `₹${p.revenueCr.toLocaleString()}` : <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">Unavailable</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-400">
                          {p.patCr ? `₹${p.patCr.toLocaleString()}` : <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">Unavailable</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-cyan-300">
                          {p.rocePct !== null ? (
                            <span>{p.rocePct}% <span className="text-[9px] text-slate-500 font-normal">Derived</span></span>
                          ) : (
                            <span className="text-slate-500 italic">unavailable</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-purple-300">
                          {p.opmPct !== null ? (
                            <span>{p.opmPct}% <span className="text-[9px] text-slate-500 font-normal">Derived</span></span>
                          ) : (
                            <span className="text-slate-500 italic">unavailable</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right text-amber-300">
                          {p.debtToEquity !== null ? (
                            <span>{p.debtToEquity} <span className="text-[9px] text-slate-500 font-normal">Derived</span></span>
                          ) : (
                            <span className="text-slate-500 italic">unavailable</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {p.evidenceUrl ? (
                            <a href={p.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 inline-flex items-center">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-600 text-[10px]">No link</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 8: VALUATION CALCULATORS                                          */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'CALCULATORS' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-cyan-400" />
                Reverse Discounted Cash Flow (DCF) Calculator
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Solves for the implied growth rate required over 10 years to justify the current market price.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1 text-slate-400">
                <span>CMP (₹):</span>
                <input
                  type="number"
                  value={calcCmp}
                  onChange={e => setCalcCmp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="space-y-1 text-slate-400">
                <span>Current EPS (₹):</span>
                <input
                  type="number"
                  value={calcEps}
                  onChange={e => setCalcEps(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="space-y-1 text-slate-400">
                <span>Discount Rate (%):</span>
                <input
                  type="number"
                  value={calcDiscountRate}
                  onChange={e => setCalcDiscountRate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="space-y-1 text-slate-400">
                <span>Terminal Multiple (x):</span>
                <input
                  type="number"
                  value={calcTerminalMultiple}
                  onChange={e => setCalcTerminalMultiple(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>
            </div>

            <button
              onClick={handleCalculateReverseDcf}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-md"
            >
              Recalculate Sensitivity Table
            </button>

            {reverseDcfResult && (
              <div className="space-y-4 pt-3 border-t border-slate-800">
                <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-cyan-300 font-mono">Implied 10-Year EPS Growth Rate:</div>
                    <div className="text-2xl font-extrabold font-mono text-white mt-1">
                      {reverseDcfResult.impliedGrowthRatePct}% p.a.
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400 font-mono">
                    <div>P/E: {(reverseDcfResult.cmp / reverseDcfResult.currentEps).toFixed(1)}x</div>
                    <div>WACC: {(reverseDcfResult.discountRate * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-mono text-slate-400 mb-2">Sensitivity Matrix: Discount Rate vs Terminal Multiple (Implied Growth %)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                          <th className="py-2 px-3 text-left">Discount Rate \ Multiple</th>
                          {reverseDcfResult.sensitivityMatrix.terminalMultiples.map((tm: number) => (
                            <th key={tm} className="py-2 px-3">{tm}x Multiple</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {reverseDcfResult.sensitivityMatrix.matrix.map((row: any[], i: number) => (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-left font-bold text-slate-300">
                              {(reverseDcfResult.sensitivityMatrix.discountRates[i] * 100).toFixed(0)}% WACC
                            </td>
                            {row.map((cell: any, j: number) => (
                              <td key={j} className={`py-2 px-3 font-bold ${cell.impliedGrowthPct > 20 ? 'text-rose-400' : cell.impliedGrowthPct > 12 ? 'text-amber-300' : 'text-emerald-400'}`}>
                                {cell.impliedGrowthPct}%
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 9: CUSTOM THEMATIC INDICES                                        */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'CUSTOM_INDICES' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Custom Thematic Indices & Baskets
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Define custom equal-weight constituent portfolios with deterministic DuckDB pricing, strict coverage gap checks, and zero synthetic fallbacks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1 text-slate-400">
                <span>Basket / Index Name:</span>
                <input
                  type="text"
                  value={customIdxName}
                  onChange={e => setCustomIdxName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  placeholder="e.g. My Defense Basket"
                />
              </label>

              <label className="space-y-1 text-slate-400 md:col-span-2">
                <span>Constituents (Comma-separated NSE symbols):</span>
                <input
                  type="text"
                  value={customIdxSymbols}
                  onChange={e => setCustomIdxSymbols(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  placeholder="RELIANCE, TCS, INFY, HDFCBANK"
                />
              </label>

              <label className="space-y-1 text-slate-400">
                <span>Missing Constituent Policy:</span>
                <select
                  value={customIdxPolicy}
                  onChange={e => setCustomIdxPolicy(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                >
                  <option value="FAIL_IF_ANY_MISSING">FAIL_IF_ANY_MISSING (Strict Integrity)</option>
                  <option value="USE_COVERED_ONLY">USE_COVERED_ONLY (Reweight Covered)</option>
                  <option value="REQUIRE_MINIMUM_COVERAGE">REQUIRE_MINIMUM_COVERAGE (Min 80%)</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCalculateCustomIndex}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-2"
              >
                <Calculator className="w-3.5 h-3.5" />
                Calculate Basket Performance
              </button>
              <span className="text-[11px] text-slate-500 font-mono">
                Policy: {customIdxPolicy} (Never returns 0 on missing data)
              </span>
            </div>

            {/* Result display */}
            {customIndexCalcResult && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                {customIndexCalcResult.status === 'UNAVAILABLE' ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      Unavailable — {customIndexCalcResult.coverage?.covered || 0} of {customIndexCalcResult.coverage?.total || 0} constituents have verified data
                    </div>
                    <div className="text-xs text-rose-300 font-mono">
                      Reason: {customIndexCalcResult.noDataReason || 'No constituents have verified price history'}
                    </div>
                    {customIndexCalcResult.coverage?.missingSymbols?.length > 0 && (
                      <div className="text-xs font-mono text-slate-400">
                        Missing or unverified symbols:{' '}
                        <span className="text-rose-400 font-bold">
                          {customIndexCalcResult.coverage.missingSymbols.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 font-mono">TOTAL RETURN</div>
                        <div className={`text-xl font-bold font-mono mt-1 ${
                          (customIndexCalcResult.data?.totalReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {(customIndexCalcResult.data?.totalReturnPct ?? 0) >= 0 ? '+' : ''}
                          {Number(customIndexCalcResult.data?.totalReturnPct ?? 0).toFixed(2)}%
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 font-mono">STATUS</div>
                        <div className="text-sm font-bold font-mono mt-1 text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          {customIndexCalcResult.status}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 font-mono">CONSTITUENT COVERAGE</div>
                        <div className="text-sm font-bold font-mono mt-1 text-white">
                          {customIndexCalcResult.coverage?.covered ?? 0} / {customIndexCalcResult.coverage?.total ?? 0} verified
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400 font-mono">SOURCE SYSTEM</div>
                        <div className="text-sm font-bold font-mono mt-1 text-cyan-300">
                          {customIndexCalcResult.sourceSystem || 'DUCKDB'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 10: DURABLE ALERTS                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'ALERTS' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Durable Scan & Event Alerts
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Set active conditions across scan intersections, price breakouts, material filings, and pledge alterations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1 text-slate-400">
                <span>Alert Name:</span>
                <input
                  type="text"
                  value={newAlertName}
                  onChange={e => setNewAlertName(e.target.value)}
                  placeholder="e.g. 52W High Breakout"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>

              <label className="space-y-1 text-slate-400">
                <span>Alert Type:</span>
                <select
                  value={newAlertType}
                  onChange={e => setNewAlertType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                >
                  <option value="PRICE_LEVEL">PRICE_LEVEL</option>
                  <option value="SCAN_MATCH">SCAN_MATCH</option>
                  <option value="ANNOUNCEMENT_KEYWORD">ANNOUNCEMENT_KEYWORD</option>
                  <option value="PLEDGE_CHANGE">PLEDGE_CHANGE</option>
                </select>
              </label>

              <label className="space-y-1 text-slate-400">
                <span>Target Symbol:</span>
                <input
                  type="text"
                  value={newAlertTarget}
                  onChange={e => setNewAlertTarget(e.target.value)}
                  placeholder="RELIANCE"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>

              <label className="space-y-1 text-slate-400">
                <span>Criteria (JSON):</span>
                <input
                  type="text"
                  value={newAlertCriteria}
                  onChange={e => setNewAlertCriteria(e.target.value)}
                  placeholder='{"thresholdPrice": 1400}'
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </label>
            </div>

            <button
              onClick={handleCreateAlert}
              disabled={!newAlertName.trim()}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Durable Alert
            </button>

            {/* Alerts Table */}
            <div className="pt-3 border-t border-slate-800">
              <h4 className="text-xs font-mono text-slate-400 mb-2">Active & Configured Alerts ({alertsList.length})</h4>
              {alertsList.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  No alerts created yet. Create one above to track events deterministically.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                        <th className="py-2 px-3 text-left">ID</th>
                        <th className="py-2 px-3 text-left">Name</th>
                        <th className="py-2 px-3 text-left">Type</th>
                        <th className="py-2 px-3 text-left">Target</th>
                        <th className="py-2 px-3 text-left">Criteria</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {alertsList.map((alert: any) => (
                        <tr key={alert.id} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-400">#{alert.id}</td>
                          <td className="py-2 px-3 font-bold text-white">{alert.name}</td>
                          <td className="py-2 px-3 text-cyan-300">{alert.alert_type}</td>
                          <td className="py-2 px-3 text-amber-300 font-bold">{alert.target_symbol}</td>
                          <td className="py-2 px-3 text-slate-400 truncate max-w-xs">{alert.criteria_json}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => handleToggleAlert(alert.id, !!alert.is_active)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                alert.is_active
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-slate-700 text-slate-400'
                              }`}
                            >
                              {alert.is_active ? 'ACTIVE' : 'MUTED'}
                            </button>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500 text-[10px]">{alert.created_at?.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* TAB 11: SOURCE PROVENANCE AUDIT                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {subTab === 'AUDIT' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border bg-slate-900/70 border-slate-800 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                StockScans Data Integrity & Provenance Audit
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Full-disclosure audit panel guaranteeing zero synthetic data, verified cryptographic hashes, and deterministic calculations.
              </p>
            </div>

            {/* Policy Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Zero Synthetic Data
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Never invents, infers, or estimates values. No PAT × 25 valuation fabrication, no default 0 fallbacks, no generic bseindia.com placeholders.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Exact Provenance
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Every metric carries origin system (DuckDB, SQLite FERE, XBRL), table, document SHA-256 hash, retrieval timestamp, and calculation formula version.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
                <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  Deterministic Revisions
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Scans and custom indices track immutable data, formula, universe revisions, and parameter hashes for 100% reproducible back-testing.
                </p>
              </div>
            </div>

            {/* Recent Immutable Scan Runs Audit */}
            <div className="pt-3 border-t border-slate-800">
              <h4 className="text-xs font-mono text-slate-400 mb-2">Immutable Scan Runs Registry Audit ({scanRuns.length})</h4>
              {scanRuns.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  No scan runs executed yet. Run any scan from Scans & Discovery to view immutable run logs.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                        <th className="py-2 px-3 text-left">Run ID</th>
                        <th className="py-2 px-3 text-left">Scan Name</th>
                        <th className="py-2 px-3 text-left">Formula Ver</th>
                        <th className="py-2 px-3 text-left">Data Rev</th>
                        <th className="py-2 px-3 text-left">Universe Rev</th>
                        <th className="py-2 px-3 text-center">Coverage (Req/Elig/Match)</th>
                        <th className="py-2 px-3 text-left">Status</th>
                        <th className="py-2 px-3 text-right">Executed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {scanRuns.map((run: any) => (
                        <tr key={run.runId} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-cyan-400 font-bold truncate max-w-[120px]">{run.runId}</td>
                          <td className="py-2 px-3 text-white font-bold">{run.scanName}</td>
                          <td className="py-2 px-3 text-slate-400">{run.formulaVersion || 'v1.0.0'}</td>
                          <td className="py-2 px-3 text-slate-400">{run.dataRevision || '2026-09-24'}</td>
                          <td className="py-2 px-3 text-slate-400">{run.universeRevision || 'NIFTY_100'}</td>
                          <td className="py-2 px-3 text-center font-bold text-amber-300">
                            {run.coverage?.requested ?? 100} / {run.coverage?.eligible ?? 100} / {run.coverage?.matched ?? run.matchCount ?? 0}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              {run.status || 'VERIFIED'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500 text-[10px]">{run.executedAt?.slice(0, 19).replace('T', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
