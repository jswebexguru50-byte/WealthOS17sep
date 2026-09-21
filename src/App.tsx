import React, { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  Briefcase,
  Layers,
  Percent,
  Search,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  Info,
  ChevronDown,
  LayoutDashboard,
  Receipt,
  Coins,
  ShieldCheck,
  HardDrive,
  FolderSync,
  HelpCircle,
  Wrench,
  GitMerge,
  BarChart4,
  FileSpreadsheet,
  FileText,
  PieChart as PieChartIcon,
  Building2,
  ExternalLink,
  Globe,
  Palette,
  SlidersHorizontal,
  Menu,
  Zap,
  Bell,
  ShieldAlert,
  Columns,
  Check,
  LayoutGrid,
  X,
  Flame,
  Compass,
  Rocket,
  Sparkles,
  Crosshair
} from 'lucide-react';

// Import Types
import { Holding, Transaction, CorporateAction, MasterTicker, DashboardMetrics } from './types';
import { safeFetchJson } from './lib/api';

// ── Eagerly loaded (critical-path shell components) ───────────────────────────
import { ToastManager, WaitGlass, ToastMessage } from './components/UIPrompts';
import { MultiPortfolioSelect } from './components/MultiPortfolioSelect';
import { FamilyMemberSwitcher } from './components/FamilyMemberSwitcher';
import { StockDrilldown } from './components/StockDrilldown';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { 
  ThemeSelectorModal, 
  applyTheme, 
  getActiveThemeId,
  getActiveLayoutId,
  applyLayout,
  LayoutOptionId,
  LAYOUT_OPTIONS
} from './components/ThemeSelectorModal';
import { CommandCenterRightDrawer } from './components/CommandCenterRightDrawer';
import { PreferencesModal } from './components/PreferencesModal';

// ── Lazily loaded (heavy views — only parsed when first navigated to) ─────────
const PortfolioHubView           = React.lazy(() => import('./components/PortfolioHubView').then(m => ({ default: m.PortfolioHubView })));
const LedgerHubView              = React.lazy(() => import('./components/LedgerHubView').then(m => ({ default: m.LedgerHubView })));
const ImportsHubView             = React.lazy(() => import('./components/ImportsHubView').then(m => ({ default: m.ImportsHubView })));
const SettingsHubView            = React.lazy(() => import('./components/SettingsHubView').then(m => ({ default: m.SettingsHubView })));
const PortfolioIntelligenceWatchlist = React.lazy(() => import('./components/PortfolioIntelligenceWatchlist').then(m => ({ default: m.PortfolioIntelligenceWatchlist })));
const StockIntelligenceView      = React.lazy(() => import('./components/StockIntelligenceView').then(m => ({ default: m.StockIntelligenceView })));
const ScripIntelligencePortal    = React.lazy(() => import('./components/ScripIntelligencePortal').then(m => ({ default: m.ScripIntelligencePortal })));
const PerformanceSnapshotModal   = React.lazy(() => import('./components/PerformanceSnapshotModal').then(m => ({ default: m.PerformanceSnapshotModal })));
const ReportsEngineModal         = React.lazy(() => import('./components/ReportsEngineModal').then(m => ({ default: m.ReportsEngineModal })));
const InstitutionalAnalyticsHub  = React.lazy(() => import('./components/InstitutionalAnalyticsHub').then(m => ({ default: m.InstitutionalAnalyticsHub })));
const NriTaxRepatriationHub       = React.lazy(() => import('./components/NriTaxRepatriationHub').then(m => ({ default: m.NriTaxRepatriationHub })));
const OpportunitiesRebalancingHub = React.lazy(() => import('./components/OpportunitiesRebalancingHub').then(m => ({ default: m.OpportunitiesRebalancingHub })));
const FamilyBenchmarkManagerView = React.lazy(() => import('./components/FamilyBenchmarkManagerView').then(m => ({ default: m.FamilyBenchmarkManagerView })));
const AssetScripMappingView      = React.lazy(() => import('./components/AssetScripMappingView').then(m => ({ default: m.AssetScripMappingView })));
const FamilyOfficeCommandCenter  = React.lazy(() => import('./components/FamilyOfficeCommandCenter').then(m => ({ default: m.FamilyOfficeCommandCenter })));
const SmartAlertsModal           = React.lazy(() => import('./components/SmartAlertsModal').then(m => ({ default: m.SmartAlertsModal })));
const RiskAnalyticsModal         = React.lazy(() => import('./components/RiskAnalyticsModal').then(m => ({ default: m.RiskAnalyticsModal })));
const ReportStudioView           = React.lazy(() => import('./components/ReportStudioView').then(m => ({ default: m.ReportStudioView })));
const AutonomousSmartMoneySentinelView = React.lazy(() => import('./components/AutonomousSmartMoneySentinelView').then(m => ({ default: m.AutonomousSmartMoneySentinelView })));
const SmartMoneyMomentumVpaView = React.lazy(() => import('./components/SmartMoneyMomentumVpaView').then(m => ({ default: m.SmartMoneyMomentumVpaView })));
const GreenfieldInvestmentPortal = React.lazy(() => import('./components/GreenfieldInvestmentPortal').then(m => ({ default: m.GreenfieldInvestmentPortal })));
const MultibaggerScreenerView    = React.lazy(() => import('./components/MultibaggerScreenerView').then(m => ({ default: m.MultibaggerScreenerView })));
const OpportunityEngineMasterView = React.lazy(() => import('./components/OpportunityEngineMasterView').then(m => ({ default: m.OpportunityEngineMasterView })));
const IndependentTechnicalStrategiesView = React.lazy(() => import('./components/IndependentTechnicalStrategiesView').then(m => ({ default: m.IndependentTechnicalStrategiesView })));
const StrategyParameterEditorView = React.lazy(() => import('./components/StrategyParameterEditorView').then(m => ({ default: m.StrategyParameterEditorView })));
const OpportunityHubView          = React.lazy(() => import('./components/OpportunityHubView').then(m => ({ default: m.OpportunityHubView })));
const StockDossierView            = React.lazy(() => import('./components/StockDossierView').then(m => ({ default: m.StockDossierView })));
const QuantEngineDashboardV5      = React.lazy(() => import('./components/QuantEngineDashboardV5').then(m => ({ default: m.QuantEngineDashboardV5 })));
const ForensicIntelligenceMasterView = React.lazy(() => import('./components/forensic/ForensicIntelligenceMasterView').then(m => ({ default: m.ForensicIntelligenceMasterView })));
const MasterQuantDossier11TabsView = React.lazy(() => import('./components/MasterQuantDossier11TabsView').then(m => ({ default: m.MasterQuantDossier11TabsView })));
const QuantTechnicalStudioView = React.lazy(() => import('./components/QuantTechnicalStudioView').then(m => ({ default: m.QuantTechnicalStudioView })));

// ── New UI-WAVE workspace compositors (display-only) ──────────────────────────
const DiscoverWorkspace       = React.lazy(() => import('./components/DiscoverWorkspace').then(m => ({ default: m.DiscoverWorkspace })));
const ResearchWorkspace       = React.lazy(() => import('./components/ResearchWorkspace').then(m => ({ default: m.ResearchWorkspace })));
const AuditWorkspace          = React.lazy(() => import('./components/AuditWorkspace').then(m => ({ default: m.AuditWorkspace })));
const NotFoundRecoveryView    = React.lazy(() => import('./components/NotFoundRecoveryView').then(m => ({ default: m.NotFoundRecoveryView })));
// CmdKSearchModal imported eagerly — it's tiny and needed on first keypress
import { CmdKSearchModal } from './components/UISystemPrimitives';

// Lazy loading spinner used inside Suspense boundaries
const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', color: '#64748b', fontSize: 14 }}>
    <span style={{ marginRight: 8 }}>⏳</span> Loading...
  </div>
);

type TabType = 'OVERVIEW' | 'DISCOVER' | 'ANALYZE' | 'PORTFOLIO' | 'RESEARCH' | 'AUDIT' | 'COMMAND_CENTER' | 'MASTER_DOSSIER' | 'QUANT_TECHNICAL_STUDIO' | 'ANALYTICS' | 'QUANT_V5' | 'FORENSIC_INTELLIGENCE' | 'OPPORTUNITY_ENGINE' | 'TECHNICAL_STRATEGIES' | 'STRATEGY_EDITOR' | 'SENTINEL' | 'MOMENTUM_VPA' | 'GREENFIELD_PORTAL' | 'MULTIBAGGER' | 'REPORT_STUDIO' | 'TAX_REPATRIATION' | 'OPPORTUNITIES' | 'LEDGER' | 'IMPORTS' | 'FAMILY' | 'MAPPINGS' | 'INTELLIGENCE' | 'SETTINGS';

// Intercept window.fetch to automatically inject APP_PASSWORD authorization header
if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !(window.fetch as any).__isPatched) {
  try {
    const originalFetch = window.fetch.bind(window);
    const patchedFetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const savedPassword = localStorage.getItem('app-password');
      if (!savedPassword) {
        return originalFetch(input, init);
      }
      const newInit: RequestInit = { ...init };
      const headers = new Headers(init?.headers || {});
      headers.set('x-app-password', savedPassword);
      newInit.headers = headers;
      return originalFetch(input, newInit);
    };

    (patchedFetch as any).__isPatched = true;
    try {
      window.fetch = patchedFetch;
    } catch {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        configurable: true,
        writable: true,
      });
    }
  } catch (err) {
    console.warn('[App] Could not intercept window.fetch:', err);
  }
}

