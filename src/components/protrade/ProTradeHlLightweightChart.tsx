import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
} from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { fmtPrice } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import type { ProTradeTheme } from '../../lib/proTradeTheme';
import { getProTradeChartColors } from '../../lib/proTradeTheme';

type Props = {
  coin: string;
  candles: HlCandleBar[];
  loading: boolean;
  openOrders?: HlOpenOrder[];
  orderCoin?: string;
  theme: ProTradeTheme;
  layoutKey?: string;
};

function safeChartOp(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.warn('[ProTradeHlLightweightChart]', e);
  }
}

/** Isolated HL lightweight-charts instance — unmounts fully when switching to TradingView. */
const ProTradeHlLightweightChart: React.FC<Props> = ({
  coin,
  candles,
  loading,
  openOrders = [],
  orderCoin,
  theme,
  layoutKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const aliveRef = useRef(true);
  const overlayCoin = orderCoin ?? coin;
  const chartColors = getProTradeChartColors(theme);

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
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (!aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
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
    };
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || !aliveRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!aliveRef.current) return;
      safeChartOp(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        chart.timeScale().fitContent();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, coin]);

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
      safeChartOp(() => {
        series.setData([]);
        volumeSeries.setData([]);
      });
      return;
    }

    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as CandlestickData['time'],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volData: HistogramData[] = candles
      .filter((c) => (c.volume ?? 0) > 0)
      .map((c) => ({
        time: c.time as HistogramData['time'],
        value: c.volume ?? 0,
        color: c.close >= c.open ? chartColors.volumeUp : chartColors.volumeDown,
      }));

    safeChartOp(() => {
      series.setData(data);
      volumeSeries.setData(volData);
      chart.timeScale().fitContent();
    });
  }, [candles, coin, chartColors.volumeDown, chartColors.volumeUp]);

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
    });
  }, [openOrders, overlayCoin, chartColors.down, chartColors.up]);

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
