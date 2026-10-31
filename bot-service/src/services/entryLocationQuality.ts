/**
 * Hard ENTRY LOCATION layer — separate from directional quality.
 *
 * Direction (MTF, BTC lead, confidence) may be correct while CURRENT PRICE is
 * a terrible place to enter. This module only answers:
 *   is this LONG/SHORT being chased into an extreme / S-R wall / completed impulse?
 *
 * Reuses analyzeSrZones, ATR, and wick helpers. Does not flip direction.
 */
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { analyzeSrZones, type SrZoneAnalysis } from './entryLocationGate';
import { calculateATR } from './dynamicTrailingStop';
import {
  isBearishLongUpperWick,
  isBullishLongLowerWick,
} from './candleWickGate';

export type LocationDecision = 'ALLOW' | 'BLOCK';

export type EntryLocationQualityRecord = {
  coin: string;
  side: 'LONG' | 'SHORT';
  price: number;
  rangePosition1h: number;
  rangePosition4h: number;
  distanceResistanceATR: number | null;
  distanceSupportATR: number | null;
  distanceSwingHighATR: number | null;
  distanceSwingLowATR: number | null;
  impulse15mATR: number | null;
  impulse5mATR: number | null;
  consecutiveDirectionCandles: number;
  atr1h: number;
  nearResistance: boolean;
  nearSupport: boolean;
  confirmedBreakoutUp: boolean;
  confirmedBreakdown: boolean;
  upperWickRejection: boolean;
  lowerWickRejection: boolean;
  chasingCompletedMove: boolean;
  upsideRoomATR: number | null;
  downsideRoomATR: number | null;
  deterministicLocationDecision: LocationDecision;
  blockedBy: string[];
  reason: string;
};

function closed(candles: Candle[]): Candle[] {
  if (candles.length <= 1) return candles;
  return candles.slice(0, -1);
}

function lastClosed(candles: Candle[]): Candle | null {
  const c = closed(candles);
  return c.length > 0 ? c[c.length - 1]! : null;
}

function rangePosition(candles: Candle[]): number {
  const win = closed(candles);
  if (win.length < 4) return 0.5;
  const price = win[win.length - 1]!.close;
  const hi = Math.max(...win.map((c) => c.high));
  const lo = Math.min(...win.map((c) => c.low));
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(price)) return 0.5;
  return (price - lo) / span;
}

function netMove(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const start = candles[0]!.close;
  const end = candles[candles.length - 1]!.close;
  if (!(start > 0)) return 0;
  return end - start;
}

function consecutiveDir(candles: Candle[], side: 'LONG' | 'SHORT'): number {
  const win = closed(candles);
  let n = 0;
  for (let i = win.length - 1; i >= 0; i -= 1) {
    const c = win[i]!;
    const bull = c.close > c.open;
    if (side === 'LONG' ? bull : !bull) n += 1;
    else break;
  }
  return n;
}

function isSwingHigh(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const h = candles[i]!.high;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j]!.high > h) return false;
  }
  return true;
}

function isSwingLow(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const l = candles[i]!.low;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j]!.low < l) return false;
  }
  return true;
}

function lastSwing(
  candles: Candle[],
  side: 'high' | 'low'
): number | null {
  const win = closed(candles);
  for (let i = win.length - 3; i >= 2; i -= 1) {
    if (side === 'high' && isSwingHigh(win, i)) return win[i]!.high;
    if (side === 'low' && isSwingLow(win, i)) return win[i]!.low;
  }
  return null;
}

function atrDist(price: number, level: number | null, atr: number): number | null {
  if (level == null || !(atr > 0) || !(price > 0)) return null;
  return Math.abs(price - level) / atr;
}

function recentWickRejection(
  candles: Candle[],
  side: 'LONG' | 'SHORT'
): boolean {
  const win = closed(candles).slice(-3);
  if (side === 'LONG') return win.some((c) => isBearishLongUpperWick(c));
  return win.some((c) => isBullishLongLowerWick(c));
}

