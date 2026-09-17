import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Check, 
  Sparkles, 
  X, 
  Shield, 
  Eye, 
  Layers, 
  Zap, 
  Sun, 
  Moon, 
  Terminal, 
  Crown, 
  SlidersHorizontal,
  LayoutGrid,
  Columns,
  Maximize2,
  RefreshCw,
  CheckCircle2,
  Sliders,
  SlidersVertical
} from 'lucide-react';

export type ThemeId =
  | 'institutional-light'
  | 'midnight-emerald'
  | 'titanium-gold'
  | 'obsidian-noir'
  | 'bloomberg-terminal'
  | 'deep-sapphire'
  | 'cyber-matrix'
  | 'amethyst-executive'
  | 'aurora-wealth'
  | 'sunset-horizon'
  | 'tokyo-neon'
  | 'monochrome-pro'
  | 'light-platinum'
  | 'arctic-frost'
  | 'warm-ivory'
  | 'azure-sky'
  | 'executive-navy-light';

export type ThemeCategory = 'all' | 'dark' | 'trading' | 'light';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  category: 'dark' | 'trading' | 'light';
  tagline: string;
  description: string;
  bgHex: string;
  accentHex: string;
  secondaryHex: string;
  borderHex: string;
  fontDisplay: string;
  cardRadius: string;
  previewGradient: string;
  isFlagship?: boolean;
}

// ── Selectable Layout Options (Phases 0–7 UI Revamp) ──
export type LayoutOptionId = 
  | 'obsidian-dock'
  | 'sapphire-command'
  | 'emerald-frost'
  | 'aurora-cockpit'
  | 'classic-standard';

export interface LayoutOption {
  id: LayoutOptionId;
  optionNumber: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  recommendedTheme: ThemeId;
  badge: string;
  accentHex: string;
  features: string[];
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'obsidian-dock',
    optionNumber: 'Option 1',
    name: 'Obsidian Noir (Minimal 72px Icon Dock)',
    shortName: 'Obsidian Dock',
    tagline: 'Ultra-thin 72px icon dock navigation with expansive widescreen dashboard',
    description: 'Collapses desktop sidebar to a sleek 72px icon dock with hover tooltips. Maximizes screen canvas for dense analytics, Swiss private luxury aesthetic.',
    recommendedTheme: 'obsidian-noir',
    badge: 'Minimal Dock',
    accentHex: '#D4A843',
    features: ['72px Ultra-thin icon dock', 'Hover tooltip navigation', 'Expanded 1920px canvas', 'Zero clutter view']
  },
  {
    id: 'sapphire-command',
    optionNumber: 'Option 2',
    name: 'Sapphire Command (Pro 3-Pane Trading Desk)',
    shortName: 'Sapphire 3-Pane',
    tagline: 'Multi-pane trading desk with collapsible right-side live holdings feed',
    description: 'Features a structured 220px sidebar, central analytical hub, plus a dedicated collapsible right-side Live Stream drawer for real-time tickers and top movers.',
    recommendedTheme: 'deep-sapphire',
    badge: '3-Pane Desk',
    accentHex: '#3B82F6',
    features: ['3-Pane Workstation', 'Right Live Holdings Feed', 'Collapsible Side Stream', 'Pro analytical density']
  },
  {
    id: 'emerald-frost',
    optionNumber: 'Option 3',
    name: 'Emerald Frost (Executive Daylight Light Mode)',
    shortName: 'Emerald Frost',
    tagline: 'Crisp white cards, subtle drop shadows, and color status indicators',
    description: 'Daylight executive mode with white card elevation, emerald gain indicators, clean breadcrumbs, and zero visual eye fatigue for day-long work.',
    recommendedTheme: 'institutional-light',
    badge: 'Executive Light',
    accentHex: '#059669',
    features: ['Crisp white card elevation', 'Emerald status indicator strips', 'High-contrast daylight theme', 'Ergonomic long-session view']
  },
  {
    id: 'aurora-cockpit',
    optionNumber: 'Option 4',
    name: 'Aurora Wealth (Vibrant Fintech Cockpit)',
    shortName: 'Aurora Cockpit',
    tagline: 'Deep violet gradient canvas with neon glows and radial meters',
    description: 'Cutting-edge fintech look inspired by modern quantitative cockpits with glowing pill actions, violet translucent cards, and radiant progress rings.',
    recommendedTheme: 'aurora-wealth',
    badge: 'Fintech Cockpit',
    accentHex: '#8B5CF6',
    features: ['Glowing neon pill buttons', 'Radial progress rings', 'Translucent glassmorphism', 'Futuristic violet aesthetics']
  },
  {
    id: 'classic-standard',
    optionNumber: 'Classic',
    name: 'Classic Full Sidebar (Default Layout)',
    shortName: 'Classic Standard',
    tagline: 'Standard 256px wide navigation sidebar with complete labels & sub-labels',
    description: 'The familiar original layout with full navigation text labels, sub-headers, and classic views.',
    recommendedTheme: 'institutional-light',
    badge: 'Standard',
    accentHex: '#0F62FE',
    features: ['256px full sidebar', 'Explicit sub-label details', 'Classic desktop workflow', 'Full breadcrumb view']
  }
];

