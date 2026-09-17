import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Briefcase } from 'lucide-react';

interface MultiPortfolioSelectProps {
  portfolios: string[];
  selectedPortfolio: string;
  onChange: (selected: string) => void;
}

export function MultiPortfolioSelect({
  portfolios,
  selectedPortfolio,
  onChange
}: MultiPortfolioSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isCombined = !selectedPortfolio || selectedPortfolio === 'Combined' || selectedPortfolio === 'all';

  // Parse effective active selected list (case-insensitive mapping to actual portfolio names)
  const getEffectiveSelectedList = (): string[] => {
    if (selectedPortfolio === 'none') {
      return [];
    }
    if (isCombined) {
      return [...portfolios];
    }
    const raw = selectedPortfolio.split(',').map(p => p.trim()).filter(Boolean);
    const matched = portfolios.filter(p => 
      raw.some(r => r.toLowerCase() === p.toLowerCase())
    );
    return matched.length > 0 ? matched : raw;
  };

  const selectedList = getEffectiveSelectedList();
  const isCombinedOrAll = isCombined || (portfolios.length > 0 && selectedList.length === portfolios.length);

  // Single-select portfolio directly on row click (switches workspace & closes dropdown immediately)
  const handleSingleSelect = (p: string) => {
    onChange(p);
    setIsOpen(false);
  };

  // Toggle individual portfolio in multi-select mode
  const handleTogglePortfolio = (p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newList: string[];
    const isCurrentlySelected = selectedList.some(item => item.toLowerCase() === p.toLowerCase());
    
    if (isCurrentlySelected) {
      newList = selectedList.filter(item => item.toLowerCase() !== p.toLowerCase());
    } else {
      newList = [...selectedList, p];
    }

    if (newList.length === portfolios.length) {
      onChange('Combined');
    } else if (newList.length === 0) {
      onChange('none');
    } else {
      onChange(newList.join(','));
    }
  };

  // Combined portfolio toggle: Clicking it once selects all, clicking it again deselects all
  const handleToggleCombined = () => {
    if (isCombinedOrAll) {
      // If currently all selected -> Deselect all
      onChange('none');
    } else {
      // If partially or none selected -> Select all
      onChange('Combined');
    }
    setIsOpen(false);
  };

  // Format display text
  const getDisplayText = () => {
    if (isCombinedOrAll) {
      return 'Combined Portfolio';
    }
    if (selectedList.length === 0) {
      return 'No Portfolio Selected';
    }
    if (selectedList.length === 1) {
      return selectedList[0];
    }
    return `${selectedList.length} Portfolios Selected`;
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef} id="multi-portfolio-select-container">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 text-xs font-semibold pl-4.5 pr-3.5 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:border-emerald-500/80 transition-all select-none"
        id="multi-portfolio-select-btn"
      >
        <Briefcase className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="truncate max-w-[150px] font-bold">{getDisplayText()}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800/90 shadow-2xl z-50 py-1.5 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-100"
          id="multi-portfolio-select-dropdown"
        >
          <div className="px-3.5 py-2 border-b border-slate-850 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Select Workspace Portfolio</span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">{selectedList.length} / {portfolios.length}</span>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {/* Combined Portfolio Master Toggle Option */}
            <div
              onClick={handleToggleCombined}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer text-left border-b border-slate-800/60 pb-2 mb-1 ${
                isCombinedOrAll 
                  ? 'bg-emerald-500/15 text-emerald-400 border-l-2 border-l-emerald-500' 
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-850/80'
              }`}
              title="Click to toggle: select all / deselect all"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                  isCombinedOrAll 
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950' 
                    : 'border-slate-600 bg-slate-850'
                }`}>
                  {isCombinedOrAll && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span>Combined Portfolio (All)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-semibold">
                {isCombinedOrAll ? 'Deselect All' : 'Select All'}
              </span>
            </div>

            {/* Individual portfolios */}
            {portfolios.map(p => {
              const isSelectedOnly = selectedList.length === 1 && selectedList[0].toLowerCase() === p.toLowerCase();
              const isChecked = selectedList.some(item => item.toLowerCase() === p.toLowerCase());
              return (
                <div
                  key={p}
                  onClick={() => handleSingleSelect(p)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs transition-colors cursor-pointer text-left group ${
                    isSelectedOnly
                      ? 'bg-emerald-500/15 text-emerald-400 font-bold border-l-2 border-l-emerald-500'
                      : isChecked
                      ? 'text-slate-200 font-semibold hover:bg-slate-850/80'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      onClick={(e) => handleTogglePortfolio(p, e)}
                      title="Toggle checkbox for multi-portfolio view"
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950' 
                          : 'border-slate-600 bg-slate-850 hover:border-slate-400'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{p}</span>
                  </div>

                  <span 
                    onClick={(e) => { e.stopPropagation(); handleSingleSelect(p); }}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-emerald-500 hover:text-slate-950 transition-all font-bold"
                    title={`View only ${p}`}
                  >
                    Only
                  </span>
                </div>
              );
            })}
          </div>

          {portfolios.length === 0 && (
            <div className="px-3.5 py-4 text-center">
              <p className="text-xs text-slate-500">No portfolios found in database.</p>
              <p className="text-[10px] text-slate-600 mt-1">Add transactions to populate.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
