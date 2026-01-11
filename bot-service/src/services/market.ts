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
  isReversalSignal: boolean;
  suggestedTP: number;
  suggestedSL: number;
  metrics: {
    rsi: number;
    macd: string;
    priceChange1h: string;
    volumeRatio: string;
    conditionsMet: number;
    riskReward: string;
    trend: string;
    dayOfWeek: string;
  };
}

// Strategy modes
export type TradingStrategy = 'conservative' | 'normal' | 'risky';

// Strategy configs
const STRATEGY_CONFIGS = {
  conservative: {
    minConfidence: 80,
    minConditions: 4
  },
  normal: {
    minConfidence: 60,
    minConditions: 3
  },
  risky: {
    minConfidence: 40,
    minConditions: 2
  }
};

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
async function fetchCandles(symbol: string, interval: string = '1h', limit: number = 30): Promise<Candle[]> {
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
 * Analyze market conditions - SAME LOGIC AS UI (6-Factor System)
 * This ensures bot trades in the same direction as UI shows
 */
export async function analyzeMarket(
  chainId: number,
  tokenAddress: string,
  strategy: TradingStrategy = 'normal'
): Promise<MarketAnalysis | null> {
  const strategyConfig = STRATEGY_CONFIGS[strategy];

  // Get trading symbol
  const symbol = TOKEN_SYMBOLS[chainId]?.[tokenAddress];
  if (!symbol) {
    logger.warn('Unknown token for market analysis', { chainId, tokenAddress });
    return null;
  }

  // Fetch candle data - 1h candles for stable analysis
  const candles = await fetchCandles(symbol, '1h', 30);
  if (candles.length < 20) {
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
  const price1hAgo = closes[closes.length - 2] || currentPrice;
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
  const hasLongUpperWick = upperWick > lastCandleBody * 2 && upperWick > lastCandleRange * 0.3;
  const hasLongLowerWick = lowerWick > lastCandleBody * 2 && lowerWick > lastCandleRange * 0.3;

  // === IMMEDIATE CANDLE MOMENTUM ===
  const recentBodies = recentCandles.slice(-10).map(c => Math.abs(c.close - c.open));
  const avgBodySize = recentBodies.reduce((a, b) => a + b, 0) / recentBodies.length;
  const isLargeCandle = lastCandleBody > avgBodySize * 1.5;
  const isVeryLargeCandle = lastCandleBody > avgBodySize * 2.5;

  // Check last 3 candles for consistent momentum
  const last3Candles = recentCandles.slice(-3);
  const bearishCandlesCount = last3Candles.filter(c => c.close < c.open).length;
  const bullishCandlesCount = last3Candles.filter(c => c.close > c.open).length;

  // Short-term momentum
  const shortTermMomentum = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
  const isStrongShortTermBearish = shortTermMomentum < -0.5 && bearishCandlesCount >= 2;
  const isStrongShortTermBullish = shortTermMomentum > 0.5 && bullishCandlesCount >= 2;

  // Immediate momentum flags
  const immediateBearishMomentum = (isLargeCandle && lastCandleIsBearish) ||
    (isVeryLargeCandle && lastCandleIsBearish) ||
    (isStrongShortTermBearish && bearishCandlesCount === 3);
  const immediateBullishMomentum = (isLargeCandle && lastCandleIsBullish) ||
    (isVeryLargeCandle && lastCandleIsBullish) ||
    (isStrongShortTermBullish && bullishCandlesCount === 3);

  // === TREND ANALYSIS ===
  const last10Highs = highs.slice(-10);
  const last10Lows = lows.slice(-10);

  let higherLowsCount = 0;
  for (let i = 1; i < last10Lows.length; i++) {
    if (last10Lows[i] > last10Lows[i - 1]) higherLowsCount++;
  }
  const isFormingHigherLows = higherLowsCount >= 6;

  let lowerHighsCount = 0;
  for (let i = 1; i < last10Highs.length; i++) {
    if (last10Highs[i] < last10Highs[i - 1]) lowerHighsCount++;
  }
  const isFormingLowerHighs = lowerHighsCount >= 6;

  const isStrongUptrend = isFormingHigherLows && sma7 > sma20 && sma20 > sma50;
  const isStrongDowntrend = isFormingLowerHighs && sma7 < sma20 && sma20 < sma50;
  const trend = isStrongUptrend ? 'STRONG_UPTREND' : isStrongDowntrend ? 'STRONG_DOWNTREND' : 'NEUTRAL';

  // === 6-FACTOR CONFIRMATION SYSTEM (SAME AS UI) ===

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

  // Log conditions for debugging
  logger.debug('6-Factor Analysis', {
    symbol,
    rsi: rsi.toFixed(1),
    macd: macd.toFixed(4),
    volumeRatio: volumeRatio.toFixed(2),
    longConditions,
    shortConditions,
    longConditionsMet,
    shortConditionsMet
  });

  // === CONFIDENCE SCORING ===
  const calculateConfidence = (conditionsMet: number): number => {
    if (conditionsMet >= 5) return 92;
    if (conditionsMet >= 4) return 85;
    if (conditionsMet === 3) return 65;
    if (conditionsMet === 2) return 45;
    return 25;
  };

  // === DIRECTION DETERMINATION (SAME AS UI) ===
  let direction: 'LONG' | 'SHORT' | 'HOLD' = 'HOLD';
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
  } else if (longConditionsMet === shortConditionsMet && longConditionsMet >= 2) {
    // Tie-breaker: use recent momentum
    const momentum3 = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
    direction = momentum3 > 0 ? 'LONG' : 'SHORT';
    conditionsMet = longConditionsMet;
    conditions = momentum3 > 0 ? longConditions : shortConditions;
  }

  // === MOMENTUM OVERRIDE (SAME AS UI) ===
  let momentumOverride = false;
  let confidencePenalty = 0;

  if (direction === 'LONG' && isVeryLargeCandle && lastCandleIsBearish) {
    if (shortConditionsMet >= 2) {
      direction = 'SHORT';
      conditionsMet = shortConditionsMet;
      conditions = shortConditions;
      momentumOverride = true;
      logger.info('⚠️ Momentum override: Large red candle switched LONG to SHORT');
    } else {
      direction = 'HOLD';
      confidencePenalty = 30;
    }
  } else if (direction === 'SHORT' && isVeryLargeCandle && lastCandleIsBullish) {
    if (longConditionsMet >= 2) {
      direction = 'LONG';
      conditionsMet = longConditionsMet;
      conditions = longConditions;
      momentumOverride = true;
      logger.info('⚠️ Momentum override: Large green candle switched SHORT to LONG');
    } else {
      direction = 'HOLD';
      confidencePenalty = 30;
    }
  } else if (direction === 'LONG' && isLargeCandle && lastCandleIsBearish) {
    confidencePenalty = 15;
  } else if (direction === 'SHORT' && isLargeCandle && lastCandleIsBullish) {
    confidencePenalty = 15;
  }

  // Calculate confidence with penalty
  const rawConfidence = calculateConfidence(conditionsMet);
  const confidence = Math.max(20, rawConfidence - confidencePenalty);

  // If HOLD, force to stronger signal (same as UI)
  let finalDirection: 'LONG' | 'SHORT' = direction as any;
  if (direction === 'HOLD') {
    finalDirection = longConditionsMet >= shortConditionsMet ? 'LONG' : 'SHORT';
    conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
    logger.info(`Weak setup - forcing ${finalDirection} (${conditionsMet}/6 conditions)`);
  }

  // Check minimum conditions for strategy
  if (conditionsMet < strategyConfig.minConditions) {
    logger.info(`Signal too weak: ${conditionsMet}/${strategyConfig.minConditions} conditions for ${strategy} mode`);
    return null;
  }

  // Check minimum confidence for strategy
  if (confidence < strategyConfig.minConfidence) {
    logger.info(`Confidence too low: ${confidence}% < ${strategyConfig.minConfidence}% for ${strategy} mode`);
    return null;
  }

  // === BUILD INDICATORS LIST ===
  const indicators: string[] = [];

  if (finalDirection === 'LONG') {
    if (conditions.rsiOversold) indicators.push(`RSI ${rsi.toFixed(0)}${rsiRising ? ' ↗' : ''}`);
    if (conditions.macdBullish) indicators.push(macdCrossover ? 'MACD Cross ↑' : 'MACD Bullish');
    if (conditions.volumeConfirmed) indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↑`);
    if (conditions.priceBouncingSupport) indicators.push('Support Bounce');
    if (conditions.higherLowsForming) indicators.push('Higher Lows');
    if (conditions.immediateBullish) indicators.push('Strong Green Candle');
  } else {
    if (conditions.rsiOverbought) indicators.push(`RSI ${rsi.toFixed(0)}${rsiFalling ? ' ↘' : ''}`);
    if (conditions.macdBearish) indicators.push(macdCrossunder ? 'MACD Cross ↓' : 'MACD Bearish');
    if (conditions.volumeConfirmed) indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↓`);
    if (conditions.priceRejectedResistance) indicators.push('Resistance Rejection');
    if (conditions.lowerHighsForming) indicators.push('Lower Highs');
    if (conditions.immediateBearish) indicators.push('Strong Red Candle');
  }

  // Add candle pattern bonuses
  if (isBullishEngulfing && finalDirection === 'LONG') indicators.push('Bullish Engulfing');
  if (isBearishEngulfing && finalDirection === 'SHORT') indicators.push('Bearish Engulfing');

  // Build reason
  const reason = indicators.slice(0, 3).join(' + ') || `${conditionsMet}/6 factors`;

  // === DYNAMIC TP/SL ===
  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isMonday = dayOfWeek === 1;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let baseTP = 7.5;
  let baseSL = 1.0;

  if (isMonday) {
    baseTP = 5.0;
    baseSL = 0.8;
  } else if (isWeekend) {
    baseTP = 5.0;
    baseSL = 1.0;
  }

  if (isStrongUptrend && finalDirection === 'LONG') {
    baseTP = Math.min(baseTP + 2, 10);
  } else if (isStrongDowntrend && finalDirection === 'SHORT') {
    baseTP = Math.min(baseTP + 2, 10);
  }

  if (volumeRatio > 2.0) {
    baseSL = Math.min(baseSL + 0.5, 2.0);
    baseTP = Math.min(baseTP + 1, 10);
  }

  if (confidence >= 85) {
    baseTP = Math.min(baseTP + 1, 10);
  } else if (confidence < 60) {
    baseTP = Math.max(baseTP - 1, 5);
  }

  const suggestedTP = Math.round(baseTP * 10) / 10;
  const suggestedSL = Math.round(baseSL * 10) / 10;

  // Risk/Reward
  const distanceToResistance = ((recentHigh - currentPrice) / currentPrice) * 100;
  const distanceToSupport = ((currentPrice - recentLow) / currentPrice) * 100;
  const takeProfitDistance = Math.max(finalDirection === 'LONG' ? distanceToResistance : distanceToSupport, 0.3);
  const stopLossDistance = Math.max(finalDirection === 'LONG' ? distanceToSupport : distanceToResistance, 0.3);
  const riskReward = Math.min(Math.max(takeProfitDistance / stopLossDistance, 0.1), 10);

  logger.info(`📊 ${finalDirection} signal generated`, {
    symbol,
    strategy,
    conditionsMet: `${conditionsMet}/6`,
    confidence: confidence + '%',
    indicators: indicators.slice(0, 3),
    trend,
    suggestedTP: suggestedTP + '%',
    suggestedSL: suggestedSL + '%'
  });

  return {
    direction: finalDirection,
    confidence: Math.round(confidence),
    reason,
    indicators,
    isReversalSignal: nearSupport || nearResistance,
    suggestedTP,
    suggestedSL,
    metrics: {
      rsi: Math.round(rsi),
      macd: macd.toFixed(4),
      priceChange1h: priceChange1h.toFixed(2),
      volumeRatio: volumeRatio.toFixed(1),
      conditionsMet,
      riskReward: riskReward.toFixed(2),
      trend,
      dayOfWeek: dayNames[dayOfWeek]
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
  riskLevelBps: number = 500,
  strategy: TradingStrategy = 'normal'
): Promise<TradeSignal | null> {
  const strategyConfig = STRATEGY_CONFIGS[strategy];
  const analysis = await analyzeMarket(chainId, tokenAddress, strategy);

  if (!analysis) {
    return null;
  }

  // Calculate trade amount based on risk level
  const tradeAmount = (userBalance * BigInt(riskLevelBps)) / 10000n;

  if (tradeAmount === 0n) {
    return null;
  }

  // Calculate minAmountOut with 1% slippage
  const minAmountOut = (tradeAmount * 99n) / 100n;

  // Get token symbol
  const symbol = TOKEN_SYMBOLS[chainId]?.[tokenAddress] || 'UNKNOWN';
  const tokenSymbol = symbol.replace('USDT', '');

  return {
    direction: analysis.direction,
    confidence: analysis.confidence,
    tokenAddress,
    tokenSymbol,
    suggestedAmount: tradeAmount,
    minAmountOut,
    reason: analysis.reason,
    takeProfitPercent: analysis.suggestedTP,
    trailingStopPercent: analysis.suggestedSL
  };
}

export class MarketService {
  private analysisCache: Map<string, { analysis: MarketAnalysis; timestamp: number }> = new Map();
  private cacheTTL = 30000; // 30 seconds

  /**
   * Get market analysis with caching
   */
  async getAnalysis(chainId: number, tokenAddress: string, strategy: TradingStrategy = 'normal'): Promise<MarketAnalysis | null> {
    const cacheKey = `${chainId}-${tokenAddress}-${strategy}`;
    const cached = this.analysisCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.analysis;
    }

    const analysis = await analyzeMarket(chainId, tokenAddress, strategy);

    if (analysis) {
      this.analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
    }

    return analysis;
  }

  /**
   * Generate signal with strategy support
   */
  async getSignal(
    chainId: number,
    tokenAddress: string,
    userBalance: bigint,
    riskLevelBps: number = 500,
    strategy: TradingStrategy = 'normal'
  ): Promise<TradeSignal | null> {
    return generateTradeSignal(chainId, tokenAddress, userBalance, riskLevelBps, strategy);
  }
}

export const marketService = new MarketService();
