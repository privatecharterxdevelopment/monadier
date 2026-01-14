/**
 * Unified Signal Engine - Multi-Timeframe Analysis with Pattern Recognition
 *
 * This engine provides synchronized signals for both the bot and frontend.
 * It analyzes multiple timeframes and combines them with candlestick patterns
 * to generate high-confidence trading signals.
 */

import { logger } from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h';
export type SignalDirection = 'LONG' | 'SHORT' | 'HOLD';
export type PatternType =
  | 'bullish_engulfing' | 'bearish_engulfing'
  | 'hammer' | 'inverted_hammer'
  | 'doji' | 'dragonfly_doji' | 'gravestone_doji'
  | 'morning_star' | 'evening_star'
  | 'three_white_soldiers' | 'three_black_crows'
  | 'bullish_harami' | 'bearish_harami';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pattern {
  type: PatternType;
  direction: 'bullish' | 'bearish';
  strength: number; // 1-3 (1=weak, 2=medium, 3=strong)
  candleIndex: number;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  direction: SignalDirection;
  confidence: number; // 0-100
  trend: 'UP' | 'DOWN' | 'SIDEWAYS';
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  patterns: Pattern[];
  support: number;
  resistance: number;
  currentPrice: number;
}

export interface UnifiedSignal {
  symbol: string;
  direction: SignalDirection;
  confidence: number; // 0-100

  // Breakdown by timeframe
  timeframes: TimeframeAnalysis[];

  // Combined analysis
  trendAlignment: number; // 0-100 (how aligned are all timeframes)
  patternStrength: number; // 0-100

  // Key patterns detected
  patterns: Pattern[];

  // Entry/Exit suggestions
  suggestedEntry: number;
  suggestedTP: number;
  suggestedSL: number;

  // Reasoning
  reasons: string[];
  warnings: string[];

  timestamp: number;
}

// ============================================================================
// TIMEFRAME WEIGHTS (higher timeframe = more weight for trend)
// ============================================================================

const TIMEFRAME_WEIGHTS: Record<Timeframe, { trend: number; entry: number }> = {
  '1m':  { trend: 0.05, entry: 0.30 }, // Good for entry timing
  '5m':  { trend: 0.10, entry: 0.30 }, // Good for entry timing
  '15m': { trend: 0.20, entry: 0.25 }, // Balance
  '1h':  { trend: 0.35, entry: 0.10 }, // Trend confirmation
  '4h':  { trend: 0.30, entry: 0.05 }, // Main trend
};

// Pattern strength multipliers
const PATTERN_WEIGHTS: Record<PatternType, number> = {
  'bullish_engulfing': 0.8,
  'bearish_engulfing': 0.8,
  'hammer': 0.7,
  'inverted_hammer': 0.6,
  'doji': 0.3,
  'dragonfly_doji': 0.5,
  'gravestone_doji': 0.5,
  'morning_star': 0.9,
  'evening_star': 0.9,
  'three_white_soldiers': 1.0,
  'three_black_crows': 1.0,
  'bullish_harami': 0.6,
  'bearish_harami': 0.6,
};

// ============================================================================
// SIGNAL ENGINE CLASS
// ============================================================================

export class SignalEngine {
  private cache: Map<string, { data: Candle[]; timestamp: number }> = new Map();
  private cacheTTL: Record<Timeframe, number> = {
    '1m': 30000,   // 30 seconds
    '5m': 60000,   // 1 minute
    '15m': 120000, // 2 minutes
    '1h': 300000,  // 5 minutes
    '4h': 600000,  // 10 minutes
  };

