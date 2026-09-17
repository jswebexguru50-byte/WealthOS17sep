import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Target, BookOpen, Newspaper, ChevronRight, Activity, Zap, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { formatPct } from '../lib/formatters.js';

interface PortfolioIntelligenceWatchlistProps {
  portfolioFilter?: string;
  onSelectSymbol: (symbol: string) => void;
}

type SortField = 'symbol' | 'action' | 'score' | 'pe' | 'roce' | 'pnl';

export function PortfolioIntelligenceWatchlist({ portfolioFilter, onSelectSymbol }: PortfolioIntelligenceWatchlistProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setLoading(true);
    const url = portfolioFilter ? `/api/portfolio-intelligence?portfolio=${encodeURIComponent(portfolioFilter)}` : '/api/portfolio-intelligence';
    fetch(url)
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setData(resData.results || []);
        } else {
          setError(resData.message || 'Failed to load batch intelligence');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [portfolioFilter]);

  if (loading) {
    return (
      <div className="glass-card p-12 text-center rounded-2xl border border-slate-800 animate-pulse">
        <Activity className="w-8 h-8 text-indigo-400 mx-auto mb-4 animate-spin" />
        <h3 className="text-slate-200 font-bold">Scanning Entire Portfolio...</h3>
        <p className="text-sm text-slate-500 mt-2">Computing AI signals across all active holdings</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 rounded-2xl border border-red-500/30 text-center">
        <p className="text-red-400 font-bold">Failed to load watchlist: {error}</p>
      </div>
    );
  }

  const getSignalColor = (action: string) => {
    if (action?.includes('BUY')) return 'bg-emerald-400/20 text-emerald-400 border-emerald-400/50';
    if (action?.includes('SELL')) return 'bg-red-400/20 text-red-400 border-red-400/50';
    return 'bg-amber-400/20 text-amber-400 border-amber-400/50';
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

  let filtered = [...data];
  if (search.trim()) {
    const s = search.toLowerCase();
    filtered = filtered.filter(item => item.symbol.toLowerCase().includes(s));
  }
  
  filtered.sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;
    
    switch (sortField) {
      case 'symbol':
        valA = a.symbol;
        valB = b.symbol;
        break;
      case 'action':
        valA = a.signalResult?.action || '';
        valB = b.signalResult?.action || '';
        break;
      case 'score':
        valA = a.signalResult?.compositeScore || 0;
        valB = b.signalResult?.compositeScore || 0;
        break;
      case 'pe':
        valA = Number(a.ratios?.stock_pe) || 0;
        valB = Number(b.ratios?.stock_pe) || 0;
        break;
      case 'roce':
        valA = Number(a.ratios?.roce) || 0;
        valB = Number(b.ratios?.roce) || 0;
        break;
      case 'pnl':
        valA = a.pnl || 0;
        valB = b.pnl || 0;
        break;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 dark:border-slate-800 overflow-hidden shadow-2xl bg-slate-950 dark:bg-slate-950">
        <div className="p-6 border-b border-slate-800 dark:border-slate-800 bg-slate-900/80 dark:bg-slate-900/80/80 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              AI Intelligence Watchlist
            </h2>
            <p className="text-sm text-slate-300 mt-1">Cross-portfolio AI scoring for every active holding.</p>
          </div>
          
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 dark:bg-slate-950 border border-slate-700 dark:border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-700 dark:text-slate-400">
                <th className="px-6 py-4 font-bold cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('symbol')}>Scrip {renderSortIcon('symbol')}</th>
                <th className="px-6 py-4 font-bold text-center cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('action')}>AI Signal {renderSortIcon('action')}</th>
                <th className="px-6 py-4 font-bold text-center cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('score')}>Score (0-100) {renderSortIcon('score')}</th>
                <th className="px-6 py-4 font-bold cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('pe')}>P/E {renderSortIcon('pe')}</th>
                <th className="px-6 py-4 font-bold cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('roce')}>ROCE {renderSortIcon('roce')}</th>
                <th className="px-6 py-4 font-bold text-right cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('pnl')}>PnL {renderSortIcon('pnl')}</th>
                <th className="px-6 py-4 font-bold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((item, idx) => {
                const sig = item.signalResult || {};
                return (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={item.symbol} 
                    className="hover:bg-slate-900/60 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{item.symbol}</div>
                      <div className="text-xs text-slate-300 truncate max-w-[150px]">
                        {item.portfolios?.join(', ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold border ${getSignalColor(sig.action)}`}>
                        {sig.action || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="text-lg font-display font-black text-white">{sig.compositeScore || 0}</div>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              (sig.compositeScore || 0) > 60 ? 'bg-emerald-500' : (sig.compositeScore || 0) < 40 ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${sig.compositeScore || 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-200">
                      {item.ratios?.stock_pe || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-200">
                      {item.ratios?.roce ? `${item.ratios.roce}%` : '-'}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-right ${item.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatPct(item.pnl)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => onSelectSymbol(item.symbol)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-white hover:bg-indigo-600 transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                    No holdings match your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-950 border-t-2 border-slate-700 dark:border-slate-700 text-xs font-bold text-slate-100">
              <tr>
                <td className="px-6 py-4">TOTAL / AVG</td>
                <td className="px-6 py-4 text-center text-slate-500">{filtered.length} Scrips</td>
                <td className="px-6 py-4 text-center">
                  {filtered.length > 0 
                    ? Math.round(filtered.reduce((acc, curr) => acc + (curr.signalResult?.compositeScore || 0), 0) / filtered.length)
                    : 0} (Avg)
                </td>
                <td className="px-6 py-4 text-slate-500">-</td>
                <td className="px-6 py-4 text-slate-500">-</td>
                <td className="px-6 py-4 text-right text-slate-500">-</td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