export const THEME_OPTIONS: ThemeOption[] = [
  // ── 0. Option 1 Flagship: Obsidian Noir & Champagne Gold ──
  {
    id: 'obsidian-noir',
    name: 'Option 1: Obsidian Noir & Champagne Gold',
    category: 'dark',
    tagline: 'Ultra-Luxury Swiss Private Wealth Terminal',
    description: 'OLED black canvas (#0A0A0F) with warm champagne gold accents (#D4A843), emerald gains, glassmorphic cards, and minimal visual noise.',
    bgHex: '#0A0A0F',
    accentHex: '#D4A843',
    secondaryHex: '#E5C378',
    borderHex: '#D4A84340',
    fontDisplay: 'Outfit / Inter',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-black via-zinc-950 to-amber-950/40',
    isFlagship: true
  },
  // ── 1. Option 2: Wall Street Sapphire & Navy ──
  {
    id: 'deep-sapphire',
    name: 'Option 2: Sapphire Command & Navy',
    category: 'dark',
    tagline: 'Global Investment Banking & Trading Terminal',
    description: 'Deep naval sapphire canvas with royal electric blue highlights (#3B82F6) and arctic cyan indicators. High-trust institutional feel.',
    bgHex: '#070B19',
    accentHex: '#3B82F6',
    secondaryHex: '#38BDF8',
    borderHex: '#3B82F640',
    fontDisplay: 'Plus Jakarta Sans',
    cardRadius: '1.125rem (Pill Soft)',
    previewGradient: 'from-slate-950 via-blue-950 to-sky-950/40',
    isFlagship: true
  },
  // ── 2. Option 3: Institutional Light (Sovereign Navy & Emerald) ──
  {
    id: 'institutional-light',
    name: 'Option 3: Emerald Frost (Institutional Light)',
    category: 'light',
    tagline: 'Tier-1 Institutional FinTech & Private Wealth Operating System',
    description: 'Light-surface, high-contrast, zero visual noise. Sovereign Navy (#0B3D91), accessible emerald (#0F7A4E), deep carmine (#B3261E), shadow-based elevation.',
    bgHex: '#F7F8FA',
    accentHex: '#0B3D91',
    secondaryHex: '#0F7A4E',
    borderHex: '#CBD2DC',
    fontDisplay: 'Inter / JetBrains Mono',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-slate-100 via-blue-50 to-emerald-50/60',
    isFlagship: true
  },
  // ── 3. Option 4: Aurora Wealth Futuristic Cockpit ──
  {
    id: 'aurora-wealth',
    name: 'Option 4: Aurora Wealth Futuristic Cockpit',
    category: 'dark',
    tagline: 'Palantir & Fintech Pro Radial Cockpit',
    description: 'Deep violet gradient canvas (#0F0A1E) with electric violet (#8B5CF6), cyber cyan (#06B6D4), and luminous card glows.',
    bgHex: '#0F0A1E',
    accentHex: '#8B5CF6',
    secondaryHex: '#06B6D4',
    borderHex: '#8B5CF640',
    fontDisplay: 'Outfit / Space Grotesk',
    cardRadius: '1.25rem (Futuristic)',
    previewGradient: 'from-purple-950 via-violet-950 to-cyan-950/40',
    isFlagship: true
  },
  // ── Other Institutional Dark Themes ──
  {
    id: 'midnight-emerald',
    name: 'Midnight Obsidian & Emerald',
    category: 'dark',
    tagline: 'Institutional Hedge Fund Suite',
    description: 'Deep obsidian backdrop with glowing emerald & cyber cyan accents. Multi-layer glass cards and crisp typography.',
    bgHex: '#020617',
    accentHex: '#10B981',
    secondaryHex: '#06B6D4',
    borderHex: '#1E293B',
    fontDisplay: 'Space Grotesk / Inter',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-slate-950 via-slate-900 to-emerald-950/40'
  },
  {
    id: 'titanium-gold',
    name: 'Titanium Carbon & Champagne Gold',
    category: 'dark',
    tagline: 'Luxury Private Wealth & Family Office',
    description: 'Pitch black OLED canvas with warm champagne gold foil borders and titanium accents. Ultra-high dynamic contrast.',
    bgHex: '#050505',
    accentHex: '#F59E0B',
    secondaryHex: '#818CF8',
    borderHex: '#F59E0B33',
    fontDisplay: 'Outfit / Sans',
    cardRadius: '0.875rem (Classic)',
    previewGradient: 'from-black via-zinc-950 to-amber-950/30'
  },
  {
    id: 'amethyst-executive',
    name: 'Royal Velvet & Imperial Amethyst',
    category: 'dark',
    tagline: 'Ultra-Luxury Private Equity Suite',
    description: 'Deep violet-charcoal glass cards with vivid imperial amethyst borders and platinum silver typography.',
    bgHex: '#0B0813',
    accentHex: '#A855F7',
    secondaryHex: '#C084FC',
    borderHex: '#A855F740',
    fontDisplay: 'Outfit / Inter',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-zinc-950 via-purple-950 to-violet-950/40'
  },
  {
    id: 'sunset-horizon',
    name: 'Sunset Bronze & Copper Glow',
    category: 'dark',
    tagline: 'Warm Heritage Luxury & Sovereign Fund',
    description: 'Espresso brown velvet background with rich metallic bronze, sunset copper highlights, and warm golden cards.',
    bgHex: '#100A08',
    accentHex: '#FB923C',
    secondaryHex: '#F97316',
    borderHex: '#F9731640',
    fontDisplay: 'Inter / Space Grotesk',
    cardRadius: '0.875rem (Classic)',
    previewGradient: 'from-stone-950 via-amber-950 to-orange-950/40'
  },
  {
    id: 'tokyo-neon',
    name: 'Tokyo Cyber Synthwave',
    category: 'dark',
    tagline: 'Futuristic High-Tech Portfolio Cockpit',
    description: 'Midnight dark indigo glass with glowing electric magenta, cyan, and violet holographic accents.',
    bgHex: '#090714',
    accentHex: '#EC4899',
    secondaryHex: '#06B6D4',
    borderHex: '#EC489940',
    fontDisplay: 'Space Grotesk',
    cardRadius: '1.25rem (Futuristic)',
    previewGradient: 'from-purple-950 via-pink-950 to-cyan-950/30'
  },

  // ── Trading & High Contrast Terminals ──
  {
    id: 'bloomberg-terminal',
    name: 'Bloomberg Pro Trading Terminal',
    category: 'trading',
    tagline: 'Wall Street Trading Desk & Live Monitor',
    description: 'Ultra-high-contrast amber & orange phosphor typography on deep charcoal tiles with monospace numeric precision.',
    bgHex: '#0A0D12',
    accentHex: '#FF9500',
    secondaryHex: '#FFB340',
    borderHex: '#FF950040',
    fontDisplay: 'JetBrains Mono',
    cardRadius: '0.5rem (Sharp)',
    previewGradient: 'from-slate-950 via-zinc-900 to-amber-950/50'
  },
  {
    id: 'cyber-matrix',
    name: 'Cyberpunk Matrix & Neon Lime',
    category: 'trading',
    tagline: 'High-Frequency Quantitative Engine',
    description: 'Pure black carbon cockpit with blazing cyber-lime laser accents and neon green metric pulses.',
    bgHex: '#040806',
    accentHex: '#00FF88',
    secondaryHex: '#10B981',
    borderHex: '#00FF8840',
    fontDisplay: 'Space Grotesk / Mono',
    cardRadius: '0.75rem (Tactical)',
    previewGradient: 'from-black via-zinc-950 to-emerald-950/40'
  },
  {
    id: 'monochrome-pro',
    name: 'Swiss Carbon Monochrome Pro',
    category: 'trading',
    tagline: 'Distraction-Free Minimalist Greyscale',
    description: 'Clean stark greyscale with subtle contrast ratios, zero saturated colors except pure green & red execution badges.',
    bgHex: '#000000',
    accentHex: '#FFFFFF',
    secondaryHex: '#D4D4D4',
    borderHex: '#333333',
    fontDisplay: 'Inter / JetBrains Mono',
    cardRadius: '0.375rem (Minimal)',
    previewGradient: 'from-black via-zinc-900 to-zinc-950'
  },

  // ── Daylight Executive Light Themes ──
  {
    id: 'light-platinum',
    name: 'Goldman Sachs Platinum Light',
    category: 'light',
    tagline: 'Executive Corporate Light & Titanium Slate',
    description: 'Crisp snow-white content canvas with slate framing, champagne brass accents, and subtle elevation drop shadows.',
    bgHex: '#F1F5F9',
    accentHex: '#B8912A',
    secondaryHex: '#059669',
    borderHex: '#CBD5E1',
    fontDisplay: 'Inter / Outfit',
    cardRadius: '0.875rem (Classic)',
    previewGradient: 'from-slate-50 via-zinc-100 to-amber-50/50'
  },
  {
    id: 'arctic-frost',
    name: 'Nordic Alpine Frost Light',
    category: 'light',
    tagline: 'Polar White Canvas with Mint Emerald Accents',
    description: 'Brilliant arctic white surfaces with refreshing mint-emerald highlights and slate blue typography.',
    bgHex: '#F0FDF4',
    accentHex: '#059669',
    secondaryHex: '#0D9488',
    borderHex: '#BBF7D0',
    fontDisplay: 'Plus Jakarta Sans',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-emerald-50 via-teal-50 to-cyan-50'
  },
  {
    id: 'warm-ivory',
    name: 'Warm Ivory & Sandstone Luxury',
    category: 'light',
    tagline: 'Heritage Swiss Private Bank Paper Style',
    description: 'Warm textured ivory linen canvas with rich bronze-amber typography and soft cashmere card elevation.',
    bgHex: '#FDFBF7',
    accentHex: '#B45309',
    secondaryHex: '#78350F',
    borderHex: '#E7E5E4',
    fontDisplay: 'Outfit / Sans',
    cardRadius: '0.875rem (Classic)',
    previewGradient: 'from-amber-50/60 via-stone-50 to-orange-50/40'
  },
  {
    id: 'azure-sky',
    name: 'Azure Sky — Royal Blue Sidebar',
    category: 'light',
    tagline: 'Corporate Light with Royal Blue Navigation',
    description: 'Crisp white content canvas with a rich royal Oxford-blue sidebar. Soft periwinkle backgrounds and electric blue accents.',
    bgHex: '#F0F4FF',
    accentHex: '#2563EB',
    secondaryHex: '#1A3A6B',
    borderHex: '#D6E4FF',
    fontDisplay: 'Inter / Space Grotesk',
    cardRadius: '1.0rem (Rounded)',
    previewGradient: 'from-blue-50 via-indigo-50 to-sky-50'
  }
];

