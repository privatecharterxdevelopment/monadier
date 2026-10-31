export type LandingTheme = 'light' | 'dark';

export const LANDING_THEME_STORAGE_KEY = 'landing-theme';

/** Default matches current light marketing chrome. */
export const DEFAULT_LANDING_THEME: LandingTheme = 'light';

export function readStoredLandingTheme(): LandingTheme {
  try {
    const stored = localStorage.getItem(LANDING_THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANDING_THEME;
}

export function storeLandingTheme(theme: LandingTheme): void {
  try {
    localStorage.setItem(LANDING_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyLandingThemeToDocument(theme: LandingTheme): void {
  const root = document.documentElement;
  root.dataset.landingTheme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#000000' : '';

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#e8e8ec');
  }
}
