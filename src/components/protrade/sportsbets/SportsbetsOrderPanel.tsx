import React, { useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
  formatStakeReturnPreview,
  OUTCOME_PREVIEW_STAKE_USD,
} from '../../../lib/hyperliquid/outcomes/display';
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
};

type OrderMode = 'market' | 'limit';
type Action = 'buy' | 'sell';
type StakeMode = 'usd' | 'contracts';

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
}) => {
  const { open } = useAppKit();
  const [action, setAction] = useState<Action>('buy');
  const [mode, setMode] = useState<OrderMode>('market');
  const [stakeMode, setStakeMode] = useState<StakeMode>('usd');
  const [stakeInput, setStakeInput] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const canBet = signedIn && walletConnected;
  const gateReason = !signedIn
    ? 'Sign in to place bets.'
    : !walletConnected
      ? 'Connect your wallet to sign bets on Hyperliquid.'
      : null;

  const sideBook = quote ? (side === 0 ? quote.yes : quote.no) : null;
  const sideLabel = market ? (side === 0 ? market.yesLabel : market.noLabel) : 'Yes';

  const referencePx = useMemo(() => {
    if (!sideBook) return 0;
    return action === 'buy' ? outcomeBuyReferencePx(sideBook) : outcomeSellReferencePx(sideBook);
  }, [action, sideBook]);

  const parsedStake = Number(stakeInput);
  const parsedLimit = Number(limitPrice);
  const orderPrice =
    mode === 'limit' && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : referencePx;

  const contractSize = useMemo(() => {
    if (!Number.isFinite(parsedStake) || parsedStake <= 0 || orderPrice <= 0) return 0;
    if (stakeMode === 'contracts') return Math.floor(parsedStake);
    return Math.floor(parsedStake / orderPrice);
  }, [parsedStake, orderPrice, stakeMode]);

  const payoutPreview = useMemo(
    () =>
      orderPrice > 0 && contractSize > 0
        ? previewOutcomeBuy({ contracts: contractSize, price: orderPrice })
        : stakeMode === 'usd' && Number.isFinite(parsedStake) && parsedStake > 0 && orderPrice > 0
          ? previewOutcomeBuy({ stakeUsd: parsedStake, price: orderPrice })
          : null,
    [contractSize, orderPrice, parsedStake, stakeMode]
  );

  const notional = payoutPreview?.stakeUsd ?? 0;
  const validation =
    market && contractSize > 0 && orderPrice > 0
      ? validateOutcomeOrder({ size: contractSize, price: orderPrice })
      : null;

  const canSell = positionSize > 0;

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
      if (action === 'buy') {
        await trading.buyOutcome({
          outcomeId: market.outcomeId,
          side,
          size,
          kind: mode,
          limitPrice: mode === 'limit' ? parsedLimit : undefined,
          quote,
        });
        setLocalMsg('Bet placed');
      } else {
        if (size > positionSize) {
          throw new Error(`You only hold ${Math.floor(positionSize)} contracts`);
        }
        await trading.sellOutcome({
          outcomeId: market.outcomeId,
          side,
          size,
          kind: mode,
          limitPrice: mode === 'limit' ? parsedLimit : undefined,
          quote,
          reduceOnly: true,
        });
        setLocalMsg('Cash out submitted');
      }
      onSuccess?.();
    } catch {
      /* trading hook sets error */
    }
  };

  return (
    <aside className="hl-sb-order">
      <h3 className="hl-sb-order-title">Place bet</h3>

      {gateReason ? (
        <div className="hl-sb-panel hl-sb-panel--muted">
          <p className="hl-sb-panel-title">{gateReason}</p>
          <div className="hl-sb-panel-actions">
            {!signedIn ? (
              <button
                type="button"
                className="hl-sb-btn hl-sb-btn--primary"
                onClick={() => onRequireSignIn?.('Sign in to place bets.')}
              >
                Sign in
              </button>
            ) : null}
            {!walletConnected ? (
              <button type="button" className="hl-sb-btn hl-sb-btn--primary" onClick={() => open()}>
                Connect wallet
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!market ? (
        <p className="hl-sb-muted">Select Yes or No on a market to preview your bet.</p>
      ) : (
        <>
          <p className="hl-sb-order-sub">
            {market.name} · {sideLabel}
          </p>

          <div className="hl-sb-order-tabs">
            <button
              type="button"
              className={action === 'buy' ? 'hl-sb-order-tab hl-sb-order-tab--on' : 'hl-sb-order-tab'}
              onClick={() => setAction('buy')}
            >
              Bet
            </button>
            <button
              type="button"
              className={action === 'sell' ? 'hl-sb-order-tab hl-sb-order-tab--on' : 'hl-sb-order-tab'}
              onClick={() => setAction('sell')}
              disabled={!canSell}
            >
              Cash out
            </button>
          </div>

          <div className="hl-sb-order-mode">
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
          </div>

          <div className="hl-sb-order-mode">
            <button
              type="button"
              className={stakeMode === 'usd' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
              onClick={() => setStakeMode('usd')}
            >
              Stake $
            </button>
            <button
              type="button"
              className={stakeMode === 'contracts' ? 'hl-sb-pill hl-sb-pill--on' : 'hl-sb-pill'}
              onClick={() => setStakeMode('contracts')}
            >
              Contracts
            </button>
          </div>

          <label className="hl-sb-field">
            <span>{stakeMode === 'usd' ? 'Stake (USD)' : 'Contracts'}</span>
            <input
              type="number"
              min={stakeMode === 'usd' ? OUTCOME_PREVIEW_STAKE_USD : 1}
              step={1}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              placeholder={stakeMode === 'usd' ? String(OUTCOME_PREVIEW_STAKE_USD) : '10'}
            />
          </label>

          {mode === 'limit' ? (
            <label className="hl-sb-field">
              <span>Limit price (0.001–0.999)</span>
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
          ) : (
            <div className="hl-sb-ref">
              <span>Odds</span>
              <strong>
                {quoteLoading || referencePx <= 0
                  ? '—'
                  : `${formatDecimalOdds(referencePx)}× · ${formatOutcomePriceCents(referencePx)}`}
              </strong>
            </div>
          )}

          {referencePx > 0 && parsedStake > 0 && action === 'buy' ? (
            <p className="hl-sb-order-preview">
              {formatStakeReturnPreview(
                stakeMode === 'usd' ? parsedStake : contractSize * referencePx,
                orderPrice
              ) ?? 'Enter a valid stake'}
            </p>
          ) : null}

          <SportsbetsPayoutCard
            preview={payoutPreview}
            action={action}
            loading={quoteLoading && referencePx <= 0}
          />

          {canBet ? (
            <div className="hl-sb-order-stats">
              <div>
                <span>Balance</span>
                <strong>{fmtUsdSymbol(bettingBalance)}</strong>
              </div>
              {action === 'sell' ? (
                <div>
                  <span>Your position</span>
                  <strong>{Math.floor(positionSize)} contracts</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          {validation ? <p className="hl-sb-order-warn">{validation}</p> : null}
          {notional > 0 && notional < OUTCOME_MIN_NOTIONAL_USD ? (
            <p className="hl-sb-order-warn">Minimum order is ${OUTCOME_MIN_NOTIONAL_USD} notional.</p>
          ) : null}

          {(trading.error || localMsg) && (
            <div
              className={`hl-sb-order-msg ${trading.error ? 'hl-sb-order-msg--err' : ''}`}
              role="status"
            >
              {trading.error ? <AlertCircle size={14} /> : null}
              <span>{trading.error ?? localMsg}</span>
            </div>
          )}

          <button
            type="button"
            className={`hl-sb-order-submit ${action === 'sell' ? 'hl-sb-order-submit--sell' : ''}`}
            disabled={
              canBet &&
              (trading.busy ||
                quoteLoading ||
                !quote ||
                referencePx <= 0 ||
                !payoutPreview ||
                Boolean(validation) ||
                notional < OUTCOME_MIN_NOTIONAL_USD ||
                (action === 'sell' && payoutPreview.contracts > positionSize))
            }
            onClick={() => void handleSubmit()}
          >
            {trading.busy ? <Loader2 size={16} className="hl-spin" aria-hidden /> : null}
            {!canBet
              ? signedIn
                ? 'Connect wallet to bet'
                : 'Sign in to bet'
              : action === 'buy'
                ? `Bet ${sideLabel}`
                : `Cash out ${sideLabel}`}
          </button>
        </>
      )}
    </aside>
  );
};

export default SportsbetsOrderPanel;
