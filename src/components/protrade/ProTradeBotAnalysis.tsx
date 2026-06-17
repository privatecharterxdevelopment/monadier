import React from 'react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import TerminalChartAnalysisOverlay from '../terminal/TerminalChartAnalysisOverlay';
import { useProTradeBot } from './ProTradeBotSide';

type Props = {
  walletConnected: boolean;
  perpCoin: string;
};

/** Live bot scan bar (signal, confidence %, RSI, triggers) under the GMX bot chart. */
const ProTradeBotAnalysis: React.FC<Props> = ({ walletConnected, perpCoin }) => {
  const { metrics, dockRefreshKey } = useProTradeBot();
  const vault = useTerminalVaultData(dockRefreshKey);
  const hasOpenPosition =
    metrics.openPositionsCount > 0 || Boolean(vault.position?.isActive);

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletConnected || metrics.autoTradeEnabled,
    metrics,
    hasOpenPosition,
    symbol: hlCoinToBotSymbol(perpCoin),
  });

  const show =
    walletConnected || metrics.autoTradeEnabled || metrics.openPositionsCount > 0;

  if (!show) return null;

  return (
    <div className="hl-bot-analysis">
      <TerminalChartAnalysisOverlay
        visible
        scanning={analysis.scanning}
        step={analysis.step}
        progress={analysis.progress}
        isLoading={analysis.isLoading}
        signal={analysis.signal}
        dbAnalysis={analysis.dbAnalysis}
        activeSymbol={analysis.activeSymbol}
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