function failClosed(
  coin: string,
  side: 'LONG' | 'SHORT',
  price: number,
  reason: string,
  extra?: Partial<EntryLocationQualityRecord>
): EntryLocationQualityRecord {
  return {
    coin,
    side,
    price,
    rangePosition1h: extra?.rangePosition1h ?? 0.5,
    rangePosition4h: extra?.rangePosition4h ?? 0.5,
    distanceResistanceATR: extra?.distanceResistanceATR ?? null,
    distanceSupportATR: extra?.distanceSupportATR ?? null,
    distanceSwingHighATR: extra?.distanceSwingHighATR ?? null,
    distanceSwingLowATR: extra?.distanceSwingLowATR ?? null,
    impulse15mATR: extra?.impulse15mATR ?? null,
    impulse5mATR: extra?.impulse5mATR ?? null,
    consecutiveDirectionCandles: extra?.consecutiveDirectionCandles ?? 0,
    atr1h: extra?.atr1h ?? 0,
    nearResistance: extra?.nearResistance ?? false,
    nearSupport: extra?.nearSupport ?? false,
    confirmedBreakoutUp: extra?.confirmedBreakoutUp ?? false,
    confirmedBreakdown: extra?.confirmedBreakdown ?? false,
    upperWickRejection: extra?.upperWickRejection ?? false,
    lowerWickRejection: extra?.lowerWickRejection ?? false,
    chasingCompletedMove: extra?.chasingCompletedMove ?? false,
    upsideRoomATR: extra?.upsideRoomATR ?? null,
    downsideRoomATR: extra?.downsideRoomATR ?? null,
    deterministicLocationDecision: 'BLOCK',
    blockedBy: extra?.blockedBy ?? ['INSUFFICIENT_DATA'],
    reason,
  };
}

/**
 * Volatility-adjusted extreme location. Confirmed breakout/breakdown may still
 * ALLOW even when range position is high/low — chasing an unconfirmed tag does not.
 */
