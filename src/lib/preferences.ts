export interface UserPreferences {
  defaultSort: 'TODAYS_GAIN' | 'CURRENT_VALUE' | 'UNREALISED_GAIN' | 'AMOUNT_INVESTED' | 'ALPHABETICAL';
  sortDirection: 'ASC' | 'DESC';
  zeroHoldings: 'SHOW' | 'HIDE';
  decimals: 'SHOW' | 'HIDE';
  separator: 'LAKHS' | 'MILLIONS';
  fontSize: 'SMALL' | 'LARGE';
  costBasis: 'PMS_MARKET' | 'TAX_BASE';
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultSort: 'TODAYS_GAIN',
  sortDirection: 'DESC',
  zeroHoldings: 'HIDE',
  decimals: 'SHOW',
  separator: 'LAKHS',
  fontSize: 'SMALL',
  costBasis: 'PMS_MARKET'
};

export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const saved = localStorage.getItem('portfolio_user_preferences');
    if (saved) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load user preferences:', e);
  }
  return DEFAULT_PREFERENCES;
}

export function saveUserPreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('portfolio_user_preferences', JSON.stringify(prefs));
    // Apply font size attribute to html root
    document.documentElement.setAttribute('data-font-scale', prefs.fontSize.toLowerCase());
  } catch (e) {
    console.error('Failed to save user preferences:', e);
  }
}

/**
 * Format currency based on active user preferences (Lakhs vs Millions, Decimals)
 */
export function formatPrefCurrency(val: number, prefs?: UserPreferences): string {
  const p = prefs || getUserPreferences();
  const fractionDigits = p.decimals === 'SHOW' ? 2 : 0;

  if (p.separator === 'MILLIONS') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits
    }).format(val);
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  }).format(val);
}
