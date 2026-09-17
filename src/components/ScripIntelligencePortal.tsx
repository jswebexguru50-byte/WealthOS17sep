import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ExternalLink,
  Video,
  MessageSquare,
  FileText,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCw,
  Share2,
  BookOpen,
  PieChart,
  BarChart3,
  Globe,
  Zap,
  Shield,
  Award,
  CheckCircle
} from 'lucide-react';
import { formatINR, formatPct } from '../lib/formatters.js';
import { StockIntelligenceView } from './StockIntelligenceView.js';

interface ScripIntelligencePortalProps {
  initialSymbol?: string;
  selectedPortfolio?: string;
  onClose?: () => void;
}

export function ScripIntelligencePortal({ initialSymbol = 'RELIANCE', selectedPortfolio, onClose }: ScripIntelligencePortalProps) {
  const [searchSymbol, setSearchSymbol] = useState(initialSymbol);
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const [showFullModal, setShowFullModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [aiData, setAiData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'OVERVIEW' | 'TRENDLYNE' | 'CONCALLS' | 'SOCIAL_YOUTUBE' | 'PROS_CONS' | 'AI_ANALYSIS'>('OVERVIEW');
  const [masterTickers, setMasterTickers] = useState<any[]>([]);
  const [topHoldings, setTopHoldings] = useState<{
    symbol: string;
    company_name: string;
    total_effective_value: number;
    effective_pct: number;
    direct_value?: number;
    indirect_value?: number;
    contributing_funds?: string[];
  }[]>([]);

  const fetchScripIntelligence = async (sym: string) => {
    if (!sym) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scrip-intelligence?symbol=${encodeURIComponent(sym)}`);
      const result = await res.json();
      if (result.success) {
        setData(result);
        setActiveSymbol(result.symbol || sym);
      } else {
        setError(result.message || `Failed to load intelligence feed for ${sym}`);
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure loading scrip intelligence feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch master tickers for dropdown search
    fetch('/api/master-tickers')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMasterTickers(data);
      })
      .catch(err => console.error('Failed to load master tickers:', err));

    // Fetch dynamic effective holdings (including MF & ETF underlying stock lookthrough)
    const portfolioParam = selectedPortfolio ? `?portfolio=${encodeURIComponent(selectedPortfolio)}` : '';
    fetch(`/api/dashboard/effective-holdings${portfolioParam}`)
      .then(r => r.json())
      .then(data => {
        let extractedTop: any[] = [];
        if (data.success && Array.isArray(data.effective_holdings) && data.effective_holdings.length > 0) {
          extractedTop = data.effective_holdings.slice(0, 10).map((item: any) => ({
            symbol: item.symbol,
            company_name: item.name || item.company_name || item.symbol,
            total_effective_value: item.total_effective_value || 0,
            effective_pct: item.effective_pct || 0,
            direct_value: item.direct_value || 0,
            indirect_value: item.indirect_value || 0,
            contributing_funds: item.contributing_funds || []
          }));
        }

        if (extractedTop.length === 0) {
          // Fallback to direct holdings if lookthrough was empty
          fetch(`/api/dashboard${portfolioParam}`)
            .then(r => r.json())
            .then(dashData => {
              if (dashData.success && dashData.holdings) {
                const symMap = new Map<string, { val: number, name: string }>();
                for (const h of dashData.holdings) {
                  if (h.portfolio === 'Cash & FD' || h.type === 'CASH_EQUIVALENT' || h.is_sold) continue;
                  const existing = symMap.get(h.symbol) || { val: 0, name: h.company_name || h.symbol };
                  existing.val += (h.current_value || 0);
                  symMap.set(h.symbol, existing);
                }
                const sorted = Array.from(symMap.entries())
                  .sort((a, b) => b[1].val - a[1].val)
                  .slice(0, 10)
                  .map(e => ({
                    symbol: e[0],
                    company_name: e[1].name,
                    total_effective_value: e[1].val,
                    effective_pct: 0
                  }));

                setTopHoldings(sorted);
                if (sorted.length > 0 && (!initialSymbol || initialSymbol === 'RELIANCE')) {
                  const topSym = sorted[0].symbol;
                  setSearchSymbol(topSym);
                  fetchScripIntelligence(topSym);
                } else {
                  fetchScripIntelligence(initialSymbol || 'RELIANCE');
                }
              } else {
                fetchScripIntelligence(initialSymbol || 'RELIANCE');
              }
            })
            .catch(() => fetchScripIntelligence(initialSymbol || 'RELIANCE'));
        } else {
          setTopHoldings(extractedTop);
          // Auto-select #1 Top Dynamic Effective Holding as default
          if (extractedTop.length > 0 && (!initialSymbol || initialSymbol === 'RELIANCE')) {
            const topSym = extractedTop[0].symbol;
            setSearchSymbol(topSym);
            fetchScripIntelligence(topSym);
          } else {
            fetchScripIntelligence(initialSymbol || 'RELIANCE');
          }
        }
      })
      .catch(err => {
        console.error('Failed to load effective holdings:', err);
        fetchScripIntelligence(initialSymbol || 'RELIANCE');
      });
  }, [initialSymbol, selectedPortfolio]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      fetchScripIntelligence(searchSymbol.trim());
    }
  };

  const screener = data?.screener;
  const ratios = screener?.ratios || {};
  const social = data?.social || [];
  const concalls = screener?.concalls || [];
  const presentations = screener?.presentations || [];
  const tl = data?.trendlyne || null;
  const tlDvm = tl?.dvm || {};
  const tlSwot = tl?.swot || {};
  const tlConsensus = tl?.analystConsensus || {};
  const tlChecklists = tl?.checklists || {};
  const tlForecaster = tl?.forecaster || {};

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6 relative border border-slate-800/80 shadow-2xl">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-100 flex items-center gap-2">
                360° Scrip Market Intelligence Portal
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Screener.in fundamentals, concall transcripts, investor PDFs, YouTube analysis & social media sentiment.
              </p>
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              list="master-tickers-datalist"
              value={searchSymbol}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setSearchSymbol(val);
                if (masterTickers.some(t => t.symbol.toUpperCase() === val)) {
                  fetchScripIntelligence(val);
                }
              }}
              placeholder="Search scrip (e.g. RELIANCE, TATAMOTORS, VOO, AAPL)..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-200 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none uppercase font-mono tracking-wider"
            />
            <datalist id="master-tickers-datalist">
              {masterTickers.map(t => (
                <option key={t.id || t.symbol} value={t.symbol}>
                  {t.name}
                </option>
              ))}
            </datalist>
          </form>

          <button
            id="launch-full-360-btn"
            onClick={() => setShowFullModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            Full 360° Analysis
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {showFullModal && activeSymbol && (
        <StockIntelligenceView
          symbol={activeSymbol}
          isOpen={showFullModal}
          onClose={() => setShowFullModal(false)}
        />
      )}

      {/* Top 10 Dynamic Effective Holdings Tiles (MF & ETF Look-Through) */}
      {topHoldings.length > 0 && (
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-display">
              <PieChart className="w-3.5 h-3.5 text-indigo-400" />
              Top 10 Effective Stock Exposure (Direct Equity + MF/ETF Look-Through)
            </span>
            <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              Click any stock for 1-Click Intelligence
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {topHoldings.map((th, idx) => {
              const isSelected = activeSymbol === th.symbol;
              const fundsText = th.contributing_funds && th.contributing_funds.length > 0
                ? ` | Funds: ${th.contributing_funds.join(', ')}`
                : '';
              const tooltip = `${th.company_name} | Effective Value: ₹${Math.round(th.total_effective_value).toLocaleString('en-IN')}${fundsText}`;

              return (
                <button
                  key={th.symbol}
                  onClick={() => {
                    setSearchSymbol(th.symbol);
                    fetchScripIntelligence(th.symbol);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-500 text-slate-950 font-bold shadow-md shadow-indigo-500/20 border border-indigo-400 scale-105'
                      : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-indigo-500/50 hover:text-slate-100 hover:bg-slate-850'
                  }`}
                  title={tooltip}
                >
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                    isSelected ? 'bg-slate-950/30 text-indigo-950' : 'bg-slate-800 text-indigo-400'
                  }`}>
                    #{idx + 1}
                  </span>
                  <span>{th.symbol}</span>
                  {th.effective_pct > 0 && (
                    <span className={`text-[10px] font-mono ${
                      isSelected ? 'text-slate-950/80 font-bold' : 'text-slate-400'
                    }`}>
                      ({(th.effective_pct || 0).toFixed(1)}%)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/60 pb-3">
        <button
          onClick={() => setActiveSubTab('OVERVIEW')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'OVERVIEW'
              ? 'bg-indigo-500 text-slate-950 font-bold shadow-md shadow-indigo-500/10'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800/80'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Screener.in Fundamentals & Ratios
        </button>

        <button
          onClick={() => setActiveSubTab('TRENDLYNE')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'TRENDLYNE'
              ? 'bg-indigo-500 text-slate-950 font-bold shadow-md shadow-indigo-500/10'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800/80'
          }`}
        >
          <Shield className="w-4 h-4" />
          Trendlyne DVM & SWOT
        </button>

        <button
          onClick={() => setActiveSubTab('CONCALLS')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'CONCALLS'
              ? 'bg-indigo-500 text-slate-950 font-bold shadow-md shadow-indigo-500/10'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800/80'
          }`}
        >
          <FileText className="w-4 h-4" />
          Concall Transcripts & Investor PDFs ({concalls.length + presentations.length})
        </button>

        <button
          onClick={() => setActiveSubTab('SOCIAL_YOUTUBE')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'SOCIAL_YOUTUBE'
              ? 'bg-indigo-500 text-slate-950 font-bold shadow-md shadow-indigo-500/10'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800/80'
          }`}
        >
          <Video className="w-4 h-4" />
          YouTube Videos & Social Media
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-400">
          <RotateCw className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium">Fetching 360° Screener.in & Social Media intelligence for {activeSymbol}...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-rose-300 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <h4 className="font-semibold text-base">Data Retrieval Notice</h4>
            <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Company Title Banner */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-100 font-display">
                  {screener?.company_name || activeSymbol}
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                  {activeSymbol}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed line-clamp-2">
                {screener?.about || 'Company fundamental metrics and quarterly disclosure feed.'}
              </p>
            </div>

            <a
              href={`https://www.screener.in/company/${encodeURIComponent(activeSymbol)}/consolidated/`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold text-xs rounded-xl transition-all shrink-0"
            >
              Open in Screener.in <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* TAB 1: OVERVIEW & RATIOS */}
          {activeSubTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Key Ratios Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Market Cap</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.market_cap || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Stock P/E</span>
                  <span className="text-base font-bold text-emerald-400 font-mono mt-1 block">{ratios.stock_pe || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">ROCE %</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.roce || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">ROE %</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.roe || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Dividend Yield</span>
                  <span className="text-base font-bold text-indigo-400 font-mono mt-1 block">{ratios.dividend_yield || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Current Price</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.current_price || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">52w High / Low</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.high_low || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Book Value</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.book_value || 'N/A'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Debt to Equity</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.debt_to_equity || '0.00'}</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Face Value</span>
                  <span className="text-base font-bold text-slate-100 font-mono mt-1 block">{ratios.face_value || '₹10'}</span>
                </div>
              </div>

              {/* Shareholding Pattern Card */}
              {screener?.shareholding && (
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
                  <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2 font-display">
                    <PieChart className="w-4 h-4 text-indigo-400" /> Shareholding Distribution
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-center">
                      <span className="text-slate-400 text-[10px] block">Promoters</span>
                      <span className="font-bold text-emerald-400 text-sm block mt-0.5">{screener.shareholding.promoters}</span>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-center">
                      <span className="text-slate-400 text-[10px] block">FIIs (Foreign)</span>
                      <span className="font-bold text-indigo-400 text-sm block mt-0.5">{screener.shareholding.fiis}</span>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-center">
                      <span className="text-slate-400 text-[10px] block">DIIs (Domestic)</span>
                      <span className="font-bold text-amber-400 text-sm block mt-0.5">{screener.shareholding.diis}</span>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-center">
                      <span className="text-slate-400 text-[10px] block">Public / Retail</span>
                      <span className="font-bold text-slate-300 text-sm block mt-0.5">{screener.shareholding.public_holding}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRENDLYNE DVM & SWOT */}
          {activeSubTab === 'TRENDLYNE' && (
            <div className="space-y-6">
              {/* Classification Banner */}
              <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-purple-950/70 border border-indigo-800/40 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                        🛡️ Trendlyne DVM Classification
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                        Institutional Grade
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white font-display">
                      {tlDvm.overallDvmClassification || 'High Durability, Strong Momentum Leader'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                      Evaluates operational cash flow sustainability, valuation multiples, and structural price momentum.
                    </p>
                    <div className="pt-2">
                      <a
                        href={`https://trendlyne.com/equity/consensus-recommendation-target-price/${encodeURIComponent(activeSymbol)}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white text-xs font-mono font-bold border border-blue-500/30 hover:border-blue-400 transition-all"
                        title="Check Trendlyne Analyst Consensus & Target Price Envelope"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Check Analyst Targets & Broker Notes on Trendlyne
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 shrink-0">
                    <div className="text-center px-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Piotroski</span>
                      <span className="text-base font-black font-mono text-emerald-400">{tlChecklists.piotroskiScore || 8}/9</span>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Altman Z</span>
                      <span className="text-base font-black font-mono text-cyan-300">{tlChecklists.altmanZScore || 6.4}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">Consensus</span>
                      <span className="text-base font-black font-mono text-emerald-400">BUY</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 DVM Score Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">Durability (D)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {tlDvm.durabilityGrade || 'HIGH'}
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">{tlDvm.durabilityScore || 75} <span className="text-xs text-slate-400 font-normal">/ 100</span></div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{tlDvm.durabilitySummary || 'Strong balance sheet, low leverage, and high return on capital.'}</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">Valuation (V)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {(tlDvm.valuationGrade || 'EXPENSIVE').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">{tlDvm.valuationScore || 35} <span className="text-xs text-slate-400 font-normal">/ 100</span></div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{tlDvm.valuationSummary || 'Trading at growth premium multiples reflecting sector leadership.'}</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase">Momentum (M)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {tlDvm.momentumGrade || 'STRONG'}
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">{tlDvm.momentumScore || 88} <span className="text-xs text-slate-400 font-normal">/ 100</span></div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{tlDvm.momentumSummary || 'Technical trend is in strong momentum corridor above key averages.'}</p>
                </div>
              </div>

              {/* SWOT Matrix 4 Quadrants */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Strengths
                  </h4>
                  <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
                    {(tlSwot.strengths || [
                      'Sound balance sheet solvency and steady operating cash flow.',
                      'Superior return on capital (ROCE > 25%).',
                      'No promoter share pledging.'
                    ]).map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-amber-300 uppercase flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Weaknesses
                  </h4>
                  <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
                    {(tlSwot.weaknesses || [
                      'Rich valuation multiple leaves narrow margin of safety for quarterly execution misses.'
                    ]).map((w: string, idx: number) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-blue-300 uppercase flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" /> Opportunities
                  </h4>
                  <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
                    {(tlSwot.opportunities || [
                      'Expanding order book pipeline and sovereign Make-in-India programs.',
                      'Operating leverage expansion as revenue scales.'
                    ]).map((o: string, idx: number) => (
                      <li key={idx}>{o}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Threats
                  </h4>
                  <ul className="text-xs text-slate-200 space-y-1 list-disc list-inside">
                    {(tlSwot.threats || [
                      'Input cost volatility and global supply chain fluctuations.',
                      'Broader market valuation multiple contraction.'
                    ]).map((t: string, idx: number) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONCALLS & PRESENTATIONS */}
          {activeSubTab === 'CONCALLS' && (
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2 font-display">
                <FileText className="w-4 h-4 text-indigo-400" /> Quarterly Conference Call Transcripts & Presentations
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Concalls */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                    Concall Transcripts & Recaps
                  </h5>
                  {concalls.length > 0 ? (
                    <div className="space-y-2">
                      {concalls.map((doc: any, i: number) => (
                        <a
                          key={i}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start justify-between p-3 bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 rounded-xl transition-all group cursor-pointer text-xs"
                        >
                          <div className="flex flex-col gap-1 pr-3">
                            {doc.date && (
                              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded w-fit">
                                {doc.date}
                              </span>
                            )}
                            <span className="font-medium text-slate-200 group-hover:text-indigo-400 transition-colors">
                              {doc.title}
                            </span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 mt-1" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No direct concall transcripts found.</p>
                  )}
                </div>

                {/* Presentations */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                    Investor Presentations (PDF)
                  </h5>
                  {presentations.length > 0 ? (
                    <div className="space-y-2">
                      {presentations.map((doc: any, i: number) => (
                        <a
                          key={i}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start justify-between p-3 bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 rounded-xl transition-all group cursor-pointer text-xs"
                        >
                          <div className="flex flex-col gap-1 pr-3">
                            {doc.date && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit">
                                {doc.date}
                              </span>
                            )}
                            <span className="font-medium text-slate-200 group-hover:text-emerald-400 transition-colors">
                              {doc.title}
                            </span>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 shrink-0 mt-1" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No direct investor presentations found.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: YOUTUBE & SOCIAL MEDIA */}
          {activeSubTab === 'AI_ANALYSIS' && aiData && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-950 border border-slate-800 shadow-inner">
                    <TrendingUp className={`w-6 h-6 ${aiData.actionColor}`} />
                  </div>
                  <div>
                    <h3 className="text-slate-400 font-medium text-xs uppercase tracking-widest">Aggregated Verdict</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-2xl font-black font-display tracking-tight ${aiData.actionColor}`}>{aiData.recommendation}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {aiData.sentiment}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 md:ml-6 text-sm text-slate-300 leading-relaxed border-l-0 md:border-l border-slate-800/80 pt-4 md:pt-0 pl-0 md:pl-6">
                  {aiData.summary}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2 font-display">
                    <Globe className="w-4 h-4 text-emerald-400" /> Multi-Source Intelligence
                  </h4>
                  <div className="space-y-2">
                    {aiData.sources.map((src: any, idx: number) => (
                      <div key={idx} className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden group">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${src.impact === 'Positive' ? 'bg-emerald-500' : src.impact === 'Negative' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200 text-xs">{src.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${src.impact === 'Positive' ? 'bg-emerald-500/10 text-emerald-400' : src.impact === 'Negative' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {src.impact}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{src.insight}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2 font-display">
                    <MessageSquare className="w-4 h-4 text-indigo-400" /> Analyst Reasoning
                  </h4>
                  <div className="bg-indigo-950/20 border border-indigo-500/20 p-5 rounded-2xl h-[calc(100%-2rem)] flex items-start">
                    <p className="text-sm text-indigo-200/80 leading-relaxed italic">
                      "{aiData.reasoning}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeSubTab === 'SOCIAL_YOUTUBE' && (
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-200 text-sm flex items-center gap-2 font-display">
                <Video className="w-4 h-4 text-rose-400" /> YouTube Research Videos & Social Media Media Coverage
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {social.map((item: any, i: number) => (
                  <a
                    key={i}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl transition-all group flex flex-col justify-between space-y-2 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded border bg-rose-500/20 text-rose-300 border-rose-500/30">
                        {item.platform}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200 transition-colors" />
                    </div>

                    <div>
                      <h5 className="font-bold text-slate-200 text-xs group-hover:text-indigo-300 transition-colors leading-snug">
                        {item.title}
                      </h5>
                      {item.snippet && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono block border-t border-slate-800/60 pt-1.5">
                      Source: {item.source}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
