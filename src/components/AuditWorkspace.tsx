// AuditWorkspace.tsx
// Agent G — AUDIT & SYSTEM Workspace
//
// CONSTRAINT:
// - Each sub-tab renders an EXISTING component unchanged.
// - No strategy, data acquisition, or calculation logic.
// - This is a compositor/router only.

import React, { useState } from 'react';
import { Suspense } from 'react';
import {
  Settings,
  Upload,
  Link2,
  Receipt,
  Users,
  FileSearch
} from 'lucide-react';

// Lazy-load existing components — unmodified
const SettingsHubView = React.lazy(() =>
  import('./SettingsHubView.js').then(m => ({ default: m.SettingsHubView || (m as any).default }))
);
const ImportsHubView = React.lazy(() =>
  import('./ImportsHubView.js').then(m => ({ default: m.ImportsHubView || (m as any).default }))
);
const AssetScripMappingView = React.lazy(() =>
  import('./AssetScripMappingView.js').then(m => ({ default: m.AssetScripMappingView || (m as any).default }))
);
const NriTaxRepatriationHub = React.lazy(() =>
  import('./NriTaxRepatriationHub.js').then(m => ({ default: m.NriTaxRepatriationHub || (m as any).default }))
);
const FamilyBenchmarkManagerView = React.lazy(() =>
  import('./FamilyBenchmarkManagerView.js').then(m => ({ default: m.FamilyBenchmarkManagerView || (m as any).default }))
);
const ReconciliationView = React.lazy(() =>
  import('./ReconciliationView.js').then(m => ({ default: m.ReconciliationView || (m as any).default }))
);

const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30vh', color: '#64748b', fontSize: 14 }}>
    <span style={{ marginRight: 8 }}>⏳</span> Loading...
  </div>
);

type AuditSubTab =
  | 'SETTINGS'
  | 'IMPORTS'
  | 'MAPPINGS'
  | 'TAX'
  | 'FAMILY'
  | 'PROVENANCE';

const SUB_TABS: Array<{ id: AuditSubTab; label: string; sub: string; icon: React.ElementType }> = [
  { id: 'SETTINGS', label: 'System Settings', sub: 'Tickers, FX, themes, preferences', icon: Settings },
  { id: 'IMPORTS', label: 'Imports & Recon', sub: 'Bulk upload, reconciliation', icon: Upload },
  { id: 'MAPPINGS', label: 'Scrip Mappings', sub: 'Asset & scrip mapping master', icon: Link2 },
  { id: 'TAX', label: 'Tax & Repatriation', sub: 'NRI tax hub, LTCG, DTAA', icon: Receipt },
  { id: 'FAMILY', label: 'Family Governance', sub: 'Members, benchmarks, portfolios', icon: Users },
  { id: 'PROVENANCE', label: 'Provenance Logs', sub: 'Data verification & audit trail', icon: FileSearch },
];

