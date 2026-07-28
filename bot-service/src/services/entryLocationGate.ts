/**
 * Entry location gate — resistance/support awareness before HL bot opens.
 *
 * Blocks LONG into a ceiling that already rejected price multiple times.
 * Allows LONG only on confirmed breakout above resistance or pullback toward support.
 * In-house resistance/support *bands*: opens inside a zone require reversal/breakout first.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import {
  computeResistanceZone,
  computeSupportZone,
  evaluateZoneReversalGate,
  type PriceZone,
} from './resistanceZone';

export type SrZoneAnalysis = {
  support: number;
  resistance: number;
  price: number;
  pricePosition: number;
  resistanceTouches: number;
  resistanceRejections: number;
  supportTouches: number;
  supportRejections: number;
  confirmedBreakoutUp: boolean;
  confirmedBreakdown: boolean;
  nearResistance: boolean;
  nearSupport: boolean;
  resistanceZone?: PriceZone | null;
  supportZone?: PriceZone | null;
};

export type EntryLocationResult = {
  ok: boolean;
  reason: string;
  analysis: SrZoneAnalysis;
  /** Zone rejection/bounce says take the other side. */
  flipTo?: 'LONG' | 'SHORT';
};

function pricePosition(price: number, support: number, resistance: number): number {
  const range = resistance - support;
  if (!Number.isFinite(range) || range <= 0) return 0.5;
  return (price - support) / range;
}

function isSwingHigh(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const h = candles[i].high;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j].high > h) return false;
  }
  return true;
}

function isSwingLow(candles: Candle[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const l = candles[i].low;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j].low < l) return false;
  }
  return true;
}

/** Cluster swing highs into a single resistance level (most-tested wins). */
function resolveResistanceLevel(candles: Candle[], clusterPct: number): number {
  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingHigh(candles, i)) swings.push(candles[i].high);
  }
  if (swings.length === 0) {
    return Math.max(...candles.slice(-20).map((c) => c.high));
  }

  const sorted = [...swings].sort((a, b) => b - a);
  let bestLevel = sorted[0];
  let bestScore = 0;

  for (const seed of sorted) {
    const cluster = swings.filter((h) => Math.abs(h - seed) / seed <= clusterPct);
    const score = cluster.length;
    const level = cluster.reduce((s, h) => s + h, 0) / cluster.length;
    if (score > bestScore) {
      bestScore = score;
      bestLevel = level;
    }
  }
  return bestLevel;
}

function resolveSupportLevel(candles: Candle[], clusterPct: number): number {
  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingLow(candles, i)) swings.push(candles[i].low);
  }
  if (swings.length === 0) {
    return Math.min(...candles.slice(-20).map((c) => c.low));
  }

  const sorted = [...swings].sort((a, b) => a - b);
  let bestLevel = sorted[0];
  let bestScore = 0;

  for (const seed of sorted) {
    const cluster = swings.filter((l) => Math.abs(l - seed) / seed <= clusterPct);
    const score = cluster.length;
    const level = cluster.reduce((s, l) => s + l, 0) / cluster.length;
    if (score > bestScore) {
      bestScore = score;
      bestLevel = level;
    }
  }
  return bestLevel;
}

function countLevelTests(
  candles: Candle[],
  level: number,
  side: 'resistance' | 'support',
  touchTol: number
): { touches: number; rejections: number } {
  let touches = 0;
  let rejections = 0;

  for (const c of candles) {
    if (side === 'resistance') {
      const tested = c.high >= level * (1 - touchTol);
      if (!tested) continue;
      touches += 1;
      if (c.close < level * (1 - touchTol * 0.35)) rejections += 1;
    } else {
      const tested = c.low <= level * (1 + touchTol);
      if (!tested) continue;
      touches += 1;
      if (c.close > level * (1 + touchTol * 0.35)) rejections += 1;
    }
  }

  return { touches, rejections };
}

function confirmedBreakoutUp(candles: Candle[], level: number, buffer: number, bars: number): boolean {
  const recent = candles.slice(-bars);
  if (recent.length < bars) return false;
  return recent.every((c) => c.close > level * (1 + buffer));
}

function confirmedBreakdown(candles: Candle[], level: number, buffer: number, bars: number): boolean {
  const recent = candles.slice(-bars);
  if (recent.length < bars) return false;
  return recent.every((c) => c.close < level * (1 - buffer));
}

