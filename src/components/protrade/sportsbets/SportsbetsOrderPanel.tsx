import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, SlidersHorizontal } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import {
  OUTCOME_MIN_NOTIONAL_USD,
  validateOutcomeOrder,
} from '../../../lib/hyperliquid/outcomes/orders';
import { previewOutcomeBuy } from '../../../lib/hyperliquid/outcomes/payout';
import { outcomeBuyReferencePx, outcomeSellReferencePx } from '../../../lib/hyperliquid/outcomes/book';
import {
  formatDecimalOdds,
  formatOutcomePriceCents,
  OUTCOME_PREVIEW_STAKE_USD,
} from '../../../lib/hyperliquid/outcomes/display';
import {
  formatBettingMarketExpirySubtitle,
  formatBettingMarketName,
} from '../../../lib/hyperliquid/outcomes/categories';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import type { HlOutcomeMarket, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import type { useHyperliquidOutcomeTrading } from '../../../hooks/useHyperliquidOutcomeTrading';
import SportsbetsPayoutCard from './SportsbetsPayoutCard';

type Trading = ReturnType<typeof useHyperliquidOutcomeTrading>;

type Props = {
  market: HlOutcomeMarket | null;
  side: OutcomeSideIndex;
  quote: OutcomeLegQuote | null;
  quoteLoading: boolean;
  bettingBalance: number;
  walletConnected: boolean;
  signedIn: boolean;
  onRequireSignIn?: (reason: string) => void;
  trading: Trading;
  positionSize: number;
  onSuccess?: () => void;
  /** When set, syncs buy/sell tab (e.g. from My bets cash out). */
  orderAction?: Action;
  onOrderActionChange?: (action: Action) => void;
};

type OrderMode = 'market' | 'limit';
type Action = 'buy' | 'sell';
type StakeMode = 'usd' | 'contracts';

const QUICK_STAKES_USD = [10, 25, 50, 100];

const SportsbetsOrderPanel: React.FC<Props> = ({
  market,
  side,
  quote,
  quoteLoading,
  bettingBalance,
  walletConnected,
  signedIn,
  onRequireSignIn,
  trading,
  positionSize,
  onSuccess,
  orderAction: orderActionProp,
  onOrderActionChange,
}) => {
  const { open } = useAppKit();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [actionInternal, setActionInternal] = useState<Action>('buy');
  const action = orderActionProp ?? actionInternal;
  const setAction = (next: Action) => {
    if (orderActionProp === undefined) setActionInternal(next);
    onOrderActionChange?.(next);
  };
  const [mode, setMode] = useState<OrderMode>('market');
  const [stakeMode, setStakeMode] = useState<StakeMode>('usd');
  const [stakeInput, setStakeInput] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const canBet = signedIn && walletConnected;
  const gateReason = !signedIn
    ? 'Sign in to bet'
    : !walletConnected
      ? 'Connect wallet'
      : null;

  const sideBook = quote ? (side === 0 ? quote.yes : quote.no) : null;
  const sideLabel = market ? (side === 0 ? market.yesLabel : market.noLabel) : 'Yes';
  const marketExpiry = market ? formatBettingMarketExpirySubtitle(market) : null;

  const effectiveAction = action;
  const effectiveMode = advancedOpen ? mode : 'market';
  const isCashOut = effectiveAction === 'sell';
  const effectiveStakeMode = isCashOut ? 'contracts' : advancedOpen ? stakeMode : 'usd';

  const referencePx = useMemo(() => {
    if (!sideBook) return 0;
    return effectiveAction === 'buy' ? outcomeBuyReferencePx(sideBook) : outcomeSellReferencePx(sideBook);
  }, [effectiveAction, sideBook]);

  const parsedStake = Number(stakeInput);
  const parsedLimit = Number(limitPrice);
  const orderPrice =
    effectiveMode === 'limit' && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : referencePx;

  const contractSize = useMemo(() => {
    if (!Number.isFinite(parsedStake) || parsedStake <= 0 || orderPrice <= 0) return 0;
    if (effectiveStakeMode === 'contracts') return Math.floor(parsedStake);
    return Math.floor(parsedStake / orderPrice);
  }, [parsedStake, orderPrice, effectiveStakeMode]);

  const payoutPreview = useMemo(
    () =>
      orderPrice > 0 && contractSize > 0
        ? previewOutcomeBuy({ contracts: contractSize, price: orderPrice })
        : effectiveStakeMode === 'usd' && Number.isFinite(parsedStake) && parsedStake > 0 && orderPrice > 0
          ? previewOutcomeBuy({ stakeUsd: parsedStake, price: orderPrice })
          : null,
    [contractSize, orderPrice, parsedStake, effectiveStakeMode]
  );

  const notional = payoutPreview?.stakeUsd ?? 0;
  const validation =
    market && contractSize > 0 && orderPrice > 0
      ? validateOutcomeOrder({ size: contractSize, price: orderPrice })
      : null;

  const canSell = positionSize > 0;

  useEffect(() => {
    if (isCashOut && positionSize > 0) {
      setStakeMode('contracts');
      setStakeInput(String(Math.floor(positionSize)));
    }
  }, [isCashOut, positionSize, market?.outcomeId, side]);

  const statusMessage = trading.error ?? localMsg ?? validation;

  const handleGate = () => {
    if (signedIn) {
      open();
      return;
    }
    onRequireSignIn?.('Sign in to place bets.');
  };

  const handleSubmit = async () => {
    if (!canBet) {
      handleGate();
      return;
    }
    if (!market || !quote || !payoutPreview) return;
    setLocalMsg(null);
    const size = payoutPreview.contracts;
    try {
      if (effectiveAction === 'buy') {
        await trading.buyOutcome({
          outcomeId: market.outcomeId,
          side,
          size,
          kind: effectiveMode,
          limitPrice: effectiveMode === 'limit' ? parsedLimit : undefined,
          quote,
        });
        setLocalMsg('Bet placed');
        setAction('buy');
      } else {
        if (size > positionSize) {
          throw new Error(`You only hold ${Math.floor(positionSize)} contracts`);
        }
        await trading.sellOutcome({
          outcomeId: market.outcomeId,
          side,
          size,
          kind: effectiveMode,
          limitPrice: effectiveMode === 'limit' ? parsedLimit : undefined,
          quote,
          reduceOnly: true,
        });
        setLocalMsg('Cash out submitted');
        setAction('buy');
      }
      onSuccess?.();
    } catch {
      /* trading hook sets error */
    }
  };

  return (
    <aside className="hl-sb-order">
      {gateReason ? (
        <div className="hl-sb-order-gate">
          <span>{gateReason}</span>
          {!signedIn ? (
            <button type="button" className="hl-sb-order-gate-btn" onClick={() => onRequireSignIn?.('Sign in to place bets.')}>
              Sign in
            </button>
          ) : (
            <button type="button" className="hl-sb-order-gate-btn" onClick={() => open()}>
              Connect
            </button>
          )}
        </div>
      ) : null}

      {!market ? (
        <p className="hl-sb-muted hl-sb-order-empty">Pick Yes or No to bet.</p>
      ) : (
        <>
          <div className="hl-sb-order-head">
            <div className={`hl-sb-order-pick-box hl-sb-order-pick-box--${side === 0 ? 'yes' : 'no'}`}>
              <span className="hl-sb-order-pick-side">{sideLabel}</span>
              <span className="hl-sb-order-pick-market">{formatBettingMarketName(market)}</span>
              {marketExpiry ? (
                <span className="hl-sb-order-pick-expiry">{marketExpiry}</span>
              ) : null}
            </div>
            <button
              type="button"
              className={`hl-sb-icon-btn ${advancedOpen ? 'hl-sb-icon-btn--on' : ''}`}
              aria-label="Order settings"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} aria-hidden />
            </button>
          </div>

          {canSell ? (
            <div className="hl-sb-order-tabs hl-sb-order-tabs--primary" role="group" aria-label="Bet or cash out">
              <button
                type="button"
                className={action === 'buy' ? 'hl-sb-order-tab hl-sb-order-tab--on' : 'hl-sb-order-tab'}
                onClick={() => setAction('buy')}
              >
                Bet
              </button>
              <button
                type="button"
                className={action === 'sell' ? 'hl-sb-order-tab hl-sb-order-tab--on hl-sb-order-tab--sell' : 'hl-sb-order-tab'}
                onClick={() => setAction('sell')}
              >
                Cash out
              </button>
            </div>
          ) : null}

          {advancedOpen ? (
            <div className="hl-sb-order-settings">
              <div className="hl-sb-order-controls hl-sb-order-controls--compact" role="group" aria-label="Order settings">
                <button
                  type="button"
                  className={mode === 'market' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
                  onClick={() => setMode('market')}
                >
                  Market
                </button>
                <button
                  type="button"
                  className={mode === 'limit' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
                  onClick={() => setMode('limit')}
                >
                  Limit
                </button>
                <button
                  type="button"
                  className={stakeMode === 'usd' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
                  onClick={() => setStakeMode('usd')}
                >
                  USD
                </button>
                <button
                  type="button"
                  className={stakeMode === 'contracts' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
                  onClick={() => setStakeMode('contracts')}
                >
                  Contracts
                </button>
              </div>

              {mode === 'limit' ? (
                <label className="hl-sb-field hl-sb-field--compact">
                  <span>Limit price</span>
                  <input
                    type="number"
                    min={0.001}
                    max={0.999}
                    step={0.0001}
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder={referencePx > 0 ? referencePx.toFixed(4) : '0.5000'}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <label className="hl-sb-field hl-sb-field--stake">
            <span>
              {isCashOut
                ? 'Contracts to sell'
                : effectiveStakeMode === 'contracts'
                  ? 'Contracts'
                  : 'Amount (USD)'}
            </span>
            <input
              type="number"
              min={effectiveStakeMode === 'contracts' ? 1 : OUTCOME_MIN_NOTIONAL_USD}
              step={1}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              placeholder={
                effectiveStakeMode === 'contracts' ? '10' : String(OUTCOME_PREVIEW_STAKE_USD)
              }
            />
          </label>

          {effectiveStakeMode === 'usd' && !isCashOut ? (
            <div className="hl-sb-quick-stakes" role="group" aria-label="Quick stake amounts">
              {QUICK_STAKES_USD.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={parsedStake === amt ? 'hl-sb-quick-stake hl-sb-quick-stake--on' : 'hl-sb-quick-stake'}
                  onClick={() => setStakeInput(String(amt))}
                >
                  ${amt}
                </button>
              ))}
            </div>
          ) : null}

          <SportsbetsPayoutCard
            preview={payoutPreview}
            action={effectiveAction}
            loading={quoteLoading && referencePx <= 0}
            simple={!advancedOpen}
          />

          <div className="hl-sb-order-odds">
            <span>Odds</span>
            <strong>
              {quoteLoading || referencePx <= 0
                ? '—'
                : `${formatDecimalOdds(referencePx)}× · ${formatOutcomePriceCents(referencePx)}`}
            </strong>
          </div>

          {canBet ? (
            <div className="hl-sb-order-meta">
              <span>
                Balance <strong>{fmtUsdSymbol(bettingBalance)}</strong>
              </span>
              <span className="hl-sb-order-meta-sep" aria-hidden>
                ·
              </span>
              <span>Min {fmtUsdSymbol(OUTCOME_MIN_NOTIONAL_USD)}</span>
              {isCashOut ? (
                <>
                  <span className="hl-sb-order-meta-sep" aria-hidden>
                    ·
                  </span>
                  <span>
                    Position <strong>{Math.floor(positionSize)}</strong>
                  </span>
                </>
              ) : null}
              {!isCashOut && bettingBalance <= 0 ? (
                <>
                  <span className="hl-sb-order-meta-sep" aria-hidden>
                    ·
                  </span>
                  <span className="hl-sb-order-meta-warn">Need USDC on HL</span>
                </>
              ) : null}
            </div>
          ) : null}

          {statusMessage ? (
            <div
              className={`hl-sb-order-notice ${trading.error || validation ? 'hl-sb-order-notice--err' : ''}`}
              role="status"
            >
              {trading.error || validation ? <AlertCircle size={12} aria-hidden /> : null}
              <span>{statusMessage}</span>
            </div>
          ) : null}

          <button
            type="button"
            className={`hl-sb-order-submit ${isCashOut ? 'hl-sb-order-submit--sell' : ''}`}
            disabled={
              canBet &&
              (trading.busy ||
                quoteLoading ||
                !quote ||
                referencePx <= 0 ||
                !payoutPreview ||
                Boolean(validation) ||
                notional < OUTCOME_MIN_NOTIONAL_USD ||
                (isCashOut && payoutPreview.contracts > positionSize))
            }
            onClick={() => void handleSubmit()}
          >
            {trading.busy ? <Loader2 size={16} className="hl-spin" aria-hidden /> : null}
            {!canBet
              ? signedIn
                ? 'Connect wallet'
                : 'Sign in'
              : isCashOut
                ? `Cash out ${sideLabel}`
                : `Bet ${sideLabel}`}
          </button>
        </>
      )}
    </aside>
  );
};

export default SportsbetsOrderPanel;
