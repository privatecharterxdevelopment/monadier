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

type BotAnalysisActions = {
  registerOpenAnalysisTab: (fn: () => void) => void;
  openAnalysisTab: () => void;
};

/** High-frequency scan UI (TF pills, progress) — isolated so chart/dock do not re-render. */
export type BotAnalysisPulse = Pick<
  TerminalBotAnalysisState,
  | 'botRunning'
  | 'scanning'
  | 'analyzerActive'
  | 'step'
  | 'progress'
  | 'signal'
  | 'isLoading'
  | 'engineTfChips'
  | 'tfRevealComplete'
  | 'dbAnalysis'
  | 'activeSymbol'
  | 'globalBest'
  | 'bestLong'
  | 'globalScanCount'
  | 'globalCoinsScanned'
  | 'currentlyScanningCoin'
  | 'scanCoinIndex'
  | 'scanCoinTotal'
  | 'readiness'
  | 'openPositionsCount'
  | 'maxConcurrentPositions'
  | 'execution'
  | 'scanCandidate'
  | 'boardCandidates'
  | 'globalCandidates'
  | 'scanUniverseCoins'
  | 'scanRotationCoins'
  | 'scanSkips'
  | 'scanScannedAt'
  | 'scanComplete'
  | 'slotsFull'
  | 'marginBlocked'
  | 'pumpSweepLines'
>;

/** Low-frequency engine copy — analytic panel & journal. */
export type BotAnalysisCore = Pick<
  TerminalBotAnalysisState,
  | 'botRunning'
  | 'scanning'
  | 'marginBlocked'
  | 'slotsFull'
  | 'liveNarrative'
  | 'journalHistory'
  | 'currentlyScanningCoin'
  | 'scanUniverseCoins'
  | 'boardCandidates'
  | 'globalCandidates'
  | 'scanSkips'
  | 'openPositionsCount'
  | 'globalCoinsScanned'
  | 'scanScannedAt'
  | 'scanComplete'
  | 'execution'
  | 'executionDiagnostic'
  | 'scanCandidate'
  | 'globalBest'
>;

export type CtxValue = TerminalBotAnalysisState &
  BotAnalysisActions & {
    journalHistory: BotAnalysisJournalEntry[];
    liveNarrative: string;
  };

const ActionsContext = createContext<BotAnalysisActions | null>(null);
const PulseContext = createContext<BotAnalysisPulse | null>(null);
const CoreContext = createContext<BotAnalysisCore | null>(null);

export function useBotAnalysisActions(): BotAnalysisActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('BotTerminalAnalysisProvider required');
  return ctx;
}

export function useBotAnalysisActionsOptional(): BotAnalysisActions | null {
  return useContext(ActionsContext);
}

export function useBotAnalysisPulse(): BotAnalysisPulse {
  const ctx = useContext(PulseContext);
  if (!ctx) throw new Error('BotTerminalAnalysisProvider required');
  return ctx;
}

export function useBotAnalysisCore(): BotAnalysisCore {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error('BotTerminalAnalysisProvider required');
  return ctx;
}

export function useBotTerminalAnalysis(): CtxValue {
  const pulse = useBotAnalysisPulse();
  const core = useBotAnalysisCore();
  const actions = useBotAnalysisActions();
  return { ...pulse, ...core, ...actions } as CtxValue;
}

