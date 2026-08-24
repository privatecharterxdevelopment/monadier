/**
 * In-house swing-cluster resistance / support zones (high–low bands).
 * Shared algorithm — keep in sync with `src/lib/hyperliquid/resistanceZone.ts`.
 *
 * Zones are candle-dynamic and price-relative (active S/R):
 * - Resistance = best swing-high cluster at/above last close
 * - Support    = best swing-low cluster at/below last close
 * Dense historical shelves ABOVE a dump are never labeled "support".
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
  /** Bars left/right that must be lower/higher for a swing pivot. */
  swingStrength?: number;
  /** Prefer zones within this distance of price (inactive shelves ignored). */
  maxZoneDistPct?: number;
};

const DEFAULTS = {
  swingClusterPct: 0.006,
  touchTolerancePct: 0.003,
  minHalfWidthPct: 0.0015,
  swingStrength: 3,
  maxZoneDistPct: 0.08,
};

type Swing = { price: number; index: number };

function lastClose(candles: CandleLike[]): number {
  return candles[candles.length - 1]?.close ?? 0;
}

function isSwingHigh(candles: CandleLike[], i: number, strength: number): boolean {
  if (i < strength || i >= candles.length - strength) return false;
  const h = candles[i].high;
  for (let j = i - strength; j <= i + strength; j += 1) {
    if (j !== i && candles[j].high > h) return false;
  }
  return true;
}

function isSwingLow(candles: CandleLike[], i: number, strength: number): boolean {
  if (i < strength || i >= candles.length - strength) return false;
  const l = candles[i].low;
  for (let j = i - strength; j <= i + strength; j += 1) {
    if (j !== i && candles[j].low < l) return false;
  }
  return true;
}

function collectSwingHighs(candles: CandleLike[], strength: number): Swing[] {
  const out: Swing[] = [];
  for (let i = strength; i < candles.length - strength; i += 1) {
    if (isSwingHigh(candles, i, strength)) out.push({ price: candles[i].high, index: i });
  }
  return out;
}

function collectSwingLows(candles: CandleLike[], strength: number): Swing[] {
  const out: Swing[] = [];
  for (let i = strength; i < candles.length - strength; i += 1) {
    if (isSwingLow(candles, i, strength)) out.push({ price: candles[i].low, index: i });
  }
  return out;
}

function approxAtr(candles: CandleLike[], period = 14): number {
  if (candles.length < 2) return 0;
  const n = Math.min(period, candles.length - 1);
  let sum = 0;
  for (let i = candles.length - n; i < candles.length; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1] ?? c;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    sum += tr;
  }
  return sum / n;
}

function padZone(
  low: number,
  high: number,
  midHint: number,
  minHalfWidthPct: number,
  atr: number
): { zoneLow: number; zoneHigh: number; mid: number } {
  const mid = midHint > 0 ? midHint : (low + high) / 2;
  const half = Math.max(
    (high - low) / 2,
    mid * minHalfWidthPct,
    atr > 0 ? atr * 0.2 : 0
  );
  return { zoneLow: mid - half, zoneHigh: mid + half, mid };
}

/** Strict touch = wick enters the band (not everything above zoneLow). */
function countZoneTests(
  candles: CandleLike[],
  zone: { zoneLow: number; zoneHigh: number },
  side: 'resistance' | 'support',
  touchTol: number
): { touches: number; rejections: number } {
  let touches = 0;
  let rejections = 0;
  const lo = zone.zoneLow * (1 - touchTol);
  const hi = zone.zoneHigh * (1 + touchTol);
  for (const c of candles) {
    if (side === 'resistance') {
      const tested = c.high >= lo && c.low <= hi;
      if (!tested) continue;
      touches += 1;
      if (c.close < zone.zoneLow) rejections += 1;
    } else {
      const tested = c.low <= hi && c.high >= lo;
      if (!tested) continue;
      touches += 1;
      if (c.close > zone.zoneHigh) rejections += 1;
    }
  }
  return { touches, rejections };
}

type Cluster = { members: Swing[]; mid: number };

function clustersFromSwings(swings: Swing[], clusterPct: number): Cluster[] {
  if (swings.length === 0) return [];
  const used = new Set<number>();
  const clusters: Cluster[] = [];
  const byPrice = [...swings].sort((a, b) => b.price - a.price);

  for (const seed of byPrice) {
    if (used.has(seed.index)) continue;
    const members = swings.filter(
      (p) => Math.abs(p.price - seed.price) / seed.price <= clusterPct
    );
    for (const m of members) used.add(m.index);
    const mid = members.reduce((s, p) => s + p.price, 0) / members.length;
    clusters.push({ members, mid });
  }
  return clusters;
}

function scoreCluster(
  cluster: Cluster,
  candles: CandleLike[],
  side: 'resistance' | 'support',
  price: number,
  touchTol: number,
  maxDistPct: number
): number | null {
  if (!(price > 0) || !(cluster.mid > 0)) return null;

  // Active geometry only.
  if (side === 'resistance' && cluster.mid < price * 0.998) return null;
  if (side === 'support' && cluster.mid > price * 1.002) return null;

  const distPct =
    side === 'resistance'
      ? (cluster.mid - price) / price
      : (price - cluster.mid) / price;
  if (distPct < 0 || distPct > maxDistPct) return null;

  const rawLow = Math.min(...cluster.members.map((m) => m.price));
  const rawHigh = Math.max(...cluster.members.map((m) => m.price));
  const tests = countZoneTests(
    candles,
    { zoneLow: rawLow, zoneHigh: rawHigh },
    side,
    touchTol
  );

  const newestIdx = Math.max(...cluster.members.map((m) => m.index));
  const recency = newestIdx / Math.max(1, candles.length - 1);
  // Closer to live price wins over Himalaya shelves.
  const proximity = 1 / (1 + distPct * 22);

  return (
    cluster.members.length * 4 +
    tests.rejections * 5 +
    tests.touches * 1.25 +
    recency * 8 +
    proximity * 18
  );
}

