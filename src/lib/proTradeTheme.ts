export type ProTradeTheme = 'light' | 'dark';

export const PRO_TRADE_THEME_STORAGE_KEY = 'protrade-theme';

export const DEFAULT_PRO_TRADE_THEME: ProTradeTheme = 'light';

export type ProTradeChartColors = {
  background: string;
  text: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabel: string;
  up: string;
  down: string;
  volumeUp: string;
  volumeDown: string;
};

/** Lightweight-charts + TV widget colors — trade greens/reds unchanged on both themes */
export function getProTradeChartColors(theme: ProTradeTheme): ProTradeChartColors {
  if (theme === 'dark') {
    return {
      background: '#0b0b0b',
      text: '#71717a',
      grid: '#1a1a1a',
      border: '#262626',
      crosshair: '#404040',
      crosshairLabel: '#262626',
      up: '#3dd68c',
      down: '#ef5350',
      volumeUp: 'rgba(61, 214, 140, 0.45)',
      volumeDown: 'rgba(239, 83, 80, 0.45)',
    };
  }

  return {
    background: '#ffffff',
    text: '#71717a',
    grid: '#ebebf0',
    border: '#ebebf0',
    crosshair: '#c5c5cb',
    crosshairLabel: '#f4f4f5',
    up: '#3dd68c',
    down: '#ef5350',
    volumeUp: 'rgba(61, 214, 140, 0.35)',
    volumeDown: 'rgba(239, 83, 80, 0.35)',
  };
}

export function readStoredProTradeTheme(): ProTradeTheme {
  try {
    const stored = localStorage.getItem(PRO_TRADE_THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_PRO_TRADE_THEME;
}

export function storeProTradeTheme(theme: ProTradeTheme): void {
  try {
    localStorage.setItem(PRO_TRADE_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
