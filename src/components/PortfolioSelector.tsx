import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, X, Search, CheckSquare, Square, SlidersHorizontal } from 'lucide-react';

interface PortfolioSelectorProps {
  portfolios: string[];
  selectedPortfolio: string;
  setSelectedPortfolio: (portfolio: string) => void;
}

export function PortfolioSelector({
  portfolios,
  selectedPortfolio,
  setSelectedPortfolio
}: PortfolioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse currently selected portfolios into a Set
  const getSelectedSet = (): Set<string> => {
    if (!selectedPortfolio || selectedPortfolio === 'Combined' || selectedPortfolio === 'all') {
      return new Set<string>(); // Empty means "All / Combined"
    }
    return new Set(selectedPortfolio.split(',').map(p => p.trim()).filter(Boolean));
  };

  const selectedSet = getSelectedSet();
  const isAllSelected = !selectedPortfolio || selectedPortfolio === 'Combined' || selectedPortfolio === 'all';

  // Single select portfolio on text/row click (closes menu)
  const handleSingleSelectPortfolio = (p: string) => {
    setSelectedPortfolio(p);
    setIsOpen(false);
  };

  // Toggle individual portfolio selection on checkbox click
  const handleTogglePortfolio = (p: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentSet = getSelectedSet();
    if (currentSet.has(p)) {
      currentSet.delete(p);
    } else {
      currentSet.add(p);
    }

    if (currentSet.size === 0) {
      setSelectedPortfolio('Combined');
    } else {
      setSelectedPortfolio(Array.from(currentSet).join(','));
    }
  };

  // Reset to all/combined
  const handleSelectAll = () => {
    setSelectedPortfolio('Combined');
    setIsOpen(false);
  };

  // Clear all (defaults to first portfolio or Combined)
  const handleClearAll = () => {
    if (portfolios.length > 0) {
      setSelectedPortfolio(portfolios[0]);
    } else {
      setSelectedPortfolio('Combined');
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter portfolios by search term
  const filteredPortfolios = portfolios.filter(p =>
    p.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Generate Button label text
  const getButtonLabel = () => {
    if (isAllSelected || portfolios.length === 0) {
      return 'All Portfolios';
    }
    if (selectedSet.size === 1) {
      return Array.from(selectedSet)[0];
    }
    return `${selectedSet.size} Portfolios Selected`;
  };

  return (
    <div className="relative" ref={dropdownRef} id="portfolio-selector-container">
      {/* Dropdown Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 select-none cursor-pointer ${
          isOpen
            ? 'bg-slate-900 border-emerald-500 text-slate-100 shadow-md shadow-emerald-500/5'
            : isAllSelected
            ? 'bg-slate-900/60 border-slate-800 text-emerald-400 hover:text-emerald-300 hover:border-slate-700'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
        }`}
        id="portfolio-dropdown-trigger"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span className="truncate max-w-[180px]">{getButtonLabel()}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} />
      </button>

      {/* Dropdown List Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800/90 rounded-2xl shadow-2xl z-50 overflow-hidden"
            id="portfolio-dropdown-menu"
          >
            {/* Search Box */}
            {portfolios.length > 5 && (
              <div className="p-3 border-b border-slate-850 flex items-center gap-2 bg-slate-950/40">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Search portfolios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs font-medium placeholder-slate-500 w-full focus:outline-none"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Quick Actions (Select All / Clear) */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-850 bg-slate-950/20 text-[10px] font-mono tracking-wider uppercase text-slate-400">
              <span className="font-bold">Portfolios</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectAll}
                  className="text-slate-300 hover:text-emerald-400 transition-colors font-semibold cursor-pointer"
                >
                  All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={handleClearAll}
                  className="text-slate-300 hover:text-rose-400 transition-colors font-semibold cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Scrollable list */}
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
              {/* Combined / All option */}
              <button
                onClick={handleSelectAll}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
                  isAllSelected
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-300 hover:bg-slate-850 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    isAllSelected
                      ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                      : 'border-slate-700 bg-slate-950'
                  }`}>
                    {isAllSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span>Combined (All Portfolios)</span>
                </div>
              </button>

              {/* Individual Portfolios */}
              {filteredPortfolios.map(p => {
                const isSelected = selectedSet.has(p);
                return (
                  <div
                    key={p}
                    onClick={() => handleSingleSelectPortfolio(p)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-all cursor-pointer select-none ${
                      isSelected && !isAllSelected
                        ? 'bg-emerald-500/10 text-emerald-400 font-semibold'
                        : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div 
                        onClick={(e) => handleTogglePortfolio(p, e)}
                        title="Toggle multi-select"
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${
                          isSelected && !isAllSelected
                            ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                            : 'border-slate-700 bg-slate-950 hover:border-emerald-500/50'
                        }`}
                      >
                        {isSelected && !isAllSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate max-w-[200px]">{p}</span>
                    </div>
                  </div>
                );
              })}

              {filteredPortfolios.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500 font-medium">
                  No portfolios found
                </div>
              )}
            </div>

            {/* Selection Summary Footer */}
            {!isAllSelected && selectedSet.size > 0 && (
              <div className="p-3 bg-slate-950/60 border-t border-slate-850 text-[11px] text-slate-400 flex flex-wrap gap-1 items-center max-w-full">
                <span className="text-slate-500 font-mono">Filter:</span>
                {Array.from(selectedSet).map(p => (
                  <span key={p} className="bg-slate-800 text-slate-300 border border-slate-700/60 px-1.5 py-0.5 rounded-md truncate max-w-[100px] font-semibold">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