export function analyzeSrZones(candlesPrimary: Candle[], candlesSecondary: Candle[]): SrZoneAnalysis {
  const cfg = config.hyperliquid.entryLocation;
  const price = candlesPrimary[candlesPrimary.length - 1]?.close ?? 0;

  const zoneOpts = {
    swingClusterPct: cfg.swingClusterPct,
    touchTolerancePct: cfg.touchTolerancePct,
  };
  // Primary: price-relative swing-cluster bands (same algo as chart).
  // Fallback scalars only if a side has no active zone near price.
  const resistanceZone = computeResistanceZone(candlesPrimary, zoneOpts);
  const supportZone = computeSupportZone(candlesPrimary, zoneOpts);

  let resistance = resistanceZone?.mid ?? resolveResistanceLevel(candlesPrimary, cfg.swingClusterPct);
  let support = supportZone?.mid ?? resolveSupportLevel(candlesPrimary, cfg.swingClusterPct);

  // Prefer nearer secondary-TF zone on the correct side of price (never Himalaya shelves).
  if (candlesSecondary.length >= 20) {
    const resistance1h = computeResistanceZone(candlesSecondary, zoneOpts);
    const support1h = computeSupportZone(candlesSecondary, zoneOpts);
    if (resistance1h && resistance1h.mid >= price * 0.998) {
      resistance =
        resistanceZone != null
          ? Math.min(resistance, resistance1h.mid)
          : resistance1h.mid;
    }
    if (support1h && support1h.mid <= price * 1.002) {
      support =
        supportZone != null ? Math.max(support, support1h.mid) : support1h.mid;
    }
  }

  // Hard geometry: resistance must sit at/above price, support at/below.
  if (resistance < price) {
    resistance =
      resistanceZone?.mid ??
      Math.max(...candlesPrimary.slice(-24).map((c) => c.high), price);
  }
  if (support > price) {
    support =
      supportZone?.mid ??
      Math.min(...candlesPrimary.slice(-24).map((c) => c.low), price);
  }

  const resTests = resistanceZone
    ? { touches: resistanceZone.touches, rejections: resistanceZone.rejections }
    : countLevelTests(candlesPrimary, resistance, 'resistance', cfg.touchTolerancePct);
  const supTests = supportZone
    ? { touches: supportZone.touches, rejections: supportZone.rejections }
    : countLevelTests(candlesPrimary, support, 'support', cfg.touchTolerancePct);

  const pos = pricePosition(price, support, resistance);
  const distToResPct = resistance > 0 ? (resistance - price) / resistance : 1;
  const distToSupPct = support > 0 ? (price - support) / support : 1;

  const nearResistance =
    (resistanceZone != null &&
      price >= resistanceZone.zoneLow * (1 - cfg.nearLevelPct) &&
      price <= resistanceZone.zoneHigh * (1 + cfg.nearLevelPct)) ||
    pos >= cfg.rangeTopBlock ||
    distToResPct <= cfg.nearLevelPct ||
    price >= resistance * (1 - cfg.nearLevelPct);

  const nearSupport =
    (supportZone != null &&
      price <= supportZone.zoneHigh * (1 + cfg.nearLevelPct) &&
      price >= supportZone.zoneLow * (1 - cfg.nearLevelPct)) ||
    pos <= cfg.rangeBottomBlock ||
    distToSupPct <= cfg.nearLevelPct ||
    price <= support * (1 + cfg.nearLevelPct);

  return {
    support,
    resistance,
    price,
    pricePosition: pos,
    resistanceTouches: resTests.touches,
    resistanceRejections: resTests.rejections,
    supportTouches: supTests.touches,
    supportRejections: supTests.rejections,
    confirmedBreakoutUp: confirmedBreakoutUp(
      candlesPrimary,
      resistance,
      cfg.breakoutBufferPct,
      cfg.breakoutConfirmBars
    ),
    confirmedBreakdown: confirmedBreakdown(
      candlesPrimary,
      support,
      cfg.breakoutBufferPct,
      cfg.breakoutConfirmBars
    ),
    nearResistance,
    nearSupport,
    resistanceZone,
    supportZone,
  };
}

