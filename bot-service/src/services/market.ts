import { logger } from '../utils/logger';
import { TradeSignal } from './trading';
import { parseUnits } from 'viem';

// Candle data structure
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Market analysis result
interface MarketAnalysis {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  indicators: string[];
  metrics: {
    rsi: number;
    macd: string;
    priceChange1h: string;
    volumeRatio: string;
    conditionsMet: number;
    riskReward: string;
    trend: string;
  };
}

// Token config for different chains
const TOKEN_SYMBOLS: Record<number, Record<string, string>> = {
  8453: { // Base
    '0x4200000000000000000000000000000000000006': 'ETHUSDT', // WETH
  },
  1: { // Ethereum
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 'ETHUSDT',
  },
  137: { // Polygon
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619': 'ETHUSDT',
  },
  42161: { // Arbitrum
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': 'ETHUSDT',
  },
  56: { // BSC
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8': 'ETHUSDT',
  }
};

/**
 * Fetch candle data from Binance API
 */
async function fetchCandles(symbol: string, interval: string = '5m', limit: number = 100): Promise<Candle[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();

    return data.map((candle: any[]) => ({
      time: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  } catch (err) {
    logger.error('Failed to fetch candles', { symbol, error: err });
    return [];
  }
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return calculateSMA(data, Math.min(data.length, period));

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(data.slice(0, period), period);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate RSI
 */
function calculateRSI(closes: number[], period: number = 14): number {
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

/**
 * Calculate MACD
 */
function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = ema12 - ema26;

  // Calculate signal line (9-period EMA of MACD)
  const macdHistory: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    macdHistory.push(e12 - e26);
  }

  const signal = calculateEMA(macdHistory, 9);
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

/**
 * Analyze market conditions and generate signal
 */
export async function analyzeMarket(
  chainId: number,
  tokenAddress: string,
  minConfidence: number = 70
): Promise<MarketAnalysis | null> {
  // Get trading symbol
  const symbol = TOKEN_SYMBOLS[chainId]?.[tokenAddress];
  if (!symbol) {
    logger.warn('Unknown token for market analysis', { chainId, tokenAddress });
    return null;
  }

  // Fetch candle data
  const candles = await fetchCandles(symbol, '5m', 100);
  if (candles.length < 50) {
    logger.warn('Insufficient candle data', { symbol, count: candles.length });
    return null;
  }

  // Extract price arrays
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // Calculate indicators
  const rsi = calculateRSI(closes);
  const { macd, signal, histogram } = calculateMACD(closes);
  const sma7 = calculateSMA(closes, 7);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  // Volume analysis
  const avgVolume = calculateSMA(volumes, 20);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const isHighVolume = volumeRatio > 1.5;

  // Price changes
  const currentPrice = closes[closes.length - 1];
  const price1hAgo = closes[closes.length - 12] || currentPrice; // 12 x 5min = 1h
  const price24hAgo = closes[0] || currentPrice;
  const priceChange1h = ((currentPrice - price1hAgo) / price1hAgo) * 100;
  const priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;

  // RSI momentum
  const rsi5Ago = calculateRSI(closes.slice(0, -5));
  const rsiRising = rsi > rsi5Ago;
  const rsiFalling = rsi < rsi5Ago;

  // MACD crossover detection
  const prevHistogram = closes.length > 1 ? (() => {
    const prevCloses = closes.slice(0, -1);
    const { histogram: h } = calculateMACD(prevCloses);
    return h;
  })() : 0;
  const macdCrossover = histogram > 0 && prevHistogram <= 0;
  const macdCrossunder = histogram < 0 && prevHistogram >= 0;

  // Support/Resistance
  const recentCandles = candles.slice(-20);
  const recentHigh = Math.max(...recentCandles.map(c => c.high));
  const recentLow = Math.min(...recentCandles.map(c => c.low));
  const range = recentHigh - recentLow;
  const nearResistance = range > 0 && (recentHigh - currentPrice) / range < 0.1;
  const nearSupport = range > 0 && (currentPrice - recentLow) / range < 0.1;

  // Candle patterns
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const lastCandleBody = Math.abs(lastCandle.close - lastCandle.open);
  const lastCandleRange = lastCandle.high - lastCandle.low;
  const lastCandleIsBearish = lastCandle.close < lastCandle.open;
  const lastCandleIsBullish = lastCandle.close > lastCandle.open;

  // Engulfing patterns
  const isBullishEngulfing = lastCandleIsBullish &&
    prevCandle && prevCandle.close < prevCandle.open &&
    lastCandle.close > prevCandle.open &&
    lastCandle.open < prevCandle.close;
  const isBearishEngulfing = lastCandleIsBearish &&
    prevCandle && prevCandle.close > prevCandle.open &&
    lastCandle.close < prevCandle.open &&
    lastCandle.open > prevCandle.close;

  // Wick patterns
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const hasLongUpperWick = upperWick > lastCandleBody * 2;
  const hasLongLowerWick = lowerWick > lastCandleBody * 2;

  // Large candle detection
  const recentBodies = recentCandles.slice(-10).map(c => Math.abs(c.close - c.open));
  const avgBodySize = recentBodies.reduce((a, b) => a + b, 0) / recentBodies.length;
  const isLargeCandle = lastCandleBody > avgBodySize * 1.5;
  const isVeryLargeCandle = lastCandleBody > avgBodySize * 2.5;

  // Trend analysis
  const last10Highs = highs.slice(-10);
  const last10Lows = lows.slice(-10);
  let higherLowsCount = 0;
  let lowerHighsCount = 0;
  for (let i = 1; i < last10Lows.length; i++) {
    if (last10Lows[i] > last10Lows[i - 1]) higherLowsCount++;
    if (last10Highs[i] < last10Highs[i - 1]) lowerHighsCount++;
  }
  const isFormingHigherLows = higherLowsCount >= 6;
  const isFormingLowerHighs = lowerHighsCount >= 6;
  const isStrongUptrend = isFormingHigherLows && sma7 > sma20 && sma20 > sma50;
  const isStrongDowntrend = isFormingLowerHighs && sma7 < sma20 && sma20 < sma50;
  const trend = isStrongUptrend ? 'STRONG_UPTREND' : isStrongDowntrend ? 'STRONG_DOWNTREND' : 'NEUTRAL';

  // Short-term momentum
  const shortTermMomentum = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
  const last3Candles = candles.slice(-3);
  const bearishCandlesCount = last3Candles.filter(c => c.close < c.open).length;
  const bullishCandlesCount = last3Candles.filter(c => c.close > c.open).length;
  const isStrongShortTermBearish = shortTermMomentum < -0.5 && bearishCandlesCount >= 2;
  const isStrongShortTermBullish = shortTermMomentum > 0.5 && bullishCandlesCount >= 2;
  const immediateBearishMomentum = (isLargeCandle && lastCandleIsBearish) || isStrongShortTermBearish;
  const immediateBullishMomentum = (isLargeCandle && lastCandleIsBullish) || isStrongShortTermBullish;

  // === MULTI-FACTOR SCORING ===

  // SHORT CONDITIONS (6 factors)
  const shortConditions = {
    rsiOverbought: rsi > 70 || (rsi > 60 && rsiFalling),
    macdBearish: macd < -0.5 || (macdCrossunder && Math.abs(macd) > 0.2),
    volumeConfirmed: isHighVolume && priceChange1h < 0,
    priceRejectedResistance: nearResistance && (isBearishEngulfing || hasLongUpperWick),
    lowerHighsForming: isFormingLowerHighs,
    immediateBearish: immediateBearishMomentum
  };
  const shortConditionsMet = Object.values(shortConditions).filter(Boolean).length;

  // LONG CONDITIONS (6 factors)
  const longConditions = {
    rsiOversold: rsi < 30 || (rsi < 40 && rsiRising),
    macdBullish: macd > 0.5 || (macdCrossover && Math.abs(macd) > 0.2),
    volumeConfirmed: isHighVolume && priceChange1h > 0,
    priceBouncingSupport: nearSupport && (isBullishEngulfing || hasLongLowerWick),
    higherLowsForming: isFormingHigherLows,
    immediateBullish: immediateBullishMomentum
  };
  const longConditionsMet = Object.values(longConditions).filter(Boolean).length;

  // Determine direction
  let direction: 'LONG' | 'SHORT' = 'LONG';
  let conditionsMet = 0;
  let conditions: Record<string, boolean> = {};

  if (longConditionsMet > shortConditionsMet && longConditionsMet >= 2) {
    direction = 'LONG';
    conditionsMet = longConditionsMet;
    conditions = longConditions;
  } else if (shortConditionsMet > longConditionsMet && shortConditionsMet >= 2) {
    direction = 'SHORT';
    conditionsMet = shortConditionsMet;
    conditions = shortConditions;
  } else if (longConditionsMet === shortConditionsMet) {
    direction = shortTermMomentum > 0 ? 'LONG' : 'SHORT';
    conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
    conditions = shortTermMomentum > 0 ? longConditions : shortConditions;
  } else {
    direction = longConditionsMet >= shortConditionsMet ? 'LONG' : 'SHORT';
    conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
  }

  // Momentum override
  let confidencePenalty = 0;
  if (direction === 'LONG' && isVeryLargeCandle && lastCandleIsBearish) {
    if (shortConditionsMet >= 2) {
      direction = 'SHORT';
      conditionsMet = shortConditionsMet;
    } else {
      confidencePenalty = 30;
    }
  } else if (direction === 'SHORT' && isVeryLargeCandle && lastCandleIsBullish) {
    if (longConditionsMet >= 2) {
      direction = 'LONG';
      conditionsMet = longConditionsMet;
    } else {
      confidencePenalty = 30;
    }
  } else if ((direction === 'LONG' && isLargeCandle && lastCandleIsBearish) ||
             (direction === 'SHORT' && isLargeCandle && lastCandleIsBullish)) {
    confidencePenalty = 15;
  }

  // Calculate confidence
  let baseConfidence: number;
  if (conditionsMet >= 5) baseConfidence = 92;
  else if (conditionsMet >= 4) baseConfidence = 85;
  else if (conditionsMet === 3) baseConfidence = 65;
  else if (conditionsMet === 2) baseConfidence = 45;
  else baseConfidence = 25;

  if (volumeRatio < 1.2) baseConfidence -= 20;
  else if (volumeRatio >= 1.5) baseConfidence += 5;

  const confidence = Math.max(20, Math.min(95, baseConfidence - confidencePenalty));

  // Risk/Reward
  const distanceToResistance = ((recentHigh - currentPrice) / currentPrice) * 100;
  const distanceToSupport = ((currentPrice - recentLow) / currentPrice) * 100;
  const takeProfitDistance = Math.max(direction === 'LONG' ? distanceToResistance : distanceToSupport, 0.3);
  const stopLossDistance = Math.max(direction === 'LONG' ? distanceToSupport : distanceToResistance, 0.3);
  const riskReward = Math.min(Math.max(takeProfitDistance / stopLossDistance, 0.1), 10);

  // Build indicators list
  const indicators: string[] = [];
  const reasons: string[] = [];

  if (direction === 'LONG') {
    if (conditions.rsiOversold) reasons.push(`RSI at ${rsi.toFixed(0)} - oversold`);
    if (conditions.macdBullish) reasons.push('MACD bullish');
    if (conditions.volumeConfirmed) reasons.push(`Volume ${volumeRatio.toFixed(1)}x with buying`);
    if (conditions.higherLowsForming) reasons.push('Higher lows forming');
  } else {
    if (conditions.rsiOverbought) reasons.push(`RSI at ${rsi.toFixed(0)} - overbought`);
    if (conditions.macdBearish) reasons.push('MACD bearish');
    if (conditions.volumeConfirmed) reasons.push(`Volume ${volumeRatio.toFixed(1)}x with selling`);
    if (conditions.lowerHighsForming) reasons.push('Lower highs forming');
  }

  const reason = reasons.slice(0, 3).join('. ') || `${direction} signal with ${conditionsMet}/6 conditions`;

  logger.info('Market analysis complete', {
    symbol,
    direction,
    confidence,
    conditionsMet,
    rsi: rsi.toFixed(0),
    macd: macd.toFixed(4),
    volumeRatio: volumeRatio.toFixed(2)
  });

  return {
    direction,
    confidence: Math.round(confidence),
    reason,
    indicators,
    metrics: {
      rsi: Math.round(rsi),
      macd: macd.toFixed(4),
      priceChange1h: priceChange1h.toFixed(2),
      volumeRatio: volumeRatio.toFixed(1),
      conditionsMet,
      riskReward: riskReward.toFixed(2),
      trend
    }
  };
}

/**
 * Generate trade signal for bot execution
 */
export async function generateTradeSignal(
  chainId: number,
  tokenAddress: string,
  userBalance: bigint,
  riskLevelBps: number = 500, // Default 5%
  minConfidence: number = 70
): Promise<TradeSignal | null> {
  const analysis = await analyzeMarket(chainId, tokenAddress, minConfidence);

  if (!analysis) {
    return null;
  }

  // Only trade if confidence meets minimum
  if (analysis.confidence < minConfidence) {
    logger.debug('Signal confidence below minimum', {
      confidence: analysis.confidence,
      required: minConfidence
    });
    return null;
  }

  // Calculate trade amount based on risk level
  const tradeAmount = (userBalance * BigInt(riskLevelBps)) / 10000n;

  if (tradeAmount === 0n) {
    return null;
  }

  // Calculate minAmountOut with 1% slippage
  const minAmountOut = (tradeAmount * 99n) / 100n;

  return {
    direction: analysis.direction,
    confidence: analysis.confidence,
    tokenAddress,
    suggestedAmount: tradeAmount,
    minAmountOut,
    reason: analysis.reason
  };
}

export class MarketService {
  private analysisCache: Map<string, { analysis: MarketAnalysis; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds

  /**
   * Get market analysis with caching
   */
  async getAnalysis(chainId: number, tokenAddress: string): Promise<MarketAnalysis | null> {
    const cacheKey = `${chainId}-${tokenAddress}`;
    const cached = this.analysisCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.analysis;
    }

    const analysis = await analyzeMarket(chainId, tokenAddress);

    if (analysis) {
      this.analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
    }

    return analysis;
  }

  /**
   * Generate signal with caching
   */
  async getSignal(
    chainId: number,
    tokenAddress: string,
    userBalance: bigint,
    riskLevelBps: number = 500,
    minConfidence: number = 70
  ): Promise<TradeSignal | null> {
    return generateTradeSignal(chainId, tokenAddress, userBalance, riskLevelBps, minConfidence);
  }
}

export const marketService = new MarketService();
