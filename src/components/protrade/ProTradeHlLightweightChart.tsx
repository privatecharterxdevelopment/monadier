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
import { toNum } from '../../lib/hyperliquid/parse';
import type { ProTradeTheme } from '../../lib/proTradeTheme';
import { getProTradeChartColors } from '../../lib/proTradeTheme';
import {
  CHART_VISIBLE_BARS,
  chartBarSpacing,
  chartMinBarSpacing,
  chartSecondsVisible,
} from '../../lib/hyperliquid/chartZoom';
import { candlePriceRange, chartSanitizeRef, patchFormingCandleWithMark, resolveChartCandlesForDisplay } from '../../lib/hyperliquid/chartCandles';
import {
  buildChartPriceFormatter,
  buildChartTickmarksFormatter,
  buildSeriesPriceFormat,
} from '../../lib/hyperliquid/chartPriceAxis';

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
    trailCloseFloorUsd?: number;
    trailBreached?: boolean;
    unrealizedPnlUsd?: number;
    stopLossPx?: number;
    takeProfitPx?: number;
    stopLossMarginPct?: number;
    takeProfitMarginPct?: number;
  };
  tradeMarkers?: SeriesMarker<UTCTimestamp>[];
  /** Live mark price — horizontal line follows HL quote between candle closes. */
  markPx?: number;
  /** Bump to re-enable auto-scroll after user panned away. */
  scrollToLiveTick?: number;
  onFollowLiveChange?: (following: boolean) => void;
  onRetry?: () => void;
  wsConnected?: boolean;
  chartError?: string | null;
  fetchAttempts?: number;
};

function safeChartOp(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.warn('[ProTradeHlLightweightChart]', e);
  }
}

type OverlayProps = NonNullable<Props['positionOverlay']>;

