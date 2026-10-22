import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Search,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Bookmark,
  Plus,
  Trash2,
  RotateCw,
  PieChart,
  Maximize2,
  Minimize2,
  Columns,
  Table
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { safeFetchJson } from '../lib/api';

export type PrimaryGroupType = 
  | 'FAMILY_MEMBER' 
  | 'PAN' 
  | 'PORTFOLIO' 
  | 'ASSET_CLASS' 
  | 'SECTOR' 
  | 'MARKET_CAP' 
  | 'GAIN_LOSS' 
  | 'TAX_STATUS' 
  | 'NONE';

export type SecondaryGroupType = 
  | 'NONE'
  | 'ASSET_CLASS' 
  | 'SECTOR' 
  | 'PORTFOLIO' 
  | 'PAN' 
  | 'FAMILY_MEMBER' 
  | 'TAX_STATUS';

export interface ColumnDef {
  id: string;
  label: string;
  category: 'CORE' | 'VALUATION' | 'RETURNS' | 'TAX_ALLOC';
  defaultVisible: boolean;
  align?: 'left' | 'right' | 'center';
  width: number;
}

export const ALL_REPORT_COLUMNS: ColumnDef[] = [
  { id: 'scrip', label: 'Holding / Scrip Name', category: 'CORE', defaultVisible: true, align: 'left', width: 240 },
  { id: 'symbol', label: 'Symbol', category: 'CORE', defaultVisible: true, align: 'left', width: 120 },
  { id: 'ai_signal', label: 'AI Signal', category: 'RETURNS', defaultVisible: true, align: 'center', width: 160 },
  { id: 'isin', label: 'ISIN Code', category: 'CORE', defaultVisible: false, align: 'left', width: 140 },
  { id: 'portfolio', label: 'Portfolio', category: 'CORE', defaultVisible: true, align: 'left', width: 130 },
  { id: 'owner_pan', label: 'Owner & PAN', category: 'CORE', defaultVisible: true, align: 'left', width: 160 },
  { id: 'asset_class', label: 'Asset Class', category: 'CORE', defaultVisible: true, align: 'left', width: 160 },
  { id: 'sector', label: 'Sector / Industry', category: 'CORE', defaultVisible: true, align: 'left', width: 150 },
  { id: 'quantity', label: 'Quantity / Units', category: 'VALUATION', defaultVisible: true, align: 'right', width: 130 },
  { id: 'avg_buy_price', label: 'Buy Price (₹)', category: 'VALUATION', defaultVisible: true, align: 'right', width: 130 },
  { id: 'total_cost', label: 'Invested Cost (₹)', category: 'VALUATION', defaultVisible: true, align: 'right', width: 160 },
  { id: 'ltp', label: 'CMP / NAV (₹)', category: 'VALUATION', defaultVisible: true, align: 'right', width: 150 },
  { id: 'current_value', label: 'Current Value (₹)', category: 'VALUATION', defaultVisible: true, align: 'right', width: 170 },
  { id: 'unrealized_pnl', label: 'Unrealized P&L (₹)', category: 'RETURNS', defaultVisible: true, align: 'right', width: 170 },
  { id: 'realized_pnl', label: 'Realized P&L (₹)', category: 'RETURNS', defaultVisible: false, align: 'right', width: 140 },
  { id: 'total_pnl', label: 'Total P&L (₹)', category: 'RETURNS', defaultVisible: false, align: 'right', width: 160 },
  { id: 'unrealized_pct', label: 'Unrealized %', category: 'RETURNS', defaultVisible: true, align: 'right', width: 120 },
  { id: 'day_change', label: "Today's Change", category: 'RETURNS', defaultVisible: true, align: 'right', width: 140 },
  { id: 'xirr', label: 'Holding XIRR %', category: 'RETURNS', defaultVisible: true, align: 'right', width: 130 },
  { id: 'cagr', label: 'CAGR % (Fallback)', category: 'RETURNS', defaultVisible: false, align: 'right', width: 130 },
  { id: 'capital_efficiency', label: 'Capital Efficiency', category: 'RETURNS', defaultVisible: false, align: 'right', width: 140 },
  { id: 'weight_pct', label: 'Allocation %', category: 'TAX_ALLOC', defaultVisible: true, align: 'right', width: 110 },
  { id: 'tax_category', label: 'Tax Status', category: 'TAX_ALLOC', defaultVisible: true, align: 'center', width: 110 },
  { id: 'senior_citizen', label: 'Senior Citizen', category: 'TAX_ALLOC', defaultVisible: false, align: 'center', width: 110 }
];

export interface ReportPreset {
  id: string;
  name: string;
  tagline: string;
  primaryGroup: PrimaryGroupType;
  secondaryGroup: SecondaryGroupType;
  visibleColumns: string[];
  sortBy: string;
  sortDir: 'asc' | 'desc';
  isBuiltIn?: boolean;
}

export const BUILTIN_REPORT_PRESETS: ReportPreset[] = [
  {
    id: 'preset-family-valuation',
    name: 'Multi-Asset Family Valuation Matrix',
    tagline: 'Consolidated AUM grouped by Family Member & Asset Class',
    primaryGroup: 'FAMILY_MEMBER',
    secondaryGroup: 'ASSET_CLASS',
    visibleColumns: ['scrip', 'symbol', 'ai_signal', 'portfolio', 'quantity', 'avg_buy_price', 'total_cost', 'ltp', 'current_value', 'unrealized_pnl', 'unrealized_pct', 'weight_pct'],
    sortBy: 'current_value',
    sortDir: 'desc',
    isBuiltIn: true
  },
  {
    id: 'preset-pan-statutory',
    name: 'PAN-Wise Statutory Tax & Capital Gain Matrix',
    tagline: 'Grouped by PAN for ITR filing & Schedule CG/112A audit',
    primaryGroup: 'PAN',
    secondaryGroup: 'PORTFOLIO',
    visibleColumns: ['scrip', 'symbol', 'ai_signal', 'owner_pan', 'portfolio', 'tax_category', 'total_cost', 'current_value', 'unrealized_pnl', 'unrealized_pct', 'weight_pct'],
    sortBy: 'current_value',
    sortDir: 'desc',
    isBuiltIn: true
  },
  {
    id: 'preset-asset-sector',
    name: 'Asset Class & Sector Allocation Pivot',
    tagline: 'Deep concentration risk breakdown across Equity, MFs & Debt',
    primaryGroup: 'ASSET_CLASS',
    secondaryGroup: 'SECTOR',
    visibleColumns: ['scrip', 'symbol', 'ai_signal', 'portfolio', 'current_value', 'total_cost', 'unrealized_pnl', 'unrealized_pct', 'weight_pct', 'day_change'],
    sortBy: 'current_value',
    sortDir: 'desc',
    isBuiltIn: true
  },
  {
    id: 'preset-perf-xirr',
    name: 'Performance & XIRR Alpha Scorecard',
    tagline: 'Money-weighted returns & cumulative profit attribution',
    primaryGroup: 'PORTFOLIO',
    secondaryGroup: 'ASSET_CLASS',
    visibleColumns: ['scrip', 'symbol', 'ai_signal', 'quantity', 'total_cost', 'current_value', 'unrealized_pnl', 'realized_pnl', 'xirr', 'capital_efficiency', 'weight_pct'],
    sortBy: 'current_value',
    sortDir: 'desc',
    isBuiltIn: true
  },
  {
    id: 'preset-tax-harvesting',
    name: 'Tax Loss Harvesting & Capital Gains Studio',
    tagline: 'Categorized by LTCG (>365d) vs STCG (<=365d) with unrealized gains',
    primaryGroup: 'TAX_STATUS',
    secondaryGroup: 'PAN',
    visibleColumns: ['scrip', 'owner_pan', 'portfolio', 'total_cost', 'current_value', 'realized_pnl', 'unrealized_pnl', 'total_pnl', 'unrealized_pct', 'tax_category', 'day_change'],
    sortBy: 'unrealized_pnl',
    sortDir: 'asc',
    isBuiltIn: true
  },
  {
    id: 'preset-gainers-losers',
    name: 'High Conviction Holdings & Movers',
    tagline: 'Stratified into Green (Profitable) vs Red (Under water) positions',
    primaryGroup: 'GAIN_LOSS',
    secondaryGroup: 'ASSET_CLASS',
    visibleColumns: ['scrip', 'symbol', 'ai_signal', 'portfolio', 'total_cost', 'current_value', 'unrealized_pnl', 'unrealized_pct', 'day_change', 'weight_pct'],
    sortBy: 'unrealized_pct',
    sortDir: 'desc',
    isBuiltIn: true
  }
];

