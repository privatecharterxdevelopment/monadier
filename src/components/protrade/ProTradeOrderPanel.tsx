import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Wallet } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { openMonadierWalletModal } from '../../lib/openWalletModal';
import {
  useHyperliquidTrading,
  type MarginMode,
  type OrderKind,
  type OrderSide,
} from '../../hooks/useHyperliquidTrading';
import { useHyperliquidBuilderFee } from '../../hooks/useHyperliquidBuilderFee';
import { fetchHlAssetLeverage, leverageOptionsForMax } from '../../lib/hyperliquid/assetLeverage';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import type { HlTwapOrder } from '../../lib/hyperliquid/user';
import ProTradeBuilderFeeModal from './ProTradeBuilderFeeModal';

type OrderMode = 'basic' | 'scale' | 'tpsl' | 'twap';
type SizeUnit = 'coin' | 'usd';

type Props = {
  coin: string;
  markPx: number;
  maxLeverage: number;
  accountValue: number;
  limitPrice: string;
  onLimitPriceChange: (price: string) => void;
  onSuccess?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onTransfer?: () => void;
  variant?: 'perp' | 'spot';
  displayCoin?: string;
  serverTwap?: HlTwapOrder | null;
  onCancelServerTwap?: () => void | Promise<void>;
};

const SIZE_PRESETS = [25, 33, 50, 66, 75, 100] as const;

