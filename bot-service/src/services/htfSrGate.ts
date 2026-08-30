/**
 * Higher-timeframe support/resistance gate.
 *
 * Complements the scalp entryLocationGate (5m/15m ~4–6h) with 1h + 4h levels
 * so the bot does not SHORT into a daily support bounce or LONG into HTF resistance.
 *
 * Design constraints (live money):
 * - ATR-based proximity (not fixed %), so quiet coins ≠ volatile coins
 * - "Strong" = min rejections at the level (weak 1-touch levels ignored)
 * - Level decay = last touch older than maxAgeHours → ignore
 * - LONG + SHORT symmetric
 * - Status is CLEAR | BLOCK | UNKNOWN. Missing data is UNKNOWN, never CLEAR.
 * - Order flow always evaluates (HL_HTF_SR=false does not skip).
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';

export type HtfSrLevel = {
  price: number;
  side: 'support' | 'resistance';
  timeframe: '1h' | '4h';
  touches: number;
  rejections: number;
  lastTouchAgeHours: number;
  strong: boolean;
};

export type HtfSrStatus = 'CLEAR' | 'BLOCK' | 'UNKNOWN';

export type HtfSrResult = {
  /** CLEAR = structure evaluated and no nearby opposite HTF level. */
  status: HtfSrStatus;
  /** True for BLOCK and UNKNOWN — never treat missing data as clear. */
  wouldBlock: boolean;
  /** True only when status === CLEAR. */
  ok: boolean;
  reason: string;
  atr1h: number;
  atrThreshold: number;
  nearestLevel: HtfSrLevel | null;
  distanceToLevel: number | null;
  levels: HtfSrLevel[];
  shadow: boolean;
};

export function htfSrAllowsOpen(result: HtfSrResult): boolean {
  return result.status === 'CLEAR';
}

export type NearbyHtfSupport = {
  level: HtfSrLevel;
  distance: number;
  distanceAtr: number;
};

/**
 * Confirm a range-LONG location: a strong, non-stale HTF support must sit at or
 * just below the entry and be within the configured ATR proximity threshold.
 * `result.levels` already excludes levels older than maxLevelAgeHours.
 */
export function findNearbyStrongHtfSupport(
  result: HtfSrResult,
  price: number
): NearbyHtfSupport | null {
  if (price <= 0 || result.atr1h <= 0 || result.atrThreshold <= 0) return null;

  let nearest: NearbyHtfSupport | null = null;
  for (const level of result.levels) {
    if (level.side !== 'support' || !level.strong) continue;
    // Match nearestRelevant's small tolerance for candle-close vs live-mark drift.
    if (level.price > price * 1.002) continue;
    const distance = Math.abs(price - level.price);
    if (distance > result.atrThreshold) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        level,
        distance,
        distanceAtr: distance / result.atr1h,
      };
    }
  }
  return nearest;
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

function atrWilder(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  if (trs.length < period) return 0;
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i += 1) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

type ClusteredLevel = {
  price: number;
  swings: Array<{ price: number; time: number }>;
};

function clusterSwings(
  swings: Array<{ price: number; time: number }>,
  clusterPct: number
): ClusteredLevel[] {
  if (swings.length === 0) return [];
  const sorted = [...swings].sort((a, b) => b.price - a.price);
  const used = new Set<number>();
  const clusters: ClusteredLevel[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used.has(i)) continue;
    const seed = sorted[i];
    const members = [seed];
    used.add(i);
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (used.has(j)) continue;
      if (Math.abs(sorted[j].price - seed.price) / seed.price <= clusterPct) {
        members.push(sorted[j]);
        used.add(j);
      }
    }
    const price = members.reduce((s, m) => s + m.price, 0) / members.length;
    clusters.push({ price, swings: members });
  }
  return clusters;
}

function countTests(
  candles: Candle[],
  level: number,
  side: 'support' | 'resistance',
  touchTol: number
): { touches: number; rejections: number; lastTouchTime: number } {
  let touches = 0;
  let rejections = 0;
  let lastTouchTime = 0;

  for (const c of candles) {
    if (side === 'resistance') {
      // Count a real wick touch near the level, not every candle that traded far
      // beyond it; otherwise old breakouts inflate resistance strength.
      const tested = Math.abs(c.high - level) / level <= touchTol;
      if (!tested) continue;
      touches += 1;
      lastTouchTime = Math.max(lastTouchTime, c.time);
      if (c.close < level * (1 - touchTol * 0.35)) rejections += 1;
    } else {
      // Symmetric support rule: the wick low itself must be near the level.
      const tested = Math.abs(c.low - level) / level <= touchTol;
      if (!tested) continue;
      touches += 1;
      lastTouchTime = Math.max(lastTouchTime, c.time);
      if (c.close > level * (1 + touchTol * 0.35)) rejections += 1;
    }
  }

  return { touches, rejections, lastTouchTime };
}

