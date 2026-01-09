import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Percent, BarChart3 } from 'lucide-react';
import { TradeHistoryItem } from './TradingSettings';

interface PerformanceChartProps {
  trades: TradeHistoryItem[];
  initialBalance?: number;
}

type TimeRange = '24h' | '7d' | '30d' | 'all';

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  trades,
  initialBalance = 1000
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  // Filter trades by time range
  const filteredTrades = useMemo(() => {
    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity
    };

    return trades
      .filter(t => now - t.timestamp < ranges[timeRange])
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [trades, timeRange]);

  // Calculate cumulative P/L data points
  const chartData = useMemo(() => {
    let cumulative = 0;
    const data = filteredTrades.map(trade => {
      cumulative += trade.pnl || 0;
      return {
        timestamp: trade.timestamp,
        pnl: cumulative,
        trade
      };
    });

    // Add starting point
    if (data.length > 0) {
      data.unshift({
        timestamp: data[0].timestamp - 1,
        pnl: 0,
        trade: data[0].trade
      });
    }

    return data;
  }, [filteredTrades]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalPnl = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = filteredTrades.filter(t => (t.pnl || 0) > 0).length;
    const losses = filteredTrades.filter(t => (t.pnl || 0) < 0).length;
    const winRate = filteredTrades.length > 0 ? (wins / filteredTrades.length) * 100 : 0;
    const roi = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;

    const maxPnl = Math.max(...chartData.map(d => d.pnl), 0);
    const minPnl = Math.min(...chartData.map(d => d.pnl), 0);

    return { totalPnl, wins, losses, winRate, roi, maxPnl, minPnl };
  }, [filteredTrades, chartData, initialBalance]);

  // SVG chart dimensions
  const chartWidth = 400;
  const chartHeight = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };

  // Generate SVG path
  const path = useMemo(() => {
    if (chartData.length < 2) return '';

    const xScale = (chartWidth - padding.left - padding.right) / (chartData.length - 1);
    const yRange = Math.max(stats.maxPnl - stats.minPnl, 1);
    const yScale = (chartHeight - padding.top - padding.bottom) / yRange;

    const points = chartData.map((d, i) => {
      const x = padding.left + i * xScale;
      const y = chartHeight - padding.bottom - (d.pnl - stats.minPnl) * yScale;
      return { x, y };
    });

    // Generate smooth curve using quadratic bezier
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x + (curr.x - prev.x) / 4} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
      path += ` Q ${cpx + (curr.x - cpx) / 2} ${curr.y} ${curr.x} ${curr.y}`;
    }

    return path;
  }, [chartData, stats.maxPnl, stats.minPnl]);

  // Generate area fill path
  const areaPath = useMemo(() => {
    if (!path || chartData.length < 2) return '';

    const xScale = (chartWidth - padding.left - padding.right) / (chartData.length - 1);
    const lastX = padding.left + (chartData.length - 1) * xScale;
    const firstX = padding.left;
    const bottomY = chartHeight - padding.bottom;

    return `${path} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [path, chartData.length]);

  // Zero line position
  const zeroLineY = useMemo(() => {
    if (stats.maxPnl === stats.minPnl) return chartHeight / 2;
    const yRange = stats.maxPnl - stats.minPnl;
    const yScale = (chartHeight - padding.top - padding.bottom) / yRange;
    return chartHeight - padding.bottom - (0 - stats.minPnl) * yScale;
  }, [stats.maxPnl, stats.minPnl]);

  const isPositive = stats.totalPnl >= 0;

  return (
    <div className="bg-card-dark rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            <h3 className="text-white font-semibold">Performance</h3>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-1 bg-background rounded-lg p-1">
            {(['24h', '7d', '30d', 'all'] as TimeRange[]).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  timeRange === range
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {range === 'all' ? 'All' : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Total P/L</p>
            <p className={`font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{stats.totalPnl.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">ROI</p>
            <p className={`font-bold ${stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Win Rate</p>
            <p className="font-bold text-white">{stats.winRate.toFixed(0)}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Trades</p>
            <p className="font-bold text-white">
              <span className="text-green-400">{stats.wins}</span>
              /
              <span className="text-red-400">{stats.losses}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        {chartData.length < 2 ? (
          <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
            Not enough data to display chart
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-32"
            preserveAspectRatio="none"
          >
            {/* Gradient */}
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isPositive ? '#22c55e' : '#ef4444'}
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor={isPositive ? '#22c55e' : '#ef4444'}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line
              x1={padding.left}
              y1={zeroLineY}
              x2={chartWidth - padding.right}
              y2={zeroLineY}
              stroke="#374151"
              strokeDasharray="4,4"
              strokeWidth="1"
            />

            {/* Area fill */}
            <path
              d={areaPath}
              fill="url(#chartGradient)"
            />

            {/* Line */}
            <path
              d={path}
              fill="none"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* End point */}
            {chartData.length > 0 && (
              <circle
                cx={padding.left + (chartData.length - 1) * ((chartWidth - padding.left - padding.right) / (chartData.length - 1))}
                cy={chartHeight - padding.bottom - (chartData[chartData.length - 1].pnl - stats.minPnl) * ((chartHeight - padding.top - padding.bottom) / Math.max(stats.maxPnl - stats.minPnl, 1))}
                r="4"
                fill={isPositive ? '#22c55e' : '#ef4444'}
              />
            )}
          </svg>
        )}

        {/* Bottom labels */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-gray-500">
            {chartData.length > 0
              ? new Date(chartData[0].timestamp).toLocaleDateString()
              : '-'}
          </span>
          <span className="text-xs text-gray-500">
            {chartData.length > 0
              ? new Date(chartData[chartData.length - 1].timestamp).toLocaleDateString()
              : '-'}
          </span>
        </div>
      </div>

      {/* P/L Indicator */}
      <div className={`px-4 py-3 ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'} border-t border-gray-800`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? 'Profit' : 'Loss'}
            </span>
          </div>
          <span className={`font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            ${Math.abs(stats.totalPnl).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PerformanceChart;