/** Optional — returns null outside bot analysis provider (e.g. perps terminal). */
export function useBotTerminalAnalysisOptional(): CtxValue | null {
  const pulse = useContext(PulseContext);
  const core = useContext(CoreContext);
  const actions = useContext(ActionsContext);
  if (!pulse || !core || !actions) return null;
  return { ...pulse, ...core, ...actions } as CtxValue;
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

  const actions = useMemo<BotAnalysisActions>(
    () => ({ registerOpenAnalysisTab, openAnalysisTab }),
    [registerOpenAnalysisTab, openAnalysisTab]
  );

  const pulse = useMemo<BotAnalysisPulse>(
    () => ({
      botRunning: analysis.botRunning,
      scanning: analysis.scanning,
      analyzerActive: analysis.analyzerActive,
      step: analysis.step,
      progress: analysis.progress,
      signal: analysis.signal,
      isLoading: analysis.isLoading,
      engineTfChips: analysis.engineTfChips,
      tfRevealComplete: analysis.tfRevealComplete,
      dbAnalysis: analysis.dbAnalysis,
      activeSymbol: analysis.activeSymbol,
      globalBest: analysis.globalBest,
      bestLong: analysis.bestLong,
      globalScanCount: analysis.globalScanCount,
      globalCoinsScanned: analysis.globalCoinsScanned,
      currentlyScanningCoin: analysis.currentlyScanningCoin,
      scanCoinIndex: analysis.scanCoinIndex,
      scanCoinTotal: analysis.scanCoinTotal,
      readiness: analysis.readiness,
      openPositionsCount: analysis.openPositionsCount,
      maxConcurrentPositions: analysis.maxConcurrentPositions,
      execution: analysis.execution,
      scanCandidate: analysis.scanCandidate,
      boardCandidates: analysis.boardCandidates,
      globalCandidates: analysis.globalCandidates,
      scanUniverseCoins: analysis.scanUniverseCoins,
      scanRotationCoins: analysis.scanRotationCoins,
      scanSkips: analysis.scanSkips,
      scanScannedAt: analysis.scanScannedAt,
      scanComplete: analysis.scanComplete,
      slotsFull: analysis.slotsFull,
      marginBlocked: analysis.marginBlocked,
      pumpSweepLines: analysis.pumpSweepLines,
    }),
    [
      analysis.botRunning,
      analysis.scanning,
      analysis.analyzerActive,
      analysis.step,
      analysis.progress,
      analysis.signal,
      analysis.isLoading,
      analysis.engineTfChips,
      analysis.tfRevealComplete,
      analysis.dbAnalysis,
      analysis.activeSymbol,
      analysis.globalBest,
      analysis.bestLong,
      analysis.globalScanCount,
      analysis.globalCoinsScanned,
      analysis.currentlyScanningCoin,
      analysis.scanCoinIndex,
      analysis.scanCoinTotal,
      analysis.readiness,
      analysis.openPositionsCount,
      analysis.maxConcurrentPositions,
      analysis.execution,
      analysis.scanCandidate,
      analysis.boardCandidates,
      analysis.globalCandidates,
      analysis.scanUniverseCoins,
      analysis.scanRotationCoins,
      analysis.scanSkips,
      analysis.scanScannedAt,
      analysis.scanComplete,
      analysis.slotsFull,
      analysis.marginBlocked,
      analysis.pumpSweepLines,
    ]
  );

  const core = useMemo<BotAnalysisCore>(
    () => ({
      botRunning: analysis.botRunning,
      scanning: analysis.scanning,
      marginBlocked: analysis.marginBlocked,
      slotsFull: analysis.slotsFull,
      liveNarrative: analysis.liveNarrative,
      journalHistory: analysis.journalHistory,
      currentlyScanningCoin: analysis.currentlyScanningCoin,
      scanUniverseCoins: analysis.scanUniverseCoins,
      boardCandidates: analysis.boardCandidates,
      globalCandidates: analysis.globalCandidates,
      scanSkips: analysis.scanSkips,
      openPositionsCount: analysis.openPositionsCount,
      globalCoinsScanned: analysis.globalCoinsScanned,
      scanScannedAt: analysis.scanScannedAt,
      scanComplete: analysis.scanComplete,
      execution: analysis.execution,
      executionDiagnostic: analysis.executionDiagnostic,
      scanCandidate: analysis.scanCandidate,
      globalBest: analysis.globalBest,
    }),
    [
      analysis.botRunning,
      analysis.scanning,
      analysis.marginBlocked,
      analysis.slotsFull,
      analysis.liveNarrative,
      analysis.journalHistory,
      analysis.currentlyScanningCoin,
      analysis.scanUniverseCoins,
      analysis.boardCandidates,
      analysis.globalCandidates,
      analysis.scanSkips,
      analysis.openPositionsCount,
      analysis.globalCoinsScanned,
      analysis.scanScannedAt,
      analysis.scanComplete,
      analysis.execution,
      analysis.executionDiagnostic,
      analysis.scanCandidate,
      analysis.globalBest,
    ]
  );

  return (
    <ActionsContext.Provider value={actions}>
      <CoreContext.Provider value={core}>
        <PulseContext.Provider value={pulse}>{children}</PulseContext.Provider>
      </CoreContext.Provider>
    </ActionsContext.Provider>
  );
};