function extractLevels(
  candles: Candle[],
  timeframe: '1h' | '4h',
  side: 'support' | 'resistance',
  clusterPct: number,
  touchTol: number,
  minRejections: number,
  maxAgeHours: number,
  nowMs: number
): HtfSrLevel[] {
  const swings: Array<{ price: number; time: number }> = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (side === 'resistance' && isSwingHigh(candles, i)) {
      swings.push({ price: candles[i].high, time: candles[i].time });
    }
    if (side === 'support' && isSwingLow(candles, i)) {
      swings.push({ price: candles[i].low, time: candles[i].time });
    }
  }

  const clusters = clusterSwings(swings, clusterPct);
  const out: HtfSrLevel[] = [];

  for (const cluster of clusters) {
    const tests = countTests(candles, cluster.price, side, touchTol);
    if (tests.touches === 0) continue;
    const lastTouch = tests.lastTouchTime || Math.max(...cluster.swings.map((s) => s.time));
    const ageHours = Math.max(0, (nowMs - lastTouch) / 3_600_000);
    if (ageHours > maxAgeHours) continue; // level decay — stale levels dropped

    out.push({
      price: cluster.price,
      side,
      timeframe,
      touches: tests.touches,
      rejections: tests.rejections,
      lastTouchAgeHours: ageHours,
      strong: tests.rejections >= minRejections,
    });
  }

  return out;
}

function nearestRelevant(
  levels: HtfSrLevel[],
  price: number,
  side: 'support' | 'resistance'
): { level: HtfSrLevel; distance: number } | null {
  const candidates = levels.filter((l) => l.side === side && l.strong);
  let best: { level: HtfSrLevel; distance: number } | null = null;

  for (const level of candidates) {
    // SHORT cares about support BELOW or at price; LONG about resistance ABOVE or at price.
    if (side === 'support' && level.price > price * 1.002) continue;
    if (side === 'resistance' && level.price < price * 0.998) continue;
    const distance = Math.abs(price - level.price);
    if (!best || distance < best.distance) {
      best = { level, distance };
    }
  }
  return best;
}

function candlesUsable(candles: Candle[], minLen: number): boolean {
  if (!Array.isArray(candles) || candles.length < minLen) return false;
  for (const c of candles) {
    if (
      !c ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close)
    ) {
      return false;
    }
    if (c.high < c.low) return false;
  }
  return true;
}

function unknownHtf(
  shadow: boolean,
  reason: string,
  extra?: Partial<HtfSrResult>
): HtfSrResult {
  return {
    status: 'UNKNOWN',
    wouldBlock: true,
    ok: false,
    reason,
    atr1h: extra?.atr1h ?? 0,
    atrThreshold: extra?.atrThreshold ?? 0,
    nearestLevel: extra?.nearestLevel ?? null,
    distanceToLevel: extra?.distanceToLevel ?? null,
    levels: extra?.levels ?? [],
    shadow,
  };
}

function clearHtf(
  shadow: boolean,
  reason: string,
  extra: Pick<
    HtfSrResult,
    'atr1h' | 'atrThreshold' | 'nearestLevel' | 'distanceToLevel' | 'levels'
  >
): HtfSrResult {
  return {
    status: 'CLEAR',
    wouldBlock: false,
    ok: true,
    reason,
    ...extra,
    shadow,
  };
}

/**
 * Validate entry against HTF S/R.
 * Always evaluates 1h+4h (HL_HTF_SR=false does not skip).
 * Missing/malformed data → UNKNOWN (not CLEAR).
 */