export default function App() {
  const getInitialTab = (): TabType => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const h = window.location.hash.replace('#', '').toLowerCase();
      // New Canonical Routes
      if (h === 'overview' || h === 'dashboard') return 'OVERVIEW';
      if (h === 'discover') return 'DISCOVER';
      if (h === 'analyze') return 'ANALYZE';
      if (h === 'portfolio') return 'PORTFOLIO';
      if (h === 'research') return 'RESEARCH';
      if (h === 'audit' || h === 'settings') return 'AUDIT';

      // Fallback for legacy routes
      if (
        h === 'opportunity-engine' ||
        h === 'opportunity_engine' ||
        h === 'greenfield-portal' ||
        h === 'sentinel' ||
        h === 'momentum-vpa' ||
        h === 'multibagger' ||
        h === 'opportunities'
      ) {
        return 'DISCOVER';
      }
      if (h === 'master-dossier' || h === 'dossier' || h === 'master_dossier' || h === 'dossier-11-tabs') return 'ANALYZE';
      if (h === 'forensic' || h === 'forensic-intelligence' || h === 'forensic_intelligence') return 'ANALYZE';
      if (h === 'quant-v5' || h === 'quant_v5') return 'RESEARCH';
      if (h === 'technical-strategies' || h === 'technical_strategies' || h === 'technical' || h === 'independent-technical') return 'RESEARCH';
      if (h === 'tax-repatriation' || h === 'tax_repatriation') return 'AUDIT';
      if (h === 'report-studio' || h === 'report_studio') return 'RESEARCH';
      if (h === 'ledger') return 'PORTFOLIO';
      if (h === 'imports') return 'AUDIT';
      if (h === 'intelligence') return 'ANALYZE';
      if (h === 'analytics') return 'PORTFOLIO';
    }
    return 'OVERVIEW';
  };

  const [activeTab, setActiveTabState] = useState<TabType>(getInitialTab);

  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const slug = tab.toLowerCase().replace(/_/g, '-');
      window.history.replaceState(null, '', `#${slug}`);
    }
  };

  useEffect(() => {
    const handleHash = () => {
      setActiveTabState(getInitialTab());
    };
    const handleNavigateForensic = (e: any) => {
      setActiveTabState('FORENSIC_INTELLIGENCE');
    };
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('navigate-forensic', handleNavigateForensic);
    return () => {
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('navigate-forensic', handleNavigateForensic);
    };
  }, []);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Family Member & Multi-User state
  const [currentMemberId, setCurrentMemberId] = useState<number | 'all'>(() => {
    const saved = localStorage.getItem('app-family-member');
    if (saved === 'all') return 'all';
    if (saved) {
      const num = parseInt(saved, 10);
      return !isNaN(num) ? num : 1;
    }
    return 1; // Default to Gopal (Primary / Family Office)
  });

  // Portfolios state
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('Combined');
  const [portfolios, setPortfolios] = useState<string[]>([]);
  const [pmsPortfolios, setPmsPortfolios] = useState<string[]>([]);
  const reqIdRef = useRef(0);

  // Core financial states
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [includeSold, setIncludeSold] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total_invested: 0,
    current_value: 0,
    unrealized_pnl: 0,
    unrealized_pct: 0,
    realized_pnl: 0,
    dividends: 0,
    xirr: null,
    bench_xirr: null,
    unpriced_holdings: 0,
    day_change: 0,
    day_change_pct: 0
  });
  const [growthHistory, setGrowthHistory] = useState<any[]>([]);
  const [annualFyData, setAnnualFyData] = useState<any[]>([]);
  const [benchmarkSymbol, setBenchmarkSymbol] = useState<string>('^NIFTY250SMR');

  // Detailed stock lots modal
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedIntelligenceSymbol, setSelectedIntelligenceSymbol] = useState<string | null>(null);

  // Web Price Matcher Confirmation Modal State
  const [webMatchConfirmModal, setWebMatchConfirmModal] = useState<{
    isOpen: boolean;
    targetPortfolio: string;
    activeTickers: string[];
  } | null>(null);

  // Global Toast alerts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Wait Glass Loading Overlays
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Processing...');
  const [loadingSub, setLoadingSub] = useState('The FIFO tax engine is validating records...');

  // Google OAuth Auth Guard State
  const [userEmail, setUserEmail] = useState<string | null>(() => {
    return localStorage.getItem('app-auth-session') === 'true'
      ? localStorage.getItem('app-auth-email')
      : null;
  });

  // Theme, Layout & Analytics Modal States
  const [activeLayout, setActiveLayout] = useState<LayoutOptionId>(getActiveLayoutId());
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(true);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [alertsCount, setAlertsCount] = useState(0);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  // Cmd/Ctrl+K global search
  const [showCmdK, setShowCmdK] = useState(false);

  useEffect(() => {
    applyTheme(getActiveThemeId());
    applyLayout(getActiveLayoutId());

    const onLayoutChange = (e: any) => {
      if (e.detail?.layoutId) setActiveLayout(e.detail.layoutId);
    };
    window.addEventListener('layoutChanged', onLayoutChange);

    fetch('/api/alerts')
      .then(r => r.json())
      .then(d => { if (d.success) setAlertsCount(d.count || d.alerts?.length || 0); })
      .catch(() => {});

    return () => window.removeEventListener('layoutChanged', onLayoutChange);
  }, []);

  // Cmd+K / Ctrl+K global search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdK(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerLoader = (active: boolean, msg = 'Processing Request...', sub = 'Please wait while the system completes the transaction...') => {
    setLoadingMsg(msg);
    setLoadingSub(sub);
    setIsLoading(active);
  };

  // Format Helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  // Core Data Fetch Operations
  const fetchPortfoliosList = async (mId = currentMemberId) => {
    try {
      const q = mId ? `?member_id=${mId}` : '';
      const { ok, data } = await safeFetchJson(`/api/portfolios${q}`);
      if (ok && data) {
        const list = data.portfolios || data.list || (Array.isArray(data) ? data : []);
        setPortfolios(list);
        if (data.pmsPortfolios && Array.isArray(data.pmsPortfolios)) {
          setPmsPortfolios(data.pmsPortfolios);
        } else {
          setPmsPortfolios(list);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHoldingsList = async (currentPortfolio = selectedPortfolio, mId = currentMemberId) => {
    let url = `/api/dashboard?include_sold=${includeSold}`;
    if (currentPortfolio && currentPortfolio !== 'Combined') {
      url += `&portfolios=${encodeURIComponent(currentPortfolio)}`;
    }
    if (mId) {
      url += `&member_id=${mId}`;
    }
    
    try {
      const { ok, data } = await safeFetchJson(url);
      if (ok && data) {
        if (data.holdings) setHoldings(data.holdings);
        if (data.metrics) {
          setMetrics((prev) => ({
            ...data.metrics,
            xirr: data.metrics.xirr !== null ? data.metrics.xirr : prev.xirr,
            bench_xirr: data.metrics.bench_xirr !== null ? data.metrics.bench_xirr : prev.bench_xirr,
            inr_xirr: prev.inr_xirr
          }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMemberSelect = (memberId: number | 'all') => {
    const targetId: number | 'all' = (memberId === 'all') ? 'all' : (Number(memberId) || 1);
    setCurrentMemberId(targetId);
    localStorage.setItem('app-family-member', String(targetId));
    setSelectedPortfolio('Combined');
    fetchPortfoliosList(targetId);
    refreshAllCoreData('Combined', targetId);
  };

  const fetchDashboardMetrics = async (currentPortfolio = selectedPortfolio, mId = currentMemberId) => {
    const params = new URLSearchParams();
    if (currentPortfolio && currentPortfolio !== 'Combined') {
      params.set('portfolios', currentPortfolio);
    }
    if (mId) {
      params.set('member_id', String(mId));
    }
    const qs = params.toString();
    const url = `/api/metrics${qs ? `?${qs}` : ''}`;

    try {
      const { ok, data } = await safeFetchJson(url);
      if (ok && data?.success && data.metrics) {
        setMetrics((prev) => ({
          ...data.metrics,
          xirr: prev.xirr,
          bench_xirr: prev.bench_xirr
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchXirrMetrics = async (currentIncSold = includeSold, currentPortfolio = selectedPortfolio, mId = currentMemberId) => {
    const params = new URLSearchParams();
    params.set('include_sold', String(currentIncSold));
    if (currentPortfolio && currentPortfolio !== 'Combined') {
      params.set('portfolios', currentPortfolio);
    }
    if (mId) {
      params.set('member_id', String(mId));
    }
    const url = `/api/dashboard/xirr?${params.toString()}`;

    try {
      const { ok, data } = await safeFetchJson(url);
      if (ok && data?.success) {
        setMetrics((prev) => ({
          ...prev,
          xirr: data.xirr,
          post_tax_xirr: data.post_tax_xirr,
          tax_drag_pct: data.tax_drag_pct,
          tax_provision_details: data.tax_provision_details,
          bench_xirr: data.bench_xirr,
          gold_xirr: data.gold_xirr,
          sp500_xirr: data.sp500_xirr,
          inr_xirr: data.inr_xirr
        }));
      }
    } catch (err) {
      console.error('[XIRR fetch error]', err);
    }
  };

  const fetchGrowthHistoryData = async (symbol: string = benchmarkSymbol, currentPortfolio = selectedPortfolio, mId = currentMemberId) => {
    const params = new URLSearchParams();
    params.set('benchmark', symbol);
    if (currentPortfolio && currentPortfolio !== 'Combined') {
      params.set('portfolios', currentPortfolio);
    }
    if (mId) {
      params.set('member_id', String(mId));
    }
    const url = `/api/growth-history?${params.toString()}`;

    try {
      const { ok, data } = await safeFetchJson(url);
      if (ok && data) {
        if (data.history && Array.isArray(data.history)) {
          setGrowthHistory(data.history);
        } else if (data.history?.history && Array.isArray(data.history.history)) {
          setGrowthHistory(data.history.history);
        }

        if (data.annual_fy && Array.isArray(data.annual_fy)) {
          setAnnualFyData(data.annual_fy);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBenchmarkChange = async (newSymbol: string) => {
    setBenchmarkSymbol(newSymbol);
    await fetchGrowthHistoryData(newSymbol, selectedPortfolio, currentMemberId);
  };

  const handlePortfolioSelect = (p: string) => {
    // If selecting Combined / All, keep active member and show their Combined portfolio
    if (!p || p === 'Combined' || p === 'all') {
      setSelectedPortfolio('Combined');
      refreshAllCoreData('Combined', currentMemberId);
      return;
    }

    const brotherKeywords = ['brother - equity', 'brother - mutual funds', 'pooja mf'];
    const isBrotherSpecific = brotherKeywords.some(b => p.toLowerCase() === b || p.toLowerCase().includes(b));

    if (isBrotherSpecific) {
      if (currentMemberId !== 2) {
        setCurrentMemberId(2);
        localStorage.setItem('app-family-member', '2');
        fetchPortfoliosList(2);
      }
      setSelectedPortfolio(p);
      refreshAllCoreData(p, 2);
      if (activeTab === 'COMMAND_CENTER' && p !== 'none') {
        setActiveTab('PORTFOLIO');
      }
      return;
    }

    const gopalKeywords = ['maa', 'papa', 'cc9', 'ibkr', 'unlisted', 'dbfs', 'hdfc', 'sarwa', 'iifl', 'self', 'cash & fd'];
    const isGopalSpecific = gopalKeywords.some(g => p.toLowerCase().includes(g));

    if (isGopalSpecific) {
      if (currentMemberId !== 1) {
        setCurrentMemberId(1);
        localStorage.setItem('app-family-member', '1');
        fetchPortfoliosList(1);
      }
      setSelectedPortfolio(p);
      refreshAllCoreData(p, 1);
      if (activeTab === 'COMMAND_CENTER' && p !== 'none') {
        setActiveTab('PORTFOLIO');
      }
      return;
    }

    setSelectedPortfolio(p);
    refreshAllCoreData(p, currentMemberId);
    if (activeTab === 'COMMAND_CENTER' && p !== 'none') {
      setActiveTab('PORTFOLIO');
    }
  };

  const refreshAllCoreData = async (currentPortfolio = selectedPortfolio, currentMember = currentMemberId) => {
    const currentReqId = ++reqIdRef.current;

    // Smooth in-place data refresh without destructive DOM unmounting

    const qs = new URLSearchParams();
    qs.set('include_sold', String(includeSold));
    if (currentPortfolio && currentPortfolio !== 'Combined') {
      qs.set('portfolios', currentPortfolio);
    }
    if (currentMember) {
      qs.set('member_id', String(currentMember));
    }
    const qsStr = qs.toString();

    // ── PHASE 1: Holdings + Metrics (fast, < 30ms from cache) ──────────────────
    // Fetch unified dashboard snapshot and update the UI immediately
    try {
      const dashRes = await safeFetchJson(`/api/dashboard?${qsStr}`);

      // Ignore stale response if user switched portfolio again while request was in-flight
      if (currentReqId !== reqIdRef.current) return;

      if (dashRes.ok && dashRes.data) {
        const d = dashRes.data;
        if (d.holdings) setHoldings(d.holdings);
        if (d.metrics) {
          setMetrics(prev => ({
            ...prev,
            ...d.metrics,
            xirr: prev.xirr ?? d.metrics.xirr ?? null,
            bench_xirr: prev.bench_xirr ?? d.metrics.bench_xirr ?? null,
            gold_xirr: (prev as any).gold_xirr ?? d.metrics.gold_xirr ?? null,
            sp500_xirr: (prev as any).sp500_xirr ?? d.metrics.sp500_xirr ?? null
          }));
        }
      }
    } catch (err) {
      console.error('[Phase 1 fetch error]', err);
    }

    // ── PHASE 2: XIRR + Growth History (background) ──────────────────
    // Run in background — UI already has fresh holdings/metrics from Phase 1
    Promise.all([
      safeFetchJson(`/api/dashboard/xirr?${qsStr}`),
      safeFetchJson(`/api/growth-history?${qsStr}&benchmark=${encodeURIComponent(benchmarkSymbol)}`)
    ]).then(([xirrRes, growthRes]) => {
      // Ignore stale response if user switched portfolio again while request was in-flight
      if (currentReqId !== reqIdRef.current) return;

      if (xirrRes.ok && xirrRes.data?.success) {
        const x = xirrRes.data;
        setMetrics(prev => ({
          ...prev,
          xirr: x.xirr !== undefined ? x.xirr : prev.xirr,
          post_tax_xirr: x.post_tax_xirr !== undefined ? x.post_tax_xirr : prev.post_tax_xirr,
          tax_drag_pct: x.tax_drag_pct !== undefined ? x.tax_drag_pct : prev.tax_drag_pct,
          tax_provision_details: x.tax_provision_details !== undefined ? x.tax_provision_details : prev.tax_provision_details,
          bench_xirr: x.bench_xirr !== undefined ? x.bench_xirr : prev.bench_xirr,
          gold_xirr: x.gold_xirr !== undefined ? x.gold_xirr : (prev as any).gold_xirr,
          sp500_xirr: x.sp500_xirr !== undefined ? x.sp500_xirr : (prev as any).sp500_xirr,
          inr_xirr: x.inr_xirr !== undefined ? x.inr_xirr : prev.inr_xirr
        }));
      }
      if (growthRes.ok && growthRes.data) {
        const g = growthRes.data;
        if (g.history && Array.isArray(g.history)) setGrowthHistory(g.history);
        else if (g.history?.history && Array.isArray(g.history.history)) setGrowthHistory(g.history.history);
        if (g.annual_fy && Array.isArray(g.annual_fy)) setAnnualFyData(g.annual_fy);
      }
    }).catch(err => console.error('[Phase 2 fetch error]', err));
  };

  useEffect(() => {
    fetchPortfoliosList(currentMemberId);
  }, [currentMemberId]);

  useEffect(() => {
    refreshAllCoreData(selectedPortfolio, currentMemberId);
  }, [selectedPortfolio, currentMemberId, includeSold]);

  useEffect(() => {
    const handlePortfolioChange = () => {
      refreshAllCoreData(selectedPortfolio, currentMemberId);
      fetchPortfoliosList(currentMemberId);
    };
    window.addEventListener('portfolioDataChanged', handlePortfolioChange);
    return () => {
      window.removeEventListener('portfolioDataChanged', handlePortfolioChange);
    };
  }, [selectedPortfolio, currentMemberId]);

  // Auto-sync scheduler for live prices, XE rates, and tickers:
  // - Shares/Market Prices: Every 3 minutes during Indian Market Hours (Mon-Fri 09:00-15:35 IST), 15 mins off-hours
  // - FDs & FX Rates: Every 30 minutes during Market Hours, 60 mins off-hours
  useEffect(() => {
    const isMarketHoursIST = () => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false
        });
        const parts = formatter.formatToParts(new Date());
        let weekday = '', hour = 0, minute = 0;
        for (const p of parts) {
          if (p.type === 'weekday') weekday = p.value;
          if (p.type === 'hour') hour = parseInt(p.value, 10);
          if (p.type === 'minute') minute = parseInt(p.value, 10);
        }
        const isTradingDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
        if (!isTradingDay) return false;
        const timeInMin = hour * 60 + minute;
        return timeInMin >= 9 * 60 && timeInMin <= 15 * 60 + 35;
      } catch {
        return false;
      }
    };

    // Lightweight timestamp poller — server already auto-syncs every 45s.
    // Only fire portfolioDataChanged if prices actually updated since last check.
    let lastSeenTimestamp: string | null = null;

    const pollPriceTimestamp = async () => {
      try {
        const res = await safeFetchJson('/api/prices/last-updated');
        if (res.ok && res.data?.last_updated) {
          const incoming = res.data.last_updated;
          if (lastSeenTimestamp !== null && incoming !== lastSeenTimestamp) {
            window.dispatchEvent(new Event('portfolioDataChanged'));
          }
          lastSeenTimestamp = incoming;
        }
      } catch (err) {
        console.error('[Auto-Sync] Timestamp poll error:', err);
      }
    };

    const interval = setInterval(pollPriceTimestamp, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Synchronize LTP Yahoo Market Feed
  const handleSyncPrices = async () => {
    triggerLoader(
      true,
      'Syncing Market Prices...',
      'Retrieving the latest live ticker price feeds from Yahoo Finance and compiling portfolio valuation metrics...'
    );
    try {
      const res = await fetch('/api/market-prices/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ portfolio: selectedPortfolio }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.failedSymbols && data.failedSymbols.length > 0) {
          showToast(`Prices refreshed! However, the following ${data.failedSymbols.length} stock(s) failed to update: ${data.failedSymbols.join(', ')}. Please check your connections.`, 'warning');
        } else {
          showToast(`Successfully refreshed live LTP ticker price feeds for all ${data.synced} master holdings!`, 'success');
        }
        // Wait 500ms for SQLite writes to fully commit before re-fetching
        await new Promise(r => setTimeout(r, 500));
        await refreshAllCoreData();
      } else {
        showToast(data.message || 'Market price update failed.', 'error');
      }
    } catch (err) {
      showToast('Market price sync connection error. Please try again.', 'error');
    } finally {
      triggerLoader(false);
    }
  };

  // Web Price Matcher (Google Search & Exchange Matcher) Prompt
  const handleWebPriceMatch = () => {
    const ports = (Array.isArray(selectedPortfolio) ? selectedPortfolio : [selectedPortfolio])
      .map(p => String(p).trim())
      .filter(Boolean);

    const activeStockHoldings = holdings.filter(h => {
      if (h.quantity <= 0) return false;
      const sym = (h.symbol || '').toUpperCase();
      const isin = (h.isin || '').toUpperCase();
      if (sym.startsWith('UL') || sym.includes('UNLISTED') || isin.startsWith('CUSTOM_') || isin.startsWith('INF')) return false;
      
      if (ports.length > 0 && !ports.includes('Combined') && !ports.includes('All') && !ports.includes('None')) {
        if (!ports.includes(h.portfolio)) return false;
      }
      return true;
    });

    const activeSymbols = Array.from(new Set(activeStockHoldings.map(h => h.symbol.trim().toUpperCase())));

    setWebMatchConfirmModal({
      isOpen: true,
      targetPortfolio: ports.join(', ') || 'Combined',
      activeTickers: activeSymbols
    });
  };

  // Execution after user confirmation in modal
  const handleConfirmWebPriceMatch = async () => {
    setWebMatchConfirmModal(null);
    triggerLoader(
      true,
      'Matching Web / Zerodha Prices...',
      'Cross-referencing active holdings against Google Search & official exchange quotes to verify exact session closes...'
    );
    try {
      const res = await fetch('/api/market-prices/web-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ portfolio: selectedPortfolio }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `Successfully verified & matched stock prices against Web / Zerodha closing quotes!`, 'success');
        await new Promise(r => setTimeout(r, 500));
        await refreshAllCoreData();
      } else {
        showToast(data.message || 'Web price matching failed.', 'error');
      }
    } catch (err) {
      showToast('Web price matching connection error. Please try again.', 'error');
    } finally {
      triggerLoader(false);
    }
  };


  // Recalculate FIFO Ledger States
  const handleRecalculateFIFO = async () => {
    triggerLoader(
      true,
      'Recalculating FIFO Lots...',
      'The FIFO engine is re-matching trade acquisitions, applying splits, and calculating short-term vs long-term capital gains tax lists...'
    );
    try {
      const res = await fetch('/api/fifo/recalculate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Successfully recalculated FIFO matches, corporate splits, and realized capital gains summaries!', 'success');
        await refreshAllCoreData();
      } else {
        showToast(data.message || 'Failed to execute FIFO lot recalculation.', 'error');
      }
    } catch (err) {
      showToast('Internal portfolio engine failure.', 'error');
    } finally {
      triggerLoader(false);
    }
  };

  // Apply corporate actions automatically
  const handleApplyPendingCorporateActions = async () => {
    triggerLoader(
      true,
      'Applying Corporate Actions...',
      'Adjusting trade ledger records, re-routing proportional quantities for bonus lot emissions, and executing stock split modifications...'
    );
    try {
      const res = await fetch('/api/corporate-actions/apply', { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const text = await res.text();
        const cleanMsg = text.startsWith('<!DOCTYPE') || text.startsWith('<html')
          ? `Server returned HTTP ${res.status} (${res.statusText}). Request timed out or gateway error.`
          : text.substring(0, 150);
        showToast(cleanMsg, 'error');
        return;
      }
      const data = await res.json();
      if (data.success) {
        showToast(`Successfully applied ${data.applied || 0} pending corporate schedules to your trade ledger!`, 'success');
        await refreshAllCoreData();
      } else {
        showToast(data.message || 'Error executing corporate adjustment sequences.', 'error');
      }
    } catch (err: any) {
      showToast('Corporate processing failure: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      triggerLoader(false);
    }
  };

  // CRUD: Transactions
  const handleAddTransaction = async (txn: Partial<Transaction>) => {
    triggerLoader(true, 'Saving Trade Record...', 'Injecting trade event row to portfolio ledger tables...');
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txn)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Manual transaction trade log added successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to write transaction.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error while adding record.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleEditTransaction = async (id: number, txn: Partial<Transaction>) => {
    triggerLoader(true, 'Updating Trade...', 'Modifying database entry and recalculating FIFO lot schedules...');
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txn)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Trade record modified successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to modify transaction.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error while updating.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    triggerLoader(true, 'Purging Trade...', 'Deleting trade row and adjusting acquisition allocations...');
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Transaction trade log deleted permanently!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to delete transaction.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleBulkAction = async (action: 'DELETE' | 'UPDATE', ids: number[], fields?: Partial<Transaction>) => {
    triggerLoader(true, 'Executing Bulk Update...', 'Applying changes across the specified portfolio records...');
    try {
      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids, fields })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Successfully processed bulk action for ${ids.length} trade records!`, 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Bulk adjustment failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error while batch updating.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  // CRUD: Master Tickers
  const handleAddTicker = async (ticker: Partial<MasterTicker>) => {
    triggerLoader(true, 'Adding Ticker Profile...', 'Saving new scrip specifications in Master Directory...');
    try {
      const res = await fetch('/api/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticker)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Master ticker profile saved successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to write ticker profile.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleEditTicker = async (id: number, ticker: Partial<MasterTicker>) => {
    triggerLoader(true, 'Modifying Specifications...', 'Applying manual pricing overrides and ISIN adjustments...');
    try {
      const res = await fetch(`/api/tickers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticker)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Ticker specifications updated successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to update ticker.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleDeleteTicker = async (id: number) => {
    triggerLoader(true, 'Purging Ticker Profile...', 'Deleting ticker profile specifications...');
    try {
      const res = await fetch(`/api/tickers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Master Ticker profile deleted permanently!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Failed to purge ticker. Ensure no active trades exist.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleMergeTickers = async (sourceIsin: string, targetIsin: string) => {
    triggerLoader(true, 'Merging Tickers...', 'Re-routing legacy trade records and merging corporate event histories...');
    try {
      const res = await fetch('/api/tickers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_isin: sourceIsin, target_isin: targetIsin })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Successfully merged tickers and re-routed historical trade lists!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Merger action failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  // CRUD: Corporate Actions
  const handleAddCorporateAction = async (ca: Partial<CorporateAction>) => {
    triggerLoader(true, 'Scheduling Action...', 'Saving corporate action parameters...');
    try {
      const res = await fetch('/api/corporate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ca)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Corporate event schedule created successfully!', 'success');
        return true;
      } else {
        showToast(data.message || 'Failed to save event schedule.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleEditCorporateAction = async (id: number, ca: Partial<CorporateAction>) => {
    triggerLoader(true, 'Updating Event...', 'Modifying corporate action parameters...');
    try {
      const res = await fetch(`/api/corporate-actions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ca)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Corporate event schedule updated successfully!', 'success');
        return true;
      } else {
        showToast(data.message || 'Failed to update corporate event.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handleDeleteCorporateAction = async (id: number) => {
    triggerLoader(true, 'Purging Event...', 'Deleting scheduled corporate actions...');
    try {
      const res = await fetch(`/api/corporate-actions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Corporate event schedule deleted successfully!', 'success');
        return true;
      } else {
        showToast(data.message || 'Failed to delete event.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  // Reconciliation Upload Fetch
  const handleReconcileUpload = async (file: File, userMappings: Record<string, string> = {}, portfolio?: string, reconcileType?: string) => {
    const isPms = reconcileType === 'pms';
    triggerLoader(true, isPms ? 'Analyzing PMS Statement...' : 'Analyzing Broker Sheet...', isPms ? 'Validating PMS holdings sheet against trade ledger...' : 'Validating Zerodha holdings sheet against trade ledger...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mappings', JSON.stringify(userMappings));
    formData.append('reconcileType', reconcileType || 'broker');
    const targetPortfolio = portfolio || selectedPortfolio;
    if (targetPortfolio && targetPortfolio !== 'Combined') {
      formData.append('portfolios', targetPortfolio);
    }

    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return data;
    } catch (err) {
      showToast('Reconciliation error. Please check sheet format.', 'error');
      throw err;
    } finally {
      triggerLoader(false);
    }
  };

  // Bulk Import Validate & Commit
  const handleBulkValidateUpload = async (
    file: File, 
    target: string, 
    userMappings: Record<string, string> = {},
    portfolioOption?: string,
    portfolioName?: string
  ) => {
    triggerLoader(true, 'Validating Bulk Data...', 'Parsing spreadsheet headers, checking mapping files, and verifying duplicates...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_model', target);
    formData.append('mappings', JSON.stringify(userMappings));
    if (portfolioOption) {
      formData.append('portfolio_option', portfolioOption);
    }
    if (portfolioName) {
      formData.append('portfolio_name', portfolioName);
    }

    try {
      const res = await fetch('/api/import/validate', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return data;
    } catch (err) {
      showToast('Spreadsheet validation failed.', 'error');
      throw err;
    } finally {
      triggerLoader(false);
    }
  };

  const handleBulkCommitUpload = async (
    batchId: string, 
    userMappings: Record<string, string> = {},
    portfolioOption?: string,
    portfolioName?: string,
    overrideDuplicateIndices: number[] = []
  ) => {
    triggerLoader(true, 'Committing Import Batch...', 'Writing clean trade records to SQLite database...');
    try {
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          batch_id: batchId, 
          mappings: userMappings,
          portfolio_option: portfolioOption,
          portfolio_name: portfolioName,
          overrideDuplicateIndices
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Commit failed.');
      if (data.success) {
        await refreshAllCoreData();
      }
      return data;
    } catch (err) {
      showToast('Import commit failed.', 'error');
      throw err;
    } finally {
      triggerLoader(false);
    }
  };

  const handleUndoBatchRollback = async (batchId: string) => {
    triggerLoader(true, 'Reversing Bulk Batch...', 'Removing trade rows matching import batch ID...');
    try {
      const res = await fetch('/api/import/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Bulk import batch successfully rolled back and reversed!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Undo action failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error while reversing.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handlePMSUpload = async () => {
    await refreshAllCoreData();
    showToast('PMS data imported successfully!', 'success');
    return { success: true, message: 'Success' };
  };

  // Wipe / Purge Methods
  const handlePurgeBankBook = async (portfolio?: string, purgeMappings: boolean = true) => {
    const isSpecific = portfolio && portfolio !== 'ALL';
    triggerLoader(true, isSpecific ? `Purging Bank Book for ${portfolio}...` : 'Purging Bank Books...', 'Purging cash transactions & bank book entries...');
    try {
      const res = await fetch('/api/pms/purge-bank-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio: portfolio || 'ALL', purge_mappings: purgeMappings })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Bank book entries purged successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Bank book purge failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handlePurgeTransactionsOnly = async (portfolio?: string, purgeMappings: boolean = false) => {
    const isSpecific = portfolio && portfolio !== 'ALL';
    triggerLoader(true, isSpecific ? `Purging ${portfolio}...` : 'Wiping Database...', 'Purging transactional logs & corporate actions...');
    try {
      const res = await fetch('/api/admin/purge-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'true', portfolio: portfolio || 'ALL', purge_mappings: purgeMappings })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Transactions and corporate actions purged successfully!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Wipe failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  const handlePurgeEverythingFull = async () => {
    triggerLoader(true, 'Purging Database WIPE...', 'Recreating blank SQLite tables...');
    try {
      const res = await fetch('/api/admin/purge-everything', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'true' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Full portfolio.db database has been successfully wiped and re-created blank!', 'success');
        await refreshAllCoreData();
        return true;
      } else {
        showToast(data.message || 'Full purge failed.', 'error');
        return false;
      }
    } catch (err) {
      showToast('Network error.', 'error');
      return false;
    } finally {
      triggerLoader(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans transition-colors duration-200" style={{backgroundColor:'var(--bg-app)',color:'var(--text-primary)'}}>
      {/* Google OAuth Gatekeeper */}
      {!userEmail && (
        <GoogleAuthModal
          onSuccess={(email) => {
            setUserEmail(email);
            showToast(`Authenticated successfully as ${email}`, 'success');
          }}
        />
      )}

      {/* Toast Notification Container */}
      <ToastManager toasts={toasts} removeToast={removeToast} />

      {/* Wait Glass Loading Overlay */}
      <WaitGlass active={isLoading} message={loadingMsg} subMessage={loadingSub} />

      {/* Cmd/Ctrl+K Global Search Modal */}
      <CmdKSearchModal
        isOpen={showCmdK}
        onClose={() => setShowCmdK(false)}
        tabs={[
          { id: 'OVERVIEW', label: '1. Overview', sub: 'System Status & Context' },
          { id: 'DISCOVER', label: '2. Discover', sub: 'Qualified Opportunities' },
          { id: 'ANALYZE', label: '3. Analyze', sub: 'Stock Intelligence View' },
          { id: 'PORTFOLIO', label: '4. Portfolio', sub: 'Risk, Ledger & Watchlist' },
          { id: 'RESEARCH', label: '5. Research', sub: 'Thematic & Strategy' },
          { id: 'AUDIT', label: '6. Audit & System', sub: 'Provenance & Settings' },
        ]}
        symbols={holdings.map(h => h.symbol).filter(Boolean)}
        onSelectTab={(tabId) => setActiveTab(tabId as any)}
        onSelectSymbol={(sym) => setSelectedIntelligenceSymbol(sym)}
      />

      <div className="flex-1 flex flex-col lg:flex-row pb-20 lg:pb-0 w-full">
        {/* Mobile Topbar — Dynamic Theme & Notch Safe */}
        <div className="lg:hidden sticky top-0 z-40 px-3 py-2 flex items-center justify-between border-b backdrop-blur-xl mobile-topbar-compact safe-area-top" style={{backgroundColor:'var(--bg-sidebar)',borderColor:'var(--border-card)'}}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white cursor-pointer transition-colors shrink-0"
              style={{ background: 'var(--bg-sidebar-active)' }}
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-cyan-400" />
            </button>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40">
              <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xs tracking-tight uppercase flex items-center gap-1 leading-none" style={{color:'var(--text-sidebar)'}}>
                NRI WealthOS
                <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">v3.0</span>
              </h2>
              <span className="text-[8.5px] font-mono tracking-wider block text-cyan-400/90 uppercase leading-tight">Samsung S24 Ultra</span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => setShowThemeModal(true)}
              className="p-1.5 rounded-lg text-xs cursor-pointer transition-all shrink-0 flex items-center justify-center min-w-[32px] min-h-[32px]"
              style={{background:'var(--bg-sidebar-active)',border:'1px solid var(--border-card)',color:'var(--accent-gold)'}}
              title="Customize Theme"
              aria-label="Customize Theme"
            >
              <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              onClick={handleWebPriceMatch}
              className="flex items-center gap-1 font-semibold px-2 py-1 rounded-lg text-xs cursor-pointer transition-all shrink-0 min-h-[32px]"
              style={{background:'var(--bg-sidebar-active)',border:'1px solid var(--border-card)',color:'var(--accent-gold)'}}
              title="Match prices from web"
              aria-label="Match Prices"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Match</span>
            </button>
            <div className="max-w-[125px] sm:max-w-[180px]">
              <MultiPortfolioSelect
                portfolios={portfolios}
                selectedPortfolio={selectedPortfolio}
                onChange={handlePortfolioSelect}
              />
            </div>
          </div>
        </div>

        {/* Mobile Slide-Out Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop Overlay */}
            <div 
              className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer Content */}
            <div 
              className="relative w-72 max-w-[80vw] h-full flex flex-col justify-between p-5 z-10 shadow-2xl overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-card)' }}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border-card)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/20 border border-cyan-500/40">
                      <Coins className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-white uppercase">NRI WealthOS</h3>
                      <span className="text-[9px] text-cyan-400 font-mono">Portable Hub</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Mobile Navigation List */}
                <nav className="space-y-1 font-mono text-xs">
                  {[
                    { id: 'OVERVIEW', label: '1. Overview', sub: 'System Status & Context', icon: Zap, color: 'text-cyan-400' },
                    { id: 'DISCOVER', label: '2. Discover', sub: 'Qualified Opportunities', icon: Search, color: 'text-amber-400' },
                    { id: 'ANALYZE', label: '3. Analyze', sub: 'Stock Intelligence View', icon: FileSpreadsheet, color: 'text-emerald-400' },
                    { id: 'PORTFOLIO', label: '4. Portfolio', sub: 'Risk, Ledger & Watchlist', icon: LayoutDashboard },
                    { id: 'RESEARCH', label: '5. Research', sub: 'Thematic & Strategy', icon: PieChartIcon },
                    { id: 'AUDIT', label: '6. Audit & System', sub: 'Provenance & Settings', icon: Wrench },
                  ].map(tab => {
                    const IconComp = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id as TabType);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer text-left"
                        style={isActive
                          ? { background: 'var(--bg-sidebar-active)', border: '1px solid var(--border-focus)', color: 'var(--accent-gold-light)' }
                          : { background: 'transparent', border: '1px solid transparent', color: 'var(--text-sidebar-muted)' }}
                      >
                        <IconComp className="w-4 h-4 shrink-0" style={{ color: isActive ? 'var(--accent-gold)' : 'var(--text-sidebar-muted)' }} />
                        <div>
                          <span className={`block font-bold ${tab.color || ''}`}>{tab.label}</span>
                          <span className="text-[10px] font-normal opacity-75">{tab.sub}</span>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Drawer Footer */}
              <div className="pt-4 border-t space-y-2" style={{ borderColor: 'var(--border-card)' }}>
                <button
                  onClick={() => { setShowThemeModal(true); setMobileMenuOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--bg-sidebar-active)', border: '1px solid var(--border-card)', color: 'var(--text-primary)' }}
                >
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Customize Skins & Themes</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Sidebar (Desktop) — Dynamic Theme & Layout Modes */}
        <aside 
          className={`hidden lg:flex ${
            activeLayout === 'obsidian-dock' ? 'lg:w-20 p-3 items-center' : activeLayout === 'sapphire-command' ? 'lg:w-64 p-4' : 'lg:w-68 p-5'
          } flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto a1-sidebar transition-all duration-300`} 
          style={{backgroundColor:'var(--bg-sidebar)',borderColor:'var(--border-card)'}}
        >
          <div className="space-y-6 w-full">
            {/* Branding Header */}
            <div className={`flex items-center ${activeLayout === 'obsidian-dock' ? 'justify-center' : 'gap-3 px-1'} py-2 border-b`} style={{borderColor:'var(--border-card)'}}>
              <div 
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 shadow-sm"
                title="NRI WealthOS Global Wealth & Tax"
              >
                <Coins className="w-5 h-5 text-cyan-400" />
              </div>
              {activeLayout !== 'obsidian-dock' && (
                <div className="sidebar-brand-title">
                  <h2 className="font-display font-bold text-sm tracking-tight leading-tight uppercase text-slate-100 flex items-center gap-1.5">
                    NRI WealthOS
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30 font-normal">v3.0</span>
                  </h2>
                  <span className="text-[10px] font-mono tracking-widest mt-0.5 block text-cyan-400/90 uppercase">Global Wealth & Tax</span>
                </div>
              )}
            </div>

            {/* Sidebar Navigation */}
            <nav className="space-y-1 w-full font-mono text-xs">
              {[
                { id: 'OVERVIEW', label: '1. Overview', sub: 'System Status & Context', icon: Zap, color: 'text-cyan-400' },
                { id: 'DISCOVER', label: '2. Discover', sub: 'Qualified Opportunities', icon: Search, color: 'text-amber-400' },
                { id: 'ANALYZE', label: '3. Analyze', sub: 'Stock Intelligence View', icon: FileSpreadsheet, color: 'text-emerald-400' },
                { id: 'PORTFOLIO', label: '4. Portfolio', sub: 'Risk, Ledger & Watchlist', icon: LayoutDashboard },
                { id: 'RESEARCH', label: '5. Research', sub: 'Thematic & Strategy', icon: PieChartIcon },
                { id: 'AUDIT', label: '6. Audit & System', sub: 'Provenance & Settings', icon: Wrench },
              ].map((tab) => {
                const IconComp = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    title={tab.label}
                    className={`sidebar-nav-btn w-full flex items-center ${activeLayout === 'obsidian-dock' ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'} rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer relative group`}
                    style={isActive
                      ? {background:'var(--bg-sidebar-active)',border:'1px solid var(--border-focus)',color:'var(--accent-gold-light)'}
                      : {background:'transparent',border:'1px solid transparent',color:'var(--text-sidebar-muted)'}}
                  >
                    <IconComp className="w-4 h-4 shrink-0" style={{color: isActive ? 'var(--accent-gold)' : 'var(--text-sidebar-muted)'}} />
                    {activeLayout !== 'obsidian-dock' ? (
                      <div className="sidebar-label text-left min-w-0">
                        <span className={`block font-bold truncate ${tab.color || ''}`}>{tab.label}</span>
                        <span className="sidebar-sub text-[10px] font-normal truncate block opacity-75">{tab.sub}</span>
                      </div>
                    ) : (
                      /* Hover floating tooltip for minimal dock */
                      <div className="absolute left-16 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                        <span className="block">{tab.label}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">{tab.sub}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="pt-4 space-y-3 w-full border-t" style={{borderColor:'var(--border-card)'}}>
            {/* Theme & Layout Quick Launcher Button */}
            <button
              onClick={() => setShowThemeModal(true)}
              className={`w-full flex items-center justify-center ${activeLayout === 'obsidian-dock' ? 'p-2.5' : 'gap-2 py-2 px-2'} rounded-xl text-[11px] font-bold transition-all cursor-pointer hover:brightness-110 active:scale-95 group relative`}
              style={{background:'var(--bg-sidebar-active)',border:'1px solid var(--border-card)',color:'var(--accent-gold-light)'}}
              title="Customize Layout & Visual Theme"
            >
              <Palette className="w-4 h-4" />
              {activeLayout !== 'obsidian-dock' && <span>Themes & Layouts</span>}
              {activeLayout === 'obsidian-dock' && (
                <div className="absolute left-16 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Themes & Layouts
                </div>
              )}
            </button>

            {userEmail && activeLayout !== 'obsidian-dock' && (
              <div className="p-2.5 rounded-xl space-y-2 sidebar-footer-extra" style={{background:'var(--bg-sidebar-active)',border:'1px solid var(--border-card)'}}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider" style={{color:'var(--text-sidebar-muted)'}}>Authenticated</span>
                  <ShieldCheck className="w-3.5 h-3.5" style={{color:'var(--accent-green)'}} />
                </div>
                <div className="text-xs font-mono truncate" style={{color:'var(--accent-gold)'}} title={userEmail}>
                  {userEmail}
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('app-auth-session');
                    localStorage.removeItem('app-auth-email');
                    setUserEmail(null);
                  }}
                  className="w-full text-[11px] py-1 rounded transition-all text-center cursor-pointer hover:underline"
                  style={{color:'var(--accent-red)'}}
                >
                  Sign Out (Google)
                </button>
              </div>
            )}
            {activeLayout !== 'obsidian-dock' && (
              <div className="space-y-1 sidebar-footer-extra">
                <a href="/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-1 text-[10px] font-semibold transition-colors hover:underline"
                  style={{color:'var(--accent-gold-light)'}}
                  id="sidebar-new-window-link"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open App in New Window
                </a>
                <div className="flex items-center gap-2 px-1 text-[10px] font-mono" style={{color:'#475569'}}>
                  <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{backgroundColor:'#059669'}}></span>
                  SQLite ENGINE: SECURE
                </div>
              </div>
            )}
          </div>
        </aside>


        {/* Content Container Canvas — Dynamic Theme & Smooth Touch Scrolling */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-[1720px] w-full mx-auto space-y-4 sm:space-y-6 min-w-0 pb-24 lg:pb-8">
          {/* Global Topbar / Workspace Control — High-Density Pro Command Bar */}
          <div className="flex flex-col gap-2 pb-2.5 mb-2" style={{borderBottom:'1px solid var(--border-card)'}}>
            {/* Top Tier: Title Breadcrumb & Scope Selectors */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 min-w-0">
              {/* Left: Clean, punchy breadcrumb with live status */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold whitespace-nowrap">NRI WealthOS</span>
                <span className="text-slate-500 font-mono">/</span>
                <h2 className="text-xs sm:text-sm font-bold font-display uppercase tracking-tight text-white whitespace-nowrap truncate" style={{color:'var(--text-primary)'}}>
                  {(activeTab === 'OVERVIEW' || activeTab === 'COMMAND_CENTER') && '1. Overview & System Status'}
                  {(activeTab === 'DISCOVER' || activeTab === 'OPPORTUNITY_ENGINE') && '2. Discover & Opportunity Generation'}
                  {(activeTab === 'ANALYZE' || activeTab === 'MASTER_DOSSIER' || activeTab === 'INTELLIGENCE') && '3. Analyze & Stock Intelligence'}
                  {(activeTab === 'PORTFOLIO') && '4. Portfolio Risk & Ledger'}
                  {(activeTab === 'RESEARCH' || activeTab === 'QUANT_TECHNICAL_STUDIO' || activeTab === 'QUANT_V5' || activeTab === 'TECHNICAL_STRATEGIES' || activeTab === 'MOMENTUM_VPA' || activeTab === 'GREENFIELD_PORTAL' || activeTab === 'MULTIBAGGER') && '5. Research & Strategy Factory'}
                  {(activeTab === 'AUDIT' || activeTab === 'SETTINGS' || activeTab === 'IMPORTS' || activeTab === 'LEDGER') && '6. Audit, Provenance & Settings'}
                  {activeTab === 'ANALYTICS' && 'Analytics & Risk'}
                  {activeTab === 'STRATEGY_EDITOR' && 'Strategy Parameter Editor'}
                  {activeTab === 'SENTINEL' && 'Smart Money Sentinel'}
                  {activeTab === 'REPORT_STUDIO' && 'Report Studio'}
                  {activeTab === 'TAX_REPATRIATION' && 'Tax & Repatriation'}
                  {activeTab === 'OPPORTUNITIES' && 'Opportunities & Drift'}
                  {activeTab === 'FAMILY' && 'Family Governance'}
                  {activeTab === 'MAPPINGS' && 'Scrip Mappings'}
                </h2>
                <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>

              {/* Right: Family Member & Portfolio Selectors */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <FamilyMemberSwitcher
                  currentMemberId={currentMemberId}
                  onSelectMember={handleMemberSelect}
                  onOpenManageModal={() => setActiveTab('SETTINGS')}
                />
                <MultiPortfolioSelect
                  portfolios={portfolios}
                  selectedPortfolio={selectedPortfolio}
                  onChange={handlePortfolioSelect}
                />
              </div>
            </div>

            {/* Bottom Tier: Sleek Single-Line Action Toolbar */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs font-mono">
              <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-2 truncate">
                <span className="text-slate-500 font-mono">WORKSPACE:</span>
                <span className="text-slate-300 font-bold">{selectedPortfolio === 'ALL' ? 'Consolidated Family Wealth' : selectedPortfolio}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{holdings.length} Scrips Tracked</span>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                {/* Alerts */}
                <button
                  type="button"
                  onClick={() => setShowAlertsModal(true)}
                  className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-amber-300 font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-amber-500/40"
                  title="View Smart Portfolio Alerts & Breakouts"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Alerts</span>
                  {alertsCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1 right-1" />
                  )}
                </button>

                {/* Risk & VaR */}
                <button
                  type="button"
                  onClick={() => setShowRiskModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/60 border border-purple-700/80 text-purple-300 font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-purple-500/40"
                  title="Open Institutional Risk Analytics & Stress Testing"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                  <span>Risk &amp; VaR</span>
                </button>

                {/* Snapshot */}
                <button
                  type="button"
                  onClick={() => setShowSnapshotModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/80 text-blue-400 font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-blue-500/40"
                  title="View Performance Snapshot (Cash In, Cash Out, Value, XIRR)"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>Snapshot</span>
                </button>

                {/* Reports Center */}
                <button
                  type="button"
                  onClick={() => setShowReportsModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-amber-400 font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-amber-500/40"
                  title="Open Institutional Reports Center"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reports</span>
                </button>

                {/* Quick Layout Mode Switcher Pill */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLayoutDropdown(!showLayoutDropdown)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-cyan-300 font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-cyan-500/40"
                    title="Switch Widescreen Layout"
                  >
                    <Columns className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono text-white text-[11px]">
                      {LAYOUT_OPTIONS.find(l => l.id === activeLayout)?.shortName || 'Layout'}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>
                  {showLayoutDropdown && (
                    <div 
                      className="absolute right-0 mt-1.5 w-64 rounded-2xl border shadow-2xl p-1.5 z-50 space-y-1 backdrop-blur-xl"
                      style={{ background: 'var(--bg-modal)', borderColor: 'var(--border-card)' }}
                    >
                      <div className="px-2 py-1 border-b text-[10px] uppercase font-bold font-mono" style={{ borderColor: 'var(--border-card)', color: 'var(--text-muted)' }}>
                        Select Widescreen Layout
                      </div>
                      {LAYOUT_OPTIONS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            applyLayout(l.id);
                            setActiveLayout(l.id);
                            setShowLayoutDropdown(false);
                            if (l.recommendedTheme) applyTheme(l.recommendedTheme);
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer"
                          style={activeLayout === l.id 
                            ? { background: 'var(--bg-sidebar-active)', border: '1px solid var(--border-focus)', color: 'var(--accent-gold-light)' }
                            : { background: 'transparent', color: 'var(--text-primary)' }}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.accentHex }} />
                              <span className="font-bold text-xs">{l.shortName}</span>
                            </div>
                            <span className="text-[10px] block opacity-75 font-mono ml-3.5" style={{ color: 'var(--text-muted)' }}>
                              {l.optionNumber} • {l.badge}
                            </span>
                          </div>
                          {activeLayout === l.id && <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent-gold)' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Theme & Colors */}
                <button
                  type="button"
                  onClick={() => setShowThemeModal(true)}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-emerald-400 transition-all cursor-pointer shadow-sm hover:border-emerald-500/40"
                  title="Change UI Design System Theme & Colors"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>

                {/* Preferences */}
                <button
                  type="button"
                  onClick={() => setShowPreferencesModal(true)}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition-all cursor-pointer shadow-sm hover:border-slate-500/40"
                  title="Configure Preferences (Lakhs/Millions, Sort, Decimals)"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {(activeTab === 'COMMAND_CENTER' || activeTab === 'OVERVIEW') && (
                <Suspense fallback={<LazyFallback />}>
                  <FamilyOfficeCommandCenter
                    currentMemberId={currentMemberId}
                    onSelectPortfolio={(pName) => {
                      handlePortfolioSelect(pName);
                    }}
                    onOpenScripIntelligence={(sym) => {
                      setSelectedIntelligenceSymbol(sym);
                    }}
                    onOpenPreferences={() => setShowPreferencesModal(true)}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              )}

              {activeTab === 'PORTFOLIO' && (
                <Suspense fallback={<LazyFallback />}>
                  <PortfolioHubView
                    metrics={metrics}
                    holdings={holdings}
                    portfolios={portfolios}
                    selectedPortfolio={selectedPortfolio}
                    setSelectedPortfolio={setSelectedPortfolio}
                    includeSold={includeSold}
                    setIncludeSold={setIncludeSold}
                    onRefreshPrices={handleSyncPrices}
                    onWebPriceMatch={handleWebPriceMatch}
                    onRecalculateFIFO={handleRecalculateFIFO}
                    growthHistory={growthHistory}
                    annualFyData={annualFyData}
                    benchmarkSymbol={benchmarkSymbol}
                    onBenchmarkChange={handleBenchmarkChange}
                    showStockDrilldown={(sym) => setSelectedStock(sym)}
                    formatCurrency={formatCurrency}
                    setActiveTab={setActiveTab}
                  />
                </Suspense>
              )}

              {(activeTab === 'MASTER_DOSSIER' || activeTab === 'ANALYZE') && (
                <Suspense fallback={<LazyFallback />}>
                  <MasterQuantDossier11TabsView />
                </Suspense>
              )}

              {(activeTab === 'DISCOVER' || activeTab === 'OPPORTUNITY_ENGINE' || activeTab === 'MULTIBAGGER' || activeTab === 'SENTINEL' || activeTab === 'MOMENTUM_VPA' || activeTab === 'GREENFIELD_PORTAL') && (
                <Suspense fallback={<LazyFallback />}>
                  <DiscoverWorkspace
                    initialSubTab={
                      activeTab === 'MULTIBAGGER' ? 'MULTIBAGGER' :
                      activeTab === 'SENTINEL' ? 'SENTINEL' :
                      activeTab === 'MOMENTUM_VPA' ? 'MOMENTUM_VPA' :
                      activeTab === 'GREENFIELD_PORTAL' ? 'GREENFIELD' :
                      'OPPORTUNITY_ENGINE'
                    }
                    onSelectStock={(sym) => setSelectedStock(sym)}
                    selectedPortfolio={selectedPortfolio}
                  />
                </Suspense>
              )}

              {(activeTab === 'RESEARCH' || activeTab === 'QUANT_TECHNICAL_STUDIO' || activeTab === 'QUANT_V5' || activeTab === 'TECHNICAL_STRATEGIES' || activeTab === 'MOMENTUM_VPA' || activeTab === 'GREENFIELD_PORTAL' || activeTab === 'REPORT_STUDIO') && (
                <Suspense fallback={<LazyFallback />}>
                  <ResearchWorkspace
                    initialSubTab={
                      activeTab === 'TECHNICAL_STRATEGIES' ? 'TECHNICAL' :
                      activeTab === 'REPORT_STUDIO' ? 'REPORTS' :
                      'QUANT_STUDIO'
                    }
                    currentMemberId={currentMemberId}
                    selectedPortfolio={selectedPortfolio}
                    portfolios={portfolios}
                    formatCurrency={formatCurrency}
                    showStockDrilldown={(sym) => setSelectedStock(sym)}
                    onSelectScrip={(sym) => setSelectedStock(sym)}
                  />
                </Suspense>
              )}

              {activeTab === 'FORENSIC_INTELLIGENCE' && (
                <Suspense fallback={<LazyFallback />}>
                  <ForensicIntelligenceMasterView />
                </Suspense>
              )}

              {activeTab === 'ANALYTICS' && (
                <Suspense fallback={<LazyFallback />}>
                  <InstitutionalAnalyticsHub
                    selectedPortfolio={selectedPortfolio}
                    setSelectedPortfolio={setSelectedPortfolio}
                    portfolios={portfolios}
                    formatCurrency={formatCurrency}
                    showStockDrilldown={(sym) => setSelectedStock(sym)}
                  />
                </Suspense>
              )}

              {(activeTab === 'SENTINEL' || activeTab === 'OPPORTUNITIES') && (
                <Suspense fallback={<LazyFallback />}>
                  <OpportunityHubView
                    selectedPortfolio={selectedPortfolio}
                    onSelectScrip={(sym) => setSelectedStock(sym)}
                  />
                </Suspense>
              )}

              {activeTab === 'STRATEGY_EDITOR' && (
                <Suspense fallback={<LazyFallback />}>
                  <StrategyParameterEditorView />
                </Suspense>
              )}

              {activeTab === 'REPORT_STUDIO' && (
                <Suspense fallback={<LazyFallback />}>
                  <ReportStudioView
                    currentMemberId={currentMemberId}
                    selectedPortfolio={selectedPortfolio}
                    portfolios={portfolios}
                    formatCurrency={formatCurrency}
                    showStockDrilldown={(sym) => setSelectedStock(sym)}
                  />
                </Suspense>
              )}

              {activeTab === 'TAX_REPATRIATION' && (
                <Suspense fallback={<LazyFallback />}>
                  <NriTaxRepatriationHub
                    selectedPortfolio={selectedPortfolio}
                    portfolios={portfolios}
                    currentMemberId={currentMemberId}
                  />
                </Suspense>
              )}

              {activeTab === 'FAMILY' && (
                <Suspense fallback={<LazyFallback />}>
                  <FamilyBenchmarkManagerView
                    portfolios={portfolios}
                    selectedPortfolio={selectedPortfolio}
                    onPortfolioChange={setSelectedPortfolio}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              )}

              {activeTab === 'MAPPINGS' && (
                <Suspense fallback={<LazyFallback />}>
                  <AssetScripMappingView />
                </Suspense>
              )}

              {activeTab === 'LEDGER' && (
                <Suspense fallback={<LazyFallback />}>
                  <LedgerHubView
                    selectedPortfolio={selectedPortfolio}
                    setSelectedPortfolio={setSelectedPortfolio}
                    portfolios={portfolios}
                    onAddTransaction={handleAddTransaction}
                    onEditTransaction={handleEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onBulkAction={handleBulkAction}
                    formatCurrency={formatCurrency}
                    onApplyPendingCorporateActions={handleApplyPendingCorporateActions}
                    onAddCorporateAction={handleAddCorporateAction}
                    onEditCorporateAction={handleEditCorporateAction}
                    onDeleteCorporateAction={handleDeleteCorporateAction}
                  />
                </Suspense>
              )}

              {activeTab === 'IMPORTS' && (
                <Suspense fallback={<LazyFallback />}>
                  <ImportsHubView
                    portfolios={portfolios}
                    pmsPortfolios={pmsPortfolios}
                    selectedPortfolio={selectedPortfolio}
                    onPortfolioChange={setSelectedPortfolio}
                    onValidateBulk={handleBulkValidateUpload}
                    onCommitBulk={handleBulkCommitUpload}
                    onUndoBatch={handleUndoBatchRollback}
                    onReconcile={handleReconcileUpload}
                    onPMSUpload={handlePMSUpload}
                    onAddTransaction={handleAddTransaction}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              )}

              {activeTab === 'INTELLIGENCE' && (
                <div className="p-4 max-w-[1600px] mx-auto space-y-6">
                  <Suspense fallback={<LazyFallback />}>
                    <StockDossierView
                      symbol={selectedIntelligenceSymbol || 'HAL'}
                      isOpen={false}
                      formatCurrency={formatCurrency}
                    />
                  </Suspense>
                </div>
              )}

              {selectedIntelligenceSymbol && (
                <Suspense fallback={<LazyFallback />}>
                  <StockIntelligenceView
                    symbol={selectedIntelligenceSymbol}
                    onClose={() => setSelectedIntelligenceSymbol(null)}
                  />
                </Suspense>
              )}

              {(activeTab === 'SETTINGS' || activeTab === 'AUDIT' || activeTab === 'IMPORTS' || activeTab === 'MAPPINGS' || activeTab === 'FAMILY' || activeTab === 'TAX_REPATRIATION') && (
                <Suspense fallback={<LazyFallback />}>
                  <AuditWorkspace
                    initialSubTab={
                      activeTab === 'IMPORTS' ? 'IMPORTS' :
                      activeTab === 'MAPPINGS' ? 'MAPPINGS' :
                      activeTab === 'FAMILY' ? 'FAMILY' :
                      activeTab === 'TAX_REPATRIATION' ? 'TAX' :
                      'SETTINGS'
                    }
                    showToast={showToast}
                    triggerLoader={triggerLoader}
                    onAddTicker={handleAddTicker}
                    onEditTicker={handleEditTicker}
                    onDeleteTicker={handleDeleteTicker}
                    onMergeTickers={handleMergeTickers}
                    formatCurrency={formatCurrency}
                    onPurgeBankBook={handlePurgeBankBook}
                    onPurgeTransactions={handlePurgeTransactionsOnly}
                    onPurgeEverything={handlePurgeEverythingFull}
                    portfolios={portfolios}
                    pmsPortfolios={pmsPortfolios}
                    selectedPortfolio={selectedPortfolio}
                    onPortfolioChange={setSelectedPortfolio}
                    onDataChanged={refreshAllCoreData}
                    onValidateBulk={handleBulkValidateUpload}
                    onCommitBulk={handleBulkCommitUpload}
                    onUndoBatch={handleUndoBatchRollback}
                    onReconcile={handleReconcileUpload}
                    onPMSUpload={handlePMSUpload}
                    onAddTransaction={handleAddTransaction}
                    currentMemberId={currentMemberId}
                  />
                </Suspense>
              )}

              {/* Not Found Recovery — explicit page for any unknown tab/route */}
              {![
                'OVERVIEW', 'COMMAND_CENTER', 'PORTFOLIO', 'MASTER_DOSSIER', 'ANALYZE',
                'DISCOVER', 'OPPORTUNITY_ENGINE', 'MULTIBAGGER', 'SENTINEL', 'MOMENTUM_VPA', 'GREENFIELD_PORTAL',
                'RESEARCH', 'QUANT_TECHNICAL_STUDIO', 'QUANT_V5', 'TECHNICAL_STRATEGIES', 'REPORT_STUDIO',
                'AUDIT', 'SETTINGS', 'IMPORTS', 'MAPPINGS', 'FAMILY', 'TAX_REPATRIATION',
                'FORENSIC_INTELLIGENCE', 'ANALYTICS', 'STRATEGY_EDITOR', 'SENTINEL', 'OPPORTUNITIES', 'LEDGER', 'INTELLIGENCE'
              ].includes(activeTab) && (
                <Suspense fallback={<LazyFallback />}>
                  <NotFoundRecoveryView
                    unknownRoute={activeTab}
                    availableWorkspaces={[
                      { id: 'OVERVIEW', label: '1. Overview', sub: 'System Status & Context' },
                      { id: 'DISCOVER', label: '2. Discover', sub: 'Qualified Opportunities' },
                      { id: 'ANALYZE', label: '3. Analyze', sub: 'Stock Intelligence View' },
                      { id: 'PORTFOLIO', label: '4. Portfolio', sub: 'Risk, Ledger & Watchlist' },
                      { id: 'RESEARCH', label: '5. Research', sub: 'Thematic & Strategy' },
                      { id: 'AUDIT', label: '6. Audit & System', sub: 'Provenance & Settings' },
                    ]}
                    onNavigate={(id) => setActiveTab(id as any)}
                  />
                </Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Pro 3-Pane Right-Side Live Stream Drawer (Option 2: Sapphire Command layout) */}
        {activeLayout === 'sapphire-command' && (
          <CommandCenterRightDrawer
            isOpen={isRightDrawerOpen}
            onToggle={() => setIsRightDrawerOpen(!isRightDrawerOpen)}
            holdings={holdings}
            metrics={metrics}
            onSelectStock={(sym) => setSelectedStock(sym)}
          />
        )}
      </div>

      {/* Granular Sub-Lot drilldown popup */}
      {selectedStock && (
        <StockDrilldown
          symbol={selectedStock}
          onClose={() => setSelectedStock(null)}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Unified Mobile Bottom Navigation Bar (Fast 1-Tap Switching on Phone/Termux) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-1 py-1 flex items-center justify-around shadow-2xl safe-area-pb">
        <button
          onClick={() => { setActiveTab('COMMAND_CENTER'); setShowMobileMenu(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            activeTab === 'COMMAND_CENTER'
              ? 'text-cyan-400 font-bold bg-cyan-500/15 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Command Center"
        >
          <Zap className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">Command</span>
        </button>

        <button
          onClick={() => { setActiveTab('PORTFOLIO'); setShowMobileMenu(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            activeTab === 'PORTFOLIO'
              ? 'text-cyan-400 font-bold bg-cyan-500/15 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Portfolio Net Worth"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">Net Worth</span>
        </button>

        <button
          onClick={() => { setActiveTab('OPPORTUNITY_ENGINE'); setShowMobileMenu(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            activeTab === 'OPPORTUNITY_ENGINE'
              ? 'text-cyan-400 font-bold bg-cyan-500/15 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Opportunity Engine"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">Engine</span>
        </button>

        <button
          onClick={() => { setActiveTab('TAX_REPATRIATION'); setShowMobileMenu(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            activeTab === 'TAX_REPATRIATION'
              ? 'text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Tax and Repatriation"
        >
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">Tax/FEMA</span>
        </button>

        <button
          onClick={() => { setActiveTab('LEDGER'); setShowMobileMenu(false); }}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            activeTab === 'LEDGER'
              ? 'text-indigo-400 font-bold bg-indigo-500/15 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Trades Ledger"
        >
          <Receipt className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">Ledger</span>
        </button>

        <button
          onClick={() => setShowMobileMenu(prev => !prev)}
          className={`flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl transition-all cursor-pointer min-w-[50px] ${
            showMobileMenu
              ? 'text-slate-100 font-bold bg-slate-800 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="More Operations Menu"
        >
          <Menu className="w-4 h-4" />
          <span className="text-[9px] tracking-tight font-semibold">More...</span>
        </button>
      </nav>

      {/* Mobile More Quick-Access Bottom Sheet Drawer */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col justify-end"
            onClick={() => setShowMobileMenu(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 space-y-4 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-sm uppercase">NRI WealthOS Operations</h3>
                </div>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => { setActiveTab('OPPORTUNITY_ENGINE'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'OPPORTUNITY_ENGINE'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold">Opportunity Engine</span>
                  <span className="text-[10px] text-slate-400">Convergence, Sentinel & 10X</span>
                </button>

                <button
                  onClick={() => { setActiveTab('IMPORTS'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'IMPORTS'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Imports & CAMS</span>
                  <span className="text-[10px] text-slate-400">17 Broker Templates</span>
                </button>

                <button
                  onClick={() => { setActiveTab('INTELLIGENCE'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'INTELLIGENCE'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <BarChart4 className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold">Scrip 360</span>
                  <span className="text-[10px] text-slate-400">Screener & Concalls</span>
                </button>

                <button
                  onClick={() => { setActiveTab('FAMILY'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'FAMILY'
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold">Family & Entities</span>
                  <span className="text-[10px] text-slate-400">Benchmarks & Units</span>
                </button>

                <button
                  onClick={() => { setActiveTab('MAPPINGS'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'MAPPINGS'
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <FolderSync className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold">Scrip Mappings</span>
                  <span className="text-[10px] text-slate-400">Alias Resolver</span>
                </button>

                <button
                  onClick={() => { setActiveTab('SETTINGS'); setShowMobileMenu(false); }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                    activeTab === 'SETTINGS'
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Wrench className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-semibold">Masters & Settings</span>
                  <span className="text-[10px] text-slate-400">Tickers, FDs & Portfolios</span>
                </button>

                <button
                  onClick={() => { setShowReportsModal(true); setShowMobileMenu(false); }}
                  className="p-3 rounded-xl border bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 text-left flex flex-col gap-1 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Institutional Reports</span>
                  <span className="text-[10px] text-slate-400">Excel / PDF Audits</span>
                </button>

                <button
                  onClick={() => { setShowAlertsModal(true); setShowMobileMenu(false); }}
                  className="p-3 rounded-xl border bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 text-left flex flex-col gap-1 cursor-pointer"
                >
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Portfolio Alerts</span>
                  <span className="text-[10px] text-slate-400">Breakouts & 52W Highs</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => { setShowSnapshotModal(true); setShowMobileMenu(false); }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-900/40 border border-blue-700/60 text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Snapshot
                </button>
                <button
                  onClick={() => { setShowPreferencesModal(true); setShowMobileMenu(false); }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Preferences
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Web Price Matcher Confirmation Modal */}
      {webMatchConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-100 text-base">🌐 Confirm Web & Zerodha Price Match</h3>
                <span className="text-xs text-slate-400">Official Exchange (NSE/BSE) & Google Search Feed Verification</span>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                <Info className="w-4 h-4 shrink-0" />
                <span>Confirm Stock Price Synchronization</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The system will query Google Search and official Exchange feeds to verify closing prices for your active stock holdings in <strong className="text-white">{webMatchConfirmModal.targetPortfolio}</strong>.
              </p>
            </div>

            {webMatchConfirmModal.activeTickers.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Active stock holdings to be verified ({webMatchConfirmModal.activeTickers.length} tickers):
                </span>
                <div className="max-h-36 overflow-y-auto p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex flex-wrap gap-1.5">
                  {webMatchConfirmModal.activeTickers.map((sym) => (
                    <span key={sym} className="px-2.5 py-1 bg-slate-850 border border-slate-700/60 text-slate-200 rounded-lg font-mono text-xs font-semibold">
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
                Notice: No active equity stock holdings were detected in the selected portfolio view ({webMatchConfirmModal.targetPortfolio}).
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                onClick={() => setWebMatchConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWebPriceMatch}
                disabled={webMatchConfirmModal.activeTickers.length === 0}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <Globe className="w-4 h-4" />
                <span>Confirm & Update Prices Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ThemeSelectorModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
      />

      <Suspense fallback={null}>
        <PerformanceSnapshotModal
          isOpen={showSnapshotModal}
          onClose={() => setShowSnapshotModal(false)}
          selectedPortfolio={selectedPortfolio}
          formatCurrency={formatCurrency}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ReportsEngineModal
          isOpen={showReportsModal}
          onClose={() => setShowReportsModal(false)}
          selectedPortfolio={selectedPortfolio}
          portfolios={portfolios}
          formatCurrency={formatCurrency}
          onOpenReportStudio={() => setActiveTab('REPORT_STUDIO')}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SmartAlertsModal
          isOpen={showAlertsModal}
          onClose={() => setShowAlertsModal(false)}
          onSelectScrip={(sym) => {
            setSelectedIntelligenceSymbol(sym);
          }}
        />
      </Suspense>

      <Suspense fallback={null}>
        <RiskAnalyticsModal
          isOpen={showRiskModal}
          onClose={() => setShowRiskModal(false)}
          selectedPortfolio={selectedPortfolio}
          formatCurrency={formatCurrency}
        />
      </Suspense>

      <PreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        onPreferencesUpdated={() => {
          fetchHoldingsList();
        }}
      />
    </div>
  );
}

// ─── Scrip Search Bar Component ────────────────────────────────────────────────
function ScripSearchBar({ onAnalyze }: { onAnalyze: (symbol: string) => void }) {
  const [query, setQuery] = React.useState('');

  const handleSubmit = () => {
    const sym = query.trim().toUpperCase().replace(/\s+/g, '');
    if (sym) {
      onAnalyze(sym);
      setQuery('');
    }
  };

  const suggestions = ['RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'SBIN', 'ICICIBANK', 'BAJFINANCE', 'NIFTY 50', 'SENSEX'];

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.08) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '1.5rem',
        padding: '2rem',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--text-primary, #f1f5f9)', fontWeight: 800, fontSize: '1.25rem', margin: 0 }}>
          🔍 Analyze Any Scrip
        </h2>
        <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Enter any NSE symbol to run full AI intelligence — technicals, fundamentals &amp; sentiment
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. RELIANCE, HDFCBANK, TCS, INFY..."
          style={{
            flex: 1,
            background: 'rgba(15,23,42,0.7)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: '0.75rem',
            padding: '0.75rem 1rem',
            color: '#f1f5f9',
            fontSize: '1rem',
            fontWeight: 600,
            outline: 'none',
            letterSpacing: '0.05em',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim()}
          style={{
            background: query.trim() ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(99,102,241,0.2)',
            border: 'none',
            borderRadius: '0.75rem',
            padding: '0.75rem 1.75rem',
            color: query.trim() ? '#fff' : '#6366f1',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: query.trim() ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            boxShadow: query.trim() ? '0 4px 20px rgba(99,102,241,0.35)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Analyze →
        </button>
      </div>

      {/* Quick suggestion chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b', alignSelf: 'center', marginRight: '0.25rem' }}>Quick:</span>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onAnalyze(s.replace(/\s+/g, ''))}
            style={{
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
              color: '#a5b4fc',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.25)';
              (e.currentTarget as HTMLElement).style.color = '#c7d2fe';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.1)';
              (e.currentTarget as HTMLElement).style.color = '#a5b4fc';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

