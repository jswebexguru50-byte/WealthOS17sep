import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Edit3, Trash2, Check, X, AlertCircle, Building, DollarSign } from 'lucide-react';

interface FamilyMember {
  id: number;
  uuid: string;
  name: string;
  email: string;
  role: string;
  pan_number: string;
  tax_residency: string;
  avatar_color: string;
  portfolio_count: number;
  total_holding_value: number;
  portfolios: string[];
}

export const FamilyMembersManagerView: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [allPortfolios, setAllPortfolios] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'MEMBER',
    pan_number: '',
    tax_residency: 'RESIDENT',
    avatar_color: '#06b6d4',
    selectedPortfolios: [] as string[]
  });
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mRes, pRes] = await Promise.all([
        fetch('/api/family-members').then(r => r.json()),
        fetch('/api/portfolios').then(r => r.json())
      ]);

      if (mRes.success && Array.isArray(mRes.members)) {
        setMembers(mRes.members);
      }
      if (pRes.success && Array.isArray(pRes.portfolios)) {
        setAllPortfolios(pRes.portfolios);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to load family members' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setStatusMsg({ type: 'error', text: 'Member name is required' });
      return;
    }

    try {
      if (isCreating) {
        const res = await fetch('/api/family-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            role: formData.role,
            pan_number: formData.pan_number,
            tax_residency: formData.tax_residency,
            avatar_color: formData.avatar_color,
            portfolios: formData.selectedPortfolios
          })
        });
        const data = await res.json();
        if (data.success) {
          setStatusMsg({ type: 'success', text: `Member "${formData.name}" added successfully.` });
          setIsCreating(false);
          loadData();
        } else {
          setStatusMsg({ type: 'error', text: data.error || 'Failed to create member' });
        }
      } else if (editingMember) {
        const res = await fetch(`/api/family-members/${editingMember.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            role: formData.role,
            pan_number: formData.pan_number,
            tax_residency: formData.tax_residency,
            avatar_color: formData.avatar_color
          })
        });
        const data = await res.json();
        if (data.success) {
          setStatusMsg({ type: 'success', text: `Member "${formData.name}" updated successfully.` });
          setEditingMember(null);
          loadData();
        } else {
          setStatusMsg({ type: 'error', text: data.error || 'Failed to update member' });
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Network error' });
    }
  };

  const handleDelete = async (member: FamilyMember) => {
    if (!confirm(`Are you sure you want to remove "${member.name}"? Portfolios will remain unassigned.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/family-members/${member.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Member "${member.name}" removed.` });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Delete failed' });
    }
  };

  const startEdit = (m: FamilyMember) => {
    setEditingMember(m);
    setIsCreating(false);
    setFormData({
      name: m.name,
      email: m.email || '',
      role: m.role || 'MEMBER',
      pan_number: m.pan_number || '',
      tax_residency: m.tax_residency || 'RESIDENT',
      avatar_color: m.avatar_color || '#06b6d4',
      selectedPortfolios: m.portfolios || []
    });
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingMember(null);
    setFormData({
      name: '',
      email: '',
      role: 'MEMBER',
      pan_number: '',
      tax_residency: 'RESIDENT',
      avatar_color: '#06b6d4',
      selectedPortfolios: []
    });
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-cyan-400" />
            Family Members & Tenant Access Console
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Define family members, assign demat/PMS accounts, configure PAN & NRI tax profiles, and ensure row-level isolation.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Add Family Member
        </button>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-medium ${
          statusMsg.type === 'success' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
        }`}>
          <AlertCircle className="w-4 h-4" />
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="ml-auto opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Member Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map(member => (
          <div
            key={member.id}
            className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col justify-between hover:border-slate-700 transition-all group"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold text-white shadow-lg ring-2 ring-white/10"
                    style={{ backgroundColor: member.avatar_color || '#06b6d4' }}
                  >
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm">{member.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">
                        {member.role}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border ${
                        member.tax_residency === 'NRI' 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {member.tax_residency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(member)}
                    className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {members.length > 1 && (
                    <button
                      onClick={() => handleDelete(member)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 py-3 border-y border-slate-800/80 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>PAN Number:</span>
                  <span className="font-mono text-slate-200">{member.pan_number || '—'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Holding Valuation:</span>
                  <span className="font-semibold text-emerald-400">
                    ₹{((member.total_holding_value || 0) / 1e7).toFixed(2)} Cr
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Assigned Portfolios:</span>
                  <span className="font-medium text-cyan-300">{member.portfolios?.length || 0} Accounts</span>
                </div>
              </div>

              {/* Portfolios Pill List */}
              <div className="mt-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                  Connected Ledgers
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {member.portfolios && member.portfolios.length > 0 ? (
                    member.portfolios.map(p => (
                      <span
                        key={p}
                        className="px-2 py-0.5 text-[10px] font-medium bg-slate-800/80 text-slate-300 rounded-md border border-slate-700/60"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">No portfolios assigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Modal */}
      {(isCreating || editingMember) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                {isCreating ? 'Add New Family Member' : `Edit ${editingMember?.name}`}
              </h3>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingMember(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Vijaya Sharma"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Role</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="FAMILY_HEAD">Family Head (Full View)</option>
                    <option value="MEMBER">Family Member</option>
                    <option value="VIEWER">Read-Only Viewer</option>
                    <option value="ADVISOR">CA / Tax Auditor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Tax Residency</label>
                  <select
                    value={formData.tax_residency}
                    onChange={e => setFormData({ ...formData, tax_residency: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="RESIDENT">Resident Indian (STT/LTCG)</option>
                    <option value="NRI">Non-Resident Indian (Sec 195 TDS)</option>
                    <option value="OCI">OCI / Foreign National</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">PAN Number</label>
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={e => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                    placeholder="e.g., ABCPV1234F"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Avatar Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    {['#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#3b82f6'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, avatar_color: color })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          formData.avatar_color === color ? 'scale-110 border-white ring-2 ring-cyan-400' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {isCreating && (
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Assign Portfolios</label>
                  <div className="max-h-36 overflow-y-auto bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 space-y-1.5">
                    {allPortfolios.map(port => {
                      const isChecked = formData.selectedPortfolios.includes(port);
                      return (
                        <label
                          key={port}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-700/40 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setFormData({
                                  ...formData,
                                  selectedPortfolios: formData.selectedPortfolios.filter(p => p !== port)
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  selectedPortfolios: [...formData.selectedPortfolios, port]
                                });
                              }
                            }}
                            className="rounded border-slate-600 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="text-slate-200">{port}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingMember(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg"
              >
                Save Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
