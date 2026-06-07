import React, { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
} from 'lightweight-charts';
import type { HlCandleBar, HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import { PRO_TRADE_INTERVALS } from '../../lib/hyperliquid/constants';
import { fmtPrice } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';

type Props = {
  coin: string;
  interval: HlInterval;
  candles: HlCandleBar[];
  loading: boolean;
  openOrders?: HlOpenOrder[];
  onIntervalChange: (interval: HlInterval) => void;
};

const ProTradeChart: React.FC<Props> = ({
  coin,
  interval,
  candles,
  loading,
  openOrders = [],
  onIntervalChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0b0b' },
        textColor: '#71717a',
        fontSize: 11,
        fontFamily: 'DM Sans, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: '#262626',
        scaleMargins: { top: 0.08, bottom: 0.05 },
      },
      timeScale: {
        borderColor: '#262626',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: '#404040', labelBackgroundColor: '#262626' },
        horzLine: { color: '#404040', labelBackgroundColor: '#262626' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3dd68c',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#3dd68c',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (candles.length === 0) {
      series.setData([]);
      return;
    }

    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as CandlestickData['time'],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(data);
    chart.timeScale().fitContent();
  }, [candles, coin]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = [];

    const coinOrders = openOrders.filter((o) => o.coin === coin);
    for (const o of coinOrders) {
      const px = toNum(o.limitPx);
      if (px <= 0) continue;
      const isBuy = o.side === 'B';
      const line = series.createPriceLine({
        price: px,
        color: isBuy ? '#3dd68c' : '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Limit ${fmtPrice(px, 0)}`,
      });
      priceLinesRef.current.push(line);
    }
  }, [openOrders, coin]);

  return (
    <div className="hl-chart-wrap">
      <div className="hl-chart-toolbar">
        <div className="hl-chart-toolbar-left">
          <span style={{ fontWeight: 700, color: '#fafafa', marginRight: 8 }}>{coin}-USD</span>
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
      </div>
      {loading && candles.length === 0 ? (
        <div className="hl-chart-empty">Loading chart…</div>
      ) : null}
      {!loading && candles.length === 0 ? (
        <div className="hl-chart-empty">Chart data unavailable</div>
      ) : null}
      <div ref={containerRef} className="hl-chart-canvas" />
    </div>
  );
};

export default ProTradeChart;
