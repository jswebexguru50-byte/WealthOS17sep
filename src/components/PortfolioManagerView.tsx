import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, Edit2, GitMerge, Settings, FolderPlus, FileSpreadsheet } from 'lucide-react';
import { downloadXirrAuditExcel } from '../lib/api';

interface Portfolio {
  id: number;
  name: string;
  type: string;
  base_currency?: string;
  status: string;
}

export function PortfolioManagerView({ 
  showToast, 
  triggerLoader 
}: { 
  showToast: (m: string, t?: 'success'|'error') => void,
  triggerLoader: (a: boolean, msg?: string) => void
}) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [newPortName, setNewPortName] = useState('');
  const [newPortType, setNewPortType] = useState('EQUITY');
  const [newPortCurrency, setNewPortCurrency] = useState('INR');
  
  // Renaming state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchPortfolios = async () => {
    try {
      const res = await fetch('/api/portfolios');
      const data = await res.json();
      if (data.success && data.detailedPortfolios) {
        setPortfolios(data.detailedPortfolios);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPortfolios();
  }, []);

  const createPortfolio = async () => {
    if (!newPortName) return;
    triggerLoader(true, 'Creating Portfolio...');
    try {
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPortName, type: newPortType, base_currency: newPortCurrency })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Portfolio created', 'success');
        setNewPortName('');
        fetchPortfolios();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
    triggerLoader(false);
  };

  const archivePortfolio = async (name: string) => {
    if (!window.confirm(`Are you sure you want to archive the portfolio '${name}'?`)) return;
    triggerLoader(true, 'Archiving Portfolio...');
    try {
      const res = await fetch(`/api/portfolios/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Portfolio archived', 'success');
        fetchPortfolios();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
    triggerLoader(false);
  };

  const updateType = async (name: string, type: string) => {
    triggerLoader(true, 'Updating Type...');
    try {
      const res = await fetch(`/api/portfolios/${encodeURIComponent(name)}/type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Type updated', 'success');
        fetchPortfolios();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
    triggerLoader(false);
  };

  const updateCurrency = async (name: string, base_currency: string) => {
    triggerLoader(true, 'Updating Base Currency...');
    try {
      const res = await fetch(`/api/portfolios/${encodeURIComponent(name)}/currency`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_currency })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Base Currency updated', 'success');
        fetchPortfolios();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
    triggerLoader(false);
  };

  const handleRenameSave = async (oldName: string) => {
    if (!editValue || editValue === oldName) {
      setEditingName(null);
      return;
    }
    triggerLoader(true, 'Renaming Portfolio and Migrating Data...');
    try {
      const res = await fetch('/api/portfolios/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: editValue })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Portfolio renamed successfully', 'success');
        setEditingName(null);
        fetchPortfolios();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
    triggerLoader(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 text-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Manage Portfolios</h1>
          <p className="text-slate-400 mt-1">Create, rename, configure, or archive portfolios</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-6 mb-8 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-300 mb-1">New Portfolio Name</label>
          <input 
            type="text" 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" 
            value={newPortName} 
            onChange={e => setNewPortName(e.target.value)} 
            placeholder="e.g. My Next Portfolio"
          />
        </div>
        <div className="w-48">
          <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
          <select 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            value={newPortType}
            onChange={e => setNewPortType(e.target.value)}
          >
            <option value="EQUITY">Equity</option>
            <option value="MUTUAL_FUND">Mutual Fund</option>
            <option value="PMS">PMS</option>
            <option value="CASH_EQUIVALENT">Cash & Cash Equivalent (FDs & Savings)</option>
          </select>
        </div>
        <div className="w-36">
          <label className="block text-sm font-medium text-slate-300 mb-1">Currency</label>
          <select 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            value={newPortCurrency}
            onChange={e => setNewPortCurrency(e.target.value)}
          >
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="AED">AED</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadXirrAuditExcel('Combined')}
            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer"
            title="Download XIRR verification report with pre-built formulas for all portfolios combined"
          >
            <FileSpreadsheet size={16} /> Combined XIRR Excel
          </button>
          <button 
            onClick={createPortfolio}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-emerald-500 transition-colors"
          >
            <FolderPlus size={18} /> Create
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700">
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Portfolio Name</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Base Currency</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {portfolios.map(p => (
              <tr key={p.id} className="hover:bg-slate-800/80 transition-colors">
                <td className="p-4 font-medium text-white">
                  {editingName === p.name ? (
                    <input 
                      autoFocus
                      type="text"
                      className="bg-slate-900 border border-slate-600 rounded px-3 py-1 text-white w-full max-w-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSave(p.name);
                        if (e.key === 'Escape') setEditingName(null);
                      }}
                    />
                  ) : (
                    <span>{p.name}</span>
                  )}
                </td>
                <td className="p-4">
                  <select 
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={p.type}
                    onChange={(e) => updateType(p.name, e.target.value)}
                  >
                    <option value="EQUITY">Equity</option>
                    <option value="MUTUAL_FUND">Mutual Fund</option>
                    <option value="PMS">PMS</option>
                    <option value="CASH_EQUIVALENT">Cash & Cash Equivalent</option>
                  </select>
                </td>
                <td className="p-4">
                  <select 
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-emerald-400"
                    value={p.base_currency || 'INR'}
                    onChange={(e) => updateCurrency(p.name, e.target.value)}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="AED">AED</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
                    {p.status}
                  </span>
                </td>
                <td className="p-4 flex gap-2 justify-end items-center">
                  <button
                    onClick={() => downloadXirrAuditExcel(p.name)}
                    className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 border border-amber-500/20 cursor-pointer"
                    title={`Download XIRR verification Excel file for ${p.name}`}
                  >
                    <FileSpreadsheet size={15} />
                    <span>XIRR Excel</span>
                  </button>

                  {editingName === p.name ? (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleRenameSave(p.name)} 
                        className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-500 transition-colors font-medium"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setEditingName(null)} 
                        className="bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded hover:bg-slate-600 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setEditingName(p.name); setEditValue(p.name); }} 
                      className="text-indigo-400 hover:text-indigo-300 p-1.5 rounded hover:bg-indigo-400/10 transition-colors" 
                      title="Rename"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  
                  <button 
                    onClick={() => archivePortfolio(p.name)} 
                    className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-red-400/10 transition-colors ml-2" 
                    title="Archive"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {portfolios.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">No portfolios found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
