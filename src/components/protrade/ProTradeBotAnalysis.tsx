import React from 'react';
import { useAccount } from 'wagmi';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import TerminalBotAnalysisStrip from '../terminal/TerminalBotAnalysisStrip';
import { useProTradeBot } from './ProTradeBotSide';

type Props = {
  walletConnected: boolean;
  perpCoin: string;
};

/** Live bot scan bar under the Pro Trade chart. */
const ProTradeBotAnalysis: React.FC<Props> = ({ walletConnected, perpCoin }) => {
  const { address } = useAccount();
  const { metrics } = useProTradeBot();

  return (
    <div className="hl-bot-analysis">
      <TerminalBotAnalysisStrip
        walletConnected={walletConnected}
        metrics={metrics}
        vaultWallet={address}
        symbol={hlCoinToBotSymbol(perpCoin)}
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
