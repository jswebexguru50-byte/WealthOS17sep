/**
 * src/components/AnalyzeWorkspace.tsx
 *
 * Forwarding adapter to canonical #analyze/:symbol (StockIntelligenceView).
 * Replaces legacy component containing synthetic defaults with canonical evidence-backed view.
 */

import React, { useEffect, useState } from 'react';
import { StockIntelligenceView } from './StockIntelligenceView.js';
import { ScripSearchAutocomplete } from './ScripSearchAutocomplete.js';

export interface AnalyzeWorkspaceProps {
  initialSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
}

export const AnalyzeWorkspace: React.FC<AnalyzeWorkspaceProps> = ({
  initialSymbol,
  onSelectSymbol
}) => {
  const [symbol, setSymbol] = useState<string>(() => {
    const clean = initialSymbol ? initialSymbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim() : '';
    return clean;
  });

  useEffect(() => {
    if (initialSymbol) {
      const clean = initialSymbol.toUpperCase().replace('.NS', '').replace('.BO', '').trim();
      setSymbol(clean);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#analyze/${clean}`);
      }
    }
  }, [initialSymbol]);

  const handleSelect = (sym: string) => {
    const clean = sym.toUpperCase().replace('.NS', '').replace('.BO', '').trim();
    if (!clean) return;
    setSymbol(clean);
    if (onSelectSymbol) onSelectSymbol(clean);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#analyze/${clean}`);
    }
  };

  if (symbol) {
    return (
      <div className="w-full h-full">
        <StockIntelligenceView
          symbol={symbol}
          isOpen={true}
          onClose={() => {
            setSymbol('');
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', '#discover');
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-black text-white tracking-tight">Canonical Stock Analysis</h2>
        <p className="text-xs text-slate-400">Search any security to inspect verified technical, fundamental, FERE and QGLP intelligence.</p>
      </div>

      <ScripSearchAutocomplete
        onSelectScrip={handleSelect}
        placeholder="Search NSE/BSE symbol, company name, or sector..."
        autoFocus
      />

      <div className="flex flex-wrap gap-2 justify-center">
        {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'BHARTIARTL'].map((s) => (
          <button
            key={s}
            onClick={() => handleSelect(s)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
