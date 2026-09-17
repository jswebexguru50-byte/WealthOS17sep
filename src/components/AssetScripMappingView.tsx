import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Edit2, 
  Layers, 
  Building, 
  Sparkles,
  ArrowRight,
  Database
} from 'lucide-react';
import { ScripMappingRecord } from '../types/scripMapping.js';
import { SUPPORTED_BROKER_TEMPLATES, BrokerFormatId } from '../types/brokerTemplates.js';

export function AssetScripMappingView() {
  const [mappings, setMappings] = useState<ScripMappingRecord[]>([]);
  const [unmapped, setUnmapped] = useState<Array<{ symbol: string; count: number; portfolio: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBroker, setSelectedBroker] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    data: ScripMappingRecord;
  } | null>(null);

  useEffect(() => {
    fetchMappings();
    fetchUnmapped();
  }, [selectedBroker, searchQuery]);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBroker !== 'ALL') params.append('broker', selectedBroker);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());

      const res = await fetch(`/api/scrip-mappings?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) setMappings(data);
      else if (data && Array.isArray(data.mappings)) setMappings(data.mappings);
      else setMappings([]);
    } catch (e) {
      console.error('Failed to fetch scrip mappings:', e);
      setMappings([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnmapped = async () => {
    try {
      const res = await fetch('/api/scrip-mappings/unmapped');
      const data = await res.json();
      if (Array.isArray(data)) setUnmapped(data);
      else if (data && Array.isArray(data.unmapped)) setUnmapped(data.unmapped);
      else setUnmapped([]);
    } catch (e) {
      console.error('Failed to fetch unmapped scrips:', e);
      setUnmapped([]);
    }
  };

  const [autoResolving, setAutoResolving] = useState(false);
  const [resolveFeedback, setResolveFeedback] = useState<string | null>(null);

  const handleAutoResolve = async () => {
    setAutoResolving(true);
    setResolveFeedback(null);
    try {
      const res = await fetch('/api/scrip-mappings/auto-resolve', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResolveFeedback(`Successfully auto-resolved and mapped ${data.resolvedCount} scrips!`);
        fetchMappings();
        fetchUnmapped();
      } else {
        alert('Auto-resolve failed.');
      }
    } catch (e: any) {
      alert(`Error during auto-resolve: ${e.message}`);
    } finally {
      setAutoResolving(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!editModal || !editModal.data.raw_scrip_name.trim() || !editModal.data.symbol.trim()) return;
    try {
      await fetch('/api/scrip-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editModal.data)
      });
      setEditModal(null);
      fetchMappings();
      fetchUnmapped();
    } catch (e) {
      console.error('Failed to save mapping:', e);
    }
  };

  const handleDeleteMapping = async (id?: number) => {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this mapping alias?')) return;
    try {
      await fetch(`/api/scrip-mappings/${id}`, { method: 'DELETE' });
      fetchMappings();
    } catch (e) {
      console.error('Failed to delete mapping:', e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div 
        className="p-6 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        <div className="flex items-center gap-3.5">
          <div 
            className="p-3 rounded-2xl flex items-center justify-center font-bold"
            style={{ background: 'var(--accent-green-bg, rgba(16, 185, 129, 0.14))', color: 'var(--accent-green, #10B981)' }}
          >
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                Master Asset & Scrip Mapping Directory
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                UNIVERSAL RESOLVER
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Maps non-standard broker descriptions, PMS asset labels, and mutual fund folios to master ISINs, sectors, and asset classes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleAutoResolve}
            disabled={autoResolving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            title="Auto-match unmapped symbols against MasterTickers directory"
          >
            <Sparkles className="w-4 h-4" />
            <span>{autoResolving ? 'Resolving...' : 'Auto-Resolve Mappings'}</span>
          </button>

          <button
            onClick={() => {
              setEditModal({
                isOpen: true,
                data: {
                  source_broker: 'ZERODHA',
                  raw_scrip_name: '',
                  symbol: '',
                  isin: '',
                  asset_class: 'Equity',
                  sector: 'Diversified',
                  market_cap_tier: 'Large Cap'
                }
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Custom Mapping
          </button>
        </div>
      </div>

      {/* Resolve Feedback Banner */}
      {resolveFeedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{resolveFeedback}</span>
          </div>
          <button onClick={() => setResolveFeedback(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
      )}

      {/* Unmapped Scrips Alert Drawer */}
      {unmapped.length > 0 && (
        <div className="p-4 rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <h4 className="font-bold text-amber-900 dark:text-amber-200">
              {unmapped.length} Scrips detected without Master Ticker linkage
            </h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {unmapped.slice(0, 8).map((u, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setEditModal({
                      isOpen: true,
                      data: {
                        source_broker: 'GENERIC_CSV',
                        raw_scrip_name: u.symbol,
                        symbol: u.symbol,
                        isin: '',
                        asset_class: 'Equity',
                        sector: 'Diversified',
                        market_cap_tier: 'Large Cap'
                      }
                    });
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 dark:bg-slate-950 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 font-mono font-bold hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>{u.symbol}</span>
                  <span className="text-[10px] opacity-70">({u.portfolio})</span>
                  <ArrowRight className="w-3 h-3 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div 
        className="p-4 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
        style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Source Broker:</span>
          <select
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 text-slate-200 cursor-pointer"
          >
            <option value="ALL">All Sources ({mappings.length})</option>
            {SUPPORTED_BROKER_TEMPLATES.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search raw scrip description, symbol, or ISIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 text-slate-200"
          />
        </div>
      </div>

      {/* Mappings Table */}
      <div 
        className="rounded-3xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead 
              className="font-bold border-b text-slate-300 uppercase text-[10px] tracking-wider"
              style={{ background: 'var(--bg-table-alt, #F8FAFC)', borderColor: 'var(--border-card, #1E293B)' }}
            >
              <tr>
                <th className="py-3.5 px-4">SOURCE BROKER</th>
                <th className="py-3.5 px-4">RAW SCRIP / STATEMENT DESCRIPTION</th>
                <th className="py-3.5 px-4">NORMALIZED SYMBOL</th>
                <th className="py-3.5 px-4">MASTER ISIN</th>
                <th className="py-3.5 px-4">ASSET CLASS</th>
                <th className="py-3.5 px-4">SECTOR</th>
                <th className="py-3.5 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {mappings.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-sans font-bold px-2 py-0.5 rounded-md bg-slate-800 dark:bg-slate-800 text-slate-200">
                      {m.source_broker}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans font-semibold text-white">
                    {m.raw_scrip_name}
                  </td>
                  <td className="py-3 px-4 font-bold text-blue-600 dark:text-blue-400">
                    {m.symbol}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {m.isin || '-'}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                      {m.asset_class}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-200">
                    {m.sector || 'Diversified'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditModal({ isOpen: true, data: m })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMapping(m.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    No custom scrip mappings found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Mapping Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div 
            className="rounded-3xl w-full max-w-lg p-6 space-y-5 border shadow-2xl"
            style={{ background: 'var(--bg-modal, #FFFFFF)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="pb-3 border-b border-slate-800 dark:border-slate-800">
              <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                {editModal.data.id ? 'Edit Scrip Mapping Alias' : 'Create New Scrip Mapping'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Link statement text to clean Master Ticker attributes.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Source Broker / Format</label>
                <select
                  value={editModal.data.source_broker}
                  onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, source_broker: e.target.value } })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                >
                  {SUPPORTED_BROKER_TEMPLATES.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                  <option value="GENERIC_CSV">Generic CSV Statement</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Raw Scrip Text from Statement</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC SKY EQ HDFCBANK-EQ, INF174K01LS2"
                  value={editModal.data.raw_scrip_name}
                  onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, raw_scrip_name: e.target.value } })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Target Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFCBANK, RELIANCE"
                    value={editModal.data.symbol}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, symbol: e.target.value.toUpperCase() } })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-mono font-bold text-slate-200 uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">ISIN (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. INE040A01034"
                    value={editModal.data.isin || ''}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, isin: e.target.value.toUpperCase() } })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-mono text-slate-200 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Asset Class</label>
                  <select
                    value={editModal.data.asset_class}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, asset_class: e.target.value } })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                  >
                    <option value="Equity">Equity / Listed Stock</option>
                    <option value="Mutual Fund">Mutual Fund</option>
                    <option value="PMS">Portfolio Management Service (PMS)</option>
                    <option value="Fixed Deposit">Fixed Deposit & Debt</option>
                    <option value="Unlisted">Unlisted Equity</option>
                    <option value="Global">Global Equity</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Sector</label>
                  <input
                    type="text"
                    placeholder="e.g. Banking, Technology"
                    value={editModal.data.sector || ''}
                    onChange={(e) => setEditModal({ ...editModal, data: { ...editModal.data, sector: e.target.value } })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 dark:border-slate-800">
              <button
                onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMapping}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all cursor-pointer"
              >
                Save Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
