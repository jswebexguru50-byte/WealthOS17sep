import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  SlidersHorizontal,
  Layers,
  ArrowUpRight,
  Sparkles,
  Zap,
  Filter
} from 'lucide-react';
import { Holding, DashboardMetrics } from '../types';

interface CommandCenterRightDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  holdings: Holding[];
  metrics: DashboardMetrics;
  onSelectStock?: (ticker: string) => void;
}

export function CommandCenterRightDrawer({
  isOpen,
  onToggle,
  holdings,
  metrics,
  onSelectStock
}: CommandCenterRightDrawerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GAINERS' | 'LOSERS' | 'HIGH_VALUE'>('ALL');

  // Filter & sort holdings
  const filteredHoldings = useMemo(() => {
    let list = [...(holdings || [])];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(h => 
        h.symbol?.toLowerCase().includes(q) || 
        h.company_name?.toLowerCase().includes(q)
      );
    }

    if (filterType === 'GAINERS') {
      list = list.filter(h => (h.unrealized_pct || 0) > 0);
      list.sort((a, b) => (b.unrealized_pct || 0) - (a.unrealized_pct || 0));
    } else if (filterType === 'LOSERS') {
      list = list.filter(h => (h.unrealized_pct || 0) < 0);
      list.sort((a, b) => (a.unrealized_pct || 0) - (b.unrealized_pct || 0));
    } else if (filterType === 'HIGH_VALUE') {
      list.sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
    } else {
      // Default: sort by highest current value
      list.sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
    }

    return list;
  }, [holdings, searchTerm, filterType]);

  const formatCrores = (val?: number) => {
    if (!val) return '₹0.00 Cr';
    const cr = val / 10000000;
    return `₹${cr.toFixed(2)} Cr`;
  };

  const formatLakhs = (val?: number) => {
    if (!val) return '₹0';
    if (Math.abs(val) >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    }
    return `₹${(val / 100000).toFixed(2)} L`;
  };

  return (
    <aside 
      className={`hidden xl:flex flex-col shrink-0 border-l transition-all duration-300 relative ${
        isOpen ? 'w-80' : 'w-12'
      }`}
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-card)',
        color: 'var(--text-primary)'
      }}
    >
      {/* Toggle Button Strip */}
      <button
        type="button"
        onClick={onToggle}
        className="absolute -left-3.5 top-5 z-20 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer border"
        style={{
          background: 'var(--accent-gold)',
          color: '#000',
          borderColor: 'var(--border-card)'
        }}
        title={isOpen ? 'Collapse Market Stream Panel' : 'Expand Market Stream Panel'}
      >
        {isOpen ? <ChevronRight className="w-4 h-4 stroke-[2.5]" /> : <ChevronLeft className="w-4 h-4 stroke-[2.5]" />}
      </button>

      {/* When Collapsed: Vertical indicator icon strip */}
      {!isOpen && (
        <div className="flex-1 flex flex-col items-center py-6 gap-6 cursor-pointer" onClick={onToggle}>
          <div className="p-2 rounded-xl" style={{ background: 'var(--bg-sidebar-active)' }}>
            <Activity className="w-4 h-4" style={{ color: 'var(--accent-gold)' }} />
          </div>
          <span 
            className="text-[10px] font-mono uppercase tracking-widest font-bold rotate-90 whitespace-nowrap mt-8"
            style={{ color: 'var(--text-muted)' }}
          >
            Live Stream
          </span>
          <div className="mt-auto p-2 rounded-xl text-[10px] font-mono" style={{ color: 'var(--accent-green)' }}>
            ●
          </div>
        </div>
      )}

      {/* When Expanded: Full Stream Panel */}
      {isOpen && (
        <div className="flex-1 flex flex-col h-screen sticky top-0 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b flex flex-col gap-2 shrink-0" style={{ borderColor: 'var(--border-card)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-green)' }} />
                <h3 className="font-bold font-display text-xs uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Live Stream Desk
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}>
                {holdings.length} Assets
              </span>
            </div>

            {/* Mini Summary Card */}
            <div 
              className="p-3 rounded-xl border flex items-center justify-between"
              style={{
                background: 'var(--bg-table-alt)',
                borderColor: 'var(--border-card)'
              }}
            >
              <div>
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                  AUM Valuation
                </span>
                <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {formatCrores(metrics.current_value)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                  Intraday Move
                </span>
                <span 
                  className="text-xs font-bold font-mono flex items-center gap-0.5 justify-end"
                  style={{ color: (metrics.day_change || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                >
                  {(metrics.day_change || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {formatLakhs(metrics.day_change)}
                </span>
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filter scrip or asset..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border outline-none font-mono"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-bold font-mono pt-1">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${filterType === 'ALL' ? 'shadow-xs font-extrabold' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: filterType === 'ALL' ? 'var(--accent-gold)' : 'transparent',
                  color: filterType === 'ALL' ? '#000' : 'var(--text-secondary)'
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType('HIGH_VALUE')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${filterType === 'HIGH_VALUE' ? 'shadow-xs font-extrabold' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: filterType === 'HIGH_VALUE' ? 'var(--accent-gold)' : 'transparent',
                  color: filterType === 'HIGH_VALUE' ? '#000' : 'var(--text-secondary)'
                }}
              >
                Top Size
              </button>
              <button
                type="button"
                onClick={() => setFilterType('GAINERS')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 ${filterType === 'GAINERS' ? 'shadow-xs font-extrabold' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: filterType === 'GAINERS' ? 'var(--accent-green)' : 'transparent',
                  color: filterType === 'GAINERS' ? '#000' : 'var(--accent-green)'
                }}
              >
                <TrendingUp className="w-2.5 h-2.5" />
                Gains
              </button>
              <button
                type="button"
                onClick={() => setFilterType('LOSERS')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 ${filterType === 'LOSERS' ? 'shadow-xs font-extrabold' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: filterType === 'LOSERS' ? 'var(--accent-red)' : 'transparent',
                  color: filterType === 'LOSERS' ? '#fff' : 'var(--accent-red)'
                }}
              >
                <TrendingDown className="w-2.5 h-2.5" />
                Drift
              </button>
            </div>
          </div>

          {/* Holdings Stream List */}
          <div className="flex-1 overflow-y-auto divide-y font-mono text-xs" style={{ borderColor: 'var(--border-card)' }}>
            {filteredHoldings.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No assets matching filter
              </div>
            ) : (
              filteredHoldings.map((h, i) => {
                const isPositive = (h.unrealized_pct || 0) >= 0;
                return (
                  <div
                    key={h.symbol || i}
                    onClick={() => onSelectStock && onSelectStock(h.symbol)}
                    className="p-3 hover:bg-[var(--bg-table-alt)] transition-colors cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold truncate group-hover:text-[var(--accent-gold)] transition-colors" style={{ color: 'var(--text-primary)' }}>
                          {h.symbol}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded font-sans uppercase font-bold" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                          {h.asset_class || 'EQ'}
                        </span>
                      </div>
                      <span className="text-[10px] truncate block opacity-75 max-w-[140px]" style={{ color: 'var(--text-secondary)' }}>
                        {h.company_name || h.symbol}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold block" style={{ color: 'var(--text-primary)' }}>
                        {formatLakhs(h.current_value)}
                      </span>
                      <span 
                        className="text-[10px] font-bold inline-flex items-center gap-0.5"
                        style={{ color: isPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}
                      >
                        {isPositive ? '+' : ''}{(h.unrealized_pct || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Stream Footer Quick Info */}
          <div className="p-3 border-t text-[10px] font-mono flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border-card)', background: 'var(--bg-table-alt)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Yahoo LTP & NSE Feed</span>
            <span className="font-bold" style={{ color: 'var(--accent-gold)' }}>Auto-Sync Active</span>
          </div>
        </div>
      )}
    </aside>
  );
}
