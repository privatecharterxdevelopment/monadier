import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MarginMode, OrderSide } from '../../hooks/useHyperliquidTrading';
import { leverageOptionsForMax, fetchHlAssetLeverage } from '../../lib/hyperliquid/assetLeverage';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { humanizeHlTradeError } from '../../lib/hyperliquid/orders';
import { placeHlManualPerpOrderViaAgent } from '../../lib/hyperliquid/hlManualOrder';
import { toNum } from '../../lib/hyperliquid/parse';
import { isBotExcludedHlCoin } from '../../lib/botTradingPairs';

const MIN_MARGIN_USD = 5;
const SIZE_PRESETS = [25, 33, 50, 66, 75, 100] as const;

type OrderKind = 'market' | 'limit';

type Props = {
  wallet: string;
  coin: string;
  markPx: number;
  maxLeverage: number;
  tradableUsd: number;
  agentApproved: boolean;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  marketOptions?: string[];
  onCoinChange?: (coin: string) => void;
};

const ProTradeAgentManualTrade: React.FC<Props> = ({
  wallet,
  coin,
  markPx,
  maxLeverage,
  tradableUsd,
  agentApproved,
  onSuccess,
  onError,
  marketOptions = [],
  onCoinChange,
}) => {
  const { t } = useTranslation();
  const coinLabel = coin.toUpperCase();
  const levMax = maxLeverage > 0 ? maxLeverage : 40;

  const [side, setSide] = useState<OrderSide>('long');
  const [kind, setKind] = useState<OrderKind>('market');
  const [marginMode, setMarginMode] = useState<MarginMode>('isolated');
  const [leverage, setLeverage] = useState(10);
  const [sizeUnit, setSizeUnit] = useState<'usd' | 'coin'>('usd');
  const [size, setSize] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [sizePct, setSizePct] = useState(0);
  const [limitPrice, setLimitPrice] = useState('');
  const [busy, setBusy] = useState(false);

  /** Always include the active chart coin so the market dropdown matches the chart (excluded coins too). */
  const coinSelect = useMemo(() => {
    const opts = marketOptions.length > 0 ? marketOptions : [coin];
    const unique = [...new Set([coinLabel, ...opts.map((c) => c.toUpperCase())])].filter(
      (c) => !isBotExcludedHlCoin(c) || c === coinLabel
    );
    return unique.slice(0, 64);
  }, [coin, coinLabel, marketOptions]);

  useEffect(() => {
    if (leverage > levMax) setLeverage(levMax);
  }, [levMax, leverage]);

  useEffect(() => {
    let cancelled = false;
    void fetchHlAssetLeverage(wallet, coinLabel).then((state) => {
      if (cancelled || !state) return;
      setMarginMode(state.marginMode);
      setLeverage(Math.min(state.leverage, levMax));
    });
    return () => {
      cancelled = true;
    };
  }, [wallet, coinLabel, levMax]);

  useEffect(() => {
    if (markPx > 0 && kind === 'limit' && !limitPrice) {
      setLimitPrice(String(markPx));
    }
  }, [coinLabel, markPx, kind, limitPrice]);

  useEffect(() => {
    setSize('');
    setAmountUsd('');
    setSizePct(0);
    setLimitPrice(markPx > 0 ? String(markPx) : '');
  }, [coinLabel]);

  const sizeInCoin = useMemo(() => {
    const raw = toNum(size);
    if (raw <= 0) return 0;
    if (sizeUnit === 'coin') return raw;
    return markPx > 0 ? raw / markPx : 0;
  }, [size, sizeUnit, markPx]);

  const orderNotional = sizeInCoin > 0 && markPx > 0 ? sizeInCoin * markPx : 0;
  const marginEst = orderNotional > 0 && leverage > 0 ? orderNotional / leverage : 0;

  const setSizeFromNotional = useCallback(
    (notional: number) => {
      if (markPx <= 0 || notional <= 0) {
        setSize('');
        return;
      }
      if (sizeUnit === 'usd') {
        setSize(notional.toFixed(2));
      } else {
        setSize((notional / markPx).toFixed(6).replace(/\.?0+$/, '') || '0');
      }
    },
    [markPx, sizeUnit]
  );

  const applyNotional = useCallback(
    (notional: number, pct: number, marginUsd: number) => {
      setSizePct(pct);
      setAmountUsd(marginUsd > 0 ? marginUsd.toFixed(2) : '');
      setSizeFromNotional(notional);
    },
    [setSizeFromNotional]
  );

  const applySizePreset = useCallback(
    (pct: number, levOverride?: number) => {
      const lev = levOverride ?? leverage;
      if (tradableUsd <= 0 || markPx <= 0 || lev <= 0) {
        setSizePct(pct);
        return;
      }
      const clamped = Math.max(0, Math.min(100, pct));
      const marginUsd = (tradableUsd * clamped) / 100;
      const notional = marginUsd * lev;
      applyNotional(notional, clamped, marginUsd);
    },
    [applyNotional, leverage, markPx, tradableUsd]
  );

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
    if (tradableUsd <= 0 || markPx <= 0 || leverage <= 0) return;
    const marginUsd = Math.min(usd, tradableUsd);
    const pct = tradableUsd > 0 ? Math.min(100, (marginUsd / tradableUsd) * 100) : 0;
    const notional = marginUsd * leverage;
    setSizePct(pct);
    setSizeFromNotional(notional);
    if (usd > tradableUsd) setAmountUsd(marginUsd.toFixed(2));
  };

  const onSizeInputChange = (raw: string) => {
    setSize(raw);
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || markPx <= 0 || tradableUsd <= 0 || leverage <= 0) return;
    const notional = sizeUnit === 'usd' ? n : n * markPx;
    const marginUsd = notional / leverage;
    const pct = Math.min(100, Math.max(0, (marginUsd / tradableUsd) * 100));
    setSizePct(pct);
    setAmountUsd(marginUsd > 0 ? marginUsd.toFixed(2) : '');
  };

  const canSubmit =
    agentApproved &&
    !busy &&
    markPx > 0 &&
    sizeInCoin > 0 &&
    marginEst >= MIN_MARGIN_USD &&
    marginEst <= tradableUsd + 0.01 &&
    kind === 'market';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (isBotExcludedHlCoin(coinLabel)) {
      onError?.(t('tradePanel.coinExcluded', { coin: coinLabel, defaultValue: `${coinLabel} is not tradable on HyperGain.` }));
      return;
    }
    setBusy(true);
    try {
      await placeHlManualPerpOrderViaAgent({
        walletAddress: wallet,
        coin: coinLabel,
        side,
        kind: 'market',
        size: sizeInCoin,
        markPx,
        leverage,
        marginMode,
        botManaged: true,
      });
      setSize('');
      setAmountUsd('');
      setSizePct(0);
      onSuccess?.();
    } catch (err) {
      const msg = humanizeHlTradeError(err instanceof Error ? err.message : String(err));
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    side === 'long'
      ? t('trading.order.buyLong', { defaultValue: 'Buy / Long' })
      : t('trading.order.sellShort', { defaultValue: 'Sell / Short' });

  return (
    <div className="hl-order-panel hl-agent-manual-panel">
      <div className="hl-entry-head">
        <select
          className="hl-entry-select"
          value={coinLabel}
          onChange={(e) => onCoinChange?.(e.target.value)}
          disabled={busy}
          aria-label={t('tradePanel.manualCoin', { defaultValue: 'Market' })}
        >
          {coinSelect.map((c) => (
            <option key={c} value={c}>
              {c}-PERP
            </option>
          ))}
        </select>
        <select
          className="hl-entry-select"
          value={marginMode}
          onChange={(e) => setMarginMode(e.target.value as MarginMode)}
          disabled={busy}
        >
          <option value="isolated">{t('trading.order.isolated', { defaultValue: 'Isolated' })}</option>
          <option value="cross">{t('trading.order.cross', { defaultValue: 'Cross' })}</option>
        </select>
        <select
          className="hl-entry-select"
          value={leverage}
          onChange={(e) => {
            const lev = Number(e.target.value);
            setLeverage(lev);
            if (sizePct > 0) applySizePreset(sizePct, lev);
          }}
          disabled={busy}
        >
          {leverageOptionsForMax(levMax).map((n) => (
            <option key={n} value={n}>
              {n}x
            </option>
          ))}
        </select>
        <select
          className="hl-entry-select"
          value={kind}
          onChange={(e) => setKind(e.target.value as OrderKind)}
          disabled={busy}
        >
          <option value="limit">{t('trading.order.limit', { defaultValue: 'Limit' })}</option>
          <option value="market">{t('trading.order.market', { defaultValue: 'Market' })}</option>
        </select>
      </div>

      <div className="hl-entry-scroll">
        <div className="hl-entry-side">
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--long ${side === 'long' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('long')}
            disabled={busy}
          >
            {t('trading.order.buyLong', { defaultValue: 'Buy / Long' })}
          </button>
          <button
            type="button"
            className={`hl-entry-side-btn hl-entry-side-btn--short ${side === 'short' ? 'hl-entry-side-btn--on' : ''}`}
            onClick={() => setSide('short')}
            disabled={busy}
          >
            {t('trading.order.sellShort', { defaultValue: 'Sell / Short' })}
          </button>
        </div>

        {!agentApproved ? (
          <p className="hl-entry-hint hl-entry-hint--warn" role="status">
            {t('tradePanel.manualAgentNeedsApproval', {
              defaultValue: 'Approve the trading agent first (Agent tab).',
            })}
          </p>
        ) : null}

        {isBotExcludedHlCoin(coinLabel) ? (
          <p className="hl-entry-hint hl-entry-hint--warn" role="status">
            {t('tradePanel.manualChartExcluded', {
              coin: coinLabel,
              defaultValue: `${coinLabel} matches the chart but new bot/manual opens are disabled for this market.`,
            })}
          </p>
        ) : null}

        <div>
          <div className="hl-entry-label">{t('trading.order.availableToTrade', { defaultValue: 'Available' })}</div>
          <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmtUsdSymbol(tradableUsd)} USDC
          </div>
        </div>

        {kind === 'limit' ? (
          <div>
            <div className="hl-entry-label">{t('trading.order.price', { defaultValue: 'Price' })}</div>
            <input
              className="hl-entry-input"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={markPx > 0 ? String(markPx) : '0'}
              inputMode="decimal"
              disabled
            />
            <p className="hl-entry-hint">{t('tradePanel.manualLimitHint', { defaultValue: 'Agent manual opens are market only — switch to Market.' })}</p>
          </div>
        ) : null}

        <input
          type="range"
          min={0}
          max={100}
          value={sizePct}
          onChange={(e) => applySizePreset(Number(e.target.value))}
          className="hl-entry-slider"
          aria-label={t('trading.order.sizePercent', { defaultValue: 'Size percent' })}
          disabled={busy || tradableUsd < MIN_MARGIN_USD}
        />
        <div className="hl-entry-presets">
          {SIZE_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              className="hl-entry-preset"
              onClick={() => applySizePreset(pct)}
              disabled={busy || tradableUsd < MIN_MARGIN_USD}
            >
              {pct}%
            </button>
          ))}
        </div>

        <div>
          <div className="hl-entry-label-row">
            <span className="hl-entry-label" style={{ marginBottom: 0 }}>
              {t('trading.order.marginUsd', { defaultValue: 'Amount' })}
            </span>
            <span className="hl-entry-amount-suffix">USDC</span>
          </div>
          <input
            className="hl-entry-input"
            value={amountUsd}
            onChange={(e) => applyAmountUsd(e.target.value)}
            placeholder="50"
            inputMode="decimal"
            disabled={busy}
          />
        </div>

        <div>
          <div className="hl-entry-label-row">
            <span className="hl-entry-label" style={{ marginBottom: 0 }}>
              {t('trading.order.size', { defaultValue: 'Size' })}
            </span>
            <div className="hl-entry-unit-toggle" role="group" aria-label={t('trading.order.sizeUnit', { defaultValue: 'Size unit' })}>
              <button
                type="button"
                className={`hl-entry-unit-btn ${sizeUnit === 'coin' ? 'hl-entry-unit-btn--on' : ''}`}
                onClick={() => setSizeUnit('coin')}
                disabled={busy}
              >
                {coinLabel}
              </button>
              <button
                type="button"
                className={`hl-entry-unit-btn ${sizeUnit === 'usd' ? 'hl-entry-unit-btn--on' : ''}`}
                onClick={() => setSizeUnit('usd')}
                disabled={busy}
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
            disabled={busy}
          />
        </div>

        {orderNotional > 0 ? (
          <div className="hl-entry-preview">
            <div>
              {t('trading.order.orderValue', {
                defaultValue: 'Order value {{value}}',
                value: fmtUsdSymbol(orderNotional),
              })}
            </div>
            <div>
              {t('trading.order.marginRequired', {
                defaultValue: 'Margin {{value}}',
                value: fmtUsdSymbol(marginEst),
              })}
            </div>
            <div>
              {t('tradePanel.manualAgentFoot', {
                defaultValue: 'Agent position · profit trail & SL',
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className={`hl-entry-submit ${side === 'short' ? 'hl-entry-submit--short' : ''}`}
          disabled={busy || !agentApproved || (kind === 'market' && !canSubmit)}
          onClick={() => {
            if (kind === 'limit') {
              setKind('market');
              return;
            }
            void handleSubmit();
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> : null}
          {kind === 'limit'
            ? t('tradePanel.manualUseMarket', { defaultValue: 'Use Market' })
            : submitLabel}
        </button>
      </div>
    </div>
  );
};

export default ProTradeAgentManualTrade;