function parsePositive(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Enter a valid ${label}`);
  return n;
}

const ProTradeOrderPanel: React.FC<Props> = ({
  coin,
  markPx,
  maxLeverage,
  accountValue,
  limitPrice,
  onLimitPriceChange,
  onSuccess,
  onDeposit,
  onWithdraw,
  onTransfer,
  variant = 'perp',
  displayCoin,
  serverTwap,
  onCancelServerTwap,
}) => {
  const isSpot = variant === 'spot';
  const marketKind = isSpot ? 'spot' as const : 'perp' as const;
  const coinLabel = displayCoin ?? coin;
  const { open } = useAppKit();
  const { address, isConnected, isRestoring, isLiveConnected } = useMonadierWallet();
  const {
    busy,
    error,
    twap,
    placeOrder,
    placeScaleOrder,
    placeTpSlOrders,
    startTwap,
    cancelTwap,
    walletReady,
  } = useHyperliquidTrading();
  const {
    enabled: builderEnabled,
    needsApproval: needsBuilderApproval,
    approve: approveBuilderFee,
    busy: builderBusy,
    error: builderError,
    config: builderConfig,
    feeLabelPerp,
  } = useHyperliquidBuilderFee(address);

  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [mode, setMode] = useState<OrderMode>('basic');
  const [side, setSide] = useState<OrderSide>('long');
  const [kind, setKind] = useState<OrderKind>('limit');
  const [marginMode, setMarginMode] = useState<MarginMode>('isolated');
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('coin');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState(10);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [scaleStart, setScaleStart] = useState('');
  const [scaleEnd, setScaleEnd] = useState('');
  const [scaleOrders, setScaleOrders] = useState('10');
  const [scaleSkew, setScaleSkew] = useState('1');
  const [sizePct, setSizePct] = useState(0);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [twapMinutes, setTwapMinutes] = useState('10');
  const [twapRandomize, setTwapRandomize] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const serverTwapActive =
    serverTwap?.status === 'activated' && serverTwap.coin === coin ? serverTwap : null;
  const twapActive = twap.active || Boolean(serverTwapActive);
  const twapMinutesLabel = twap.active ? twap.minutes : serverTwapActive?.minutes ?? 0;
  const twapFilledPct = useMemo(() => {
    if (!serverTwapActive) return null;
    const total = toNum(serverTwapActive.sz);
    const filled = toNum(serverTwapActive.executedSz);
    if (total <= 0) return null;
    return Math.min(100, (filled / total) * 100);
  }, [serverTwapActive]);

  const levMax = maxLeverage > 0 ? maxLeverage : 40;
  const settings = useMemo(
    () => ({ leverage, marginMode }),
    [leverage, marginMode]
  );

  useEffect(() => {
    if (markPx > 0 && kind === 'limit' && !limitPrice) {
      onLimitPriceChange(String(markPx));
    }
  }, [coin, markPx, kind, limitPrice, onLimitPriceChange]);

  useEffect(() => {
    if (markPx > 0 && mode === 'scale' && !scaleStart) {
      setScaleStart(String(markPx));
    }
  }, [coin, markPx, mode, scaleStart]);

  useEffect(() => {
    if (isSpot || !address) return;
    let cancelled = false;
    void (async () => {
      const state = await fetchHlAssetLeverage(address, coin);
      if (cancelled || !state) return;
      setMarginMode(state.marginMode);
      setLeverage(Math.min(state.leverage, levMax));
    })();
    return () => {
      cancelled = true;
    };
  }, [address, coin, isSpot, levMax]);

  useEffect(() => {
    if (leverage > levMax) setLeverage(levMax);
  }, [levMax, leverage]);

  const sizeInCoin = useMemo(() => {
    const raw = toNum(size);
    if (raw <= 0) return 0;
    if (sizeUnit === 'coin') return raw;
    return markPx > 0 ? raw / markPx : 0;
  }, [size, sizeUnit, markPx]);

  const orderNotional = useMemo(() => {
    if (sizeInCoin <= 0 || markPx <= 0) return 0;
    return sizeInCoin * markPx;
  }, [sizeInCoin, markPx]);

  const applySizePreset = (pct: number) => {
    if (accountValue <= 0 || markPx <= 0) return;
    if (!isSpot && leverage <= 0) return;
    setSizePct(pct);
    const notional = isSpot
      ? (accountValue * pct) / 100
      : (accountValue * leverage * pct) / 100;
    if (sizeUnit === 'usd') {
      setSize(notional.toFixed(2));
    } else {
      setSize((notional / markPx).toFixed(6).replace(/\.?0+$/, '') || '0');
    }
  };

  const resolveSize = (): number => {
    if (sizeUnit === 'coin') return parsePositive(size, 'size');
    const usd = parsePositive(size, 'size');
    if (markPx <= 0) throw new Error('Mark price unavailable');
    return usd / markPx;
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    onSuccess?.();
    window.setTimeout(() => setSuccess(null), 4000);
  };

  const handleSubmit = async () => {
    setLocalError(null);
    setSuccess(null);
    if (builderEnabled && needsBuilderApproval) {
      setShowBuilderModal(true);
      return;
    }
    try {
      if (mode === 'basic') {
        await placeOrder({
          coin,
          side,
          kind,
          size: resolveSize(),
          price: kind === 'limit' ? parsePositive(limitPrice, 'price') : undefined,
          markPx,
          reduceOnly: isSpot ? false : reduceOnly,
          settings: isSpot ? undefined : settings,
          marketKind,
        });
        showSuccess('Order submitted');
        return;
      }

      if (mode === 'scale') {
        await placeScaleOrder({
          coin,
          side,
          totalSize: resolveSize(),
          startPrice: parsePositive(scaleStart, 'start price'),
          endPrice: parsePositive(scaleEnd, 'end price'),
          orderCount: parsePositive(scaleOrders, 'order count'),
          settings: isSpot ? undefined : settings,
          marketKind,
        });
        showSuccess('Scale orders submitted');
        return;
      }

      if (mode === 'tpsl') {
        const sizeNum = resolveSize();
        const tp = tpPrice ? parsePositive(tpPrice, 'TP price') : undefined;
        const sl = slPrice ? parsePositive(slPrice, 'SL price') : undefined;
        const closeSide: OrderSide = side === 'long' ? 'short' : 'long';
        await placeTpSlOrders({
          coin,
          side: closeSide,
          size: sizeNum,
          tpPrice: tp,
          slPrice: sl,
          markPx,
          marketKind,
        });
        showSuccess('TP/SL orders submitted');
        return;
      }

      if (mode === 'twap') {
        await startTwap({
          coin,
          side,
          totalSize: resolveSize(),
          minutes: parsePositive(twapMinutes, 'duration'),
          randomize: twapRandomize,
          reduceOnly: isSpot ? false : reduceOnly,
          settings: isSpot ? undefined : settings,
          marketKind,
        });
        showSuccess('TWAP submitted (server-side)');
      }
    } catch (err: unknown) {
      if (err instanceof Error && !error) setLocalError(err.message);
    }
  };

  const displayError = localError || error;
  const submitLabel =
    mode === 'twap' && twapActive
      ? `TWAP active (${twapMinutesLabel}m)`
      : mode === 'scale'
        ? `Place ${scaleOrders || '0'} Orders`
        : mode === 'tpsl'
          ? 'Place TP/SL'
          : mode === 'twap'
            ? 'Start TWAP'
            : side === 'long'
              ? kind === 'market'
                ? isSpot ? 'Buy / Market' : 'Buy / Long'
                : isSpot ? 'Buy / Limit' : 'Buy / Long'
              : kind === 'market'
                ? isSpot ? 'Sell / Market' : 'Sell / Short'
                : isSpot ? 'Sell / Limit' : 'Sell / Short';

  const marginEst =
    orderNotional > 0 && !isSpot && leverage > 0 ? orderNotional / leverage : isSpot ? orderNotional : 0;

  return (
    <aside id="hl-trade-panel" className="hl-order-panel">
      <div className="hl-entry-head">
        {!isSpot ? (
          <>
            <select
              className="hl-entry-select"
              value={marginMode}
              onChange={(e) => setMarginMode(e.target.value as MarginMode)}
            >
              <option value="isolated">Isolated</option>
              <option value="cross">Cross</option>
            </select>
            <select
              className="hl-entry-select"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
            >
              {leverageOptionsForMax(levMax).map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
          </>
        ) : null}
        <select
          className="hl-entry-select"
          value={mode === 'basic' ? kind : mode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'limit' || v === 'market') {
              setMode('basic');
              setKind(v);
            } else {
              setMode(v as OrderMode);
            }
          }}
        >
          <option value="limit">Limit</option>
          <option value="market">Market</option>
          <option value="scale">Scale</option>
          <option value="tpsl">TP/SL</option>
          <option value="twap">TWAP</option>
        </select>
      </div>

      <div className="hl-entry-scroll">
        <div className="hl-entry-side">
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--long ${side === 'long' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('long')}
          >
            {isSpot ? 'Buy' : 'Buy / Long'}
          </button>
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--short ${side === 'short' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('short')}
          >
            {isSpot ? 'Sell' : 'Sell / Short'}
          </button>
        </div>

        <div>
          <div className="hl-entry-label">Available to Trade</div>
          <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmtUsdSymbol(accountValue)} USDC
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={sizePct}
          onChange={(e) => applySizePreset(Number(e.target.value))}
          className="hl-entry-slider"
          aria-label="Size percent"
        />
        <div className="hl-entry-presets">
          {SIZE_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              className="hl-entry-preset"
              onClick={() => applySizePreset(pct)}
              disabled={accountValue <= 0}
            >
              {pct}%
            </button>
          ))}
        </div>

        {mode === 'basic' && kind === 'limit' ? (
          <div>
            <div className="hl-entry-label">Price</div>
            <input
              className="hl-entry-input"
              value={limitPrice}
              onChange={(e) => onLimitPriceChange(e.target.value)}
              placeholder={markPx > 0 ? String(markPx) : '0'}
              inputMode="decimal"
            />
          </div>
        ) : null}

        {mode === 'scale' ? (
          <>
            <div>
              <div className="hl-entry-label">Start Price</div>
              <input className="hl-entry-input" value={scaleStart} onChange={(e) => setScaleStart(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">End Price</div>
              <input className="hl-entry-input" value={scaleEnd} onChange={(e) => setScaleEnd(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">Total Orders</div>
              <input className="hl-entry-input" value={scaleOrders} onChange={(e) => setScaleOrders(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <div className="hl-entry-label">Size Skew</div>
              <input className="hl-entry-input" value={scaleSkew} onChange={(e) => setScaleSkew(e.target.value)} inputMode="decimal" />
            </div>
          </>
        ) : null}

        {mode === 'tpsl' ? (
          <>
            <div>
              <div className="hl-entry-label">Take Profit</div>
              <input className="hl-entry-input" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder="Optional" inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">Stop Loss</div>
              <input className="hl-entry-input" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="Optional" inputMode="decimal" />
            </div>
          </>
        ) : null}

        {mode === 'twap' ? (
          <>
            <div>
              <div className="hl-entry-label">Duration (minutes, min 5)</div>
              <input
                className="hl-entry-input"
                value={twapMinutes}
                onChange={(e) => setTwapMinutes(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <label className="hl-entry-check">
              <input
                type="checkbox"
                checked={twapRandomize}
                onChange={(e) => setTwapRandomize(e.target.checked)}
              />
              Randomize slice timing
            </label>
            <p className="hl-entry-hint">Runs on Hyperliquid servers — survives tab close.</p>
            {serverTwapActive ? (
              <div className="hl-entry-preview">
                <div>Server TWAP #{serverTwapActive.twapId} running</div>
                <div>
                  Filled {serverTwapActive.executedSz} / {serverTwapActive.sz}
                  {twapFilledPct != null ? ` (${twapFilledPct.toFixed(0)}%)` : ''}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div>
          <div className="hl-entry-label-row">
            <span className="hl-entry-label" style={{ marginBottom: 0 }}>
              Size{mode === 'scale' || mode === 'twap' ? ' (total)' : ''}
            </span>
            <div className="hl-entry-unit-toggle" role="group" aria-label="Size unit">
              <button
                type="button"
                className={`hl-entry-unit-btn ${sizeUnit === 'coin' ? 'hl-entry-unit-btn--on' : ''}`}
                onClick={() => setSizeUnit('coin')}
              >
                {coinLabel}
              </button>
              <button
                type="button"
                className={`hl-entry-unit-btn ${sizeUnit === 'usd' ? 'hl-entry-unit-btn--on' : ''}`}
                onClick={() => setSizeUnit('usd')}
              >
                USDC
              </button>
            </div>
          </div>
          <input
            className="hl-entry-input"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder={sizeUnit === 'usd' ? '100' : '0.01'}
            inputMode="decimal"
          />
        </div>

        {mode === 'basic' && !isSpot ? (
          <label className="hl-entry-check">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
            Reduce Only
          </label>
        ) : null}

        {orderNotional > 0 ? (
          <div className="hl-entry-preview">
            <div>Order Value: {fmtUsdSymbol(orderNotional)}</div>
            {!isSpot ? <div>Margin Required: {fmtUsdSymbol(marginEst)}</div> : null}
            {mode === 'scale' && scaleStart && scaleEnd ? (
              <div>Start: {scaleStart} — End: {scaleEnd}</div>
            ) : null}
          </div>
        ) : null}

        {isRestoring || (isConnected && !isLiveConnected && !walletReady) ? (
          <button type="button" className="hl-entry-submit" disabled>
            <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
            Restoring wallet…
          </button>
        ) : !isConnected || !walletReady ? (
          <button type="button" className="hl-entry-submit" onClick={() => openMonadierWalletModal(() => open())}>
            <Wallet size={14} style={{ display: 'inline', marginRight: 6 }} />
            Connect wallet
          </button>
        ) : (
          <button
            type="button"
            className={`hl-entry-submit ${side === 'short' ? 'hl-entry-submit--short' : ''}`}
            disabled={busy || (mode === 'twap' && twapActive)}
            onClick={handleSubmit}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : submitLabel}
          </button>
        )}

        {twapActive ? (
          <button
            type="button"
            className="hl-entry-foot-btn"
            onClick={() => {
              if (twap.active) void cancelTwap();
              else void onCancelServerTwap?.();
            }}
          >
            Cancel TWAP
          </button>
        ) : null}

        {displayError ? <p className="hl-entry-err"><AlertCircle size={12} /> {displayError}</p> : null}
        {success ? <p className="hl-entry-ok">{success}</p> : null}
      </div>

      <div className="hl-entry-foot">
        <button type="button" className="hl-entry-foot-btn" onClick={onDeposit}>HL Deposit</button>
        <button type="button" className="hl-entry-foot-btn" onClick={onTransfer}>Perps ⇄ Spot</button>
        <button type="button" className="hl-entry-foot-btn" onClick={onWithdraw}>HL Withdraw</button>
      </div>

      {showBuilderModal ? (
        <ProTradeBuilderFeeModal
          feeLabelPerp={feeLabelPerp}
          maxApprovalRate={builderConfig.maxApprovalRate}
          busy={builderBusy}
          error={builderError}
          onApprove={async () => {
            await approveBuilderFee();
            setShowBuilderModal(false);
          }}
          onClose={() => setShowBuilderModal(false)}
        />
      ) : null}
    </aside>
  );
};

export default ProTradeOrderPanel;
