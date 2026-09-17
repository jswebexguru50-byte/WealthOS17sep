/**
 * ============================================================
 *  A1 - NAVY PLATINUM LIGHT THEME
 *  Single source of truth for all visual design tokens.
 *
 *  HOW TO CHANGE THE THEME:
 *  1. Edit the `colors` object below to change any color.
 *  2. All components automatically reflect the change.
 *
 *  To switch to a DARK theme: swap the colors palette.
 * ============================================================
 */

import React from 'react';

export const theme = {
  name: 'A1 Navy Platinum Light',
  mode: 'light' as const,

  colors: {
    bg: {
      app:           'var(--bg-app)',
      card:          'var(--bg-card)',
      cardHover:     'var(--bg-card-hover)',
      sidebar:       'var(--bg-sidebar)',
      sidebarHover:  'var(--bg-sidebar-hover)',
      sidebarActive: 'var(--bg-sidebar-active)',
      modal:         'var(--bg-modal)',
      input:         'var(--bg-input)',
      tableHeader:   'var(--bg-table-alt)',
      tableRow:      'var(--bg-table-row)',
      tableRowAlt:   'var(--bg-table-alt)',
      tableRowHover: 'var(--bg-card-hover)',
      tableExpanded: 'var(--bg-table-row)',
      tableFoot:     'var(--bg-table-alt)',
      drilldown:     'var(--bg-table-alt)',
      badge:         'var(--bg-table-alt)',
    },
    border: {
      card:    'var(--border-card)',
      input:   'var(--border-input)',
      focus:   'var(--border-focus)',
      table:   'var(--border-card)',
    },
    text: {
      primary:      'var(--text-primary)',
      secondary:    'var(--text-secondary)',
      muted:        'var(--text-muted)',
      sidebar:      'var(--text-sidebar)',
      sidebarMuted: 'var(--text-sidebar-muted)',
      tableHeader:  'var(--text-secondary)',
      code:         'var(--text-primary)',
    },
    accent: {
      gold:       'var(--accent-gold)',
      goldLight:  'var(--accent-gold-light)',
      goldBg:     'var(--bg-sidebar-active)',
      goldBorder: 'var(--accent-gold-light)',
    },
    semantic: {
      profit:     'var(--accent-green)',
      profitBg:   'var(--accent-green-bg)',
      loss:       'var(--accent-red)',
      lossBg:     'var(--accent-red-bg)',
      info:       'var(--accent-blue)',
      infoBg:     'var(--accent-blue-bg)',
      infoBorder: 'var(--border-card)',
      warning:    'var(--accent-gold)',
      warningBg:  'var(--bg-sidebar-active)',
    },
    financial: {
      grossReturn:    'var(--color-gross-return)',
      withheldTds:    'var(--color-withheld-tds)',
      netPostTax:     'var(--color-net-post-tax)',
      fxDragGain:     'var(--color-fx-drag-gain)',
      fxDragLoss:     'var(--color-fx-drag-loss)',
      repatriable:    'var(--color-repatriable)',
      nonRepatriable: 'var(--color-non-repatriable)',
    },
    status: {
      live:   'var(--accent-green)',
      stale:  'var(--accent-gold)',
      failed: 'var(--accent-red)',
    },
    chart: [
      '#2563EB',
      '#059669',
      '#D97706',
      '#7C3AED',
      '#DC2626',
      '#0891B2',
      '#B8912A',
      '#16A34A',
      '#9333EA',
      '#EA580C',
    ] as string[],
    overlay: 'rgba(15,23,42,0.55)',
  },

  shadows: {
    card:      'var(--shadow-card)',
    cardHover: 'var(--shadow-card-hover)',
    modal:     'var(--shadow-modal)',
    tooltip:   'var(--shadow-card)',
    stickyCol: 'var(--shadow-sticky-col)',
  },

  fonts: {
    sans:    '"Inter", ui-sans-serif, system-ui, sans-serif',
    display: '"Space Grotesk", sans-serif',
    mono:    '"JetBrains Mono", monospace',
  },

  radius: {
    card:   'var(--card-radius)',
    badge:  '0.375rem',
    pill:   '9999px',
    input:  '0.75rem',
    modal:  '1rem',
    button: '0.5rem',
  },

  spacing: {
    cardPadding: '1.5rem',
    tablePadX:   '1rem',
    tablePadY:   '1rem',
  },
};

// ── Shorthand aliases ──
export const colors  = theme.colors;
export const shadows = theme.shadows;
export const radius  = theme.radius;

// ──────────────────────────────────────────────
// PRE-BUILT COMPONENT STYLE OBJECTS
// Paste these directly onto JSX `style` props.
// Change a color in `theme.colors` above and
// every style here updates automatically.
// ──────────────────────────────────────────────

export const styleAppBg: React.CSSProperties = {
  background: colors.bg.app,
};

export const styleCard: React.CSSProperties = {
  background:   colors.bg.card,
  border:       `1px solid ${colors.border.card}`,
  borderRadius: radius.card,
  boxShadow:    shadows.card,
};

