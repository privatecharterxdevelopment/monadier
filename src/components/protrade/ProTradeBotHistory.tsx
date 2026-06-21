import React from 'react';
import ProTradeHlBotDock from './ProTradeHlBotDock';

type Props = {
  refreshKey?: number;
  walletAddress?: string | null;
  walletConnected?: boolean;
  /** Rendered inside Profile → Bot trades (no standalone page chrome). */
  embedded?: boolean;
};

const ProTradeBotHistory: React.FC<Props> = ({
  refreshKey = 0,
  walletAddress,
  walletConnected = false,
  embedded = false,
}) => (
  <div className={`hl-history-page${embedded ? ' hl-history-page--embedded' : ''}`}>
    <header className="hl-history-head">
      <h1 className="hl-history-title">Bot trade history</h1>
      <p className="hl-history-sub">
        Hyperliquid perps — fills and closed P/L from your HL account.
      </p>
    </header>
    <div className="hl-history-body hl-bot-dock">
      <ProTradeHlBotDock
        activeTab="tradeHistory"
        refreshKey={refreshKey}
        walletAddress={walletAddress}
        walletConnected={walletConnected}
        historyOnly
      />
    </div>
  </div>
);

export default ProTradeBotHistory;