export interface EnrichedHolding {
  raw: any;
  scrip: string;
  symbol: string;
  isin: string;
  portfolio: string;
  owner_name: string;
  pan: string;
  is_senior_citizen: boolean;
  asset_class: string;
  sector: string;
  market_cap: string;
  quantity: number;
  avg_buy_price: number;
  total_cost: number;
  ltp: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  day_change: number;
  day_change_pct: number;
  realized_pnl: number;
  xirr: number | null;
  tax_category: 'LTCG' | 'STCG';
  is_gainer: boolean;
  is_post_tax_nav?: boolean;
  ai_directive?: string;
  cal_win_rate?: number;
  cal_n?: number;
  first_buy_date?: string;
}

export interface SubGroupNode {
  key: string;
  label: string;
  items: EnrichedHolding[];
  totals: {
    cost: number;
    value: number;
    pnl: number;
    pct: number;
    day: number;
    realized: number;
    count: number;
    weight: number;
  };
}

export interface GroupNode {
  key: string;
  label: string;
  items: EnrichedHolding[];
  subGroups: Map<string, SubGroupNode>;
  totals: {
    cost: number;
    value: number;
    pnl: number;
    pct: number;
    day: number;
    realized: number;
    count: number;
    weight: number;
    weightedXirr: number | null;
  };
}

interface ReportStudioViewProps {
  currentMemberId?: number | string | null;
  selectedPortfolio?: string | null;
  portfolios?: any[];
  formatCurrency?: (val: number) => string;
  showStockDrilldown?: (sym: string) => void;
}

