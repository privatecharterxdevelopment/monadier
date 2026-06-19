/**
 * Aggressive bot mode — 1m/5m scalp only.
 * Reads last 6 × 1m candles → bias for next 3; 5m trend must confirm (no chop).
 */
import { signalEngine, type Candle } from './signalEngine';
import { logger } from '../utils/logger';

export type AggressiveScalpAnalysis = {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  reason: string;
  trend1m: 'UP' | 'DOWN';
  trend5m: 'UP' | 'DOWN';
  predictedNext3: 'UP' | 'DOWN';
  greenCount: number;
  momentumPct: number;
};

type Trend = 'UP' | 'DOWN' | 'FLAT';

function trendFromCloses(candles: Candle[], minMovePct: number): Trend {
  if (candles.length < 2) return 'FLAT';
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (first <= 0) return 'FLAT';
  const pct = ((last - first) / first) * 100;
  if (pct >= minMovePct) return 'UP';
  if (pct <= -minMovePct) return 'DOWN';
  return 'FLAT';
}

function wickRejectsDirection(c: Candle, direction: 'LONG' | 'SHORT'): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range <= 0 || body < 1e-12) return false;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  if (direction === 'LONG') return upperWick > body * 1.4;
  return lowerWick > body * 1.4;
}

function analyzeSixOneMinute(candles: Candle[]): Omit<
  AggressiveScalpAnalysis,
  'trend5m' | 'reason'
> & { reasonParts: string[] } | null {
  if (candles.length < 6) return null;
  const last6 = candles.slice(-6);
  const greenCount = last6.filter((c) => c.close > c.open).length;
  const redCount = 6 - greenCount;
  let risingCloses = 0;
  for (let i = 1; i < last6.length; i++) {
    if (last6[i].close > last6[i - 1].close) risingCloses++;
  }
  const momentumPct =
    last6[0].close > 0
      ? ((last6[5].close - last6[0].close) / last6[0].close) * 100
      : 0;

  const lows = last6.map((c) => c.low);
  const highs = last6.map((c) => c.high);
  const higherLows = lows.slice(1).filter((l, i) => l >= lows[i] - lows[i] * 0.0001).length >= 4;
  const lowerHighs = highs.slice(1).filter((h, i) => h <= highs[i] + highs[i] * 0.0001).length >= 4;

  const last = last6[5];
  const parts: string[] = [];
  let direction: 'LONG' | 'SHORT' | null = null;
  let confidence = 0;
  let predictedNext3: 'UP' | 'DOWN' = 'UP';

  if (
    greenCount >= 4 &&
    risingCloses >= 3 &&
    momentumPct >= 0.04 &&
    (higherLows || greenCount >= 5)
  ) {
    direction = 'LONG';
    predictedNext3 = 'UP';
    confidence = 58 + greenCount * 4 + risingCloses * 2 + (higherLows ? 10 : 0);
    parts.push(`${greenCount}/6 green`);
    parts.push(`${risingCloses}/5 higher closes`);
    parts.push(`mom +${momentumPct.toFixed(2)}%`);
    if (wickRejectsDirection(last, 'LONG')) confidence -= 12;
  } else if (
    redCount >= 4 &&
    risingCloses <= 2 &&
    momentumPct <= -0.04 &&
    (lowerHighs || redCount >= 5)
  ) {
    direction = 'SHORT';
    predictedNext3 = 'DOWN';
    confidence = 58 + redCount * 4 + (4 - risingCloses) * 2 + (lowerHighs ? 10 : 0);
    parts.push(`${redCount}/6 red`);
    parts.push(`${4 - risingCloses}/5 lower closes`);
    parts.push(`mom ${momentumPct.toFixed(2)}%`);
    if (wickRejectsDirection(last, 'SHORT')) confidence -= 12;
  }

  if (!direction || confidence < 64) return null;

  return {
    direction,
    confidence: Math.min(93, confidence),
    trend1m: predictedNext3,
    predictedNext3,
    greenCount,
    momentumPct,
    reasonParts: parts,
  };
}

export async function analyzeAggressiveScalpBySymbol(
  symbol: string
): Promise<AggressiveScalpAnalysis | null> {
  try {
    const [c1m, c5m] = await Promise.all([
      signalEngine.fetchCandles(symbol, '1m', 14),
      signalEngine.fetchCandles(symbol, '5m', 10),
    ]);

    if (c1m.length < 8 || c5m.length < 4) return null;

    const scalp = analyzeSixOneMinute(c1m);
    if (!scalp) return null;

    const trend5m = trendFromCloses(c5m.slice(-3), 0.06);
    if (trend5m === 'FLAT') return null;

    if (scalp.direction === 'LONG' && trend5m === 'DOWN') return null;
    if (scalp.direction === 'SHORT' && trend5m === 'UP') return null;

    const confidence = Math.min(94, scalp.confidence + 5);
    const reason = [
      `6×1m→3: ${scalp.reasonParts.join(', ')}`,
      `5m ${trend5m}`,
      `next3 ${scalp.predictedNext3}`,
    ].join(' · ');

    return {
      direction: scalp.direction,
      confidence,
      reason,
      trend1m: scalp.trend1m,
      trend5m,
      predictedNext3: scalp.predictedNext3,
      greenCount: scalp.greenCount,
      momentumPct: scalp.momentumPct,
    };
  } catch (err: unknown) {
    logger.debug('Aggressive scalp analysis failed', {
      symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
