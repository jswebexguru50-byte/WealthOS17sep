import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  XCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckSquare,
  Square,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Transaction } from '../types.js';
import { formatINR, formatUSD, formatCurrency as formatCurrencyUtil, formatDate } from '../lib/formatters.js';
import { ResizableDataTable, ColumnDef } from './ResizableDataTable.js';

interface TransactionsViewProps {
  selectedPortfolio: string;
  setSelectedPortfolio: (portfolio: string) => void;
  portfolios: string[];
  onAddTransaction: (txn: Partial<Transaction>) => Promise<boolean>;
  onEditTransaction: (id: number, txn: Partial<Transaction>) => Promise<boolean>;
  onDeleteTransaction: (id: number) => Promise<boolean>;
  onBulkAction: (action: 'DELETE' | 'UPDATE', ids: number[], fields?: Partial<Transaction>) => Promise<boolean>;
  formatCurrency: (val: number) => string;
}

export function TransactionsView({
  selectedPortfolio,
  setSelectedPortfolio,
  portfolios,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onBulkAction,
  formatCurrency
}: TransactionsViewProps) {
  // Query States
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Sorting State
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [isDownloading, setIsDownloading] = useState(false);

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState('');
  const [formPortfolio, setFormPortfolio] = useState('');
  const [formType, setFormType] = useState('BUY');
  const [formSymbol, setFormSymbol] = useState('');
  const [formIsin, setFormIsin] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formBrokerage, setFormBrokerage] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Auto-set default form portfolio when portfolios change
  React.useEffect(() => {
    if (!formPortfolio && portfolios && portfolios.length > 0) {
      setFormPortfolio(portfolios[0]);
    }
  }, [portfolios, formPortfolio]);

  // Bulk Edit Fields
  const [bulkPortfolio, setBulkPortfolio] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkType, setBulkType] = useState('');

  const fetchTransactions = async () => {
    let url = `/api/transactions?page=${page}&limit=50&search=${encodeURIComponent(search)}&type=${typeFilter}&start_date=${startDate}&end_date=${endDate}&sort_col=${sortCol}&sort_dir=${sortDir}`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }
    
    try {
      const res = await fetch(url);
      const resData = await res.json();
      if (resData.data) {
        setTransactions(resData.data);
        setTotalPages(resData.pages);
        setTotalCount(resData.total);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const renderSortIcon = (col: string) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return sortDir === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  const downloadTransactionsCSV = async () => {
    setIsDownloading(true);
    try {
      let url = `/api/transactions?page=1&limit=100000&search=${encodeURIComponent(search)}&type=${typeFilter}&start_date=${startDate}&end_date=${endDate}&sort_col=${sortCol}&sort_dir=${sortDir}`;
      if (selectedPortfolio !== 'Combined') {
        url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
      }
      const res = await fetch(url);
      const resData = await res.json();
      if (resData.data) {
        const headers = ['Trade Date', 'Portfolio', 'Type', 'Symbol', 'ISIN', 'Company Name', 'Quantity', 'Price', 'Brokerage', 'Net Amount', 'Notes'];
        const rows = resData.data.map((t: any) => [
          t.date,
          `"${(t.portfolio || '').replace(/"/g, '""')}"`,
          t.type,
          t.symbol,
          t.isin,
          `"${(t.company_name || '').replace(/"/g, '""')}"`,
          t.quantity,
          t.price,
          t.brokerage || 0,
          t.net_amount,
          `"${(t.notes || '').replace(/"/g, '""')}"`
        ]);
        const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `transactions_${selectedPortfolio}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to download transactions CSV.');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    setSelectedIds([]);
  }, [page, search, typeFilter, startDate, endDate, selectedPortfolio, sortCol, sortDir]);

  const handleSelectRow = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map(t => t.id));
    }
  };

  const openAddModal = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormDate(today);
    setFormPortfolio(portfolios && portfolios.length > 0 ? portfolios[0] : '');
    setFormType('BUY');
    setFormSymbol('');
    setFormIsin('');
    setFormQuantity('');
    setFormPrice('');
    setFormBrokerage('0');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (t: Transaction) => {
    setEditingTxn(t);
    setFormDate(t.date);
    setFormPortfolio(t.portfolio);
    setFormType(t.type);
    setFormSymbol(t.symbol);
    setFormIsin(t.isin);
    setFormQuantity(String(t.quantity));
    setFormPrice(String(t.price));
    setFormBrokerage(String(t.brokerage || 0));
    setFormNotes(t.notes || '');
    setIsEditModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(formQuantity);
    const prc = parseFloat(formPrice);
    const brok = parseFloat(formBrokerage || '0');
    const gross = qty * prc;
    const net = formType === 'BUY' ? gross + brok : gross - brok;

    const payload = {
      date: formDate,
      portfolio: formPortfolio,
      type: formType,
      symbol: formSymbol.trim().toUpperCase(),
      isin: formIsin.trim().toUpperCase(),
      quantity: qty,
      price: prc,
      gross_amount: gross,
      brokerage: brok,
      net_amount: net,
      notes: formNotes
    };

    const success = await onAddTransaction(payload);
    if (success) {
      setIsAddModalOpen(false);
      fetchTransactions();
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn) return;

    const qty = parseFloat(formQuantity);
    const prc = parseFloat(formPrice);
    const brok = parseFloat(formBrokerage || '0');
    const gross = qty * prc;
    const net = formType === 'BUY' ? gross + brok : gross - brok;

    const payload = {
      date: formDate,
      portfolio: formPortfolio,
      type: formType,
      symbol: formSymbol.trim().toUpperCase(),
      isin: formIsin.trim().toUpperCase(),
      quantity: qty,
      price: prc,
      gross_amount: gross,
      brokerage: brok,
      net_amount: net,
      notes: formNotes
    };

    const success = await onEditTransaction(editingTxn.id, payload);
    if (success) {
      setIsEditModalOpen(false);
      fetchTransactions();
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this transaction permanently? This cannot be undone.')) {
      const success = await onDeleteTransaction(id);
      if (success) fetchTransactions();
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete the ${selectedIds.length} selected transactions permanently?`)) {
      const success = await onBulkAction('DELETE', selectedIds);
      if (success) {
        setSelectedIds([]);
        fetchTransactions();
      }
    }
  };

  const handleBulkUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fields: any = {};
    if (bulkPortfolio) fields.portfolio = bulkPortfolio;
    if (bulkDate) fields.date = bulkDate;
    if (bulkType) fields.type = bulkType;

    const success = await onBulkAction('UPDATE', selectedIds, fields);
    if (success) {
      setIsBulkEditOpen(false);
      setSelectedIds([]);
      setBulkPortfolio('');
      setBulkDate('');
      setBulkType('');
      fetchTransactions();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight">Ledger & Trades</h1>
          <p className="text-slate-400 text-sm">Review, audit, or manually register your tradebook entries.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadTransactionsCSV}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-emerald-400 disabled:opacity-50 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? 'Downloading...' : 'Export CSV'}
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-5 h-5" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Query Filters */}
      <div className="glass-card rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        {/* Search */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search</label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search ticker, name..."
              className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors"
            />
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* Type Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Action Type</label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl px-4 py-2 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="">All Transactions</option>
            <option value="BUY">BUY / Purchase</option>
            <option value="SELL">SELL / Sale</option>
            <option value="DIVIDEND">Dividends</option>
            <option value="BONUS">Bonus Lot Dilution</option>
            <option value="SPLIT">Stock Splits</option>
            <option value="DEMERGER">Demergers</option>
          </select>
        </div>

        {/* Start Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Start Date</label>
          <div className="relative">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors cursor-pointer"
            />
            <Calendar className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* End Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">End Date</label>
          <div className="relative">
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none transition-colors cursor-pointer"
            />
            <Calendar className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>
      </div>

      {/* Bulk Action Controls */}
      {selectedIds.length > 0 && (
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm text-emerald-400 font-medium">
            Selected <strong className="text-emerald-300 font-bold">{selectedIds.length}</strong> transactions
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsBulkEditOpen(true)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Bulk Edit Fields
            </button>
            <button
              onClick={handleBulkDelete}
              className="bg-rose-950/60 border border-rose-500/30 hover:border-rose-500 text-rose-300 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Bulk Delete Permanent
            </button>
          </div>
        </div>
      )}

      {/* Transaction Table */}
      <ResizableDataTable<Transaction>
        tableId="transactions_ledger"
        columns={[
          {
            id: 'select',
            header: (
              <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-200 focus:outline-none">
                {selectedIds.length === transactions.length && transactions.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            ),
            cell: (t) => (
              <button onClick={() => handleSelectRow(t.id)} className="text-slate-500 hover:text-slate-300 focus:outline-none">
                {selectedIds.includes(t.id) ? (
                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            ),
            width: 50,
            minWidth: 40,
            defaultPinned: 'left'
          },
          {
            id: 'date',
            header: 'Trade Date',
            cell: (t) => <span className="font-mono text-slate-300">{t.date}</span>,
            width: 120,
            sortable: true,
            sortValue: (t) => t.date
          },
          {
            id: 'portfolio',
            header: 'Portfolio',
            cell: (t) => (
              <span className="bg-slate-900 text-slate-300 border border-slate-800 text-[11px] px-2 py-0.5 rounded-md font-semibold">
                {t.portfolio}
              </span>
            ),
            width: 120,
            sortable: true,
            sortValue: (t) => t.portfolio
          },
          {
            id: 'type',
            header: 'Type',
            cell: (t) => {
              const typeStr = String(t.type || '').toUpperCase();
              let badgeClass = 'bg-slate-800 text-slate-300 border border-slate-700';

              if (typeStr.includes('BUY') || typeStr.includes('IPO') || typeStr.includes('ALLOTMENT')) {
                badgeClass = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold';
              } else if (typeStr.includes('SELL') || typeStr.includes('REDEMPTION')) {
                badgeClass = 'bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold';
              } else if (typeStr.includes('DIVIDEND') || typeStr.includes('INTEREST')) {
                badgeClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold';
              } else if (typeStr.includes('BONUS') || typeStr.includes('SPLIT') || typeStr.includes('MERGER')) {
                badgeClass = 'bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold';
              } else if (typeStr.includes('DEPOSIT') || typeStr.includes('INFLOW')) {
                badgeClass = 'bg-teal-500/15 text-teal-400 border border-teal-500/30 font-bold';
              } else if (typeStr.includes('WITHDRAWAL') || typeStr.includes('FEE') || typeStr.includes('TDS')) {
                badgeClass = 'bg-orange-500/15 text-orange-400 border border-orange-500/30 font-bold';
              }

              return (
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center justify-center ${badgeClass}`}>
                  {t.type}
                </span>
              );
            },
            width: 110,
            sortable: true,
            sortValue: (t) => t.type
          },
          {
            id: 'symbol',
            header: 'Scrip details',
            cell: (t) => (
              <div className="max-w-[260px]">
                <span className="font-display font-semibold text-slate-100 text-xs whitespace-normal break-words leading-tight block">{t.symbol}</span>
                {t.company_name && (
                  <p className="text-[10px] text-slate-400 whitespace-normal break-words leading-tight mt-0.5">{t.company_name}</p>
                )}
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{t.isin}</span>
              </div>
            ),
            width: 220,
            sortable: true,
            sortValue: (t) => t.symbol,
            defaultPinned: 'left'
          },
          {
            id: 'quantity',
            header: 'Quantity',
            cell: (t) => <span className="font-mono">{t.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</span>,
            width: 110,
            align: 'right',
            sortable: true,
            sortValue: (t) => t.quantity
          },
          {
            id: 'price',
            header: 'Price per Share',
            cell: (t) => (
              t.currency === 'USD' ? (
                <div>
                  <span className="text-slate-200">{formatCurrency(t.price * (t.rate_to_inr || 83.5))}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">${(t.price || 0).toFixed(2)} USD</span>
                </div>
              ) : (
                formatCurrency(t.price)
              )
            ),
            width: 140,
            align: 'right',
            sortable: true,
            sortValue: (t) => t.price
          },
          {
            id: 'net_amount',
            header: 'Net Value',
            cell: (t) => (
              t.currency === 'USD' ? (
                <div>
                  <span className="text-emerald-400 text-sm font-bold block">{formatCurrency(t.net_amount * (t.rate_to_inr || 83.5))}</span>
                  <span className="text-[10px] text-slate-400 block font-mono font-normal">${t.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                  <span className="text-[9px] text-slate-500 block font-mono font-normal">Rate: ₹{(t.rate_to_inr || 83.5).toFixed(2)}</span>
                </div>
              ) : (
                formatCurrency(t.net_amount)
              )
            ),
            width: 150,
            align: 'right',
            sortable: true,
            sortValue: (t) => t.net_amount
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
        data={transactions}
        keyExtractor={(t) => t.id}
        emptyMessage="No trade transactions found matching criteria."
      />

      {/* Pagination Controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Showing <strong className="text-slate-300 font-semibold">{transactions.length}</strong> of{' '}
          <strong className="text-slate-300 font-semibold">{totalCount}</strong> transactions
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 bg-slate-900 border border-slate-800 disabled:opacity-40 hover:border-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-300 font-semibold font-mono">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 bg-slate-900 border border-slate-800 disabled:opacity-40 hover:border-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Add / Edit Modals */}
      <AnimatePresence>
        {(isAddModalOpen || isEditModalOpen) && (
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
              className="max-w-lg w-full rounded-2xl glass-card border border-slate-800/80 p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <h3 className="font-display font-semibold text-lg text-slate-100">
                  {isAddModalOpen ? 'Add Manual Trade' : 'Modify Trade Record'}
                </h3>
                <button
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="text-slate-400 hover:text-slate-100 transition-colors focus:outline-none"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={isAddModalOpen ? handleAddSubmit : handleEditSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  {/* Date */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trade Date</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Portfolio */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Portfolio</label>
                    <input
                      type="text"
                      required
                      value={formPortfolio}
                      onChange={(e) => setFormPortfolio(e.target.value)}
                      placeholder="e.g. Maa Zerodha"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Action Type */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors cursor-pointer"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                      <option value="DIVIDEND">DIVIDEND PAYOUT</option>
                      <option value="BONUS">BONUS ISSUE</option>
                      <option value="SPLIT">STOCK SPLIT</option>
                      <option value="DEMERGER">DEMERGER COST REALLOC</option>
                    </select>
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

                <div className="grid grid-cols-2 gap-4">
                  {/* ISIN */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ISIN</label>
                    <input
                      type="text"
                      value={formIsin}
                      onChange={(e) => setFormIsin(e.target.value)}
                      placeholder="e.g. INE009A01021"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Price */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Price per Share</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Brokerage */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Brokerage & STT</label>
                    <input
                      type="number"
                      step="any"
                      value={formBrokerage}
                      onChange={(e) => setFormBrokerage(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Enter special details..."
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Save Transaction Record
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Edit Modal */}
      <AnimatePresence>
        {isBulkEditOpen && (
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
                  Bulk Edit Selected ({selectedIds.length})
                </h3>
                <button
                  onClick={() => setIsBulkEditOpen(false)}
                  className="text-slate-400 hover:text-slate-100 transition-colors focus:outline-none"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleBulkUpdateSubmit} className="space-y-4 text-sm">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Only fill fields you wish to change. Leave other fields empty to preserve their current values.
                </p>

                {/* Portfolio */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Portfolio</label>
                  <input
                    type="text"
                    value={bulkPortfolio}
                    onChange={(e) => setBulkPortfolio(e.target.value)}
                    placeholder="e.g. Maa Zerodha"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Date</label>
                  <input
                    type="date"
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors"
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Type</label>
                  <select
                    value={bulkType}
                    onChange={(e) => setBulkType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="">Don't Change Type</option>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                    <option value="DIVIDEND PAYOUT">DIVIDEND PAYOUT</option>
                    <option value="BONUS">BONUS ISSUE</option>
                    <option value="SPLIT">STOCK SPLIT</option>
                    <option value="DEMERGER">DEMERGER COST REALLOC</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Apply Changes
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
