export type ThemeId = string;

export function getActiveThemeId(): string {
  if (typeof window === 'undefined') return 'institutional-light';
  try {
    const saved = localStorage.getItem('portfolio_theme');
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {}
  return 'institutional-light';
}

export function applyTheme(themeId: string) {
  if (typeof window === 'undefined' || !themeId) return;
  document.documentElement.setAttribute('data-theme', themeId);
  const isLight = themeId.includes('light') || [
    'institutional-light',
    'light-platinum',
    'arctic-frost',
    'warm-ivory',
    'azure-sky',
    'executive-navy-light'
  ].includes(themeId);

  if (isLight) {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }

  try {
    localStorage.setItem('portfolio_theme', themeId);
  } catch (_) {}
}
