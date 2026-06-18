import React from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { effectiveHlBotRunning, isHlBotReadyToRun } from '../../lib/hlBotGates';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import TerminalChartAnalysisOverlay from './TerminalChartAnalysisOverlay';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  symbol?: string;
  placement?: 'chart' | 'dock';
};

const TerminalBotAnalysisStrip: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  symbol = 'ETHUSDT',
  placement = 'dock',
}) => {
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const botSettings = useTerminalBotSettings();
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const botRunning = effectiveHlBotRunning(
    botSettings.settings.autoTradeEnabled,
    hlSetup.accountUsd,
    hlSetup.agentApproved,
    hlSetup.builderFeeApproved
  );
  const hlReady = isHlBotReadyToRun(
    hlSetup.accountUsd,
    hlSetup.agentApproved,
    hlSetup.builderFeeApproved
  );
  const showAnalysis = walletConnected && (botRunning || hlReady);

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletConnected || showAnalysis,
    metrics,
    hasOpenPosition,
    vaultUsd: hlBalanceUsd,
    vaultWallet,
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
        globalBest={analysis.globalBest}
        globalScanCount={analysis.globalScanCount}
        globalCoinsScanned={analysis.globalCoinsScanned}
        readiness={analysis.readiness}
      />
  );
};

export default TerminalBotAnalysisStrip;
