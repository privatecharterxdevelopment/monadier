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
  /** Entry / liq / bot trailing SL for the active position on this coin */
  positionOverlay?: {
    entryPx: number;
    liqPx?: number;
    side: 'long' | 'short';
    trailStopPx?: number;
    trailStopLocked?: boolean;
    trailFloorUsd?: number;
  };
  tradeMarkers?: SeriesMarker<UTCTimestamp>[];
};

const ProTradeChartInner: React.FC<Props> = ({
  coin,
  interval,
  candles,
  loading,
  openOrders = [],
  orderCoin,
  onIntervalChange,
  layoutKey,
  positionOverlay,
  tradeMarkers = [],
}) => {
  const { theme } = useProTradeTheme();
  const [engine, setEngine] = useState<ChartEngine>('hl');
  const [mountedEngine, setMountedEngine] = useState<ChartEngine | 'none'>('hl');
  const [hlProAvailable, setHlProAvailable] = useState(false);
  const dataCoin = orderCoin ?? coin;
  const instanceId = useId().replace(/:/g, '');

  const switchEngine = (next: ChartEngine) => {
    if (next === engine) return;
    setEngine(next);
    setMountedEngine('none');
  };

  useEffect(() => {
    if (mountedEngine === engine) return undefined;
    const id = window.setTimeout(() => setMountedEngine(engine), 32);
    return () => clearTimeout(id);
  }, [engine, mountedEngine]);

  useEffect(() => {
    let cancelled = false;
    void probeChartingLibraryAvailable().then((ok) => {
      if (!cancelled) setHlProAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="hl-chart-wrap">
      <div className="hl-chart-toolbar">
        <div className="hl-chart-toolbar-left">
          <span className="hl-chart-pair-label">{coin}-USD</span>
          {tradeMarkers.length > 0 ? (
            <span className="hl-chart-marker-legend" title="Bot open/close markers">
              ▲ open/close · {tradeMarkers.length}
            </span>
          ) : null}
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
        <div className="hl-chart-toolbar-right">
          <button
            type="button"
            className={`hl-chart-tf ${engine === 'hl' ? 'hl-chart-tf--on' : ''}`}
            onClick={() => switchEngine('hl')}
          >
            HL
          </button>
          {hlProAvailable ? (
            <button
              type="button"
              className={`hl-chart-tf ${engine === 'hltv' ? 'hl-chart-tf--on' : ''}`}
              onClick={() => switchEngine('hltv')}
              title="Drawing tools, indicators — HL data + TradingView library"
            >
              HL Pro
            </button>
          ) : null}
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
            />
          )}
        </div>
      </ChartPaneErrorBoundary>
    </div>
  );
};

const ProTradeChart = React.memo(ProTradeChartInner);

export default ProTradeChart;
