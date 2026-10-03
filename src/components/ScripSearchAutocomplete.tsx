import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, TrendingUp, Building2 } from 'lucide-react';

export interface ScripSearchResult {
  symbol: string;
  companyName: string | null;
  isin: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  marketCapCr?: number | null;
}

export interface ScripSearchAutocompleteProps {
  onSelectScrip: (symbol: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  className?: string;
}

function formatMarketCap(marketCapCr?: number | null): string | null {
  if (marketCapCr === null || marketCapCr === undefined || isNaN(marketCapCr)) {
    return null;
  }
  if (marketCapCr >= 100000) {
    return `₹${(marketCapCr / 100000).toFixed(2)}L Cr`;
  }
  if (marketCapCr >= 1000) {
    return `₹${(marketCapCr / 1000).toFixed(1)}K Cr`;
  }
  return `₹${Math.round(marketCapCr).toLocaleString('en-IN')} Cr`;
}

export const ScripSearchAutocomplete: React.FC<ScripSearchAutocompleteProps> = ({
  onSelectScrip,
  placeholder = 'Search by Symbol, Company Name, ISIN, Sector...',
  autoFocus = false,
  compact = false,
  className = ''
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScripSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchScrips = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const q = searchQuery.trim();
      const url = q
        ? `/api/scrips/search?q=${encodeURIComponent(q)}&limit=20`
        : `/api/scrips/search?limit=20`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      const list: ScripSearchResult[] = Array.isArray(json)
        ? json
        : (json?.data || json?.results || json?.tickers || []);

      setResults(list);
      setHighlightedIndex(-1);
    } catch (err) {
      console.error('[ScripSearchAutocomplete] Failed to fetch scrips:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchScrips(val);
    }, 180);
  };

  const handleSelect = (symbol: string) => {
    const clean = symbol.trim().toUpperCase().replace(/\s+/g, '');
    if (!clean) return;
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
    onSelectScrip(clean);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        if (results.length === 0) {
          fetchScrips(query);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex].symbol);
      } else if (query.trim()) {
        handleSelect(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input Group */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          ) : (
            <Search className="w-4 h-4 text-indigo-400" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            setIsOpen(true);
            if (results.length === 0) fetchScrips(query);
          }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-expanded={isOpen}
          role="combobox"
          className={`w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-10 pr-24 ${
            compact ? 'py-2 text-xs' : 'py-3 text-sm'
          } text-white placeholder-slate-400 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 shadow-inner transition-all`}
        />

        <div className="absolute right-2.5 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                handleSelect(results[highlightedIndex].symbol);
              } else if (query.trim()) {
                handleSelect(query.trim());
              }
            }}
            disabled={!query.trim() && (highlightedIndex < 0 || !results[highlightedIndex])}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              query.trim() || highlightedIndex >= 0
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Analyze →
          </button>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-slate-900/95 border border-slate-700/90 rounded-2xl shadow-2xl backdrop-blur-xl divide-y divide-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-150">
          {results.length > 0 ? (
            results.map((item, index) => {
              const isSelected = highlightedIndex === index;
              const mcapStr = formatMarketCap(item.marketCapCr);

              return (
                <div
                  key={`${item.symbol}-${index}`}
                  onClick={() => handleSelect(item.symbol)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-600/25 border-l-2 border-indigo-400' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm tracking-wide">
                          {item.symbol}
                        </span>
                        {item.exchange && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {item.exchange}
                          </span>
                        )}
                        {item.sector && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 truncate max-w-[140px]">
                            {item.sector}
                          </span>
                        )}
                      </div>

                      {item.companyName && (
                        <p className="text-xs text-slate-300 truncate max-w-sm mt-0.5">
                          {item.companyName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    {mcapStr && (
                      <span className="text-xs font-mono font-semibold text-emerald-400 block">
                        {mcapStr}
                      </span>
                    )}
                    {item.industry && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px] block">
                        {item.industry}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center text-xs text-slate-400 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 text-cyan-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching MasterTickers...</span>
                </div>
              ) : query.trim() ? (
                <>
                  <p className="text-slate-300 font-semibold">No direct ticker matches found for "{query}"</p>
                  <p className="text-[11px] text-slate-500">
                    Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">Enter</kbd> to analyze <span className="font-mono text-cyan-300">{query.toUpperCase()}</span> directly.
                  </p>
                </>
              ) : (
                <p>Type a ticker symbol, company name, or sector to search.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
