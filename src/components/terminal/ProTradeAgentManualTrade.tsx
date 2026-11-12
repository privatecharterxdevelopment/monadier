import React, { useCallback, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clampLeverage } from '../../lib/leverageLimits';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { humanizeHlTradeError } from '../../lib/hyperliquid/orders';
import { placeHlManualPerpOrderViaAgent } from '../../lib/hyperliquid/hlManualOrder';
import type { OrderSide } from '../../hooks/useHyperliquidTrading';
import { toNum } from '../../lib/hyperliquid/parse';

const MIN_MARGIN_USD = 5;
const MARGIN_PRESETS = [25, 50, 75, 100] as const;

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
  const [side, setSide] = useState<OrderSide>('long');
  const [leverage, setLeverage] = useState(() =>
    clampLeverage(Math.min(10, maxLeverage > 0 ? maxLeverage : 10))
  );
  const [marginUsd, setMarginUsd] = useState('');
  const [busy, setBusy] = useState(false);

  const marginNum = toNum(marginUsd);
  const notionalUsd = marginNum > 0 ? marginNum * leverage : 0;
  const sizeCoin = markPx > 0 && notionalUsd > 0 ? notionalUsd / markPx : 0;

  const canSubmit =
    agentApproved &&
    !busy &&
    markPx > 0 &&
    marginNum >= MIN_MARGIN_USD &&
    marginNum <= tradableUsd + 0.01 &&
    sizeCoin > 0;

  const applyMarginPct = useCallback(
    (pct: number) => {
      const m = Math.max(0, tradableUsd * (pct / 100));
      setMarginUsd(m >= MIN_MARGIN_USD ? m.toFixed(2) : '');
    },
    [tradableUsd]
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await placeHlManualPerpOrderViaAgent({
        walletAddress: wallet,
        coin: coin.toUpperCase(),
        side,
        kind: 'market',
        size: sizeCoin,
        markPx,
        leverage,
        marginMode: 'isolated',
        botManaged: true,
      });
      onSuccess?.();
      setMarginUsd('');
    } catch (err) {
      const msg = humanizeHlTradeError(err instanceof Error ? err.message : String(err));
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const coinSelect = useMemo(() => {
    const opts = marketOptions.length > 0 ? marketOptions : [coin];
    const unique = [...new Set([coin, ...opts.map((c) => c.toUpperCase())])];
    return unique.slice(0, 48);
  }, [coin, marketOptions]);

  return (
    <div className="term-panel-card term-agent-manual-trade">
      <div className="term-agent-manual-head">
        <span className="term-panel-card-label">
          {t('tradePanel.manualAgentTitle', { defaultValue: 'Manual agent trade' })}
        </span>
        <p className="term-hint term-agent-manual-sub">
          {t('tradePanel.manualAgentSub', {
            defaultValue:
              'Market open via your HL agent — shows under Agent positions with profit trail & emergency SL.',
          })}
        </p>
      </div>

      {!agentApproved ? (
        <p className="term-hint term-agent-manual-warn" role="status">
          {t('tradePanel.manualAgentNeedsApproval', {
            defaultValue: 'Approve the trading agent first (Bot tab).',
          })}
        </p>
      ) : null}

      <div className="term-agent-manual-row">
        <label className="term-agent-manual-field">
          <span>{t('tradePanel.manualCoin', { defaultValue: 'Market' })}</span>
          <select
            value={coin.toUpperCase()}
            onChange={(e) => onCoinChange?.(e.target.value)}
            disabled={busy}
          >
            {coinSelect.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="term-agent-manual-side">
          <button
            type="button"
            className={`term-agent-side-btn term-agent-side-btn--long ${side === 'long' ? 'term-agent-side-btn--on' : ''}`}
            onClick={() => setSide('long')}
            disabled={busy}
          >
            Long
          </button>
          <button
            type="button"
            className={`term-agent-side-btn term-agent-side-btn--short ${side === 'short' ? 'term-agent-side-btn--on' : ''}`}
            onClick={() => setSide('short')}
            disabled={busy}
          >
            Short
          </button>
        </div>
      </div>

      <label className="term-agent-manual-field">
        <span>
          {t('tradePanel.manualLeverage', { defaultValue: 'Leverage' })}{' '}
          <strong>{leverage}×</strong>
        </span>
        <input
          type="range"
          min={1}
          max={Math.max(1, maxLeverage || 40)}
          step={1}
          value={leverage}
          onChange={(e) =>
            setLeverage(clampLeverage(Number(e.target.value), undefined, maxLeverage || 40))
          }
          disabled={busy}
        />
      </label>

      <label className="term-agent-manual-field">
        <span>{t('tradePanel.manualMargin', { defaultValue: 'Margin (USDC)' })}</span>
        <input
          type="number"
          min={MIN_MARGIN_USD}
          step="0.01"
          placeholder={`${MIN_MARGIN_USD} – ${tradableUsd.toFixed(0)}`}
          value={marginUsd}
          onChange={(e) => setMarginUsd(e.target.value)}
          disabled={busy}
        />
      </label>

      <div className="term-agent-manual-presets">
        {MARGIN_PRESETS.map((pct) => (
          <button
            key={pct}
            type="button"
            className="term-btn-sm"
            onClick={() => applyMarginPct(pct)}
            disabled={busy || tradableUsd < MIN_MARGIN_USD}
          >
            {pct}%
          </button>
        ))}
      </div>

      <dl className="term-agent-manual-summary">
        <div>
          <dt>{t('tradePanel.manualNotional', { defaultValue: 'Notional' })}</dt>
          <dd>{notionalUsd > 0 ? fmtUsdSymbol(notionalUsd) : '—'}</dd>
        </div>
        <div>
          <dt>{t('tradePanel.manualSize', { defaultValue: 'Size' })}</dt>
          <dd>{sizeCoin > 0 ? sizeCoin.toFixed(4) : '—'}</dd>
        </div>
        <div>
          <dt>Mark</dt>
          <dd>{markPx > 0 ? markPx.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}</dd>
        </div>
      </dl>

      <button
        type="button"
        className={`term-btn-sm term-btn-sm--primary w-full justify-center term-agent-manual-submit ${
          side === 'long' ? 'term-agent-manual-submit--long' : 'term-agent-manual-submit--short'
        }`}
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {side === 'long'
          ? t('tradePanel.manualBuyMarket', { defaultValue: 'Long · market' })
          : t('tradePanel.manualSellMarket', { defaultValue: 'Short · market' })}
      </button>
    </div>
  );
};

export default ProTradeAgentManualTrade;
