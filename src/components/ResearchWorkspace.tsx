// ResearchWorkspace.tsx
// Agent E — RESEARCH Workspace
//
// CONSTRAINT:
// - Each sub-tab renders an EXISTING component unchanged.
// - No new strategy logic, backtest computation, or signal generation.
// - This is a compositor/router only.

import React, { useState } from 'react';
import { Suspense } from 'react';
import {
  Sparkles,
  BarChart2,
  FileSpreadsheet,
  GitBranch,
  BookOpen
} from 'lucide-react';

// Lazy-load existing components — unmodified
const QuantTechnicalStudioView = React.lazy(() =>
  import('./QuantTechnicalStudioView.js').then(m => ({ default: m.QuantTechnicalStudioView || (m as any).default }))
);
const IndependentTechnicalStrategiesView = React.lazy(() =>
  import('./IndependentTechnicalStrategiesView.js').then(m => ({ default: m.IndependentTechnicalStrategiesView || (m as any).default }))
);
const ReportStudioView = React.lazy(() =>
  import('./ReportStudioView.js').then(m => ({ default: m.ReportStudioView || (m as any).default }))
);
const RegimeBacktestComparisonView = React.lazy(() =>
  import('./RegimeBacktestComparisonView.js').then(m => ({ default: m.RegimeBacktestComparisonView || (m as any).default }))
);
const KnowledgeLabView = React.lazy(() =>
  import('./KnowledgeLabView.js').then(m => ({ default: m.KnowledgeLabView || (m as any).default }))
);

const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30vh', color: '#64748b', fontSize: 14 }}>
    <span style={{ marginRight: 8 }}>⏳</span> Loading...
  </div>
);

type ResearchSubTab =
  | 'QUANT_STUDIO'
  | 'TECHNICAL'
  | 'REPORTS'
  | 'BACKTEST'
  | 'KNOWLEDGE';

const SUB_TABS: Array<{ id: ResearchSubTab; label: string; sub: string; icon: React.ElementType }> = [
  { id: 'QUANT_STUDIO', label: 'Quant Studio', sub: 'S1–S26 scanner & evidence', icon: Sparkles },
  { id: 'TECHNICAL', label: 'Technical Strategies', sub: 'Independent technical analysis', icon: BarChart2 },
  { id: 'REPORTS', label: 'Report Studio', sub: 'Institutional report generation', icon: FileSpreadsheet },
  { id: 'BACKTEST', label: 'Regime Backtest', sub: 'Strategy comparison across regimes', icon: GitBranch },
  { id: 'KNOWLEDGE', label: 'Knowledge Lab', sub: 'Research & documentation', icon: BookOpen },
];

interface ResearchWorkspaceProps {
  initialSubTab?: ResearchSubTab;
  currentMemberId?: number | 'all';
  selectedPortfolio?: string;
  portfolios?: string[];
  formatCurrency?: (val: number) => string;
  showStockDrilldown?: (sym: string) => void;
  onSelectScrip?: (sym: string) => void;
}

export function ResearchWorkspace({
  initialSubTab = 'QUANT_STUDIO',
  currentMemberId,
  selectedPortfolio,
  portfolios = [],
  formatCurrency,
  showStockDrilldown,
  onSelectScrip
}: ResearchWorkspaceProps) {
  const [subTab, setSubTab] = useState<ResearchSubTab>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div
        className="flex items-center gap-1 overflow-x-auto p-1.5 rounded-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <span className="text-[9px] font-mono uppercase font-bold text-slate-600 px-2 hidden sm:inline shrink-0">
          RESEARCH:
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
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab Content — each renders existing component unchanged */}
      {subTab === 'QUANT_STUDIO' && (
        <Suspense fallback={<LazyFallback />}>
          <QuantTechnicalStudioView
            onSelectScrip={onSelectScrip}
          />
        </Suspense>
      )}

      {subTab === 'TECHNICAL' && (
        <Suspense fallback={<LazyFallback />}>
          <IndependentTechnicalStrategiesView />
        </Suspense>
      )}

      {subTab === 'REPORTS' && (
        <Suspense fallback={<LazyFallback />}>
          <ReportStudioView
            currentMemberId={currentMemberId || 1}
            selectedPortfolio={selectedPortfolio || 'Combined'}
            portfolios={portfolios}
            formatCurrency={formatCurrency || ((v) => String(v))}
            showStockDrilldown={showStockDrilldown || (() => {})}
          />
        </Suspense>
      )}

      {subTab === 'BACKTEST' && (
        <Suspense fallback={<LazyFallback />}>
          <RegimeBacktestComparisonView />
        </Suspense>
      )}

      {subTab === 'KNOWLEDGE' && (
        <Suspense fallback={<LazyFallback />}>
          <KnowledgeLabView />
        </Suspense>
      )}
    </div>
  );
}