function fmtLevel(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export function evaluateEntryLocation(
  direction: 'LONG' | 'SHORT',
  analysis: SrZoneAnalysis
): EntryLocationResult {
  const cfg = config.hyperliquid.entryLocation;

  if (direction === 'LONG') {
    if (analysis.confirmedBreakoutUp) {
      return {
        ok: true,
        analysis,
        reason: `Breakout above resistance ${fmtLevel(analysis.resistance)} confirmed`,
      };
    }

    if (analysis.pricePosition <= cfg.pullbackMaxPosition) {
      return {
        ok: true,
        analysis,
        reason: `Pullback entry (${(analysis.pricePosition * 100).toFixed(0)}% of range, support ${fmtLevel(analysis.support)})`,
      };
    }

    if (analysis.nearResistance) {
      const failedTests = analysis.resistanceRejections;
      if (failedTests >= cfg.minRejectionsToBlock) {
        return {
          ok: false,
          analysis,
          reason: `LONG blocked — resistance ${fmtLevel(analysis.resistance)} rejected ${failedTests}× (need break above or pullback to support)`,
        };
      }
      if (failedTests >= 1 || analysis.pricePosition >= cfg.rangeTopBlock) {
        return {
          ok: false,
          analysis,
          reason: `LONG blocked — price at resistance ${fmtLevel(analysis.resistance)} without breakout (${failedTests} rejection${failedTests === 1 ? '' : 's'})`,
        };
      }
    }

    if (analysis.pricePosition > cfg.rangeTopBlock) {
      return {
        ok: false,
        analysis,
        reason: `LONG blocked — ${(analysis.pricePosition * 100).toFixed(0)}% of range (buy low — need pullback below ${(cfg.pullbackMaxPosition * 100).toFixed(0)}% or confirmed breakout)`,
      };
    }

    return {
      ok: true,
      analysis,
      reason: `Pullback entry — ${(analysis.pricePosition * 100).toFixed(0)}% of range (S ${fmtLevel(analysis.support)})`,
    };
  }

  if (analysis.confirmedBreakdown) {
    return {
      ok: true,
      analysis,
      reason: `Breakdown below support ${fmtLevel(analysis.support)} confirmed`,
    };
  }

  if (analysis.pricePosition >= 1 - cfg.pullbackMaxPosition) {
    return {
      ok: true,
      analysis,
      reason: `Pullback short (${(analysis.pricePosition * 100).toFixed(0)}% of range)`,
    };
  }

  if (analysis.nearSupport) {
    const failedTests = analysis.supportRejections;
    if (failedTests >= cfg.minRejectionsToBlock) {
      return {
        ok: false,
        analysis,
        reason: `SHORT blocked — support ${fmtLevel(analysis.support)} held ${failedTests}× (need break below or rally off support)`,
      };
    }
    if (failedTests >= 1 || analysis.pricePosition <= cfg.rangeBottomBlock) {
      return {
        ok: false,
        analysis,
        reason: `SHORT blocked — price at support ${fmtLevel(analysis.support)} without breakdown`,
      };
    }
  }

  if (analysis.pricePosition < cfg.rangeBottomBlock) {
    return {
      ok: false,
      analysis,
      reason: `SHORT blocked — ${(analysis.pricePosition * 100).toFixed(0)}% of range (sell high — need rally above ${((1 - cfg.pullbackMaxPosition) * 100).toFixed(0)}% or confirmed breakdown)`,
    };
  }

  return {
    ok: true,
    analysis,
    reason: `Rally-fade entry — ${(analysis.pricePosition * 100).toFixed(0)}% of range (R ${fmtLevel(analysis.resistance)})`,
  };
}

export async function validateEntryLocation(opts: {
  symbol: string;
  coin?: string;
  direction: 'LONG' | 'SHORT';
}): Promise<EntryLocationResult> {
  // Scalp S/R — ~4h on 5m + ~6h on 15m (not 24–72h 1h charts).
  const candles5 = await signalEngine.fetchCandles(opts.symbol, '5m', 48);
  const candles15 = await signalEngine.fetchCandles(opts.symbol, '15m', 24);

  if (candles15.length < 12 || candles5.length < 12) {
    return {
      ok: true,
      reason: 'insufficient candle history — location check skipped',
      analysis: {
        support: 0,
        resistance: 0,
        price: 0,
        pricePosition: 0.5,
        resistanceTouches: 0,
        resistanceRejections: 0,
        supportTouches: 0,
        supportRejections: 0,
        confirmedBreakoutUp: false,
        confirmedBreakdown: false,
        nearResistance: false,
        nearSupport: false,
        resistanceZone: null,
        supportZone: null,
      },
    };
  }

  const sr = analyzeSrZones(candles5, candles15);

  // In-house zone bands: no blind opens inside resistance/support — require reversal first.
  const zoneGate = evaluateZoneReversalGate(
    opts.direction,
    sr.price,
    candles5,
    sr.resistanceZone ?? null,
    sr.supportZone ?? null,
    {
      breakoutBufferPct: config.hyperliquid.entryLocation.breakoutBufferPct,
      breakoutBars: config.hyperliquid.entryLocation.breakoutConfirmBars,
      lookbackBars: 4,
    }
  );
  if (!zoneGate.ok) {
    return {
      ok: false,
      reason: zoneGate.reason,
      analysis: sr,
    };
  }

  // Zone flip OFF by default — counter-opens need own risk/SL + anti-ping-pong first.
  if (
    config.hyperliquid.zoneFlipEnabled &&
    zoneGate.flipTo &&
    zoneGate.flipTo !== opts.direction
  ) {
    return {
      ok: true,
      reason: zoneGate.reason,
      analysis: sr,
      flipTo: zoneGate.flipTo,
    };
  }

  // Flip disabled: treat counter-confirmation as wait/block (do not open against zone).
  if (
    !config.hyperliquid.zoneFlipEnabled &&
    zoneGate.flipTo &&
    zoneGate.flipTo !== opts.direction
  ) {
    return {
      ok: false,
      reason: `${zoneGate.reason} — zone flip disabled; waiting (no counter-open)`,
      analysis: sr,
    };
  }

  const classic = evaluateEntryLocation(opts.direction, sr);
  return classic;
}