export function scoreEntryLocationQuality(opts: {
  coin: string;
  side: 'LONG' | 'SHORT';
  price: number;
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  sr: SrZoneAnalysis;
}): EntryLocationQualityRecord {
  const { coin, side, price, candles5m, candles15m, candles1h, candles4h, sr } = opts;
  const atr1h = calculateATR(candles1h, 14);
  const rangePosition1h = rangePosition(candles1h.slice(-26));
  const rangePosition4h = rangePosition(candles4h.slice(-26));
  const closed15 = closed(candles15m).slice(-5);
  const closed5 = closed(candles5m).slice(-6);
  const impulse15mATR = atr1h > 0 ? netMove(closed15) / atr1h : null;
  const impulse5mATR = atr1h > 0 ? netMove(closed5) / atr1h : null;
  const consecutiveDirectionCandles = consecutiveDir(candles15m, side);
  const swingHigh = lastSwing(candles1h, 'high');
  const swingLow = lastSwing(candles1h, 'low');
  const distanceSwingHighATR = atrDist(price, swingHigh, atr1h);
  const distanceSwingLowATR = atrDist(price, swingLow, atr1h);
  const distanceResistanceATR = atrDist(price, sr.resistance, atr1h);
  const distanceSupportATR = atrDist(price, sr.support, atr1h);
  const upsideRoomATR = distanceResistanceATR;
  const downsideRoomATR = distanceSupportATR;
  const upperWickRejection = recentWickRejection(candles15m, 'LONG');
  const lowerWickRejection = recentWickRejection(candles15m, 'SHORT');

  const blockedBy: string[] = [];
  const notes: string[] = [];

  const longBreakoutOk = side === 'LONG' && sr.confirmedBreakoutUp;
  const shortBreakdownOk = side === 'SHORT' && sr.confirmedBreakdown;

  if (side === 'LONG' && !longBreakoutOk) {
    const extendedUp =
      (impulse15mATR != null && impulse15mATR >= 1.15) || consecutiveDirectionCandles >= 4;
    const chasingCompletedMove =
      rangePosition1h >= 0.8 && extendedUp && !sr.confirmedBreakoutUp;
    if (chasingCompletedMove) {
      blockedBy.push('CHASING_COMPLETED_MOVE');
      notes.push(
        `1h range ${(rangePosition1h * 100).toFixed(0)}% after ${consecutiveDirectionCandles} greens / 15m impulse ${impulse15mATR?.toFixed(2) ?? '?'}×ATR`
      );
    }
    if (rangePosition1h >= 0.85) {
      blockedBy.push('EXTREME_LOCATION');
      notes.push(`1h range pos ${rangePosition1h.toFixed(2)} ≥ 0.85`);
    } else if (rangePosition1h >= 0.8 && extendedUp) {
      blockedBy.push('EXTREME_LOCATION');
      notes.push(`1h range pos ${rangePosition1h.toFixed(2)} ≥ 0.80 with extension`);
    }
    if (rangePosition4h >= 0.88 && rangePosition1h >= 0.72) {
      blockedBy.push('HTF_RANGE_EXTREME');
      notes.push(`4h range pos ${rangePosition4h.toFixed(2)} with 1h still high`);
    }
    if (sr.nearResistance) {
      blockedBy.push('INTO_RESISTANCE');
      notes.push('at/near resistance without confirmed close-hold breakout');
    }
    if (
      upsideRoomATR != null &&
      downsideRoomATR != null &&
      upsideRoomATR <= 0.4 &&
      downsideRoomATR >= 1.6
    ) {
      blockedBy.push('POOR_UPSIDE_ROOM');
      notes.push(`upside ${upsideRoomATR.toFixed(2)}×ATR vs downside ${downsideRoomATR.toFixed(2)}×ATR`);
    }
    if (upperWickRejection && rangePosition1h >= 0.62) {
      blockedBy.push('UPPER_WICK_REJECTION');
      notes.push('15m upper-wick rejection in upper range');
    }
    if (
      distanceSwingHighATR != null &&
      distanceSwingHighATR <= 0.35 &&
      rangePosition1h >= 0.7
    ) {
      blockedBy.push('AT_SWING_HIGH');
      notes.push(`within ${distanceSwingHighATR.toFixed(2)}×ATR of 1h swing high`);
    }
  }

  if (side === 'SHORT' && !shortBreakdownOk) {
    const extendedDown =
      (impulse15mATR != null && impulse15mATR <= -1.15) || consecutiveDirectionCandles >= 4;
    const chasingCompletedMove =
      rangePosition1h <= 0.2 && extendedDown && !sr.confirmedBreakdown;
    if (chasingCompletedMove) {
      blockedBy.push('CHASING_COMPLETED_MOVE');
      notes.push(
        `1h range ${(rangePosition1h * 100).toFixed(0)}% after ${consecutiveDirectionCandles} reds / 15m impulse ${impulse15mATR?.toFixed(2) ?? '?'}×ATR`
      );
    }
    if (rangePosition1h <= 0.15) {
      blockedBy.push('EXTREME_LOCATION');
      notes.push(`1h range pos ${rangePosition1h.toFixed(2)} ≤ 0.15`);
    } else if (rangePosition1h <= 0.2 && extendedDown) {
      blockedBy.push('EXTREME_LOCATION');
      notes.push(`1h range pos ${rangePosition1h.toFixed(2)} ≤ 0.20 with extension`);
    }
    if (rangePosition4h <= 0.12 && rangePosition1h <= 0.28) {
      blockedBy.push('HTF_RANGE_EXTREME');
      notes.push(`4h range pos ${rangePosition4h.toFixed(2)} with 1h still low`);
    }
    if (sr.nearSupport) {
      blockedBy.push('INTO_SUPPORT');
      notes.push('at/near support without confirmed close-hold breakdown');
    }
    if (
      downsideRoomATR != null &&
      upsideRoomATR != null &&
      downsideRoomATR <= 0.4 &&
      upsideRoomATR >= 1.6
    ) {
      blockedBy.push('POOR_DOWNSIDE_ROOM');
      notes.push(`downside ${downsideRoomATR.toFixed(2)}×ATR vs upside ${upsideRoomATR.toFixed(2)}×ATR`);
    }
    if (lowerWickRejection && rangePosition1h <= 0.38) {
      blockedBy.push('LOWER_WICK_REJECTION');
      notes.push('15m lower-wick rejection in lower range');
    }
    if (
      distanceSwingLowATR != null &&
      distanceSwingLowATR <= 0.35 &&
      rangePosition1h <= 0.3
    ) {
      blockedBy.push('AT_SWING_LOW');
      notes.push(`within ${distanceSwingLowATR.toFixed(2)}×ATR of 1h swing low`);
    }
  }

  const chasingCompletedMove = blockedBy.includes('CHASING_COMPLETED_MOVE');
  const decision: LocationDecision = blockedBy.length > 0 ? 'BLOCK' : 'ALLOW';
  const reason =
    decision === 'BLOCK'
      ? `${side} blocked — ${notes.join('; ') || blockedBy.join(',')}`
      : `${side} location OK — 1h ${(rangePosition1h * 100).toFixed(0)}% / 4h ${(rangePosition4h * 100).toFixed(0)}%` +
        (longBreakoutOk ? ' (confirmed breakout hold)' : '') +
        (shortBreakdownOk ? ' (confirmed breakdown hold)' : '');

  return {
    coin,
    side,
    price,
    rangePosition1h,
    rangePosition4h,
    distanceResistanceATR,
    distanceSupportATR,
    distanceSwingHighATR,
    distanceSwingLowATR,
    impulse15mATR,
    impulse5mATR,
    consecutiveDirectionCandles,
    atr1h,
    nearResistance: sr.nearResistance,
    nearSupport: sr.nearSupport,
    confirmedBreakoutUp: sr.confirmedBreakoutUp,
    confirmedBreakdown: sr.confirmedBreakdown,
    upperWickRejection,
    lowerWickRejection,
    chasingCompletedMove,
    upsideRoomATR,
    downsideRoomATR,
    deterministicLocationDecision: decision,
    blockedBy,
    reason,
  };
}

