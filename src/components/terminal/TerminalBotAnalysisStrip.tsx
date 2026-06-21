import React from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import TerminalChartAnalysisOverlay from './TerminalChartAnalysisOverlay';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  openPositionCoins?: string[];
  symbol?: string;
  placement?: 'chart' | 'dock';
  /** Parent-computed bot on/off (settings + metrics). */
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
  const botSettings = useTerminalBotSettings();
  const openPositionsCount = metrics.openPositionsCount;
  const maxSlots = HL_MAX_CONCURRENT_POSITIONS;
  const slotsFull = openPositionsCount >= maxSlots;

  const botRunning = isHlBotEnabled(
    botRunningHint ??
      (botSettings.settings.autoTradeEnabled || metrics.autoTradeEnabled)
  );
  const hasWallet = walletConnected || Boolean(vaultWallet);
  const showLiveAnalysis = hasWallet && botRunning;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const idleReadiness = !hasWallet
    ? { headline: 'Connect wallet', detail: 'Connect your wallet to scan HL perps' }
    : !botRunning
      ? { headline: 'Bot paused', detail: 'Press Start bot to resume market scan' }
      : null;

  const analysis = useTerminalBotAnalysis({
    walletConnected: hasWallet,
    metrics,
    openPositionsCount,
    maxConcurrentPositions: maxSlots,
    vaultUsd: hlBalanceUsd,
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning,
    botRunning,
  });

  if (placement !== 'dock' && !showLiveAnalysis) return null;

  return (
    <TerminalChartAnalysisOverlay
        placement={placement}
        visible
        step={analysis.step}
        progress={analysis.progress}
        signal={analysis.signal}
        dbAnalysis={analysis.dbAnalysis}
        activeSymbol={analysis.activeSymbol}
        globalBest={analysis.scanCandidate ?? analysis.globalBest}
        globalScanCount={analysis.globalScanCount}
        globalCoinsScanned={analysis.globalCoinsScanned}
        readiness={
          idleReadiness ??
          (slotsFull
            ? {
                ...analysis.readiness,
                headline: 'Slots full',
                detail: `${openPositionsCount}/${maxSlots} positions open — monitoring exits`,
              }
            : analysis.readiness)
        }
        scanning={idleReadiness ? false : botRunning && (analysis.scanning || openPositionsCount === 0)}
        isLoading={idleReadiness ? false : analysis.isLoading}
        openPositionsCount={analysis.openPositionsCount}
        maxConcurrentPositions={analysis.maxConcurrentPositions}
      />
  );
};

export default TerminalBotAnalysisStrip;
