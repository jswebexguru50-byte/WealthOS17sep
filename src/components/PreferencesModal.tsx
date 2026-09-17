import React, { useState, useEffect } from 'react';
import { X, SlidersHorizontal, Check, Info } from 'lucide-react';
import { 
  UserPreferences, 
  getUserPreferences, 
  saveUserPreferences, 
  DEFAULT_PREFERENCES 
} from '../lib/preferences.js';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreferencesUpdated?: (prefs: UserPreferences) => void;
}

export function PreferencesModal({
  isOpen,
  onClose,
  onPreferencesUpdated
}: PreferencesModalProps) {
  const [prefs, setPrefs] = useState<UserPreferences>(getUserPreferences());

  useEffect(() => {
    if (isOpen) {
      setPrefs(getUserPreferences());
    }
  }, [isOpen]);

  const handleApply = () => {
    saveUserPreferences(prefs);
    if (onPreferencesUpdated) {
      onPreferencesUpdated(prefs);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div 
        className="rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl transition-all border"
        style={{
          background: 'var(--bg-modal, #FFFFFF)',
          borderColor: 'var(--border-card, #1E293B)',
          color: 'var(--text-primary, #0F172A)'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: 'var(--border-card, #1E293B)',
            background: 'var(--bg-sidebar, #0A2240)',
            color: 'var(--text-sidebar, #F8FAFC)'
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display tracking-tight text-white">
                Set Preferences
              </h3>
              <p className="text-xs text-slate-300">
                Configure table sorting, zero holdings, currency numbering, and fonts.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          
          {/* Default Sort */}
          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 font-bold text-slate-700 dark:text-slate-300">
              Default Sort:
            </label>
            <div className="col-span-8">
              <select
                value={prefs.defaultSort}
                onChange={(e) => setPrefs({ ...prefs, defaultSort: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-bold text-slate-200 cursor-pointer"
              >
                <option value="TODAYS_GAIN">Today's Gain</option>
                <option value="CURRENT_VALUE">Current Value</option>
                <option value="UNREALISED_GAIN">Unrealised Gain</option>
                <option value="AMOUNT_INVESTED">Amount Invested</option>
                <option value="ALPHABETICAL">Alphabetical (A - Z)</option>
              </select>
            </div>
          </div>

          {/* Sort Direction */}
          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 font-bold text-slate-700 dark:text-slate-300">
              Sort Direction:
            </label>
            <div className="col-span-8 flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="sortDirection"
                  checked={prefs.sortDirection === 'ASC'}
                  onChange={() => setPrefs({ ...prefs, sortDirection: 'ASC' })}
                  className="text-blue-600 cursor-pointer"
                />
                Ascending
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="sortDirection"
                  checked={prefs.sortDirection === 'DESC'}
                  onChange={() => setPrefs({ ...prefs, sortDirection: 'DESC' })}
                  className="text-blue-600 cursor-pointer"
                />
                Descending
              </label>
            </div>
          </div>

          {/* Zero Holdings */}
          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 font-bold text-slate-700 dark:text-slate-300">
              Zero Holdings:
            </label>
            <div className="col-span-8 flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="zeroHoldings"
                  checked={prefs.zeroHoldings === 'SHOW'}
                  onChange={() => setPrefs({ ...prefs, zeroHoldings: 'SHOW' })}
                  className="text-blue-600 cursor-pointer"
                />
                Show
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="zeroHoldings"
                  checked={prefs.zeroHoldings === 'HIDE'}
                  onChange={() => setPrefs({ ...prefs, zeroHoldings: 'HIDE' })}
                  className="text-blue-600 cursor-pointer"
                />
                Hide
              </label>
            </div>
          </div>

          {/* Decimals */}
          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 font-bold text-slate-700 dark:text-slate-300">
              Decimals:
            </label>
            <div className="col-span-8 flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="decimals"
                  checked={prefs.decimals === 'SHOW'}
                  onChange={() => setPrefs({ ...prefs, decimals: 'SHOW' })}
                  className="text-blue-600 cursor-pointer"
                />
                Show (.00)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="decimals"
                  checked={prefs.decimals === 'HIDE'}
                  onChange={() => setPrefs({ ...prefs, decimals: 'HIDE' })}
                  className="text-blue-600 cursor-pointer"
                />
                Hide (Integer)
              </label>
            </div>
          </div>

          {/* Separator / Number Format */}
          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 font-bold text-slate-700 dark:text-slate-300">
              Separator:
            </label>
            <div className="col-span-8 flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="separator"
                  checked={prefs.separator === 'LAKHS'}
                  onChange={() => setPrefs({ ...prefs, separator: 'LAKHS' })}
                  className="text-blue-600 cursor-pointer"
                />
                Lakhs (1,00,000)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="separator"
                  checked={prefs.separator === 'MILLIONS'}
                  onChange={() => setPrefs({ ...prefs, separator: 'MILLIONS' })}
                  className="text-blue-600 cursor-pointer"
                />
                Millions (100,000)
              </label>
            </div>
          </div>

          {/* Cost Basis Accounting */}
          <div className="grid grid-cols-12 items-start gap-4 pt-2 border-t border-slate-700/50">
            <div className="col-span-4">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">
                Cost Basis Accounting:
              </label>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                For in-kind PMS transfers & tax calculations
              </span>
            </div>
            <div className="col-span-8 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="costBasis"
                  checked={(prefs.costBasis || 'PMS_MARKET') === 'PMS_MARKET'}
                  onChange={() => setPrefs({ ...prefs, costBasis: 'PMS_MARKET' })}
                  className="text-blue-600 cursor-pointer mt-0.5"
                />
                <div>
                  <span className="block font-bold">PMS Capital Basis (Market Transfer Value)</span>
                  <span className="text-[10px] font-normal text-slate-400 block">
                    Measures PMS performance & XIRR against market value when capital was deployed.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold">
                <input
                  type="radio"
                  name="costBasis"
                  checked={prefs.costBasis === 'TAX_BASE'}
                  onChange={() => setPrefs({ ...prefs, costBasis: 'TAX_BASE' })}
                  className="text-blue-600 cursor-pointer mt-0.5"
                />
                <div>
                  <span className="block font-bold">Tax Cost Basis (Original Purchase Price)</span>
                  <span className="text-[10px] font-normal text-slate-400 block">
                    Measures true capital gains (LTCG/STCG) and tax liability from pre-transfer cost.
                  </span>
                </div>
              </label>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div 
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{
            borderColor: 'var(--border-card, #1E293B)',
            background: 'var(--bg-table-alt, #F8FAFC)'
          }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Apply Preferences
          </button>
        </div>

      </div>
    </div>
  );
}
