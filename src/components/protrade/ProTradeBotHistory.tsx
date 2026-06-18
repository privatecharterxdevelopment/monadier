import React, { useState } from 'react';
import TerminalPositionsDock, { type DockTab } from '../terminal/TerminalPositionsDock';

type Props = {
  highlightPositionId?: string | null;
  refreshKey?: number;
  botRunning?: boolean;
};

const ProTradeBotHistory: React.FC<Props> = ({
  highlightPositionId = null,
  refreshKey = 0,
  botRunning = false,
}) => {
  const [tab, setTab] = useState<DockTab>('history');

  return (
    <div className="hl-history-page">
      <header className="hl-history-head">
        <h1 className="hl-history-title">Bot trade history</h1>
        <p className="hl-history-sub">
          Hyperliquid bot trades — wallets linked in Profile → Wallets.
        </p>
      </header>
      <div className="hl-history-body hl-bot-dock">
        <TerminalPositionsDock
          id="hl-bot-history-page"
          layout="page"
          botRunning={botRunning}
          activeTab={tab}
          onTabChange={setTab}
          refreshKey={refreshKey}
          includeClosedHistoryFeed
          highlightPositionId={highlightPositionId}
          skin="hl"
        />
      </div>
    </div>
  );
};

export default ProTradeBotHistory;