export async function evaluateEntryLocationQuality(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  markPx?: number;
}): Promise<EntryLocationQualityRecord> {
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);
  try {
    const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 80),
      signalEngine.fetchCandles(symbol, '15m', 64),
      signalEngine.fetchCandles(symbol, '1h', 72),
      signalEngine.fetchCandles(symbol, '4h', 48),
    ]);
    if (candles1h.length < 16 || candles4h.length < 12 || candles15m.length < 12) {
      return failClosed(
        coin,
        opts.direction,
        opts.markPx ?? 0,
        'entry location blocked — insufficient 15m/1h/4h history'
      );
    }
    const sr = analyzeSrZones(candles1h, candles15m);
    const price = opts.markPx && opts.markPx > 0 ? opts.markPx : sr.price;
    return scoreEntryLocationQuality({
      coin,
      side: opts.direction,
      price,
      candles5m,
      candles15m,
      candles1h,
      candles4h,
      sr,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return failClosed(
      coin,
      opts.direction,
      opts.markPx ?? 0,
      `entry location blocked — candle fetch failed (${msg.slice(0, 80)})`
    );
  }
}

export type VisionLocationFields = {
  decision: 'ALLOW' | 'BLOCK' | null;
  location: string | null;
  extension: string | null;
  nearest_structure: string | null;
  confidence: number | null;
  reason: string | null;
};

export function logEntryLocationRecord(opts: {
  record: EntryLocationQualityRecord;
  vision?: VisionLocationFields | null;
  finalDecision: 'OPEN' | 'NO_OPEN';
  extraBlockedBy?: string[];
}): void {
  const blockedBy = [
    ...opts.record.blockedBy,
    ...(opts.extraBlockedBy ?? []),
  ];
  const payload = {
    coin: opts.record.coin,
    side: opts.record.side,
    price: opts.record.price,
    rangePosition1h: Number(opts.record.rangePosition1h.toFixed(4)),
    rangePosition4h: Number(opts.record.rangePosition4h.toFixed(4)),
    distanceResistanceATR: opts.record.distanceResistanceATR,
    distanceSupportATR: opts.record.distanceSupportATR,
    impulse15mATR: opts.record.impulse15mATR,
    consecutiveDirectionCandles: opts.record.consecutiveDirectionCandles,
    deterministicLocationDecision: opts.record.deterministicLocationDecision,
    vision: opts.vision ?? null,
    finalDecision: opts.finalDecision,
    blockedBy,
    reason: opts.record.reason,
  };
  logger.info('entry_location_record', payload);
}
