import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRAND_NAME } from '../../lib/brand';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import {
  useHyperliquidTrading,
  type MarginMode,
  type ManualOrderResult,
  type OrderKind,
  type OrderSide,
} from '../../hooks/useHyperliquidTrading';
import { useHyperliquidBuilderFee } from '../../hooks/useHyperliquidBuilderFee';
import { fetchHlAssetLeverage, leverageOptionsForMax } from '../../lib/hyperliquid/assetLeverage';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { formatHlWalletSignError } from '../../lib/hyperliquid/walletAdapter';
import { humanizeHlTradeError } from '../../lib/hyperliquid/orders';
import { toNum } from '../../lib/hyperliquid/parse';
import type { HlTwapOrder } from '../../lib/hyperliquid/user';
import { useLegalAcceptance } from '../../contexts/LegalAcceptanceContext';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import type { ProTradeDockTab } from './ProTradeDock';

type OrderMode = 'basic' | 'scale' | 'tpsl' | 'twap';
type SizeUnit = 'coin' | 'usd';

export type ManualOrderSuccessInfo = {
  message: string;
  dockTab: ProTradeDockTab;
};

type Props = {
  coin: string;
  markPx: number;
  maxLeverage: number;
  accountValue: number;
  limitPrice: string;
  onLimitPriceChange: (price: string) => void;
  onSuccess?: (info: ManualOrderSuccessInfo) => void;
  onErrorToast?: (message: string) => void;
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
  onErrorToast,
  onDeposit,
  onWithdraw,
  onTransfer,
  variant = 'perp',
  displayCoin,
  serverTwap,
  onCancelServerTwap,
}) => {
  const { t } = useTranslation();
  const isSpot = variant === 'spot';
  const marketKind = isSpot ? 'spot' as const : 'perp' as const;
  const coinLabel = displayCoin ?? coin;
  const { open } = useMonadierAppKit();
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
    applyTradeSettings,
  } = useHyperliquidTrading();
  const platformFees = usePlatformFeeGate();
  const {
    enabled: builderEnabled,
    needsApproval: needsBuilderApproval,
    approve: approveBuilderFee,
    busy: builderBusy,
    error: builderError,
    config: builderConfig,
    feeLabelPerp,
  } = useHyperliquidBuilderFee(address);
  const { ensureAccepted } = useLegalAcceptance();

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
  /** Margin (perp) / spend (spot) in USDC ù synced with the % slider. */
  const [amountUsd, setAmountUsd] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [twapMinutes, setTwapMinutes] = useState('10');
  const [twapRandomize, setTwapRandomize] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const settingsHydratedRef = useRef(false);

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
    settingsHydratedRef.current = false;
    void (async () => {
      const state = await fetchHlAssetLeverage(address, coin);
      if (cancelled) return;
      if (state) {
        setMarginMode(state.marginMode);
        setLeverage(Math.min(state.leverage, levMax));
      }
      settingsHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [address, coin, isSpot, levMax]);

  const pushTradeSettings = useCallback(
    async (next: { leverage: number; marginMode: MarginMode }) => {
      if (isSpot || !walletReady || !settingsHydratedRef.current) return;
      try {
        await applyTradeSettings(coin, next, 'perp');
        setLocalError(null);
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : t('trading.order.failedLeverage'));
      }
    },
    [isSpot, walletReady, applyTradeSettings, coin, t]
  );

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

  const applyNotional = (notional: number, pct: number, marginUsd: number) => {
    setSizePct(pct);
    setAmountUsd(marginUsd > 0 ? marginUsd.toFixed(2) : '');
    if (markPx <= 0 || notional <= 0) return;
    if (sizeUnit === 'usd') {
      setSize(notional.toFixed(2));
    } else {
      setSize((notional / markPx).toFixed(6).replace(/\.?0+$/, '') || '0');
    }
  };

  const applySizePreset = (pct: number, levOverride?: number) => {
    const lev = levOverride ?? leverage;
    if (accountValue <= 0 || markPx <= 0) {
      setSizePct(pct);
      return;
    }
    if (!isSpot && lev <= 0) {
      setSizePct(pct);
      return;
    }
    const clamped = Math.max(0, Math.min(100, pct));
    const marginUsd = (accountValue * clamped) / 100;
    const notional = isSpot ? marginUsd : marginUsd * lev;
    applyNotional(notional, clamped, marginUsd);
  };

  /** Type a USDC amount (margin for perps, spend for spot) ? sync % + size. */
  const applyAmountUsd = (raw: string) => {
    setAmountUsd(raw);
    const cleaned = raw.replace(/,/g, '').trim();
    if (cleaned === '' || cleaned === '.') {
      setSizePct(0);
      setSize('');
      return;
    }
    const usd = Number(cleaned);
    if (!Number.isFinite(usd) || usd < 0) return;
    if (accountValue <= 0 || markPx <= 0) return;
    if (!isSpot && leverage <= 0) return;
    const marginUsd = Math.min(usd, accountValue);
    const pct = accountValue > 0 ? Math.min(100, (marginUsd / accountValue) * 100) : 0;
    const notional = isSpot ? marginUsd : marginUsd * leverage;
    applyNotional(notional, pct, marginUsd);
    // Keep the typed string while editing; snap to capped value only if over balance.
    if (usd > accountValue) setAmountUsd(marginUsd.toFixed(2));
  };

  /** Manual size edit ? reverse-sync % slider + USDC amount. */
  const onSizeInputChange = (raw: string) => {
    setSize(raw);
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || markPx <= 0 || accountValue <= 0) return;
    if (!isSpot && leverage <= 0) return;
    const notional = sizeUnit === 'usd' ? n : n * markPx;
    const marginUsd = isSpot ? notional : notional / leverage;
    const pct = Math.min(100, Math.max(0, (marginUsd / accountValue) * 100));
    setSizePct(pct);
    setAmountUsd(marginUsd > 0 ? marginUsd.toFixed(2) : '');
  };

  const resolveSize = (): number => {
    if (sizeUnit === 'coin') return parsePositive(size, 'size');
    const usd = parsePositive(size, 'size');
    if (markPx <= 0) throw new Error('Mark price unavailable');
    return usd / markPx;
  };

  const showSuccess = (info: ManualOrderSuccessInfo) => {
    setSuccess(info.message);
    onSuccess?.(info);
    window.setTimeout(() => setSuccess(null), 4000);
  };

  const successFromResult = (
    mode: OrderMode,
    kind: OrderKind | undefined,
    result: ManualOrderResult | void
  ): ManualOrderSuccessInfo => {
    const outcome = result?.outcome ?? 'submitted';
    if (mode === 'twap' || outcome === 'twap') {
      return { message: 'TWAP started ù see TWAP tab', dockTab: 'twap' };
    }
    if (mode === 'tpsl' || outcome === 'tpsl') {
      return { message: 'TP/SL set ù see Trailing / Open Orders', dockTab: 'trailing' };
    }
    if (mode === 'scale') {
      if (outcome === 'filled') {
        return { message: 'Scale orders filled ù see Positions', dockTab: 'positions' };
      }
      return { message: 'Scale orders placed ù see Open Orders', dockTab: 'orders' };
    }
    // basic limit / market
    if (kind === 'market' || outcome === 'filled') {
      return { message: 'Order filled ù see Positions', dockTab: 'positions' };
    }
    if (outcome === 'resting' || outcome === 'mixed') {
      return { message: 'Limit order placed ù see Open Orders', dockTab: 'orders' };
    }
    return {
      message: kind === 'limit' ? 'Limit order submitted ù see Open Orders' : 'Order submitted ù see Positions',
      dockTab: kind === 'limit' ? 'orders' : 'positions',
    };
  };

  const submitOrder = async () => {
    setLocalError(null);
    setSuccess(null);
    if (platformFees.opensBlocked) {
      platformFees.openPayModal();
      setLocalError(`Pay ${BRAND_NAME} platform fees to continue trading.`);
      return;
    }
    if (builderEnabled && needsBuilderApproval) {
      setShowBuilderModal(true);
      return;
    }
    try {
      if (mode === 'basic') {
        const result = await placeOrder({
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
        showSuccess(successFromResult('basic', kind, result));
        return;
      }

      if (mode === 'scale') {
        const result = await placeScaleOrder({
          coin,
          side,
          totalSize: resolveSize(),
          startPrice: parsePositive(scaleStart, 'start price'),
          endPrice: parsePositive(scaleEnd, 'end price'),
          orderCount: parsePositive(scaleOrders, 'order count'),
          settings: isSpot ? undefined : settings,
          marketKind,
        });
        showSuccess(successFromResult('scale', undefined, result));
        return;
      }

      if (mode === 'tpsl') {
        const sizeNum = resolveSize();
        const tp = tpPrice ? parsePositive(tpPrice, 'TP price') : undefined;
        const sl = slPrice ? parsePositive(slPrice, 'SL price') : undefined;
        const closeSide: OrderSide = side === 'long' ? 'short' : 'long';
        const result = await placeTpSlOrders({
          coin,
          side: closeSide,
          size: sizeNum,
          tpPrice: tp,
          slPrice: sl,
          markPx,
          marketKind,
        });
        showSuccess(successFromResult('tpsl', undefined, result));
        return;
      }

      if (mode === 'twap') {
        const result = await startTwap({
          coin,
          side,
          totalSize: resolveSize(),
          minutes: parsePositive(twapMinutes, 'duration'),
          randomize: twapRandomize,
          reduceOnly: isSpot ? false : reduceOnly,
          settings: isSpot ? undefined : settings,
          marketKind,
        });
        showSuccess(successFromResult('twap', undefined, result));
      }
    } catch (err: unknown) {
      const msg = humanizeHlTradeError(formatHlWalletSignError(err) || (err instanceof Error ? err.message : 'Order failed'));
      if (!error) setLocalError(msg);
      onErrorToast?.(msg);
    }
  };

  const handleSubmit = () => {
    ensureAccepted(() => void submitOrder());
  };

  const displayError = localError || error;
  const submitLabel =
    mode === 'twap' && twapActive
      ? t('trading.order.twapActive', { minutes: twapMinutesLabel })
      : mode === 'scale'
        ? t('trading.order.placeOrders', { count: scaleOrders || '0' })
        : mode === 'tpsl'
          ? t('trading.order.placeTpsl')
          : mode === 'twap'
            ? t('trading.order.startTwap')
            : side === 'long'
              ? kind === 'market'
                ? isSpot ? t('trading.order.buyMarket') : t('trading.order.buyLong')
                : isSpot ? t('trading.order.buyLimit') : t('trading.order.buyLong')
              : kind === 'market'
                ? isSpot ? t('trading.order.sellMarket') : t('trading.order.sellShort')
                : isSpot ? t('trading.order.sellLimit') : t('trading.order.sellShort');

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
              onChange={(e) => {
                const mode = e.target.value as MarginMode;
                setMarginMode(mode);
                void pushTradeSettings({ leverage, marginMode: mode });
              }}
            >
              <option value="isolated">{t('trading.order.isolated')}</option>
              <option value="cross">{t('trading.order.cross')}</option>
            </select>
            <select
              className="hl-entry-select"
              value={leverage}
              onChange={(e) => {
                const lev = Number(e.target.value);
                setLeverage(lev);
                void pushTradeSettings({ leverage: lev, marginMode });
                if (sizePct > 0) applySizePreset(sizePct, lev);
              }}
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
          <option value="limit">{t('trading.order.limit')}</option>
          <option value="market">{t('trading.order.market')}</option>
          <option value="scale">{t('trading.order.scale')}</option>
          <option value="tpsl">{t('trading.order.tpsl')}</option>
          <option value="twap">{t('trading.order.twap')}</option>
        </select>
      </div>

      <div className="hl-entry-scroll">
        <div className="hl-entry-side">
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--long ${side === 'long' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('long')}
          >
            {isSpot ? t('trading.order.buy') : t('trading.order.buyLong')}
          </button>
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--short ${side === 'short' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('short')}
          >
            {isSpot ? t('trading.order.sell') : t('trading.order.sellShort')}
          </button>
        </div>

        <div>
          <div className="hl-entry-label">{t('trading.order.availableToTrade')}</div>
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
          aria-label={t('trading.order.sizePercent')}
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

        <div>
          <div className="hl-entry-label-row">
            <span className="hl-entry-label" style={{ marginBottom: 0 }}>
              {t(isSpot ? 'trading.order.amountUsd' : 'trading.order.marginUsd')}
            </span>
            <span className="hl-entry-amount-suffix">USDC</span>
          </div>
          <input
            className="hl-entry-input"
            value={amountUsd}
            onChange={(e) => applyAmountUsd(e.target.value)}
            placeholder="50"
            inputMode="decimal"
            aria-label={t(isSpot ? 'trading.order.amountUsd' : 'trading.order.marginUsd')}
          />
        </div>

        {mode === 'basic' && kind === 'limit' ? (
          <div>
            <div className="hl-entry-label">{t('trading.order.price')}</div>
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
              <div className="hl-entry-label">{t('trading.order.startPrice')}</div>
              <input className="hl-entry-input" value={scaleStart} onChange={(e) => setScaleStart(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">{t('trading.order.endPrice')}</div>
              <input className="hl-entry-input" value={scaleEnd} onChange={(e) => setScaleEnd(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">{t('trading.order.totalOrders')}</div>
              <input className="hl-entry-input" value={scaleOrders} onChange={(e) => setScaleOrders(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <div className="hl-entry-label">{t('trading.order.sizeSkew')}</div>
              <input className="hl-entry-input" value={scaleSkew} onChange={(e) => setScaleSkew(e.target.value)} inputMode="decimal" />
            </div>
          </>
        ) : null}

        {mode === 'tpsl' ? (
          <>
            <div>
              <div className="hl-entry-label">{t('trading.order.takeProfit')}</div>
              <input className="hl-entry-input" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder={t('trading.order.optional')} inputMode="decimal" />
            </div>
            <div>
              <div className="hl-entry-label">{t('trading.order.stopLoss')}</div>
              <input className="hl-entry-input" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder={t('trading.order.optional')} inputMode="decimal" />
            </div>
          </>
        ) : null}

        {mode === 'twap' ? (
          <>
            <div>
              <div className="hl-entry-label">{t('trading.order.duration')}</div>
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
              {t('trading.order.randomize')}
            </label>
            <p className="hl-entry-hint">{t('trading.order.twapHint')}</p>
            {serverTwapActive ? (
              <div className="hl-entry-preview">
                <div>{t('trading.order.serverTwapRunning', { id: serverTwapActive.twapId })}</div>
                <div>
                  {twapFilledPct != null
                    ? t('trading.order.filled', {
                        executed: serverTwapActive.executedSz,
                        total: serverTwapActive.sz,
                        pct: twapFilledPct.toFixed(0),
                      })
                    : t('trading.order.filledSimple', {
                        executed: serverTwapActive.executedSz,
                        total: serverTwapActive.sz,
                      })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div>
          <div className="hl-entry-label-row">
            <span className="hl-entry-label" style={{ marginBottom: 0 }}>
              {t(mode === 'scale' || mode === 'twap' ? 'trading.order.sizeTotal' : 'trading.order.size')}
            </span>
            <div className="hl-entry-unit-toggle" role="group" aria-label={t('trading.order.sizeUnit')}>
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
            onChange={(e) => onSizeInputChange(e.target.value)}
            placeholder={sizeUnit === 'usd' ? '100' : '0.01'}
            inputMode="decimal"
          />
        </div>

        {mode === 'basic' && !isSpot ? (
          <label className="hl-entry-check">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
            {t('trading.order.reduceOnly')}
          </label>
        ) : null}

        {orderNotional > 0 ? (
          <div className="hl-entry-preview">
            <div>{t('trading.order.orderValue', { value: fmtUsdSymbol(orderNotional) })}</div>
            {!isSpot ? <div>{t('trading.order.marginRequired', { value: fmtUsdSymbol(marginEst) })}</div> : null}
            {mode === 'scale' && scaleStart && scaleEnd ? (
              <div>{t('trading.order.scaleRange', { start: scaleStart, end: scaleEnd })}</div>
            ) : null}
          </div>
        ) : null}

        {isRestoring || (isConnected && !isLiveConnected && !walletReady) ? (
          <button type="button" className="hl-entry-submit" disabled>
            <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
            {t('trading.order.restoringWallet')}
          </button>
        ) : !isConnected || !walletReady ? (
          <button type="button" className="hl-entry-submit" onClick={() => open()}>
            <Wallet size={14} style={{ display: 'inline', marginRight: 6 }} />
            {t('trading.order.connectWallet')}
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
            {t('trading.order.cancelTwap')}
          </button>
        ) : null}

        {displayError ? <p className="hl-entry-err"><AlertCircle size={12} /> {displayError}</p> : null}
        {success ? <p className="hl-entry-ok">{success}</p> : null}
      </div>

      <div className="hl-entry-foot">
        <button type="button" className="hl-entry-foot-btn" onClick={onDeposit}>{t('trading.order.hlDeposit')}</button>
        <button type="button" className="hl-entry-foot-btn" onClick={onTransfer}>{t('trading.order.perpsSpot')}</button>
        <button type="button" className="hl-entry-foot-btn" onClick={onWithdraw}>{t('trading.order.hlWithdraw')}</button>
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
