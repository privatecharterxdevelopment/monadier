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
  const botSettings = useTerminalBotSettings();
  const openPositionsCount = metrics.openPositionsCount;
  const maxSlots = HL_MAX_CONCURRENT_POSITIONS;
  const slotsFull = openPositionsCount >= maxSlots;

  const botRunning = isHlBotEnabled(
    botSettings.settings.autoTradeEnabled || metrics.autoTradeEnabled
  );
  const showAnalysis = walletConnected && botRunning;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletConnected || showAnalysis,
    metrics,
    openPositionsCount,
    maxConcurrentPositions: maxSlots,
    vaultUsd: hlBalanceUsd,
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: showAnalysis,
    botRunning,
  });

  if (!showAnalysis) return null;

  return (
    <TerminalChartAnalysisOverlay
        placement={placement}
        visible
        scanning={analysis.scanning}
        step={analysis.step}
        progress={analysis.progress}
        isLoading={analysis.isLoading}
        signal={analysis.signal}
        dbAnalysis={analysis.dbAnalysis}
        activeSymbol={analysis.activeSymbol}
        globalBest={analysis.scanCandidate ?? analysis.globalBest}
        globalScanCount={analysis.globalScanCount}
        globalCoinsScanned={analysis.globalCoinsScanned}
        readiness={
          slotsFull
            ? {
                ...analysis.readiness,
                headline: 'Slots full',
                detail: `${openPositionsCount}/${maxSlots} positions open — monitoring exits`,
              }
            : analysis.readiness
        }
        openPositionsCount={analysis.openPositionsCount}
        maxConcurrentPositions={analysis.maxConcurrentPositions}
      />
  );
};

export default TerminalBotAnalysisStrip;
