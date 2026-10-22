import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Search,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  Info,
  XCircle,
  AlertTriangle,
  GitCompare,
  ArrowRight,
  TrendingUp,
  Coins,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { formatINR } from '../lib/formatters.js';
import { ResizableDataTable } from './ResizableDataTable.js';
import { MasterTicker } from '../types.js';

interface MasterTickersViewProps {
  onAddTicker: (ticker: Partial<MasterTicker>) => Promise<boolean>;
  onEditTicker: (id: number, ticker: Partial<MasterTicker>) => Promise<boolean>;
  onDeleteTicker: (id: number) => Promise<boolean>;
  onMergeTickers: (sourceIsin: string, targetIsin: string) => Promise<boolean>;
  formatCurrency: (val: number) => string;
}

export function MasterTickersView({
  onAddTicker,
  onEditTicker,
  onDeleteTicker,
  onMergeTickers,
  formatCurrency
}: MasterTickersViewProps) {
  const [tickers, setTickers] = useState<MasterTicker[]>([]);
  const [search, setSearch] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTicker, setEditingTicker] = useState<MasterTicker | null>(null);

  // Form Fields
  const [formIsin, setFormIsin] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formName, setFormName] = useState('');
  const [formExchange, setFormExchange] = useState('NSE');
  const [formSegment, setFormSegment] = useState('EQ');
  const [formSector, setFormSector] = useState('');
  const [formLtp, setFormLtp] = useState('');
  const [formFmv, setFormFmv] = useState('');

  // Merge Fields
  const [sourceIsin, setSourceIsin] = useState('');
  const [targetIsin, setTargetIsin] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Sector Sync State
  const [isSyncingSectors, setIsSyncingSectors] = useState(false);

  const handleSyncSectors = async () => {
    setIsSyncingSectors(true);
    try {
      const res = await fetch('/api/tickers/sync-sectors', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully synced sectors! Updated ${data.updatedCount} out of ${data.totalCount} tickers.`);
        fetchTickers();
      } else {
        alert(`Error syncing sectors: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Error syncing sectors: ${err.message}`);
    } finally {
      setIsSyncingSectors(false);
    }
  };

  const fetchTickers = async () => {
    try {
      const res = await fetch('/api/tickers');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTickers(data);
      } else if (data && Array.isArray(data.tickers)) {
        setTickers(data.tickers);
      } else if (data && Array.isArray(data.list)) {
        setTickers(data.list);
      } else {
        setTickers([]);
      }
    } catch (err) {
      console.error(err);
      setTickers([]);
    }
  };

  useEffect(() => {
    fetchTickers();
  }, []);

  const openAddModal = () => {
    setEditingTicker(null);
    setFormIsin('');
    setFormSymbol('');
    setFormName('');
    setFormExchange('NSE');
    setFormSegment('EQ');
    setFormSector('');
    setFormLtp('');
    setFormFmv('');
    setIsModalOpen(true);
  };

  const openEditModal = (t: MasterTicker) => {
    setEditingTicker(t);
    setFormIsin(t.isin);
    setFormSymbol(t.symbol);
    setFormName(t.name);
    setFormExchange(t.exchange || 'NSE');
    setFormSegment(t.segment || 'EQ');
    setFormSector(t.sector || '');
    setFormLtp(t.manual_ltp ? String(t.manual_ltp) : '');
    setFormFmv(t.fmv_31_jan_2018 ? String(t.fmv_31_jan_2018) : '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      isin: formIsin.trim().toUpperCase(),
      symbol: formSymbol.trim().toUpperCase(),
      name: formName.trim(),
      exchange: formExchange,
      segment: formSegment,
      sector: formSector.trim(),
      manual_ltp: formLtp ? parseFloat(formLtp) : null,
      fmv_31_jan_2018: formFmv ? parseFloat(formFmv) : null
    };

    let success = false;
    if (editingTicker) {
      success = await onEditTicker(editingTicker.id, payload);
    } else {
      success = await onAddTicker(payload);
    }

    if (success) {
      setIsModalOpen(false);
      fetchTickers();
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this ticker permanently from the database? This will fail if there are active transactions linked to it.')) {
      const success = await onDeleteTicker(id);
      if (success) fetchTickers();
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceIsin || !targetIsin) {
      alert('Please select both a source and target ticker.');
      return;
    }
    if (sourceIsin === targetIsin) {
      alert('Source and Target tickers must be distinct.');
      return;
    }

    if (confirm('Merge tickers? This action is irreversible. All historical transactions, trades, and corporate action entries linked to the source ISIN will be permanently re-routed to the target ISIN, and the source ticker profile will be deleted.')) {
      setIsMerging(true);
      const success = await onMergeTickers(sourceIsin, targetIsin);
      setIsMerging(false);
      if (success) {
        setSourceIsin('');
        setTargetIsin('');
        fetchTickers();
      }
    }
  };

  const safeTickers = Array.isArray(tickers) ? tickers : [];
  const filteredTickers = safeTickers.filter(t => {
    if (!t) return false;
    const s = search.toLowerCase();
    return (
      (t.symbol && t.symbol.toLowerCase().includes(s)) ||
      (t.isin && t.isin.toLowerCase().includes(s)) ||
      (t.name && t.name.toLowerCase().includes(s)) ||
      (t.sector && t.sector.toLowerCase().includes(s))
    );
  });

  // Table Sorting State
  const [sortField, setSortField] = useState<string>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Sorted Tickers
  const sortedTickers = [...filteredTickers].sort((a, b) => {
    let valA: any = a[sortField as keyof MasterTicker];
    let valB: any = b[sortField as keyof MasterTicker];

    if (valA === undefined || valA === null) return sortDirection === 'asc' ? -1 : 1;
    if (valB === undefined || valB === null) return sortDirection === 'asc' ? 1 : -1;

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  const downloadTickersCSV = () => {
    const headers = ['Symbol', 'Name', 'ISIN', 'Exchange', 'Segment', 'Sector', 'Manual LTP', 'FMV (31-Jan-2018)'];
    const rows = sortedTickers.map(t => [
      t.symbol,
      `"${(t.name || '').replace(/"/g, '""')}"`,
      t.isin,
      t.exchange || '',
      t.segment || '',
      `"${(t.sector || '').replace(/"/g, '""')}"`,
      t.manual_ltp || '',
      t.fmv_31_jan_2018 || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `scrip_directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Master Sync State
  const [isSyncingMaster, setIsSyncingMaster] = useState(false);

  const handleMasterSync = async () => {
    setIsSyncingMaster(true);
    try {
      const res = await fetch('/api/tickers/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Master Directory Sync Complete!\nSeeded New Scrips: ${data.seeded}\nSynced Records: ${data.count}`);
        fetchTickers();
      } else {
        alert(`Error syncing Master Directory: ${data.error || data.message}`);
      }
    } catch (err: any) {
      alert(`Network error syncing Master Directory: ${err.message}`);
    } finally {
      setIsSyncingMaster(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight">Master Tickers Manager</h1>
          <p className="text-slate-400 text-sm">Configure manual pricing updates, grandfathered FMVs, legacy ISINs, and corporate ticker mergers.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleMasterSync}
            disabled={isSyncingMaster}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer text-sm shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingMaster ? 'animate-spin' : ''}`} />
            {isSyncingMaster ? 'Syncing Directory...' : 'Sync Master Directory (Yahoo/Upstox)'}
          </button>

          <button
            onClick={handleSyncSectors}
            disabled={isSyncingSectors}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer text-sm shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingSectors ? 'animate-spin' : ''}`} />
            {isSyncingSectors ? 'Syncing Sectors...' : 'Sync Sectors'}
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer text-sm shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Add Master Ticker
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Merger Tool */}
        <div className="glass-card rounded-2xl p-6 lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <GitCompare className="w-5 h-5 text-indigo-400" />
            <h3 className="font-display font-semibold text-slate-200">Re-route & Merger Hub</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Did you import a company under an obsolete ticker symbol or different ISIN (e.g., due to split, renaming, or merger)? Re-route historical trades safely in one single transaction!
          </p>

          <form onSubmit={handleMerge} className="space-y-4 text-sm">
            {/* Source Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Obsolete Ticker (Source)</label>
              <select
                value={sourceIsin}
                onChange={(e) => setSourceIsin(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 text-xs rounded-xl px-4 py-2.5 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">-- Select Source to Merge --</option>
                {tickers.map(t => (
                  <option key={t.isin || t.id} value={t.isin || ''}>{(t.symbol || 'NA')} - {(t.name || 'Unnamed')} ({(t.isin || 'NA')})</option>
                ))}
              </select>
            </div>

            {/* Target Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Ticker (Target)</label>
              <select
                value={targetIsin}
                onChange={(e) => setTargetIsin(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 text-slate-200 text-xs rounded-xl px-4 py-2.5 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">-- Select Target Destination --</option>
                {tickers.map(t => (
                  <option key={t.isin || t.id} value={t.isin || ''}>{(t.symbol || 'NA')} - {(t.name || 'Unnamed')} ({(t.isin || 'NA')})</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isMerging}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-slate-100 font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2"
            >
              <GitCompare className="w-4 h-4" />
              {isMerging ? 'Merging Tickers...' : 'Merge & Re-route Trades'}
            </button>
          </form>
        </div>

        {/* Master Tickers Listing */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <h3 className="font-display text-xl font-bold text-slate-200 tracking-tight">Active Scrip Directory</h3>
            
            {/* Search & Download */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={downloadTickersCSV}
                className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-emerald-400 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, ISIN, sector..."
                  className="w-full sm:w-64 bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors"
                />
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <ResizableDataTable<MasterTicker>
            tableId="master_tickers"
            columns={[
              {
                id: 'symbol',
                header: 'Scrip Description',
                cell: (t) => (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-slate-100">{t.symbol}</span>
                      <span className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                        {t.exchange}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-[200px] mt-0.5">{t.name}</p>
                    <span className="text-[10px] text-slate-500 font-mono block">{t.isin}</span>
                  </div>
                ),
                width: 220,
                sortable: true,
                sortValue: (t) => t.symbol,
                defaultPinned: 'left'
              },
              {
                id: 'segment',
                header: 'Segment',
                cell: (t) => (
                  <span className="bg-slate-900 text-slate-300 border border-slate-800 text-[10px] px-2 py-0.5 rounded-md font-mono">
                    {t.segment}
                  </span>
                ),
                width: 120,
                sortable: true,
                sortValue: (t) => t.segment
              },
              {
                id: 'sector',
                header: 'Sector',
                cell: (t) => <span className="text-slate-400 text-xs">{t.sector || 'Unassigned'}</span>,
                width: 160,
                sortable: true,
                sortValue: (t) => t.sector
              },
              {
                id: 'manual_ltp',
                header: 'Manual LTP',
                cell: (t) => (
                  t.manual_ltp ? (
                    <div>
                      <span className="text-slate-200">{formatCurrency(t.manual_ltp)}</span>
                      {t.manual_ltp_date && (
                        <p className="text-[9px] text-slate-500">as of {t.manual_ltp_date}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )
                ),
                width: 140,
                align: 'right',
                sortable: true,
                sortValue: (t) => t.manual_ltp
              },
              {
                id: 'fmv_31_jan_2018',
                header: 'FMV (31-Jan-2018)',
                cell: (t) => (
                  t.fmv_31_jan_2018 ? (
                    <span className="text-indigo-400">{formatCurrency(t.fmv_31_jan_2018)}</span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )
                ),
                width: 160,
                align: 'right',
                sortable: true,
                sortValue: (t) => t.fmv_31_jan_2018
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: (t) => (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 bg-rose-950/30 border border-rose-500/10 hover:border-rose-500 hover:text-rose-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    </button>
                  </div>
                ),
                width: 100,
                align: 'center'
              }
            ]}
            data={sortedTickers}
            keyExtractor={(t) => t.isin || String(t.id)}
            emptyMessage="No master tickers found matching search query."
          />
        </div>
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="max-w-md w-full rounded-2xl glass-card border border-slate-800/80 p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <h3 className="font-display font-semibold text-lg text-slate-100">
                  {editingTicker ? 'Modify Ticker Specifications' : 'Register New Master Ticker'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-100 transition-colors focus:outline-none"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  {/* ISIN */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ISIN</label>
                    <input
                      type="text"
                      required
                      value={formIsin}
                      onChange={(e) => setFormIsin(e.target.value)}
                      placeholder="e.g. INE009A01021"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Symbol */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Symbol</label>
                    <input
                      type="text"
                      required
                      value={formSymbol}
                      onChange={(e) => setFormSymbol(e.target.value)}
                      placeholder="e.g. INFY"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Company Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Infosys Ltd."
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Exchange */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Exchange</label>
                    <select
                      value={formExchange}
                      onChange={(e) => setFormExchange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="NSE">NSE (India)</option>
                      <option value="BSE">BSE (India)</option>
                      <option value="NASDAQ">NASDAQ (US)</option>
                      <option value="NYSE">NYSE (US)</option>
                      <option value="AMEX">AMEX (US)</option>
                    </select>
                  </div>

                  {/* Segment */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Segment</label>
                    <input
                      type="text"
                      required
                      value={formSegment}
                      onChange={(e) => setFormSegment(e.target.value)}
                      placeholder="e.g. EQ"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Sector */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Industry Sector</label>
                  <input
                    type="text"
                    value={formSector}
                    onChange={(e) => setFormSector(e.target.value)}
                    placeholder="e.g. Technology"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Manual LTP Pricing */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LTP Price Override (INR)</label>
                    <input
                      type="number"
                      step="any"
                      value={formLtp}
                      onChange={(e) => setFormLtp(e.target.value)}
                      placeholder="Leave blank for live"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* Grandfathered FMV */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">31-Jan-2018 FMV Value</label>
                    <input
                      type="number"
                      step="any"
                      value={formFmv}
                      onChange={(e) => setFormFmv(e.target.value)}
                      placeholder="Sec 112A FMV price"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Save Master Specifications
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
