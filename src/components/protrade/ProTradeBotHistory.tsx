import React, { useState } from 'react';
import ProTradeHlBotDock, { type HlBotDockTab } from './ProTradeHlBotDock';

type Props = {
  refreshKey?: number;
  walletAddress?: string | null;
  walletConnected?: boolean;
};

const ProTradeBotHistory: React.FC<Props> = ({
  refreshKey = 0,
  walletAddress,
  walletConnected = false,
}) => {
  const [tab, setTab] = useState<HlBotDockTab>('tradeHistory');

  return (
    <div className="hl-history-page">
      <header className="hl-history-head">
        <h1 className="hl-history-title">Bot trade history</h1>
        <p className="hl-history-sub">
          Hyperliquid perps — fills and closed P/L from your HL account.
        </p>
      </header>
      <div className="hl-history-body hl-bot-dock">
        <ProTradeHlBotDock
          activeTab={tab}
          onTabChange={setTab}
          refreshKey={refreshKey}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
        />
      </div>
    </div>
  );
};

export default ProTradeBotHistory;
