import React, { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useUnifiedSignal } from '../../hooks/useUnifiedSignal';
import {
  formatPatternName,
  Timeframe,
  UnifiedSignal,
  TimeframeAnalysis
} from '../../lib/signalService';

// Tokens to analyze - matching bot-service
const TOKENS = [
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT' },
  { symbol: 'ARB', binanceSymbol: 'ARBUSDT' },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT' }
];

interface TokenSignal {
  symbol: string;
  binanceSymbol: string;
  signal: UnifiedSignal | null;
  isLoading: boolean;
  error: string | null;
}

function TokenAnalysisCard({ tokenSignal }: { tokenSignal: TokenSignal }) {
  const { symbol, signal, isLoading, error } = tokenSignal;

  const getSignalColor = (direction: string) => {
    switch (direction) {
      case 'LONG': return 'text-green-400';
      case 'SHORT': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  const getSignalBg = (direction: string) => {
    switch (direction) {
      case 'LONG': return 'bg-green-500/10 border-green-500/20';
      case 'SHORT': return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-yellow-500/10 border-yellow-500/20';
    }
  };

  const getSignalIcon = (direction: string) => {
    switch (direction) {
      case 'LONG': return <TrendingUp className="w-4 h-4" />;
      case 'SHORT': return <TrendingDown className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-green-400';
    if (confidence >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRsiColor = (rsi: number) => {
    if (rsi >= 70) return 'text-red-400';
    if (rsi <= 30) return 'text-green-400';
    return 'text-zinc-400';
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'UP') return 'text-green-400';
    if (trend === 'DOWN') return 'text-red-400';
    return 'text-zinc-400';
  };

  if (isLoading && !signal) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          <span className="text-zinc-500">Loading {symbol}...</span>
        </div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/10">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>{symbol}: {error || 'No signal available'}</span>
        </div>
      </div>
    );
  }

  // Get primary timeframe data (15m is best balance)
  const tf15m = signal.timeframes.find(t => t.timeframe === '15m');
  const tf1h = signal.timeframes.find(t => t.timeframe === '1h');
  const primaryTf = tf15m || tf1h || signal.timeframes[0];

  return (
    <div className={`border rounded-lg p-4 ${getSignalBg(signal.direction)}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{symbol}/USDT</span>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getSignalColor(signal.direction)}`}>
            {getSignalIcon(signal.direction)}
            {signal.direction}
          </span>
          <span className="text-zinc-400 text-sm">
            ${primaryTf?.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <span className={`text-lg font-bold ${getConfidenceColor(signal.confidence)}`}>
          {Math.round(signal.confidence)}%
        </span>
      </div>

      {/* Timeframe Breakdown - NEW! */}
      <div className="mb-3">
        <p className="text-[10px] text-zinc-500 uppercase mb-1.5">Timeframe Signals</p>
        <div className="flex gap-1.5">
          {signal.timeframes.map((tf) => (
            <div
              key={tf.timeframe}
              className={`flex-1 text-center py-1.5 rounded text-xs ${
                tf.direction === 'LONG' ? 'bg-green-500/20 text-green-400' :
                tf.direction === 'SHORT' ? 'bg-red-500/20 text-red-400' :
                'bg-zinc-700/50 text-zinc-400'
              }`}
            >
              <div className="font-medium">{tf.timeframe}</div>
              <div className="text-[10px] opacity-75">{tf.direction}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicators Grid */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <div className="bg-black/20 rounded p-2">
          <p className="text-[10px] text-zinc-500 uppercase">RSI</p>
          <p className={`text-sm font-medium ${getRsiColor(primaryTf?.rsi || 50)}`}>
            {Math.round(primaryTf?.rsi || 50)}
          </p>
        </div>
        <div className="bg-black/20 rounded p-2">
          <p className="text-[10px] text-zinc-500 uppercase">Trend</p>
          <p className={`text-sm font-medium ${getTrendColor(primaryTf?.trend || 'SIDEWAYS')}`}>
            {primaryTf?.trend === 'UP' ? 'Bullish' : primaryTf?.trend === 'DOWN' ? 'Bearish' : 'Neutral'}
          </p>
        </div>
        <div className="bg-black/20 rounded p-2">
          <p className="text-[10px] text-zinc-500 uppercase">MACD</p>
          <p className={`text-sm font-medium ${primaryTf?.macdSignal === 'bullish' ? 'text-green-400' : primaryTf?.macdSignal === 'bearish' ? 'text-red-400' : 'text-zinc-400'}`}>
            {primaryTf?.macdSignal === 'bullish' ? 'Bullish' : primaryTf?.macdSignal === 'bearish' ? 'Bearish' : 'Neutral'}
          </p>
        </div>
        <div className="bg-black/20 rounded p-2">
          <p className="text-[10px] text-zinc-500 uppercase">Alignment</p>
          <p className={`text-sm font-medium ${signal.trendAlignment >= 75 ? 'text-green-400' : signal.trendAlignment >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {Math.round(signal.trendAlignment)}%
          </p>
        </div>
        <div className="bg-black/20 rounded p-2">
          <p className="text-[10px] text-zinc-500 uppercase">Patterns</p>
          <p className={`text-sm font-medium ${signal.patternStrength >= 50 ? 'text-green-400' : signal.patternStrength >= 25 ? 'text-yellow-400' : 'text-zinc-400'}`}>
            {signal.patterns.length > 0 ? signal.patterns.length : '-'}
          </p>
        </div>
      </div>

      {/* Detected Patterns */}
      {signal.patterns.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-zinc-500 uppercase mb-1.5">Detected Patterns</p>
          <div className="flex flex-wrap gap-1">
            {signal.patterns.slice(0, 3).map((pattern, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-xs ${
                  pattern.direction === 'bullish' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}
              >
                {formatPatternName(pattern.type)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {signal.warnings.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-yellow-400/80 bg-yellow-500/10 rounded p-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{signal.warnings[0]}</span>
        </div>
      )}
    </div>
  );
}

export default function LiveAnalysis() {
  const [tokenSignals, setTokenSignals] = useState<TokenSignal[]>(
    TOKENS.map(t => ({
      symbol: t.symbol,
      binanceSymbol: t.binanceSymbol,
      signal: null,
      isLoading: true,
      error: null
    }))
  );
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch signals for all tokens
  const fetchAllSignals = useCallback(async () => {
    setIsRefreshing(true);

    const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || 'http://localhost:3001';

    const newSignals = await Promise.all(
      TOKENS.map(async (token) => {
        try {
          const response = await fetch(
            `${BOT_API_URL}/api/signal?symbol=${token.binanceSymbol}&timeframes=1m,5m,15m,1h`
          );
          const data = await response.json();

          if (data.success && data.signal) {
            return {
              symbol: token.symbol,
              binanceSymbol: token.binanceSymbol,
              signal: data.signal as UnifiedSignal,
              isLoading: false,
              error: null
            };
          } else {
            return {
              symbol: token.symbol,
              binanceSymbol: token.binanceSymbol,
              signal: null,
              isLoading: false,
              error: data.error || 'Failed to fetch'
            };
          }
        } catch (err: any) {
          return {
            symbol: token.symbol,
            binanceSymbol: token.binanceSymbol,
            signal: null,
            isLoading: false,
            error: err.message || 'Network error'
          };
        }
      })
    );

    setTokenSignals(newSignals);
    setLastUpdate(new Date());
    setIsRefreshing(false);
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchAllSignals();
    const interval = setInterval(fetchAllSignals, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [fetchAllSignals]);

  const allLoading = tokenSignals.every(t => t.isLoading && !t.signal);

  if (allLoading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">MTF Live Analysis</h3>
        </div>
        <div className="flex items-center justify-center gap-2 text-zinc-500 py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Fetching multi-timeframe signals...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">MTF Live Analysis</h3>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
            Multi-Timeframe
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
            Arbitrum
          </span>
          {isRefreshing ? (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating...
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="w-3 h-3" />
              {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
            </span>
          )}
          <button
            onClick={fetchAllSignals}
            className="p-1 hover:bg-zinc-800 rounded"
            title="Refresh"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Token Cards */}
      <div className="space-y-3">
        {tokenSignals.map((tokenSignal) => (
          <TokenAnalysisCard key={tokenSignal.symbol} tokenSignal={tokenSignal} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-zinc-600 mt-3 text-center">
        Unified signals from Bot Engine (1m, 5m, 15m, 1h) - Same logic as trading bot
      </p>
    </div>
  );
}