// ── Custom Palette Overrides ──
export interface CustomPalette {
  accent?: string;
  accentLight?: string;
  bgCanvas?: string;
  borderTone?: string;
}

export function getCustomPalette(): CustomPalette {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem('portfolio_custom_palette');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function applyCustomPalette(palette: CustomPalette) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  if (palette.accent) {
    root.style.setProperty('--accent-gold', palette.accent);
    root.style.setProperty('--brand-pri', palette.accent);
    root.style.setProperty('--border-focus', palette.accent);
  } else {
    root.style.removeProperty('--accent-gold');
    root.style.removeProperty('--brand-pri');
    root.style.removeProperty('--border-focus');
  }

  if (palette.accentLight) {
    root.style.setProperty('--accent-gold-light', palette.accentLight);
  } else {
    root.style.removeProperty('--accent-gold-light');
  }

  if (palette.bgCanvas) {
    root.style.setProperty('--bg-app', palette.bgCanvas);
  } else {
    root.style.removeProperty('--bg-app');
  }

  if (palette.borderTone) {
    root.style.setProperty('--border-card', palette.borderTone);
  } else {
    root.style.removeProperty('--border-card');
  }

  localStorage.setItem('portfolio_custom_palette', JSON.stringify(palette));
  window.dispatchEvent(new CustomEvent('customPaletteChanged', { detail: palette }));
}