export async function validateHtfSr(opts: {
  symbol: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<HtfSrResult> {
  const cfg = config.hyperliquid.htfSr;
  const shadow = !cfg.enforce;
  const minBars = cfg.atrPeriod + 2;

  let candles1h: Candle[];
  let candles4h: Candle[];
  try {
    [candles1h, candles4h] = await Promise.all([
      signalEngine.fetchCandles(opts.symbol, '1h', cfg.h1Bars),
      signalEngine.fetchCandles(opts.symbol, '4h', cfg.h4Bars),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return unknownHtf(
      shadow,
      `HTF S/R UNKNOWN — candle fetch failed (${msg.slice(0, 120)})`
    );
  }

  if (!candlesUsable(candles1h, minBars)) {
    return unknownHtf(
      shadow,
      `HTF S/R UNKNOWN — insufficient or malformed 1h candles (${candles1h?.length ?? 0})`
    );
  }
  if (!candlesUsable(candles4h, minBars)) {
    return unknownHtf(
      shadow,
      `HTF S/R UNKNOWN — insufficient or malformed 4h candles (${candles4h?.length ?? 0})`
    );
  }

  const price =
    candles1h[candles1h.length - 1]?.close ??
    candles4h[candles4h.length - 1]?.close ??
    0;
  if (!(price > 0) || !Number.isFinite(price)) {
    return unknownHtf(shadow, 'HTF S/R UNKNOWN — no usable HTF mark/close');
  }

  const atr1h = atrWilder(candles1h, cfg.atrPeriod);
  const atrThreshold = atr1h * cfg.atrMult;
  if (!(atr1h > 0) || !Number.isFinite(atr1h) || !(atrThreshold > 0)) {
    return unknownHtf(shadow, 'HTF S/R UNKNOWN — ATR/structure calculation failed', {
      atr1h,
      atrThreshold,
    });
  }

  const nowMs = Date.now();
  let levels: HtfSrLevel[];
  try {
    levels = [
      ...extractLevels(
        candles1h,
        '1h',
        'support',
        cfg.swingClusterPct,
        cfg.touchTolerancePct,
        cfg.minRejections,
        cfg.maxLevelAgeHours,
        nowMs
      ),
      ...extractLevels(
        candles1h,
        '1h',
        'resistance',
        cfg.swingClusterPct,
        cfg.touchTolerancePct,
        cfg.minRejections,
        cfg.maxLevelAgeHours,
        nowMs
      ),
      ...extractLevels(
        candles4h,
        '4h',
        'support',
        cfg.swingClusterPct,
        cfg.touchTolerancePct,
        cfg.minRejections,
        cfg.maxLevelAgeHours,
        nowMs
      ),
      ...extractLevels(
        candles4h,
        '4h',
        'resistance',
        cfg.swingClusterPct,
        cfg.touchTolerancePct,
        cfg.minRejections,
        cfg.maxLevelAgeHours,
        nowMs
      ),
    ];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return unknownHtf(
      shadow,
      `HTF S/R UNKNOWN — level extraction failed (${msg.slice(0, 120)})`,
      { atr1h, atrThreshold }
    );
  }

  const side: 'support' | 'resistance' =
    opts.direction === 'SHORT' ? 'support' : 'resistance';
  const near = nearestRelevant(levels, price, side);

  if (!near) {
    return clearHtf(
      shadow,
      `HTF S/R CLEAR — no strong ${side} within ${cfg.atrMult}×ATR(1h)`,
      {
        atr1h,
        atrThreshold,
        nearestLevel: null,
        distanceToLevel: null,
        levels,
      }
    );
  }

  if (near.distance > atrThreshold) {
    return clearHtf(
      shadow,
      `HTF S/R CLEAR — nearest ${side} ${near.level.price.toFixed(4)} is ${(
        near.distance / atr1h
      ).toFixed(2)}×ATR away (need ≤${cfg.atrMult}×)`,
      {
        atr1h,
        atrThreshold,
        nearestLevel: near.level,
        distanceToLevel: near.distance,
        levels,
      }
    );
  }

  const distAtr = near.distance / atr1h;
  const reason = `${opts.direction} near HTF ${side} ${near.level.price.toFixed(4)} (${
    near.level.timeframe
  }, ${near.level.rejections}× rejected, age ${near.level.lastTouchAgeHours.toFixed(
    1
  )}h) — ${distAtr.toFixed(2)}×ATR ≤ ${cfg.atrMult}×ATR threshold`;

  return {
    status: 'BLOCK',
    wouldBlock: true,
    ok: false,
    reason,
    atr1h,
    atrThreshold,
    nearestLevel: near.level,
    distanceToLevel: near.distance,
    levels,
    shadow,
  };
}
