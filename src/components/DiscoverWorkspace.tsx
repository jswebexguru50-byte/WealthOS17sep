// DiscoverWorkspace.tsx
// Agent C — DISCOVER Workspace
//
// CONSTRAINT:
// - Each sub-tab renders an EXISTING component unchanged.
// - No new composite score, ranking, or derived field is created.
// - "Comparison tray" is display-only: shows existing columns side-by-side.
// - This is a compositor/router only.

import React, { useState } from 'react';
import { Suspense } from 'react';
import {
  Layers,
  TrendingUp,
  Eye,
  Zap,
  Compass,
  Activity
} from 'lucide-react';

// Lazy-load existing components — unmodified
const OpportunityEngineMasterView = React.lazy(() =>
  import('./OpportunityEngineMasterView.js').then(m => ({ default: m.OpportunityEngineMasterView || (m as any).default }))
);
const MultibaggerScreenerView = React.lazy(() =>
  import('./MultibaggerScreenerView.js').then(m => ({ default: m.MultibaggerScreenerView || (m as any).default }))
);
const OpportunityHubView = React.lazy(() =>
  import('./OpportunityHubView.js').then(m => ({ default: m.OpportunityHubView || (m as any).default }))
);
const SmartMoneyMomentumVpaView = React.lazy(() =>
  import('./SmartMoneyMomentumVpaView.js').then(m => ({ default: m.SmartMoneyMomentumVpaView || (m as any).default }))
);
const GreenfieldInvestmentPortal = React.lazy(() =>
  import('./GreenfieldInvestmentPortal.js').then(m => ({ default: m.GreenfieldInvestmentPortal || (m as any).default }))
);

const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30vh', color: '#64748b', fontSize: 14 }}>
    <span style={{ marginRight: 8 }}>⏳</span> Loading...
  </div>
);

type DiscoverSubTab =
  | 'OPPORTUNITY_ENGINE'
  | 'MULTIBAGGER'
  | 'SENTINEL'
  | 'MOMENTUM_VPA'
  | 'GREENFIELD';

const SUB_TABS: Array<{ id: DiscoverSubTab; label: string; sub: string; icon: React.ElementType; color: string }> = [
  { id: 'OPPORTUNITY_ENGINE', label: 'Opportunity Engine', sub: 'ITAS S1–S10 scored signals', icon: Zap, color: 'text-amber-400' },
  { id: 'MULTIBAGGER', label: 'Multibagger Screener', sub: 'Quality & growth filter', icon: TrendingUp, color: 'text-emerald-400' },
  { id: 'SENTINEL', label: 'Smart Money Sentinel', sub: 'Institutional flow & breakouts', icon: Eye, color: 'text-cyan-400' },
  { id: 'MOMENTUM_VPA', label: 'Momentum & VPA', sub: 'Volume-price action', icon: Activity, color: 'text-purple-400' },
  { id: 'GREENFIELD', label: 'Greenfield Portal', sub: 'Early-stage & sunrise sectors', icon: Compass, color: 'text-teal-400' },
];

interface DiscoverWorkspaceProps {
  // initialSubTab allows deep-link compat: e.g. ?sub=multibagger
  initialSubTab?: DiscoverSubTab;
  onSelectStock?: (symbol: string) => void;
  selectedPortfolio?: string;
}

export function DiscoverWorkspace({
  initialSubTab = 'OPPORTUNITY_ENGINE',
  onSelectStock,
  selectedPortfolio
}: DiscoverWorkspaceProps) {
  const [subTab, setSubTab] = useState<DiscoverSubTab>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div
        className="flex items-center gap-1 overflow-x-auto p-1.5 rounded-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <span className="text-[9px] font-mono uppercase font-bold text-slate-600 px-2 hidden sm:inline shrink-0">
          DISCOVER:
        </span>
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'shadow-sm text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              style={isActive ? { background: 'var(--bg-sidebar-active)', border: '1px solid var(--border-focus)', color: 'var(--accent-gold-light)' } : {}}
              title={tab.sub}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : tab.color}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab Content — each renders existing component unchanged */}
      {subTab === 'OPPORTUNITY_ENGINE' && (
        <Suspense fallback={<LazyFallback />}>
          <OpportunityEngineMasterView
            onSelectStock={onSelectStock}
          />
        </Suspense>
      )}

      {subTab === 'MULTIBAGGER' && (
        <Suspense fallback={<LazyFallback />}>
          <MultibaggerScreenerView />
        </Suspense>
      )}

      {subTab === 'SENTINEL' && (
        <Suspense fallback={<LazyFallback />}>
          <OpportunityHubView
            selectedPortfolio={selectedPortfolio || 'Combined'}
            onSelectScrip={onSelectStock}
          />
        </Suspense>
      )}

      {subTab === 'MOMENTUM_VPA' && (
        <Suspense fallback={<LazyFallback />}>
          <SmartMoneyMomentumVpaView />
        </Suspense>
      )}

      {subTab === 'GREENFIELD' && (
        <Suspense fallback={<LazyFallback />}>
          <GreenfieldInvestmentPortal />
        </Suspense>
      )}
    </div>
  );
}
