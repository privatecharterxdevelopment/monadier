import { logger } from '../utils/logger';
import { TradeSignal } from './trading';
import { parseUnits } from 'viem';
import { positionService } from './positions';

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
  // Overheating & warnings
  isOverheated: boolean;
  isWeekendWarning: boolean;
  weekendAlertLevel: 'none' | 'yellow' | 'red';
  scalpingRecommended: boolean;
  marketWarning?: string;
  isWeak?: boolean; // Signal is too weak to trade
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
export type TradingStrategy = 'conservative' | 'normal' | 'risky' | 'aggressive';

// Strategy configs - 40% minimum confidence
const STRATEGY_CONFIGS = {
  conservative: {
    minConfidence: 70,
    minConditions: 3,
    patternOnly: false,
    profitLockPercent: 0.5
  },
  normal: {
    minConfidence: 50,
    minConditions: 2,
    patternOnly: false,
    profitLockPercent: 0.5
  },
  risky: {
    minConfidence: 40,  // 40% minimum!
    minConditions: 1,   // Nur 1 condition nötig
    patternOnly: false,
    profitLockPercent: 0.5
  },
  aggressive: {
    minConfidence: 30,
    minConditions: 1,
    patternOnly: false,
    profitLockPercent: 0.2
  }
};

// Token config for different chains
const TOKEN_SYMBOLS: Record<number, Record<string, string>> = {
  // BASE - Currently Active
  8453: {
    '0x4200000000000000000000000000000000000006': 'ETHUSDT',
    '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22': 'ETHUSDT',   // cbETH tracks ETH
    '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c': 'BTCUSDT',
  },
  // ETHEREUM
  1: {
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 'ETHUSDT',
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 'BTCUSDT',
  },
  // POLYGON
  137: {
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619': 'ETHUSDT',
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': 'MATICUSDT',
    '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6': 'BTCUSDT',
  },
  // ARBITRUM
  42161: {
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': 'ETHUSDT',
    '0x912CE59144191C1204E64559FE8253a0e49E6548': 'ARBUSDT',
    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 'BTCUSDT',
  },
  // BSC
  56: {
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': 'BNBUSDT',
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8': 'ETHUSDT',
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c': 'BTCUSDT',
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
  // Pattern detection is SUPER important - these arrows work great!

  // Hammer pattern (bullish reversal)
  const isHammer = hasLongLowerWick &&
    upperWick < lastCandleBody * 0.5 &&
    lowerWick > lastCandleBody * 2;

  // Shooting star (bearish reversal)
  const isShootingStar = hasLongUpperWick &&
    lowerWick < lastCandleBody * 0.5 &&
    upperWick > lastCandleBody * 2;

  // Strong pattern detection (these are the chart arrows that work great!)
  const hasBullishPattern = isBullishEngulfing || isHammer || (hasLongLowerWick && lastCandleIsBullish);
  const hasBearishPattern = isBearishEngulfing || isShootingStar || (hasLongUpperWick && lastCandleIsBearish);

  // SHORT CONDITIONS (6 factors) - Patterns get extra weight!
  const shortConditions = {
    rsiOverbought: rsi > 70 || (rsi > 60 && rsiFalling),
    macdBearish: macd < -0.5 || (macdCrossunder && Math.abs(macd) > 0.2),
    volumeConfirmed: isHighVolume && priceChange1h < 0,
    priceRejectedResistance: nearResistance && (isBearishEngulfing || hasLongUpperWick),
    lowerHighsForming: isFormingLowerHighs,
    immediateBearish: immediateBearishMomentum,
    // BONUS: Strong pattern detection (chart arrows!)
    strongBearishPattern: hasBearishPattern
  };
  const shortConditionsMet = Object.values(shortConditions).filter(Boolean).length;

  // LONG CONDITIONS (6 factors) - Patterns get extra weight!
  const longConditions = {
    rsiOversold: rsi < 30 || (rsi < 40 && rsiRising),
    macdBullish: macd > 0.5 || (macdCrossover && Math.abs(macd) > 0.2),
    volumeConfirmed: isHighVolume && priceChange1h > 0,
    priceBouncingSupport: nearSupport && (isBullishEngulfing || hasLongLowerWick),
    higherLowsForming: isFormingHigherLows,
    immediateBullish: immediateBullishMomentum,
    // BONUS: Strong pattern detection (chart arrows!)
    strongBullishPattern: hasBullishPattern
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

  // === CONFIDENCE SCORING (now 7 factors with pattern bonus) ===
  const calculateConfidence = (conditionsMet: number, isPatternOnly: boolean): number => {
    // For aggressive/pattern-only mode, patterns are the main signal
    if (isPatternOnly) {
      return conditionsMet >= 1 ? 80 : 30; // High confidence if pattern exists
    }
    if (conditionsMet >= 6) return 95; // 6+ factors = very high confidence
    if (conditionsMet >= 5) return 90;
    if (conditionsMet >= 4) return 80;
    if (conditionsMet === 3) return 65;
    if (conditionsMet === 2) return 45;
    return 25;
  };

  // === AGGRESSIVE MODE: PATTERN-ONLY TRADING ===
  // If patternOnly is true, we ONLY look at candlestick patterns (the chart arrows!)
  if (strategyConfig.patternOnly) {
    if (hasBullishPattern) {
      const patternName = isBullishEngulfing ? 'Bullish Engulfing' : isHammer ? 'Hammer' : 'Long Lower Wick';
      logger.info(`🔥 AGGRESSIVE: ${patternName} detected - LONG signal!`, {
        symbol,
        pattern: patternName,
        profitLock: strategyConfig.profitLockPercent + '%'
      });
      return {
        direction: 'LONG',
        confidence: 80,
        reason: patternName,
        indicators: [patternName],
        isReversalSignal: true,
        suggestedTP: 3.0,
        suggestedSL: 0.5,
        isOverheated: rsi > 75 || rsi < 25,
        isWeekendWarning: false,
        weekendAlertLevel: 'none' as const,
        scalpingRecommended: false,
        metrics: {
          rsi: Math.round(rsi),
          macd: macd.toFixed(4),
          priceChange1h: priceChange1h.toFixed(2),
          volumeRatio: volumeRatio.toFixed(1),
          conditionsMet: 1,
          riskReward: '2.0',
          trend,
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        }
      };
    }
    if (hasBearishPattern) {
      const patternName = isBearishEngulfing ? 'Bearish Engulfing' : isShootingStar ? 'Shooting Star' : 'Long Upper Wick';
      logger.info(`🔥 AGGRESSIVE: ${patternName} detected - SHORT signal!`, {
        symbol,
        pattern: patternName,
        profitLock: strategyConfig.profitLockPercent + '%'
      });
      return {
        direction: 'SHORT',
        confidence: 80,
        reason: patternName,
        indicators: [patternName],
        isReversalSignal: true,
        suggestedTP: 3.0,
        suggestedSL: 0.5,
        isOverheated: rsi > 75 || rsi < 25,
        isWeekendWarning: false,
        weekendAlertLevel: 'none' as const,
        scalpingRecommended: false,
        metrics: {
          rsi: Math.round(rsi),
          macd: macd.toFixed(4),
          priceChange1h: priceChange1h.toFixed(2),
          volumeRatio: volumeRatio.toFixed(1),
          conditionsMet: 1,
          riskReward: '2.0',
          trend,
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        }
      };
    }
    // No pattern detected in aggressive mode - no trade
    logger.debug('AGGRESSIVE: No pattern detected, waiting...');
    return null;
  }

  // === DIRECTION DETERMINATION - AGGRESSIVE MODE ===
  // Just pick the stronger direction, even with just 1 condition!
  let direction: 'LONG' | 'SHORT' | 'HOLD' = 'HOLD';
  let conditionsMet = 0;
  let conditions: Record<string, boolean> = {};

  // AGGRESSIVE: Trade with just 1 condition met!
  if (longConditionsMet > shortConditionsMet && longConditionsMet >= 1) {
    direction = 'LONG';
    conditionsMet = longConditionsMet;
    conditions = longConditions;
  } else if (shortConditionsMet > longConditionsMet && shortConditionsMet >= 1) {
    direction = 'SHORT';
    conditionsMet = shortConditionsMet;
    conditions = shortConditions;
  } else if (longConditionsMet === shortConditionsMet && longConditionsMet >= 1) {
    // Tie-breaker: use recent momentum
    const momentum3 = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
    direction = momentum3 > 0 ? 'LONG' : 'SHORT';
    conditionsMet = longConditionsMet;
    conditions = momentum3 > 0 ? longConditions : shortConditions;
  } else {
    // EVEN MORE AGGRESSIVE: If no conditions, use price momentum!
    const momentum = ((closes[closes.length - 1] - closes[closes.length - 3]) / closes[closes.length - 3]) * 100;
    direction = momentum > 0 ? 'LONG' : 'SHORT';
    conditionsMet = 1; // Force 1 condition
    conditions = momentum > 0 ? longConditions : shortConditions;
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
  const rawConfidence = calculateConfidence(conditionsMet, false);
  const confidence = Math.max(20, rawConfidence - confidencePenalty);

  // If HOLD, force to stronger signal (same as UI)
  let finalDirection: 'LONG' | 'SHORT' = direction as any;
  if (direction === 'HOLD') {
    finalDirection = longConditionsMet >= shortConditionsMet ? 'LONG' : 'SHORT';
    conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
    logger.info(`Weak setup - forcing ${finalDirection} (${conditionsMet}/6 conditions)`);
  }

  // Check minimum conditions for strategy
  // With minConditions=0, this will almost never trigger!
  const isTooWeak = strategyConfig.minConditions > 0 &&
    (conditionsMet < strategyConfig.minConditions || confidence < strategyConfig.minConfidence);

  if (isTooWeak) {
    const weakReason = conditionsMet < strategyConfig.minConditions
      ? `Signal weak: ${conditionsMet}/${strategyConfig.minConditions} conditions`
      : `Confidence: ${confidence}% < ${strategyConfig.minConfidence}%`;
    logger.info(`${weakReason} for ${strategy} mode`);

    // Return analysis anyway for UI display (marked as weak)
    return {
      direction: finalDirection,
      confidence: Math.round(confidence),
      reason: `Waiting - ${weakReason}`,
      indicators: [],
      isReversalSignal: false,
      suggestedTP: 5,
      suggestedSL: 1,
      isOverheated: rsi > 75 || rsi < 25,
      isWeekendWarning: false,
      weekendAlertLevel: 'none' as const,
      scalpingRecommended: false,
      isWeak: true, // Flag to indicate signal is too weak
      metrics: {
        rsi: Math.round(rsi),
        macd: macd.toFixed(4),
        priceChange1h: priceChange1h.toFixed(2),
        volumeRatio: volumeRatio.toFixed(1),
        conditionsMet,
        riskReward: '0',
        trend,
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
      }
    };
  }

  // === BUILD INDICATORS LIST ===
  const indicators: string[] = [];

  if (finalDirection === 'LONG') {
    // Pattern first - these are the chart arrows that work great!
    if (conditions.strongBullishPattern) {
      if (isBullishEngulfing) indicators.push('Bullish Engulfing');
      else if (isHammer) indicators.push('Hammer');
      else indicators.push('Long Lower Wick');
    }
    if (conditions.rsiOversold) indicators.push(`RSI ${rsi.toFixed(0)}${rsiRising ? ' ↗' : ''}`);
    if (conditions.macdBullish) indicators.push(macdCrossover ? 'MACD Cross ↑' : 'MACD Bullish');
    if (conditions.volumeConfirmed) indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↑`);
    if (conditions.priceBouncingSupport) indicators.push('Support Bounce');
    if (conditions.higherLowsForming) indicators.push('Higher Lows');
    if (conditions.immediateBullish) indicators.push('Strong Green Candle');
  } else {
    // Pattern first - these are the chart arrows that work great!
    if (conditions.strongBearishPattern) {
      if (isBearishEngulfing) indicators.push('Bearish Engulfing');
      else if (isShootingStar) indicators.push('Shooting Star');
      else indicators.push('Long Upper Wick');
    }
    if (conditions.rsiOverbought) indicators.push(`RSI ${rsi.toFixed(0)}${rsiFalling ? ' ↘' : ''}`);
    if (conditions.macdBearish) indicators.push(macdCrossunder ? 'MACD Cross ↓' : 'MACD Bearish');
    if (conditions.volumeConfirmed) indicators.push(`Vol ${volumeRatio.toFixed(1)}x ↓`);
    if (conditions.priceRejectedResistance) indicators.push('Resistance Rejection');
    if (conditions.lowerHighsForming) indicators.push('Lower Highs');
    if (conditions.immediateBearish) indicators.push('Strong Red Candle');
  }

  // Build reason
  const reason = indicators.slice(0, 3).join(' + ') || `${conditionsMet}/6 factors`;

  // === DYNAMIC TP/SL ===
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getUTCHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isSunday = dayOfWeek === 0;
  const isMonday = dayOfWeek === 1;
  const isSaturday = dayOfWeek === 6;
  const isWeekend = isSunday || isSaturday;

  // === OVERHEATING DETECTION ===
  // Market is overheated when RSI is extreme and price moved significantly
  const isOverbought = rsi > 75;
  const isOversold = rsi < 25;
  const isExtremeRSI = rsi > 80 || rsi < 20;
  const rapidPriceMove = Math.abs(priceChange1h) > 2.0; // 2%+ move in 1h
  const isOverheated = isExtremeRSI || (rapidPriceMove && (isOverbought || isOversold));

  // Detect potential reversal when overheated
  const potentialReversal = isOverheated && (
    (isOverbought && (hasBearishPattern || lastCandleIsBearish)) ||
    (isOversold && (hasBullishPattern || lastCandleIsBullish))
  );

  // Recommend scalping when overheated with reversal signals
  const scalpingRecommended = potentialReversal || (isExtremeRSI && isHighVolume);

  // === WEEKEND/MONDAY WARNING SYSTEM ===
  // Sunday evening to Monday = highest risk (institutional moves)
  // Saturday after peak hours = elevated risk
  let weekendAlertLevel: 'none' | 'yellow' | 'red' = 'none';
  let marketWarning: string | undefined;

  if (isSunday && hour >= 18) {
    // Sunday evening UTC - RED ALERT (market opens soon)
    weekendAlertLevel = 'red';
    marketWarning = 'RED ALERT: Sunday evening - high volatility expected as markets prepare to open';
  } else if (isMonday && hour < 12) {
    // Monday morning UTC - RED ALERT (institutional selling/buying)
    weekendAlertLevel = 'red';
    marketWarning = 'RED ALERT: Monday morning - institutional activity, expect sharp moves';
  } else if (isMonday) {
    // Monday afternoon - elevated risk
    weekendAlertLevel = 'yellow';
    marketWarning = 'Caution: Monday market instability - reduced position sizes recommended';
  } else if (isSunday) {
    // Sunday - yellow warning
    weekendAlertLevel = 'yellow';
    marketWarning = 'Weekend trading: Lower liquidity, wider spreads possible';
  } else if (isSaturday && hour >= 12) {
    // Saturday afternoon/evening - watch for weekend dumps
    weekendAlertLevel = 'yellow';
    marketWarning = 'Weekend alert: Watch for late Saturday dumps before Sunday instability';
  }

  const isWeekendWarning = weekendAlertLevel !== 'none';

  // Log overheating and warnings
  if (isOverheated) {
    logger.warn('🔥 MARKET OVERHEATED', {
      symbol,
      rsi: rsi.toFixed(1),
      priceChange1h: priceChange1h.toFixed(2) + '%',
      potentialReversal,
      scalpingRecommended
    });
  }

  if (isWeekendWarning) {
    logger.warn(`⚠️ ${weekendAlertLevel.toUpperCase()} ALERT: ${marketWarning}`);
  }

  let baseTP = 7.5;
  let baseSL = 1.0;

  if (isMonday) {
    baseTP = 4.0; // Even tighter on Monday
    baseSL = 0.6;
  } else if (isSunday) {
    baseTP = 3.5; // Very tight on Sunday
    baseSL = 0.5;
  } else if (isSaturday) {
    baseTP = 5.0;
    baseSL = 0.8;
  }

  // If overheated, use scalping parameters
  if (scalpingRecommended) {
    baseTP = 2.0; // Quick scalp TP
    baseSL = 0.5; // Tight stop
    logger.info('🎯 Scalping mode activated due to overheated market');
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
    isReversalSignal: nearSupport || nearResistance || potentialReversal,
    suggestedTP,
    suggestedSL,
    isOverheated,
    isWeekendWarning,
    weekendAlertLevel,
    scalpingRecommended,
    marketWarning,
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

  // Get token symbol
  const symbol = TOKEN_SYMBOLS[chainId]?.[tokenAddress] || 'UNKNOWN';
  const tokenSymbol = symbol.replace('USDT', '');

  // Save analysis to Supabase for UI display (even if no trade)
  if (analysis) {
    await positionService.saveAnalysis({
      chainId,
      tokenAddress,
      tokenSymbol,
      signal: analysis.direction,
      confidence: analysis.confidence,
      currentPrice: parseFloat(analysis.metrics.macd) || 0,
      factors: {
        rsi: analysis.metrics.rsi,
        macdSignal: analysis.metrics.macd,
        volumeSpike: parseFloat(analysis.metrics.volumeRatio) > 1.5,
        trend: analysis.metrics.trend,
        pattern: analysis.indicators[0] || null,
        priceChange24h: parseFloat(analysis.metrics.priceChange1h) || 0
      },
      recommendation: `${analysis.direction} - ${analysis.reason} (${analysis.confidence}% confidence)`
    });
  }

  if (!analysis) {
    return null;
  }

  // Don't trade if signal is too weak (but analysis was saved above for UI)
  if (analysis.isWeak) {
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
    tokenSymbol,
    suggestedAmount: tradeAmount,
    minAmountOut,
    reason: analysis.reason,
    takeProfitPercent: analysis.suggestedTP,
    trailingStopPercent: analysis.suggestedSL,
    profitLockPercent: strategyConfig.profitLockPercent // Pass from strategy config
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
