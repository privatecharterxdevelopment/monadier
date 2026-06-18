import React from 'react';
import { useAccount } from 'wagmi';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import TerminalChartAnalysisOverlay from '../terminal/TerminalChartAnalysisOverlay';
import { useProTradeBot } from './ProTradeBotSide';

type Props = {
  walletConnected: boolean;
  perpCoin: string;
};

/** Live bot scan bar under the Pro Trade chart. */
const ProTradeBotAnalysis: React.FC<Props> = ({ walletConnected, perpCoin }) => {
  const { address } = useAccount();
  const { metrics } = useProTradeBot();
  const hasOpenPosition = metrics.openPositionsCount > 0;

  const analysis = useTerminalBotAnalysis({
    walletConnected: walletConnected || metrics.autoTradeEnabled,
    metrics,
    hasOpenPosition,
    vaultUsd: metrics.hlBalanceUsd,
    vaultWallet: address,
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
        readiness={analysis.readiness}
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