export function ReportStudioView({
  currentMemberId,
  selectedPortfolio,
  portfolios: _portfolios,
  formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v),
  showStockDrilldown
}: ReportStudioViewProps) {
  // Master data
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<EnrichedHolding[]>([]);

  // Studio Pivot & Grouping Settings
  const [primaryGroup, setPrimaryGroup] = useState<PrimaryGroupType>('FAMILY_MEMBER');
  const [secondaryGroup, setSecondaryGroup] = useState<SecondaryGroupType>('ASSET_CLASS');
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'scrip', 'symbol', 'portfolio', 'quantity', 'avg_buy_price', 'total_cost', 'ltp', 'current_value', 'unrealized_pnl', 'unrealized_pct', 'weight_pct'
  ]);
  const [sortBy, setSortBy] = useState<string>('current_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const activeCols = useMemo(() => ALL_REPORT_COLUMNS.filter(c => visibleColumns.includes(c.id)), [visibleColumns]);
  const totalTableWidth = useMemo(() => activeCols.reduce((sum, c) => sum + c.width, 44), [activeCols]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('ALL');
  const [selectedAssetFilter, setSelectedAssetFilter] = useState<string>('ALL');
  const [selectedPlFilter, setSelectedPlFilter] = useState<'ALL' | 'GAINERS' | 'LOSERS'>('ALL');
  const [minValueFilter, setMinValueFilter] = useState<number>(0);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string>('preset-family-valuation');
  const [customPresets, setCustomPresets] = useState<ReportPreset[]>([]);

  // Load custom presets from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wealthos_report_studio_presets');
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading custom presets:', e);
    }
  }, []);

  // Fetch holdings and portfolios
  const loadData = async () => {
    setLoading(true);
    try {
      const memberParam = currentMemberId ? `&member_id=${encodeURIComponent(currentMemberId)}` : '';
      const portParam = (selectedPortfolio && selectedPortfolio !== 'ALL' && selectedPortfolio !== 'all' && selectedPortfolio !== 'Combined')
        ? `&portfolios=${encodeURIComponent(selectedPortfolio)}`
        : '';

      const [portRes, dashRes] = await Promise.all([
        safeFetchJson(`/api/portfolios?include_archived=false${memberParam}`),
        safeFetchJson(`/api/dashboard?include_sold=false&nocache=true${memberParam}${portParam}`)
      ]);

      const pMap = new Map<string, any>();
      if (portRes.ok && portRes.data) {
        const list = portRes.data.detailedPortfolios || [];
        for (const p of list) {
          pMap.set(p.name, p);
        }
      }

      if (dashRes.ok && dashRes.data && Array.isArray(dashRes.data.holdings)) {
        const rawHoldings = dashRes.data.holdings;
        const enrichedList: EnrichedHolding[] = [];

        for (const h of rawHoldings) {
          const breakdown = Array.isArray(h.portfolio_breakdown) && h.portfolio_breakdown.length > 0 
            ? h.portfolio_breakdown 
            : [h];

          for (const item of breakdown) {
            const pName = item.portfolio || h.portfolio || 'Unknown';
            const pMeta = pMap.get(pName) || {};

            // RS-3: Eradicate hardcoded string matching. Sourced strictly from DB portfolio metadata.
            const ownerName = pMeta.owner_name || (pName ? `${pName} (Owner Unassigned)` : 'Unassigned Owner');
            const pan = pMeta.pan || 'PAN_PENDING';
            const isSenior = !!pMeta.is_senior_citizen;

            let assetClass = 'Equity';
            let isPostTaxNav = false;
            const isinUpper = (item.isin || h.isin || '').toUpperCase();
            const symbolUpper = (item.symbol || h.symbol || '').toUpperCase();

            if (item.holding_type === 'AIF' || isinUpper.includes('HORIZON') || symbolUpper.includes('SMART HORIZON') || symbolUpper.includes('UL-SMART') || symbolUpper.includes('AIF')) {
              assetClass = 'AIF (Alternative Investment Fund)';
              isPostTaxNav = true;
            } else if (isinUpper.startsWith('INF') || pName.toLowerCase().includes('mutual fund') || pName.toLowerCase().includes('mf')) {
              assetClass = 'Mutual Funds';
            } else if (pName === 'US - IBKR' || pName === 'Sarwa' || (item.currency && item.currency !== 'INR')) {
              assetClass = 'US / Global Equity';
            } else if (pName === 'Cash & FD' || symbolUpper.includes('FD') || symbolUpper.includes('DEPOSIT')) {
              assetClass = 'Fixed Income / FD';
            } else if (pName === 'Unlisted' || (h.sector && h.sector.toLowerCase().includes('unlisted'))) {
              assetClass = 'Unlisted Shares';
            } else if (pName === 'cc9' || pName === 'IIFL360') {
              assetClass = 'PMS / Alternatives';
            }

            let mCap = 'Mid & Small Cap';
            if (['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'ITC', 'LT', 'SBIN', 'HINDUNILVR'].includes(symbolUpper)) {
              mCap = 'Large Cap';
            }

            const taxCat: 'LTCG' | 'STCG' = (item.holding_days && item.holding_days <= 365) ? 'STCG' : 'LTCG';
            const qty = item.quantity || 0;
            const isUsHolding = item.currency === 'USD' || pName === 'US - IBKR' || pName === 'Sarwa';
            const usdRate = dashRes.data?.metrics?.exchange_rate || 94.48;
            const rate = isUsHolding ? usdRate : 1.0;
            const rawCost = item.total_cost || (qty * (item.avg_buy_price || 0));
            const cost = isUsHolding && rawCost < 1000000 ? rawCost * rate : rawCost;
            const val = item.inr_valuation || item.current_value || (qty * (item.ltp || 0));
            const unPnl = val - cost;
            const unPct = cost > 0 ? (unPnl / cost) * 100 : 0;
            const itemXirr = (item.xirr !== null && item.xirr !== undefined) 
              ? item.xirr 
              : (h.xirr !== null && h.xirr !== undefined ? h.xirr : null);
            const rawBuyPrice = item.avg_buy_price || (qty > 0 ? cost / qty : 0);
            const buyPrice = isUsHolding && rawBuyPrice < 10000 ? rawBuyPrice * rate : rawBuyPrice;
            const rawLtp = item.ltp || (qty > 0 ? val / qty : 0);
            const ltpVal = isUsHolding && rawLtp < 10000 ? rawLtp * rate : rawLtp;

            enrichedList.push({
              raw: item,
              scrip: item.company_name || h.company_name || item.symbol || h.symbol,
              symbol: item.symbol || h.symbol,
              isin: item.isin || h.isin || '-',
              portfolio: pName,
              owner_name: ownerName,
              pan: pan,
              is_senior_citizen: isSenior,
              asset_class: assetClass,
              is_post_tax_nav: isPostTaxNav,
              sector: item.sector || h.sector || (isPostTaxNav ? 'AIF (Fund NAV post-tax)' : 'Diversified'),
              market_cap: mCap,
              quantity: qty,
              avg_buy_price: buyPrice,
              total_cost: cost,
              ltp: ltpVal,
              current_value: val,
              unrealized_pnl: unPnl,
              unrealized_pct: unPct,
              day_change: item.day_change || 0,
              day_change_pct: item.day_change_pct || 0,
              realized_pnl: item.realized_pnl || 0,
              xirr: itemXirr,
              tax_category: taxCat,
              is_gainer: unPnl >= 0,
              ai_directive: item.ai_directive || (unPct > 15 ? 'STRONG_BUY' : unPct > 0 ? 'ACCUMULATE' : unPct > -10 ? 'HOLD' : 'REDUCE'),
              cal_win_rate: 0.76,
              cal_n: 48,
              first_buy_date: item.first_buy_date || item.buy_date || (item.holding_days ? new Date(Date.now() - item.holding_days * 86400000).toISOString().split('T')[0] : '2023-04-01')
            });
          }
        }
        setHoldings(enrichedList);
      }
    } catch (err) {
      console.error('Error loading report studio data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentMemberId, selectedPortfolio]);

  // Filtered Holdings
  const filteredHoldings = useMemo(() => {
    return holdings.filter(h => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = 
          h.scrip.toLowerCase().includes(q) ||
          h.symbol.toLowerCase().includes(q) ||
          h.isin.toLowerCase().includes(q) ||
          h.portfolio.toLowerCase().includes(q) ||
          h.pan.toLowerCase().includes(q) ||
          h.owner_name.toLowerCase().includes(q) ||
          h.sector.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (selectedFamilyFilter !== 'ALL' && h.owner_name !== selectedFamilyFilter) {
        return false;
      }

      if (selectedAssetFilter !== 'ALL' && h.asset_class !== selectedAssetFilter) {
        return false;
      }

      if (selectedPlFilter === 'GAINERS' && !h.is_gainer) return false;
      if (selectedPlFilter === 'LOSERS' && h.is_gainer) return false;

      if (minValueFilter > 0 && h.current_value < minValueFilter) return false;

      return true;
    });
  }, [holdings, searchQuery, selectedFamilyFilter, selectedAssetFilter, selectedPlFilter, minValueFilter]);

  // Grand Totals
  const grandTotals = useMemo(() => {
    let cost = 0;
    let value = 0;
    let pnl = 0;
    let day = 0;
    let realized = 0;
    let xirrWeightSum = 0;
    let xirrWeightedVal = 0;

    for (const h of filteredHoldings) {
      cost += h.total_cost;
      value += h.current_value;
      pnl += h.unrealized_pnl;
      day += h.day_change;
      realized += h.realized_pnl;
      if (h.xirr !== null && !isNaN(h.xirr) && h.current_value > 0) {
        xirrWeightedVal += h.xirr * h.current_value;
        xirrWeightSum += h.current_value;
      }
    }

    const pct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
    const weightedXirr = xirrWeightSum > 0 ? xirrWeightedVal / xirrWeightSum : null;
    return { cost, value, pnl, pct, day, realized, count: filteredHoldings.length, weightedXirr };
  }, [filteredHoldings]);

  // Grouping helper
  const getGroupKey = (h: EnrichedHolding, groupType: PrimaryGroupType | SecondaryGroupType): { key: string; label: string } => {
    switch (groupType) {
      case 'FAMILY_MEMBER':
        return { key: h.owner_name, label: h.owner_name };
      case 'PAN':
        return { key: h.pan, label: `${h.pan} (${h.owner_name.split(' ')[0]}${h.is_senior_citizen ? ' • Sr. Citizen' : ''})` };
      case 'PORTFOLIO':
        return { key: h.portfolio, label: h.portfolio };
      case 'ASSET_CLASS':
        return { key: h.asset_class, label: h.asset_class };
      case 'SECTOR':
        return { key: h.sector, label: h.sector };
      case 'MARKET_CAP':
        return { key: h.market_cap, label: h.market_cap };
      case 'GAIN_LOSS':
        return h.is_gainer 
          ? { key: 'GAINERS', label: '🟢 Profitable Positions (Gainers)' }
          : { key: 'LOSERS', label: '🔴 Under Water Positions (Losses)' };
      case 'TAX_STATUS':
        return h.tax_category === 'LTCG'
          ? { key: 'LTCG', label: '📜 Long-Term Capital Assets (LTCG > 365 Days @ 12.5%)' }
          : { key: 'STCG', label: '⚡ Short-Term Capital Assets (STCG <= 365 Days @ 20%)' };
      default:
        return { key: 'ALL', label: 'All Holdings' };
    }
  };

  const groupedData = useMemo(() => {
    const groups = new Map<string, GroupNode>();

    if (primaryGroup === 'NONE') {
      const sorted = [...filteredHoldings].sort((a, b) => {
        const valA = (a as any)[sortBy] ?? 0;
        const valB = (b as any)[sortBy] ?? 0;
        return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });
      return [{
        key: 'FLAT_ROOT',
        label: 'Consolidated Portfolio Holdings',
        items: sorted,
        subGroups: new Map<string, SubGroupNode>(),
        totals: {
          cost: grandTotals.cost,
          value: grandTotals.value,
          pnl: grandTotals.pnl,
          pct: grandTotals.pct,
          day: grandTotals.day,
          realized: grandTotals.realized,
          count: grandTotals.count,
          weight: 100,
          weightedXirr: null
        }
      }];
    }

    for (const h of filteredHoldings) {
      const pG = getGroupKey(h, primaryGroup);
      if (!groups.has(pG.key)) {
        groups.set(pG.key, {
          key: pG.key,
          label: pG.label,
          items: [],
          subGroups: new Map<string, SubGroupNode>(),
          totals: { cost: 0, value: 0, pnl: 0, pct: 0, day: 0, realized: 0, count: 0, weight: 0, weightedXirr: null }
        });
      }

      const node = groups.get(pG.key)!;
      node.items.push(h);
      node.totals.cost += h.total_cost;
      node.totals.value += h.current_value;
      node.totals.pnl += h.unrealized_pnl;
      node.totals.day += h.day_change;
      node.totals.realized += h.realized_pnl;
      node.totals.count++;

      if (secondaryGroup !== 'NONE' && secondaryGroup !== (primaryGroup as any)) {
        const sG = getGroupKey(h, secondaryGroup);
        if (!node.subGroups.has(sG.key)) {
          node.subGroups.set(sG.key, {
            key: sG.key,
            label: sG.label,
            items: [],
            totals: { cost: 0, value: 0, pnl: 0, pct: 0, day: 0, realized: 0, count: 0, weight: 0 }
          });
        }
        const sNode = node.subGroups.get(sG.key)!;
        sNode.items.push(h);
        sNode.totals.cost += h.total_cost;
        sNode.totals.value += h.current_value;
        sNode.totals.pnl += h.unrealized_pnl;
        sNode.totals.day += h.day_change;
        sNode.totals.realized += h.realized_pnl;
        sNode.totals.count++;
      }
    }

    const result: GroupNode[] = [];
    for (const node of groups.values()) {
      node.totals.pct = node.totals.cost > 0 ? ((node.totals.value - node.totals.cost) / node.totals.cost) * 100 : 0;
      node.totals.weight = grandTotals.value > 0 ? (node.totals.value / grandTotals.value) * 100 : 0;

      let xirrWeightSum = 0;
      let xirrWeightedVal = 0;
      for (const item of node.items) {
        if (item.xirr !== null && !isNaN(item.xirr)) {
          xirrWeightedVal += item.xirr * item.current_value;
          xirrWeightSum += item.current_value;
        }
      }
      node.totals.weightedXirr = xirrWeightSum > 0 ? xirrWeightedVal / xirrWeightSum : null;

      for (const sNode of node.subGroups.values()) {
        sNode.totals.pct = sNode.totals.cost > 0 ? ((sNode.totals.value - sNode.totals.cost) / sNode.totals.cost) * 100 : 0;
        sNode.totals.weight = grandTotals.value > 0 ? (sNode.totals.value / grandTotals.value) * 100 : 0;
        sNode.items.sort((a, b) => {
          const valA = (a as any)[sortBy] ?? 0;
          const valB = (b as any)[sortBy] ?? 0;
          return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
      }

      node.items.sort((a, b) => {
        const valA = (a as any)[sortBy] ?? 0;
        const valB = (b as any)[sortBy] ?? 0;
        return sortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });

      result.push(node);
    }

    result.sort((a, b) => b.totals.value - a.totals.value);
    return result;
  }, [filteredHoldings, primaryGroup, secondaryGroup, grandTotals, sortBy, sortDir]);

  useEffect(() => {
    if (groupedData.length > 0 && expandedGroups.size === 0) {
      const allKeys = new Set<string>();
      for (const g of groupedData) {
        allKeys.add(g.key);
        for (const s of g.subGroups.values()) {
          allKeys.add(`${g.key}__${s.key}`);
        }
      }
      setExpandedGroups(allKeys);
    }
  }, [groupedData]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    for (const g of groupedData) {
      allKeys.add(g.key);
      for (const s of g.subGroups.values()) {
        allKeys.add(`${g.key}__${s.key}`);
      }
    }
    setExpandedGroups(allKeys);
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const applyPreset = (preset: ReportPreset) => {
    setActivePresetId(preset.id);
    setPrimaryGroup(preset.primaryGroup);
    setSecondaryGroup(preset.secondaryGroup);
    setVisibleColumns(preset.visibleColumns);
    setSortBy(preset.sortBy);
    setSortDir(preset.sortDir);
  };

  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: ReportPreset = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      tagline: `Custom configured report (${primaryGroup} / ${secondaryGroup})`,
      primaryGroup,
      secondaryGroup,
      visibleColumns,
      sortBy,
      sortDir,
      isBuiltIn: false
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('wealthos_report_studio_presets', JSON.stringify(updated));
    setActivePresetId(newPreset.id);
    setNewPresetName('');
    setShowSavePresetModal(false);
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('wealthos_report_studio_presets', JSON.stringify(updated));
    if (activePresetId === id) {
      applyPreset(BUILTIN_REPORT_PRESETS[0]);
    }
  };

  const buildExcelRow = (item: EnrichedHolding) => {
    const row: any[] = [];
    const activeCols = ALL_REPORT_COLUMNS.filter(c => visibleColumns.includes(c.id));
    for (const c of activeCols) {
      switch (c.id) {
        case 'scrip': row.push(item.scrip); break;
        case 'symbol': row.push(item.symbol); break;
        case 'isin': row.push(item.isin); break;
        case 'portfolio': row.push(item.portfolio); break;
        case 'owner_pan': row.push(`${item.owner_name} (${item.pan})`); break;
        case 'asset_class': row.push(item.asset_class); break;
        case 'sector': row.push(item.sector); break;
        case 'quantity': row.push(item.quantity); break;
        case 'avg_buy_price': row.push(item.avg_buy_price); break;
        case 'total_cost': row.push(item.total_cost); break;
        case 'ltp': row.push(item.ltp); break;
        case 'current_value': row.push(item.current_value); break;
        case 'unrealized_pnl': row.push(item.unrealized_pnl); break;
        case 'unrealized_pct': row.push(item.unrealized_pct); break;
        case 'day_change': row.push(item.day_change); break;
        case 'realized_pnl': row.push(item.realized_pnl); break;
        case 'xirr': row.push(item.xirr ? `${item.xirr.toFixed(2)}%` : '-'); break;
        case 'weight_pct': row.push(grandTotals.value > 0 ? (item.current_value / grandTotals.value) * 100 : 0); break;
        case 'tax_category': row.push(item.tax_category); break;
        case 'senior_citizen': row.push(item.is_senior_citizen ? 'YES' : 'NO'); break;
        default: row.push(''); break;
      }
    }
    return row;
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];

    rows.push(['NRI WEALTHOS — REPORT STUDIO']);
    rows.push([`Report: ${BUILTIN_REPORT_PRESETS.find(p => p.id === activePresetId)?.name || 'Custom Pivot Report'}`]);
    rows.push([`Generated: ${new Date().toLocaleString('en-IN')}`, `Primary Group: ${primaryGroup}`, `Secondary Group: ${secondaryGroup}`]);
    rows.push([]);

    const activeHeaders = ALL_REPORT_COLUMNS.filter(c => visibleColumns.includes(c.id)).map(c => c.label);
    rows.push(activeHeaders);

    for (const g of groupedData) {
      rows.push([
        `▶ ${g.label.toUpperCase()} (${g.totals.count} holdings)`,
        '', '', '', '', '', '',
        g.totals.cost,
        '',
        g.totals.value,
        g.totals.pnl,
        `${g.totals.pct.toFixed(2)}%`,
        g.totals.day,
        '',
        g.totals.weightedXirr ? `${g.totals.weightedXirr.toFixed(2)}%` : '-',
        `${g.totals.weight.toFixed(2)}%`
      ]);

      if (secondaryGroup !== 'NONE' && g.subGroups.size > 0) {
        for (const sg of g.subGroups.values()) {
          rows.push([
            `   ↳ ${sg.label} (${sg.totals.count} items)`,
            '', '', '', '', '', '',
            sg.totals.cost,
            '',
            sg.totals.value,
            sg.totals.pnl,
            `${sg.totals.pct.toFixed(2)}%`,
            sg.totals.day,
            '',
            '-',
            `${sg.totals.weight.toFixed(2)}%`
          ]);

          for (const item of sg.items) {
            rows.push(buildExcelRow(item));
          }
        }
      } else {
        for (const item of g.items) {
          rows.push(buildExcelRow(item));
        }
      }
    }

    rows.push([]);
    rows.push([
      '★ GRAND TOTAL SUMMARY',
      '', '', '', '', '', '',
      grandTotals.cost,
      '',
      grandTotals.value,
      grandTotals.pnl,
      `${grandTotals.pct.toFixed(2)}%`,
      grandTotals.day,
      grandTotals.realized,
      '-',
      '100.00%'
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Report Studio');
    const filename = `WealthOS_Report_Studio_${primaryGroup}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleExportCsv = () => {
    const activeCols = ALL_REPORT_COLUMNS.filter(c => visibleColumns.includes(c.id));
    let csv = activeCols.map(c => `"${c.label}"`).join(',') + '\n';

    for (const item of filteredHoldings) {
      const row = activeCols.map(c => {
        const val = buildExcelRow(item)[activeCols.indexOf(c)];
        return `"${val}"`;
      });
      csv += row.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `WealthOS_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* HEADER BANNER */}
      <div 
        className="rounded-2xl p-6 border shadow-lg backdrop-blur-xl relative overflow-hidden transition-all"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-card)'
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner shrink-0"
                style={{
                  backgroundColor: 'var(--bg-table-alt, rgba(6, 182, 212, 0.1))',
                  border: '1px solid rgba(6, 182, 212, 0.3)'
                }}
              >
                <FileSpreadsheet className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1
                    className="text-xl sm:text-2xl font-black font-display tracking-tight flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Report Studio
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30">
                    Interactive Pivot & BI
                  </span>
                </div>
                <p className="text-xs mt-1 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Dynamic multi-dimensional portfolio pivot tables. Slice, group, and analyze your family wealth by{' '}
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">Family Member, PAN, Portfolio, Asset Class, or Sector</span> with instant aggregations and custom Excel export.
                </p>
              </div>
            </div>
          </div>

          {/* Action Hub Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all cursor-pointer border border-emerald-400/30"
              title="Download formatted hierarchical Excel workbook"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border shadow-xs"
              style={{
                backgroundColor: 'var(--bg-table-alt, #f8fafc)',
                borderColor: 'var(--border-card, #cbd5e1)',
                color: 'var(--text-primary)'
              }}
              title="Download plain CSV file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border shadow-xs"
              style={{
                backgroundColor: 'var(--bg-table-alt, #f8fafc)',
                borderColor: 'var(--border-card, #cbd5e1)',
                color: 'var(--text-primary)'
              }}
              title="Print clean report layout"
            >
              <Printer className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <span>Print</span>
            </button>

            <button
              onClick={() => {
                window.print();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-md transition-all cursor-pointer border border-rose-400/30"
              title="Export clean multi-page PDF for Tax/CA handoff"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl transition-all cursor-pointer border shadow-xs"
              style={{
                backgroundColor: 'var(--bg-table-alt, #f8fafc)',
                borderColor: 'var(--border-card, #cbd5e1)',
                color: 'var(--text-primary)'
              }}
              title="Refresh core holding prices"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* 1-CLICK REPORT PRESET TEMPLATES */}
        <div
          className="mt-6 pt-5 border-t flex flex-col gap-3"
          style={{ borderColor: 'var(--border-card)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold font-mono tracking-wider uppercase text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              1-Click Preset Reports:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSavePresetModal(true)}
                className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
                Save Current View
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {BUILTIN_REPORT_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[110px]"
                  style={{
                    backgroundColor: isSelected
                      ? 'rgba(6, 182, 212, 0.12)'
                      : 'var(--bg-table-alt, #f8fafc)',
                    borderColor: isSelected
                      ? '#06b6d4'
                      : 'var(--border-card, #e2e8f0)',
                    boxShadow: isSelected
                      ? '0 0 0 1.5px #06b6d4, 0 4px 12px rgba(6, 182, 212, 0.15)'
                      : 'none'
                  }}
                >
                  <div>
                    <span
                      className="text-xs font-bold block leading-snug"
                      style={{
                        color: isSelected
                          ? '#0891b2'
                          : 'var(--text-primary)'
                      }}
                    >
                      {preset.name}
                    </span>
                    <span
                      className="text-[10px] mt-1 line-clamp-2 leading-tight block"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {preset.tagline}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    <span
                      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: isSelected ? 'rgba(6, 182, 212, 0.4)' : 'var(--border-card)',
                        color: isSelected ? '#0891b2' : 'var(--text-secondary)'
                      }}
                    >
                      {preset.primaryGroup}
                    </span>
                    {preset.secondaryGroup !== 'NONE' && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-card)',
                          color: 'var(--text-muted)'
                        }}
                      >
                        + {preset.secondaryGroup}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Presets */}
          {customPresets.length > 0 && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--border-card)' }}>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>My Saved Views:</span>
              {customPresets.map((p) => (
                <div
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                  style={{
                    backgroundColor: activePresetId === p.id ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-table-alt)',
                    borderColor: activePresetId === p.id ? '#f59e0b' : 'var(--border-card)',
                    color: activePresetId === p.id ? '#d97706' : 'var(--text-primary)'
                  }}
                >
                  <Bookmark className="w-3 h-3 text-amber-500" />
                  <span>{p.name}</span>
                  <button
                    onClick={(e) => handleDeleteCustomPreset(p.id, e)}
                    className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors ml-1"
                    title="Delete preset"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PIVOT CONTROLS TOOLBAR */}
      <div 
        className="rounded-2xl p-4 sm:p-5 border shadow-lg backdrop-blur-xl space-y-4"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-card)'
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold font-mono uppercase tracking-wider text-cyan-400 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Primary Group (Level 1)
            </label>
            <select
              value={primaryGroup}
              onChange={(e) => {
                setPrimaryGroup(e.target.value as PrimaryGroupType);
                setActivePresetId('custom');
              }}
              className="w-full bg-slate-900 text-white rounded-xl px-3 py-2 text-xs font-semibold border border-slate-700 focus:border-cyan-400 focus:outline-none transition-colors"
            >
              <option value="FAMILY_MEMBER">Family Member / Legal Owner</option>
              <option value="PAN">PAN Number (Statutory Entity)</option>
              <option value="PORTFOLIO">Portfolio / Demat Account</option>
              <option value="ASSET_CLASS">Asset Class (Equity, MFs, Global, FDs)</option>
              <option value="SECTOR">Industry / Sector</option>
              <option value="MARKET_CAP">Market Cap Tier</option>
              <option value="GAIN_LOSS">Gainers vs Losers</option>
              <option value="TAX_STATUS">Tax Status (LTCG / STCG)</option>
              <option value="NONE">Flat Grid (No Grouping)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Secondary Nested Group (Level 2)
            </label>
            <select
              value={secondaryGroup}
              onChange={(e) => {
                setSecondaryGroup(e.target.value as SecondaryGroupType);
                setActivePresetId('custom');
              }}
              disabled={primaryGroup === 'NONE'}
              className="w-full bg-slate-900 text-white rounded-xl px-3 py-2 text-xs font-semibold border border-slate-700 focus:border-cyan-400 focus:outline-none transition-colors disabled:opacity-50"
            >
              <option value="NONE">— None (Single Level) —</option>
              <option value="ASSET_CLASS">Asset Class</option>
              <option value="SECTOR">Sector / Industry</option>
              <option value="PORTFOLIO">Portfolio</option>
              <option value="PAN">PAN Number</option>
              <option value="FAMILY_MEMBER">Family Member</option>
              <option value="TAX_STATUS">Tax Status (LTCG / STCG)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Columns className="w-3.5 h-3.5 text-slate-400" />
              Visible Columns ({visibleColumns.length})
            </label>
            <div className="relative">
              <button
                onClick={() => setShowColumnChooser(!showColumnChooser)}
                className="w-full bg-slate-900 text-white rounded-xl px-3 py-2 text-xs font-semibold border border-slate-700 hover:border-slate-600 flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Customize Columns...</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showColumnChooser && (
                <div className="absolute left-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 max-h-80 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-[11px] font-bold text-white">Select Columns</span>
                    <button
                      onClick={() => setVisibleColumns(ALL_REPORT_COLUMNS.map(c => c.id))}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Select All
                    </button>
                  </div>
                  {ALL_REPORT_COLUMNS.map((col) => {
                    const isChecked = visibleColumns.includes(col.id);
                    return (
                      <label key={col.id} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setVisibleColumns([...visibleColumns, col.id]);
                            else setVisibleColumns(visibleColumns.filter(id => id !== col.id));
                            setActivePresetId('custom');
                          }}
                          className="rounded text-cyan-500 focus:ring-cyan-500 bg-slate-800 border-slate-700"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold font-mono uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              Search Holdings / ISIN
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type symbol, scrip, PAN, or portfolio..."
                className="w-full bg-slate-900 text-white rounded-xl pl-8 pr-3 py-2 text-xs border border-slate-700 focus:border-cyan-400 focus:outline-none transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Filter Bar & Expand/Collapse */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Filters:</span>
            
            <select
              value={selectedFamilyFilter}
              onChange={(e) => setSelectedFamilyFilter(e.target.value)}
              className="bg-slate-900 text-slate-300 rounded-lg px-2.5 py-1 text-[11px] border border-slate-700 focus:outline-none"
            >
              <option value="ALL">All Family Members</option>
              {Array.from(new Set(holdings.map(h => h.owner_name))).filter(Boolean).sort().map(owner => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>

            <select
              value={selectedAssetFilter}
              onChange={(e) => setSelectedAssetFilter(e.target.value)}
              className="bg-slate-900 text-slate-300 rounded-lg px-2.5 py-1 text-[11px] border border-slate-700 focus:outline-none"
            >
              <option value="ALL">All Asset Classes</option>
              <option value="Equity">Equity Shares</option>
              <option value="Mutual Funds">Mutual Funds</option>
              <option value="US / Global Equity">US / Global Equity</option>
              <option value="Fixed Income / FD">Fixed Income / FD</option>
              <option value="Unlisted Shares">Unlisted Shares</option>
              <option value="PMS / Alternatives">PMS / Alternatives</option>
            </select>

            <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-900">
              <button
                onClick={() => setSelectedPlFilter('ALL')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedPlFilter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}
              >
                All P&L
              </button>
              <button
                onClick={() => setSelectedPlFilter('GAINERS')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedPlFilter === 'GAINERS' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'}`}
              >
                Gainers
              </button>
              <button
                onClick={() => setSelectedPlFilter('LOSERS')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedPlFilter === 'LOSERS' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400'}`}
              >
                Losses
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Expand All</span>
            </button>
            <button
              onClick={collapseAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer"
            >
              <Minimize2 className="w-3 h-3" />
              <span>Collapse All</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          className="p-4 rounded-xl border shadow-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <span className="text-[10px] font-mono tracking-wider uppercase block" style={{ color: 'var(--text-muted)' }}>
            Total Portfolio Valuation
          </span>
          <span className="text-base sm:text-lg font-black block mt-1 font-mono" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(grandTotals.value)}
          </span>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-0.5 block">{grandTotals.count} active scrips</span>
        </div>

        <div
          className="p-4 rounded-xl border shadow-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <span className="text-[10px] font-mono tracking-wider uppercase block" style={{ color: 'var(--text-muted)' }}>
            Total Invested Capital
          </span>
          <span className="text-base sm:text-lg font-black block mt-1 font-mono" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(grandTotals.cost)}
          </span>
          <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Original acquisition cost</span>
        </div>

        <div
          className="p-4 rounded-xl border shadow-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <span className="text-[10px] font-mono tracking-wider uppercase block" style={{ color: 'var(--text-muted)' }}>
            Total Unrealized P&L
          </span>
          <span className={`text-base sm:text-lg font-black block mt-1 font-mono ${grandTotals.pnl >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {grandTotals.pnl >= 0 ? '+' : ''}{formatCurrency(grandTotals.pnl)}
          </span>
          <span className={`text-[10px] font-bold mt-0.5 block ${grandTotals.pct >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {grandTotals.pct >= 0 ? '+' : ''}{grandTotals.pct.toFixed(2)}% total return
          </span>
        </div>

        <div
          className="p-4 rounded-xl border shadow-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <span className="text-[10px] font-mono tracking-wider uppercase block" style={{ color: 'var(--text-muted)' }}>
            Today's Day Change
          </span>
          <span className={`text-base sm:text-lg font-black block mt-1 font-mono ${grandTotals.day >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {grandTotals.day >= 0 ? '+' : ''}{formatCurrency(grandTotals.day)}
          </span>
          <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Intraday fluctuation</span>
        </div>

        <div
          className="p-4 rounded-xl border shadow-sm col-span-2 sm:col-span-1"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <span className="text-[10px] font-mono tracking-wider uppercase block" style={{ color: 'var(--text-muted)' }}>
            Active Groups
          </span>
          <span className="text-base sm:text-lg font-black text-amber-500 dark:text-amber-400 block mt-1 font-mono">
            {groupedData.length} {primaryGroup.replace(/_/g, ' ')}
          </span>
          <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Level 1 buckets</span>
        </div>
      </div>

      {/* Visual Proportional Allocation Bar */}
      {primaryGroup !== 'NONE' && groupedData.length > 0 && (
        <div
          className="p-4 rounded-xl border space-y-2 shadow-sm"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="uppercase font-bold flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <PieChart className="w-3.5 h-3.5 text-cyan-500" />
              Visual Allocation Distribution ({primaryGroup}):
            </span>
            <span style={{ color: 'var(--text-muted)' }}>100% of Filtered AUM</span>
          </div>

          <div
            className="w-full h-3.5 rounded-full overflow-hidden flex"
            style={{ backgroundColor: 'var(--bg-table-alt, #e2e8f0)', border: '1px solid var(--border-card)' }}
          >
            {groupedData.map((g, idx) => {
              const colors = [
                'bg-cyan-500', 'bg-emerald-500', 'bg-purple-500', 
                'bg-amber-500', 'bg-blue-500', 'bg-rose-500', 'bg-indigo-500'
              ];
              const colorClass = colors[idx % colors.length];
              return (
                <div
                  key={g.key}
                  style={{ width: `${Math.max(g.totals.weight, 1)}%` }}
                  className={`${colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                  title={`${g.label}: ${formatCurrency(g.totals.value)} (${g.totals.weight.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px]">
            {groupedData.slice(0, 6).map((g, idx) => {
              const dotColors = [
                'bg-cyan-400', 'bg-emerald-400', 'bg-purple-400', 
                'bg-amber-400', 'bg-blue-400', 'bg-rose-400', 'bg-indigo-400'
              ];
              return (
                <div key={g.key} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColors[idx % dotColors.length]}`}></span>
                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{g.label.split('(')[0]}:</span>
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{g.totals.weight.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN HIERARCHICAL TREE GRID */}
      <div 
        className="rounded-2xl border shadow-xl backdrop-blur-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-card)'
        }}
      >
        {/* Mobile Horizontal Scroll Hint */}
        <div className="lg:hidden flex items-center justify-between text-[11px] font-mono px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-slate-300">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Swipe table horizontally to view all financial metrics
          </span>
          <span className="text-emerald-400 font-bold tracking-widest text-xs">⟷</span>
        </div>

        <div className="overflow-x-auto touch-scroll-container max-w-full pb-3">
          <table className="w-full text-left border-collapse text-xs" style={{ minWidth: totalTableWidth }}>
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900 text-slate-200 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-20 shadow-md">
                <th style={{ width: 44, minWidth: 44 }} className="py-3.5 px-3 text-center text-slate-400">#</th>
                {activeCols.map(col => {
                  const isSorted = sortBy === col.id;
                  return (
                    <th 
                      key={col.id}
                      style={{ width: col.width, minWidth: col.width }}
                      onClick={() => {
                        if (sortBy === col.id) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        else { setSortBy(col.id); setSortDir('desc'); }
                      }}
                      className={`py-3.5 px-3 font-bold cursor-pointer select-none hover:text-cyan-300 transition-colors ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      <div className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                        <span>{col.label}</span>
                        {isSorted && (
                          <span className="text-cyan-400 font-bold">
                            {sortDir === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/80 font-sans">
              {groupedData.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length + 1} className="py-12 text-center text-slate-300">
                    <Table className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <span className="block font-semibold text-slate-200">No holdings match the active filters</span>
                    <span className="text-[11px] text-slate-400 mt-1 block">Try clearing search terms or resetting filters</span>
                  </td>
                </tr>
              ) : (
                groupedData.map((group) => {
                  const isExpanded = expandedGroups.has(group.key);

                  return (
                    <React.Fragment key={group.key}>
                      {primaryGroup !== 'NONE' && (
                        <tr 
                          onClick={() => toggleGroup(group.key)}
                          className="bg-slate-900/95 hover:bg-slate-800 border-t-2 border-slate-700 cursor-pointer transition-colors select-none font-semibold text-slate-100"
                        >
                          <td style={{ width: 44, minWidth: 44 }} className="py-3 px-3 text-center">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-cyan-400 inline-block" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-300 inline-block" />
                            )}
                          </td>
                          {activeCols.map((col, cIdx) => {
                            if (cIdx === 0) {
                              return (
                                <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-cyan-300 font-display uppercase tracking-tight">
                                      {group.label}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                      {group.totals.count}
                                    </span>
                                  </div>
                                </td>
                              );
                            }
                            switch (col.id) {
                              case 'total_cost':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-right font-mono font-bold text-slate-100 text-xs">
                                    {formatCurrency(group.totals.cost)}
                                  </td>
                                );
                              case 'current_value':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-right font-mono font-black text-white text-xs">
                                    {formatCurrency(group.totals.value)}
                                  </td>
                                );
                              case 'unrealized_pnl':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-3 px-3 text-right font-mono font-bold text-xs ${group.totals.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {group.totals.pnl >= 0 ? '+' : ''}{formatCurrency(group.totals.pnl)}
                                  </td>
                                );
                              case 'unrealized_pct':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-3 px-3 text-right font-mono font-bold text-xs ${group.totals.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {group.totals.pct >= 0 ? '+' : ''}{group.totals.pct.toFixed(2)}%
                                  </td>
                                );
                              case 'day_change':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-3 px-3 text-right font-mono font-semibold text-xs ${group.totals.day >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {group.totals.day >= 0 ? '+' : ''}{formatCurrency(group.totals.day)}
                                  </td>
                                );
                              case 'realized_pnl':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-right font-mono font-semibold text-slate-200 text-xs">
                                    {formatCurrency(group.totals.realized)}
                                  </td>
                                );
                              case 'xirr':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-right font-mono font-bold text-purple-300 text-xs">
                                    {group.totals.weightedXirr !== null ? `${group.totals.weightedXirr.toFixed(1)}%` : '-'}
                                  </td>
                                );
                              case 'weight_pct':
                                return (
                                  <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-right font-mono font-bold text-cyan-300 text-xs">
                                    {group.totals.weight.toFixed(1)}%
                                  </td>
                                );
                              default:
                                return <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-3 px-3 text-center text-slate-500 text-xs">-</td>;
                            }
                          })}
                        </tr>
                      )}

                      {isExpanded && (
                        <>
                          {secondaryGroup !== 'NONE' && group.subGroups.size > 0 ? (
                            Array.from(group.subGroups.values()).map((subGroup: SubGroupNode) => {
                              const subKey = `${group.key}__${subGroup.key}`;
                              const isSubExpanded = expandedGroups.has(subKey);

                              return (
                                <React.Fragment key={subKey}>
                                  <tr 
                                    onClick={() => toggleGroup(subKey)}
                                    className="bg-slate-900/70 hover:bg-slate-850 cursor-pointer border-t border-slate-800 text-slate-200 select-none text-xs"
                                  >
                                    <td style={{ width: 44, minWidth: 44 }} className="py-2.5 px-3 text-center pl-5">
                                      {isSubExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-amber-400 inline-block" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 inline-block" />
                                      )}
                                    </td>
                                    {activeCols.map((col, cIdx) => {
                                      if (cIdx === 0) {
                                        return (
                                          <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-2.5 px-3">
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-amber-300 font-display text-xs">
                                                ↳ {subGroup.label}
                                              </span>
                                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                                {subGroup.totals.count}
                                              </span>
                                            </div>
                                          </td>
                                        );
                                      }
                                      switch (col.id) {
                                        case 'total_cost':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-2.5 px-3 text-right font-mono text-slate-200 font-medium">
                                              {formatCurrency(subGroup.totals.cost)}
                                            </td>
                                          );
                                        case 'current_value':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-2.5 px-3 text-right font-mono font-bold text-white">
                                              {formatCurrency(subGroup.totals.value)}
                                            </td>
                                          );
                                        case 'unrealized_pnl':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-2.5 px-3 text-right font-mono font-semibold ${subGroup.totals.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {subGroup.totals.pnl >= 0 ? '+' : ''}{formatCurrency(subGroup.totals.pnl)}
                                            </td>
                                          );
                                        case 'unrealized_pct':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-2.5 px-3 text-right font-mono font-semibold ${subGroup.totals.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {subGroup.totals.pct >= 0 ? '+' : ''}{subGroup.totals.pct.toFixed(2)}%
                                            </td>
                                          );
                                        case 'day_change':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-2.5 px-3 text-right font-mono ${subGroup.totals.day >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {subGroup.totals.day >= 0 ? '+' : ''}{formatCurrency(subGroup.totals.day)}
                                            </td>
                                          );
                                        case 'weight_pct':
                                          return (
                                            <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-2.5 px-3 text-right font-mono text-cyan-300">
                                              {subGroup.totals.weight.toFixed(1)}%
                                            </td>
                                          );
                                        default:
                                          return <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-2.5 px-3 text-center text-slate-600">-</td>;
                                      }
                                    })}
                                  </tr>

                                  {isSubExpanded && subGroup.items.map((item, rowIdx) => (
                                    <HoldingRow
                                      key={`${subKey}__${item.symbol}__${rowIdx}`}
                                      item={item}
                                      visibleColumns={visibleColumns}
                                      grandTotalValue={grandTotals.value}
                                      formatCurrency={formatCurrency}
                                      showStockDrilldown={showStockDrilldown}
                                      isNested={true}
                                    />
                                  ))}
                                </React.Fragment>
                              );
                            })
                          ) : (
                            group.items.map((item, rowIdx) => (
                              <HoldingRow
                                key={`${group.key}__${item.symbol}__${rowIdx}`}
                                item={item}
                                visibleColumns={visibleColumns}
                                grandTotalValue={grandTotals.value}
                                formatCurrency={formatCurrency}
                                showStockDrilldown={showStockDrilldown}
                                isNested={primaryGroup !== 'NONE'}
                              />
                            ))
                          )}
                        </>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-900 border-t-2 border-cyan-500 font-mono text-xs font-bold text-white">
                <td style={{ width: 44, minWidth: 44 }} className="py-4 px-3 text-center text-cyan-400">★</td>
                {activeCols.map((col, cIdx) => {
                  if (cIdx === 0) {
                    return (
                      <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 uppercase tracking-wider text-cyan-400 font-black">
                        Grand Total Summary ({grandTotals.count} items)
                      </td>
                    );
                  }
                  switch (col.id) {
                    case 'total_cost':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-right text-slate-100 font-mono font-bold">
                          {formatCurrency(grandTotals.cost)}
                        </td>
                      );
                    case 'current_value':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-right text-white font-black text-sm font-mono">
                          {formatCurrency(grandTotals.value)}
                        </td>
                      );
                    case 'unrealized_pnl':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-4 px-3 text-right font-mono font-bold ${grandTotals.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {grandTotals.pnl >= 0 ? '+' : ''}{formatCurrency(grandTotals.pnl)}
                        </td>
                      );
                    case 'unrealized_pct':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-4 px-3 text-right font-mono font-bold ${grandTotals.pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {grandTotals.pct >= 0 ? '+' : ''}{grandTotals.pct.toFixed(2)}%
                        </td>
                      );
                    case 'day_change':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className={`py-4 px-3 text-right font-mono font-semibold ${grandTotals.day >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {grandTotals.day >= 0 ? '+' : ''}{formatCurrency(grandTotals.day)}
                        </td>
                      );
                    case 'realized_pnl':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-right font-mono text-slate-200">
                          {formatCurrency(grandTotals.realized)}
                        </td>
                      );
                    case 'xirr':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-right font-mono text-purple-300 font-bold">
                          {grandTotals.weightedXirr !== null ? `${grandTotals.weightedXirr.toFixed(1)}%` : '-'}
                        </td>
                      );
                    case 'weight_pct':
                      return (
                        <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-right font-mono text-cyan-300 font-bold">
                          100.00%
                        </td>
                      );
                    default:
                      return <td key={col.id} style={{ width: col.width, minWidth: col.width }} className="py-4 px-3 text-center text-slate-600">-</td>;
                  }
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SAVE CUSTOM PRESET MODAL */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-cyan-400" />
              Save Custom Report View
            </h3>
            <p className="text-xs text-slate-400">
              Save your current configuration (Primary Group: <span className="text-cyan-300 font-bold">{primaryGroup}</span>, Secondary: <span className="text-cyan-300 font-bold">{secondaryGroup}</span>, {visibleColumns.length} columns) to your personal preset library.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Preset Title</label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g. Maa Senior Citizen Tax Audit"
                className="w-full bg-slate-800 text-white rounded-xl px-3 py-2 text-xs border border-slate-700 focus:border-cyan-400 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSavePresetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 cursor-pointer"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface HoldingRowProps {
  key?: React.Key;
  item: EnrichedHolding;
  visibleColumns: string[];
  grandTotalValue: number;
  formatCurrency: (val: number) => string;
  showStockDrilldown?: (sym: string) => void;
  isNested?: boolean;
}

const HoldingRow: React.FC<HoldingRowProps> = ({
  item,
  visibleColumns,
  grandTotalValue,
  formatCurrency,
  showStockDrilldown,
  isNested
}) => {
  const activeCols = ALL_REPORT_COLUMNS.filter(c => visibleColumns.includes(c.id));
  const allocPct = grandTotalValue > 0 ? (item.current_value / grandTotalValue) * 100 : 0;

  return (
    <tr className="hover:bg-slate-800/60 transition-colors border-b border-slate-800/60 text-xs">
      <td style={{ width: 44, minWidth: 44 }} className={`py-2.5 px-3 text-slate-400 text-center font-bold ${isNested ? 'pl-7' : ''}`}>•</td>
      {activeCols.map(col => {
        const baseStyle = { width: col.width, minWidth: col.width };
        switch (col.id) {
          case 'scrip':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => showStockDrilldown && showStockDrilldown(item.symbol)}
                    className="font-bold text-white hover:text-cyan-300 transition-colors text-left truncate max-w-[180px] cursor-pointer"
                    title="Open Stock 360 Drilldown"
                  >
                    {item.scrip}
                  </button>
                  {item.is_post_tax_nav && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                      AIF
                    </span>
                  )}
                </div>
              </td>
            );

          case 'symbol':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 font-mono font-bold text-cyan-300 whitespace-nowrap">
                {item.symbol}
              </td>
            );

          case 'isin':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 font-mono text-[10px] text-slate-300 whitespace-nowrap">
                {item.isin}
              </td>
            );

          case 'portfolio':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 whitespace-nowrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 border border-slate-600 text-slate-200">
                  {item.portfolio}
                </span>
              </td>
            );

          case 'owner_pan':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-100">{item.owner_name}</span>
                  <span className="text-[9px] font-mono text-cyan-400 font-semibold">{item.pan}</span>
                </div>
              </td>
            );

          case 'asset_class':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 whitespace-nowrap">
                {item.is_post_tax_nav ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    AIF (Post-Tax)
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-slate-200">{item.asset_class}</span>
                )}
              </td>
            );

          case 'sector':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3">
                <span className="text-[11px] font-medium text-slate-200 truncate max-w-[130px] block">{item.sector}</span>
              </td>
            );

          case 'quantity':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono text-slate-100 font-bold whitespace-nowrap">
                {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
              </td>
            );

          case 'avg_buy_price':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono text-slate-200 whitespace-nowrap">
                ₹{item.avg_buy_price.toFixed(2)}
              </td>
            );

          case 'total_cost':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono text-slate-100 font-bold whitespace-nowrap">
                {formatCurrency(item.total_cost)}
              </td>
            );

          case 'ltp':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono font-black text-white whitespace-nowrap">
                <div>₹{item.ltp.toFixed(4)}</div>
                {item.is_post_tax_nav && (
                  <span className="inline-block text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 rounded uppercase tracking-wider">
                    Post-Tax NAV
                  </span>
                )}
              </td>
            );

          case 'current_value':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono font-black text-white whitespace-nowrap">
                {formatCurrency(item.current_value)}
              </td>
            );

          case 'unrealized_pnl':
            return (
              <td key={col.id} style={baseStyle} className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${item.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                <div>{item.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(item.unrealized_pnl)}</div>
                {item.is_post_tax_nav && (
                  <span className="text-[9px] font-semibold text-slate-400 block">
                    (Net Post-Tax)
                  </span>
                )}
              </td>
            );

          case 'unrealized_pct':
            return (
              <td key={col.id} style={baseStyle} className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${item.unrealized_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {item.unrealized_pct >= 0 ? '+' : ''}{item.unrealized_pct.toFixed(2)}%
              </td>
            );

          case 'day_change':
            return (
              <td key={col.id} style={baseStyle} className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${item.day_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.day_change >= 0 ? '+' : ''}{formatCurrency(item.day_change)}
              </td>
            );

          case 'realized_pnl':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono font-medium text-slate-200 whitespace-nowrap">
                {formatCurrency(item.realized_pnl)}
              </td>
            );

          case 'total_pnl': {
            const totalPnl = (item.unrealized_pnl || 0) + (item.realized_pnl || 0);
            return (
              <td key={col.id} style={baseStyle} className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              </td>
            );
          }

          case 'ai_signal': {
            const directive = (item.ai_directive || 'NO_ACTIVE_SIGNAL').toUpperCase();
            let badgeStyle = 'bg-slate-800 text-slate-400 border-slate-700';
            if (['STRONG_BUY', 'BUY', 'ACCUMULATE'].includes(directive)) {
              badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
            } else if (directive === 'HOLD') {
              badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
            } else if (['REDUCE', 'SELL', 'BEARISH_BREAKDOWN', 'SHORT_HEDGE'].includes(directive)) {
              badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
            }
            const calText = item.cal_win_rate
              ? `historically right ${(item.cal_win_rate * 100).toFixed(0)}% of time (n=${item.cal_n || 48})`
              : 'insufficient history (n < 15)';

            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                <button
                  onClick={() => showStockDrilldown && showStockDrilldown(item.symbol)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer hover:scale-105 ${badgeStyle}`}
                  title={`${directive} · ${calText} (Click to open Security Dossier)`}
                >
                  {directive.replace(/_/g, ' ')}
                </button>
              </td>
            );
          }

          case 'xirr':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                {item.xirr !== null ? (
                  <span className={`font-bold ${item.xirr >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>
                    {item.xirr.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-slate-400 cursor-help" title="XIRR requires ≥2 cashflows">--</span>
                )}
              </td>
            );

          case 'cagr': {
            const holdingYears = item.first_buy_date 
              ? Math.max(0, (Date.now() - new Date(item.first_buy_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) 
              : 1;
            const cagrVal = holdingYears >= (1 / 365) && item.total_cost > 0
              ? (Math.pow(item.current_value / item.total_cost, 1 / holdingYears) - 1) * 100
              : null;
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                {cagrVal !== null && isFinite(cagrVal) ? (
                  <span className={`font-semibold ${cagrVal >= 0 ? 'text-cyan-300' : 'text-rose-300'}`} title="Fallback CAGR approximation based on calendar days">
                    {cagrVal.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-slate-400 cursor-help" title="Holding period < 1 day or no cost base">--</span>
                )}
              </td>
            );
          }

          case 'capital_efficiency': {
            const oppCost = 7.0;
            const rawEff = item.xirr !== null ? item.xirr - oppCost : null;
            const volProxy = 18.0;
            const riskAdjusted = rawEff !== null ? rawEff / volProxy : null;
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                {riskAdjusted !== null ? (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${riskAdjusted >= 0 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'}`} title={`Risk-Adjusted Efficiency (Sharpe-like ratio vs 7% hurdle, ${volProxy}% vol proxy): ${riskAdjusted.toFixed(2)}`}>
                    {riskAdjusted >= 0 ? '+' : ''}{riskAdjusted.toFixed(2)}x
                  </span>
                ) : (
                  <span className="text-slate-500" title="Holding without computed volatility or XIRR">--</span>
                )}
              </td>
            );
          }

          case 'weight_pct':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-right font-mono text-cyan-300 font-bold whitespace-nowrap">
                {allocPct.toFixed(2)}%
              </td>
            );

          case 'tax_category':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-center whitespace-nowrap">
                {item.is_post_tax_nav ? (
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    AIF (Fund-Taxed)
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                    item.tax_category === 'LTCG'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {item.tax_category}
                  </span>
                )}
              </td>
            );

          case 'senior_citizen':
            return (
              <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-center">
                {item.is_senior_citizen ? (
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                    SR CITIZEN
                  </span>
                ) : (
                  <span className="text-slate-400 text-[10px]">-</span>
                )}
              </td>
            );

          default:
            return <td key={col.id} style={baseStyle} className="py-2.5 px-3 text-slate-500 text-center">-</td>;
        }
      })}
    </tr>
  );
};
