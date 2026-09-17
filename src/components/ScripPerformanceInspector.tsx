import React, { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, DollarSign, Calendar, RefreshCw, Award, PieChart, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface ScripPerformanceInspectorProps {
  selectedPortfolio?: string;
}

export const ScripPerformanceInspector: React.FC<ScripPerformanceInspectorProps> = ({ selectedPortfolio = 'All' }) => {
  const [query, setQuery] = useState('');
  const [scripsList, setScripsList] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch full list of scrips on mount
  useEffect(() => {
    async function fetchScripsList() {
      setLoadingList(true);
      try {
        const res = await fetch('/api/analytics/scrips-list');
        const json = await res.json();
        if (json.success && Array.isArray(json.scrips)) {
          setScripsList(json.scrips);
        }
      } catch (err) {
        console.warn('Failed to load scrips list:', err);
      } finally {
        setLoadingList(false);
      }
    }
    fetchScripsList();
  }, []);

  const searchScrip = async (searchTarget: string) => {
    if (!searchTarget || !searchTarget.trim()) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const portParam = selectedPortfolio && selectedPortfolio !== 'Combined' ? selectedPortfolio : 'All';
      const res = await fetch(`/api/analytics/scrip-performance?query=${encodeURIComponent(searchTarget.trim())}&portfolio=${encodeURIComponent(portParam)}`);
      const json = await res.json();
      if (json.success && json.scrip) {
        setData(json.scrip);
      } else {
        setError(json.message || `No performance data found for "${searchTarget}".`);
        setData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch scrip performance metrics.');
      setData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!query || query.length < 2) return [];
    const qLower = query.toLowerCase();
    return scripsList
      .filter(s => (s.symbol && s.symbol.toLowerCase().includes(qLower)) || (s.name && s.name.toLowerCase().includes(qLower)))
      .slice(0, 8);
  }, [query, scripsList]);

  return (
    <div 
      className="rounded-2xl p-6 shadow-xl backdrop-blur-md mb-8 border transition-all"
      style={{
        background: 'var(--bg-card, #0F172A)',
        borderColor: 'var(--border-card, #334155)',
        boxShadow: 'var(--shadow-card, 0 4px 24px rgba(0, 0, 0, 0.4))'
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary, #FFFFFF)' }}>
            <Search className="w-5 h-5 text-indigo-400" />
            Scrip / Stock Return Inspector
          </h2>
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary, #94A3B8)' }}>
            Search any stock or mutual fund to inspect its collective XIRR, Realized PnL, Unrealized Gain, Dividends & per-portfolio breakdown.
          </p>
        </div>

        {/* Search Input Box */}
        <div className="relative w-full md:w-96">
          <div className="relative flex items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  searchScrip(query);
                }
              }}
              placeholder="Search ticker, ISIN, or company (e.g. RELIANCE, INFY)..."
              className="w-full text-sm rounded-xl py-2.5 pl-10 pr-24 focus:outline-none transition-all border font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500"
              style={{
                background: 'var(--bg-input, #0B1329)',
                borderColor: 'var(--border-input, #334155)',
                color: 'var(--text-primary, #FFFFFF)'
              }}
            />
            <Search className="w-4 h-4 text-indigo-400 absolute left-3.5" />
            <button
              onClick={() => searchScrip(query)}
              disabled={loadingDetail}
              className="absolute right-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
            >
              {loadingDetail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Inspect'}
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {filteredSuggestions.length > 0 && (
            <div 
              className="absolute z-50 left-0 right-0 top-full mt-2 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto border"
              style={{
                background: 'var(--bg-modal, #0F172A)',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              {filteredSuggestions.map((s) => (
                <button
                  key={`${s.symbol}-${s.isin}`}
                  onClick={() => {
                    setQuery(s.symbol);
                    searchScrip(s.symbol);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-500/15 border-b text-xs flex justify-between items-center transition-colors cursor-pointer"
                  style={{
                    borderColor: 'var(--border-card, rgba(51, 65, 85, 0.4))'
                  }}
                >
                  <span className="font-bold" style={{ color: 'var(--text-primary, #FFFFFF)' }}>{s.symbol}</span>
                  <span className="truncate max-w-[180px] font-medium" style={{ color: 'var(--text-secondary, #94A3B8)' }}>{s.name || s.isin}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3.5 mb-4 flex items-center gap-2">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Scrip Performance Details Card */}
      {data && (
        <div className="space-y-6">
          {/* Header Metadata Banner */}
          <div 
            className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 border"
            style={{
              background: 'var(--bg-table-alt, rgba(30, 41, 59, 0.5))',
              borderColor: 'var(--border-card, #334155)'
            }}
          >
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary, #FFFFFF)' }}>{data.name}</h3>
                <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold rounded-md">
                  {data.symbol}
                </span>
                {data.isin && (
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted, #94A3B8)' }}>ISIN: {data.isin}</span>
                )}
              </div>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary, #CBD5E1)' }}>
                {data.current_quantity > 0
                  ? `Active Holding: ${data.current_quantity.toLocaleString()} units @ ₹${data.ltp?.toLocaleString('en-IN')}`
                  : 'Fully Exited / 0 Active Holdings (Past History & Realized Gains Only)'}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Collective XIRR</div>
                <div className={`text-xl font-bold font-mono ${data.xirr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.xirr >= 0 ? '+' : ''}{data.xirr}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Current Value</div>
                <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary, #FFFFFF)' }}>
                  ₹{Math.round(data.current_value || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Card 1: Unrealized PnL */}
            <div 
              className="rounded-xl p-4 border transition-all"
              style={{
                background: 'var(--bg-table-row, rgba(15, 23, 42, 0.6))',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Unrealized Gain / Loss</div>
              <div className={`text-base font-bold font-mono ${data.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.unrealized_pnl >= 0 ? '+' : ''}₹{Math.round(data.unrealized_pnl || 0).toLocaleString('en-IN')}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 font-bold ${data.unrealized_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({data.unrealized_pct >= 0 ? '+' : ''}{data.unrealized_pct}%)
              </div>
            </div>

            {/* Card 2: Realized PnL */}
            <div 
              className="rounded-xl p-4 border transition-all"
              style={{
                background: 'var(--bg-table-row, rgba(15, 23, 42, 0.6))',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Realized Gain / Loss</div>
              <div className={`text-base font-bold font-mono ${data.realized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.realized_pnl >= 0 ? '+' : ''}₹{Math.round(data.realized_pnl || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--text-muted, #94A3B8)' }}>From completed sales</div>
            </div>

            {/* Card 3: Total Dividends */}
            <div 
              className="rounded-xl p-4 border transition-all"
              style={{
                background: 'var(--bg-table-row, rgba(15, 23, 42, 0.6))',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Dividends Received</div>
              <div className="text-base font-bold text-amber-400 font-mono">
                +₹{Math.round(data.dividends || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--text-muted, #94A3B8)' }}>Cumulative cash payout</div>
            </div>

            {/* Card 4: Invested Cost */}
            <div 
              className="rounded-xl p-4 border transition-all"
              style={{
                background: 'var(--bg-table-row, rgba(15, 23, 42, 0.6))',
                borderColor: 'var(--border-card, #334155)'
              }}
            >
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Current Cost Basis</div>
              <div className="text-base font-bold font-mono" style={{ color: 'var(--text-primary, #FFFFFF)' }}>
                ₹{Math.round(data.total_cost || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--text-muted, #94A3B8)' }}>Avg Buy: ₹{data.avg_buy_price}</div>
            </div>
          </div>

          {/* Per-Portfolio Breakdown Table */}
          {data.portfolios && data.portfolios.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--text-primary, #FFFFFF)' }}>
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Performance Breakdown Across Portfolios
              </h4>
              <div 
                className="overflow-x-auto border rounded-xl"
                style={{
                  background: 'var(--bg-table-row, rgba(15, 23, 42, 0.4))',
                  borderColor: 'var(--border-card, #334155)'
                }}
              >
                <table className="w-full text-left text-xs">
                  <thead 
                    className="font-bold border-b"
                    style={{
                      background: 'var(--bg-table-alt, #0F172A)',
                      color: 'var(--text-secondary, #94A3B8)',
                      borderColor: 'var(--border-card, #334155)'
                    }}
                  >
                    <tr>
                      <th className="px-4 py-3">Portfolio</th>
                      <th className="px-4 py-3 text-right">Holdings Qty</th>
                      <th className="px-4 py-3 text-right">Current Value</th>
                      <th className="px-4 py-3 text-right">Cost Basis</th>
                      <th className="px-4 py-3 text-right">Unrealized PnL</th>
                      <th className="px-4 py-3 text-right">Realized PnL</th>
                      <th className="px-4 py-3 text-right">Dividends</th>
                    </tr>
                  </thead>
                  <tbody 
                    className="divide-y"
                    style={{
                      borderColor: 'var(--border-card, rgba(51, 65, 85, 0.4))'
                    }}
                  >
                    {data.portfolios.map((p: any) => (
                      <tr key={p.portfolio} className="hover:bg-indigo-500/10 transition-colors">
                        <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-primary, #FFFFFF)' }}>{p.portfolio}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary, #CBD5E1)' }}>{p.quantity?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: 'var(--text-primary, #FFFFFF)' }}>₹{Math.round(p.current_value || 0).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary, #CBD5E1)' }}>₹{Math.round(p.total_cost || 0).toLocaleString('en-IN')}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${p.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.unrealized_pnl >= 0 ? '+' : ''}₹{Math.round(p.unrealized_pnl || 0).toLocaleString('en-IN')}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${p.realized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.realized_pnl >= 0 ? '+' : ''}₹{Math.round(p.realized_pnl || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                          +₹{Math.round(p.dividends || 0).toLocaleString('en-IN')}
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
    </div>
  );
};
