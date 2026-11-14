import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useTerminalBotAnalysis } from '../hooks/useTerminalBotAnalysis';
import type { Dashboard2Metrics } from '../hooks/useDashboard2Metrics';
import type { BotAnalysisJournalEntry } from '../lib/botAnalysisJournal';
import type { HlBotStrategy } from '../lib/hlBotStrategy';

export type TerminalBotAnalysisState = ReturnType<typeof useTerminalBotAnalysis>;

type ProviderOptions = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  openPositionsCount: number;
  maxConcurrentPositions?: number;
  vaultUsd?: number;
  vaultWallet?: string | null;
  openPositionCoins?: string[];
  symbol?: string;
  botRunning?: boolean;
  hlBotStrategy?: HlBotStrategy | string | null;
};

type CtxValue = TerminalBotAnalysisState & {
  journalHistory: BotAnalysisJournalEntry[];
  liveNarrative: string;
  registerOpenAnalysisTab: (fn: () => void) => void;
  openAnalysisTab: () => void;
};

const BotTerminalAnalysisContext = createContext<CtxValue | null>(null);

export function useBotTerminalAnalysis(): CtxValue {
  const ctx = useContext(BotTerminalAnalysisContext);
  if (!ctx) throw new Error('BotTerminalAnalysisProvider required');
  return ctx;
}

/** Optional — returns null outside bot analysis provider (e.g. perps terminal). */
export function useBotTerminalAnalysisOptional(): CtxValue | null {
  return useContext(BotTerminalAnalysisContext);
}

export const BotTerminalAnalysisProvider: React.FC<
  ProviderOptions & { children: ReactNode }
> = ({
  children,
  walletConnected,
  metrics,
  openPositionsCount,
  maxConcurrentPositions,
  vaultUsd,
  vaultWallet,
  openPositionCoins = [],
  symbol,
  botRunning,
  hlBotStrategy,
}) => {
  const analysisActive = walletConnected && Boolean(botRunning);
  const analysis = useTerminalBotAnalysis({
    walletConnected,
    metrics,
    openPositionsCount,
    maxConcurrentPositions,
    vaultUsd,
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive,
    botRunning,
    hlBotStrategy,
  });

  const openTabRef = useRef<(() => void) | null>(null);
  const registerOpenAnalysisTab = useCallback((fn: () => void) => {
    openTabRef.current = fn;
  }, []);
  const openAnalysisTab = useCallback(() => {
    openTabRef.current?.();
  }, []);

  const value = useMemo<CtxValue>(
    () => ({
      ...analysis,
      registerOpenAnalysisTab,
      openAnalysisTab,
    }),
    [analysis, registerOpenAnalysisTab, openAnalysisTab]
  );

  return (
    <BotTerminalAnalysisContext.Provider value={value}>
      {children}
    </BotTerminalAnalysisContext.Provider>
  );
}
