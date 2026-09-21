// UISystemPrimitives.tsx
// Agent F — UI System Primitives (display-only, no computation)
// Constraint: NEVER compute, re-rank, or re-score backend values.
//             Only render what is passed in as props.

import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  Ban,
  ChevronUp,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react';

// ─────────────────────────────────────────────
// DataStateBadge
// Renders the backend-reported data state verbatim.
// Never substitute a missing state with a blank or zero.
// ─────────────────────────────────────────────
export type DataState =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'DATA_INSUFFICIENT'
  | 'STALE'
  | 'UNVERIFIED'
  | 'BLOCKED'
  | string; // preserve any unknown state string as-is

const DATA_STATE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; border: string; label: string }> = {
  VERIFIED: {
    icon: CheckCircle,
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'VERIFIED'
  },
  PARTIAL: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'PARTIAL'
  },
  DATA_INSUFFICIENT: {
    icon: HelpCircle,
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'DATA INSUFFICIENT'
  },
  STALE: {
    icon: Clock,
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'STALE'
  },
  UNVERIFIED: {
    icon: HelpCircle,
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'UNVERIFIED'
  },
  BLOCKED: {
    icon: Ban,
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'BLOCKED'
  }
};

const UNKNOWN_STATE_CONFIG = {
  icon: HelpCircle,
  bg: 'bg-slate-700/30',
  text: 'text-slate-400',
  border: 'border-slate-600/30',
  label: 'UNKNOWN STATE'
};

