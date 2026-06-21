import React, { Component, useEffect, useId, useState } from 'react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { PRO_TRADE_INTERVALS } from '../../lib/hyperliquid/constants';
import { probeChartingLibraryAvailable } from '../../lib/hyperliquid/chartingLibrary';
import ProTradeTradingViewChart from './ProTradeTradingViewChart';
import ProTradeChartingLibraryChart from './ProTradeChartingLibraryChart';
import ProTradeHlLightweightChart from './ProTradeHlLightweightChart';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';

type ChartEngine = 'hl' | 'tv' | 'hltv';

type ChartPaneBoundaryProps = { children: React.ReactNode; engine: ChartEngine };
type ChartPaneBoundaryState = { error: Error | null };

class ChartPaneErrorBoundary extends Component<ChartPaneBoundaryProps, ChartPaneBoundaryState> {
  state: ChartPaneBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ChartPaneBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ChartPaneBoundaryProps) {
    if (prev.engine !== this.props.engine && this.state.error) {
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
  /** Preferred chart engine on first load (HL Pro when library is present). */
  defaultEngine?: ChartEngine;
  /** Hide TradingView “external data” disclaimer under the chart. */
  hideTvNote?: boolean;
  /** Entry / liq / bot trailing SL for the active position on this coin */
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
};

const CHART_ENGINE_STORAGE = 'monadier-hl-chart-engine';

function readStoredEngine(fallback: ChartEngine): ChartEngine {
  try {
    const stored = localStorage.getItem(CHART_ENGINE_STORAGE);
    if (stored === 'hl' || stored === 'tv' || stored === 'hltv') return stored;
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
  defaultEngine = 'hltv',
  hideTvNote = false,
  positionOverlay,
  tradeMarkers = [],
}) => {
  const { theme } = useProTradeTheme();
  const [engine, setEngine] = useState<ChartEngine>(() => readStoredEngine(defaultEngine));
  const [mountedEngine, setMountedEngine] = useState<ChartEngine | 'none'>(() =>
    readStoredEngine(defaultEngine)
  );
  const [hlProAvailable, setHlProAvailable] = useState(false);
  const dataCoin = orderCoin ?? coin;
  const instanceId = useId().replace(/:/g, '');

  const switchEngine = (next: ChartEngine) => {
    if (next === engine) return;
    if (next === 'hltv' && !hlProAvailable) return;
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

  useEffect(() => {
    let cancelled = false;
    void probeChartingLibraryAvailable().then((ok) => {
      if (cancelled) return;
      setHlProAvailable(ok);
      if (!ok) {
        setEngine((cur) => (cur === 'hltv' ? 'hl' : cur));
        setMountedEngine((cur) => (cur === 'hltv' || cur === 'none' ? 'hl' : cur));
      }
    });
    return () => {
      cancelled = true;
    };
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
        <div className="hl-chart-toolbar-right" role="group" aria-label="Chart engine">
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'hl' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => switchEngine('hl')}
            title="Hyperliquid lightweight chart"
          >
            HL
          </button>
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'hltv' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => hlProAvailable && switchEngine('hltv')}
            disabled={!hlProAvailable}
            title={
              hlProAvailable
                ? 'Drawing tools & indicators (TradingView library + HL data)'
                : 'HL Pro charting library not loaded'
            }
          >
            HL Pro
          </button>
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'tv' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => switchEngine('tv')}
            title="TradingView widget — indicators & drawings"
          >
            TV
          </button>
        </div>
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
          <span className="hl-chart-legend__hint">HL Pro tab = Hyperliquid-style drawing tools</span>
        </div>
      ) : null}
      <ChartPaneErrorBoundary engine={mountedEngine === 'none' ? engine : mountedEngine}>
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
            />
          ) : mountedEngine === 'hltv' ? (
            <ProTradeChartingLibraryChart
              key={`hltv-${instanceId}`}
              coin={dataCoin}
              interval={interval}
              theme={theme}
            />
          ) : (
            <ProTradeTradingViewChart
              key={`tv-${instanceId}`}
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
