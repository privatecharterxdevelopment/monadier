import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useBettingUi } from '../../contexts/BettingUiContext';
import { useBettingFeeGate } from '../../contexts/BettingFeeContext';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import { useWithdrawFeeGate } from '../../hooks/useWithdrawFeeGate';
import { useAuth } from '../../contexts/AuthContext';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { fmtClosedPnl, fmtUsdSymbol } from '../../lib/hyperliquid/format';
import BuyUsdcCta from './BuyUsdcCta';
import BuyUsdcModal from './BuyUsdcModal';

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
  const { open: openWallet } = useMonadierAppKit();
  const platformFees = usePlatformFeeGate();
  const bettingFees = useBettingFeeGate();
  const withdrawGate = useWithdrawFeeGate();
  const { isDemoUser, user } = useAuth();
  const { isConnected, address } = useMonadierWallet();
  const { metrics } = useDashboard2Metrics();
  const wallet = (walletAddress ?? address)?.toLowerCase();
  const { snapshot } = useHlAccountSnapshot(wallet);
  const [buyUsdcOpen, setBuyUsdcOpen] = useState(false);

  const isAuthenticated = Boolean(user) || isDemoUser;
  const hlPerpUsd = snapshot?.tradablePerpUsd ?? metrics.hlBalanceUsd;
  const hlSpotUsd = snapshot?.spotUsdcUsd ?? 0;
  const withdrawable = snapshot?.withdrawableUsd ?? metrics.hlWithdrawableUsd;
  const unified = snapshot?.unifiedAccount ?? false;

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
            <span>Equity</span>
            <strong>{fmt(snapshot?.totalUsd ?? hlPerpUsd)}</strong>
          </div>
          <div className="hl-funds-overview__row">
            <span>Open trades</span>
            <strong>{snapshot?.openPositionsCount ?? metrics.openPositionsCount}</strong>
          </div>
          {(snapshot?.openPositionsCount ?? 0) > 0 ? (
            <div
              className={`hl-funds-overview__row hl-funds-overview__row--hint${
                (snapshot?.unrealizedPnlUsd ?? 0) >= 0 ? ' hl-pos' : ' hl-neg'
              }`}
            >
              <span>Unrealized P/L</span>
              <strong>{fmtClosedPnl(snapshot?.unrealizedPnlUsd ?? 0)}</strong>
            </div>
          ) : null}
          {(snapshot?.totalMarginUsedUsd ?? 0) > 0.005 ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--hint">
              <span>Margin in use</span>
              <strong>{fmt(snapshot?.totalMarginUsedUsd ?? 0)}</strong>
            </div>
          ) : null}
          <div className="hl-funds-overview__row">
            <span title="USDC you can withdraw or redeploy after HL margin rules (open positions keep required margin locked).">
              Withdrawable
            </span>
            <strong>{fmt(withdrawable)}</strong>
          </div>
          {!unified && hlSpotUsd > 0.005 ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--hint">
              <span>Spot USDC</span>
              <strong>{fmt(hlSpotUsd)}</strong>
            </div>
          ) : null}
          {platformFees.accruedUsd > 0.000_001 && !platformFees.feesWaived ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--fee">
              <span>Bot fees owed</span>
              <button
                type="button"
                className="hl-funds-overview__fee-btn"
                onClick={() => platformFees.openPayModal()}
              >
                <strong>{fmt(platformFees.accruedUsd)}</strong>
                <span>
                  {platformFees.successWinCount}/{platformFees.winsBeforeBlock} win trades
                </span>
              </button>
            </div>
          ) : null}
          {!bettingFees.feesWaived && bettingFees.accruedUsd > 0.000_001 ? (
            <div className="hl-funds-overview__row hl-funds-overview__row--fee">
              <span>Betting fees owed</span>
              <button
                type="button"
                className="hl-funds-overview__fee-btn"
                onClick={() => bettingFees.openPayModal()}
              >
                <strong>{fmt(bettingFees.accruedUsd)}</strong>
                <span>
                  {bettingFees.successWinCount}/{bettingFees.winsBeforeBlock} win · pay before next bet
                </span>
              </button>
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
            disabled={withdrawable <= 0 && !withdrawGate.withdrawBlocked}
            onClick={() =>
              requireAccount('Sign in before withdrawing.', () =>
                withdrawGate.withdrawBlocked
                  ? withdrawGate.openPayModal()
                  : openFunds('withdraw')
              )
            }
          >
            <ArrowUpRight size={14} aria-hidden />
            Withdraw USDC
          </button>
          <BuyUsdcCta
            compact
            onClick={() =>
              requireAccount('Sign in before buying USDC.', () => {
                if (!isConnected) {
                  openWallet();
                  return;
                }
                setBuyUsdcOpen(true);
              })
            }
          />
        </div>

        <p className="hl-funds-overview__hint">
          {withdrawGate.withdrawBlocked ? (
            <>
              <strong>Fees are due</strong> — pay bot and/or betting fees on-chain to unlock
              in-app withdrawal.
              {withdrawGate.platformWithdrawBlocked ? (
                <> Bot: {fmt(withdrawGate.platformAccruedUsd)}.</>
              ) : null}
              {withdrawGate.bettingWithdrawBlocked ? (
                <> Betting: {fmt(withdrawGate.bettingAccruedUsd)}.</>
              ) : null}
            </>
          ) : (
            <>
              Buy native USDC on Arbitrum with card, then deposit to Hyperliquid. Withdrawable
              balance may be lower while a position is open.
            </>
          )}
        </p>
      </div>

      <BuyUsdcModal
        open={buyUsdcOpen}
        onClose={() => setBuyUsdcOpen(false)}
        walletAddress={address ?? walletAddress}
        onRequireWallet={() => openWallet()}
      />
    </section>
  );
};

export default HlFundsOverviewPanel;
