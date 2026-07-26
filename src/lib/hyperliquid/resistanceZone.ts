/**
 * In-house swing-cluster resistance / support zones (high–low bands).
 * Shared algorithm — keep in sync with `bot-service/src/services/resistanceZone.ts`.
 */

export type CandleLike = {
  high: number;
  low: number;
  open: number;
  close: number;
  time?: number;
};

export type PriceZone = {
  side: 'resistance' | 'support';
  zoneLow: number;
  zoneHigh: number;
  mid: number;
  touches: number;
  rejections: number;
  /** How many swing members formed the cluster. */
  clusterSize: number;
};

export type ResistanceZoneOpts = {
  swingClusterPct?: number;
  touchTolerancePct?: number;
  /** Minimum zone half-width as fraction of mid (avoid hairline bands). */
  minHalfWidthPct?: number;
};

const DEFAULTS = {
  swingClusterPct: 0.004,
  touchTolerancePct: 0.0025,
  minHalfWidthPct: 0.0012,
};

function isSwingHigh(candles: CandleLike[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const h = candles[i].high;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j].high > h) return false;
  }
  return true;
}

function isSwingLow(candles: CandleLike[], i: number): boolean {
  if (i < 2 || i >= candles.length - 2) return false;
  const l = candles[i].low;
  for (let j = i - 2; j <= i + 2; j += 1) {
    if (j !== i && candles[j].low < l) return false;
  }
  return true;
}

function padZone(
  low: number,
  high: number,
  minHalfWidthPct: number
): { zoneLow: number; zoneHigh: number; mid: number } {
  const mid = (low + high) / 2;
  const half = Math.max((high - low) / 2, mid * minHalfWidthPct);
  return { zoneLow: mid - half, zoneHigh: mid + half, mid };
}

function bestSwingCluster(
  swings: number[],
  clusterPct: number,
  preferHigh: boolean
): { members: number[]; mid: number } | null {
  if (swings.length === 0) return null;
  const sorted = [...swings].sort((a, b) => (preferHigh ? b - a : a - b));
  let bestMembers: number[] = [sorted[0]];
  let bestScore = 0;
  let bestMid = sorted[0];

  for (const seed of sorted) {
    const members = swings.filter((p) => Math.abs(p - seed) / seed <= clusterPct);
    const score = members.length;
    const mid = members.reduce((s, p) => s + p, 0) / members.length;
    if (
      score > bestScore ||
      (score === bestScore &&
        (preferHigh ? mid > bestMid : mid < bestMid))
    ) {
      bestScore = score;
      bestMembers = members;
      bestMid = mid;
    }
  }
  return { members: bestMembers, mid: bestMid };
}

function countZoneTests(
  candles: CandleLike[],
  zone: { zoneLow: number; zoneHigh: number },
  side: 'resistance' | 'support',
  touchTol: number
): { touches: number; rejections: number } {
  let touches = 0;
  let rejections = 0;
  for (const c of candles) {
    if (side === 'resistance') {
      const tested = c.high >= zone.zoneLow * (1 - touchTol);
      if (!tested) continue;
      touches += 1;
      if (c.close < zone.zoneLow * (1 - touchTol * 0.35)) rejections += 1;
    } else {
      const tested = c.low <= zone.zoneHigh * (1 + touchTol);
      if (!tested) continue;
      touches += 1;
      if (c.close > zone.zoneHigh * (1 + touchTol * 0.35)) rejections += 1;
    }
  }
  return { touches, rejections };
}

/** Strongest resistance band from swing-high cluster. */
export function computeResistanceZone(
  candles: CandleLike[],
  opts: ResistanceZoneOpts = {}
): PriceZone | null {
  if (!candles || candles.length < 8) return null;
  const swingClusterPct = opts.swingClusterPct ?? DEFAULTS.swingClusterPct;
  const touchTolerancePct = opts.touchTolerancePct ?? DEFAULTS.touchTolerancePct;
  const minHalfWidthPct = opts.minHalfWidthPct ?? DEFAULTS.minHalfWidthPct;

  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingHigh(candles, i)) swings.push(candles[i].high);
  }
  const fallback = Math.max(...candles.slice(-20).map((c) => c.high));
  const cluster = bestSwingCluster(swings.length ? swings : [fallback], swingClusterPct, true);
  if (!cluster) return null;

  const rawLow = Math.min(...cluster.members);
  const rawHigh = Math.max(...cluster.members);
  const padded = padZone(rawLow, rawHigh, minHalfWidthPct);
  const tests = countZoneTests(candles, padded, 'resistance', touchTolerancePct);

  return {
    side: 'resistance',
    zoneLow: padded.zoneLow,
    zoneHigh: padded.zoneHigh,
    mid: padded.mid,
    touches: tests.touches,
    rejections: tests.rejections,
    clusterSize: cluster.members.length,
  };
}

