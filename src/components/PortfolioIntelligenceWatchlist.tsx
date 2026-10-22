import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Inbox,
  Search,
  Bell,
  Activity,
  ArrowRight,
  ShieldAlert,
  Clock,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface PortfolioIntelligenceWatchlistProps {
  portfolioFilter?: string;
  onSelectSymbol: (symbol: string) => void;
}

interface InboxItem {
  securityId: string;
  symbol: string;
  companyName: string;
  materialChangeCount: number;
  latestChangeTime: string | null;
  changeSummaries: string[];
  watchEventsCount: number;
  latestWatchEventSummary: string | null;
  freshnessStatus: string;
  coverageStatus: string;
  stance: string;
}

export function PortfolioIntelligenceWatchlist({ onSelectSymbol }: PortfolioIntelligenceWatchlistProps) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStance, setFilterStance] = useState<string>('ALL');

  const fetchInbox = () => {
    setLoading(true);
    fetch('/api/v2/intelligence-inbox')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(resData => {
        setItems(resData.items || []);
        setError(null);
      })
      .catch(err => {
        console.error('Failed to load intelligence inbox:', err);
        setError(err.message || 'Failed to load intelligence inbox');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const getFreshnessBadge = (status: string) => {
    switch (status) {
      case 'FRESH':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">FRESH</span>;
      case 'CURRENT':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">CURRENT</span>;
      case 'STALE':
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">STALE</span>;
      default:
        return <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">UNKNOWN</span>;
    }
  };

  const getStanceBadge = (stance: string) => {
    switch (stance) {
      case 'SUPPORTED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">SUPPORTED</span>;
      case 'CHALLENGED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">CHALLENGED</span>;
      case 'PARTIAL':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">PARTIAL</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">INSUFFICIENT EVIDENCE</span>;
    }
  };

  let filtered = [...items];
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.symbol.toLowerCase().includes(q) || (i.companyName && i.companyName.toLowerCase().includes(q)));
  }
  if (filterStance !== 'ALL') {
    filtered = filtered.filter(i => i.stance === filterStance);
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Inbox className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Intelligence Inbox</h2>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              V2 Evidence Feed
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Chronological log of verified disclosures, material fundamental deltas, and stateful watch triggers. No black-box scores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchInbox}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Feed
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Filter monitored companies by symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
          {['ALL', 'SUPPORTED', 'PARTIAL', 'CHALLENGED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStance(st)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                filterStance === st
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Inbox Feed */}
      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-slate-950/60 border border-slate-800 animate-pulse space-y-3">
          <Activity className="w-8 h-8 text-cyan-400 mx-auto animate-spin" />
          <h3 className="text-slate-200 font-bold text-sm">Loading Intelligence Feed...</h3>
          <p className="text-xs text-slate-500">Checking canonical facts, watch transitions, and verified deltas</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-2xl bg-rose-950/30 border border-rose-800/40 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-rose-300">Unable to load Intelligence Inbox</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
          <FileText className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-slate-300 font-semibold text-sm">No Monitored Items Match Filter</h3>
          <p className="text-xs text-slate-500">All watched securities are currently within steady-state parameters.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <div
              key={item.securityId}
              onClick={() => onSelectSymbol(item.symbol)}
              className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/50 transition cursor-pointer group shadow-sm hover:shadow-cyan-950/20"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-extrabold text-white tracking-wide group-hover:text-cyan-400 transition">
                      {item.symbol}
                    </span>
                    <span className="text-xs text-slate-400 truncate max-w-xs">
                      {item.companyName}
                    </span>
                    {getStanceBadge(item.stance)}
                    {getFreshnessBadge(item.freshnessStatus)}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {item.latestChangeTime ? new Date(item.latestChangeTime).toLocaleDateString() : 'Baseline'}
                    </span>
                    <span>
                      Coverage: <strong className="text-slate-300">{item.coverageStatus}</strong>
                    </span>
                    {item.watchEventsCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Bell className="w-3 h-3" />
                        {item.watchEventsCount} watch trigger{item.watchEventsCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs font-mono text-slate-500 uppercase block">Material Changes</span>
                    <span className={`text-base font-bold font-mono ${item.materialChangeCount > 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
                      {item.materialChangeCount} delta{item.materialChangeCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800/60 text-slate-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 transition">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Change Summaries Preview */}
              {item.changeSummaries && item.changeSummaries.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-1">
                  {item.changeSummaries.slice(0, 2).map((sum, i) => (
                    <p key={i} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <span>{sum}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