export function resetCustomPalette() {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  root.style.removeProperty('--accent-gold');
  root.style.removeProperty('--accent-gold-light');
  root.style.removeProperty('--brand-pri');
  root.style.removeProperty('--border-focus');
  root.style.removeProperty('--bg-app');
  root.style.removeProperty('--border-card');
  localStorage.removeItem('portfolio_custom_palette');
  window.dispatchEvent(new CustomEvent('customPaletteChanged', { detail: {} }));
}

export function getActiveThemeId(): ThemeId {
  if (typeof window === 'undefined') return 'institutional-light';
  const saved = localStorage.getItem('portfolio_theme') as ThemeId;
  if (saved && THEME_OPTIONS.some(t => t.id === saved)) return saved;
  return 'institutional-light';
}

export function applyTheme(themeId: ThemeId) {
  if (typeof window === 'undefined') return;
  document.documentElement.setAttribute('data-theme', themeId);
  const isLight = themeId.includes('light') || ['institutional-light', 'light-platinum', 'arctic-frost', 'warm-ivory', 'azure-sky', 'executive-navy-light'].includes(themeId);
  if (isLight) {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
  localStorage.setItem('portfolio_theme', themeId);

  // Re-apply any active custom palette overrides
  const custom = getCustomPalette();
  if (Object.keys(custom).length > 0) {
    applyCustomPalette(custom);
  }
}

export function getActiveLayoutId(): LayoutOptionId {
  if (typeof window === 'undefined') return 'classic-standard';
  const saved = localStorage.getItem('portfolio_layout') as LayoutOptionId;
  if (saved && LAYOUT_OPTIONS.some(l => l.id === saved)) return saved;
  return 'classic-standard';
}

export function applyLayout(layoutId: LayoutOptionId) {
  if (typeof window === 'undefined') return;
  document.documentElement.setAttribute('data-layout', layoutId);
  localStorage.setItem('portfolio_layout', layoutId);
  window.dispatchEvent(new CustomEvent('layoutChanged', { detail: { layoutId } }));
}

// ── Curated Color Swatches for 1-Click Accent Customization ──
const CURATED_PALETTES = [
  { name: 'Champagne Gold', hex: '#D4A843', light: '#E5C378', tag: 'Luxury Swiss' },
  { name: 'Electric Sapphire', hex: '#3B82F6', light: '#60A5FA', tag: 'Wall Street' },
  { name: 'Emerald Frost', hex: '#10B981', light: '#34D399', tag: 'High-Growth' },
  { name: 'Aurora Violet', hex: '#8B5CF6', light: '#A78BFA', tag: 'Fintech Neon' },
  { name: 'Arctic Cyan', hex: '#06B6D4', light: '#38BDF8', tag: 'Cyber Desk' },
  { name: 'Bloomberg Amber', hex: '#FF9500', light: '#FFB340', tag: 'Pro Trading' },
  { name: 'Ruby Rose', hex: '#F43F5E', light: '#FB7185', tag: 'Sovereign' },
  { name: 'Titanium Slate', hex: '#64748B', light: '#94A3B8', tag: 'Monochrome' },
];

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeChanged?: (themeId: ThemeId) => void;
  onLayoutChanged?: (layoutId: LayoutOptionId) => void;
}

