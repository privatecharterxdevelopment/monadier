import React from 'react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import TerminalBotAnalysisStrip from '../terminal/TerminalBotAnalysisStrip';
import { useProTradeBot } from './ProTradeBotSide';

type Props = {
  walletConnected: boolean;
  perpCoin: string;
  scanCoin?: string;
  openPositionCoins?: string[];
};

/** Live bot scan bar — 4 pills directly under the chart when bot mode is active. */
const ProTradeBotAnalysis: React.FC<Props> = ({
  walletConnected,
  perpCoin,
  scanCoin,
  openPositionCoins = [],
}) => {
  const { address } = useMonadierWallet();
  const { metrics } = useProTradeBot();
  const { botRunning, wallet: tradingWallet } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
  });
  const symbol = hlCoinToBotSymbol(scanCoin ?? perpCoin);

  return (
    <div className="hl-bot-analysis">
      <TerminalBotAnalysisStrip
        walletConnected={walletConnected}
        metrics={metrics}
        vaultWallet={tradingWallet ?? address ?? null}
        openPositionCoins={openPositionCoins}
        symbol={symbol}
        placement="dock"
        botRunningHint={botRunning}
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
