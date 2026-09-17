import React, { useState, useEffect, useRef } from 'react';
import { Users, User, Shield, Check, ChevronDown, Plus, Globe } from 'lucide-react';

export interface FamilyMember {
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

interface FamilyMemberSwitcherProps {
  currentMemberId: number | 'all';
  onSelectMember: (memberId: number | 'all') => void;
  onOpenManageModal?: () => void;
}

export const FamilyMemberSwitcher: React.FC<FamilyMemberSwitcherProps> = ({
  currentMemberId,
  onSelectMember,
  onOpenManageModal
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/family-members');
      const data = await res.json();
      if (data.success && Array.isArray(data.members)) {
        setMembers(data.members);
      }
    } catch (err) {
      console.warn('[FamilyMemberSwitcher] Error fetching members:', err);
    } finally {
      setLoading(false);
    }
  };

  const activeMember = members.find(m => m.id === currentMemberId);
  const totalFamilyAum = members.reduce((sum, m) => sum + (m.total_holding_value || 0), 0);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-slate-900/80 hover:bg-slate-800/90 text-white shadow-lg backdrop-blur-md transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
      >
        <div 
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner"
          style={{ backgroundColor: activeMember ? activeMember.avatar_color : '#06b6d4' }}
        >
          {currentMemberId === 'all' ? (
            <Users className="w-3.5 h-3.5" />
          ) : (
            activeMember?.name?.charAt(0) || 'U'
          )}
        </div>

        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-slate-100">
              {currentMemberId === 'all' ? 'Consolidated Family Office' : activeMember?.name || 'Member View'}
            </span>
            {activeMember?.tax_residency === 'NRI' && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                NRI
              </span>
            )}
          </div>
          <span className="text-[10px] text-cyan-400/80 font-mono">
            {currentMemberId === 'all' 
              ? `Consolidated Lens`
              : `${activeMember?.portfolios?.length || 0} Accounts • ${activeMember?.tax_residency || 'Resident'}`
            }
          </span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-slate-900/95 border border-slate-700/60 shadow-2xl backdrop-blur-xl z-50 py-2 divide-y divide-slate-800 animate-in fade-in zoom-in-95 duration-150">
          {/* Consolidated View Option */}
          <div className="p-1.5">
            <button
              onClick={() => {
                onSelectMember('all');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                currentMemberId === 'all'
                  ? 'bg-cyan-500/20 text-white border border-cyan-500/40'
                  : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    Consolidated Family Office
                    <Shield className="w-3 h-3 text-cyan-400" />
                  </div>
                  <div className="text-[10px] text-slate-400">
                    All 13 Family Demat & PMS Accounts
                  </div>
                </div>
              </div>
              {currentMemberId === 'all' && <Check className="w-4 h-4 text-cyan-400" />}
            </button>
          </div>

          {/* Individual Members List */}
          <div className="p-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-slate-400">
              Individual Family Members ({members.length})
            </div>
            {members.map(member => {
              const isSelected = currentMemberId === member.id;
              return (
                <button
                  key={member.id}
                  onClick={() => {
                    onSelectMember(member.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-cyan-500/20 text-white border border-cyan-500/40'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
                      style={{ backgroundColor: member.avatar_color || '#06b6d4' }}
                    >
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        {member.name}
                        {member.role === 'FAMILY_HEAD' && (
                          <span className="px-1 py-0.2 text-[8px] font-semibold bg-cyan-500/20 text-cyan-300 rounded">
                            Head
                          </span>
                        )}
                        {member.tax_residency === 'NRI' && (
                          <span className="px-1 py-0.2 text-[8px] font-semibold bg-amber-500/20 text-amber-300 rounded">
                            NRI
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[170px]">
                        {member.portfolios?.join(', ') || 'No accounts assigned'}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                </button>
              );
            })}
          </div>

          {/* Management Footer */}
          {onOpenManageModal && (
            <div className="p-1.5">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenManageModal();
                }}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Manage Family Members & Roles</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
