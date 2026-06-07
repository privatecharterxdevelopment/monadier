import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_PRO_TRADE_THEME,
  type ProTradeTheme,
  readStoredProTradeTheme,
  storeProTradeTheme,
} from '../lib/proTradeTheme';

type ProTradeThemeContextValue = {
  theme: ProTradeTheme;
  isLight: boolean;
  setTheme: (theme: ProTradeTheme) => void;
  toggleTheme: () => void;
};

const ProTradeThemeContext = createContext<ProTradeThemeContextValue | null>(null);

export function useProTradeTheme(): ProTradeThemeContextValue {
  const ctx = useContext(ProTradeThemeContext);
  if (!ctx) {
    throw new Error('useProTradeTheme must be used within ProTradeThemeProvider');
  }
  return ctx;
}

export const ProTradeThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ProTradeTheme>(() => readStoredProTradeTheme());

  const setTheme = useCallback((next: ProTradeTheme) => {
    setThemeState(next);
    storeProTradeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ProTradeTheme = current === 'light' ? 'dark' : 'light';
      storeProTradeTheme(next);
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

  return <ProTradeThemeContext.Provider value={value}>{children}</ProTradeThemeContext.Provider>;
};

export { DEFAULT_PRO_TRADE_THEME };
