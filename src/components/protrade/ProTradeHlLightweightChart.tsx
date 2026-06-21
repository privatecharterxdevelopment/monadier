import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type CandlestickData,
  type HistogramData,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { fmtPrice } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import type { ProTradeTheme } from '../../lib/proTradeTheme';
import { getProTradeChartColors } from '../../lib/proTradeTheme';
import {
  CHART_VISIBLE_BARS,
  chartBarSpacing,
  chartSecondsVisible,
} from '../../lib/hyperliquid/chartZoom';

type Props = {
  coin: string;
  interval?: HlInterval;
  candles: HlCandleBar[];
  loading: boolean;
  openOrders?: HlOpenOrder[];
  orderCoin?: string;
  theme: ProTradeTheme;
  layoutKey?: string;
  positionOverlay?: {
    entryPx: number;
    liqPx?: number;
    side: 'long' | 'short';
    trailStopPx?: number;
    trailStopLocked?: boolean;
    trailFloorUsd?: number;
  };
  tradeMarkers?: SeriesMarker<UTCTimestamp>[];
  /** Live mark price — horizontal line follows HL quote between candle closes. */
  markPx?: number;
  /** Bump to re-enable auto-scroll after user panned away. */
  scrollToLiveTick?: number;
  onFollowLiveChange?: (following: boolean) => void;
};

function safeChartOp(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.warn('[ProTradeHlLightweightChart]', e);
  }
}

/** @deprecated use CHART_VISIBLE_BARS per interval */
const VISIBLE_BARS_FALLBACK = 72;

