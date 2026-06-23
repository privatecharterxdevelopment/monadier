import React, { useMemo } from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
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
  /** @deprecated useHlBotRunning — kept for parent override during migration */
  botRunningHint?: boolean;
};

const TerminalBotAnalysisStrip: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  openPositionCoins = [],
  symbol = 'ETHUSDT',
  placement = 'dock',
  botRunningHint,
}) => {
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const { botRunning: resolvedRunning, wallet: tradingWallet } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
  });
  const effectiveVaultWallet = tradingWallet ?? vaultWallet ?? null;
  const botRunning = botRunningHint ?? resolvedRunning;
  const openPositionsCount = metrics.openPositionsCount;
  const maxSlots = HL_MAX_CONCURRENT_POSITIONS;
  const slotsFull = openPositionsCount >= maxSlots;

  const hasWallet = walletConnected || Boolean(vaultWallet);
  const showLiveAnalysis = hasWallet && botRunning;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const idleReadiness = !hasWallet
    ? { headline: 'Connect wallet', detail: 'Connect your wallet to scan HL perps' }
    : !botRunning &&
        !hlSetup.unifiedAccount &&
        hlSetup.perpUsd < MIN_HL_BOT_USD &&
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
    vaultUsd: hlSetup.perpUsd > 0 ? hlSetup.perpUsd : hlBalanceUsd,
    vaultWallet: effectiveVaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning,
    botRunning,
  });

  const activeCandidate = botRunning ? (analysis.scanCandidate ?? analysis.globalBest) : null;
  const hasBestCandidate = Boolean(activeCandidate?.coin);
  const scanHeadline = hasBestCandidate
    ? analysis.readiness.headline
    : botRunning
      ? `Checking ${analysis.currentlyScanningCoin}`
      : 'Bot off';

  const readiness = useMemo(() => {
    if (idleReadiness) return idleReadiness;
    if (slotsFull) {
      return {
        ...analysis.readiness,
        headline: 'Slots full',
        detail: `${openPositionsCount}/${maxSlots} positions open — monitoring exits`,
      };
    }
    return { ...analysis.readiness, headline: scanHeadline };
  }, [
    idleReadiness,
    slotsFull,
    analysis.readiness,
    openPositionsCount,
    maxSlots,
    scanHeadline,
  ]);

  const keepScanning = botRunning && !slotsFull;

  if (placement === 'chart' && !showLiveAnalysis) return null;

  return (
    <TerminalChartAnalysisOverlay
        placement={placement}
        visible
        step={analysis.step}
        progress={analysis.progress}
        signal={hasBestCandidate ? analysis.signal : null}
        dbAnalysis={hasBestCandidate ? analysis.dbAnalysis : null}
        activeSymbol={botRunning ? (analysis.activeSymbol ?? symbol) : undefined}
        globalBest={activeCandidate}
        globalScanCount={botRunning ? analysis.globalScanCount : 0}
        globalCoinsScanned={botRunning ? analysis.globalCoinsScanned : 0}
        readiness={readiness}
        scanning={keepScanning}
        isLoading={keepScanning && hasBestCandidate && analysis.isLoading}
        openPositionsCount={analysis.openPositionsCount}
        maxConcurrentPositions={analysis.maxConcurrentPositions}
        pumpSweepLines={analysis.pumpSweepLines}
      />
  );
};

export default TerminalBotAnalysisStrip;
