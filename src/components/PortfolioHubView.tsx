import React, { useState } from 'react';
import { LayoutDashboard, BarChart3, PieChart, Sparkles } from 'lucide-react';
import { DashboardView } from './DashboardView.js';
import { AnalyticsView } from './AnalyticsView.js';
import { InstitutionalAnalyticsHub } from './InstitutionalAnalyticsHub.js';
import { getUserPreferences, saveUserPreferences } from '../lib/preferences.js';

interface PortfolioHubViewProps {
  metrics: any;
  holdings: any[];
  portfolios: string[];
  selectedPortfolio: string;
  setSelectedPortfolio: (p: string) => void;
  includeSold: boolean;
  setIncludeSold: (inc: boolean) => void;
  onRefreshPrices: () => void;
  onWebPriceMatch?: () => void;
  onRecalculateFIFO: () => void;
  growthHistory: any[];
  annualFyData?: any[];
  benchmarkSymbol: string;
  onBenchmarkChange: (sym: string) => void;
  showStockDrilldown: (symbol: string) => void;
  formatCurrency: (val: number) => string;
  setActiveTab?: (tab: 'PORTFOLIO' | 'LEDGER' | 'IMPORTS' | 'SETTINGS') => void;
}

export function PortfolioHubView({
  metrics,
  holdings,
  portfolios,
  selectedPortfolio,
  setSelectedPortfolio,
  includeSold,
  setIncludeSold,
  onRefreshPrices,
  onWebPriceMatch,
  onRecalculateFIFO,
  growthHistory,
  annualFyData = [],
  benchmarkSymbol,
  onBenchmarkChange,
  showStockDrilldown,
  formatCurrency,
  setActiveTab
}: PortfolioHubViewProps) {
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'INSTITUTIONAL_ANALYTICS' | 'ANALYTICS'>('OVERVIEW');
  const [assetCategory, setAssetCategory] = useState<'ALL' | 'EQ' | 'MF' | 'AIF' | 'BNK' | 'PMS' | 'GLOBAL'>('ALL');

  // Categorize holdings matching Institutional multi-asset classes + AIF
  const categorizedHoldings = React.useMemo(() => {
    let eqCount = 0;
    let mfCount = 0;
    let aifCount = 0;
    let bnkCount = 0;
    let pmsCount = 0;
    let globalCount = 0;

    for (const h of holdings) {
      const isin = (h.isin || '').toUpperCase();
      const sym = (h.symbol || '').toUpperCase();
      const p = (h.portfolio || '').toLowerCase();
      const ac = (h.asset_class || '').toLowerCase();
      const ht = (h.holding_type || '').toUpperCase();

      if (ht === 'AIF' || sym.includes('SMART HORIZON') || sym.includes('UL-SMART') || sym.includes('AIF') || isin.includes('HORIZON')) {
        aifCount++;
      } else if (p === 'us - ibkr' || p === 'sarwa' || (h.currency && h.currency !== 'INR')) {
        globalCount++;
      } else if (p === 'cc9' || p === 'iifl360') {
        pmsCount++;
      } else if (p.includes('cash') || p.includes('fd') || sym.includes('FD') || ac.includes('fixed')) {
        bnkCount++;
      } else if (isin.startsWith('INF') || p.includes('mf') || p.includes('mutual') || ac.includes('mutual')) {
        mfCount++;
      } else {
        eqCount++;
      }
    }

    const filtered = holdings.filter(h => {
      if (assetCategory === 'ALL') return true;
      const isin = (h.isin || '').toUpperCase();
      const sym = (h.symbol || '').toUpperCase();
      const p = (h.portfolio || '').toLowerCase();
      const ac = (h.asset_class || '').toLowerCase();
      const ht = (h.holding_type || '').toUpperCase();
      const isAif = ht === 'AIF' || sym.includes('SMART HORIZON') || sym.includes('UL-SMART') || sym.includes('AIF') || isin.includes('HORIZON');

      if (assetCategory === 'AIF') {
        return isAif;
      }
      if (assetCategory === 'GLOBAL') {
        return !isAif && (p === 'us - ibkr' || p === 'sarwa' || (h.currency && h.currency !== 'INR'));
      }
      if (assetCategory === 'PMS') {
        return !isAif && (p === 'cc9' || p === 'iifl360');
      }
      if (assetCategory === 'BNK') {
        return !isAif && (p.includes('cash') || p.includes('fd') || sym.includes('FD') || ac.includes('fixed'));
      }
      if (assetCategory === 'MF') {
        return !isAif && (isin.startsWith('INF') || p.includes('mf') || p.includes('mutual') || ac.includes('mutual'));
      }
      if (assetCategory === 'EQ') {
        return !isAif && !isin.startsWith('INF') && !p.includes('mf') && !p.includes('mutual') && !p.includes('cash') && p !== 'us - ibkr' && p !== 'sarwa' && p !== 'cc9' && p !== 'iifl360';
      }
      return true;
    });

    return {
      counts: { ALL: holdings.length, EQ: eqCount, MF: mfCount, AIF: aifCount, BNK: bnkCount, PMS: pmsCount, GLOBAL: globalCount },
      filtered
    };
  }, [holdings, assetCategory]);

  return (
    <div className="space-y-4">
      {/* Navigation Sub-Tabs Header & Asset Strip */}
      <div 
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-2.5 rounded-2xl border shadow-sm backdrop-blur-md"
        style={{
          background: 'var(--bg-card, #0F172A)',
          borderColor: 'var(--border-card, #1E293B)'
        }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSubTab('OVERVIEW')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              subTab === 'OVERVIEW'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </button>
          
          <button
            onClick={() => setSubTab('INSTITUTIONAL_ANALYTICS')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              subTab === 'INSTITUTIONAL_ANALYTICS'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            Analytics
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-300 font-mono">NEW</span>
          </button>

          <button
            onClick={() => setSubTab('ANALYTICS')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              subTab === 'ANALYTICS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Ratios
          </button>
        </div>

        {/* Institutional Asset Classification Strip */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 overflow-x-auto">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-2 hidden sm:inline">
            Asset:
          </span>
          {[
            { id: 'ALL', label: 'All Assets', count: categorizedHoldings.counts.ALL },
            { id: 'EQ', label: 'EQ (Stocks)', count: categorizedHoldings.counts.EQ },
            { id: 'MF', label: 'MF (Funds)', count: categorizedHoldings.counts.MF },
            { id: 'AIF', label: 'AIFs', count: categorizedHoldings.counts.AIF },
            { id: 'BNK', label: 'BNK / FDs', count: categorizedHoldings.counts.BNK },
            { id: 'PMS', label: 'PMS / SIF', count: categorizedHoldings.counts.PMS },
            { id: 'GLOBAL', label: 'Global', count: categorizedHoldings.counts.GLOBAL },
          ].map((tab) => {
            const isSelected = assetCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setAssetCategory(tab.id as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Display Preferences Toolbar */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              const current = getUserPreferences();
              const next = current.separator === 'LAKHS' ? 'MILLIONS' : 'LAKHS';
              saveUserPreferences({ ...current, separator: next });
              window.dispatchEvent(new Event('preferences-updated'));
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition-all cursor-pointer"
            title="Toggle Indian Lakhs (1,00,000) / International Millions (100,000)"
          >
            {getUserPreferences().separator === 'LAKHS' ? '₹ Lakhs' : '$ Millions'}
          </button>
          <button
            onClick={() => {
              const current = getUserPreferences();
              const next = current.decimals === 'SHOW' ? 'HIDE' : 'SHOW';
              saveUserPreferences({ ...current, decimals: next });
              window.dispatchEvent(new Event('preferences-updated'));
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition-all cursor-pointer"
            title="Toggle Decimals: .00 vs Integer"
          >
            {getUserPreferences().decimals === 'SHOW' ? '.00' : 'Int'}
          </button>
        </div>
      </div>

      {/* Sub-Tab Content Rendering */}
      {subTab === 'OVERVIEW' && (
        <DashboardView
          metrics={metrics}
          holdings={categorizedHoldings.filtered}
          portfolios={portfolios}
          selectedPortfolio={selectedPortfolio}
          setSelectedPortfolio={setSelectedPortfolio}
          includeSold={includeSold}
          setIncludeSold={setIncludeSold}
          onRefreshPrices={onRefreshPrices}
          onWebPriceMatch={onWebPriceMatch}
          onRecalculateFIFO={onRecalculateFIFO}
          growthHistory={growthHistory}
          annualFyData={annualFyData}
          benchmarkSymbol={benchmarkSymbol}
          onBenchmarkChange={onBenchmarkChange}
          showStockDrilldown={showStockDrilldown}
          formatCurrency={formatCurrency}
          setActiveTab={setActiveTab}
        />
      )}

      {subTab === 'INSTITUTIONAL_ANALYTICS' && (
        <InstitutionalAnalyticsHub
          selectedPortfolio={selectedPortfolio}
          setSelectedPortfolio={setSelectedPortfolio}
          portfolios={portfolios}
          formatCurrency={formatCurrency}
          showStockDrilldown={showStockDrilldown}
        />
      )}

      {subTab === 'ANALYTICS' && (
        <AnalyticsView
          selectedPortfolio={selectedPortfolio}
          setSelectedPortfolio={setSelectedPortfolio}
          portfolios={portfolios}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
}