const ProTradeHlLightweightChart: React.FC<Props> = ({
  coin,
  interval = '5m',
  candles,
  loading,
  openOrders = [],
  orderCoin,
  theme,
  layoutKey,
  positionOverlay,
  tradeMarkers = [],
  markPx,
  scrollToLiveTick = 0,
  onFollowLiveChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markLineRef = useRef<IPriceLine | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
  const candlesRef = useRef<HlCandleBar[]>([]);
  const followLiveRef = useRef(true);
  const suppressFollowDetectRef = useRef(false);
  const aliveRef = useRef(true);
  const overlayCoin = orderCoin ?? coin;
  const chartColors = getProTradeChartColors(theme);
  const overlayRef = useRef(positionOverlay);
  overlayRef.current = positionOverlay;
  const markPxRef = useRef(markPx);
  markPxRef.current = markPx;

  const buildAutoscaleProvider = () => {
    return (original: () => { priceRange?: { minValue: number; maxValue: number } } | null) => {
      const base = original();
      if (!base?.priceRange) return base;
      let { minValue, maxValue } = base.priceRange;
      const overlay = overlayRef.current;
      const extra: number[] = [];
      if (overlay?.entryPx && overlay.entryPx > 0) extra.push(overlay.entryPx);
      if (overlay?.liqPx && overlay.liqPx > 0) extra.push(overlay.liqPx);
      if (overlay?.trailStopPx && overlay.trailStopPx > 0) extra.push(overlay.trailStopPx);
      const liveMark = markPxRef.current;
      if (liveMark != null && liveMark > 0) extra.push(liveMark);
      for (const px of extra) {
        minValue = Math.min(minValue, px);
        maxValue = Math.max(maxValue, px);
      }
      const span = maxValue - minValue;
      const mid = (maxValue + minValue) / 2;
      if (!Number.isFinite(mid) || mid <= 0) return base;
      const minSpan = mid * (interval === '1m' ? 0.002 : interval === '5m' ? 0.003 : 0.005);
      if (span < minSpan) {
        const half = minSpan / 2;
        return { ...base, priceRange: { minValue: mid - half, maxValue: mid + half } };
      }
      const pad = span * 0.05;
      return {
        ...base,
        priceRange: { minValue: minValue - pad, maxValue: maxValue + pad },
      };
    };
  };

  useEffect(() => {
    aliveRef.current = true;
    const el = containerRef.current;
    if (!el) return undefined;

    const colors = getProTradeChartColors(theme);

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontSize: 11,
        fontFamily: 'DM Sans, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.04, bottom: 0.2 },
        autoScale: true,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: chartSecondsVisible(interval),
        barSpacing: 14,
        minBarSpacing: 10,
        rightOffset: 4,
        shiftVisibleRangeOnNewBar: true,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: true,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      wickVisible: true,
    });

    series.applyOptions({
      autoscaleInfoProvider: buildAutoscaleProvider(),
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0.02 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volumeSeries;
    // Trade markers in the volume pane — keeps arrows off the candle bodies.
    markersPluginRef.current = createSeriesMarkers(volumeSeries, [], { zOrder: 'top' });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (suppressFollowDetectRef.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const n = candlesRef.current.length;
      if (!range || n <= 0) return;
      const following = range.to >= n - 2;
      if (following !== followLiveRef.current) {
        followLiveRef.current = following;
        onFollowLiveChange?.(following);
      }
    });

    const ro = new ResizeObserver(() => {
      if (!aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        if (candlesRef.current.length > 0) {
          applyChartZoom(chart, candlesRef.current.length);
        }
      });
    });
    ro.observe(el);
    safeChartOp(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });

    return () => {
      aliveRef.current = false;
      ro.disconnect();
      safeChartOp(() => chart.remove());
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      priceLinesRef.current = [];
      markLineRef.current = null;
      markersPluginRef.current = null;
      el.replaceChildren();
    };
  }, [theme, interval, onFollowLiveChange]);

  const applyChartZoom = (chart: IChartApi, barCount: number) => {
    if (barCount <= 0) return;
    const el = containerRef.current;
    const width = el?.clientWidth ?? 800;
    const visibleBars = CHART_VISIBLE_BARS[interval] ?? VISIBLE_BARS_FALLBACK;
    const spacing = chartBarSpacing(width, interval);
    suppressFollowDetectRef.current = true;
    try {
      chart.timeScale().applyOptions({
        barSpacing: spacing,
        minBarSpacing: Math.max(8, spacing - 4),
        secondsVisible: chartSecondsVisible(interval),
      });
      const from = Math.max(0, barCount - visibleBars);
      chart.timeScale().setVisibleLogicalRange({ from, to: barCount + 2 });
      followLiveRef.current = true;
    } finally {
      requestAnimationFrame(() => {
        suppressFollowDetectRef.current = false;
      });
    }
  };

  const showLatestBars = (chart: IChartApi, barCount: number) => {
    applyChartZoom(chart, barCount);
  };

  const scrollLive = (chart: IChartApi) => {
    suppressFollowDetectRef.current = true;
    try {
      chart.timeScale().scrollToRealTime();
    } finally {
      requestAnimationFrame(() => {
        suppressFollowDetectRef.current = false;
      });
    }
  };

  useEffect(() => {
    const plugin = markersPluginRef.current;
    if (!plugin || !aliveRef.current) return;
    safeChartOp(() => {
      plugin.setMarkers(tradeMarkers);
    });
  }, [tradeMarkers, coin]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || !aliveRef.current) return;
    candlesRef.current = [];
    followLiveRef.current = true;
    const frame = requestAnimationFrame(() => {
      if (!aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        if (candlesRef.current.length > 0) {
          showLatestBars(chart, candlesRef.current.length);
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, coin, interval]);

  useEffect(() => {
    if (!scrollToLiveTick) return;
    const chart = chartRef.current;
    if (!chart || !aliveRef.current) return;
    followLiveRef.current = true;
    onFollowLiveChange?.(true);
    scrollLive(chart);
  }, [scrollToLiveTick, onFollowLiveChange]);

  useEffect(() => {
    const resize = () => {
      const chart = chartRef.current;
      const el = containerRef.current;
      if (!chart || !el || !aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
    };
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!series || !volumeSeries || !chart || !aliveRef.current) return;

    if (candles.length === 0) {
      candlesRef.current = [];
      safeChartOp(() => {
        series.setData([]);
        volumeSeries.setData([]);
      });
      return;
    }

    const prev = candlesRef.current;
    const prevFirst = prev[0]?.time;
    const nextFirst = candles[0]?.time;
    const fullReset =
      prev.length === 0 || prevFirst !== nextFirst || candles.length < prev.length;

    const toCandle = (c: HlCandleBar): CandlestickData => ({
      time: c.time as CandlestickData['time'],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    const toVol = (c: HlCandleBar): HistogramData => ({
      time: c.time as HistogramData['time'],
      value: c.volume ?? 0,
      color: c.close >= c.open ? chartColors.volumeUp : chartColors.volumeDown,
    });

    safeChartOp(() => {
      if (fullReset) {
        const data = candles.map(toCandle);
        const volData = candles.filter((c) => (c.volume ?? 0) > 0).map(toVol);
        series.setData(data);
        volumeSeries.setData(volData);
        showLatestBars(chart, data.length);
        candlesRef.current = candles;
        return;
      }

      const last = candles[candles.length - 1];
      const prevLast = prev[prev.length - 1];
      const newBar = last.time !== prevLast?.time && candles.length > prev.length;

      series.update(toCandle(last));
      if ((last.volume ?? 0) > 0) {
        volumeSeries.update(toVol(last));
      }

      if (newBar && candles.length > prev.length + 1) {
        for (let i = prev.length; i < candles.length - 1; i++) {
          series.update(toCandle(candles[i]));
          const v = candles[i];
          if ((v.volume ?? 0) > 0) volumeSeries.update(toVol(v));
        }
      }

      if (followLiveRef.current) {
        scrollLive(chart);
      }

      candlesRef.current = candles;
    });
  }, [candles, coin, interval, chartColors.volumeDown, chartColors.volumeUp]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !aliveRef.current) return;

    safeChartOp(() => {
      for (const line of priceLinesRef.current) {
        series.removePriceLine(line);
      }
      priceLinesRef.current = [];

      const coinOrders = openOrders.filter((o) => o.coin === overlayCoin);
      for (const o of coinOrders) {
        const px = toNum(o.limitPx);
        if (px <= 0) continue;
        const isBuy = o.side === 'B';
        const line = series.createPriceLine({
          price: px,
          color: isBuy ? chartColors.up : chartColors.down,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Limit ${fmtPrice(px, 0)}`,
        });
        priceLinesRef.current.push(line);
      }

      if (positionOverlay && positionOverlay.entryPx > 0) {
        const entryLine = series.createPriceLine({
          price: positionOverlay.entryPx,
          color: positionOverlay.side === 'long' ? chartColors.up : chartColors.down,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `Entry ${fmtPrice(positionOverlay.entryPx, 0)}`,
        });
        priceLinesRef.current.push(entryLine);
      }
      if (positionOverlay?.liqPx && positionOverlay.liqPx > 0) {
        const liqLine = series.createPriceLine({
          price: positionOverlay.liqPx,
          color: '#ff9800',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Liq ${fmtPrice(positionOverlay.liqPx, 0)}`,
        });
        priceLinesRef.current.push(liqLine);
      }

      const trailPx = positionOverlay?.trailStopPx;
      if (trailPx != null && trailPx > 0) {
        const locked = positionOverlay.trailStopLocked === true;
        const floorUsd = positionOverlay.trailFloorUsd ?? 0;
        const trailLine = series.createPriceLine({
          price: trailPx,
          color: locked ? '#22c55e' : '#eab308',
          lineWidth: 2,
          lineStyle: locked ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: locked
            ? `Trail SL +$${floorUsd.toFixed(2)}`
            : 'Trail SL (arming)',
        });
        priceLinesRef.current.push(trailLine);
      }
    });
  }, [openOrders, overlayCoin, chartColors.down, chartColors.up, positionOverlay]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !aliveRef.current) return;
    safeChartOp(() => {
      series.applyOptions({ autoscaleInfoProvider: buildAutoscaleProvider() });
    });
  }, [positionOverlay, markPx, interval]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !aliveRef.current) return;

    safeChartOp(() => {
      if (markLineRef.current) {
        series.removePriceLine(markLineRef.current);
        markLineRef.current = null;
      }
      if (markPx != null && markPx > 0) {
        markLineRef.current = series.createPriceLine({
          price: markPx,
          color: chartColors.crosshair,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Mark',
        });
      }
    });
  }, [markPx, chartColors.crosshair]);

  return (
    <>
      {loading && candles.length === 0 ? (
        <div className="hl-chart-empty">Loading chart…</div>
      ) : null}
      {!loading && candles.length === 0 ? (
        <div className="hl-chart-empty">Chart data unavailable</div>
      ) : null}
      <div ref={containerRef} className="hl-chart-canvas" />
    </>
  );
};

export default ProTradeHlLightweightChart;