export function ThemeSelectorModal({ isOpen, onClose, onThemeChanged, onLayoutChanged }: ThemeSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<'layouts' | 'themes' | 'palette'>('layouts');
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getActiveThemeId());
  const [activeLayout, setActiveLayout] = useState<LayoutOptionId>(getActiveLayoutId());
  const [selectedCategory, setSelectedCategory] = useState<ThemeCategory>('all');
  
  // Custom Color Palette state
  const [customPalette, setCustomPalette] = useState<CustomPalette>(getCustomPalette());

  useEffect(() => {
    setActiveTheme(getActiveThemeId());
    setActiveLayout(getActiveLayoutId());
    setCustomPalette(getCustomPalette());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectTheme = (themeId: ThemeId) => {
    setActiveTheme(themeId);
    applyTheme(themeId);
    if (onThemeChanged) onThemeChanged(themeId);
  };

  const handleSelectLayout = (layoutId: LayoutOptionId) => {
    setActiveLayout(layoutId);
    applyLayout(layoutId);
    if (onLayoutChanged) onLayoutChanged(layoutId);

    // Also optionally switch to the recommended theme for that layout
    const match = LAYOUT_OPTIONS.find(l => l.id === layoutId);
    if (match && match.recommendedTheme && match.recommendedTheme !== activeTheme) {
      handleSelectTheme(match.recommendedTheme);
    }
  };

  const handlePickPalette = (swatch: typeof CURATED_PALETTES[0]) => {
    const updated: CustomPalette = {
      ...customPalette,
      accent: swatch.hex,
      accentLight: swatch.light
    };
    setCustomPalette(updated);
    applyCustomPalette(updated);
  };

  const handleCustomColorChange = (field: keyof CustomPalette, value: string) => {
    const updated = { ...customPalette, [field]: value };
    setCustomPalette(updated);
    applyCustomPalette(updated);
  };

  const handleResetPalette = () => {
    resetCustomPalette();
    setCustomPalette({});
  };

  const darkThemes = THEME_OPTIONS.filter(t => t.category === 'dark');
  const tradingThemes = THEME_OPTIONS.filter(t => t.category === 'trading');
  const lightThemes = THEME_OPTIONS.filter(t => t.category === 'light');

  const renderThemeCard = (theme: ThemeOption) => {
    const isSelected = activeTheme === theme.id;
    return (
      <div
        key={theme.id}
        onClick={() => handleSelectTheme(theme.id)}
        className="relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group overflow-hidden hover:scale-[1.01]"
        style={{
          backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
          borderColor: isSelected ? 'var(--accent-gold)' : 'var(--border-card)',
          boxShadow: isSelected ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
          color: 'var(--text-primary)'
        }}
      >
        <div className="relative z-10 space-y-2.5">
          {/* Top Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                  {theme.name}
                </h4>
              </div>
              <span className="text-[10px] font-semibold block mt-0.5" style={{ color: theme.accentHex }}>
                {theme.tagline}
              </span>
            </div>
            {theme.isFlagship && !isSelected && (
              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs shrink-0 tracking-wider bg-blue-700 text-white">
                <Crown className="w-2.5 h-2.5" /> Flagship
              </span>
            )}
            {isSelected && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm shrink-0"
                style={{
                  background: 'var(--accent-green)',
                  color: '#000'
                }}
              >
                <Check className="w-3 h-3 stroke-[3]" /> Active
              </span>
            )}
          </div>

          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {theme.description}
          </p>

          {/* Color Swatches & Typography */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[9px] uppercase font-bold font-mono" style={{ color: 'var(--text-muted)' }}>
              Palette:
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-full border shadow-xs inline-block"
                style={{ backgroundColor: theme.bgHex, borderColor: 'var(--border-card)' }}
                title={`Background: ${theme.bgHex}`}
              />
              <span
                className="w-3.5 h-3.5 rounded-full border shadow-xs inline-block"
                style={{ backgroundColor: theme.accentHex, borderColor: 'var(--border-card)' }}
                title={`Accent: ${theme.accentHex}`}
              />
              <span
                className="w-3.5 h-3.5 rounded-full border shadow-xs inline-block"
                style={{ backgroundColor: theme.secondaryHex, borderColor: 'var(--border-card)' }}
                title={`Secondary: ${theme.secondaryHex}`}
              />
            </div>
            <span className="text-[9px] font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>
              {theme.fontDisplay.split('/')[0]}
            </span>
          </div>

          {/* Mini Live Preview */}
          <div
            className="p-2.5 rounded-xl border flex items-center justify-between font-mono text-[11px]"
            style={{
              background: 'var(--bg-table-alt)',
              borderColor: 'var(--border-card)'
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>AUM:</span>
            <span className="font-bold" style={{ color: theme.accentHex }}>
              ₹47.11 Cr
            </span>
            <span className="font-extrabold text-[10px]" style={{ color: 'var(--accent-green)' }}>
              +28.93%
            </span>
          </div>
        </div>

        {/* Apply Action Button */}
        <div
          className="relative z-10 mt-3 pt-2.5 border-t flex justify-end"
          style={{ borderColor: 'var(--border-card)' }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectTheme(theme.id);
            }}
            className="w-full py-1.5 rounded-xl text-xs font-bold font-sans transition-all cursor-pointer text-center"
            style={{
              background: isSelected ? 'var(--accent-gold)' : 'var(--bg-input)',
              color: isSelected ? '#000' : 'var(--text-primary)',
              border: '1px solid var(--border-card)'
            }}
          >
            {isSelected ? '✓ Active Theme' : 'Apply Theme'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-fadeIn">
      <div
        className="rounded-3xl w-full max-w-5xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl transition-all"
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-card)',
          color: 'var(--text-primary)'
        }}
      >
        {/* Modal Main Header */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 gap-3 border-b shrink-0"
          style={{
            borderColor: 'var(--border-card)',
            background: 'var(--bg-table-alt)'
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-2xl border flex items-center justify-center"
              style={{
                background: 'var(--accent-green-bg)',
                color: 'var(--accent-green)',
                borderColor: 'var(--border-card)'
              }}
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-display flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                Design Architecture & Color Studio
                <span
                  className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border"
                  style={{
                    background: 'var(--accent-gold)',
                    color: '#000',
                    borderColor: 'var(--border-card)'
                  }}
                >
                  4 Contemporary Layouts
                </span>
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Select between widescreen layout modes, switch curated institutional themes, or customize your live color palette.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors cursor-pointer self-end sm:self-auto hover:opacity-80"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-card)'
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Studio Tabs: Layouts | Themes | Color Palette */}
        <div
          className="px-6 py-2.5 border-b flex items-center gap-3 bg-[var(--bg-card)] shrink-0"
          style={{ borderColor: 'var(--border-card)' }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('layouts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'layouts' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              background: activeTab === 'layouts' ? 'var(--accent-gold)' : 'transparent',
              color: activeTab === 'layouts' ? '#000' : 'var(--text-primary)',
              border: activeTab === 'layouts' ? 'none' : '1px solid var(--border-card)'
            }}
          >
            <Columns className="w-4 h-4" />
            <span>1. Select Layout Mode (5 Styles)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'themes' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              background: activeTab === 'themes' ? 'var(--accent-gold)' : 'transparent',
              color: activeTab === 'themes' ? '#000' : 'var(--text-primary)',
              border: activeTab === 'themes' ? 'none' : '1px solid var(--border-card)'
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span>2. Curated Themes (16 Presets)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('palette')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'palette' ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            }`}
            style={{
              background: activeTab === 'palette' ? 'var(--accent-gold)' : 'transparent',
              color: activeTab === 'palette' ? '#000' : 'var(--text-primary)',
              border: activeTab === 'palette' ? 'none' : '1px solid var(--border-card)'
            }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>3. Color Palette & Customizer</span>
          </button>
        </div>

        {/* Tab 1: Layouts Section */}
        {activeTab === 'layouts' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                  Widescreen Layout Architecture
                </h4>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Click any layout option to apply it instantly. The app shell, sidebars, and stream drawers will reconfigure immediately.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full border font-bold" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-card)', color: 'var(--accent-gold)' }}>
                Active: {LAYOUT_OPTIONS.find(l => l.id === activeLayout)?.shortName || 'Classic'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LAYOUT_OPTIONS.map((layout) => {
                const isSelected = activeLayout === layout.id;
                return (
                  <div
                    key={layout.id}
                    onClick={() => handleSelectLayout(layout.id)}
                    className="p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] relative overflow-hidden"
                    style={{
                      backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                      borderColor: isSelected ? layout.accentHex : 'var(--border-card)',
                      boxShadow: isSelected ? `0 8px 30px ${layout.accentHex}25` : 'var(--shadow-card)'
                    }}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span 
                              className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
                              style={{ background: `${layout.accentHex}20`, color: layout.accentHex, border: `1px solid ${layout.accentHex}40` }}
                            >
                              {layout.optionNumber}
                            </span>
                            <h5 className="text-xs sm:text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                              {layout.name}
                            </h5>
                          </div>
                          <p className="text-[11px] font-semibold mt-1" style={{ color: layout.accentHex }}>
                            {layout.tagline}
                          </p>
                        </div>
                        {isSelected ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0" style={{ background: 'var(--accent-green)', color: '#000' }}>
                            <Check className="w-3 h-3 stroke-[3]" /> Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border opacity-70" style={{ borderColor: 'var(--border-card)' }}>
                            {layout.badge}
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {layout.description}
                      </p>

                      {/* Feature Bullet Points */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {layout.features.map((feat, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: layout.accentHex }} />
                            <span className="truncate">{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-card)' }}>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        Pairs with: <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>{layout.recommendedTheme}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectLayout(layout.id);
                        }}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        style={{
                          background: isSelected ? layout.accentHex : 'var(--bg-input)',
                          color: isSelected ? '#000' : 'var(--text-primary)',
                          border: '1px solid var(--border-card)'
                        }}
                      >
                        {isSelected ? '✓ Current Layout' : 'Apply Layout'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Themes Section */}
        {activeTab === 'themes' && (
          <>
            {/* Quick Filter Categories */}
            <div
              className="px-6 py-2 border-b flex items-center gap-2 overflow-x-auto shrink-0"
              style={{
                borderColor: 'var(--border-card)',
                background: 'var(--bg-card)'
              }}
            >
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedCategory === 'all' ? 'shadow-sm' : 'hover:opacity-75'
                }`}
                style={{
                  background: selectedCategory === 'all' ? 'var(--accent-gold)' : 'transparent',
                  color: selectedCategory === 'all' ? '#000' : 'var(--text-secondary)',
                  border: selectedCategory === 'all' ? 'none' : '1px solid var(--border-card)'
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                All 16 Themes
              </button>
              <button
                onClick={() => setSelectedCategory('dark')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedCategory === 'dark' ? 'shadow-sm' : 'hover:opacity-75'
                }`}
                style={{
                  background: selectedCategory === 'dark' ? 'var(--accent-gold)' : 'transparent',
                  color: selectedCategory === 'dark' ? '#000' : 'var(--text-secondary)',
                  border: selectedCategory === 'dark' ? 'none' : '1px solid var(--border-card)'
                }}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark & Luxury OLED ({darkThemes.length})
              </button>
              <button
                onClick={() => setSelectedCategory('trading')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedCategory === 'trading' ? 'shadow-sm' : 'hover:opacity-75'
                }`}
                style={{
                  background: selectedCategory === 'trading' ? 'var(--accent-gold)' : 'transparent',
                  color: selectedCategory === 'trading' ? '#000' : 'var(--text-secondary)',
                  border: selectedCategory === 'trading' ? 'none' : '1px solid var(--border-card)'
                }}
              >
                <Terminal className="w-3.5 h-3.5" />
                Trading & High Contrast ({tradingThemes.length})
              </button>
              <button
                onClick={() => setSelectedCategory('light')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedCategory === 'light' ? 'shadow-sm' : 'hover:opacity-75'
                }`}
                style={{
                  background: selectedCategory === 'light' ? 'var(--accent-gold)' : 'transparent',
                  color: selectedCategory === 'light' ? '#000' : 'var(--text-secondary)',
                  border: selectedCategory === 'light' ? 'none' : '1px solid var(--border-card)'
                }}
              >
                <Sun className="w-3.5 h-3.5" />
                Daylight Executive Light ({lightThemes.length})
              </button>
            </div>

            {/* Scrollable Themes Container */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {(selectedCategory === 'all' || selectedCategory === 'dark') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-primary)' }}>
                      Institutional Dark & Luxury OLED ({darkThemes.length} Themes)
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {darkThemes.map(renderThemeCard)}
                  </div>
                </div>
              )}

              {(selectedCategory === 'all' || selectedCategory === 'trading') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-card)' }}>
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-primary)' }}>
                      Trading Desks & High-Contrast Terminals ({tradingThemes.length} Themes)
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {tradingThemes.map(renderThemeCard)}
                  </div>
                </div>
              )}

              {(selectedCategory === 'all' || selectedCategory === 'light') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-card)' }}>
                    <Sun className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-primary)' }}>
                      Daylight Executive Light Suite — Zero Visual Noise ({lightThemes.length} Themes)
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {lightThemes.map(renderThemeCard)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 3: Color Palette & Customizer */}
        {activeTab === 'palette' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div>
              <h4 className="text-sm font-bold font-display" style={{ color: 'var(--text-primary)' }}>
                Live Color Palette & Accent Studio
              </h4>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Customize your primary accent color, secondary highlight, canvas background, and card borders. Changes update immediately across all views.
              </p>
            </div>

            {/* Quick 1-Click Curated Swatches */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider block font-mono" style={{ color: 'var(--text-muted)' }}>
                Curated 1-Click Accent Palettes
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CURATED_PALETTES.map((p) => {
                  const isCuratedActive = customPalette.accent === p.hex;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handlePickPalette(p)}
                      className="p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 text-left hover:scale-[1.02]"
                      style={{
                        background: isCuratedActive ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                        borderColor: isCuratedActive ? p.hex : 'var(--border-card)',
                        boxShadow: isCuratedActive ? `0 4px 20px ${p.hex}30` : 'none'
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-full border shadow-sm shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: p.hex, borderColor: 'var(--border-card)' }}
                      >
                        {isCuratedActive && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                      </span>
                      <div>
                        <span className="font-bold text-xs block" style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </span>
                        <span className="text-[10px] font-mono opacity-75 block" style={{ color: p.hex }}>
                          {p.tag}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detailed Custom Color Pickers */}
            <div 
              className="p-4 rounded-2xl border space-y-4"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-card)'
              }}
            >
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-card)' }}>
                <span className="text-xs font-bold uppercase font-display" style={{ color: 'var(--text-primary)' }}>
                  Custom Precision Color Sliders
                </span>
                <button
                  type="button"
                  onClick={handleResetPalette}
                  className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset to Theme Default
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Primary Accent */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                    Primary Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customPalette.accent || '#D4A843'}
                      onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={customPalette.accent || ''}
                      placeholder="#D4A843"
                      onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                      className="flex-1 text-xs font-mono px-3 py-1.5 rounded-xl border outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        borderColor: 'var(--border-card)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>

                {/* 2. Secondary Highlight */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                    Secondary Highlight
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customPalette.accentLight || '#3B82F6'}
                      onChange={(e) => handleCustomColorChange('accentLight', e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={customPalette.accentLight || ''}
                      placeholder="#3B82F6"
                      onChange={(e) => handleCustomColorChange('accentLight', e.target.value)}
                      className="flex-1 text-xs font-mono px-3 py-1.5 rounded-xl border outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        borderColor: 'var(--border-card)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>

                {/* 3. Canvas Background Tint */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                    Canvas Background Tint
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customPalette.bgCanvas || '#0A0A0F'}
                      onChange={(e) => handleCustomColorChange('bgCanvas', e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={customPalette.bgCanvas || ''}
                      placeholder="#0A0A0F"
                      onChange={(e) => handleCustomColorChange('bgCanvas', e.target.value)}
                      className="flex-1 text-xs font-mono px-3 py-1.5 rounded-xl border outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        borderColor: 'var(--border-card)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>

                {/* 4. Card Border Tone */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase font-bold block" style={{ color: 'var(--text-muted)' }}>
                    Card Border Tone
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customPalette.borderTone || '#1E293B'}
                      onChange={(e) => handleCustomColorChange('borderTone', e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border border-slate-700 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={customPalette.borderTone || ''}
                      placeholder="#1E293B"
                      onChange={(e) => handleCustomColorChange('borderTone', e.target.value)}
                      className="flex-1 text-xs font-mono px-3 py-1.5 rounded-xl border outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        borderColor: 'var(--border-card)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview Box */}
              <div 
                className="p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 mt-4"
                style={{
                  background: 'var(--bg-table-alt)',
                  borderColor: 'var(--border-card)'
                }}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider block font-mono" style={{ color: 'var(--text-muted)' }}>
                    Live Palette Simulation
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg font-extrabold font-mono" style={{ color: 'var(--accent-gold)' }}>
                      ₹47.11 Cr
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)' }}>
                      +₹17,65,402 (+0.41%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: 'var(--accent-gold)',
                      color: '#000'
                    }}
                  >
                    Primary Button
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold border"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-card)'
                    }}
                  >
                    Secondary Action
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div
          className="px-6 py-3.5 border-t flex items-center justify-between shrink-0"
          style={{
            borderColor: 'var(--border-card)',
            background: 'var(--bg-table-alt)'
          }}
        >
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            Layout: <span className="font-bold text-[var(--accent-gold)]">{LAYOUT_OPTIONS.find(l => l.id === activeLayout)?.shortName}</span> &nbsp;|&nbsp; Theme: <span className="font-bold text-[var(--accent-gold)]">{activeTheme}</span>
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg hover:opacity-90"
            style={{
              background: 'var(--accent-gold)',
              color: '#000'
            }}
          >
            Apply & Done
          </button>
        </div>
      </div>
    </div>
  );
}
