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
  formatBettingOrderPickDisplay,
} from '../../../lib/hyperliquid/outcomes/categories';
import { formatBettingOrderError } from '../../../lib/hyperliquid/outcomes/bettingErrors';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';
import type { HlOutcomeMarket, HlOutcomeQuestion, OutcomeLegQuote, OutcomeSideIndex } from '../../../lib/hyperliquid/outcomes/types';
import type { useHyperliquidOutcomeTrading } from '../../../hooks/useHyperliquidOutcomeTrading';
import { useBettingBuilderFee } from '../../../hooks/useBettingBuilderFee';
import { useBettingUi } from '../../../contexts/BettingUiContext';
import SportsbetsPayoutCard from './SportsbetsPayoutCard';
import BettingBuilderFeeModal from './BettingBuilderFeeModal';

type Trading = ReturnType<typeof useHyperliquidOutcomeTrading>;

type Props = {
  market: HlOutcomeMarket | null;
  question?: HlOutcomeQuestion | null;
  side: OutcomeSideIndex;
  quote: OutcomeLegQuote | null;
  quoteLoading: boolean;
  bettingBalance: number;
  walletAddress?: string;
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
  question,
  side,
  quote,
  quoteLoading,
  bettingBalance,
  walletAddress,
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
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const builderFee = useBettingBuilderFee(walletAddress);
  const { openFunds } = useBettingUi();

  const canBet = signedIn && walletConnected;

  const sideBook = quote ? (side === 0 ? quote.yes : quote.no) : null;
  const sideLabel = market ? (side === 0 ? market.yesLabel : market.noLabel) : 'Yes';
  const pickDisplay = market ? formatBettingOrderPickDisplay(question, market, side) : null;

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
  const statusDisplay =
    trading.error != null ? formatBettingOrderError(trading.error) : statusMessage;
  const statusIsError = Boolean(trading.error || validation);
  const needsDeposit =
    canBet && !isCashOut && bettingBalance < OUTCOME_MIN_NOTIONAL_USD;
  const showDepositCta = needsDeposit;

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
    if (builderFee.enabled && builderFee.needsApproval) {
      setShowBuilderModal(true);
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
      {!market ? (
        <p className="hl-sb-muted hl-sb-order-empty">Pick Yes or No to bet.</p>
      ) : (
        <>
          <div className="hl-sb-order-head">
            <div className={`hl-sb-order-pick-box hl-sb-order-pick-box--${side === 0 ? 'yes' : 'no'}`}>
              <button
                type="button"
                className={`hl-sb-order-pick-settings ${advancedOpen ? 'hl-sb-order-pick-settings--on' : ''}`}
                aria-label="Order settings"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <SlidersHorizontal size={12} aria-hidden />
              </button>
              <span className="hl-sb-order-pick-event">{pickDisplay?.eventTitle}</span>
              <p className="hl-sb-order-pick-line">
                <span className="hl-sb-order-pick-side">{pickDisplay?.sideLabel}</span>
                <span className="hl-sb-order-pick-on"> on </span>
                <span className="hl-sb-order-pick-leg">{pickDisplay?.legName}</span>
              </p>
              {pickDisplay?.expiry ? (
                <span className="hl-sb-order-pick-expiry">{pickDisplay.expiry}</span>
              ) : null}
            </div>
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

          <div className="hl-sb-order-context">
            <div className="hl-sb-order-context-stats">
              <div className="hl-sb-order-context-stat">
                <span className="hl-sb-order-context-label">Odds</span>
                <strong>
                  {quoteLoading || referencePx <= 0
                    ? '—'
                    : `${formatDecimalOdds(referencePx)}× · ${formatOutcomePriceCents(referencePx)}`}
                </strong>
              </div>
              {canBet ? (
                <>
                  <div className="hl-sb-order-context-stat">
                    <span className="hl-sb-order-context-label">Balance</span>
                    <strong>{fmtUsdSymbol(bettingBalance)}</strong>
                  </div>
                  <div className="hl-sb-order-context-stat">
                    <span className="hl-sb-order-context-label">Min</span>
                    <strong>{fmtUsdSymbol(OUTCOME_MIN_NOTIONAL_USD)}</strong>
                  </div>
                  {isCashOut ? (
                    <div className="hl-sb-order-context-stat">
                      <span className="hl-sb-order-context-label">Position</span>
                      <strong>{Math.floor(positionSize)}</strong>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {statusMessage ? (
              <div
                className={`hl-sb-order-context-banner ${statusIsError ? 'hl-sb-order-context-banner--err' : 'hl-sb-order-context-banner--ok'}`}
                role="status"
              >
                {statusIsError ? <AlertCircle size={13} aria-hidden /> : null}
                <span>{statusDisplay}</span>
              </div>
            ) : null}

            {builderFee.enabled && canBet ? (
              <p className="hl-sb-order-context-fee">
                Platform fee: {builderFee.buyFeeLabel} on bets · {builderFee.cashoutFeeLabel} on cash out
                {!builderFee.platformReady ? ' · activating soon' : null}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className={`hl-sb-order-submit ${isCashOut ? 'hl-sb-order-submit--sell' : ''} ${showDepositCta ? 'hl-sb-order-submit--deposit' : ''}`}
            disabled={
              showDepositCta
                ? trading.busy
                : canBet &&
                  (trading.busy ||
                    quoteLoading ||
                    !quote ||
                    referencePx <= 0 ||
                    !payoutPreview ||
                    Boolean(validation) ||
                    notional < OUTCOME_MIN_NOTIONAL_USD ||
                    (isCashOut && payoutPreview.contracts > positionSize))
            }
            onClick={() => {
              if (showDepositCta) {
                openFunds('deposit');
                return;
              }
              void handleSubmit();
            }}
          >
            {trading.busy ? <Loader2 size={16} className="hl-spin" aria-hidden /> : null}
            {!canBet
              ? signedIn
                ? 'Connect wallet'
                : 'Sign in'
              : showDepositCta
                ? 'Deposit now'
                : isCashOut
                  ? `Cash out ${sideLabel}`
                  : `Bet ${sideLabel}`}
          </button>
        </>
      )}
      {showBuilderModal ? (
        <BettingBuilderFeeModal
          buyFeeLabel={builderFee.buyFeeLabel}
          cashoutFeeLabel={builderFee.cashoutFeeLabel}
          maxApprovalRate={builderFee.maxApprovalRate}
          busy={builderFee.busy}
          error={builderFee.error}
          onApprove={async () => {
            await builderFee.approve();
            setShowBuilderModal(false);
          }}
          onClose={() => setShowBuilderModal(false)}
        />
      ) : null}
    </aside>
  );
};

export default SportsbetsOrderPanel;
