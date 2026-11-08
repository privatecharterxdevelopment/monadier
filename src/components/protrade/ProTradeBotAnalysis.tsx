import React from 'react';
import { useHlActiveWallet } from '../../hooks/useHlActiveWallet';
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
  const { wallet } = useHlActiveWallet();
  const { metrics } = useProTradeBot();
  const symbol = hlCoinToBotSymbol(scanCoin ?? perpCoin);

  return (
    <div className="hl-bot-analysis">
      <TerminalBotAnalysisStrip
        walletConnected={walletConnected || Boolean(wallet)}
        metrics={metrics}
        vaultWallet={wallet ?? null}
        openPositionCoins={openPositionCoins}
        symbol={symbol}
        placement="dock"
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
