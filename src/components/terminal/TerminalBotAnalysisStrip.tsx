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
};

const TerminalBotAnalysisStrip: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  symbol = 'ETHUSDT',
}) => {
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const botSettings = useTerminalBotSettings();
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const botRunning = effectiveHlBotRunning(
    botSettings.settings.autoTradeEnabled,
    hlSetup.accountUsd,
    hlSetup.agentApproved
  );
  const hlReady = isHlBotReadyToRun(hlSetup.accountUsd, hlSetup.agentApproved);
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
        visible
        scanning={analysis.scanning}
        step={analysis.step}
        progress={analysis.progress}
        isLoading={analysis.isLoading}
        signal={analysis.signal}
        dbAnalysis={analysis.dbAnalysis}
        activeSymbol={analysis.activeSymbol}
        readiness={analysis.readiness}
      />
  );
};

export default TerminalBotAnalysisStrip;
