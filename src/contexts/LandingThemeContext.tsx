import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANDING_THEME,
  applyLandingThemeToDocument,
  type LandingTheme,
  readStoredLandingTheme,
  storeLandingTheme,
} from '../lib/landingTheme';

type LandingThemeContextValue = {
  theme: LandingTheme;
  isLight: boolean;
  setTheme: (theme: LandingTheme) => void;
  toggleTheme: () => void;
};

const LandingThemeContext = createContext<LandingThemeContextValue | null>(null);

export function useLandingTheme(): LandingThemeContextValue {
  const ctx = useContext(LandingThemeContext);
  if (!ctx) {
    throw new Error('useLandingTheme must be used within LandingThemeProvider');
  }
  return ctx;
}

/** Safe for chrome that may render outside provider. */
export function useLandingThemeOptional(): LandingTheme {
  const ctx = useContext(LandingThemeContext);
  return ctx?.theme ?? readStoredLandingTheme();
}

export const LandingThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<LandingTheme>(() => readStoredLandingTheme());

  useEffect(() => {
    applyLandingThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: LandingTheme) => {
    setThemeState(next);
    storeLandingTheme(next);
    applyLandingThemeToDocument(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: LandingTheme = current === 'light' ? 'dark' : 'light';
      storeLandingTheme(next);
      applyLandingThemeToDocument(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isLight: theme === 'light',
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <LandingThemeContext.Provider value={value}>{children}</LandingThemeContext.Provider>;
};

export { DEFAULT_LANDING_THEME };
