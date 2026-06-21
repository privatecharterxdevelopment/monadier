import React from 'react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { hlCoinToBotSymbol } from '../../lib/botTradingPairs';
import { isHlBotEnabled } from '../../lib/hlBotGates';
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
  const { settings } = useTerminalBotSettings();
  const { metrics } = useProTradeBot();
  const botRunning = isHlBotEnabled(settings.autoTradeEnabled || metrics.autoTradeEnabled);
  const symbol = hlCoinToBotSymbol(scanCoin ?? perpCoin);

  return (
    <div className="hl-bot-analysis hl-bot-analysis--under-chart">
      <TerminalBotAnalysisStrip
        walletConnected={walletConnected}
        metrics={metrics}
        vaultWallet={address ?? null}
        openPositionCoins={openPositionCoins}
        symbol={symbol}
        placement="dock"
        botRunningHint={botRunning}
      />
    </div>
  );
};

export default ProTradeBotAnalysis;
