import React, { useState } from 'react';
import { Briefcase, Layers, Wrench, Landmark } from 'lucide-react';
import { PortfolioManagerView } from './PortfolioManagerView.js';
import { MasterTickersView } from './MasterTickersView.js';
import { SettingsView } from './SettingsView.js';
import { BankAndFDsView } from './BankAndFDsView.js';
import { FamilyMembersManagerView } from './FamilyMembersManagerView.js';
import { MasterTicker } from '../types.js';
import { Users } from 'lucide-react';

interface SettingsHubViewProps {
  showToast: (m: string, t?: 'success' | 'error') => void;
  triggerLoader: (a: boolean, msg?: string) => void;
  onAddTicker: (ticker: Partial<MasterTicker>) => Promise<boolean>;
  onEditTicker: (id: number, ticker: Partial<MasterTicker>) => Promise<boolean>;
  onDeleteTicker: (id: number) => Promise<boolean>;
  onMergeTickers: (sourceSymbol: string, targetSymbol: string) => Promise<boolean>;
  formatCurrency: (val: number) => string;
  onPurgeBankBook?: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeTransactions: (portfolio?: string, purgeMappings?: boolean) => Promise<boolean>;
  onPurgeEverything: () => Promise<boolean>;
  portfolios?: string[];
  selectedPortfolio?: string;
  onDataChanged?: () => void;
}

export function SettingsHubView({
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
  selectedPortfolio = 'Combined',
  onDataChanged
}: SettingsHubViewProps) {
  const [subTab, setSubTab] = useState<'MEMBERS' | 'PORTFOLIOS' | 'BANK_FDS' | 'TICKERS' | 'SYSTEM'>('MEMBERS');

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Pills */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setSubTab('MEMBERS')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'MEMBERS'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Users className="w-4 h-4" />
            Family Members & Users
          </button>

          <button
            onClick={() => setSubTab('PORTFOLIOS')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'PORTFOLIOS'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Portfolio Management
          </button>

          <button
            onClick={() => setSubTab('BANK_FDS')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'BANK_FDS'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Landmark className="w-4 h-4" />
            Bank & FDs
          </button>

          <button
            onClick={() => setSubTab('TICKERS')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'TICKERS'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Layers className="w-4 h-4" />
            Master Tickers Directory
          </button>

          <button
            onClick={() => setSubTab('SYSTEM')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'SYSTEM'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Wrench className="w-4 h-4" />
            System Integrations & Maintenance
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {subTab === 'MEMBERS' && (
          <FamilyMembersManagerView />
        )}
        {subTab === 'PORTFOLIOS' && (
          <PortfolioManagerView
            showToast={showToast}
            triggerLoader={triggerLoader}
          />
        )}

        {subTab === 'BANK_FDS' && (
          <BankAndFDsView
            portfolios={portfolios}
            selectedPortfolio={selectedPortfolio}
            onDataChanged={onDataChanged}
          />
        )}

        {subTab === 'TICKERS' && (
          <MasterTickersView
            onAddTicker={onAddTicker}
            onEditTicker={onEditTicker}
            onDeleteTicker={onDeleteTicker}
            onMergeTickers={onMergeTickers}
            formatCurrency={formatCurrency}
          />
        )}

        {subTab === 'SYSTEM' && (
          <SettingsView
            onPurgeBankBook={onPurgeBankBook}
            onPurgeTransactions={onPurgeTransactions}
            onPurgeEverything={onPurgeEverything}
          />
        )}
      </div>
    </div>
  );
}