function applyPositionPriceLines(
  series: ISeriesApi<'Candlestick'>,
  priceLinesRef: React.MutableRefObject<IPriceLine[]>,
  opts: {
    openOrders: HlOpenOrder[];
    overlayCoin: string;
    positionOverlay?: OverlayProps;
    chartColors: ReturnType<typeof getProTradeChartColors>;
  }
) {
  for (const line of priceLinesRef.current) {
    series.removePriceLine(line);
  }
  priceLinesRef.current = [];

  const { openOrders, overlayCoin, positionOverlay, chartColors } = opts;
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
      title: '',
    });
    priceLinesRef.current.push(line);
  }

  if (positionOverlay && positionOverlay.entryPx > 0) {
    priceLinesRef.current.push(
      series.createPriceLine({
        price: positionOverlay.entryPx,
        color: positionOverlay.side === 'long' ? chartColors.up : chartColors.down,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'Entry',
      })
    );
  }

  // Max-loss / liquidation are settings-only — never drawn or dragged on the chart.

  const trailPx = positionOverlay?.trailStopPx;
  if (trailPx != null && trailPx > 0) {
    const locked = positionOverlay.trailStopLocked === true;
    const breached = positionOverlay.trailBreached === true;
    priceLinesRef.current.push(
      series.createPriceLine({
        price: trailPx,
        color: breached ? '#ef4444' : locked ? '#22c55e' : '#eab308',
        lineWidth: 2,
        lineStyle: locked ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: locked ? (breached ? 'Trail!' : 'Trail') : 'Trail',
      })
    );
  }

  const tpPx = positionOverlay?.takeProfitPx;
  if (tpPx != null && tpPx > 0) {
    const tpPct = positionOverlay.takeProfitMarginPct ?? 0;
    priceLinesRef.current.push(
      series.createPriceLine({
        price: tpPx,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: tpPct > 0 ? `TP +${tpPct}%` : 'Take profit',
      })
    );
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
  onRetry,
  wsConnected,
  chartError,
  fetchAttempts,
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
  const onFollowLiveChangeRef = useRef(onFollowLiveChange);
  onFollowLiveChangeRef.current = onFollowLiveChange;
  const themeRef = useRef(theme);
  const prevThemeForDataRef = useRef(theme);
  const prevCoinForDataRef = useRef(coin);
  const prevIntervalForDataRef = useRef(interval);
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const lastChartSizeRef = useRef({ w: 0, h: 0 });
  const lastAxisRefPxRef = useRef(0);

  const buildAutoscaleProvider = () => {
    return () => {
      // Autoscale from candles + live mark ONLY.
      // Overlay Stop/TP/Liq must not stretch the scale — orphan drafts / max-loss lines
      // squash candles to a flat strip at the bottom (classic empty chart look).
      const liveMark = markPxRef.current;
      const extra: number[] = [];
      if (liveMark != null && liveMark > 0) extra.push(liveMark);
      const range = candlePriceRange(candlesRef.current, liveMark ?? undefined, extra);
      if (range) return { priceRange: range };
      return null;
    };
  };

  const applyChartPriceAxis = (
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    refPx: number
  ) => {
    const px = refPx > 0 ? refPx : 1;
    // Skip noise — tiny ref swings flip priceFormat digits and resize the right axis → L/R shake.
    const prev = lastAxisRefPxRef.current;
    if (prev > 0 && Math.abs(px - prev) / prev < 0.002) return;
    lastAxisRefPxRef.current = px;
    chart.applyOptions({
      localization: {
        priceFormatter: buildChartPriceFormatter(px),
        tickmarksPriceFormatter: buildChartTickmarksFormatter(px),
      },
      rightPriceScale: {
        minimumWidth: 88,
        ticksVisible: true,
        alignLabels: true,
      },
    });
    series.applyOptions({
      priceFormat: buildSeriesPriceFormat(px),
    });
  };

  const applyChartTheme = (
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    colors: ReturnType<typeof getProTradeChartColors>
  ) => {
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
      },
    });
    series.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  };

  useEffect(() => {
    aliveRef.current = true;
    const el = containerRef.current;
    if (!el) return undefined;

    const colors = getProTradeChartColors(themeRef.current);

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
        minimumWidth: 88,
        ticksVisible: true,
        alignLabels: true,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: chartSecondsVisible(interval),
        barSpacing: 14,
        minBarSpacing: chartMinBarSpacing(),
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

    const seedPx =
      candlesRef.current[candlesRef.current.length - 1]?.close ??
      markPxRef.current ??
      1;
    applyChartPriceAxis(chart, series, seedPx);

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
    markersPluginRef.current = createSeriesMarkers(series, [], { zOrder: 'top' });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (suppressFollowDetectRef.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const n = candlesRef.current.length;
      if (!range || n <= 0) return;
      const following = range.to >= n - 2;
      if (following !== followLiveRef.current) {
        followLiveRef.current = following;
        onFollowLiveChangeRef.current?.(following);
      }
      // Do not re-apply price axis here — digit jumps change axis width and shake L/R.
    });

    const ro = new ResizeObserver(() => {
      if (!aliveRef.current) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 2 || h < 2) return;
      const prev = lastChartSizeRef.current;
      if (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1) return;
      lastChartSizeRef.current = { w, h };
      safeChartOp(() => {
        // Resize only — never reset visible range (that caused L/R shake).
        chart.applyOptions({ width: w, height: h });
        const spacing = chartBarSpacing(w, intervalRef.current);
        chart.timeScale().applyOptions({
          barSpacing: spacing,
          minBarSpacing: chartMinBarSpacing(),
        });
      });
    });
    ro.observe(el);
    safeChartOp(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      lastChartSizeRef.current = { w: el.clientWidth, h: el.clientHeight };
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
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !aliveRef.current) return;

    const el = containerRef.current;
    const width = el?.clientWidth ?? 800;
    const spacing = chartBarSpacing(width, interval);
    safeChartOp(() => {
      chart.timeScale().applyOptions({
        barSpacing: spacing,
        minBarSpacing: chartMinBarSpacing(),
        secondsVisible: chartSecondsVisible(interval),
      });
      applyPositionPriceLines(series, priceLinesRef, {
        openOrders,
        overlayCoin,
        positionOverlay: overlayRef.current,
        chartColors: getProTradeChartColors(themeRef.current),
      });
    });
  }, [openOrders, overlayCoin]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !aliveRef.current) return;

    const el = containerRef.current;
    const width = el?.clientWidth ?? 800;
    const spacing = chartBarSpacing(width, interval);
    safeChartOp(() => {
      chart.timeScale().applyOptions({
        barSpacing: spacing,
        minBarSpacing: chartMinBarSpacing(),
        secondsVisible: chartSecondsVisible(interval),
      });
      if (candlesRef.current.length > 0) {
        applyChartZoom(chart, candlesRef.current.length);
      }
    });
  }, [interval]);

  useEffect(() => {
    themeRef.current = theme;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!chart || !series || !el || !aliveRef.current) return;

    const colors = getProTradeChartColors(theme);
    safeChartOp(() => {
      applyChartTheme(chart, series, colors);
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
  }, [theme]);

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
        minBarSpacing: chartMinBarSpacing(),
        secondsVisible: chartSecondsVisible(interval),
      });
      if (barCount <= visibleBars + 24) {
        chart.timeScale().fitContent();
      } else {
        const from = Math.max(0, barCount - visibleBars);
        chart.timeScale().setVisibleLogicalRange({ from, to: barCount + 2 });
      }
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
    const series = seriesRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!series || !volumeSeries || !chart || !aliveRef.current) return;

    candlesRef.current = [];
    prevCoinForDataRef.current = '';
    prevIntervalForDataRef.current = '';
    followLiveRef.current = true;
    lastAxisRefPxRef.current = 0;

    safeChartOp(() => {
      series.setData([]);
      volumeSeries.setData([]);
      for (const line of priceLinesRef.current) {
        series.removePriceLine(line);
      }
      priceLinesRef.current = [];
      if (markLineRef.current) {
        series.removePriceLine(markLineRef.current);
        markLineRef.current = null;
      }
      markersPluginRef.current?.setMarkers([]);
    });
  }, [coin, layoutKey]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || !aliveRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, coin, interval]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !aliveRef.current) return undefined;
    let attempts = 0;
    let raf = 0;
    let didInitialZoom = false;
    const ensureSize = () => {
      if (!aliveRef.current) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if ((w < 2 || h < 2) && attempts < 24) {
        attempts += 1;
        raf = requestAnimationFrame(ensureSize);
        return;
      }
      const chart = chartRef.current;
      if (chart && w >= 2 && h >= 2) {
        safeChartOp(() => {
          chart.applyOptions({ width: w, height: h });
          lastChartSizeRef.current = { w, h };
          if (candlesRef.current.length > 0 && !didInitialZoom) {
            applyChartZoom(chart, candlesRef.current.length);
            didInitialZoom = true;
          }
        });
      }
    };
    ensureSize();
    return () => cancelAnimationFrame(raf);
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

    const refPx = chartSanitizeRef(candles, markPxRef.current);
    const liveCandles = patchFormingCandleWithMark(candles, markPxRef.current);
    const resolved = resolveChartCandlesForDisplay(liveCandles, refPx);
    const clean = resolved.candles;

    if (clean.length === 0) {
      candlesRef.current = [];
      safeChartOp(() => {
        series.setData([]);
        volumeSeries.setData([]);
      });
      return;
    }

    const prev = candlesRef.current;
    const prevFirst = prev[0]?.time;
    const nextFirst = clean[0]?.time;
    const themeChanged = prevThemeForDataRef.current !== theme;
    const coinChanged = prevCoinForDataRef.current !== coin;
    const intervalChanged = prevIntervalForDataRef.current !== interval;
    if (themeChanged) prevThemeForDataRef.current = theme;
    if (coinChanged) prevCoinForDataRef.current = coin;
    if (intervalChanged) prevIntervalForDataRef.current = interval;
    const fullReset =
      themeChanged ||
      coinChanged ||
      intervalChanged ||
      prev.length === 0 ||
      prevFirst !== nextFirst ||
      clean.length < prev.length;

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

    const axisRefPx =
      refPx ?? clean[clean.length - 1]?.close ?? markPxRef.current ?? 1;

    safeChartOp(() => {
      applyChartPriceAxis(chart, series, axisRefPx);

      if (fullReset) {
        const data = clean.map(toCandle);
        const volData = clean.filter((c) => (c.volume ?? 0) > 0).map(toVol);
        series.setData(data);
        volumeSeries.setData(volData);
        showLatestBars(chart, data.length);
        candlesRef.current = clean;
        return;
      }

      const last = clean[clean.length - 1];
      const prevLast = prev[prev.length - 1];
      const newBar = last.time !== prevLast?.time && clean.length > prev.length;

      series.update(toCandle(last));
      if ((last.volume ?? 0) > 0) {
        volumeSeries.update(toVol(last));
      }

      if (newBar && clean.length > prev.length + 1) {
        for (let i = prev.length; i < clean.length - 1; i++) {
          series.update(toCandle(clean[i]));
          const v = clean[i];
          if ((v.volume ?? 0) > 0) volumeSeries.update(toVol(v));
        }
      }

      // Only snap on a new bar — per-tick scrollToRealTime fights the live range and shakes L/R.
      if (followLiveRef.current && newBar) {
        scrollLive(chart);
      }

      candlesRef.current = clean;
    });
  }, [candles, coin, interval, theme, markPx, loading, chartError, wsConnected, fetchAttempts]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !aliveRef.current) return;

    safeChartOp(() => {
      applyPositionPriceLines(series, priceLinesRef, {
        openOrders,
        overlayCoin,
        positionOverlay,
        chartColors,
      });
    });
  }, [openOrders, overlayCoin, theme, positionOverlay, chartColors]);

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
  }, [markPx, theme]);

  const isBlank = !loading && candles.length === 0;

  return (
    <div className="hl-chart-canvas-wrap">
      {loading && candles.length === 0 ? (
        <div className="hl-chart-empty">Loading chart…</div>
      ) : null}
      {isBlank ? (
        <div className="hl-chart-empty hl-chart-empty--action">
          <span>{chartError ?? 'Chart data unavailable'}</span>
          {onRetry ? (
            <button type="button" className="hl-chart-empty__retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={containerRef} className="hl-chart-canvas" />
    </div>
  );
};

export default ProTradeHlLightweightChart;
