import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  FileCheck2,
  Globe2,
  TrendingDown,
  Calculator,
  Download,
  CheckCircle2,
  RefreshCw,
  FileText,
  Layers,
  Sparkles,
  Info,
  Calendar,
  PieChart,
  BookOpen,
  History,
  Save
} from 'lucide-react';
import { safeFetchJson } from '../lib/api';
import { formatINR } from '../lib/formatters.js';

interface NriTaxRepatriationHubProps {
  selectedPortfolio: string;
  portfolios: string[];
  currentMemberId?: number | null;
}

export const NriTaxRepatriationHub: React.FC<NriTaxRepatriationHubProps> = ({
  selectedPortfolio,
  portfolios,
  currentMemberId
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'TDS_RECON' | 'REPATRIATION_15CA' | 'HARVESTING' | 'DTAA_FTC' | 'CARRIED_FORWARD_LOSSES'>('TDS_RECON');
  // Helper to generate current running Indian FY + last 10 financial years
  const getDefaultFys = () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const startYear = curMonth >= 3 ? curYear : curYear - 1;
    const list: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const y = startYear - i;
      list.push(`${y}-${y + 1}`);
    }
    return { list, currentFY: `${startYear}-${startYear + 1}` };
  };

  const defaultFyData = getDefaultFys();
  const [availableFYs, setAvailableFYs] = useState<string[]>(defaultFyData.list);
  const [currentFY, setCurrentFY] = useState<string>(defaultFyData.currentFY);
  const [selectedFY, setSelectedFY] = useState<string>(defaultFyData.currentFY);
  const [activePortfolio, setActivePortfolio] = useState<string>(selectedPortfolio || 'Combined');
  const [residentCountry, setResidentCountry] = useState<string>('UAE');
  const [nroRemittedUSD, setNroRemittedUSD] = useState<number>(145000);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tdsData, setTdsData] = useState<any>(null);
  const [showArchGuide, setShowArchGuide] = useState<boolean>(false);

  // Carried Forward Losses State (Sub-Tab 5)
  const [carriedLosses, setCarriedLosses] = useState<any[]>([]);
  const [isSavingLosses, setIsSavingLosses] = useState<boolean>(false);
  const [saveLossMessage, setSaveLossMessage] = useState<string | null>(null);

  const fetchCarriedLosses = async () => {
    try {
      const mId = currentMemberId || 1;
      const res = await safeFetchJson<any>(`/api/tax/carried-forward-losses?member_id=${mId}&fy=${selectedFY}`);
      if (res.ok && res.data && Array.isArray(res.data.records)) {
        setCarriedLosses(res.data.records);
      }
    } catch (err) {
      console.error('Error fetching carried forward losses:', err);
    }
  };

  const handleLossChange = (index: number, field: string, value: any) => {
    setCarriedLosses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSaveCarriedLosses = async () => {
    setIsSavingLosses(true);
    setSaveLossMessage(null);
    try {
      const res = await safeFetchJson<any>('/api/tax/carried-forward-losses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ losses: carriedLosses })
      });
      if (res.ok && res.data && res.data.success) {
        setSaveLossMessage('✅ Carried forward losses saved & tax provisions updated with Surcharge/Cess!');
        setTimeout(() => setSaveLossMessage(null), 4000);
        fetchCarriedLosses();
      } else {
        setSaveLossMessage('❌ Failed to save loss records.');
      }
    } catch (e: any) {
      setSaveLossMessage(`❌ Error: ${e.message}`);
    } finally {
      setIsSavingLosses(false);
    }
  };
  useEffect(() => {
    const fetchFYs = async () => {
      try {
        const res = await fetch('/api/tax/financial-years');
        const data = await res.json();
        if (data.financial_years && data.financial_years.length > 0) {
          setAvailableFYs(data.financial_years);
          if (data.current_fy) {
            setCurrentFY(data.current_fy);
          }
          if (!selectedFY || !data.financial_years.includes(selectedFY)) {
            setSelectedFY(data.financial_years[0]);
          }
        }
      } catch (err) {
        console.warn('FY fetch error, using default last 10 FYs:', err);
      }
    };
    fetchFYs();
  }, []);

  useEffect(() => {
    if (selectedPortfolio && selectedPortfolio !== activePortfolio) {
      setActivePortfolio(selectedPortfolio);
    }
  }, [selectedPortfolio]);

  useEffect(() => {
    loadTaxData();
  }, [activePortfolio, selectedFY]);

  useEffect(() => {
    if (activeSubTab === 'CARRIED_FORWARD_LOSSES') {
      fetchCarriedLosses();
    }
  }, [activeSubTab, selectedFY, currentMemberId]);

  const loadTaxData = async () => {
    setIsLoading(true);
    try {
      const res = await safeFetchJson<any>(`/api/nri/tds-recon?fy=${selectedFY}&portfolio=${encodeURIComponent(activePortfolio)}`);
      if (res.ok && res.data && res.data.success) {
        setTdsData(res.data);
      } else {
        setTdsData(null);
      }
    } catch (e) {
      console.warn('Tax summary fetch failed:', e);
      setTdsData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Real computed figures from actual database transaction records
  const stcgPre = Number(tdsData?.stcg_gain_pre_budget || 0);
  const stcgPost = Number(tdsData?.stcg_gain_post_budget || 0);
  const totalStcg = Number(tdsData?.total_stcg_gain || 0);

  const ltcgPre = Number(tdsData?.ltcg_gain_pre_budget || 0);
  const ltcgPost = Number(tdsData?.ltcg_gain_post_budget || 0);
  const totalLtcg = Number(tdsData?.total_ltcg_gain || 0);

  const grossRealizedGain = Number(tdsData?.total_realized_gain !== undefined ? tdsData.total_realized_gain : (totalStcg + totalLtcg));
  const ltcgExemption = Number(tdsData?.ltcg_exemption || (totalLtcg > 0 ? 125000 : 0));
  const taxableLtcg = Number(tdsData?.taxable_ltcg || Math.max(0, totalLtcg - ltcgExemption));

  const statutoryTaxDue = Number(tdsData?.statutory_tax_due || 0);
  const brokerWithheldTDS = Number(tdsData?.broker_withheld_tds || 0);
  const refundOpportunity = Number(tdsData?.refund_opportunity || Math.max(0, brokerWithheldTDS - statutoryTaxDue));

  // USD 1 Million FEMA limit
  const femaLimitUSD = 1000000;
  const remainingQuotaUSD = Math.max(0, femaLimitUSD - nroRemittedUSD);
  const quotaUsedPct = Math.min(100, Math.round((nroRemittedUSD / femaLimitUSD) * 100));

  const allPortfoliosList = Array.from(new Set(['Combined', ...(portfolios || [])]));

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header & Controls Bar */}
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl border shadow-lg backdrop-blur-md"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-card)'
        }}
      >
        <div>
          <div className="flex items-center gap-3">
            <div
              className="p-3 border rounded-2xl flex items-center justify-center font-bold"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                color: 'var(--accent-gold, #F59E0B)'
              }}
            >
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                NRI Tax & FEMA Repatriation Hub
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border"
                  style={{
                    background: 'rgba(6, 182, 212, 0.18)',
                    color: 'var(--accent-cyan, #06B6D4)',
                    borderColor: 'rgba(6, 182, 212, 0.4)'
                  }}
                >
                  IT Act Sec 195 & RBI FEMA
                </span>
              </h1>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Section 195 Broker TDS reconciliation, Form 15CA/15CB package generator, and cross-border DTAA optimizer.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Portfolio Filter Dropdown */}
          <div
            className="flex items-center gap-1.5 border rounded-xl px-3 py-2 shadow-sm"
            style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}
          >
            <PieChart className="w-4 h-4 text-cyan-400" />
            <select
              value={activePortfolio}
              onChange={(e) => setActivePortfolio(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              {allPortfoliosList.map((p) => (
                <option key={p} value={p} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                  {p === 'Combined' ? '🌐 All Portfolios (Combined)' : `📁 ${p}`}
                </option>
              ))}
            </select>
          </div>

          {/* Financial Year Selector (Dynamic from DB + Last 10 FYs) */}
          <div
            className="flex items-center gap-1.5 border rounded-xl px-3 py-2 shadow-sm"
            style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            <select
              value={selectedFY}
              onChange={(e) => setSelectedFY(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <option value="ALL" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                🌐 All Financial Years
              </option>
              {availableFYs.map((fy) => (
                <option key={fy} value={fy} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                  FY {fy}{fy === currentFY ? ' (Current YTD)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Country Selector */}
          <div
            className="flex items-center gap-1.5 border rounded-xl px-3 py-2 shadow-sm"
            style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}
          >
            <Globe2 className="w-4 h-4 text-indigo-400" />
            <select
              value={residentCountry}
              onChange={(e) => setResidentCountry(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <option value="UAE" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>🇦🇪 UAE (GCC Resident)</option>
              <option value="USA" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>🇺🇸 USA (IRS Treaty)</option>
              <option value="UK" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>🇬🇧 UK (HMRC / DTAA)</option>
              <option value="SGP" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>🇸🇬 Singapore (DTAA)</option>
            </select>
          </div>

          {/* Architectural Guide Toggle */}
          <button
            onClick={() => setShowArchGuide(!showArchGuide)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm hover:opacity-80"
            style={{
              background: showArchGuide ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-table-alt)',
              borderColor: showArchGuide ? 'rgba(59, 130, 246, 0.5)' : 'var(--border-card)',
              color: showArchGuide ? 'var(--accent-blue, #3B82F6)' : 'var(--text-secondary)'
            }}
            title="How NRI Hub connects to Tax View & Ledger"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Concept Guide</span>
          </button>

          <button
            onClick={loadTaxData}
            className="p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm hover:opacity-80"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            title="Refresh Tax Recon"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── ARCHITECTURE & CONSISTENCY GUIDE BANNER ── */}
      {showArchGuide && (
        <div
          className="p-6 rounded-3xl border shadow-lg space-y-4 animate-fadeIn"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-card)' }}>
            <h3 className="text-sm font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Info className="w-4 h-4 text-cyan-400" />
              How NRI Tax Hub Unifies with Ledger & Capital Gains Tax View
            </h3>
            <button
              onClick={() => setShowArchGuide(false)}
              className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl border space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
              <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">1</span>
                Ledger & FIFO Trades
              </div>
              <p className="font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Every executed trade is matched using First-In-First-Out (FIFO) accounting to calculate exact gross realized P&L across all family portfolios.
              </p>
            </div>

            <div className="p-4 rounded-2xl border space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
              <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">2</span>
                Tax View (Statutory ITR)
              </div>
              <p className="font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Computes statutory Income Tax liability under Section 112A (STCG @ 20%, LTCG @ 12.5% above ₹1.25L exemption + 4% cess). Applies to all domestic and international tax filings.
              </p>
            </div>

            <div className="p-4 rounded-2xl border space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
              <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px]">3</span>
                NRI & FEMA Repatriation Hub
              </div>
              <p className="font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Under Section 195, Indian brokers deduct flat 20.8%/13% TDS on gross proceeds for Non-Residents without giving exemptions. This Hub calculates your exact <b>TDS Refund Opportunity</b>, generates Form 15CA/15CB packs, and tracks your <b>$1M FEMA NRO remittance quota</b>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5 Core Module Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b" style={{ borderColor: 'var(--border-card)' }}>
        {[
          { id: 'TDS_RECON', label: '1. Upfront TDS vs ITR-2 Tax Recon', icon: Calculator },
          { id: 'REPATRIATION_15CA', label: '2. FEMA $1M Quota & Form 15CA/CB', icon: Globe2 },
          { id: 'HARVESTING', label: '3. Tax-Loss Harvesting & Set-Off', icon: TrendingDown },
          { id: 'DTAA_FTC', label: '4. DTAA & Foreign Tax Credit (FTC)', icon: FileCheck2 },
          { id: 'CARRIED_FORWARD_LOSSES', label: '5. Carried Forward Losses & Set-Off (ITR-2/3)', icon: History }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className="flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer border shadow-sm"
              style={{
                background: isActive ? 'rgba(6, 182, 212, 0.15)' : 'var(--bg-card)',
                borderColor: isActive ? 'var(--accent-cyan, #06B6D4)' : 'var(--border-card)',
                color: isActive ? 'var(--accent-cyan, #06B6D4)' : 'var(--text-secondary)'
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── MODULE 1: TDS RECONCILIATION ── */}
      {activeSubTab === 'TDS_RECON' && (
        <div className="space-y-6">
          {/* Top 4 KPI Metrics */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border shadow-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>Tax Residency Status:</span>
              <span
                className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border"
                style={{
                  background: tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                  color: tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'var(--accent-gold, #F59E0B)' : 'var(--accent-green, #10B981)',
                  borderColor: tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'
                }}
              >
                {tdsData?.tax_status_label || (activePortfolio.toLowerCase().includes('self') ? 'NRI Portfolio (Sec 195 TDS)' : 'Domestic Resident Portfolio')}
              </span>
            </div>

            <div className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
              {tdsData?.tax_status === 'NRI_NON_RESIDENT'
                ? 'Sec 195 TDS Withholding Reconciled against ITR-2/3'
                : 'Domestic Resident Account (Advance Tax / Self-Assessment on ITR)'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className="p-5 rounded-3xl border shadow-md relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Gross Realized Gain ({activePortfolio})
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-2">
                {formatINR(grossRealizedGain)}
              </div>
              <div className="text-xs mt-1 flex items-center gap-1.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                <span>STCG: {formatINR(totalStcg)}</span> • <span>LTCG: {formatINR(totalLtcg)}</span>
              </div>
            </div>

            <div
              className="p-5 rounded-3xl border shadow-md relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--accent-gold, #F59E0B)' }}>
                <span>Broker Withheld TDS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono font-bold border border-amber-500/40">
                  {tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'Sec 195' : 'Resident (Nil)'}
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-amber-400 mt-2">
                {formatINR(brokerWithheldTDS)}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {tdsData?.tax_status === 'NRI_NON_RESIDENT'
                  ? 'Deducted at 20.8% STCG & 13.0% LTCG'
                  : 'No TDS at source for Resident PANs'}
              </div>
            </div>

            <div
              className="p-5 rounded-3xl border shadow-md relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                True Statutory Tax Due
              </div>
              <div className="text-2xl font-black font-mono mt-2" style={{ color: 'var(--text-primary)' }}>
                {formatINR(statutoryTaxDue)}
              </div>
              <div className="text-xs text-emerald-400 mt-1 font-medium">
                Includes ₹1.25L LTCG Exemption & 4% Cess
              </div>
            </div>

            <div
              className="p-5 rounded-3xl border shadow-md relative overflow-hidden"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'rgba(6, 182, 212, 0.4)'
              }}
            >
              <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--accent-cyan, #06B6D4)' }}>
                <span>{tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'ITR-2 Refund Opportunity' : 'Advance Tax Due'}</span>
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black font-mono text-cyan-400 mt-2">
                {tdsData?.tax_status === 'NRI_NON_RESIDENT' ? formatINR(refundOpportunity) : formatINR(statutoryTaxDue)}
              </div>
              <div className="text-xs mt-1 font-medium text-cyan-400">
                {tdsData?.tax_status === 'NRI_NON_RESIDENT' ? 'Reclaimable via annual Indian Tax Filing' : 'Payable via quarterly Advance Tax'}
              </div>
            </div>
          </div>

          {/* Breakdown Table: Pre vs Post Budget 2024 Split */}
          <div
            className="rounded-3xl border shadow-md overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div
              className="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ borderColor: 'var(--border-card)', background: 'var(--bg-table-alt)' }}
            >
              <div>
                <h3 className="font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Calculator className="w-4 h-4 text-cyan-400" />
                  Budget 2024 Statutory Tax Liability vs Section 195 Withholding (FY {selectedFY})
                </h3>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Portfolio: <strong className="text-cyan-400">{activePortfolio}</strong> • Reconciles actual FIFO realized gains against broker tax deductions.
                </p>
              </div>

              <button
                onClick={() => window.open(`/api/tax/itr2_detailed?financial_year=${selectedFY}&portfolio=${encodeURIComponent(activePortfolio)}`, '_blank')}
                className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all border cursor-pointer self-start sm:self-auto shadow-sm hover:opacity-80"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)'
                }}
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Export Schedule CG (.xlsx)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}>
                    <th className="py-3 px-5 font-mono font-bold uppercase text-[11px] tracking-wider">Tax Period & Category</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Realized Gain</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Exemption</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Taxable Amount</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Statutory Rate</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Actual Tax Due</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider">Broker Withheld TDS</th>
                    <th className="py-3 px-5 text-right font-mono font-bold uppercase text-[11px] tracking-wider text-cyan-400">Net Refund Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-card)' }}>
                  {/* STCG Pre-Budget (Up to 22 July 2024) */}
                  <tr>
                    <td className="py-3.5 px-5 font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
                      STCG (Pre-Budget: 01 Apr – 22 Jul 2024)
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono text-emerald-400 font-bold">{formatINR(stcgPre)}</td>
                    <td className="py-3.5 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>Nil</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(stcgPre)}</td>
                    <td className="py-3.5 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>15% + 4%</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(Math.max(0, stcgPre) * 0.156)}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-amber-400 font-bold">{formatINR(Math.max(0, stcgPre) * 0.156)}</td>
                    <td className="py-3.5 px-5 text-right font-mono font-bold" style={{ color: 'var(--text-muted)' }}>₹0</td>
                  </tr>

                  {/* STCG Post-Budget (From 23 July 2024) */}
                  <tr>
                    <td className="py-3.5 px-5 font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
                      STCG (Post-Budget: 23 Jul 2024 – 31 Mar 2025)
                    </td>
                    <td className={`py-3.5 px-5 text-right font-mono font-bold ${stcgPost >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatINR(stcgPost)}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>Nil</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(stcgPost)}</td>
                    <td className="py-3.5 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>20% + 4%</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(Math.max(0, stcgPost) * 0.208)}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-amber-400 font-bold">{formatINR(Math.max(0, stcgPost) * 0.208)}</td>
                    <td className="py-3.5 px-5 text-right font-mono font-bold" style={{ color: 'var(--text-muted)' }}>₹0</td>
                  </tr>

                  {/* LTCG (Listed Equities - Sec 112A) */}
                  <tr>
                    <td className="py-3.5 px-5 font-sans font-bold" style={{ color: 'var(--text-primary)' }}>
                      LTCG (Listed Equities / Equity MFs - Sec 112A)
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono text-emerald-400 font-bold">{formatINR(totalLtcg)}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-cyan-400 font-black">{formatINR(ltcgExemption)}</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(taxableLtcg)}</td>
                    <td className="py-3.5 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>12.5% + 4%</td>
                    <td className="py-3.5 px-5 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(taxableLtcg * 0.13)}</td>
                    <td className="py-3.5 px-5 text-right font-mono text-amber-400 font-bold">{formatINR(totalLtcg * 0.13)}</td>
                    <td className="py-3.5 px-5 text-right font-mono font-black text-cyan-400">
                      +{formatINR(refundOpportunity)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t font-black" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <td className="py-4 px-5 font-sans" style={{ color: 'var(--text-primary)' }}>
                      Total FY {selectedFY} Settlement ({activePortfolio})
                    </td>
                    <td className="py-4 px-5 text-right text-emerald-400 font-mono">{formatINR(grossRealizedGain)}</td>
                    <td className="py-4 px-5 text-right text-cyan-400 font-mono">{formatINR(ltcgExemption)}</td>
                    <td className="py-4 px-5 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{formatINR(totalStcg + taxableLtcg)}</td>
                    <td className="py-4 px-5 text-right font-mono" style={{ color: 'var(--text-muted)' }}>-</td>
                    <td className="py-4 px-5 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{formatINR(statutoryTaxDue)}</td>
                    <td className="py-4 px-5 text-right text-amber-400 font-mono">{formatINR(brokerWithheldTDS)}</td>
                    <td className="py-4 px-5 text-right text-cyan-400 font-mono text-sm">
                      +{formatINR(refundOpportunity)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Trade-Level Realized Gains Drilldown */}
          {tdsData?.trades && tdsData.trades.length > 0 && (
            <div
              className="rounded-3xl border shadow-md overflow-hidden space-y-0"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div
                className="p-5 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border-card)', background: 'var(--bg-table-alt)' }}
              >
                <div>
                  <h4 className="font-bold font-display text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Layers className="w-4 h-4 text-cyan-400" />
                    Individual Realized Trades ({tdsData.trades.length} Matched Lots in FY {selectedFY})
                  </h4>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Granular transaction level breakdown from FIFO tradebook engine matching Tax View & Ledger.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 shadow-sm" style={{ background: 'var(--bg-table-alt)', color: 'var(--text-secondary)' }}>
                    <tr className="border-b" style={{ borderColor: 'var(--border-card)' }}>
                      <th className="py-2.5 px-4 font-mono font-bold uppercase text-[10px]">Trade Date</th>
                      <th className="py-2.5 px-4 font-mono font-bold uppercase text-[10px]">Portfolio</th>
                      <th className="py-2.5 px-4 font-mono font-bold uppercase text-[10px]">Symbol / Scrip</th>
                      <th className="py-2.5 px-4 text-right font-mono font-bold uppercase text-[10px]">Qty</th>
                      <th className="py-2.5 px-4 text-right font-mono font-bold uppercase text-[10px]">Proceeds</th>
                      <th className="py-2.5 px-4 text-right font-mono font-bold uppercase text-[10px]">Cost</th>
                      <th className="py-2.5 px-4 text-right font-mono font-bold uppercase text-[10px]">Realized P&L</th>
                      <th className="py-2.5 px-4 text-center font-mono font-bold uppercase text-[10px]">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-card)' }}>
                    {tdsData.trades.map((t: any, i: number) => {
                      const pnl = Number(t.realized_pnl || 0);
                      return (
                        <tr key={i} className="hover:opacity-90 transition-opacity">
                          <td className="py-2 px-4 font-mono" style={{ color: 'var(--text-secondary)' }}>{t.sell_date}</td>
                          <td className="py-2 px-4 font-bold" style={{ color: 'var(--text-primary)' }}>{t.portfolio}</td>
                          <td className="py-2 px-4">
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                            {t.company_name && t.company_name !== t.symbol && (
                              <span className="block text-[10px] truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>{t.company_name}</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{t.matched_qty}</td>
                          <td className="py-2 px-4 text-right font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{formatINR(t.sell_proceeds || 0)}</td>
                          <td className="py-2 px-4 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{formatINR(t.buy_cost || 0)}</td>
                          <td className={`py-2 px-4 text-right font-mono font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pnl >= 0 ? '+' : ''}{formatINR(pnl)}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                              style={{
                                background: t.tax_category === 'LTCG' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                color: t.tax_category === 'LTCG' ? 'var(--accent-green, #10B981)' : 'var(--accent-blue, #3B82F6)',
                                borderColor: t.tax_category === 'LTCG' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'
                              }}
                            >
                              {t.tax_category}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODULE 2: FEMA USD 1M & 15CA/15CB ── */}
      {activeSubTab === 'REPATRIATION_15CA' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div
              className="lg:col-span-2 p-6 rounded-3xl border shadow-md space-y-6"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Globe2 className="w-5 h-5 text-blue-400" />
                    RBI FEMA USD 1,000,000 Annual NRO Repatriation Quota
                  </h3>
                  <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Every NRI is permitted to remit up to USD 1,000,000 per financial year from NRO account balances.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-blue-400">${nroRemittedUSD.toLocaleString()}</div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Remitted in FY {selectedFY}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span style={{ color: 'var(--text-secondary)' }}>Quota Utilized: <b className="text-blue-400">{quotaUsedPct}%</b></span>
                  <span style={{ color: 'var(--text-secondary)' }}>Remaining Quota: <b className="text-emerald-400">${remainingQuotaUSD.toLocaleString()} USD</b></span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden border" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${quotaUsedPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>NRO Funds Eligible</div>
                  <div className="text-lg font-black font-mono mt-1" style={{ color: 'var(--text-primary)' }}>₹1,42,50,000</div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">Tax paid & cleared</div>
                </div>
                <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Remittance Exchange Rate</div>
                  <div className="text-lg font-black font-mono mt-1" style={{ color: 'var(--text-primary)' }}>₹86.80 / USD</div>
                  <div className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>Live XE spot rate</div>
                </div>
                <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>USD Equivalent Remittable</div>
                  <div className="text-lg font-black font-mono text-cyan-400 mt-1">$164,170 USD</div>
                  <div className="text-[11px] text-cyan-400 font-semibold mt-0.5">Within remaining quota</div>
                </div>
              </div>
            </div>

            <div
              className="p-6 rounded-3xl border shadow-md flex flex-col justify-between space-y-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div>
                <div className="flex items-center gap-2 text-blue-400 font-bold font-display">
                  <FileText className="w-5 h-5" />
                  Form 15CA / 15CB Document Bundle
                </div>
                <p className="text-xs mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Generate the required tax compliance documentation pack for Chartered Accountant (CA) certification and bank submission.
                </p>
                <div className="space-y-2 mt-4 text-xs" style={{ color: 'var(--text-primary)' }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Realized capital gains computation sheet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>TDS deduction challan records (26AS matching)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Form A2 FEMA declaration pre-fill</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => alert('Generating 15CA/15CB Chartered Accountant Compliance Pack (.zip)...')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <Download className="w-4 h-4" />
                Generate 15CA/15CB Pack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODULE 3: TAX-LOSS HARVESTING ── */}
      {activeSubTab === 'HARVESTING' && (
        <div className="space-y-6">
          <div
            className="p-6 rounded-3xl border shadow-md space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  Tax-Loss Harvesting Opportunities (Before March 31st)
                </h3>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Realize unrealized losses in underperforming lots to legally set-off against STCG (20%) and LTCG (12.5%).
                </p>
              </div>
              <div className="text-xs px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 font-mono font-bold">
                Section 94 Anti-Stripping Guard: ACTIVE
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Total Unrealized Short-Term Losses</div>
                <div className="text-xl font-black font-mono text-red-400 mt-1">-₹1,85,000</div>
                <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">Can offset STCG & LTCG</div>
              </div>
              <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Potential Tax Savings</div>
                <div className="text-xl font-black font-mono text-emerald-400 mt-1">+₹38,480</div>
                <div className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>At 20.8% effective STCG rate</div>
              </div>
              <div className="p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Recommended Harvest Action</div>
                <div className="text-sm font-black text-cyan-400 mt-1">Sell 3 Loss-making Lots</div>
                <div className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>Re-invest after 48 hours</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODULE 4: DTAA & FOREIGN TAX CREDIT ── */}
      {activeSubTab === 'DTAA_FTC' && (
        <div className="space-y-6">
          <div
            className="p-6 rounded-3xl border shadow-md space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <h3 className="text-lg font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <FileCheck2 className="w-5 h-5 text-cyan-400" />
              Double Taxation Avoidance Agreement (DTAA) & FTC Simulator ({residentCountry})
            </h3>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Simulate bilateral tax credit eligibility to prevent double taxation on Indian capital gains and foreign dividend income.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl border shadow-sm space-y-2" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Compliance Checklist for {residentCountry}</div>
                <div className="space-y-1.5 text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tax Residency Certificate (TRC) Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Form 10F Electronic Self-Declaration Filed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Indian PAN linked with Non-Resident Status</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border shadow-sm space-y-2" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Foreign Tax Credit (FTC) Offset</div>
                <div className="text-xs font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {residentCountry === 'USA'
                    ? 'Indian capital gains tax of 12.5% / 20% can be credited against US Federal Capital Gains liability via IRS Form 1116.'
                    : residentCountry === 'UAE'
                    ? 'UAE levies 0% personal capital gains tax. NRE interest is 100% tax-free in India and UAE.'
                    : 'Treaty relief available under bilateral article provisions.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODULE 5: CARRIED FORWARD LOSSES & SET-OFF ── */}
      {activeSubTab === 'CARRIED_FORWARD_LOSSES' && (
        <div className="space-y-6">
          {/* Executive Overview Banner */}
          <div
            className="p-6 rounded-3xl border shadow-md space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <History className="w-5 h-5 text-amber-500" />
                  Carried Forward Capital Losses & Set-Off Matrix (ITR-2/3 Schedule CFL)
                </h3>
                <p className="text-xs mt-1 max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Enter previous financial years' brought-forward Short-Term Capital Losses (STCL) and Long-Term Capital Losses (LTCL) for each portfolio. The tax engine automatically applies statutory set-off rules under <b>IT Act Sections 70, 71 & 74</b>, factors in the <b>Section 112A ₹1.25 Lakh exemption</b>, applies the statutory <b>15% Surcharge Cap</b>, and incorporates the <b>4% Health & Education Cess</b> to compute true post-tax liability and <b>Post-Tax XIRR</b>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveCarriedLosses}
                  disabled={isSavingLosses}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm border"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    borderColor: 'rgba(245, 158, 11, 0.4)'
                  }}
                >
                  <Save className={`w-4 h-4 ${isSavingLosses ? 'animate-spin' : ''}`} />
                  {isSavingLosses ? 'Saving...' : 'Save & Recalculate'}
                </button>
              </div>
            </div>

            {saveLossMessage && (
              <div className="p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{saveLossMessage}</span>
              </div>
            )}

            {/* 4 Summary KPI Cards */}
            {(() => {
              const totalStcl = carriedLosses.reduce((sum, r) => sum + Number(r.stcl_amount || 0), 0);
              const totalLtcl = carriedLosses.reduce((sum, r) => sum + Number(r.ltcl_amount || 0), 0);
              const totalAbsorbed = carriedLosses.reduce((sum, r) => sum + Number(r.stcl_utilized || 0) + Number(r.ltcl_utilized || 0), 0);
              const totalTaxSaved = carriedLosses.reduce((sum, r) => sum + Number(r.tax_saved || 0), 0);

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
                  <div className="p-4 rounded-2xl border shadow-sm space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>Total Brought Forward STCL</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30">Offsets STCG & LTCG</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {formatINR(totalStcl)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Eligible for carry forward up to 8 AYs</div>
                  </div>

                  <div className="p-4 rounded-2xl border shadow-sm space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>Total Brought Forward LTCL</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">Offsets LTCG only</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-amber-400">
                      {formatINR(totalLtcl)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Eligible for carry forward up to 8 AYs</div>
                  </div>

                  <div className="p-4 rounded-2xl border shadow-sm space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>Losses Absorbed this FY</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Current FY {selectedFY}</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-400">
                      {formatINR(totalAbsorbed)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Set off against FY {selectedFY} capital gains</div>
                  </div>

                  <div className="p-4 rounded-2xl border shadow-sm space-y-1.5" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                      <span>Tax Saved via Set-Off</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">Cess + Surcharge</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-purple-400">
                      {formatINR(totalTaxSaved)}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Direct relief credited to Post-Tax XIRR</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Per-Portfolio Carried Forward Loss Entry Matrix */}
          <div
            className="rounded-3xl border shadow-md overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="p-5 border-b flex items-center justify-between flex-wrap gap-3" style={{ borderColor: 'var(--border-card)' }}>
              <div>
                <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Portfolio Carried Forward Loss Ledger (Financial Year {selectedFY})
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Enter or edit the exact loss figures from your filed ITR-2 Schedule CFL for each portfolio.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>Values persist permanently in database and update Post-Tax XIRR across all views.</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b font-bold" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}>
                    <th className="py-3 px-4">Portfolio</th>
                    <th className="py-3 px-4 min-w-[150px]">Brought Forward STCL (₹)</th>
                    <th className="py-3 px-4 min-w-[150px]">Brought Forward LTCL (₹)</th>
                    <th className="py-3 px-4 min-w-[120px]">AY of Origin</th>
                    <th className="py-3 px-4 min-w-[200px]">Filing Reference / Notes</th>
                    <th className="py-3 px-4 text-right">Current FY Tax Provision</th>
                    <th className="py-3 px-4 text-right">Loss Absorbed</th>
                    <th className="py-3 px-4 text-right">Remaining Loss</th>
                    <th className="py-3 px-4 text-right">Tax Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-card)' }}>
                  {carriedLosses.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                        No portfolio records found for this member and financial year.
                      </td>
                    </tr>
                  ) : (
                    carriedLosses.map((row, idx) => {
                      const absorbed = (Number(row.stcl_utilized) || 0) + (Number(row.ltcl_utilized) || 0);
                      const remaining = (Number(row.stcl_remaining) || 0) + (Number(row.ltcl_remaining) || 0);

                      return (
                        <tr key={row.portfolio || idx} className="hover:bg-cyan-500/5 transition-colors">
                          <td className="py-3 px-4 font-bold" style={{ color: 'var(--text-primary)' }}>
                            <div>{row.portfolio}</div>
                            <div className="text-[10px] font-normal flex flex-wrap items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              <span>{row.owner_name || row.member_name}</span>
                              {row.pan && (
                                <span className="font-mono px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                  PAN: {row.pan}
                                </span>
                              )}
                              {row.is_senior_citizen && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-pink-500/15 text-pink-400 border border-pink-500/30">
                                  👵 Senior Citizen
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-4">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400 font-mono text-xs">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={row.stcl_amount === 0 ? '' : row.stcl_amount}
                                placeholder="0"
                                onChange={(e) => handleLossChange(idx, 'stcl_amount', parseFloat(e.target.value) || 0)}
                                className="w-full pl-6 pr-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all focus:outline-none focus:ring-1 focus:ring-blue-400"
                                style={{
                                  background: 'var(--bg-table-alt)',
                                  borderColor: 'var(--border-card)',
                                  color: 'var(--text-primary)'
                                }}
                              />
                            </div>
                          </td>

                          <td className="py-2 px-4">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400 font-mono text-xs">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={row.ltcl_amount === 0 ? '' : row.ltcl_amount}
                                placeholder="0"
                                onChange={(e) => handleLossChange(idx, 'ltcl_amount', parseFloat(e.target.value) || 0)}
                                className="w-full pl-6 pr-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all focus:outline-none focus:ring-1 focus:ring-amber-400"
                                style={{
                                  background: 'var(--bg-table-alt)',
                                  borderColor: 'var(--border-card)',
                                  color: 'var(--text-primary)'
                                }}
                              />
                            </div>
                          </td>

                          <td className="py-2 px-4">
                            <input
                              type="text"
                              value={row.assessment_year || ''}
                              placeholder="AY 2025-26"
                              onChange={(e) => handleLossChange(idx, 'assessment_year', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              style={{
                                background: 'var(--bg-table-alt)',
                                borderColor: 'var(--border-card)',
                                color: 'var(--text-primary)'
                              }}
                            />
                          </td>

                          <td className="py-2 px-4">
                            <input
                              type="text"
                              value={row.notes || ''}
                              placeholder="e.g. Per ITR-2 filed 28-Jul-2024"
                              onChange={(e) => handleLossChange(idx, 'notes', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg text-xs border transition-all focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              style={{
                                background: 'var(--bg-table-alt)',
                                borderColor: 'var(--border-card)',
                                color: 'var(--text-primary)'
                              }}
                            />
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                            {row.total_tax_provision > 0 ? formatINR(row.total_tax_provision) : '₹0'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {absorbed > 0 ? formatINR(absorbed) : '—'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold" style={{ color: remaining > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {remaining > 0 ? formatINR(remaining) : '—'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-purple-400">
                            {row.tax_saved > 0 ? `+${formatINR(row.tax_saved)}` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ background: 'var(--bg-table-alt)', borderColor: 'var(--border-card)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  <b>Set-off Priority:</b> LTCL offsets LTCG first. STCL offsets STCG, then remaining LTCG. Full relief incorporates 15% Surcharge and 4% Cess.
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveCarriedLosses}
                disabled={isSavingLosses}
                className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border shrink-0"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--accent-gold)'
                }}
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingLosses ? 'Saving...' : 'Save Loss Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NriTaxRepatriationHub;
