/**
 * Centralized Formatter & Color-Coding Utilities for Portfolio Analytics
 * Standardized 3-state financial representation: Gain (Green), At Par (Amber/Yellow), Loss (Red)
 */

export function formatINR(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  const isNegative = val < 0;
  const roundedVal = Math.round(Math.abs(val));

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(roundedVal).replace(/\s+/g, '\u00A0');

  return isNegative ? `\u2011${formatted}` : formatted;
}

export function formatUSD(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  const isNegative = val < 0;
  const roundedVal = Math.round(Math.abs(val));

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(roundedVal).replace(/\s+/g, '\u00A0');

  return isNegative ? `\u2011${formatted}` : formatted;
}

export function formatCurrency(val: number | null | undefined, currency: string = 'INR'): string {
  if (currency === 'USD') return formatUSD(val);
  return formatINR(val);
}

export function formatPct(val: number | null | undefined, includeSign = false, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return `0.${'0'.repeat(decimals)}%`;
  const sign = val > 0 && includeSign ? '+' : '';
  const numStr = Math.abs(val) < 0.0001 ? '0.00' : val.toFixed(decimals);
  const formatted = `${sign}${numStr}%`.replace(/-/g, '\u2011');
  return formatted;
}

export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCrore2Dec(val: number | null | undefined, currency: string = 'INR'): string {
  if (val === null || val === undefined || isNaN(val)) {
    return currency === 'USD' ? '$0' : '₹0';
  }
  const prefix = currency === 'USD' ? '$' : '₹';
  const sign = val < 0 ? '\u2011' : '';
  const abs = Math.abs(val);

  if (currency === 'INR') {
    if (abs >= 10000000) {
      const crVal = abs / 10000000;
      return `${sign}${prefix}${crVal.toFixed(2)}\u00A0Cr`;
    }
    if (abs >= 100000) {
      const lVal = abs / 100000;
      return `${sign}${prefix}${lVal.toFixed(2)}\u00A0L`;
    }
    return `${sign}${prefix}${Math.round(abs).toLocaleString('en-IN')}`;
  } else {
    if (abs >= 1000000) {
      const mVal = abs / 1000000;
      return `${sign}${prefix}${mVal.toFixed(2)}\u00A0M`;
    }
    return `${sign}${prefix}${Math.round(abs).toLocaleString('en-US')}`;
  }
}

export function formatCompactNumber(val: number | null | undefined, currency = 'INR'): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const abs = Math.abs(val);
  const prefix = currency === 'USD' ? '$' : '₹';
  const sign = val < 0 ? '\u2011' : '';

  if (currency === 'INR') {
    if (abs >= 10000000) return `${sign}${prefix}${(abs / 10000000).toFixed(2)}\u00A0Cr`;
    if (abs >= 100000) return `${sign}${prefix}${(abs / 100000).toFixed(2)}\u00A0L`;
    if (abs >= 1000) return `${sign}${prefix}${(abs / 1000).toFixed(1)}\u00A0k`;
    return `${sign}${prefix}${Math.round(abs)}`;
  } else {
    if (abs >= 1000000) return `${sign}${prefix}${(abs / 1000000).toFixed(2)}\u00A0M`;
    if (abs >= 1000) return `${sign}${prefix}${(abs / 1000).toFixed(1)}\u00A0k`;
    return `${sign}${prefix}${Math.round(abs)}`;
  }
}

/**
 * Three-state Financial Color Classifier:
 * - Positive (> +0.01): Crisp Emerald Green
 * - At Par / Neutral (between -0.01 and +0.01): Warm Amber / Gold / Yellow
 * - Negative (< -0.01): Vibrant Crimson / Rose Red
 */
export function getGainLossColorClass(val: number | null | undefined, atParTolerance = 0.01): string {
  if (val === null || val === undefined || isNaN(val)) {
    return 'text-amber-400 font-semibold';
  }
  if (Math.abs(val) <= atParTolerance || val === 0) {
    return 'text-amber-400 font-semibold'; // At Par: Yellow/Amber
  }
  if (val > atParTolerance) {
    return 'text-emerald-400 font-bold'; // Gain: Green
  }
  return 'text-rose-400 font-bold'; // Loss: Red
}

export function getGainLossBgClass(val: number | null | undefined, atParTolerance = 0.01): string {
  if (val === null || val === undefined || isNaN(val) || Math.abs(val) <= atParTolerance || val === 0) {
    return 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-xs'; // At Par Badge
  }
  if (val > atParTolerance) {
    return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-xs'; // Gain Badge
  }
  return 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-xs'; // Loss Badge
}

export function getGainLossIcon(val: number | null | undefined, atParTolerance = 0.01): string {
  if (val === null || val === undefined || isNaN(val) || Math.abs(val) <= atParTolerance || val === 0) {
    return '●'; // At Par indicator
  }
  if (val > atParTolerance) {
    return '▲'; // Up indicator
  }
  return '▼'; // Down indicator
}

export function getGainLossStatusLabel(val: number | null | undefined, atParTolerance = 0.01): string {
  if (val === null || val === undefined || isNaN(val) || Math.abs(val) <= atParTolerance || val === 0) {
    return 'At Par';
  }
  if (val > atParTolerance) {
    return 'Gain';
  }
  return 'Loss';
}
