import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

export type BettingUiActions = {
  scrollToRail?: () => void;
  cashOutFirst?: () => void;
};

type BettingUiContextValue = {
  registerActions: (actions: BettingUiActions | null) => void;
  registerOpenFunds: (handler: ((tab: 'deposit' | 'withdraw') => void) | null) => void;
  scrollToRail: () => void;
  cashOutFirst: () => void;
  openFunds: (tab: 'deposit' | 'withdraw') => void;
};

const BettingUiContext = createContext<BettingUiContextValue | null>(null);

export function BettingUiProvider({ children }: { children: React.ReactNode }) {
  const actionsRef = useRef<BettingUiActions | null>(null);
  const openFundsRef = useRef<((tab: 'deposit' | 'withdraw') => void) | null>(null);

  const registerActions = useCallback((actions: BettingUiActions | null) => {
    actionsRef.current = actions;
  }, []);

  const registerOpenFunds = useCallback((handler: ((tab: 'deposit' | 'withdraw') => void) | null) => {
    openFundsRef.current = handler;
  }, []);

  const scrollToRail = useCallback(() => {
    actionsRef.current?.scrollToRail?.();
  }, []);

  const cashOutFirst = useCallback(() => {
    actionsRef.current?.cashOutFirst?.();
  }, []);

  const openFunds = useCallback((tab: 'deposit' | 'withdraw') => {
    openFundsRef.current?.(tab);
  }, []);

  const value = useMemo(
    () => ({ registerActions, registerOpenFunds, scrollToRail, cashOutFirst, openFunds }),
    [registerActions, registerOpenFunds, scrollToRail, cashOutFirst, openFunds]
  );

  return <BettingUiContext.Provider value={value}>{children}</BettingUiContext.Provider>;
}

export function useBettingUi(): BettingUiContextValue {
  const ctx = useContext(BettingUiContext);
  if (!ctx) {
    return {
      registerActions: () => {},
      registerOpenFunds: () => {},
      scrollToRail: () => {},
      cashOutFirst: () => {},
      openFunds: () => {},
    };
  }
  return ctx;
}
