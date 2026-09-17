import React, { useState } from 'react';
import { Receipt, Percent, Coins } from 'lucide-react';
import { TransactionsView } from './TransactionsView.js';
import { TaxView } from './TaxView.js';
import { CorporateActionsView } from './CorporateActionsView.js';
import { Transaction } from '../types.js';

interface LedgerHubViewProps {
  selectedPortfolio: string;
  setSelectedPortfolio: (p: string) => void;
  portfolios: string[];
  onAddTransaction: (txn: Partial<Transaction>) => Promise<boolean>;
  onEditTransaction: (id: number, txn: Partial<Transaction>) => Promise<boolean>;
  onDeleteTransaction: (id: number) => Promise<boolean>;
  onBulkAction: (action: 'DELETE' | 'UPDATE', ids: number[], fields?: Partial<Transaction>) => Promise<boolean>;
  formatCurrency: (val: number) => string;
  onApplyPendingCorporateActions: () => Promise<void>;
  onAddCorporateAction: (act: any) => Promise<boolean>;
  onEditCorporateAction: (id: number, act: any) => Promise<boolean>;
  onDeleteCorporateAction: (id: number) => Promise<boolean>;
}

export function LedgerHubView({
  selectedPortfolio,
  setSelectedPortfolio,
  portfolios,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onBulkAction,
  formatCurrency,
  onApplyPendingCorporateActions,
  onAddCorporateAction,
  onEditCorporateAction,
  onDeleteCorporateAction
}: LedgerHubViewProps) {
  const [subTab, setSubTab] = useState<'TRANSACTIONS' | 'TAX' | 'CORPORATE'>('TRANSACTIONS');

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Pills */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setSubTab('TRANSACTIONS')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'TRANSACTIONS'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Tradebook Transactions
          </button>

          <button
            onClick={() => setSubTab('TAX')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'TAX'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Percent className="w-4 h-4" />
            Tax & Realized Gains
          </button>

          <button
            onClick={() => setSubTab('CORPORATE')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              subTab === 'CORPORATE'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            <Coins className="w-4 h-4" />
            Corporate Events & Dividends
          </button>
        </div>
      </div>

      {/* Sub-Tab Rendering */}
      {subTab === 'TRANSACTIONS' && (
        <TransactionsView
          selectedPortfolio={selectedPortfolio}
          setSelectedPortfolio={setSelectedPortfolio}
          portfolios={portfolios}
          onAddTransaction={onAddTransaction}
          onEditTransaction={onEditTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onBulkAction={onBulkAction}
          formatCurrency={formatCurrency}
        />
      )}

      {subTab === 'TAX' && (
        <TaxView
          selectedPortfolio={selectedPortfolio}
          setSelectedPortfolio={setSelectedPortfolio}
          portfolios={portfolios}
          formatCurrency={formatCurrency}
        />
      )}

      {subTab === 'CORPORATE' && (
        <CorporateActionsView
          onApplyPending={onApplyPendingCorporateActions}
          onAddAction={onAddCorporateAction}
          onEditAction={onEditCorporateAction}
          onDeleteAction={onDeleteCorporateAction}
        />
      )}
    </div>
  );
}
