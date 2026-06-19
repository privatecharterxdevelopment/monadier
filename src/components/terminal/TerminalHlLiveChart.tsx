import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ProTradeHlLightweightChart from '../protrade/ProTradeHlLightweightChart';
import { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import { useHlBotChartMarkers } from '../../hooks/useHlBotChartMarkers';
import {
  PRO_TRADE_INTERVALS,
  PRO_TRADE_QUICK_PICKS,
} from '../../lib/hyperliquid/constants';
import type { HlInterval } from '../../lib/hyperliquid/types';
import {
  binanceSymbolToHlCoin,
  hlCoinToBinanceSymbol,
  pairLabelFromHlCoin,
} from '../../lib/botTradingPairs';
import { fmtPct, fmtPrice } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import { getProTradeChartColors } from '../../lib/proTradeTheme';

type Props = {
  /** Binance-style symbol, e.g. ETHUSDT */
  symbol: string;
  onSymbolChange?: (binanceSymbol: string) => void;
  walletAddress?: string | null;
  markerRefreshKey?: number;
};

const TerminalHlLiveChartInner: React.FC<Props> = ({
  symbol,
  onSymbolChange,
  walletAddress,
  markerRefreshKey = 0,
}) => {
  const coin = useMemo(() => binanceSymbolToHlCoin(symbol), [symbol]);
  const [interval, setInterval] = useState<HlInterval>('1m');
  const [followLive, setFollowLive] = useState(true);
  const [scrollToLiveTick, setScrollToLiveTick] = useState(0);
  const theme = 'light' as const;
  const chartColors = getProTradeChartColors(theme);

  const market = useHyperliquidMarket(coin, interval, 'perp');
  const { seriesMarkers } = useHlBotChartMarkers(
    walletAddress?.toLowerCase(),
    coin,
    { up: chartColors.up, down: chartColors.down },
    markerRefreshKey
  );

  const markPx = toNum(market.snapshot?.markPx);
  const prevDayPx = toNum(market.snapshot?.prevDayPx);
  const dayChangePct =
    markPx > 0 && prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;

  const pickCoins = useMemo(() => {
    const set = new Set<string>([...PRO_TRADE_QUICK_PICKS, coin]);
    return [...set];
  }, [coin]);

  const selectCoin = (next: string) => {
    onSymbolChange?.(hlCoinToBinanceSymbol(next));
  };

  const live = market.wsConnected;
  const hasCandles = market.candles.length > 0;

  return (
    <div className="dashboard2-chart-root term-hl-live-chart">
      <div className="term-hl-live-chart__head">
        <div className="term-chart-live-badge term-hl-live-chart__quote" aria-label="Live HL chart">
          <span
            className={`term-hl-live-dot ${live ? 'term-hl-live-dot--on' : ''}`}
            title={live ? 'Hyperliquid WebSocket connected' : 'Connecting…'}
            aria-hidden
          />
          <span className="term-chart-live-badge__label">{live ? 'Live' : 'Sync'}</span>
          <span className="term-chart-live-badge__pair">{pairLabelFromHlCoin(coin)}</span>
          <span className="term-chart-live-badge__price">
            {markPx > 0 ? `$${fmtPrice(markPx)}` : hasCandles ? '…' : '—'}
          </span>
          {markPx > 0 && prevDayPx > 0 ? (
            <span
              className={
                dayChangePct >= 0
                  ? 'term-chart-live-badge__change term-chart-live-badge__change--up'
                  : 'term-chart-live-badge__change term-chart-live-badge__change--down'
              }
            >
              {fmtPct(dayChangePct)}
            </span>
          ) : null}
        </div>

        <div className="term-hl-live-chart__controls">
          <div className="term-hl-live-chart__coins" role="group" aria-label="Quick pairs">
            {pickCoins.map((c) => (
              <button
                key={c}
                type="button"
                className={`term-hl-live-coin ${c === coin ? 'term-hl-live-coin--on' : ''}`}
                onClick={() => selectCoin(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="term-hl-live-chart__tf" role="group" aria-label="Chart interval">
            {PRO_TRADE_INTERVALS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`term-hl-live-tf ${interval === opt.value ? 'term-hl-live-tf--on' : ''}`}
                onClick={() => setInterval(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!followLive ? (
            <button
              type="button"
              className="term-hl-live-follow-btn"
              onClick={() => {
                setFollowLive(true);
                setScrollToLiveTick((k) => k + 1);
              }}
            >
              → Live
            </button>
          ) : null}
        </div>
      </div>

      <div className="term-hl-live-chart__canvas-wrap">
        {market.loading && !hasCandles ? (
          <div className="term-hl-live-chart__loading">
            <Loader2 size={18} className="animate-spin" aria-hidden />
            <span>Loading HL chart…</span>
          </div>
        ) : null}
        {market.error && !hasCandles ? (
          <div className="term-hl-live-chart__loading term-hl-live-chart__loading--err">
            {market.error}
          </div>
        ) : null}
        <ProTradeHlLightweightChart
          coin={coin}
          interval={interval}
          candles={market.candles}
          loading={market.loading}
          theme={theme}
          layoutKey={`${coin}-${interval}`}
          tradeMarkers={seriesMarkers}
          markPx={markPx > 0 ? markPx : undefined}
          scrollToLiveTick={scrollToLiveTick}
          onFollowLiveChange={setFollowLive}
        />
      </div>
    </div>
  );
};

/** Dashboard2 bot chart — Hyperliquid WebSocket candles (same engine as Pro Trade). */
const TerminalHlLiveChart: React.FC<Props> = (props) => (
  <TerminalHlLiveChartInner {...props} />
);

export default TerminalHlLiveChart;
