import React, { Component, useEffect, useState } from 'react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { PRO_TRADE_INTERVALS } from '../../lib/hyperliquid/constants';
import ProTradeTradingViewChart from './ProTradeTradingViewChart';
import ProTradeHlLightweightChart from './ProTradeHlLightweightChart';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';

type ChartEngine = 'hl' | 'tv';

type ChartPaneBoundaryProps = {
  children: React.ReactNode;
  engine: ChartEngine;
  theme: string;
};
type ChartPaneBoundaryState = { error: Error | null };

class ChartPaneErrorBoundary extends Component<ChartPaneBoundaryProps, ChartPaneBoundaryState> {
  state: ChartPaneBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ChartPaneBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ChartPaneBoundaryProps) {
    if (
      (prev.engine !== this.props.engine || prev.theme !== this.props.theme) &&
      this.state.error
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="hl-chart-empty">
          Chart failed to load ({this.props.engine.toUpperCase()}). Switch to HL or refresh.
          <br />
          <span style={{ fontSize: 11, opacity: 0.7 }}>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

type Props = {
  coin: string;
  interval: HlInterval;
  candles: HlCandleBar[];
  loading: boolean;
  openOrders?: HlOpenOrder[];
  orderCoin?: string;
  onIntervalChange: (interval: HlInterval) => void;
  layoutKey?: string;
  defaultEngine?: ChartEngine;
  hideTvNote?: boolean;
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

const CHART_ENGINE_STORAGE = 'monadier-hl-chart-engine';

function readStoredEngine(fallback: ChartEngine): ChartEngine {
  try {
    const stored = localStorage.getItem(CHART_ENGINE_STORAGE);
    if (stored === 'hl' || stored === 'tv') return stored;
    if (stored === 'hltv') return 'hl';
  } catch {
    /* private mode */
  }
  return fallback;
}

const ProTradeChartInner: React.FC<Props> = ({
  coin,
  interval,
  candles,
  loading,
  openOrders = [],
  orderCoin,
  onIntervalChange,
  layoutKey,
  defaultEngine = 'hl',
  hideTvNote = false,
  markPx,
  positionOverlay,
  tradeMarkers = [],
  scrollToLiveTick,
  onFollowLiveChange,
}) => {
  const { theme } = useProTradeTheme();
  const [engine, setEngine] = useState<ChartEngine>(() => readStoredEngine(defaultEngine));
  const [mountedEngine, setMountedEngine] = useState<ChartEngine | 'none'>(() =>
    readStoredEngine(defaultEngine)
  );

  const switchEngine = (next: ChartEngine) => {
    if (next === engine) return;
    setEngine(next);
    setMountedEngine('none');
    try {
      localStorage.setItem(CHART_ENGINE_STORAGE, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (mountedEngine === engine) return undefined;
    const id = window.setTimeout(() => setMountedEngine(engine), 32);
    return () => clearTimeout(id);
  }, [engine, mountedEngine]);

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
        <div className="hl-chart-toolbar-right" role="group" aria-label="Chart engine">
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'hl' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => switchEngine('hl')}
            title="Hyperliquid live chart — entry, SL, TP, bot markers"
          >
            HL
          </button>
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'tv' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => switchEngine('tv')}
            title="TradingView — indicators & drawings"
          >
            TV
          </button>
        </div>
      </div>
      {positionOverlay && engine === 'hl' ? (
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
      <ChartPaneErrorBoundary
        engine={mountedEngine === 'none' ? engine : mountedEngine}
        theme={theme}
      >
        <div className="hl-chart-engine">
          {mountedEngine === 'none' ? (
            <div className="hl-chart-empty" aria-hidden />
          ) : mountedEngine === 'hl' ? (
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
          ) : (
            <ProTradeTradingViewChart
              key={`tv-${theme}-${coin}-${interval}`}
              coin={coin}
              interval={interval}
              theme={theme}
              hideNote={hideTvNote}
            />
          )}
        </div>
      </ChartPaneErrorBoundary>
    </div>
  );
};

const ProTradeChart = React.memo(ProTradeChartInner);

export default ProTradeChart;