interface AuditWorkspaceProps {
  initialSubTab?: AuditSubTab;
  showToast?: (text: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  triggerLoader?: (active: boolean, msg?: string, sub?: string) => void;
  onAddTicker?: (t: any) => Promise<boolean>;
  onEditTicker?: (id: number, t: any) => Promise<boolean>;
  onDeleteTicker?: (id: number) => Promise<boolean>;
  onMergeTickers?: (from: string, to: string) => Promise<boolean>;
  formatCurrency?: (val: number) => string;
  onPurgeBankBook?: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeTransactions?: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeEverything?: () => Promise<boolean>;
  portfolios?: string[];
  pmsPortfolios?: string[];
  selectedPortfolio?: string;
  onPortfolioChange?: (p: string) => void;
  onDataChanged?: () => void;
  onValidateBulk?: (file: any, portfolio: string) => Promise<any>;
  onCommitBulk?: (batchId: string) => Promise<any>;
  onUndoBatch?: (batchId: string) => Promise<any>;
  onReconcile?: (file: any, portfolio: string) => Promise<any>;
  onPMSUpload?: (file: any, portfolio: string) => Promise<any>;
  onAddTransaction?: (t: any) => Promise<boolean>;
  currentMemberId?: number | 'all';
}

export function AuditWorkspace({
  initialSubTab = 'SETTINGS',
  showToast,
  triggerLoader,
  onAddTicker,
  onEditTicker,
  onDeleteTicker,
  onMergeTickers,
  formatCurrency,
  onPurgeBankBook,
  onPurgeTransactions,
  onPurgeEverything,
  portfolios = [],
  pmsPortfolios = [],
  selectedPortfolio = 'Combined',
  onPortfolioChange,
  onDataChanged,
  onValidateBulk,
  onCommitBulk,
  onUndoBatch,
  onReconcile,
  onPMSUpload,
  onAddTransaction,
  currentMemberId
}: AuditWorkspaceProps) {
  const [subTab, setSubTab] = useState<AuditSubTab>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div
        className="flex items-center gap-1 overflow-x-auto p-1.5 rounded-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <span className="text-[9px] font-mono uppercase font-bold text-slate-600 px-2 hidden sm:inline shrink-0">
          AUDIT:
        </span>
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                isActive ? 'shadow-sm text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
      {subTab === 'SETTINGS' && (
        <Suspense fallback={<LazyFallback />}>
          <SettingsHubView
            showToast={showToast || (() => {})}
            triggerLoader={triggerLoader || (() => {})}
            onAddTicker={onAddTicker || (async () => false)}
            onEditTicker={onEditTicker || (async () => false)}
            onDeleteTicker={onDeleteTicker || (async () => false)}
            onMergeTickers={onMergeTickers || (async () => false)}
            formatCurrency={formatCurrency || ((v) => String(v))}
            onPurgeBankBook={onPurgeBankBook || (async () => false)}
            onPurgeTransactions={onPurgeTransactions || (async () => false)}
            onPurgeEverything={onPurgeEverything || (async () => false)}
            portfolios={portfolios}
            selectedPortfolio={selectedPortfolio}
            onDataChanged={onDataChanged || (() => {})}
          />
        </Suspense>
      )}

      {subTab === 'IMPORTS' && (
        <Suspense fallback={<LazyFallback />}>
          <ImportsHubView
            portfolios={portfolios}
            pmsPortfolios={pmsPortfolios}
            selectedPortfolio={selectedPortfolio}
            onPortfolioChange={onPortfolioChange || (() => {})}
            onValidateBulk={onValidateBulk || (async () => {})}
            onCommitBulk={onCommitBulk || (async () => {})}
            onUndoBatch={onUndoBatch || (async () => {})}
            onReconcile={onReconcile || (async () => {})}
            onPMSUpload={onPMSUpload || (async () => {})}
            onAddTransaction={onAddTransaction || (async () => false)}
            formatCurrency={formatCurrency || ((v) => String(v))}
          />
        </Suspense>
      )}

      {subTab === 'MAPPINGS' && (
        <Suspense fallback={<LazyFallback />}>
          <AssetScripMappingView />
        </Suspense>
      )}

      {subTab === 'TAX' && (
        <Suspense fallback={<LazyFallback />}>
          <NriTaxRepatriationHub
            selectedPortfolio={selectedPortfolio}
            portfolios={portfolios}
            currentMemberId={currentMemberId || 1}
          />
        </Suspense>
      )}

      {subTab === 'FAMILY' && (
        <Suspense fallback={<LazyFallback />}>
          <FamilyBenchmarkManagerView
            portfolios={portfolios}
            selectedPortfolio={selectedPortfolio}
            onPortfolioChange={onPortfolioChange || (() => {})}
            formatCurrency={formatCurrency || ((v) => String(v))}
          />
        </Suspense>
      )}

      {subTab === 'PROVENANCE' && (
        <Suspense fallback={<LazyFallback />}>
          <ReconciliationView />
        </Suspense>
      )}
    </div>
  );
}
