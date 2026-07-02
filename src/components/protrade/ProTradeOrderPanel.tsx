import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRAND_NAME } from '../../lib/brand';
import { useMonadierAppKit } from '../../hooks/useMonadierAppKit';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import {
  useHyperliquidTrading,
  type MarginMode,
  type OrderKind,
  type OrderSide,
} from '../../hooks/useHyperliquidTrading';
import { useHyperliquidBuilderFee } from '../../hooks/useHyperliquidBuilderFee';
import { fetchHlAssetLeverage, leverageOptionsForMax } from '../../lib/hyperliquid/assetLeverage';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { formatHlWalletSignError } from '../../lib/hyperliquid/walletAdapter';
import { toNum } from '../../lib/hyperliquid/parse';
import type { HlTwapOrder } from '../../lib/hyperliquid/user';
import { useLegalAcceptance } from '../../contexts/LegalAcceptanceContext';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';

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

  const applySizePreset = (pct: number) => {
    setSizePct(pct);
    if (accountValue <= 0 || markPx <= 0) return;
    if (!isSpot && leverage <= 0) return;
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
        showSuccess(t('trading.order.successOrder'));
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
        showSuccess(t('trading.order.successScale'));
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
        showSuccess(t('trading.order.successTpsl'));
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
        showSuccess(t('trading.order.successTwap'));
      }
    } catch (err: unknown) {
      const msg = formatHlWalletSignError(err);
      if (!error) setLocalError(msg);
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
            onChange={(e) => setSize(e.target.value)}
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