interface DataStateBadgeProps {
  state: DataState;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function DataStateBadge({ state, showLabel = true, size = 'xs', className = '' }: DataStateBadgeProps) {
  const cfg = DATA_STATE_CONFIG[state] || { ...UNKNOWN_STATE_CONFIG, label: state };
  const Icon = cfg.icon;
  const sizeClasses = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-mono font-bold border ${cfg.bg} ${cfg.text} ${cfg.border} ${sizeClasses} ${className}`}
      title={`Data state: ${cfg.label}`}
    >
      <Icon className={iconSize} />
      {showLabel && cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────
// AnalystSummaryCard
// Display-only: surfaces backend verdict fields passed in as props.
// Must NOT compute, average, or re-derive any field.
// ─────────────────────────────────────────────
interface AnalystSummaryCardProps {
  symbol: string;
  companyName?: string;
  actionDirective?: string;   // From backend e.g. "BUY", "HOLD", "TRIM_EXIT"
  qglpVerdict?: string;       // From backend QGLP gate
  signalQuality?: string;     // From backend SignalQualityOverlay
  fereResult?: string;        // From backend FERE
  dataState?: DataState;
  confidenceLabel?: string;   // Backend-provided string; never compute %
  timeHorizon?: string;
  className?: string;
}

export function AnalystSummaryCard({
  symbol,
  companyName,
  actionDirective,
  qglpVerdict,
  signalQuality,
  fereResult,
  dataState,
  confidenceLabel,
  timeHorizon,
  className = ''
}: AnalystSummaryCardProps) {
  const directiveColor =
    actionDirective === 'BUY' || actionDirective === 'ACCUMULATE' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
    actionDirective === 'SELL' || actionDirective === 'TRIM_EXIT' || actionDirective === 'SHORT_HEDGE' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
    actionDirective === 'HOLD' || actionDirective === 'MONITOR' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
    'text-slate-400 border-slate-600/30 bg-slate-700/20';

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${className}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase text-slate-500 tracking-widest">
            Analyst Summary
          </span>
          <h3 className="font-bold text-sm text-white mt-0.5">
            {companyName || symbol}
          </h3>
        </div>
        {actionDirective && (
          <span className={`px-2.5 py-1 rounded-xl font-mono font-bold text-xs border ${directiveColor}`}>
            {actionDirective}
          </span>
        )}
      </div>

      {/* Backend Fields Grid — display-only */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {qglpVerdict && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40">
            <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">QGLP Gate</div>
            <div className="font-bold text-slate-200 font-mono">{qglpVerdict}</div>
          </div>
        )}
        {signalQuality && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40">
            <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">Signal Quality</div>
            <div className="font-bold text-slate-200 font-mono">{signalQuality}</div>
          </div>
        )}
        {fereResult && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40">
            <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">FERE Result</div>
            <div className="font-bold text-slate-200 font-mono">{fereResult}</div>
          </div>
        )}
        {confidenceLabel && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40">
            <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">Confidence</div>
            <div className="font-bold text-slate-200 font-mono">{confidenceLabel}</div>
          </div>
        )}
        {timeHorizon && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40">
            <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">Time Horizon</div>
            <div className="font-bold text-slate-200 font-mono">{timeHorizon}</div>
          </div>
        )}
        {dataState && (
          <div className="rounded-xl p-2.5 bg-slate-900/60 border border-slate-700/40 flex items-center gap-2">
            <div>
              <div className="text-[9px] font-mono uppercase text-slate-500 mb-1">Data State</div>
              <DataStateBadge state={dataState} size="xs" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// StandardTableHeader
// Sortable column header — UI only, no data manipulation
// ─────────────────────────────────────────────
interface StandardTableHeaderProps {
  label: string;
  field: string;
  activeSortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

export function StandardTableHeader({
  label,
  field,
  activeSortField,
  sortDir,
  onSort,
  align = 'left',
  className = ''
}: StandardTableHeaderProps) {
  const isActive = activeSortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`p-3 font-bold uppercase text-[10px] tracking-wider select-none cursor-pointer transition-colors group ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      style={{ color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)' }}
    >
      <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        {isActive ? (
          sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-cyan-400" />
            : <ChevronDown className="w-3 h-3 text-cyan-400" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60 transition-opacity" />
        )}
      </div>
    </th>
  );
}

// ─────────────────────────────────────────────
// CmdKSearchModal
// Cmd/Ctrl+K search — searches existing navigation items & symbol list
// No new API calls; uses props for symbols & tabs
// ─────────────────────────────────────────────
interface CmdKSearchEntry {
  type: 'tab' | 'symbol';
  label: string;
  sub?: string;
  id: string;
}

interface CmdKSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Array<{ id: string; label: string; sub: string }>;
  symbols: string[];
  onSelectTab: (tabId: string) => void;
  onSelectSymbol: (symbol: string) => void;
}

export function CmdKSearchModal({
  isOpen,
  onClose,
  tabs,
  symbols,
  onSelectTab,
  onSelectSymbol
}: CmdKSearchModalProps) {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) { setQuery(''); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const entries: CmdKSearchEntry[] = [
    ...tabs.map(t => ({ type: 'tab' as const, label: t.label, sub: t.sub, id: t.id })),
    ...symbols.map(s => ({ type: 'symbol' as const, label: s, id: s }))
  ];

  const filtered = q
    ? entries.filter(e => e.label.toLowerCase().includes(q) || (e.sub || '').toLowerCase().includes(q))
    : entries.slice(0, 20);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-20 px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-modal)', borderColor: 'var(--border-card)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-card)' }}>
          <span className="text-slate-400 text-sm">⌘</span>
          <input
            autoFocus
            type="text"
            placeholder="Search workspaces or symbols..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500 font-mono"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500 font-mono">No results for "{query}"</div>
          ) : (
            filtered.map((entry, idx) => (
              <button
                key={`${entry.type}-${entry.id}-${idx}`}
                onClick={() => {
                  if (entry.type === 'tab') onSelectTab(entry.id);
                  else onSelectSymbol(entry.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
              >
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  entry.type === 'tab'
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {entry.type === 'tab' ? 'WS' : 'SYM'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{entry.label}</div>
                  {entry.sub && <div className="text-[10px] text-slate-400 font-mono truncate">{entry.sub}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
