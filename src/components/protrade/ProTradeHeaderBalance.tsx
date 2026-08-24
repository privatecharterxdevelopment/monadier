import React, { useMemo } from 'react';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useAuth } from '../../contexts/AuthContext';
import { useBettingUi } from '../../contexts/BettingUiContext';
import { useBettingHeaderBalance } from '../../hooks/useBettingHeaderBalance';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { useHlBotManagedCoins } from '../../hooks/useHlBotManagedCoins';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { filterHlPositions } from '../../lib/hyperliquid/splitHlPositions';
import { fmtClosedPnl, fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';

export type HeaderBalanceSection = 'perps' | 'bot' | 'betting' | 'other';

type Props = {
  section: HeaderBalanceSection;
  walletAddress?: string;
  walletConnected: boolean;
  onRequireSignIn?: (reason: string) => void;
  compact?: boolean;
};

/** One Hyperliquid account — same USDC for perps, bot, and betting. */
const ProTradeHeaderBalance: React.FC<Props> = ({
  section,
  walletAddress,
  walletConnected,
  onRequireSignIn,
  compact = false,
}) => {
  const { user } = useAuth();
  const { open } = useMonadierAppKit();
  const { isRestoring } = useMonadierWallet();
  const { scrollToRail, cashOutFirst, openFunds } = useBettingUi();
  const signedIn = Boolean(user);
  const enabled = signedIn && walletConnected;
  const { snapshot } = useHlAccountSnapshot(enabled ? walletAddress : undefined);
  const { account, fills } = useHyperliquidAccount(enabled ? walletAddress : undefined);
  const openCoins = useMemo(
    () =>
      (account?.positions ?? [])
        .filter((p) => Math.abs(toNum(p.szi)) > 1e-12)
        .map((p) => p.coin),
    [account?.positions]
  );
  const { coins: botManagedCoins } = useHlBotManagedCoins(
    enabled && section !== 'betting' ? walletAddress : undefined,
    0,
    openCoins,
    fills
  );
  const betStats = useBettingHeaderBalance(walletAddress, enabled && section === 'betting');
  const platformFees = usePlatformFeeGate();

  const scopedHlPositions = useMemo(() => {
    if (section === 'betting') return [];
    const scope = section === 'bot' ? 'bot' : 'manual';
    return filterHlPositions(account?.positions, botManagedCoins, scope);
  }, [account?.positions, botManagedCoins, section]);

  const scopedOpenCount = scopedHlPositions.length;
  const scopedUnrealizedPnlUsd = useMemo(
    () => scopedHlPositions.reduce((s, p) => s + toNum(p.unrealizedPnl), 0),
    [scopedHlPositions]
  );

  /**
   * Account equity for the pill — same number Funds/footer use.
   * On unified books, clearinghouse `accountValue` is often just the margin
   * slice on open perps (~$8) while Spot USDC is the real equity (~$260).
   * Never prefer raw perp AV alone when the funding snapshot has Spot.
   */
  const livePerpEquityUsd = Math.max(
    toNum(account?.margin?.accountValue),
    toNum(account?.crossMargin?.accountValue),
    0
  );
  const balanceUsd = Math.max(
    snapshot?.totalUsd ?? 0,
    snapshot?.tradablePerpUsd ?? 0,
    snapshot?.spotUsdcUsd ?? 0,
    livePerpEquityUsd,
    betStats.balanceUsd ?? 0,
    0
  );
  const showExtended = !compact && section !== 'other';

  const balancePill = (
    <button
      type="button"
      className={
        compact || !showExtended
          ? 'hl-topnav-bet-stat hl-topnav-bet-stat--btn hl-topnav-bet-stat--compact'
          : 'hl-topnav-bet-stat hl-topnav-bet-stat--btn'
      }
      title="Account equity on Hyperliquid — deposit or withdraw"
      onClick={() => openFunds('deposit')}
    >
      <span className="hl-topnav-bet-label">{showExtended && !compact ? 'Balance' : 'HL'}</span>
      <strong>{fmtUsdSymbol(balanceUsd)}</strong>
    </button>
  );

  if (!signedIn) {
    return (
      <button
        type="button"
        className="hl-topnav-betting-balance hl-topnav-betting-balance--cta hl-topnav-betting-balance--primary"
        onClick={() => onRequireSignIn?.('Sign in to see your Hyperliquid balance.')}
      >
        Sign in · HL
      </button>
    );
  }

  if (!walletConnected) {
    if (isRestoring) {
      return (
        <span className="hl-topnav-betting-balance hl-topnav-betting-balance--restoring">
          Restoring wallet…
        </span>
      );
    }
    return (
      <button
        type="button"
        className="hl-topnav-betting-balance hl-topnav-betting-balance--cta hl-topnav-betting-balance--primary"
        onClick={() => open()}
      >
        Connect · HL
      </button>
    );
  }

  if (compact || !showExtended) {
    return balancePill;
  }

  if (section === 'betting') {
    return (
      <div className="hl-topnav-betting-balance" aria-label="Hyperliquid balance">
        {balancePill}
        {betStats.positionCount > 0 ? (
          <button
            type="button"
            className="hl-topnav-bet-stat hl-topnav-bet-stat--btn"
            title="Open bets"
            onClick={scrollToRail}
          >
            <span className="hl-topnav-bet-label">Open</span>
            <strong>
              {betStats.positionCount} · {fmtUsdSymbol(betStats.positionsValueUsd)}
            </strong>
            <span
              className={
                betStats.unrealizedPnlUsd >= 0 ? 'hl-topnav-bet-pnl hl-pos' : 'hl-topnav-bet-pnl hl-neg'
              }
            >
              {fmtClosedPnl(betStats.unrealizedPnlUsd)}
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
            {betStats.closedCount > 0
              ? `${betStats.closedCount} · ${fmtClosedPnl(betStats.realizedPnlUsd)}`
              : '0'}
          </strong>
        </span>
        {betStats.positionCount > 0 ? (
          <button type="button" className="hl-topnav-bet-cashout" onClick={cashOutFirst}>
            Cash out
          </button>
        ) : null}
      </div>
    );
  }

  const openCount =
    section === 'perps' || section === 'bot' ? scopedOpenCount : snapshot?.openPositionsCount ?? 0;
  const unrealizedPnlUsd =
    section === 'perps' || section === 'bot'
      ? scopedUnrealizedPnlUsd
      : snapshot?.unrealizedPnlUsd ?? 0;
  const openTitle =
    section === 'bot' ? 'Open bot positions' : 'Open manual perp positions';

  const feesOwed = platformFees.accruedUsd;
  const showFees =
    section === 'bot' && !platformFees.feesWaived && feesOwed > 0.000_001;
  const feeGateActive = platformFees.opensBlocked;

  return (
    <div className="hl-topnav-betting-balance" aria-label="Hyperliquid balance">
      {balancePill}
      {openCount > 0 ? (
        <button type="button" className="hl-topnav-bet-stat hl-topnav-bet-stat--btn" title={openTitle}>
          <span className="hl-topnav-bet-label">Open</span>
          <strong>{openCount}</strong>
          <span
            className={
              unrealizedPnlUsd >= 0 ? 'hl-topnav-bet-pnl hl-pos' : 'hl-topnav-bet-pnl hl-neg'
            }
          >
            {fmtClosedPnl(unrealizedPnlUsd)}
          </span>
        </button>
      ) : (
        <span className="hl-topnav-bet-stat hl-topnav-bet-stat--muted">
          <span className="hl-topnav-bet-label">Open</span>
          <strong>0</strong>
        </span>
      )}
      {showFees ? (
        <button
          type="button"
          className={`hl-topnav-bet-stat hl-topnav-bet-stat--btn hl-topnav-bet-stat--fee-pay${feeGateActive ? ' hl-topnav-bet-stat--fee-due' : ''}`}
          title={
            feeGateActive
              ? 'Pay fees now and reactivate the bot'
              : 'Pay 10% success fees anytime after a winning close'
          }
          onClick={platformFees.openPayModal}
        >
          <span className="hl-topnav-bet-label">Pay Fees</span>
          <strong>{fmtUsdSymbol(feesOwed)}</strong>
        </button>
      ) : null}
    </div>
  );
};

export default ProTradeHeaderBalance;

function headerBalanceSection(section: string): HeaderBalanceSection {
  if (section === 'sportsbets') return 'betting';
  if (section === 'perps') return 'perps';
  if (section === 'bot') return 'bot';
  return 'other';
}

export { headerBalanceSection };
