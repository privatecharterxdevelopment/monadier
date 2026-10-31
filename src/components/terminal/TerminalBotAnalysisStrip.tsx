import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { HL_DEFAULT_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import TerminalChartAnalysisOverlay from './TerminalChartAnalysisOverlay';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  openPositionCoins?: string[];
  symbol?: string;
  placement?: 'chart' | 'dock';
  /** @deprecated Ignored — useHlBotRunning (optimistic stop) is source of truth */
  botRunningHint?: boolean;
};

const TerminalBotAnalysisStrip: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  openPositionCoins = [],
  symbol = 'ETHUSDT',
  placement = 'dock',
}) => {
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const { settings: botSettings } = useTerminalBotSettings();
  // Optimistic Stop/Start wins — never OR with stale metrics (that kept scanning after pause).
  const { botRunning: resolvedRunning, wallet: tradingWallet } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
  });
  const effectiveVaultWallet = tradingWallet ?? vaultWallet ?? null;
  const botRunning = resolvedRunning;
  const openPositionsCount = metrics.openPositionsCount;
  const maxSlots =
    botSettings.maxConcurrentPositions >= 3
      ? 3
      : botSettings.maxConcurrentPositions >= 2
        ? 2
        : HL_DEFAULT_CONCURRENT_POSITIONS;

  const hasWallet = walletConnected || Boolean(vaultWallet);
  const showLiveAnalysis = hasWallet && botRunning;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const idleReadiness = !hasWallet
    ? { headline: 'Connect wallet', detail: 'Connect your wallet to scan HL perps' }
    : !botRunning &&
        !hlSetup.unifiedAccount &&
        hlSetup.accountUsd < MIN_HL_BOT_USD &&
        hlSetup.spotUsdcUsd >= MIN_HL_BOT_USD
      ? {
          headline: 'Funds on HL Spot',
          detail: 'Deposit again to auto-move to Perps on standard HL accounts.',
        }
    : !botRunning
      ? { headline: 'Bot off', detail: 'Press Start bot to scan markets' }
      : null;

  const analysis = useTerminalBotAnalysis({
    walletConnected: hasWallet,
    metrics,
    openPositionsCount,
    maxConcurrentPositions: maxSlots,
    vaultUsd: Math.max(hlBalanceUsd, hlSetup.perpUsd, hlSetup.spotUsdcUsd),
    vaultWallet: effectiveVaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning,
    botRunning,
    hlBotStrategy: botSettings.hlBotStrategy,
  });

  const slotsFull = analysis.slotsFull;
  const marginBlocked = analysis.marginBlocked;
  const slotCount = analysis.maxConcurrentPositions || maxSlots;
  const openCount = analysis.openPositionsCount;

  const activeCandidate = botRunning ? (analysis.scanCandidate ?? analysis.globalBest) : null;
  const hasBestCandidate = Boolean(activeCandidate?.coin);
  const scanHeadline = hasBestCandidate
    ? analysis.readiness.headline
    : analysis.scanCoinTotal > 0
      ? `Checking ${analysis.currentlyScanningCoin} · ${analysis.scanCoinIndex + 1}/${analysis.scanCoinTotal}`
      : `Checking ${analysis.currentlyScanningCoin}`;

  const readiness = useMemo(() => {
    if (idleReadiness) return idleReadiness;
    if (slotsFull) {
      return {
        ...analysis.readiness,
        headline: 'Slots full',
        detail: `${openCount}/${slotCount} positions open — monitoring exits`,
      };
    }
    if (marginBlocked) {
      return {
        ...analysis.readiness,
        headline: analysis.readiness.headline || 'Insufficient margin',
      };
    }
    return { ...analysis.readiness, headline: scanHeadline };
  }, [
    idleReadiness,
    slotsFull,
    marginBlocked,
    analysis.readiness,
    openCount,
    slotCount,
    scanHeadline,
  ]);

  const keepScanning = botRunning && !slotsFull && !marginBlocked;

  if (placement === 'chart' && !showLiveAnalysis) return null;

  // Bot paused: only the idle line — no KAITO/signal/TF leftovers from last scan.
  if (!botRunning) {
    return (
      <TerminalChartAnalysisOverlay
        placement={placement}
        visible
        step={0}
        progress={0}
        signal={null}
        dbAnalysis={null}
        activeSymbol={symbol}
        globalBest={null}
        globalScanCount={0}
        globalCoinsScanned={0}
        currentlyScanningCoin={undefined}
        scanCoinIndex={0}
        scanCoinTotal={0}
        readiness={readiness}
        scanning={false}
        isLoading={false}
        openPositionsCount={openCount}
        maxConcurrentPositions={slotCount}
        pumpSweepLines={[]}
      />
    );
  }

  return (
    <TerminalChartAnalysisOverlay
      placement={placement}
      visible
      step={analysis.step}
      progress={analysis.progress}
      signal={analysis.signal}
      dbAnalysis={analysis.dbAnalysis}
      activeSymbol={analysis.activeSymbol ?? symbol}
      globalBest={activeCandidate}
      globalScanCount={analysis.globalScanCount}
      globalCoinsScanned={analysis.globalCoinsScanned}
      currentlyScanningCoin={analysis.currentlyScanningCoin}
      scanCoinIndex={analysis.scanCoinIndex}
      scanCoinTotal={analysis.scanCoinTotal}
      readiness={readiness}
      scanning={keepScanning}
      isLoading={analysis.isLoading}
      openPositionsCount={analysis.openPositionsCount}
      maxConcurrentPositions={analysis.maxConcurrentPositions}
      pumpSweepLines={analysis.pumpSweepLines}
    />
  );
};

export default TerminalBotAnalysisStrip;
