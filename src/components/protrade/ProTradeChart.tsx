import React, { useEffect } from 'react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { PRO_TRADE_INTERVALS } from '../../lib/hyperliquid/constants';
import ProTradeHlLightweightChart from './ProTradeHlLightweightChart';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';

type Props = {
  coin: string;
  interval: HlInterval;
  candles: HlCandleBar[];
  loading: boolean;
  openOrders?: HlOpenOrder[];
  orderCoin?: string;
  onIntervalChange: (interval: HlInterval) => void;
  layoutKey?: string;
  markPx?: number;
  positionOverlay?: {
    entryPx: number;
    liqPx?: number;
    side: 'long' | 'short';
    trailStopPx?: number;
    trailStopLocked?: boolean;
    trailFloorUsd?: number;
    stopLossPx?: number;
    takeProfitPx?: number;
    stopLossMarginPct?: number;
    takeProfitMarginPct?: number;
  };
  tradeMarkers?: SeriesMarker<UTCTimestamp>[];
  scrollToLiveTick?: number;
  onFollowLiveChange?: (following: boolean) => void;
};

/** Hyperliquid candle chart — single engine, HL data, Entry/SL/TP/Liq lines. */
const ProTradeChart: React.FC<Props> = ({
  coin,
  interval,
  candles,
  loading,
  openOrders = [],
  orderCoin,
  onIntervalChange,
  layoutKey,
  markPx,
  positionOverlay,
  tradeMarkers = [],
  scrollToLiveTick,
  onFollowLiveChange,
}) => {
  const { theme } = useProTradeTheme();

  useEffect(() => {
    try {
      localStorage.removeItem('monadier-hl-chart-engine');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="hl-chart-wrap">
      <div className="hl-chart-toolbar hl-chart-toolbar--engines">
        <div className="hl-chart-toolbar-left" role="group" aria-label="Chart interval">
          {PRO_TRADE_INTERVALS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`hl-chart-tf ${interval === opt.value ? 'hl-chart-tf--on' : ''}`}
              onClick={() => onIntervalChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="hl-chart-toolbar-meta">Hyperliquid · live</div>
      </div>
      {positionOverlay ? (
        <div className="hl-chart-legend" aria-label="Chart position lines">
          <span className="hl-chart-legend__item hl-chart-legend__item--entry">Entry</span>
          {positionOverlay.stopLossPx ? (
            <span className="hl-chart-legend__item hl-chart-legend__item--sl">SL</span>
          ) : null}
          {positionOverlay.takeProfitPx ? (
            <span className="hl-chart-legend__item hl-chart-legend__item--tp">TP</span>
          ) : null}
          {positionOverlay.trailStopPx ? (
            <span className="hl-chart-legend__item hl-chart-legend__item--trail">Trail SL</span>
          ) : null}
          {positionOverlay.liqPx ? (
            <span className="hl-chart-legend__item hl-chart-legend__item--liq">Liq</span>
          ) : null}
        </div>
      ) : null}
      <div className="hl-chart-engine">
        <ProTradeHlLightweightChart
          coin={coin}
          interval={interval}
          candles={candles}
          loading={loading}
          openOrders={openOrders}
          orderCoin={orderCoin}
          theme={theme}
          layoutKey={layoutKey}
          positionOverlay={positionOverlay}
          tradeMarkers={tradeMarkers}
          markPx={markPx}
          scrollToLiveTick={scrollToLiveTick}
          onFollowLiveChange={onFollowLiveChange}
        />
      </div>
    </div>
  );
};

export default React.memo(ProTradeChart);