/** Strongest support band from swing-low cluster. */
export function computeSupportZone(
  candles: CandleLike[],
  opts: ResistanceZoneOpts = {}
): PriceZone | null {
  if (!candles || candles.length < 8) return null;
  const swingClusterPct = opts.swingClusterPct ?? DEFAULTS.swingClusterPct;
  const touchTolerancePct = opts.touchTolerancePct ?? DEFAULTS.touchTolerancePct;
  const minHalfWidthPct = opts.minHalfWidthPct ?? DEFAULTS.minHalfWidthPct;

  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingLow(candles, i)) swings.push(candles[i].low);
  }
  const fallback = Math.min(...candles.slice(-20).map((c) => c.low));
  const cluster = bestSwingCluster(swings.length ? swings : [fallback], swingClusterPct, false);
  if (!cluster) return null;

  const rawLow = Math.min(...cluster.members);
  const rawHigh = Math.max(...cluster.members);
  const padded = padZone(rawLow, rawHigh, minHalfWidthPct);
  const tests = countZoneTests(candles, padded, 'support', touchTolerancePct);

  return {
    side: 'support',
    zoneLow: padded.zoneLow,
    zoneHigh: padded.zoneHigh,
    mid: padded.mid,
    touches: tests.touches,
    rejections: tests.rejections,
    clusterSize: cluster.members.length,
  };
}

export function priceInsideZone(
  price: number,
  zone: PriceZone,
  edgeTolPct = 0.0008
): boolean {
  if (!(price > 0)) return false;
  const lo = zone.zoneLow * (1 - edgeTolPct);
  const hi = zone.zoneHigh * (1 + edgeTolPct);
  return price >= lo && price <= hi;
}

/** Wick pierced the zone on the last N bars (touch), for reversal detection. */
export function recentZonePierce(
  candles: CandleLike[],
  zone: PriceZone,
  bars = 3
): boolean {
  const recent = candles.slice(-bars);
  if (recent.length === 0) return false;
  if (zone.side === 'resistance') {
    return recent.some((c) => c.high >= zone.zoneLow);
  }
  return recent.some((c) => c.low <= zone.zoneHigh);
}

export function confirmedBreakAboveZone(
  candles: CandleLike[],
  zone: PriceZone,
  bufferPct = 0.0015,
  bars = 2
): boolean {
  const recent = candles.slice(-bars);
  if (recent.length < bars) return false;
  return recent.every((c) => c.close > zone.zoneHigh * (1 + bufferPct));
}

export function confirmedBreakBelowZone(
  candles: CandleLike[],
  zone: PriceZone,
  bufferPct = 0.0015,
  bars = 2
): boolean {
  const recent = candles.slice(-bars);
  if (recent.length < bars) return false;
  return recent.every((c) => c.close < zone.zoneLow * (1 - bufferPct));
}

/**
 * Rejection / fade off resistance: pierced zone, last close back below zone mid.
 * Bounce off support: pierced zone, last close back above zone mid.
 */
export function zoneReversalConfirmed(
  candles: CandleLike[],
  zone: PriceZone,
  lookbackBars = 4
): boolean {
  if (!recentZonePierce(candles, zone, lookbackBars)) return false;
  const last = candles[candles.length - 1];
  if (!last) return false;
  if (zone.side === 'resistance') {
    return last.close < zone.mid && last.close < zone.zoneHigh;
  }
  return last.close > zone.mid && last.close > zone.zoneLow;
}

