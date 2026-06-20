import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

export type BettingUiActions = {
  scrollToRail?: () => void;
  cashOutFirst?: () => void;
};

type BettingUiContextValue = {
  registerActions: (actions: BettingUiActions | null) => void;
  scrollToRail: () => void;
  cashOutFirst: () => void;
};

const BettingUiContext = createContext<BettingUiContextValue | null>(null);

export function BettingUiProvider({ children }: { children: React.ReactNode }) {
  const actionsRef = useRef<BettingUiActions | null>(null);

  const registerActions = useCallback((actions: BettingUiActions | null) => {
    actionsRef.current = actions;
  }, []);

  const scrollToRail = useCallback(() => {
    actionsRef.current?.scrollToRail?.();
  }, []);

  const cashOutFirst = useCallback(() => {
    actionsRef.current?.cashOutFirst?.();
  }, []);

  const value = useMemo(
    () => ({ registerActions, scrollToRail, cashOutFirst }),
    [registerActions, scrollToRail, cashOutFirst]
  );

  return <BettingUiContext.Provider value={value}>{children}</BettingUiContext.Provider>;
}

export function useBettingUi(): BettingUiContextValue {
  const ctx = useContext(BettingUiContext);
  if (!ctx) {
    return {
      registerActions: () => {},
      scrollToRail: () => {},
      cashOutFirst: () => {},
    };
  }
  return ctx;
}