export const styleTableHead: React.CSSProperties = {
  background:   colors.bg.tableHeader,
  color:        colors.text.tableHeader,
  borderBottom: `2px solid ${colors.border.table}`,
};

export const styleThCell: React.CSSProperties = {
  borderBottom: `2px solid ${colors.border.table}`,
};

export const styleBodyRow: React.CSSProperties = {
  background: colors.bg.tableRow,
};

export const styleBodyRowExpanded: React.CSSProperties = {
  background: colors.bg.tableExpanded,
};

export const styleStickyCol: React.CSSProperties = {
  background:  colors.bg.tableRow,
  borderRight: `1px solid ${colors.border.table}`,
  boxShadow:   shadows.stickyCol,
};

export const styleTableFoot: React.CSSProperties = {
  background:  colors.bg.tableFoot,
  borderTop:   `2px solid ${colors.border.table}`,
  color:       colors.text.secondary,
};

export const styleStickyFootCell: React.CSSProperties = {
  background:  colors.bg.tableFoot,
  borderRight: `1px solid ${colors.border.table}`,
};

export const styleTextPrimary: React.CSSProperties   = { color: colors.text.primary };
export const styleTextSecondary: React.CSSProperties = { color: colors.text.secondary };
export const styleTextMuted: React.CSSProperties     = { color: colors.text.muted };
export const styleProfit: React.CSSProperties        = { color: colors.semantic.profit };
export const styleLoss: React.CSSProperties          = { color: colors.semantic.loss };

export const stylePnl = (value: number): React.CSSProperties => ({
  color: value >= 0 ? colors.semantic.profit : colors.semantic.loss,
});

export const stylePctBadge: React.CSSProperties = {
  background:   colors.bg.badge,
  border:       `1px solid ${colors.border.table}`,
  color:        colors.text.primary,
  borderRadius: radius.badge,
};

export const styleBtnFifo: React.CSSProperties = {
  color:        colors.semantic.info,
  background:   colors.semantic.infoBg,
  border:       `1px solid ${colors.semantic.infoBorder}`,
  borderRadius: radius.badge,
};

export const styleBtnGold: React.CSSProperties = {
  background:   colors.accent.goldBg,
  border:       `1px solid ${colors.accent.goldBorder}`,
  color:        colors.accent.gold,
  borderRadius: radius.button,
};

export const styleSortActive: React.CSSProperties = {
  background: colors.accent.goldBg,
  color:      colors.accent.gold,
  border:     `1px solid ${colors.accent.goldBorder}`,
};

export const styleSortInactive: React.CSSProperties = {
  background: colors.bg.tableHeader,
  color:      colors.text.muted,
};

export const styleChartTooltip: React.CSSProperties = {
  background:   colors.bg.card,
  borderColor:  colors.border.card,
  borderRadius: radius.badge,
  boxShadow:    shadows.tooltip,
};

export const styleOverlay: React.CSSProperties = { background: colors.overlay };

export const styleModal: React.CSSProperties = {
  background:   colors.bg.modal,
  border:       `1px solid ${colors.border.card}`,
  borderRadius: radius.modal,
  boxShadow:    shadows.modal,
};

export const styleModalHeader: React.CSSProperties = {
  borderBottom: `1px solid ${colors.border.card}`,
};

export const styleModalFooter: React.CSSProperties = {
  background:  colors.bg.tableHeader,
  borderTop:   `1px solid ${colors.border.card}`,
  color:       colors.text.muted,
};

export const styleDrilldownPanel: React.CSSProperties = {
  background:   colors.bg.drilldown,
  borderTop:    `1px solid ${colors.border.table}`,
  borderBottom: `1px solid ${colors.border.table}`,
};

export const styleDrilldownTable: React.CSSProperties = {
  borderColor: colors.border.table,
  background:  colors.bg.card,
};

export const stylePortfolioBadge: React.CSSProperties = {
  background:   colors.bg.badge,
  border:       `1px solid ${colors.border.table}`,
  color:        colors.text.secondary,
  borderRadius: radius.badge,
};

export const styleBtnLedger: React.CSSProperties = {
  color:        colors.semantic.info,
  background:   colors.semantic.infoBg,
  border:       `1px solid ${colors.semantic.infoBorder}`,
  borderRadius: radius.button,
};

export const styleBtnClose: React.CSSProperties = {
  background:   colors.bg.tableHeader,
  color:        colors.text.secondary,
  borderRadius: radius.button,
};

export const styleInfoBadge: React.CSSProperties = {
  background:   colors.semantic.infoBg,
  border:       `1px solid ${colors.semantic.infoBorder}`,
  color:        colors.semantic.info,
};

export const styleInput: React.CSSProperties = {
  background:   colors.bg.input,
  border:       `1px solid ${colors.border.card}`,
  color:        colors.text.primary,
  borderRadius: radius.input,
};
