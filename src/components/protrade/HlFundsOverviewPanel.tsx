import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useBettingUi } from '../../contexts/BettingUiContext';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';

type Props = {
  walletAddress?: string | null;
  onRequireSignIn?: (reason: string) => void;
  className?: string;
  title?: string;
};

const fmt = (n: number) => fmtUsdSymbol(n);

const HlFundsOverviewPanel: React.FC<Props> = ({
  walletAddress,
  onRequireSignIn,
  className = '',
  title = 'Hyperliquid funds',
}) => {
  const { openFunds } = useBettingUi();
  const platformFees = usePlatformFeeGate();
  const { isDemoUser, user } = useAuth();
  const { isConnected, address } = useMonadierWallet();
  const { metrics } = useDashboard2Metrics();
  const wallet = (walletAddress ?? address)?.toLowerCase();
  const { snapshot } = useHlAccountSnapshot(wallet);

  const isAuthenticated = Boolean(user) || isDemoUser;
  const hlPerpUsd = snapshot?.tradablePerpUsd ?? metrics.hlBalanceUsd;
  const hlSpotUsd = snapshot?.spotUsdcUsd ?? 0;
  const withdrawable = snapshot?.withdrawableUsd ?? metrics.hlWithdrawableUsd;
  const unified = snapshot?.unifiedAccount ?? false;
  const marginLocked = snapshot?.totalMarginUsedUsd ?? 0;
  const hasOpenPosition = (snapshot?.openPositionsCount ?? metrics.openPositionsCount) > 0;

  const requireAccount = (reason: string, next: () => void) => {
    if (!isDemoUser && !isAuthenticated) {
      onRequireSignIn?.(reason);
      return;
    }
    next();
  };

  if (!isConnected && !wallet) return null;

  return (
    <section className={`hl-funds-overview ${className}`.trim()}>
      <div className="hl-funds-overview__head">
        <h2 className="hl-funds-overview__title">{title}</h2>
      </div>
      <div className="hl-funds-overview__card">
        <div className="hl-funds-overview__breakdown">
          <div className="hl-funds-overview__row">
            <span>{unified ? 'Trading balance' : 'HL balance'}</span>
            <strong>{fmt(hlPerpUsd)}</strong>
          </div>
          {!unified && hlSpotUsd > 0.005 ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--hint">
              <span>Spot USDC</span>
              <strong>{fmt(hlSpotUsd)}</strong>
            </div>
          ) : null}
          <div className="hl-funds-overview__row">
            <span>Withdrawable</span>
            <strong>{fmt(withdrawable)}</strong>
          </div>
          <div className="hl-funds-overview__row hl-funds-overview__row--fee">
            <span>Bot fees owed</span>
            <button
              type="button"
              className="hl-funds-overview__fee-btn"
              onClick={() => platformFees.openPayModal()}
              disabled={platformFees.feesWaived}
            >
              <strong>{fmt(platformFees.accruedUsd)}</strong>
              <span>
                {platformFees.successWinCount}/{platformFees.winsBeforeBlock} win trades
              </span>
            </button>
          </div>
          {hasOpenPosition && marginLocked > 0.01 ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--hint">
              <span>Margin in open trade</span>
              <strong>{fmt(marginLocked)}</strong>
            </div>
          ) : null}
        </div>

        <div className="hl-funds-overview__actions">
          <button
            type="button"
            className="hl-funds-overview__btn hl-funds-overview__btn--primary"
            onClick={() =>
              requireAccount('Sign in before depositing to Hyperliquid.', () => openFunds('deposit'))
            }
          >
            <ArrowDownLeft size={14} aria-hidden />
            Deposit USDC
          </button>
          <button
            type="button"
            className="hl-funds-overview__btn"
            disabled={withdrawable <= 0 && !platformFees.withdrawBlocked}
            onClick={() =>
              requireAccount('Sign in before withdrawing.', () =>
                platformFees.withdrawBlocked
                  ? platformFees.openPayModal()
                  : openFunds('withdraw')
              )
            }
          >
            <ArrowUpRight size={14} aria-hidden />
            Withdraw USDC
          </button>
        </div>

        <p className="hl-funds-overview__hint">
          {platformFees.withdrawBlocked ? (
            <>
              <strong>Platform fees are due</strong> — pay to unlock in-app withdrawal. Bot trading
              continues until {platformFees.winsBeforeBlock} unpaid wins.
            </>
          ) : (
            <>
              Deposit native USDC on Arbitrum. Withdrawable balance may be lower while a position is
              open.
            </>
          )}
        </p>
      </div>
    </section>
  );
};

export default HlFundsOverviewPanel;
