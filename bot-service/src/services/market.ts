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
  isReversalSignal: boolean; // Flag for reversal-based entries
  suggestedTP: number; // Dynamic TP % based on conditions
  suggestedSL: number; // Dynamic trailing stop %
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
    reversalBoost: 10,
    minConditions: 4
  },
  normal: {
    minConfidence: 70,
    reversalBoost: 15,
    minConditions: 3
  },
  risky: {
    minConfidence: 40, // MUCH lower - more trades!
    reversalBoost: 25, // Big boost for reversals
    minConditions: 2   // Less conditions required
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
 * Analyze market conditions and generate signal
 * @param strategy - 'risky' mode = more trades, lower confidence required
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

  // Fetch candle data
  // Use 1h candles for more stable analysis (less noise)
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
  const price1hAgo = closes[closes.length - 2] || currentPrice; // Previous 1h candle
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

  // === REJECTION + REVERSAL PATTERNS ===

  // Hammer (bullish reversal at support)
  const isHammer = hasLongLowerWick &&
    upperWick < lastCandleBody * 0.5 &&
    lowerWick > lastCandleBody * 2 &&
    nearSupport;

  // Shooting Star (bearish reversal at resistance)
  const isShootingStar = hasLongUpperWick &&
    lowerWick < lastCandleBody * 0.5 &&
    upperWick > lastCandleBody * 2 &&
    nearResistance;

  // Doji at key level (indecision, potential reversal)
  const isDoji = lastCandleBody < lastCandleRange * 0.1;
  const isDojiatSupport = isDoji && nearSupport;
  const isDojiatResistance = isDoji && nearResistance;

  // Double bottom detection (bullish reversal)
  const last20Lows = lows.slice(-20);
  const minLow = Math.min(...last20Lows);
  const secondMinIndex = last20Lows.findIndex((l, i) => i > 5 && Math.abs(l - minLow) / minLow < 0.01);
  const hasDoubleBottom = secondMinIndex > 0 && nearSupport;

  // Support rejection (price touched support and bounced)
  const touchedSupport = lastCandle.low <= recentLow * 1.005; // Within 0.5% of support
  const bouncedFromSupport = touchedSupport && lastCandleIsBullish && lastCandle.close > lastCandle.open;
  const supportRejection = bouncedFromSupport || (nearSupport && hasLongLowerWick);

  // Resistance rejection (price touched resistance and rejected)
  const touchedResistance = lastCandle.high >= recentHigh * 0.995; // Within 0.5% of resistance
  const rejectedFromResistance = touchedResistance && lastCandleIsBearish && lastCandle.close < lastCandle.open;
  const resistanceRejection = rejectedFromResistance || (nearResistance && hasLongUpperWick);

  // Bullish reversal combo: RSI oversold + support rejection + bullish candle
  const bullishReversalSignal = (rsi < 35 || rsiRising) &&
    (supportRejection || isHammer || isBullishEngulfing || hasDoubleBottom) &&
    (lastCandleIsBullish || hasLongLowerWick);

  // Bearish reversal combo: RSI overbought + resistance rejection + bearish candle
  const bearishReversalSignal = (rsi > 65 || rsiFalling) &&
    (resistanceRejection || isShootingStar || isBearishEngulfing) &&
    (lastCandleIsBearish || hasLongUpperWick);

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

  // === SIMPLIFIED 3-FACTOR SYSTEM ===
  // ALL 3 factors must be met for a valid signal
  // This eliminates weak signals and trades only high-probability setups

  // Calculate ATR for volatility filter
  const atrPeriod = 14;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  const atr = trueRanges.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod;
  const atrPercent = (atr / currentPrice) * 100;

  // Volatility filter: Skip ranging/low volatility markets
  const minVolatility = 0.3; // Minimum 0.3% ATR
  const isLowVolatility = atrPercent < minVolatility;

  if (isLowVolatility) {
    logger.info('⏸️ Skipping: Low volatility market (ranging)', {
      atrPercent: atrPercent.toFixed(3) + '%',
      threshold: minVolatility + '%'
    });
    return null;
  }

  // === 3 CORE FACTORS (ALL must be true) ===

  // Factor 1: RSI EXTREME (strict thresholds)
  const rsiExtremeLong = rsi < 25;  // Very oversold only
  const rsiExtremeShort = rsi > 75; // Very overbought only

  // Factor 2: VOLUME SPIKE (2x average minimum)
  const volumeSpike = volumeRatio >= 2.0;

  // Factor 3: CANDLESTICK PATTERN (clear reversal)
  // Bullish patterns: Bullish Engulfing, Hammer
  const hasBullishPattern = isBullishEngulfing || isHammer || (hasLongLowerWick && lastCandleIsBullish);
  // Bearish patterns: Bearish Engulfing, Shooting Star
  const hasBearishPattern = isBearishEngulfing || isShootingStar || (hasLongUpperWick && lastCandleIsBearish);

  // === SIGNAL GENERATION ===
  let direction: 'LONG' | 'SHORT' | null = null;
  let conditionsMet = 0;

  // LONG: ALL 3 factors must be true
  const longSignal = rsiExtremeLong && volumeSpike && hasBullishPattern;
  // SHORT: ALL 3 factors must be true
  const shortSignal = rsiExtremeShort && volumeSpike && hasBearishPattern;

  // Log current state for debugging
  logger.debug('Signal check', {
    rsi: rsi.toFixed(1),
    rsiExtremeLong,
    rsiExtremeShort,
    volumeRatio: volumeRatio.toFixed(2),
    volumeSpike,
    hasBullishPattern,
    hasBearishPattern,
    atrPercent: atrPercent.toFixed(3) + '%'
  });

  if (longSignal) {
    direction = 'LONG';
    conditionsMet = 3;
    logger.info('🟢 LONG SIGNAL: All 3 factors confirmed!', {
      rsi: rsi.toFixed(1),
      volumeRatio: volumeRatio.toFixed(2) + 'x',
      pattern: isBullishEngulfing ? 'Bullish Engulfing' : isHammer ? 'Hammer' : 'Long Lower Wick'
    });
  } else if (shortSignal) {
    direction = 'SHORT';
    conditionsMet = 3;
    logger.info('🔴 SHORT SIGNAL: All 3 factors confirmed!', {
      rsi: rsi.toFixed(1),
      volumeRatio: volumeRatio.toFixed(2) + 'x',
      pattern: isBearishEngulfing ? 'Bearish Engulfing' : isShootingStar ? 'Shooting Star' : 'Long Upper Wick'
    });
  } else {
    // No valid signal - not all 3 factors met
    logger.debug('No signal: Waiting for all 3 factors', {
      longFactors: `${rsiExtremeLong ? '✓' : '✗'} RSI | ${volumeSpike ? '✓' : '✗'} Volume | ${hasBullishPattern ? '✓' : '✗'} Pattern`,
      shortFactors: `${rsiExtremeShort ? '✓' : '✗'} RSI | ${volumeSpike ? '✓' : '✗'} Volume | ${hasBearishPattern ? '✓' : '✗'} Pattern`
    });
    return null; // NO TRADE - wait for better setup
  }

  // Trend alignment check (optional safety)
  if (isStrongUptrend && direction === 'SHORT') {
    logger.warn('⚠️ SHORT rejected: Against strong uptrend');
    return null;
  }
  if (isStrongDowntrend && direction === 'LONG') {
    logger.warn('⚠️ LONG rejected: Against strong downtrend');
    return null;
  }

  // Build conditions object for logging
  const conditions = direction === 'LONG'
    ? { rsiExtreme: rsiExtremeLong, volumeSpike, candlePattern: hasBullishPattern }
    : { rsiExtreme: rsiExtremeShort, volumeSpike, candlePattern: hasBearishPattern };

  // Confidence: Always 90% when all 3 core factors are met
  // (We already returned null if factors weren't met)
  const confidence = 90;

  // In 3-factor system, all signals are reversal-based (RSI extreme + pattern)
  const isReversalSignal = true;

  // Risk/Reward
  const distanceToResistance = ((recentHigh - currentPrice) / currentPrice) * 100;
  const distanceToSupport = ((currentPrice - recentLow) / currentPrice) * 100;
  const takeProfitDistance = Math.max(direction === 'LONG' ? distanceToResistance : distanceToSupport, 0.3);
  const stopLossDistance = Math.max(direction === 'LONG' ? distanceToSupport : distanceToResistance, 0.3);
  const riskReward = Math.min(Math.max(takeProfitDistance / stopLossDistance, 0.1), 10);

  // Build reason string (3-factor system)
  const indicators: string[] = [];
  const patternName = direction === 'LONG'
    ? (isBullishEngulfing ? 'Bullish Engulfing' : isHammer ? 'Hammer' : 'Long Lower Wick')
    : (isBearishEngulfing ? 'Bearish Engulfing' : isShootingStar ? 'Shooting Star' : 'Long Upper Wick');

  const reason = `RSI ${rsi.toFixed(0)} + Volume ${volumeRatio.toFixed(1)}x + ${patternName}`;

  // === DYNAMIC TP/SL CALCULATION ===
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isMonday = dayOfWeek === 1;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Base TP/SL ranges
  let baseTP = 7.5; // Default 7.5% TP
  let baseSL = 1.0; // Default 1% trailing stop

  // Adjust for day of week
  if (isMonday) {
    // MONDAY = RISKY - use tighter TP (take profits quicker)
    baseTP = 5.0;
    baseSL = 0.8;
    logger.info('📅 Monday detected - using conservative TP/SL');
  } else if (isWeekend) {
    // Weekend = less liquidity
    baseTP = 5.0;
    baseSL = 1.0;
  }

  // Adjust for trend strength
  if (isStrongUptrend && direction === 'LONG') {
    baseTP = Math.min(baseTP + 2, 10); // Up to 10% in strong uptrend
    logger.info('📈 Strong uptrend - extending TP to ' + baseTP + '%');
  } else if (isStrongDowntrend && direction === 'SHORT') {
    baseTP = Math.min(baseTP + 2, 10); // Up to 10% in strong downtrend
    logger.info('📉 Strong downtrend - extending TP to ' + baseTP + '%');
  }

  // Adjust for volatility (high volume = more volatile)
  if (volumeRatio > 2.0) {
    // High volatility - widen SL to avoid getting stopped out
    baseSL = Math.min(baseSL + 0.5, 2.0);
    // But also increase TP potential
    baseTP = Math.min(baseTP + 1, 10);
  }

  // Adjust for confidence
  if (confidence >= 85) {
    // High confidence = let it run more
    baseTP = Math.min(baseTP + 1, 10);
  } else if (confidence < 60) {
    // Low confidence = take profits quicker
    baseTP = Math.max(baseTP - 1, 5);
  }

  // Reversal signals - tighter TP (reversals can be quick)
  if (isReversalSignal) {
    baseTP = Math.max(baseTP - 1, 5);
  }

  const suggestedTP = Math.round(baseTP * 10) / 10; // Round to 1 decimal
  const suggestedSL = Math.round(baseSL * 10) / 10;

  logger.info('📊 Dynamic TP/SL calculated', {
    day: dayNames[dayOfWeek],
    isMonday,
    trend,
    volumeRatio: volumeRatio.toFixed(1),
    confidence,
    suggestedTP: suggestedTP + '%',
    suggestedSL: suggestedSL + '%'
  });

  logger.info('Market analysis complete', {
    symbol,
    strategy,
    direction,
    confidence,
    conditionsMet,
    isReversalSignal,
    rsi: rsi.toFixed(0),
    macd: macd.toFixed(4),
    volumeRatio: volumeRatio.toFixed(2)
  });

  return {
    direction,
    confidence: Math.round(confidence),
    reason,
    indicators,
    isReversalSignal,
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
 * @param strategy - 'risky' mode opens more positions with lower confidence
 */
export async function generateTradeSignal(
  chainId: number,
  tokenAddress: string,
  userBalance: bigint,
  riskLevelBps: number = 500, // Default 5%
  strategy: TradingStrategy = 'normal'
): Promise<TradeSignal | null> {
  const strategyConfig = STRATEGY_CONFIGS[strategy];
  const analysis = await analyzeMarket(chainId, tokenAddress, strategy);

  if (!analysis) {
    return null;
  }

  // Determine minimum confidence based on strategy
  const minConfidence = strategyConfig.minConfidence;

  // Only trade if confidence meets minimum
  if (analysis.confidence < minConfidence) {
    logger.debug('Signal confidence below minimum', {
      confidence: analysis.confidence,
      required: minConfidence,
      strategy
    });
    return null;
  }

  // RISKY MODE: Always open on reversal signals regardless of confidence
  if (strategy === 'risky' && analysis.isReversalSignal) {
    logger.info('🔥 RISKY MODE: Opening on reversal signal!', {
      direction: analysis.direction,
      confidence: analysis.confidence,
      reason: analysis.reason
    });
  }

  // Calculate trade amount based on risk level
  const tradeAmount = (userBalance * BigInt(riskLevelBps)) / 10000n;

  if (tradeAmount === 0n) {
    return null;
  }

  // Calculate minAmountOut with 1% slippage
  const minAmountOut = (tradeAmount * 99n) / 100n;

  // Get token symbol from the lookup
  const symbol = TOKEN_SYMBOLS[chainId]?.[tokenAddress] || 'UNKNOWN';
  const tokenSymbol = symbol.replace('USDT', ''); // Convert ETHUSDT -> ETH

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
   * @param strategy - 'risky' = many trades, 'normal' = balanced, 'conservative' = few trades
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
