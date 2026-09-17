import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  TrendingUp, 
  Plus, 
  Edit2, 
  Trash2, 
  ShieldCheck, 
  Layers, 
  CheckCircle2, 
  FolderSync, 
  ChevronRight,
  Sparkles,
  BarChart3,
  Globe
} from 'lucide-react';
import { STANDARD_BENCHMARKS, BenchmarkOption, FamilyGroup } from '../types/familyBenchmarks.js';

interface FamilyBenchmarkManagerViewProps {
  portfolios: string[];
  selectedPortfolio: string;
  onPortfolioChange: (p: string) => void;
  formatCurrency?: (val: number) => string;
}

export function FamilyBenchmarkManagerView({
  portfolios,
  selectedPortfolio,
  onPortfolioChange,
  formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v)
}: FamilyBenchmarkManagerViewProps) {
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<{ id?: number; name: string; description: string; benchmark_symbol: string }>({
    name: '',
    description: '',
    benchmark_symbol: '^NSEI'
  });

  const [assignModal, setAssignModal] = useState<{ isOpen: boolean; portfolio: string; family_group: string; benchmark_symbol: string } | null>(null);

  useEffect(() => {
    fetchHierarchy();
  }, []);

  const fetchHierarchy = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/family-hierarchy');
      const data = await res.json();
      if (data.families) {
        setFamilies(data.families);
      }
    } catch (e) {
      console.error('Failed to load family hierarchy:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFamily = async () => {
    if (!editingFamily.name.trim()) return;
    try {
      await fetch('/api/family-hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingFamily)
      });
      setIsEditingModalOpen(false);
      fetchHierarchy();
    } catch (e) {
      console.error('Failed to save family group:', e);
    }
  };

  const handleDeleteFamily = async (id: number) => {
    if (!confirm('Are you sure you want to delete this family group? Member portfolios will be reassigned to Primary Family Office.')) return;
    try {
      await fetch(`/api/family-hierarchy/${id}`, { method: 'DELETE' });
      fetchHierarchy();
    } catch (e) {
      console.error('Failed to delete family group:', e);
    }
  };

  const handleAssignPortfolio = async () => {
    if (!assignModal) return;
    try {
      await fetch('/api/family-hierarchy/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: assignModal.portfolio,
          family_group: assignModal.family_group,
          benchmark_symbol: assignModal.benchmark_symbol
        })
      });
      setAssignModal(null);
      fetchHierarchy();
    } catch (e) {
      console.error('Failed to assign portfolio:', e);
    }
  };

  const totalConsolidatedValuation = families.reduce((s, f) => s + (f.total_valuation || 0), 0);
  const totalConsolidatedCost = families.reduce((s, f) => s + (f.total_invested || 0), 0);
  const totalConsolidatedPnl = families.reduce((s, f) => s + (f.unrealized_pnl || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div 
        className="p-6 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          background: 'var(--bg-card, #0F172A)',
          borderColor: 'var(--border-card, #1E293B)'
        }}
      >
        <div className="flex items-center gap-3.5">
          <div 
            className="p-3 rounded-2xl flex items-center justify-center font-bold"
            style={{
              background: 'var(--accent-green-bg, rgba(16, 185, 129, 0.14))',
              color: 'var(--accent-green, #10B981)'
            }}
          >
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                Family Office Governance & Benchmarks
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                MULTI-ENTITY
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Organize multiple accounts and demat folios under family entities with dedicated benchmark index governance.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingFamily({ name: '', description: '', benchmark_symbol: '^NSEI' });
            setIsEditingModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Family Entity
        </button>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div 
          className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
          style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Family Wealth Valuation
          </span>
          <div className="mt-3">
            <h3 className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(totalConsolidatedValuation)}
            </h3>
            <span className="text-xs text-slate-400 mt-1 block">
              Across {families.length} Family Entities & {portfolios.length} Accounts
            </span>
          </div>
        </div>

        <div 
          className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
          style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
        >
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Acquisition Cost
          </span>
          <div className="mt-3">
            <h3 className="text-2xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(totalConsolidatedCost)}
            </h3>
            <span className="text-xs text-slate-400 mt-1 block">
              Cost basis of consolidated active positions
            </span>
          </div>
        </div>

        <div 
          className="p-5 rounded-3xl border shadow-sm flex flex-col justify-between"
          style={{ background: 'var(--bg-card, #0F172A)', borderColor: 'var(--border-card, #1E293B)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Unrealised Profit
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              {totalConsolidatedCost > 0 ? ((totalConsolidatedPnl / totalConsolidatedCost) * 100).toFixed(2) : '0.00'}% ↑
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalConsolidatedPnl)}
            </h3>
            <span className="text-xs text-slate-400 mt-1 block">
              Consolidated holding appreciation
            </span>
          </div>
        </div>
      </div>

      {/* Family Groups Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {families.map((fam) => {
          const benchmarkInfo = STANDARD_BENCHMARKS.find(b => b.symbol === fam.benchmark_symbol) || {
            name: fam.benchmark_symbol,
            category: 'Custom'
          };
          const memberPorts = fam.portfolios || [];

          return (
            <div 
              key={fam.id}
              className="p-6 rounded-3xl border shadow-sm flex flex-col justify-between space-y-4"
              style={{
                background: 'var(--bg-card, #0F172A)',
                borderColor: 'var(--border-card, #1E293B)'
              }}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold font-display text-white">
                        {fam.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1">
                        {fam.description || 'Family entity group'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingFamily({
                          id: fam.id,
                          name: fam.name,
                          description: fam.description,
                          benchmark_symbol: fam.benchmark_symbol
                        });
                        setIsEditingModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {fam.name !== 'Primary Family Office' && (
                      <button
                        onClick={() => handleDeleteFamily(fam.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Benchmark Tag */}
                <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Assigned Benchmark</span>
                      <span className="font-bold text-white">{benchmarkInfo.name}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    {benchmarkInfo.category}
                  </span>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Current Value</span>
                    <span className="text-sm font-bold text-white">
                      {formatCurrency(fam.total_valuation || 0)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Unrealised Gain</span>
                    <span className={`text-sm font-bold ${(fam.unrealized_pnl || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {formatCurrency(fam.unrealized_pnl || 0)}
                    </span>
                  </div>
                </div>

                {/* Member Portfolios List */}
                <div className="mt-4 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Member Accounts ({memberPorts.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {memberPorts.map((p, idx) => (
                      <span 
                        key={idx}
                        onClick={() => {
                          onPortfolioChange(p);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-800 dark:bg-slate-800 text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer border border-slate-800"
                      >
                        <span>{p}</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                      </span>
                    ))}
                    {memberPorts.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No member accounts assigned yet</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Quick Action: Assign Accounts */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setAssignModal({
                      isOpen: true,
                      portfolio: portfolios[0] || '',
                      family_group: fam.name,
                      benchmark_symbol: fam.benchmark_symbol
                    });
                  }}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-700 text-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  Assign / Move Account
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Create Family Group Modal */}
      {isEditingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div 
            className="rounded-3xl w-full max-w-lg p-6 space-y-5 border shadow-2xl"
            style={{ background: 'var(--bg-modal, #FFFFFF)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="pb-3 border-b border-slate-800 dark:border-slate-800">
              <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                {editingFamily.id ? 'Edit Family Entity' : 'Create Family Entity'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Define the family group name, notes, and default benchmark index.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Family Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Papa Family Portfolio, Self Tech Entity"
                  value={editingFamily.name}
                  onChange={(e) => setEditingFamily({ ...editingFamily, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="Notes / description"
                  value={editingFamily.description}
                  onChange={(e) => setEditingFamily({ ...editingFamily, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Benchmark Index</label>
                <select
                  value={editingFamily.benchmark_symbol}
                  onChange={(e) => setEditingFamily({ ...editingFamily, benchmark_symbol: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                >
                  {STANDARD_BENCHMARKS.map((b) => (
                    <option key={b.symbol} value={b.symbol}>
                      {b.name} ({b.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 dark:border-slate-800">
              <button
                onClick={() => setIsEditingModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFamily}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all cursor-pointer"
              >
                Save Family Entity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Portfolio Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div 
            className="rounded-3xl w-full max-w-lg p-6 space-y-5 border shadow-2xl"
            style={{ background: 'var(--bg-modal, #FFFFFF)', borderColor: 'var(--border-card, #1E293B)' }}
          >
            <div className="pb-3 border-b border-slate-800 dark:border-slate-800">
              <h3 className="text-base font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                Assign Account to Family Entity
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Map an individual portfolio/demat account to a family group.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Select Portfolio</label>
                <select
                  value={assignModal.portfolio}
                  onChange={(e) => setAssignModal({ ...assignModal, portfolio: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                >
                  {portfolios.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Target Family Group</label>
                <select
                  value={assignModal.family_group}
                  onChange={(e) => setAssignModal({ ...assignModal, family_group: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-800 border border-slate-700 dark:border-slate-700 font-semibold text-slate-200 cursor-pointer"
                >
                  {families.map(f => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 dark:border-slate-800">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignPortfolio}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all cursor-pointer"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
