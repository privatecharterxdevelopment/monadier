import React from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
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
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletConnected || metrics.autoTradeEnabled,
    metrics,
    hasOpenPosition,
    vaultUsd: metrics.hlBalanceUsd,
    vaultWallet,
    symbol,
  });

  if (!metrics.autoTradeEnabled) return null;

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
