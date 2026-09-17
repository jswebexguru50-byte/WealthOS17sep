import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  TrendingUp,
  Percent,
  Calculator,
  Calendar,
  ChevronDown,
  Info,
  Download,
  AlertTriangle,
  ArrowRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  CheckCircle2,
  ShieldAlert,
  X,
  Coins,
  Clock,
  TrendingDown,
  ShieldCheck,
  Scale,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { RealizedGain, TaxSummaryRow, PanRealizedSummary } from '../types.js';
import { formatINR, formatPct } from '../lib/formatters.js';
import { stcgRate, ltcgRate, ltcgExemptionLimit } from '../lib/decimalUtils.js';

interface TaxViewProps {
  selectedPortfolio: string;
  setSelectedPortfolio: (portfolio: string) => void;
  portfolios: string[];
  formatCurrency: (val: number) => string;
}

type TaxTabType = 'realized-gains' | 'tax-harvesting' | 'advance-tax' | 'cfl-waterfall' | 'dividend-income' | 'repurchase-tracker';

export function TaxView({
  selectedPortfolio,
  setSelectedPortfolio,
  portfolios,
  formatCurrency
}: TaxViewProps) {
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
  const [fys, setFys] = useState<string[]>(defaultFyData.list);
  const [currentFy, setCurrentFy] = useState<string>(defaultFyData.currentFY);
  const [selectedFy, setSelectedFy] = useState<string>(defaultFyData.currentFY);
  const [selectedPan, setSelectedPan] = useState<string>('ALL');
  const [panSummaries, setPanSummaries] = useState<PanRealizedSummary[]>([]);
  const [summary, setSummary] = useState<TaxSummaryRow[]>([]);
  const [gains, setGains] = useState<RealizedGain[]>([]);
  
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<TaxTabType>('realized-gains');

  // TX-1: Tax Harvesting State
  const [harvestData, setHarvestData] = useState<any | null>(null);
  const [loadingHarvest, setLoadingHarvest] = useState(false);
  const [harvestActionMsg, setHarvestActionMsg] = useState('');

  // TX-4: Advance Tax Schedule State
  const [advanceTaxSchedule, setAdvanceTaxSchedule] = useState<any[]>([]);
  const [loadingAdvanceTax, setLoadingAdvanceTax] = useState(false);
  const [advanceTaxLegacy, setAdvanceTaxLegacy] = useState<any | null>(null);

  // TX-5: CFL Waterfall State
  const [cflWaterfall, setCflWaterfall] = useState<any[]>([]);
  const [loadingCfl, setLoadingCfl] = useState(false);

  // TX-6: Dividend Summary State
  const [taxDividendSummary, setTaxDividendSummary] = useState<any | null>(null);
  const [loadingTaxDividends, setLoadingTaxDividends] = useState(false);

  // TX-7: Repurchase Reminders State
  const [repurchaseReminders, setRepurchaseReminders] = useState<any[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);

  // Search & Sort State
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('sell_date');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [loadingGains, setLoadingGains] = useState(false);

  const fetchFys = async () => {
    try {
      const res = await fetch('/api/tax/financial-years');
      const data = await res.json();
      if (data.financial_years && data.financial_years.length > 0) {
        setFys(data.financial_years);
        if (data.current_fy) {
          setCurrentFy(data.current_fy);
        }
        if (!selectedFy || !data.financial_years.includes(selectedFy)) {
          setSelectedFy(data.financial_years[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTaxData = async () => {
    if (!selectedFy) return;
    setLoadingGains(true);
    let url = `/api/tax-summary?fy=${selectedFy}`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }
    if (selectedPan !== 'ALL') {
      url += `&pan=${encodeURIComponent(selectedPan)}`;
    }
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSummary(data.consolidated || []);
        setGains(data.realized_gains || []);
        if (Array.isArray(data.pan_summary)) {
          setPanSummaries(data.pan_summary);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGains(false);
    }
  };

  const fetchAdvanceTaxLegacy = async () => {
    if (!selectedFy) return;
    let url = `/api/tax/advance_tax_windows?fy=${selectedFy}`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }
    if (selectedPan !== 'ALL') {
      url += `&pan=${encodeURIComponent(selectedPan)}`;
    }
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.schedule_os_dividends && data.schedule_cg_stcg_111a && data.schedule_cg_ltcg_112a) {
        setAdvanceTaxLegacy(data);
      } else {
        setAdvanceTaxLegacy(null);
      }
    } catch (err) {
      console.error(err);
      setAdvanceTaxLegacy(null);
    }
  };

  // TX-1: Fetch Harvesting Recommendations
  const fetchHarvestRecommendations = async () => {
    try {
      setLoadingHarvest(true);
      let url = `/api/tax/harvest-recommendations?fy=${selectedFy}`;
      if (selectedPan !== 'ALL') url += `&pan=${encodeURIComponent(selectedPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setHarvestData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHarvest(false);
    }
  };

  // TX-1: Record Harvest Action
  const handleRecordHarvest = async (sug: any) => {
    try {
      const res = await fetch('/api/tax/harvest-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sug.symbol,
          isin: sug.isin,
          portfolio: sug.portfolio,
          pan: sug.pan,
          quantity: sug.quantity,
          sold_price: sug.current_price,
          loss_booked: Math.abs(sug.unrealized_loss),
          loss_category: sug.loss_category,
          tax_saved: sug.estimated_tax_saved,
          execution_notes: 'Executed via Tax Harvesting Engine',
          user_id: 'Portfolio Manager'
        })
      });
      const data = await res.json();
      if (data.success) {
        setHarvestActionMsg(`Harvest recorded for ${sug.symbol}! 31-day repurchase reminder created for ${data.repurchase_eligible_date}.`);
        fetchHarvestRecommendations();
        fetchRepurchaseReminders();
        setTimeout(() => setHarvestActionMsg(''), 4000);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  };

  // TX-4: Fetch Advance Tax Schedule
  const fetchAdvanceTaxSchedule = async () => {
    try {
      setLoadingAdvanceTax(true);
      let url = `/api/tax/advance-tax-schedule?fy=${selectedFy}`;
      if (selectedPan !== 'ALL') url += `&pan=${encodeURIComponent(selectedPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAdvanceTaxSchedule(data.schedule || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdvanceTax(false);
    }
  };

  // TX-5: Fetch CFL Waterfall
  const fetchCflWaterfall = async () => {
    try {
      setLoadingCfl(true);
      let url = `/api/tax/cfl-waterfall`;
      if (selectedPan !== 'ALL') url += `?pan=${encodeURIComponent(selectedPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCflWaterfall(data.waterfall || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCfl(false);
    }
  };

  // TX-6: Fetch Dividend Summary for Tax
  const fetchTaxDividendSummary = async () => {
    try {
      setLoadingTaxDividends(true);
      let url = `/api/corporate-actions/dividend-summary?fy=${selectedFy}`;
      if (selectedPan !== 'ALL') url += `&pan=${encodeURIComponent(selectedPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTaxDividendSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTaxDividends(false);
    }
  };

  // TX-7: Fetch Repurchase Reminders
  const fetchRepurchaseReminders = async () => {
    try {
      setLoadingReminders(true);
      let url = `/api/tax/repurchase-reminders`;
      if (selectedPan !== 'ALL') url += `?pan=${encodeURIComponent(selectedPan)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRepurchaseReminders(data.reminders || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReminders(false);
    }
  };

  useEffect(() => {
    fetchFys();
  }, [selectedPortfolio]);

  useEffect(() => {
    fetchTaxData();
    fetchAdvanceTaxLegacy();
    if (activeTab === 'tax-harvesting') {
      fetchHarvestRecommendations();
    } else if (activeTab === 'advance-tax') {
      fetchAdvanceTaxSchedule();
    } else if (activeTab === 'cfl-waterfall') {
      fetchCflWaterfall();
    } else if (activeTab === 'dividend-income') {
      fetchTaxDividendSummary();
    } else if (activeTab === 'repurchase-tracker') {
      fetchRepurchaseReminders();
    }
  }, [selectedFy, selectedPortfolio, selectedPan, activeTab]);

  const handleDownloadITR2 = () => {
    let url = `/api/tax/itr2_detailed?fy=${selectedFy}`;
    if (selectedPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(selectedPortfolio)}`;
    }
    if (selectedPan !== 'ALL') {
      url += `&pan=${encodeURIComponent(selectedPan)}`;
    }
    window.open(url, '_blank');
  };

  const totalPanPnl = panSummaries.reduce((sum, p) => sum + (p.total_realized_pnl || 0), 0);
  const totalPanTrades = panSummaries.reduce((sum, p) => sum + (p.trade_count || 0), 0);
  const totalPanTax = panSummaries.reduce((sum, p) => sum + (p.estimated_tax || 0), 0);
  const totalPanGrossTax = panSummaries.reduce((sum, p) => sum + (p.gross_tax || p.estimated_tax || 0), 0);
  const totalPanTaxSaved = panSummaries.reduce((sum, p) => sum + (p.tax_saved_cfl || 0), 0);
  const totalPanStclBf = panSummaries.reduce((sum, p) => sum + (p.stcl_bf || 0), 0);
  const totalPanLtclBf = panSummaries.reduce((sum, p) => sum + (p.ltcl_bf || 0), 0);
  const totalPanStclUtilized = panSummaries.reduce((sum, p) => sum + (p.stcl_utilized || 0), 0);
  const totalPanLtclUtilized = panSummaries.reduce((sum, p) => sum + (p.ltcl_utilized || 0), 0);
  const totalPanStclRemaining = panSummaries.reduce((sum, p) => sum + (p.stcl_remaining || 0), 0);
  const totalPanLtclRemaining = panSummaries.reduce((sum, p) => sum + (p.ltcl_remaining || 0), 0);

  const selectedPanObj = panSummaries.find(p => p.pan === selectedPan);
  const currentEntity = selectedPan !== 'ALL' ? selectedPanObj : null;
  const cflStclBf = currentEntity ? (currentEntity.stcl_bf || 0) : (summary[0]?.stcl_bf ?? totalPanStclBf);
  const cflLtclBf = currentEntity ? (currentEntity.ltcl_bf || 0) : (summary[0]?.ltcl_bf ?? totalPanLtclBf);
  const cflStclUtilized = currentEntity ? (currentEntity.stcl_utilized || 0) : (summary[0]?.stcl_utilized ?? totalPanStclUtilized);
  const cflLtclUtilized = currentEntity ? (currentEntity.ltcl_utilized || 0) : (summary[0]?.ltcl_utilized ?? totalPanLtclUtilized);
  const cflStclRemaining = currentEntity ? (currentEntity.stcl_remaining || 0) : (summary[0]?.stcl_remaining ?? totalPanStclRemaining);
  const cflLtclRemaining = currentEntity ? (currentEntity.ltcl_remaining || 0) : (summary[0]?.ltcl_remaining ?? totalPanLtclRemaining);
  const cflTaxSaved = currentEntity ? (currentEntity.tax_saved_cfl || 0) : (summary[0]?.tax_saved_cfl ?? totalPanTaxSaved);
  const grossTax = currentEntity ? (currentEntity.gross_tax ?? currentEntity.estimated_tax) : (summary[0]?.gross_tax ?? totalPanGrossTax);
  const netTax = currentEntity ? currentEntity.estimated_tax : (summary[0]?.total_tax ?? totalPanTax);

  // Date-aware split calculations for TX-3 (Finance Act 2024 cutover at 2024-07-23)
  const panTrades = gains.filter(g => !selectedPanObj || selectedPan === 'ALL' || (g.pan || '').trim().toUpperCase() === selectedPan.trim().toUpperCase());
  const calculatedStcgTax = panTrades
    .filter(g => g.tax_category === 'STCG' && (g.taxable_pnl || 0) > 0)
    .reduce((acc, g) => acc + (g.taxable_pnl || 0) * stcgRate(g.sell_date || '2024-07-23'), 0);
  
  const fyYearNum = parseInt(selectedFy?.split('-')[0] || '2024', 10);
  const applicableLtcgExemption = fyYearNum >= 2024 ? 125000 : 100000;

  const activeSummary = selectedPanObj ? {
    stcg_gains: selectedPanObj.stcg_gains,
    stcg_tax: Math.round((calculatedStcgTax > 0 ? calculatedStcgTax : Math.max(0, (selectedPanObj.post_taxable_stcg ?? selectedPanObj.net_stcg)) * (fyYearNum > 2024 ? 0.20 : 0.15)) * 100) / 100,
    ltcg_gains: selectedPanObj.ltcg_gains,
    ltcg_exemption: applicableLtcgExemption,
    ltcg_taxable: selectedPanObj.post_taxable_ltcg ?? Math.max(0, selectedPanObj.net_ltcg - applicableLtcgExemption),
    ltcg_tax: Math.round((selectedPanObj.post_taxable_ltcg ?? Math.max(0, selectedPanObj.net_ltcg - applicableLtcgExemption)) * (fyYearNum > 2024 ? 0.125 : 0.10) * 100) / 100,
    dividends: 0,
    total_realized_pnl: selectedPanObj.total_realized_pnl,
    total_tax: selectedPanObj.estimated_tax
  } : (summary[0] || {
    stcg_gains: 0, stcg_tax: 0,
    ltcg_gains: 0, ltcg_exemption: applicableLtcgExemption,
    ltcg_taxable: 0, ltcg_tax: 0,
    dividends: 0, total_realized_pnl: 0, total_tax: 0
  });

  const filteredGains = gains.filter(g => {
    if (selectedPan !== 'ALL') {
      const itemPan = (g.pan || '').trim().toUpperCase();
      const filterPan = selectedPan.trim().toUpperCase();
      if (itemPan !== filterPan) return false;
    }
    const s = search.toLowerCase().trim();
    if (!s) return true;
    return (
      (g.symbol || '').toLowerCase().includes(s) ||
      (g.company_name || '').toLowerCase().includes(s) ||
      (g.isin || '').toLowerCase().includes(s) ||
      (g.tax_category || '').toLowerCase().includes(s) ||
      (g.pan || '').toLowerCase().includes(s) ||
      (g.owner_name || '').toLowerCase().includes(s) ||
      (g.portfolio || '').toLowerCase().includes(s)
    );
  });

  const sortedGains = [...filteredGains].sort((a, b) => {
    let valA: any = a[sortField as keyof RealizedGain];
    let valB: any = b[sortField as keyof RealizedGain];

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
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 inline-block ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" /> 
      : <ArrowDown className="w-3.5 h-3.5 text-emerald-400 inline-block ml-1" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-3">
            Tax Center & Capital Gains
            <span className="text-xs font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              TX-1 to TX-7 Statutory Architecture
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Section 111A/112A capital gains, Finance Act 2024 cutover, Tax Loss Harvesting with 31-day GAAR buffer, and Section 234C Advance Tax schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* PAN Select Dropdown */}
          <div className="relative">
            <select
              value={selectedPan}
              onChange={(e) => setSelectedPan(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm font-medium pl-4 pr-10 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:border-emerald-500 transition-colors font-sans"
            >
              <option value="ALL">🌐 All PAN Numbers ({totalPanTrades} Trades)</option>
              {panSummaries.map(p => (
                <option key={p.pan} value={p.pan}>
                  {p.pan} — {p.owner_name} ({p.trade_count} Trades • {p.total_realized_pnl >= 0 ? '+' : ''}{formatCurrency(p.total_realized_pnl)})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* FY Select */}
          <div className="relative">
            <select
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm font-medium pl-4 pr-10 py-2.5 rounded-xl cursor-pointer focus:outline-none focus:border-emerald-500 transition-colors font-sans"
            >
              <option value="ALL">🌐 All Financial Years</option>
              {fys.map(f => (
                <option key={f} value={f}>
                  FY {f}{f === currentFy ? ' (Current YTD)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Download CSV */}
          <button
            onClick={handleDownloadITR2}
            disabled={gains.length === 0}
            className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download ITR-2 CSV
          </button>
        </div>
      </div>

      {/* Non-Dismissible Statutory Caution & Finance Act 2024 Date-Aware Cutover Banner (TX-3) */}
      <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs space-y-1.5 leading-relaxed">
        <div className="flex items-center gap-2 font-bold text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>STATUTORY DISCLAIMER & BUDGET 2024 DATE-AWARE CUTOVER (Section 111A / 112A)</span>
        </div>
        <p className="text-amber-200/90 text-[11px]">
          Per the Finance (No. 2) Act 2024, trades executed <strong>on or after 23-July-2024</strong> are taxed at <strong>20% for STCG</strong> and <strong>12.5% for LTCG</strong> (with ₹1,25,000 exemption limit). Trades executed <strong>before 23-July-2024</strong> are taxed at <strong>15% for STCG</strong> and <strong>10% for LTCG</strong> (with ₹1,00,000 exemption limit).
        </p>
        <p className="text-amber-300/80 text-[10px] font-mono">
          ⚠️ Tax projections are algorithmic estimates based on registered transactions. Confirm all computations with a certified Chartered Accountant prior to filing your official ITR-2/ITR-3.
        </p>
      </div>

      {/* Primary Sub-Navigation Tab Bar */}
      <div className="flex flex-wrap border-b border-slate-800/80 bg-slate-900/40 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('realized-gains')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'realized-gains'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Realized Gains & Slabs
        </button>

        <button
          onClick={() => {
            setActiveTab('tax-harvesting');
            fetchHarvestRecommendations();
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'tax-harvesting'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Tax Loss Harvesting (TX-1)
        </button>

        <button
          onClick={() => {
            setActiveTab('advance-tax');
            fetchAdvanceTaxSchedule();
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'advance-tax'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          Advance Tax Schedule (TX-4)
        </button>

        <button
          onClick={() => {
            setActiveTab('cfl-waterfall');
            fetchCflWaterfall();
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'cfl-waterfall'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          8-Year CFL Waterfall (TX-5)
        </button>

        <button
          onClick={() => {
            setActiveTab('dividend-income');
            fetchTaxDividendSummary();
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'dividend-income'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-amber-400" />
          Dividend & TDS (TX-6)
        </button>

        <button
          onClick={() => {
            setActiveTab('repurchase-tracker');
            fetchRepurchaseReminders();
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'repurchase-tracker'
              ? 'bg-slate-900 border border-slate-800 text-emerald-400 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          31-Day GAAR Tracker (TX-7)
        </button>
      </div>

      {/* ─── TAB 1: REALIZED GAINS & CAPITAL GAINS MATRIX ────────────────────── */}
      {activeTab === 'realized-gains' && (
        <div className="space-y-6">
          {/* Section 112A Grandfathering Banner (TX-2) */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Info className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Section 112A Statutory Grandfathering Formula (For Shares Acquired Prior to 31-Jan-2018)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
              Adjusted Cost of Acquisition = MAX(Actual Buy Price, MIN(Fair Market Value as of 31-01-2018, Sale Consideration))
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Taxable LTCG = Sale Proceeds - Adjusted Grandfathered Cost. All capital gains accrued prior to 31 January 2018 are completely tax-exempt.
            </p>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-slate-400 text-sm font-medium">Net Estimated Tax</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-extrabold tracking-wider">PAYABLE</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold font-display text-emerald-400 leading-tight">
                  {formatCurrency(netTax)}
                </h2>
                <p className="text-xs text-slate-400">
                  {cflTaxSaved > 0 && <span className="text-emerald-400 font-medium">Saved {formatCurrency(cflTaxSaved)} via CFL</span>}
                </p>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-slate-400 text-sm font-medium">Realized STCG (Short-Term)</span>
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold">15% - 20%</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold font-display text-slate-100 leading-tight">
                  {formatCurrency(activeSummary.stcg_gains)}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Tax: {formatCurrency(activeSummary.stcg_tax)}
                </p>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-slate-400 text-sm font-medium">Realized LTCG (Long-Term)</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-bold">10% - 12.5%</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold font-display text-slate-100 leading-tight">
                  {formatCurrency(activeSummary.ltcg_gains)}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Exemption: {formatCurrency(activeSummary.ltcg_exemption)} • Tax: {formatCurrency(activeSummary.ltcg_tax)}
                </p>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-slate-400 text-sm font-medium">Brought Forward Losses</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">Schedule CFL</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold font-display text-emerald-400 leading-tight">
                  {formatCurrency(cflStclBf + cflLtclBf)}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  Absorbed: {formatCurrency(cflStclUtilized + cflLtclUtilized)} • Rem: {formatCurrency(cflStclRemaining + cflLtclRemaining)}
                </p>
              </div>
            </div>
          </div>

          {/* Realized Trades Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <div className="p-4 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between">
              <h4 className="font-bold text-slate-200 text-sm">Realized Closed Positions Audit Ledger</h4>
              <span className="text-xs font-mono text-slate-400">{sortedGains.length} Trades</span>
            </div>
            <table className="min-w-full divide-y divide-slate-800/60 text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                <tr>
                  <th className="px-5 py-3.5 text-left cursor-pointer" onClick={() => toggleSort('symbol')}>
                    Scrip {renderSortIcon('symbol')}
                  </th>
                  <th className="px-5 py-3.5 text-left cursor-pointer" onClick={() => toggleSort('sell_date')}>
                    Sell Date {renderSortIcon('sell_date')}
                  </th>
                  <th className="px-5 py-3.5 text-center cursor-pointer" onClick={() => toggleSort('holding_days')}>
                    Holding Days {renderSortIcon('holding_days')}
                  </th>
                  <th className="px-5 py-3.5 text-right">Matched Qty</th>
                  <th className="px-5 py-3.5 text-right">Acq. Cost</th>
                  <th className="px-5 py-3.5 text-right">Proceeds</th>
                  <th className="px-5 py-3.5 text-right cursor-pointer" onClick={() => toggleSort('realized_pnl')}>
                    Realized P&L {renderSortIcon('realized_pnl')}
                  </th>
                  <th className="px-5 py-3.5 text-right cursor-pointer" onClick={() => toggleSort('taxable_pnl')}>
                    Taxable P&L {renderSortIcon('taxable_pnl')}
                  </th>
                  <th className="px-5 py-3.5 text-center">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                {sortedGains.map((g, idx) => (
                  <tr key={`${g.symbol}_${g.sell_date}_${idx}`} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-display font-bold text-slate-100">{g.symbol}</span>
                      <span className="text-[10px] text-slate-500 block">{g.portfolio} • {g.pan}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{g.sell_date}</td>
                    <td className="px-5 py-3.5 text-center text-slate-300">{g.holding_days}d</td>
                    <td className="px-5 py-3.5 text-right text-slate-200">{Number(g.matched_qty).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right text-slate-400">{formatINR(g.buy_cost)}</td>
                    <td className="px-5 py-3.5 text-right text-slate-200">{formatINR(g.sell_proceeds)}</td>
                    <td className={`px-5 py-3.5 text-right font-bold ${g.realized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatINR(g.realized_pnl)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-100">
                      {formatINR(g.taxable_pnl)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        g.tax_category === 'STCG' ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/30'
                      }`}>
                        {g.tax_category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 2: TAX LOSS HARVESTING ENGINE (TX-1) ────────────────────────── */}
      {activeTab === 'tax-harvesting' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  Tax Loss Harvesting & Statutory Offset Waterfall (TX-1)
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Identify unrealized loss lots in existing holdings to offset realized capital gains. The algorithm applies the statutory offset priority: <strong>STCL can offset both STCG and LTCG</strong>; <strong>LTCL can strictly offset only LTCG</strong>. Offsets draw from a shared gain pool without double counting.
                </p>
              </div>

              <button
                onClick={fetchHarvestRecommendations}
                className="flex items-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHarvest ? 'animate-spin text-emerald-400' : ''}`} />
                Scan Portfolio Holdings
              </button>
            </div>

            {/* 31-Day GAAR Precautionary Disclaimer */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 text-slate-400 text-[11px] leading-relaxed flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200">31-Day GAAR Precautionary Window:</strong> While the Indian Income Tax Act does not contain a statutory 30-day "wash-sale rule", the General Anti-Avoidance Rules (GAAR) empower assessing officers to scrutinize transactions lacking commercial substance. A 31-calendar-day holding buffer before repurchase is recommended.
              </div>
            </div>
          </div>

          {harvestActionMsg && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {harvestActionMsg}
            </div>
          )}

          {harvestData && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">Realized STCG Pool</span>
                  <p className="text-2xl font-display font-bold text-slate-100 mt-1">{formatINR(harvestData.realized_stcg_pool || 0)}</p>
                  <span className="text-[11px] text-slate-500 font-mono">Tax rate: 20% (or 15%)</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-indigo-400 font-bold">Realized LTCG Pool</span>
                  <p className="text-2xl font-display font-bold text-slate-100 mt-1">{formatINR(harvestData.realized_ltcg_pool || 0)}</p>
                  <span className="text-[11px] text-slate-500 font-mono">Tax rate: 12.5% (or 10%)</span>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Total Potential Tax Savings</span>
                  <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{formatINR(harvestData.total_potential_tax_saved || 0)}</p>
                  <span className="text-[11px] text-slate-500 font-mono">By harvesting eligible loss lots</span>
                </div>
              </div>

              {/* Recommendations Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
                <div className="p-4 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 text-sm">Harvesting Opportunities (Ranked by Tax Efficiency)</h4>
                  <span className="text-xs font-mono text-slate-400">{harvestData.suggestions?.length || 0} Lots Identified</span>
                </div>
                <table className="min-w-full divide-y divide-slate-800/60 text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Scrip / Portfolio</th>
                      <th className="px-5 py-3.5 text-right">Holding Qty</th>
                      <th className="px-5 py-3.5 text-right">LTP / Avg Buy</th>
                      <th className="px-5 py-3.5 text-right">Unrealized Loss</th>
                      <th className="px-5 py-3.5 text-center">Category</th>
                      <th className="px-5 py-3.5 text-right">Offsettable Loss</th>
                      <th className="px-5 py-3.5 text-right">Tax Saved</th>
                      <th className="px-5 py-3.5 text-center">Repurchase Eligible</th>
                      <th className="px-5 py-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                    {harvestData.suggestions?.map((sug: any, idx: number) => (
                      <tr key={`${sug.symbol}_${idx}`} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-display font-bold text-slate-100">{sug.symbol}</span>
                          <span className="text-[10px] text-slate-500 block">{sug.portfolio} • {sug.pan}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-200">{Number(sug.quantity).toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-slate-200 font-bold">{formatINR(sug.current_price)}</span>
                          <span className="text-[10px] text-slate-500 block">Avg: {formatINR(sug.avg_buy_price)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-rose-400 font-bold">{formatINR(sug.unrealized_loss)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            sug.loss_category === 'STCL' ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/30'
                          }`}>
                            {sug.loss_category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-300">{formatINR(sug.offsettable_loss)}</td>
                        <td className="px-5 py-3.5 text-right text-emerald-400 font-bold">{formatINR(sug.estimated_tax_saved)}</td>
                        <td className="px-5 py-3.5 text-center text-slate-400">{sug.repurchase_eligible_date}</td>
                        <td className="px-5 py-3.5 text-center">
                          {sug.action_status === 'AVAILABLE' ? (
                            <button
                              onClick={() => handleRecordHarvest(sug)}
                              className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Record Harvest
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-mono">Offset Pool Full</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: ADVANCE TAX SCHEDULE (TX-4) ──────────────────────────────── */}
      {activeTab === 'advance-tax' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Statutory Indian Advance Tax Schedule & Section 234C Interest Risk (TX-4)
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Under Section 208, every taxpayer whose estimated tax liability for the financial year exceeds ₹10,000 must pay advance tax in four statutory installments. Shortfalls in any installment attract <strong>simple interest @ 1% per month for 3 months under Section 234C</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {advanceTaxSchedule.map((inst) => (
              <div key={inst.installment_num} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-400">{inst.quarter_label}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    inst.is_past_due ? 'bg-rose-950/60 text-rose-400 border border-rose-500/30' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {inst.is_past_due ? 'PAST DUE' : 'UPCOMING'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Statutory Due Date</span>
                  <p className="text-sm font-mono text-slate-200 font-bold">{inst.statutory_due_date}</p>
                </div>

                <div className="border-t border-slate-800/60 pt-2 space-y-1 font-mono text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Cumulative Target:</span>
                    <span className="font-bold text-slate-200">{inst.cumulative_target_pct}%</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Required Cumulative:</span>
                    <span className="text-slate-200">{formatINR(inst.cumulative_required_amount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Amount Payable:</span>
                    <span className="font-bold text-emerald-400">{formatINR(inst.amount_payable_this_installment)}</span>
                  </div>
                </div>

                {inst.interest_234c_risk_note && (
                  <p className="text-[10px] text-amber-400/80 italic font-mono pt-1 border-t border-slate-800/40">
                    {inst.interest_234c_risk_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 4: 8-YEAR CFL WATERFALL (TX-5) ──────────────────────────────── */}
      {activeTab === 'cfl-waterfall' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              8-Year Statutory Loss Carry-Forward (CFL) Expiry Waterfall (TX-5)
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Under Sections 70 to 74 of the Income Tax Act, capital losses can be carried forward for up to <strong>8 assessment years immediately succeeding the assessment year in which the loss was first computed</strong>. Losses nearing the 8-year statutory expiry window are highlighted in red for urgent priority absorption.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-full divide-y divide-slate-800/60 text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none">
                <tr>
                  <th className="px-5 py-3.5 text-left">Assesse PAN</th>
                  <th className="px-5 py-3.5 text-left">Origin Financial Year</th>
                  <th className="px-5 py-3.5 text-left">Origin Assessment Year</th>
                  <th className="px-5 py-3.5 text-center">Loss Category</th>
                  <th className="px-5 py-3.5 text-right">Original Loss</th>
                  <th className="px-5 py-3.5 text-right">Unabsorbed Remaining</th>
                  <th className="px-5 py-3.5 text-left">Expiry Assessment Year</th>
                  <th className="px-5 py-3.5 text-center">Years Remaining</th>
                  <th className="px-5 py-3.5 text-right">Potential Tax Benefit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300 font-mono">
                {cflWaterfall.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-100">{item.pan}</td>
                    <td className="px-5 py-3.5 text-slate-400">{item.financial_year_origin}</td>
                    <td className="px-5 py-3.5 text-slate-400">{item.assessment_year_origin}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.loss_type === 'STCL' ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30' : 'bg-indigo-950/60 text-indigo-400 border border-indigo-500/30'
                      }`}>
                        {item.loss_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-300">{formatINR(item.original_loss_amount)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-100">{formatINR(item.remaining_unabsorbed)}</td>
                    <td className="px-5 py-3.5 text-slate-300">{item.expiry_assessment_year}</td>
                    <td className="px-5 py-3.5 text-center">
                      {item.is_near_expiry ? (
                        <span className="inline-block px-2 py-0.5 bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded-full font-bold animate-pulse">
                          {item.years_remaining_to_expire}y (EXPIRING SOON)
                        </span>
                      ) : (
                        <span className="text-slate-400">{item.years_remaining_to_expire !== null ? `${item.years_remaining_to_expire} years` : '-'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right text-emerald-400 font-bold">{formatINR(item.estimated_tax_benefit_if_used)}</td>
                  </tr>
                ))}
                {cflWaterfall.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500 font-mono">
                      No carried forward losses recorded for this PAN filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 5: DIVIDEND & SECTION 194 TDS (TX-6) ────────────────────────── */}
      {activeTab === 'dividend-income' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              Dividend Income & Section 194 TDS Credit (TX-6)
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Dividends from Indian companies are taxable under "Income from Other Sources" at applicable slab rates. Domestic companies withhold <strong>10% TDS under Section 194</strong> where dividend payouts exceed ₹5,000 per financial year.
            </p>
          </div>

          {taxDividendSummary && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Gross Dividend (Schedule OS)</span>
                  <p className="text-2xl font-display font-bold text-slate-100 mt-1">{formatINR(taxDividendSummary.gross_dividend || 0)}</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">Section 194 TDS Deducted (10%)</span>
                  <p className="text-2xl font-display font-bold text-amber-400 mt-1">{formatINR(taxDividendSummary.estimated_tds || 0)}</p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Net Bank Credit</span>
                  <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{formatINR(taxDividendSummary.net_dividend || 0)}</p>
                </div>
              </div>

              {/* Scrip Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
                <table className="min-w-full divide-y divide-slate-800/60 text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none font-sans">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Scrip Symbol</th>
                      <th className="px-5 py-3.5 text-right">Gross Dividend</th>
                      <th className="px-5 py-3.5 text-right">Section 194 TDS (10%)</th>
                      <th className="px-5 py-3.5 text-right">Net Proceeds</th>
                      <th className="px-5 py-3.5 text-center">Payout Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {taxDividendSummary.by_symbol?.map((s: any) => (
                      <tr key={s.symbol} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-100">{s.symbol}</td>
                        <td className="px-5 py-3.5 text-right">{formatINR(s.gross)}</td>
                        <td className="px-5 py-3.5 text-right text-amber-400">{formatINR(s.tds)}</td>
                        <td className="px-5 py-3.5 text-right text-emerald-400 font-bold">{formatINR(s.gross - s.tds)}</td>
                        <td className="px-5 py-3.5 text-center text-slate-400">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 6: 31-DAY REPURCHASE TRACKER & GAAR REMINDERS (TX-7) ─────────── */}
      {activeTab === 'repurchase-tracker' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              31-Day GAAR Repurchase Calendar & Intervening Corporate Actions (TX-7)
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Tracks positions harvested for tax losses until they complete their 31-calendar-day precautionary holding buffer under General Anti-Avoidance Rules. Automatically scans for any intervening corporate actions (splits, bonuses) that occurred during the window to prevent cost basis distortions upon repurchase.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950">
            <table className="min-w-full divide-y divide-slate-800/60 text-xs font-mono">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold text-[9px] tracking-wider select-none font-sans">
                <tr>
                  <th className="px-5 py-3.5 text-left">Harvested Scrip</th>
                  <th className="px-5 py-3.5 text-left">Sold Date</th>
                  <th className="px-5 py-3.5 text-right">Loss Booked</th>
                  <th className="px-5 py-3.5 text-right">Tax Saved</th>
                  <th className="px-5 py-3.5 text-center">31-Day Eligible Date</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-left">Intervening Corporate Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {repurchaseReminders.map((r) => (
                  <tr key={r.harvest_id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-100">
                      {r.symbol}
                      <span className="text-[10px] text-slate-500 block">{r.portfolio} • {r.pan}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{r.sold_date}</td>
                    <td className="px-5 py-3.5 text-right text-rose-400 font-bold">{formatINR(r.loss_amount)}</td>
                    <td className="px-5 py-3.5 text-right text-emerald-400 font-bold">{formatINR(r.tax_saved)}</td>
                    <td className="px-5 py-3.5 text-center text-indigo-400 font-bold">{r.repurchase_eligible_date}</td>
                    <td className="px-5 py-3.5 text-center">
                      {r.outcome_status === 'ELIGIBLE_FOR_REPURCHASE' ? (
                        <span className="inline-block px-2 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded-full font-bold">
                          ELIGIBLE TO REBUY
                        </span>
                      ) : r.outcome_status === 'INTERVENING_CA_ALERT' ? (
                        <span className="inline-block px-2 py-0.5 bg-rose-950/80 text-rose-300 border border-rose-500/40 rounded-full font-bold animate-pulse">
                          CA ALERT
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-500/30 rounded-full font-bold">
                          HOLDING BUFFER ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-left text-xs">
                      {r.intervening_corporate_action ? (
                        <span className="text-amber-400 font-sans text-[11px]">⚠️ {r.intervening_ca_details}</span>
                      ) : (
                        <span className="text-slate-500 font-sans text-[11px]">No intervening actions</span>
                      )}
                    </td>
                  </tr>
                ))}
                {repurchaseReminders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500 font-mono">
                      No active tax harvesting repurchase reminders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
