/**
 * Entry location gate — resistance/support awareness before HL bot opens.
 *
 * Floor detection: swing-low clusters → support level/zone; nearSupport when
 * price is in the lower half of the S–R box or hugging the S band.
 *
 * SHORT: R-fade / upper range, or confirmed breakdown — never blind floor shorts.
 * Floor reverse: confirmed support bounce (pierce + reclaim) → flip SHORT→LONG.
 * LONG: support / lower range, or confirmed breakout above R.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';
import { isLongAllowedCoin } from './longAllowlist';
import { logger } from '../utils/logger';
import {
  computeResistanceZone,
  computeSupportZone,
  evaluateZoneReversalGate,
  zoneReversalConfirmed,
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
      price <= supportZone.zoneHigh * (1 + Math.max(cfg.nearLevelPct, 0.008)) &&
      price >= supportZone.zoneLow * (1 - cfg.nearLevelPct)) ||
    // Entire lower half = floor risk (chart S / dump shelf). Narrow 0.35 band
    // let TRUMP-style Open S sit on consolidation low while pos looked "mid".
    pos <= Math.max(cfg.rangeBottomBlock, 0.5) ||
    distToSupPct <= Math.max(cfg.nearLevelPct, 0.008) ||
    price <= support * (1 + Math.max(cfg.nearLevelPct, 0.008));

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
    // 1) Confirmed breakout above R — only valid way to buy the ceiling.
    if (analysis.confirmedBreakoutUp) {
      return {
        ok: true,
        analysis,
        reason: `Breakout above resistance ${fmtLevel(analysis.resistance)} confirmed`,
      };
    }

    // 2) Upper line / near R → NEVER LONG (that's a SHORT fade).
    if (analysis.nearResistance || analysis.pricePosition >= cfg.rangeTopBlock) {
      const zone =
        analysis.resistanceZone != null
          ? `${fmtLevel(analysis.resistanceZone.zoneLow)}–${fmtLevel(analysis.resistanceZone.zoneHigh)}`
          : fmtLevel(analysis.resistance);
      return {
        ok: false,
        analysis,
        reason: `LONG blocked — at/near upper range R ${zone} (top of range = SHORT, not LONG)`,
      };
    }

    // 3) Lower line / near S → LONG allowed (bounce).
    if (analysis.nearSupport || analysis.pricePosition <= cfg.rangeBottomBlock) {
      return {
        ok: true,
        analysis,
        reason: `Support/lower-range LONG (${(analysis.pricePosition * 100).toFixed(0)}% of range, S ${fmtLevel(analysis.support)})`,
      };
    }

    // 4) Mid-range — no LONG.
    return {
      ok: false,
      analysis,
      reason: `LONG blocked — mid-range ${(analysis.pricePosition * 100).toFixed(0)}% (need lower line / S ≤${(cfg.rangeBottomBlock * 100).toFixed(0)}% or breakout above R)`,
    };
  }

  // ── SHORT ──────────────────────────────────────────────────────────────
  // Breakdown through the floor is the only valid way to short the lows.
  if (analysis.confirmedBreakdown) {
    return {
      ok: true,
      analysis,
      reason: `Breakdown below support ${fmtLevel(analysis.support)} confirmed`,
    };
  }

  // Hard: never short the floor / lower half without breakdown (user: dump shelf Open S).
  const floorReject = Math.max(cfg.rangeBottomBlock, 0.5);
  if (analysis.nearSupport || analysis.pricePosition <= floorReject) {
    const zone =
      analysis.supportZone != null
        ? `${fmtLevel(analysis.supportZone.zoneLow)}–${fmtLevel(analysis.supportZone.zoneHigh)}`
        : fmtLevel(analysis.support);
    return {
      ok: false,
      analysis,
      reason: `SHORT blocked — at/near range floor ${zone} (pos ${(analysis.pricePosition * 100).toFixed(0)}% ≤${(floorReject * 100).toFixed(0)}%); need breakdown or R-fade`,
    };
  }

  // Resistance-zone / upper-range fade only.
  if (analysis.nearResistance || analysis.pricePosition >= cfg.rangeTopBlock) {
    const zone =
      analysis.resistanceZone != null
        ? `${fmtLevel(analysis.resistanceZone.zoneLow)}–${fmtLevel(analysis.resistanceZone.zoneHigh)}`
        : fmtLevel(analysis.resistance);
    return {
      ok: true,
      analysis,
      reason: `Resistance-zone short — in/near R ${zone}`,
    };
  }

  return {
    ok: false,
    analysis,
    reason: `SHORT blocked — mid-range ${(analysis.pricePosition * 100).toFixed(0)}% (need R ≥${(cfg.rangeTopBlock * 100).toFixed(0)}% or confirmed breakdown)`,
  };
}

export async function validateEntryLocation(opts: {
  symbol: string;
  coin?: string;
  direction: 'LONG' | 'SHORT';
}): Promise<EntryLocationResult> {
  // Match chart zone lines: primary 1h (what user sees) + 15m for nearer bands.
  const candles1h = await signalEngine.fetchCandles(opts.symbol, '1h', 48);
  const candles15 = await signalEngine.fetchCandles(opts.symbol, '15m', 24);
  // Keep 5m for zone-reversal confirmation (wick/rejection speed).
  const candles5 = await signalEngine.fetchCandles(opts.symbol, '5m', 48);

  if (candles1h.length < 12 || candles15.length < 12) {
    // Fail closed — never open blind without S/R (especially SHORT into support).
    return {
      ok: false,
      reason: 'entry location blocked — insufficient candle history for S/R',
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

  const sr = analyzeSrZones(candles1h, candles15);

  // In-house zone bands: no blind opens inside resistance/support — require reversal first.
  const zoneGate = evaluateZoneReversalGate(
    opts.direction,
    sr.price,
    candles5.length >= 12 ? candles5 : candles15,
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

  // Floor reverse: confirmed support bounce → LONG for majors only.
  // Blind SHORT→LONG without bounce was the falling-knife bug — zoneGate only sets
  // flipTo LONG after zoneReversalConfirmed. Dump tape still runs in hlTrading.
  if (
    config.hyperliquid.zoneFlipEnabled &&
    zoneGate.flipTo &&
    zoneGate.flipTo !== opts.direction
  ) {
    if (
      zoneGate.flipTo === 'LONG' &&
      (!config.hyperliquid.directionProfile.allowLongOpens ||
        !isLongAllowedCoin(opts.coin ?? ''))
    ) {
      return {
        ok: false,
        reason: `${zoneGate.reason} — floor LONG only BTC/ETH/SOL when dump-tape clear (no alt knife); no floor SHORT`,
        analysis: sr,
      };
    }
    logger.info('HL floor/R zone flip proposed', {
      coin: opts.coin,
      from: opts.direction,
      to: zoneGate.flipTo,
      reason: zoneGate.reason,
      profile: config.hyperliquid.directionProfile.name,
    });
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
  const revCandles = candles5.length >= 12 ? candles5 : candles15;

  // Floor reverse (classic): scan arrived SHORT at S, bounce confirmed → LONG majors only.
  if (
    config.hyperliquid.zoneFlipEnabled &&
    config.hyperliquid.directionProfile.allowLongOpens &&
    isLongAllowedCoin(opts.coin ?? '') &&
    opts.direction === 'SHORT' &&
    !classic.ok &&
    sr.nearSupport &&
    !sr.confirmedBreakdown &&
    sr.supportZone != null &&
    zoneReversalConfirmed(revCandles, sr.supportZone, 4)
  ) {
    return {
      ok: true,
      reason: `Floor reverse — support bounce → flip SHORT→LONG ($${sr.supportZone.zoneLow.toFixed(4)}–$${sr.supportZone.zoneHigh.toFixed(4)})`,
      analysis: sr,
      flipTo: 'LONG',
    };
  }

  // Symmetric: resistance rejection when scan arrived LONG → SHORT (top of range).
  // Disabled under LONG-only bull (allowShortOpens=false).
  // LONG-primary (bull): stricter — upper-range only, more rejection proof, longer confirm.
  // Lazy mid-range "resistance" fades caused BTC SHORT into bull buildup (2026-08-09).
  if (
    config.hyperliquid.zoneFlipEnabled &&
    config.hyperliquid.directionProfile.allowShortOpens &&
    opts.direction === 'LONG' &&
    !classic.ok &&
    sr.nearResistance &&
    !sr.confirmedBreakoutUp &&
    sr.resistanceZone != null
  ) {
    const longPrimary = config.hyperliquid.directionProfile.primaryDirection === 'LONG';
    const confirmBars = longPrimary ? 6 : 4;
    const minRangePos = longPrimary ? 0.75 : 0;
    const minResRejections = longPrimary ? 5 : 2;
    if (
      sr.pricePosition >= minRangePos &&
      sr.resistanceRejections >= minResRejections &&
      zoneReversalConfirmed(revCandles, sr.resistanceZone, confirmBars)
    ) {
      return {
        ok: true,
        reason: `Resistance-zone rejection → flip LONG→SHORT ($${sr.resistanceZone.zoneLow.toFixed(4)}–$${sr.resistanceZone.zoneHigh.toFixed(4)})`,
        analysis: sr,
        flipTo: 'SHORT',
      };
    }
  }

  return classic;
}