function pickBestZone(
  candles: CandleLike[],
  side: 'resistance' | 'support',
  opts: Required<
    Pick<
      ResistanceZoneOpts,
      | 'swingClusterPct'
      | 'touchTolerancePct'
      | 'minHalfWidthPct'
      | 'swingStrength'
      | 'maxZoneDistPct'
    >
  >
): PriceZone | null {
  if (!candles || candles.length < 8) return null;
  const price = lastClose(candles);
  if (!(price > 0)) return null;

  const swings =
    side === 'resistance'
      ? collectSwingHighs(candles, opts.swingStrength)
      : collectSwingLows(candles, opts.swingStrength);

  const atr = approxAtr(candles);
  let clusters = clustersFromSwings(swings, opts.swingClusterPct);

  // Fallback: recent extreme on the correct side of price.
  if (clusters.length === 0) {
    const window = candles.slice(-24);
    if (side === 'resistance') {
      const hi = Math.max(...window.map((c) => c.high));
      if (hi >= price * 0.998) {
        clusters = [{ members: [{ price: hi, index: candles.length - 1 }], mid: hi }];
      }
    } else {
      const lo = Math.min(...window.map((c) => c.low));
      if (lo <= price * 1.002) {
        clusters = [{ members: [{ price: lo, index: candles.length - 1 }], mid: lo }];
      }
    }
  }

  let best: { cluster: Cluster; score: number } | null = null;
  for (const cluster of clusters) {
    const score = scoreCluster(
      cluster,
      candles,
      side,
      price,
      opts.touchTolerancePct,
      opts.maxZoneDistPct
    );
    if (score == null) continue;
    if (!best || score > best.score) best = { cluster, score };
  }

  // Soften distance once if nothing scored (still keep side-of-price).
  if (!best) {
    for (const cluster of clusters) {
      const score = scoreCluster(
        cluster,
        candles,
        side,
        price,
        opts.touchTolerancePct,
        Math.max(opts.maxZoneDistPct, 0.18)
      );
      if (score == null) continue;
      if (!best || score > best.score) best = { cluster, score };
    }
  }

  if (!best) return null;

  const rawLow = Math.min(...best.cluster.members.map((m) => m.price));
  const rawHigh = Math.max(...best.cluster.members.map((m) => m.price));
  const padded = padZone(rawLow, rawHigh, best.cluster.mid, opts.minHalfWidthPct, atr);
  const tests = countZoneTests(candles, padded, side, opts.touchTolerancePct);

  return {
    side,
    zoneLow: padded.zoneLow,
    zoneHigh: padded.zoneHigh,
    mid: padded.mid,
    touches: tests.touches,
    rejections: tests.rejections,
    clusterSize: best.cluster.members.length,
  };
}

function resolveOpts(opts: ResistanceZoneOpts = {}) {
  return {
    swingClusterPct: opts.swingClusterPct ?? DEFAULTS.swingClusterPct,
    touchTolerancePct: opts.touchTolerancePct ?? DEFAULTS.touchTolerancePct,
    minHalfWidthPct: opts.minHalfWidthPct ?? DEFAULTS.minHalfWidthPct,
    swingStrength: opts.swingStrength ?? DEFAULTS.swingStrength,
    maxZoneDistPct: opts.maxZoneDistPct ?? DEFAULTS.maxZoneDistPct,
  };
}

/** Strongest active resistance band (at/above price). */
export function computeResistanceZone(
  candles: CandleLike[],
  opts: ResistanceZoneOpts = {}
): PriceZone | null {
  return pickBestZone(candles, 'resistance', resolveOpts(opts));
}

/** Strongest active support band (at/below price). */
export function computeSupportZone(
  candles: CandleLike[],
  opts: ResistanceZoneOpts = {}
): PriceZone | null {
  return pickBestZone(candles, 'support', resolveOpts(opts));
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
  flipTo?: 'LONG' | 'SHORT';
};

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
    const brokeOut = confirmedBreakAboveZone(
      candles,
      resistance,
      breakoutBufferPct,
      breakoutBars
    );
    if (brokeOut) {
      if (direction === 'LONG') {
        return {
          ok: true,
          reason: `Resistance breakout confirmed above $${resistance.zoneHigh.toFixed(4)}`,
          insideResistance,
          insideSupport,
        };
      }
      return {
        ok: true,
        flipTo: 'LONG',
        reason: `Resistance breakout → flip SHORT→LONG above $${resistance.zoneHigh.toFixed(4)}`,
        insideResistance,
        insideSupport,
      };
    }
    if (direction === 'SHORT') {
      return {
        ok: true,
        reason: `SHORT at resistance zone $${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)}`,
        insideResistance,
        insideSupport,
      };
    }
    return {
      ok: true,
      flipTo: 'SHORT',
      reason: `At resistance zone $${resistance.zoneLow.toFixed(4)}–$${resistance.zoneHigh.toFixed(4)} → flip LONG→SHORT`,
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
