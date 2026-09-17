import React, { useState, useEffect } from 'react';
import { Building2, Landmark, Plus, Trash2, Edit3, RefreshCw, DollarSign, Globe, CheckCircle2, AlertCircle, Calendar, Percent } from 'lucide-react';

interface BankOrFD {
  id?: number;
  portfolio: string;
  name: string;
  country: 'INDIA' | 'UAE' | 'USA' | 'OTHER';
  account_type: 'SAVINGS' | 'CURRENT' | 'FIXED_DEPOSIT' | 'RECURRING_DEPOSIT';
  currency: 'INR' | 'AED' | 'USD' | 'EUR' | 'GBP';
  balance_amount: number;
  interest_rate_pct: number;
  maturity_date?: string;
  notes?: string;
  rate_to_inr?: number;
  inr_value?: number;
}

interface BankAndFDsViewProps {
  portfolios: string[];
  selectedPortfolio: string;
  onDataChanged?: () => void;
}

export const BankAndFDsView: React.FC<BankAndFDsViewProps> = ({
  portfolios,
  selectedPortfolio,
  onDataChanged
}) => {
  const [items, setItems] = useState<BankOrFD[]>([]);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ INR: 1.0, USD: 83.5, AED: 22.7 });
  const [totalInr, setTotalInr] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncingFx, setIsSyncingFx] = useState<boolean>(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<Partial<BankOrFD>>({
    portfolio: selectedPortfolio === 'Combined' || selectedPortfolio === 'all' ? (portfolios.find(p => p !== 'Default') || 'Maa') : selectedPortfolio,
    country: 'INDIA',
    account_type: 'SAVINGS',
    currency: 'INR',
    balance_amount: 0,
    interest_rate_pct: 0
  });

  const fetchBankData = async () => {
    setIsLoading(true);
    try {
      const pParam = selectedPortfolio ? encodeURIComponent(selectedPortfolio) : '';
      const res = await fetch(`/api/bank-fds?portfolio=${pParam}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotalInr(data.total_inr_valuation || 0);
        if (data.currency_rates) setFxRates(data.currency_rates);
      }
    } catch (err) {
      console.error('Error fetching bank/FD data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBankData();
  }, [selectedPortfolio]);

  const handleSyncFxRates = async () => {
    setIsSyncingFx(true);
    try {
      const res = await fetch('/api/currency-rates/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchBankData();
        if (onDataChanged) onDataChanged();
      }
    } catch (err: any) {
      alert('Error syncing XE rates: ' + err.message);
    } finally {
      setIsSyncingFx(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/bank-fds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchBankData();
        if (onDataChanged) onDataChanged();
      } else {
        alert(data.error || 'Failed to save entry.');
      }
    } catch (err: any) {
      alert('Error saving: ' + err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this bank account / FD record?')) return;
    try {
      const res = await fetch(`/api/bank-fds/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchBankData();
        if (onDataChanged) onDataChanged();
      }
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  const formatCurrency = (val: number, currency: string = 'INR') => {
    const symbolMap: Record<string, string> = { INR: '₹', USD: '$', AED: 'AED ', EUR: '€', GBP: '£' };
    const sym = symbolMap[currency] || `${currency} `;
    return `${sym}${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const getCountryFlag = (country: string) => {
    switch (country) {
      case 'INDIA': return '🇮🇳 India';
      case 'UAE': return '🇦🇪 UAE';
      case 'USA': return '🇺🇸 USA';
      default: return '🌐 Global';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & XE Live Rates Control */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-3">
            <Landmark className="w-8 h-8 text-emerald-400" />
            Bank Balances & Fixed Deposits (India & UAE)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Consolidate multi-currency liquid savings, current accounts, and fixed deposits into your total Net Worth.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncFxRates}
            disabled={isSyncingFx}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer text-sm"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncingFx ? 'animate-spin' : ''}`} />
            {isSyncingFx ? 'Syncing XE.com Rates...' : 'Sync XE Live FX Rates'}
          </button>

          <button
            onClick={() => {
              setEditingItem({
                portfolio: selectedPortfolio === 'Combined' || selectedPortfolio === 'all' ? (portfolios.find(p => p !== 'Default') || 'Maa') : selectedPortfolio,
                country: 'INDIA',
                account_type: 'SAVINGS',
                currency: 'INR',
                balance_amount: 0,
                interest_rate_pct: 0
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer text-sm shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add Account / FD
          </button>
        </div>
      </div>

      {/* Live XE.com FX Rates Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-slate-200">XE.com Spot FX Rates:</span>
          <span className="bg-slate-800 px-3 py-1 rounded-lg text-emerald-400 font-mono">1 USD = ₹{fxRates.USD || 83.5}</span>
          <span className="bg-slate-800 px-3 py-1 rounded-lg text-emerald-400 font-mono">1 AED = ₹{fxRates.AED || 22.7}</span>
          <span className="bg-slate-800 px-3 py-1 rounded-lg text-emerald-400 font-mono">1 EUR = ₹{fxRates.EUR || 90.8}</span>
        </div>

        <div className="text-slate-400 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Auto-converts foreign assets to INR for Net Worth
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Cash & FD Valuation</div>
          <div className="text-2xl font-bold text-slate-100 mt-2 font-mono">₹{totalInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div className="text-slate-500 text-xs mt-1">Converted to INR via XE rates</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">India Balances (🇮🇳 INR)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
            ₹{items.filter(i => i.country === 'INDIA').reduce((sum, i) => sum + (i.inr_value || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-slate-500 text-xs mt-1">{items.filter(i => i.country === 'INDIA').length} Accounts / FDs</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">UAE Balances (🇦🇪 AED)</div>
          <div className="text-2xl font-bold text-amber-400 mt-2 font-mono">
            ₹{items.filter(i => i.country === 'UAE').reduce((sum, i) => sum + (i.inr_value || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-slate-500 text-xs mt-1">{items.filter(i => i.country === 'UAE').length} Accounts / FDs</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Avg Interest Rate (APY)</div>
          <div className="text-2xl font-bold text-indigo-400 mt-2 font-mono">
            {(items.length > 0 ? items.reduce((sum, i) => sum + (i.interest_rate_pct || 0), 0) / items.length : 0).toFixed(2)}%
          </div>
          <div className="text-slate-500 text-xs mt-1">Weighted return rate</div>
        </div>
      </div>

      {/* Account / FD Listings Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl shadow-xl">
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            Bank Accounts & Fixed Deposit Portfolio
          </h2>
          <span className="text-slate-400 text-xs">{items.length} Registered Records</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">Loading bank balances...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Landmark className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-slate-300 font-semibold">No Bank Balances or FDs Added Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Add your savings, current accounts, and fixed deposits from India (INR), UAE (AED), or US (USD) to track net worth.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-5">Institution / Name</th>
                  <th className="py-3.5 px-5">Bank Name & Account / IBAN</th>
                  <th className="py-3.5 px-5">IFSC/SWIFT / Folio</th>
                  <th className="py-3.5 px-5">Country</th>
                  <th className="py-3.5 px-5">Type</th>
                  <th className="py-3.5 px-5 text-right">Balance</th>
                  <th className="py-3.5 px-5 text-right">Interest Rate</th>
                  <th className="py-3.5 px-5 text-right">INR Value</th>
                  <th className="py-3.5 px-5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-slate-100">{item.name}</div>
                      <div className="text-slate-400 text-xs">{item.portfolio}</div>
                    </td>

                    <td className="py-4 px-5">
                      <div className="font-medium text-slate-200">{item.bank_name || '-'}</div>
                      {item.account_number && (
                        <div className="text-slate-400 text-xs font-mono">Acc: {item.account_number}</div>
                      )}
                    </td>

                    <td className="py-4 px-5">
                      {item.ifsc_swift && (
                        <div className="text-slate-300 text-xs font-mono">Code: {item.ifsc_swift}</div>
                      )}
                      {item.folio && (
                        <div className="text-indigo-400 text-xs font-mono">Folio: {item.folio}</div>
                      )}
                      {!item.ifsc_swift && !item.folio && <span className="text-slate-500">-</span>}
                    </td>

                    <td className="py-4 px-5">
                      <span className="inline-flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300">
                        {getCountryFlag(item.country)}
                      </span>
                    </td>

                    <td className="py-4 px-5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.account_type === 'FIXED_DEPOSIT' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {item.account_type.replace('_', ' ')}
                      </span>
                      {item.maturity_date && (
                        <div className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-indigo-400" />
                          Mat: {item.maturity_date}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-5 text-right font-mono font-semibold">
                      {formatCurrency(item.balance_amount, item.currency)}
                    </td>

                    <td className="py-4 px-5 text-right font-mono text-indigo-400">
                      {item.interest_rate_pct > 0 ? `${item.interest_rate_pct}%` : '-'}
                    </td>

                    <td className="py-4 px-5 text-right font-mono font-bold text-emerald-400">
                      ₹{(item.inr_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-4 px-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Edit Record"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => item.id && handleDelete(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-100">
              {editingItem.id ? 'Edit Bank Account / FD' : 'Add New Bank Account / FD'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Portfolio</label>
                <select
                  value={editingItem.portfolio || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, portfolio: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  required
                >
                  {portfolios.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Account Title / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Emirates NBD Savings UAE or HDFC Bank FD"
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Bank / Institution Name</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank, Emirates NBD"
                    value={editingItem.bank_name || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, bank_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Account / IBAN Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 50100012345678 or IBAN"
                    value={editingItem.account_number || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, account_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">IFSC / SWIFT Code</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC0000123 / EBNBAEEA"
                    value={editingItem.ifsc_swift || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, ifsc_swift: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">FD / MF Folio Number</label>
                  <input
                    type="text"
                    placeholder="e.g. FD-98765432 or Folio"
                    value={editingItem.folio || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, folio: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Country</label>
                  <select
                    value={editingItem.country || 'INDIA'}
                    onChange={(e) => setEditingItem({ ...editingItem, country: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  >
                    <option value="INDIA">🇮🇳 India</option>
                    <option value="UAE">🇦🇪 UAE</option>
                    <option value="USA">🇺🇸 USA</option>
                    <option value="OTHER">🌐 Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Currency</label>
                  <select
                    value={editingItem.currency || 'INR'}
                    onChange={(e) => setEditingItem({ ...editingItem, currency: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="AED">AED (Dh)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Account Type</label>
                  <select
                    value={editingItem.account_type || 'SAVINGS'}
                    onChange={(e) => setEditingItem({ ...editingItem, account_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  >
                    <option value="SAVINGS">Savings Account</option>
                    <option value="CURRENT">Current Account</option>
                    <option value="FIXED_DEPOSIT">Fixed Deposit (FD)</option>
                    <option value="RECURRING_DEPOSIT">Recurring Deposit (RD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Balance / Principal Amount</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={editingItem.balance_amount || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, balance_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Interest Rate (% APY)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 7.50"
                    value={editingItem.interest_rate_pct || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, interest_rate_pct: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Maturity Date (FD Only)</label>
                  <input
                    type="date"
                    value={editingItem.maturity_date || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, maturity_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer text-sm shadow-md"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