export type ZoneOpenVerdict = {
  ok: boolean;
  reason: string;
  insideResistance: boolean;
  insideSupport: boolean;
  /** When set, open the opposite side — zone rejection/bounce is the edge. */
  flipTo?: 'LONG' | 'SHORT';
};

/**
 * When price sits inside a zone:
 * - Same-direction with breakout/breakdown, OR
 * - Counter-trade (flip) when rejection/bounce is confirmed.
 */
export function evaluateZoneReversalGate(
  direction: 'LONG' | 'SHORT',
  price: number,
  candles: CandleLike[],
  resistance: PriceZone | null,
  support: PriceZone | null,
  opts?: { breakoutBufferPct?: number; breakoutBars?: number; lookbackBars?: number }
): ZoneOpenVerdict {
  const breakoutBufferPct = opts?.breakoutBufferPct ?? 0.0015;
  const breakoutBars = opts?.breakoutBars ?? 2;
  const lookbackBars = opts?.lookbackBars ?? 4;

  const insideResistance = resistance != null && priceInsideZone(price, resistance);
  const insideSupport = support != null && priceInsideZone(price, support);

  if (insideResistance && resistance) {
    const rejected = zoneReversalConfirmed(candles, resistance, lookbackBars);
    const brokeOut = confirmedBreakAboveZone(
      candles,
      resistance,
      breakoutBufferPct,
      breakoutBars
    );

    if (rejected) {
      if (direction === 'SHORT') {
        return {
          ok: true,
          reason: `Resistance-zone fade confirmed ($${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)})`,
          insideResistance,
          insideSupport,
        };
      }
      return {
        ok: true,
        flipTo: 'SHORT',
        reason: `Resistance-zone rejection → flip LONG→SHORT ($${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)})`,
        insideResistance,
        insideSupport,
      };
    }

    if (brokeOut) {
      if (direction === 'LONG') {
        return {
          ok: true,
          reason: `Resistance-zone breakout confirmed above $${resistance.zoneHigh.toFixed(4)}`,
          insideResistance,
          insideSupport,
        };
      }
      return {
        ok: true,
        flipTo: 'LONG',
        reason: `Resistance-zone breakout → flip SHORT→LONG above $${resistance.zoneHigh.toFixed(4)}`,
        insideResistance,
        insideSupport,
      };
    }

    return {
      ok: false,
      reason: `Inside resistance zone $${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)}; wait for rejection (→SHORT) or breakout (→LONG)`,
      insideResistance,
      insideSupport,
    };
  }

  if (insideSupport && support) {
    const bounced = zoneReversalConfirmed(candles, support, lookbackBars);
    const brokeDown = confirmedBreakBelowZone(
      candles,
      support,
      breakoutBufferPct,
      breakoutBars
    );

    if (bounced) {
      if (direction === 'LONG') {
        return {
          ok: true,
          reason: `Support-zone bounce confirmed ($${support.zoneLow.toFixed(4)}–$${support.zoneHigh.toFixed(4)})`,
          insideResistance,
          insideSupport,
        };
      }
      return {
        ok: true,
        flipTo: 'LONG',
        reason: `Support-zone bounce → flip SHORT→LONG ($${support.zoneLow.toFixed(4)}–$${support.zoneHigh.toFixed(4)})`,
        insideResistance,
        insideSupport,
      };
    }

    if (brokeDown) {
      if (direction === 'SHORT') {
        return {
          ok: true,
          reason: `Support-zone breakdown confirmed below $${support.zoneLow.toFixed(4)}`,
          insideResistance,
          insideSupport,
        };
      }
      return {
        ok: true,
        flipTo: 'SHORT',
        reason: `Support-zone breakdown → flip LONG→SHORT below $${support.zoneLow.toFixed(4)}`,
        insideResistance,
        insideSupport,
      };
    }

    return {
      ok: false,
      reason: `Inside support zone $${support.zoneLow.toFixed(4)}–$${support.zoneHigh.toFixed(4)}; wait for bounce (→LONG) or breakdown (→SHORT) — do not sell the floor blind`,
      insideResistance,
      insideSupport,
    };
  }

  return {
    ok: true,
    reason: 'Outside S/R zones',
    insideResistance,
    insideSupport,
  };
}