  // --------------------------------------------------------------------------
  // FETCH CANDLES FROM BINANCE
  // --------------------------------------------------------------------------

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number = 100): Promise<Candle[]> {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL[timeframe]) {
      return cached.data;
    }

    const interval = timeframe === '1m' ? '1m' :
                     timeframe === '5m' ? '5m' :
                     timeframe === '15m' ? '15m' :
                     timeframe === '1h' ? '1h' : '4h';

    // Try Binance first
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const candles: Candle[] = data.map((k: any) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
        return candles;
      }
    } catch (err: any) {
      logger.warn('Binance failed in signalEngine, trying KuCoin', { symbol, error: err.message?.slice(0, 40) });
    }

    // Fallback: KuCoin
    try {
      const kucoinSymbol = symbol.replace('USDT', '-USDT');
      const kucoinInterval = interval === '1h' ? '1hour' : interval === '5m' ? '5min' : interval === '15m' ? '15min' : interval === '1m' ? '1min' : interval === '4h' ? '4hour' : '1hour';
      const endAt = Math.floor(Date.now() / 1000);
      const startAt = endAt - (limit * (interval === '1h' ? 3600 : interval === '4h' ? 14400 : interval === '15m' ? 900 : interval === '5m' ? 300 : 60));

      const url = `https://api.kucoin.com/api/v1/market/candles?type=${kucoinInterval}&symbol=${kucoinSymbol}&startAt=${startAt}&endAt=${endAt}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();

      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        logger.info('SignalEngine using KuCoin data', { symbol: kucoinSymbol, count: data.data.length });
        const candles: Candle[] = data.data.reverse().map((k: any[]) => ({
          time: parseInt(k[0]) * 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[3]),
          low: parseFloat(k[4]),
          close: parseFloat(k[2]),
          volume: parseFloat(k[5]),
        }));
        this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
        return candles;
      }
    } catch (err: any) {
      logger.warn('KuCoin failed in signalEngine, trying OKX', { symbol, error: err.message?.slice(0, 40) });
    }

    // Fallback: OKX
    try {
      const okxSymbol = symbol.replace('USDT', '-USDT');
      const okxInterval = interval === '1h' ? '1H' : interval === '4h' ? '4H' : interval;

      const url = `https://www.okx.com/api/v5/market/candles?instId=${okxSymbol}&bar=${okxInterval}&limit=${limit}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();

      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        logger.info('SignalEngine using OKX data', { symbol: okxSymbol, count: data.data.length });
        const candles: Candle[] = data.data.reverse().map((k: any[]) => ({
          time: parseInt(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
        return candles;
      }
    } catch (err: any) {
      logger.error('All APIs failed in signalEngine', { symbol, timeframe, error: err.message?.slice(0, 40) });
    }

    return cached?.data || [];
  }

  // --------------------------------------------------------------------------
  // CANDLESTICK PATTERN DETECTION
  // --------------------------------------------------------------------------

  detectPatterns(candles: Candle[]): Pattern[] {
    const patterns: Pattern[] = [];
    if (candles.length < 3) return patterns;

    for (let i = 2; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const prev2 = candles[i - 2];

      const currBody = Math.abs(curr.close - curr.open);
      const currRange = curr.high - curr.low;
      const prevBody = Math.abs(prev.close - prev.open);
      const prevRange = prev.high - prev.low;

      // Bullish Engulfing
      if (this.isBullishEngulfing(prev, curr)) {
        patterns.push({
          type: 'bullish_engulfing',
          direction: 'bullish',
          strength: currBody > prevBody * 1.5 ? 3 : currBody > prevBody * 1.2 ? 2 : 1,
          candleIndex: i,
        });
      }

      // Bearish Engulfing
      if (this.isBearishEngulfing(prev, curr)) {
        patterns.push({
          type: 'bearish_engulfing',
          direction: 'bearish',
          strength: currBody > prevBody * 1.5 ? 3 : currBody > prevBody * 1.2 ? 2 : 1,
          candleIndex: i,
        });
      }

      // Hammer (bullish reversal)
      if (this.isHammer(curr)) {
        patterns.push({
          type: 'hammer',
          direction: 'bullish',
          strength: 2,
          candleIndex: i,
        });
      }

      // Inverted Hammer
      if (this.isInvertedHammer(curr)) {
        patterns.push({
          type: 'inverted_hammer',
          direction: 'bullish',
          strength: 1,
          candleIndex: i,
        });
      }

      // Doji
      if (this.isDoji(curr)) {
        const dojiType = this.getDojyType(curr);
        patterns.push({
          type: dojiType,
          direction: dojiType === 'dragonfly_doji' ? 'bullish' :
                     dojiType === 'gravestone_doji' ? 'bearish' : 'bullish',
          strength: 1,
          candleIndex: i,
        });
      }

      // Morning Star (3 candle bullish reversal)
      if (this.isMorningStar(prev2, prev, curr)) {
        patterns.push({
          type: 'morning_star',
          direction: 'bullish',
          strength: 3,
          candleIndex: i,
        });
      }

      // Evening Star (3 candle bearish reversal)
      if (this.isEveningStar(prev2, prev, curr)) {
        patterns.push({
          type: 'evening_star',
          direction: 'bearish',
          strength: 3,
          candleIndex: i,
        });
      }

      // Bullish Harami
      if (this.isBullishHarami(prev, curr)) {
        patterns.push({
          type: 'bullish_harami',
          direction: 'bullish',
          strength: 2,
          candleIndex: i,
        });
      }

      // Bearish Harami
      if (this.isBearishHarami(prev, curr)) {
        patterns.push({
          type: 'bearish_harami',
          direction: 'bearish',
          strength: 2,
          candleIndex: i,
        });
      }
    }

    // Three White Soldiers / Three Black Crows (check last 3 candles)
    if (candles.length >= 3) {
      const last3 = candles.slice(-3);
      if (this.isThreeWhiteSoldiers(last3)) {
        patterns.push({
          type: 'three_white_soldiers',
          direction: 'bullish',
          strength: 3,
          candleIndex: candles.length - 1,
        });
      }
      if (this.isThreeBlackCrows(last3)) {
        patterns.push({
          type: 'three_black_crows',
          direction: 'bearish',
          strength: 3,
          candleIndex: candles.length - 1,
        });
      }
    }

    return patterns;
  }

  // Pattern detection helpers
  private isBullishEngulfing(prev: Candle, curr: Candle): boolean {
    return prev.close < prev.open && // prev is bearish
           curr.close > curr.open && // curr is bullish
           curr.open < prev.close && // curr opens below prev close
           curr.close > prev.open;   // curr closes above prev open
  }

  private isBearishEngulfing(prev: Candle, curr: Candle): boolean {
    return prev.close > prev.open && // prev is bullish
           curr.close < curr.open && // curr is bearish
           curr.open > prev.close && // curr opens above prev close
           curr.close < prev.open;   // curr closes below prev open
  }

  private isHammer(candle: Candle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);

    return body < range * 0.3 && // small body
           lowerWick > body * 2 && // long lower wick
           upperWick < body * 0.5; // small upper wick
  }

  private isInvertedHammer(candle: Candle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);

    return body < range * 0.3 && // small body
           upperWick > body * 2 && // long upper wick
           lowerWick < body * 0.5; // small lower wick
  }

  private isDoji(candle: Candle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return body < range * 0.1; // body is less than 10% of range
  }

  private getDojyType(candle: Candle): 'doji' | 'dragonfly_doji' | 'gravestone_doji' {
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);

    if (lowerWick > upperWick * 3) return 'dragonfly_doji';
    if (upperWick > lowerWick * 3) return 'gravestone_doji';
    return 'doji';
  }

  private isMorningStar(first: Candle, second: Candle, third: Candle): boolean {
    const firstBody = Math.abs(first.close - first.open);
    const secondBody = Math.abs(second.close - second.open);
    const thirdBody = Math.abs(third.close - third.open);

    return first.close < first.open && // first is bearish
           secondBody < firstBody * 0.3 && // second is small (star)
           third.close > third.open && // third is bullish
           third.close > (first.open + first.close) / 2; // third closes above first midpoint
  }

  private isEveningStar(first: Candle, second: Candle, third: Candle): boolean {
    const firstBody = Math.abs(first.close - first.open);
    const secondBody = Math.abs(second.close - second.open);
    const thirdBody = Math.abs(third.close - third.open);

    return first.close > first.open && // first is bullish
           secondBody < firstBody * 0.3 && // second is small (star)
           third.close < third.open && // third is bearish
           third.close < (first.open + first.close) / 2; // third closes below first midpoint
  }

  private isBullishHarami(prev: Candle, curr: Candle): boolean {
    return prev.close < prev.open && // prev is bearish
           curr.close > curr.open && // curr is bullish
           curr.open > prev.close && // curr contained within prev
           curr.close < prev.open;
  }

  private isBearishHarami(prev: Candle, curr: Candle): boolean {
    return prev.close > prev.open && // prev is bullish
           curr.close < curr.open && // curr is bearish
           curr.open < prev.close && // curr contained within prev
           curr.close > prev.open;
  }

  private isThreeWhiteSoldiers(candles: Candle[]): boolean {
    if (candles.length !== 3) return false;
    return candles.every((c, i) => {
      if (i === 0) return c.close > c.open;
      return c.close > c.open && // bullish
             c.open > candles[i - 1].open && // opens higher
             c.close > candles[i - 1].close; // closes higher
    });
  }

  private isThreeBlackCrows(candles: Candle[]): boolean {
    if (candles.length !== 3) return false;
    return candles.every((c, i) => {
      if (i === 0) return c.close < c.open;
      return c.close < c.open && // bearish
             c.open < candles[i - 1].open && // opens lower
             c.close < candles[i - 1].close; // closes lower
    });
  }

  // --------------------------------------------------------------------------
  // TECHNICAL INDICATORS
  // --------------------------------------------------------------------------

  calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } {
    const closes = candles.map(c => c.close);

    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macd = ema12 - ema26;

    // Signal line (9-period EMA of MACD)
    const macdValues = [];
    for (let i = 25; i < closes.length; i++) {
      const shortEma = this.calculateEMA(closes.slice(0, i + 1), 12);
      const longEma = this.calculateEMA(closes.slice(0, i + 1), 26);
      macdValues.push(shortEma - longEma);
    }

    const signal = macdValues.length >= 9 ? this.calculateEMA(macdValues, 9) : macd;
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  calculateTrend(candles: Candle[]): 'UP' | 'DOWN' | 'SIDEWAYS' {
    if (candles.length < 20) return 'SIDEWAYS';

    const sma20 = candles.slice(-20).reduce((a, c) => a + c.close, 0) / 20;
    const sma50 = candles.length >= 50
      ? candles.slice(-50).reduce((a, c) => a + c.close, 0) / 50
      : sma20;

    const currentPrice = candles[candles.length - 1].close;

    if (currentPrice > sma20 && sma20 > sma50) return 'UP';
    if (currentPrice < sma20 && sma20 < sma50) return 'DOWN';
    return 'SIDEWAYS';
  }

  calculateSupportResistance(candles: Candle[]): { support: number; resistance: number } {
    if (candles.length < 10) {
      const curr = candles[candles.length - 1];
      return { support: curr.low, resistance: curr.high };
    }

    const recent = candles.slice(-20);
    const lows = recent.map(c => c.low).sort((a, b) => a - b);
    const highs = recent.map(c => c.high).sort((a, b) => b - a);

    return {
      support: lows[Math.floor(lows.length * 0.1)],
      resistance: highs[Math.floor(highs.length * 0.1)],
    };
  }

  // --------------------------------------------------------------------------
  // ANALYZE SINGLE TIMEFRAME
  // --------------------------------------------------------------------------

  async analyzeTimeframe(symbol: string, timeframe: Timeframe): Promise<TimeframeAnalysis> {
    const candles = await this.fetchCandles(symbol, timeframe);

    if (candles.length < 30) {
      return {
        timeframe,
        direction: 'HOLD',
        confidence: 0,
        trend: 'SIDEWAYS',
        rsi: 50,
        macdSignal: 'neutral',
        patterns: [],
        support: 0,
        resistance: 0,
        currentPrice: candles[candles.length - 1]?.close || 0,
      };
    }

    const currentPrice = candles[candles.length - 1].close;
    const rsi = this.calculateRSI(candles);
    const macd = this.calculateMACD(candles);
    const trend = this.calculateTrend(candles);
    const { support, resistance } = this.calculateSupportResistance(candles);
    const patterns = this.detectPatterns(candles.slice(-10)); // Check last 10 candles

    // Determine direction based on indicators
    let bullishPoints = 0;
    let bearishPoints = 0;

    // RSI
    if (rsi < 30) bullishPoints += 2; // Oversold
    else if (rsi < 40) bullishPoints += 1;
    else if (rsi > 70) bearishPoints += 2; // Overbought
    else if (rsi > 60) bearishPoints += 1;

    // MACD
    if (macd.histogram > 0 && macd.macd > macd.signal) bullishPoints += 2;
    else if (macd.histogram < 0 && macd.macd < macd.signal) bearishPoints += 2;

    // Trend
    if (trend === 'UP') bullishPoints += 2;
    else if (trend === 'DOWN') bearishPoints += 2;

    // Patterns (recent only - last 3 candles)
    const recentPatterns = patterns.filter(p => p.candleIndex >= candles.length - 3);
    for (const pattern of recentPatterns) {
      const weight = PATTERN_WEIGHTS[pattern.type] * pattern.strength;
      if (pattern.direction === 'bullish') bullishPoints += weight * 3;
      else bearishPoints += weight * 3;
    }

    // Price position relative to S/R
    const pricePosition = (currentPrice - support) / (resistance - support);
    if (pricePosition < 0.3) bullishPoints += 1; // Near support
    if (pricePosition > 0.7) bearishPoints += 1; // Near resistance

    // Calculate direction and confidence
    const totalPoints = bullishPoints + bearishPoints;
    let direction: SignalDirection = 'HOLD';
    let confidence = 0;

    if (totalPoints > 0) {
      const bullishRatio = bullishPoints / totalPoints;
      const bearishRatio = bearishPoints / totalPoints;

      if (bullishRatio > 0.6) {
        direction = 'LONG';
        confidence = Math.min(100, bullishRatio * 100);
      } else if (bearishRatio > 0.6) {
        direction = 'SHORT';
        confidence = Math.min(100, bearishRatio * 100);
      } else {
        direction = 'HOLD';
        confidence = 50;
      }
    }

    return {
      timeframe,
      direction,
      confidence,
      trend,
      rsi,
      macdSignal: macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral',
      patterns: recentPatterns,
      support,
      resistance,
      currentPrice,
    };
  }

  // --------------------------------------------------------------------------
  // GENERATE UNIFIED SIGNAL (MULTI-TIMEFRAME)
  // --------------------------------------------------------------------------

  async generateSignal(symbol: string, timeframes: Timeframe[] = ['1m', '5m', '15m', '1h']): Promise<UnifiedSignal> {
    logger.info('Generating unified signal', { symbol, timeframes });

    // Analyze all timeframes in parallel
    const analyses = await Promise.all(
      timeframes.map(tf => this.analyzeTimeframe(symbol, tf))
    );

    const currentPrice = analyses[0]?.currentPrice || 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const allPatterns: Pattern[] = [];

    // Collect all patterns
    for (const analysis of analyses) {
      allPatterns.push(...analysis.patterns);
    }

    // Calculate trend alignment
    const trendCounts = { UP: 0, DOWN: 0, SIDEWAYS: 0 };
    for (const analysis of analyses) {
      trendCounts[analysis.trend]++;
    }
    const maxTrendCount = Math.max(...Object.values(trendCounts));
    const trendAlignment = (maxTrendCount / analyses.length) * 100;

    // Calculate weighted direction
    let weightedBullish = 0;
    let weightedBearish = 0;
    let totalWeight = 0;

    for (const analysis of analyses) {
      const weight = TIMEFRAME_WEIGHTS[analysis.timeframe];
      const trendWeight = weight.trend;
      const entryWeight = weight.entry;
      const combinedWeight = (trendWeight + entryWeight) / 2;

      totalWeight += combinedWeight;

      if (analysis.direction === 'LONG') {
        weightedBullish += combinedWeight * (analysis.confidence / 100);
      } else if (analysis.direction === 'SHORT') {
        weightedBearish += combinedWeight * (analysis.confidence / 100);
      }

      // Add reasons
      if (analysis.confidence > 60) {
        reasons.push(`${analysis.timeframe}: ${analysis.direction} (${analysis.confidence.toFixed(0)}% conf, RSI: ${analysis.rsi.toFixed(0)})`);
      }
    }

    // Normalize weights
    const bullishScore = totalWeight > 0 ? (weightedBullish / totalWeight) * 100 : 0;
    const bearishScore = totalWeight > 0 ? (weightedBearish / totalWeight) * 100 : 0;

    // Pattern strength bonus
    let patternStrength = 0;
    const recentPatterns = allPatterns.filter(p => p.candleIndex >= 0);
    for (const pattern of recentPatterns) {
      patternStrength += PATTERN_WEIGHTS[pattern.type] * pattern.strength * 10;
    }
    patternStrength = Math.min(100, patternStrength);

    // Determine final direction
    let direction: SignalDirection = 'HOLD';
    let confidence = 0;

    const scoreDiff = Math.abs(bullishScore - bearishScore);

    if (bullishScore > bearishScore && bullishScore > 40) {
      direction = 'LONG';
      confidence = Math.min(100, bullishScore + (trendAlignment > 75 ? 10 : 0) + (patternStrength > 50 ? 10 : 0));

      // Check for bullish patterns
      const bullishPatterns = recentPatterns.filter(p => p.direction === 'bullish');
      if (bullishPatterns.length > 0) {
        reasons.push(`Bullish patterns: ${bullishPatterns.map(p => p.type.replace('_', ' ')).join(', ')}`);
      }
    } else if (bearishScore > bullishScore && bearishScore > 40) {
      direction = 'SHORT';
      confidence = Math.min(100, bearishScore + (trendAlignment > 75 ? 10 : 0) + (patternStrength > 50 ? 10 : 0));

      // Check for bearish patterns
      const bearishPatterns = recentPatterns.filter(p => p.direction === 'bearish');
      if (bearishPatterns.length > 0) {
        reasons.push(`Bearish patterns: ${bearishPatterns.map(p => p.type.replace('_', ' ')).join(', ')}`);
      }
    } else {
      direction = 'HOLD';
      confidence = 50;
      warnings.push('Mixed signals across timeframes');
    }

    // Add warnings for conflicting timeframes
    const tfDirections = analyses.map(a => a.direction);
    const hasLong = tfDirections.includes('LONG');
    const hasShort = tfDirections.includes('SHORT');
    if (hasLong && hasShort) {
      warnings.push('Conflicting signals: Some timeframes show LONG, others SHORT');
      confidence = Math.max(25, confidence - 20); // Reduce confidence
    }

    // Calculate entry/exit levels
    const avgSupport = analyses.reduce((a, b) => a + b.support, 0) / analyses.length;
    const avgResistance = analyses.reduce((a, b) => a + b.resistance, 0) / analyses.length;

    let suggestedEntry = currentPrice;
    let suggestedTP: number;
    let suggestedSL: number;

    if (direction === 'LONG') {
      suggestedEntry = currentPrice; // Market order at current price
      suggestedTP = avgResistance; // Take profit at resistance
      suggestedSL = avgSupport; // Stop loss at support
    } else if (direction === 'SHORT') {
      suggestedEntry = currentPrice;
      suggestedTP = avgSupport;
      suggestedSL = avgResistance;
    } else {
      suggestedTP = avgResistance;
      suggestedSL = avgSupport;
    }

    const signal: UnifiedSignal = {
      symbol,
      direction,
      confidence,
      timeframes: analyses,
      trendAlignment,
      patternStrength,
      patterns: recentPatterns,
      suggestedEntry,
      suggestedTP,
      suggestedSL,
      reasons,
      warnings,
      timestamp: Date.now(),
    };

    logger.info('Unified signal generated', {
      symbol,
      direction,
      confidence: confidence.toFixed(0) + '%',
      trendAlignment: trendAlignment.toFixed(0) + '%',
      patternStrength: patternStrength.toFixed(0) + '%',
      patterns: recentPatterns.length,
      reasons: reasons.length,
      warnings: warnings.length,
    });

    return signal;
  }
}

// Export singleton instance
export const signalEngine = new SignalEngine();
