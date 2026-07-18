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
 * - Shadow mode by default: always log to hl_open_blocks, only block when enforce=true
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

export type HtfSrResult = {
  /** Would this entry be blocked if enforce were on? */
  wouldBlock: boolean;
  /** Actually block the open (wouldBlock && enforce). */
  ok: boolean;
  reason: string;
  atr1h: number;
  atrThreshold: number;
  nearestLevel: HtfSrLevel | null;
  distanceToLevel: number | null;
  levels: HtfSrLevel[];
  shadow: boolean;
};

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
      const tested = c.high >= level * (1 - touchTol);
      if (!tested) continue;
      touches += 1;
      lastTouchTime = Math.max(lastTouchTime, c.time);
      if (c.close < level * (1 - touchTol * 0.35)) rejections += 1;
    } else {
      const tested = c.low <= level * (1 + touchTol);
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

/**
 * Validate entry against HTF S/R.
 * Always computes wouldBlock; only sets ok=false when enforce=true.
 */
export async function validateHtfSr(opts: {
  symbol: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<HtfSrResult> {
  const cfg = config.hyperliquid.htfSr;
  const shadow = !cfg.enforce;

  if (!cfg.enabled) {
    return {
      wouldBlock: false,
      ok: true,
      reason: 'HTF S/R gate disabled',
      atr1h: 0,
      atrThreshold: 0,
      nearestLevel: null,
      distanceToLevel: null,
      levels: [],
      shadow,
    };
  }

  const [candles1h, candles4h] = await Promise.all([
    signalEngine.fetchCandles(opts.symbol, '1h', cfg.h1Bars),
    signalEngine.fetchCandles(opts.symbol, '4h', cfg.h4Bars),
  ]);

  const price =
    candles1h[candles1h.length - 1]?.close ??
    candles4h[candles4h.length - 1]?.close ??
    0;

  if (price <= 0 || candles1h.length < cfg.atrPeriod + 2) {
    return {
      wouldBlock: false,
      ok: true,
      reason: 'HTF S/R skipped — insufficient candle data',
      atr1h: 0,
      atrThreshold: 0,
      nearestLevel: null,
      distanceToLevel: null,
      levels: [],
      shadow,
    };
  }

  const atr1h = atrWilder(candles1h, cfg.atrPeriod);
  const atrThreshold = atr1h * cfg.atrMult;
  const nowMs = Date.now();

  const levels: HtfSrLevel[] = [
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

  const side: 'support' | 'resistance' =
    opts.direction === 'SHORT' ? 'support' : 'resistance';
  const near = nearestRelevant(levels, price, side);

  if (!near || atrThreshold <= 0) {
    return {
      wouldBlock: false,
      ok: true,
      reason: `HTF S/R clear — no strong ${side} within ${cfg.atrMult}×ATR(1h)`,
      atr1h,
      atrThreshold,
      nearestLevel: null,
      distanceToLevel: null,
      levels,
      shadow,
    };
  }

  const wouldBlock = near.distance <= atrThreshold;
  if (!wouldBlock) {
    return {
      wouldBlock: false,
      ok: true,
      reason: `HTF S/R clear — nearest ${side} ${near.level.price.toFixed(4)} is ${(
        near.distance / atr1h
      ).toFixed(2)}×ATR away (need ≤${cfg.atrMult}×)`,
      atr1h,
      atrThreshold,
      nearestLevel: near.level,
      distanceToLevel: near.distance,
      levels,
      shadow,
    };
  }

  const distAtr = atr1h > 0 ? near.distance / atr1h : 0;
  const reason = `${opts.direction} near HTF ${side} ${near.level.price.toFixed(4)} (${
    near.level.timeframe
  }, ${near.level.rejections}× rejected, age ${near.level.lastTouchAgeHours.toFixed(
    1
  )}h) — ${distAtr.toFixed(2)}×ATR ≤ ${cfg.atrMult}×ATR threshold`;

  return {
    wouldBlock: true,
    ok: !cfg.enforce, // shadow → still ok; enforce → block
    reason: cfg.enforce ? reason : `SHADOW: would block — ${reason}`,
    atr1h,
    atrThreshold,
    nearestLevel: near.level,
    distanceToLevel: near.distance,
    levels,
    shadow,
  };
}
