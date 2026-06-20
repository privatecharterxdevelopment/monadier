import React from 'react';
import ProTradeBettingTables from './ProTradeBettingTables';
import { useBettingPortfolio } from '../../hooks/useBettingPortfolio';

type Props = {
  walletAddress?: string | null;
  walletConnected?: boolean;
  onNavigateBetting?: () => void;
};

const ProTradeBettingHistory: React.FC<Props> = ({
  walletAddress,
  walletConnected = false,
  onNavigateBetting,
}) => {
  const betting = useBettingPortfolio({
    walletAddress: walletAddress ?? undefined,
    enabled: walletConnected,
  });

  return (
    <div className="hl-history-page">
      <header className="hl-history-head">
        <h1 className="hl-history-title">Betting history</h1>
        <p className="hl-history-sub">
          Open and settled HIP-4 bets — synced to your account from Hyperliquid.
        </p>
      </header>
      <div className="hl-history-body">
        {!walletConnected ? (
          <p className="hl-portfolio-empty">Connect wallet to sync your bets.</p>
        ) : (
          <ProTradeBettingTables
            openBets={betting.openBets}
            closedBets={betting.closedBets}
            loading={betting.loading}
            syncing={betting.syncing}
            signedIn={betting.signedIn}
            showSummary
            summary={betting.summary}
            onNavigateBetting={onNavigateBetting}
          />
        )}
      </div>
    </div>
  );
};

export default ProTradeBettingHistory;
