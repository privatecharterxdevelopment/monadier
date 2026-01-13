import React, { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, Loader2 } from 'lucide-react';
import { useChainId } from 'wagmi';

// Arbitrum tokens to analyze
const TOKENS = [
  { symbol: 'ARB', binanceSymbol: 'ARBUSDT' },
  { symbol: 'ETH', binanceSymbol: 'ETHUSDT' },
  { symbol: 'BTC', binanceSymbol: 'BTCUSDT' }
];

interface AnalysisResult {
  symbol: string;
  signal: 'LONG' | 'SHORT' | 'HOLD';
  confidence: number;
  rsi: number;
  trend: string;
  macd: string;
  volumeSpike: boolean;
  priceChange: number;
  currentPrice: number;
}

// Calculate RSI
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate EMA
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// Calculate MACD
function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine.slice(-9), 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];

  return { macd, signal, histogram: macd - signal };
}

// Fetch candles from Binance
async function fetchCandles(symbol: string): Promise<number[][]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`
    );
    if (!response.ok) throw new Error('Binance API error');
    return await response.json();
  } catch (err) {
    // Fallback to Bybit
    try {
      const response = await fetch(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=60&limit=50`
      );
      const data = await response.json();
      if (data.result?.list) {
        return data.result.list.reverse().map((c: any) => [
          parseInt(c[0]), c[1], c[2], c[3], c[4], c[5]
        ]);
      }
    } catch {}
    return [];
  }
}

// Analyze a token
async function analyzeToken(binanceSymbol: string, displaySymbol: string): Promise<AnalysisResult | null> {
  const candles = await fetchCandles(binanceSymbol);
  if (candles.length < 30) return null;

  const closes = candles.map(c => parseFloat(c[4]));
  const volumes = candles.map(c => parseFloat(c[5]));
  const currentPrice = closes[closes.length - 1];
  const priceChange = ((currentPrice - closes[closes.length - 24]) / closes[closes.length - 24]) * 100;

  // Calculate indicators
  const rsi = calculateRSI(closes);
  const { histogram } = calculateMACD(closes);

  // Calculate moving averages
  const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

  // Volume analysis
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeSpike = currentVolume > avgVolume * 1.5;

  // Determine trend
  let trend = 'Neutral';
  if (currentPrice > sma7 && sma7 > sma20) trend = 'Bullish';
  else if (currentPrice < sma7 && sma7 < sma20) trend = 'Bearish';

  // MACD signal
  const macdSignal = histogram > 0 ? 'Bullish' : 'Bearish';

  // Calculate signal and confidence
  let bullishScore = 0;
  let bearishScore = 0;

  // RSI
  if (rsi < 30) bullishScore += 2;
  else if (rsi < 40) bullishScore += 1;
  else if (rsi > 70) bearishScore += 2;
  else if (rsi > 60) bearishScore += 1;

  // MACD
  if (histogram > 0) bullishScore += 1;
  else bearishScore += 1;

  // Trend
  if (trend === 'Bullish') bullishScore += 1;
  else if (trend === 'Bearish') bearishScore += 1;

  // Volume
  if (volumeSpike && priceChange > 0) bullishScore += 1;
  else if (volumeSpike && priceChange < 0) bearishScore += 1;

  // Price momentum
  if (priceChange > 2) bullishScore += 1;
  else if (priceChange < -2) bearishScore += 1;

  const totalScore = bullishScore + bearishScore;
  let signal: 'LONG' | 'SHORT' | 'HOLD' = 'HOLD';
  let confidence = 30;

  if (bullishScore > bearishScore && bullishScore >= 2) {
    signal = 'LONG';
    confidence = Math.min(90, 40 + (bullishScore * 10));
  } else if (bearishScore > bullishScore && bearishScore >= 2) {
    signal = 'SHORT';
    confidence = Math.min(90, 40 + (bearishScore * 10));
  }

  return {
    symbol: displaySymbol,
    signal,
    confidence,
    rsi,
    trend,
    macd: macdSignal,
    volumeSpike,
    priceChange,
    currentPrice
  };
}

export default function LiveAnalysis() {
  const chainId = useChainId();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentlyAnalyzing, setCurrentlyAnalyzing] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    const results: AnalysisResult[] = [];
    setError(null);

    for (const token of TOKENS) {
      setCurrentlyAnalyzing(token.symbol);
      const result = await analyzeToken(token.binanceSymbol, token.symbol);
      if (result) {
        results.push(result);
      }
    }

    setCurrentlyAnalyzing('');

    if (results.length > 0) {
      setAnalyses(results);
      setLastUpdate(new Date());
    } else {
      setError('Could not fetch market data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    runAnalysis();
    // Refresh every 30 seconds
    const interval = setInterval(runAnalysis, 30000);
    return () => clearInterval(interval);
  }, [runAnalysis]);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'LONG': return 'text-green-400';
      case 'SHORT': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  };

  const getSignalBg = (signal: string) => {
    switch (signal) {
      case 'LONG': return 'bg-green-500/10 border-green-500/20';
      case 'SHORT': return 'bg-red-500/10 border-red-500/20';
      default: return 'bg-yellow-500/10 border-yellow-500/20';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
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

  if (loading && analyses.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">Live Market Analysis</h3>
        </div>
        <div className="flex items-center justify-center gap-2 text-zinc-500 py-4">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Analyzing {currentlyAnalyzing || 'markets'}...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-white" />
          <h3 className="font-medium text-white">Live Market Analysis</h3>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
            Arbitrum
          </span>
          {currentlyAnalyzing ? (
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing {currentlyAnalyzing}...
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
            <span className="text-xs text-zinc-500">
              {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
            </span>
          )}
          <button
            onClick={runAnalysis}
            className="p-1 hover:bg-zinc-800 rounded"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${currentlyAnalyzing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm mb-4 p-2 bg-red-500/10 rounded">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {analyses.map((analysis) => (
          <div
            key={analysis.symbol}
            className={`border rounded-lg p-4 ${getSignalBg(analysis.signal)}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{analysis.symbol}/USDT</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getSignalColor(analysis.signal)}`}>
                  {getSignalIcon(analysis.signal)}
                  {analysis.signal}
                </span>
                <span className="text-zinc-400 text-sm">
                  ${analysis.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <span className={`text-lg font-bold ${getConfidenceColor(analysis.confidence)}`}>
                {analysis.confidence}%
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-3">
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">RSI</p>
                <p className={`text-sm font-medium ${getRsiColor(analysis.rsi)}`}>
                  {analysis.rsi.toFixed(0)}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">Trend</p>
                <p className={`text-sm font-medium ${analysis.trend === 'Bullish' ? 'text-green-400' : analysis.trend === 'Bearish' ? 'text-red-400' : 'text-zinc-400'}`}>
                  {analysis.trend}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">MACD</p>
                <p className={`text-sm font-medium ${analysis.macd === 'Bullish' ? 'text-green-400' : 'text-red-400'}`}>
                  {analysis.macd}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">Volume</p>
                <p className={`text-sm font-medium ${analysis.volumeSpike ? 'text-green-400' : 'text-zinc-400'}`}>
                  {analysis.volumeSpike ? 'Spike!' : 'Normal'}
                </p>
              </div>
              <div className="bg-black/20 rounded p-2">
                <p className="text-[10px] text-zinc-500 uppercase">24h</p>
                <p className={`text-sm font-medium ${analysis.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {analysis.priceChange >= 0 ? '+' : ''}{analysis.priceChange.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-600 mt-3 text-center">
        Analysis updates every 30 seconds • Direct from Binance/Bybit
      </p>
    </div>
  );
}
