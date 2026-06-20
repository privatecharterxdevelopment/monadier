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
import { formatBettingMarketName } from '../../../lib/hyperliquid/outcomes/categories';
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
}) => {
  const { open } = useAppKit();
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

  const effectiveAction = advancedOpen ? action : 'buy';
  const effectiveMode = advancedOpen ? mode : 'market';
  const effectiveStakeMode = advancedOpen ? stakeMode : 'usd';

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
  const isCashOut = effectiveAction === 'sell';

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
      }
      onSuccess?.();
    } catch {
      /* trading hook sets error */
    }
  };

  return (
    <aside className="hl-sb-order">
      {gateReason ? (
        <div className="hl-sb-panel hl-sb-panel--muted hl-sb-panel--compact">
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
            <strong className="hl-sb-order-market">{formatBettingMarketName(market)}</strong>
            <span> · {sideLabel}</span>
          </p>

          <label className="hl-sb-field">
            <span>
              {advancedOpen && stakeMode === 'contracts' ? 'Contracts' : 'How much to bet? (USD)'}
            </span>
            <input
              type="number"
              min={advancedOpen && stakeMode === 'contracts' ? 1 : OUTCOME_PREVIEW_STAKE_USD}
              step={1}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              placeholder={
                advancedOpen && stakeMode === 'contracts' ? '10' : String(OUTCOME_PREVIEW_STAKE_USD)
              }
            />
          </label>

          {!advancedOpen || stakeMode === 'usd' ? (
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

          {effectiveMode === 'market' ? (
            <div className="hl-sb-ref">
              <span className="hl-sb-ref-label">Odds</span>
              <strong className="hl-sb-ref-value">
                {quoteLoading || referencePx <= 0
                  ? '—'
                  : `${formatDecimalOdds(referencePx)}× · ${formatOutcomePriceCents(referencePx)}`}
              </strong>
            </div>
          ) : null}

          {!advancedOpen && effectiveMode === 'market' ? (
            <p className="hl-sb-order-hint">Market order at the current best price.</p>
          ) : null}

          {advancedOpen &&
          referencePx > 0 &&
          parsedStake > 0 &&
          effectiveAction === 'buy' &&
          !payoutPreview ? (
            <p className="hl-sb-order-preview">
              {formatStakeReturnPreview(
                effectiveStakeMode === 'usd' ? parsedStake : contractSize * referencePx,
                orderPrice
              ) ?? 'Enter a valid stake'}
            </p>
          ) : null}

          {!advancedOpen ? (
            <SportsbetsPayoutCard
              preview={payoutPreview}
              action={effectiveAction}
              loading={quoteLoading && referencePx <= 0}
              simple
            />
          ) : null}

          <details
            className="hl-sb-advanced"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="hl-sb-advanced-summary">
              Advanced — limit orders, contracts{canSell ? ', cash out' : ''}
            </summary>
            <div className="hl-sb-advanced-body">
              {canSell ? (
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
                  >
                    Cash out
                  </button>
                </div>
              ) : null}

              <div className="hl-sb-order-controls" role="group" aria-label="Order type and stake mode">
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

              {stakeMode === 'contracts' ? (
                <p className="hl-sb-order-hint">
                  Each contract pays $1 if {sideLabel} wins. Price is per contract (e.g. 89¢ = 89% implied).
                </p>
              ) : null}

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
              ) : null}

              {advancedOpen && payoutPreview ? (
                <SportsbetsPayoutCard preview={payoutPreview} action={effectiveAction} simple={false} />
              ) : advancedOpen && quoteLoading && referencePx <= 0 ? (
                <SportsbetsPayoutCard preview={null} action={effectiveAction} loading />
              ) : null}
            </div>
          </details>

          {canBet ? (
            <p className="hl-sb-order-balance">
              <span>
                Balance <strong>{fmtUsdSymbol(bettingBalance)}</strong>
              </span>
              {isCashOut ? (
                <span>
                  Position <strong>{Math.floor(positionSize)} ct</strong>
                </span>
              ) : bettingBalance <= 0 ? (
                <span className="hl-sb-order-balance-warn">Deposit USDC on Hyperliquid to bet</span>
              ) : null}
            </p>
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
                ? 'Connect wallet to bet'
                : 'Sign in to bet'
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
