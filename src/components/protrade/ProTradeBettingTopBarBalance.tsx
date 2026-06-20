import React from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useAuth } from '../../contexts/AuthContext';
import { useBettingUi } from '../../contexts/BettingUiContext';
import { useBettingHeaderBalance } from '../../hooks/useBettingHeaderBalance';
import { fmtClosedPnl, fmtUsdSymbol } from '../../lib/hyperliquid/format';

type Props = {
  walletAddress?: string;
  walletConnected: boolean;
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeBettingTopBarBalance: React.FC<Props> = ({
  walletAddress,
  walletConnected,
  onRequireSignIn,
}) => {
  const { user } = useAuth();
  const { open } = useAppKit();
  const { scrollToRail, cashOutFirst } = useBettingUi();
  const signedIn = Boolean(user);
  const stats = useBettingHeaderBalance(walletAddress, signedIn && walletConnected);

  if (!signedIn) {
    return (
      <button
        type="button"
        className="hl-topnav-betting-balance hl-topnav-betting-balance--cta"
        onClick={() => onRequireSignIn?.('Sign in to see betting balance.')}
      >
        Sign in · bets
      </button>
    );
  }

  if (!walletConnected) {
    return (
      <button type="button" className="hl-topnav-betting-balance hl-topnav-betting-balance--cta" onClick={() => open()}>
        Connect · balance
      </button>
    );
  }

  return (
    <div className="hl-topnav-betting-balance" aria-label="Betting balance">
      <span className="hl-topnav-bet-stat" title="USDC on Hyperliquid">
        <span className="hl-topnav-bet-label">Balance</span>
        <strong>{fmtUsdSymbol(stats.balanceUsd)}</strong>
      </span>
      {stats.positionCount > 0 ? (
        <button
          type="button"
          className="hl-topnav-bet-stat hl-topnav-bet-stat--btn"
          title="Open bets"
          onClick={scrollToRail}
        >
          <span className="hl-topnav-bet-label">Open</span>
          <strong>
            {stats.positionCount} · {fmtUsdSymbol(stats.positionsValueUsd)}
          </strong>
          <span className={stats.unrealizedPnlUsd >= 0 ? 'hl-topnav-bet-pnl hl-pos' : 'hl-topnav-bet-pnl hl-neg'}>
            {fmtClosedPnl(stats.unrealizedPnlUsd)}
          </span>
        </button>
      ) : (
        <span className="hl-topnav-bet-stat hl-topnav-bet-stat--muted">
          <span className="hl-topnav-bet-label">Open</span>
          <strong>0</strong>
        </span>
      )}
      <span className="hl-topnav-bet-stat" title="Closed bets realized P/L">
        <span className="hl-topnav-bet-label">Closed</span>
        <strong>
          {stats.closedCount > 0
            ? `${stats.closedCount} · ${fmtClosedPnl(stats.realizedPnlUsd)}`
            : '0'}
        </strong>
      </span>
      {stats.positionCount > 0 ? (
        <button type="button" className="hl-topnav-bet-cashout" onClick={cashOutFirst}>
          Cash out
        </button>
      ) : null}
    </div>
  );
};

export default ProTradeBettingTopBarBalance;
