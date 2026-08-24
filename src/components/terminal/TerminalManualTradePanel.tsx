import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { placeHlManualPerpOrderViaAgent } from '../../lib/hyperliquid/hlManualOrder';
import { fetchHlMarkets } from '../../lib/hyperliquid/markets';
import { leverageOptionsForMax } from '../../lib/hyperliquid/assetLeverage';
import { isBotExcludedHlCoin } from '../../lib/botTradingPairs';
import { useLegalAcceptance } from '../../contexts/LegalAcceptanceContext';

const COIN_CHIPS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP'] as const;

type Props = {
  walletAddress?: string;
  disabled?: boolean;
  chartCoin?: string;
  agentApproved?: boolean;
};

const TerminalManualTradePanel: React.FC<Props> = ({
  walletAddress,
  disabled,
  chartCoin,
  agentApproved = false,
}) => {
  const { t } = useTranslation();
  const { ensureAccepted } = useLegalAcceptance();
  const [coin, setCoin] = useState((chartCoin || 'BTC').toUpperCase());
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState('10');
  const [amountUsd, setAmountUsd] = useState('');
  const [markPx, setMarkPx] = useState(0);
  const [maxLev, setMaxLev] = useState(40);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const coinKey = coin.trim().toUpperCase();

  useEffect(() => {
    if (!chartCoin) return;
    const next = chartCoin.trim().toUpperCase();
    if (next) setCoin(next);
  }, [chartCoin]);

  useEffect(() => {
    if (!coinKey) return;
    let cancelled = false;
    void fetchHlMarkets().then((markets) => {
      if (cancelled) return;
      const m = markets.find((row) => row.name.toUpperCase() === coinKey);
      setMarkPx(m?.markPx ?? 0);
      const cap = Math.max(1, Math.floor(m?.maxLeverage || 40));
      setMaxLev(cap);
      setLeverage((prev) => {
        const n = Math.floor(Number(prev) || 10);
        return String(Math.min(cap, Math.max(1, n)));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [coinKey]);

  const levChips = useMemo(() => leverageOptionsForMax(maxLev), [maxLev]);
  const notional = Number(amountUsd);
  const size = markPx > 0 && Number.isFinite(notional) && notional > 0 ? notional / markPx : 0;
  const levNum = Math.min(maxLev, Math.max(1, Math.floor(Number(leverage) || 1)));
  const blocked = Boolean(disabled || busy || !walletAddress);

  const submit = async () => {
    setError(null);
    setOk(null);
    if (!walletAddress) {
      setError(t('tradePanel.manual.connectFirst', { defaultValue: 'Connect wallet first.' }));
      return;
    }
    if (!agentApproved) {
      setError(
        t('tradePanel.manual.needAgent', {
          defaultValue: 'Approve the trading agent on the Agent tab once, then open here without signing each order.',
        })
      );
      return;
    }
    if (!coinKey) {
      setError(t('tradePanel.manual.pickCoin', { defaultValue: 'Pick a coin.' }));
      return;
    }
    if (isBotExcludedHlCoin(coinKey)) {
      setError(`${coinKey} is delisted — no new opens (Close only).`);
      return;
    }
    if (!(size > 0) || !(markPx > 0)) {
      setError(t('tradePanel.manual.enterSize', { defaultValue: 'Enter a size in USD.' }));
      return;
    }
    setBusy(true);
    try {
      await placeHlManualPerpOrderViaAgent({
        walletAddress,
        coin: coinKey,
        side,
        kind: 'market',
        size,
        markPx,
        leverage: levNum,
        marginMode: 'isolated',
        botManaged: false,
      });
      setOk(
        t('tradePanel.manual.sent', {
          side: side.toUpperCase(),
          coin: coinKey,
          lev: levNum,
          usd: notional.toFixed(0),
          defaultValue: `${side.toUpperCase()} ${coinKey} ${levNum}x · $${notional.toFixed(0)} opened — see Trade → Positions`,
        })
      );
      setAmountUsd('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="term-panel-stack term-manual-trade">
      <p className="term-hint">
        {t('tradePanel.manual.hint', {
          defaultValue:
            'Market open on your Hyperliquid account via the HyperGain agent. Not trailed by the bot.',
        })}
      </p>

      <label className="term-field">
        <span>{t('tradePanel.manual.coin', { defaultValue: 'Coin' })}</span>
        <input
          className="term-panel-input"
          value={coin}
          disabled={blocked}
          onChange={(e) => setCoin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
      </label>
      <div className="term-manual-chips">
        {COIN_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={blocked}
            className={`term-chip ${coinKey === c ? 'term-chip--on' : ''}`}
            onClick={() => setCoin(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="term-manual-sides">
        <button
          type="button"
          disabled={blocked}
          className={`term-manual-side term-manual-side--long ${side === 'long' ? 'is-on' : ''}`}
          onClick={() => setSide('long')}
        >
          {t('tradePanel.manual.long', { defaultValue: 'Long' })}
        </button>
        <button
          type="button"
          disabled={blocked}
          className={`term-manual-side term-manual-side--short ${side === 'short' ? 'is-on' : ''}`}
          onClick={() => setSide('short')}
        >
          {t('tradePanel.manual.short', { defaultValue: 'Short' })}
        </button>
      </div>

      <label className="term-field">
        <span>
          {t('tradePanel.manual.leverage', { defaultValue: 'Leverage' })} (max {maxLev}x)
        </span>
        <input
          className="term-panel-input"
          inputMode="numeric"
          value={leverage}
          disabled={blocked}
          onChange={(e) => setLeverage(e.target.value.replace(/[^\d]/g, ''))}
        />
      </label>
      <div className="term-manual-chips">
        {levChips.map((n) => (
          <button
            key={n}
            type="button"
            disabled={blocked}
            className={`term-chip ${levNum === n ? 'term-chip--on' : ''}`}
            onClick={() => setLeverage(String(n))}
          >
            {n}x
          </button>
        ))}
      </div>

      <label className="term-field">
        <span>{t('tradePanel.manual.sizeUsd', { defaultValue: 'Size (USD)' })}</span>
        <input
          className="term-panel-input"
          inputMode="decimal"
          placeholder="e.g. 500"
          value={amountUsd}
          disabled={blocked}
          onChange={(e) => setAmountUsd(e.target.value.replace(/[^\d.]/g, ''))}
        />
      </label>
      {markPx > 0 && size > 0 ? (
        <p className="term-hint">
          Mark ${markPx.toLocaleString()} · {size.toPrecision(4)} {coinKey} · {levNum}x
        </p>
      ) : null}

      {error ? (
        <div className="term-panel-alert">
          <span>{error}</span>
        </div>
      ) : null}
      {ok ? <p className="term-hint term-hint--ok">{ok}</p> : null}

      <button
        type="button"
        className={`term-btn-sm term-btn-sm--primary w-full justify-center ${
          side === 'short' ? 'term-manual-submit--short' : ''
        }`}
        disabled={blocked}
        onClick={() => ensureAccepted(() => void submit())}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {busy
          ? t('tradePanel.manual.sending', { defaultValue: 'Sending…' })
          : t('tradePanel.manual.submit', {
              side: side.toUpperCase(),
              coin: coinKey || '—',
              lev: levNum,
              defaultValue: `Open ${side.toUpperCase()} ${coinKey || '—'} ${levNum}x`,
            })}
      </button>
    </div>
  );
};

export default TerminalManualTradePanel;
