/**
 * Entry location gate — resistance/support awareness before HL bot opens.
 *
 * Blocks LONG into a ceiling that already rejected price multiple times.
 * Blocks SHORT at range lows when overhead resistance structure is intact.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';

export type SrZoneAnalysis = {
  support: number;
  resistance: number;
  /** Resistance cluster price is currently pressing (multi-touch ceiling). */
  activeResistance: number | null;
  price: number;
  pricePosition: number;
  resistanceTouches: number;
  resistanceRejections: number;
  resistanceLevelCount: number;
  activeResistanceRejections: number;
  supportTouches: number;
  supportRejections: number;
  confirmedBreakoutUp: boolean;
  confirmedBreakdown: boolean;
  nearResistance: boolean;
  nearSupport: boolean;
  /** Last 15m bar closed bearish after testing resistance from below. */
  resistanceRejectionBar: boolean;
  /** Price approached resistance from below vs above (retest after breakout). */
  resistanceApproach: 'from_below' | 'from_above' | 'mixed';
  /** Last bar held former resistance as support (bullish bounce from above). */
  resistanceSupportHoldBar: boolean;
  /** Last bar failed resistance-as-support (bearish close back below level). */
  resistanceSupportFailBar: boolean;
};

export type EntryLocationResult = {
  ok: boolean;
  reason: string;
  analysis: SrZoneAnalysis;
};

function pricePosition(price: number, support: number, resistance: number): number {
  const range = resistance - support;
  if (!Number.isFinite(range) || range <= 0) return 0.5;
  const raw = (price - support) / range;
  return Math.max(0, Math.min(1, raw));
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

/** Distinct resistance clusters with meaningful tests (multi-touch structure). */
export function countResistanceStructureLevels(
  candles: Candle[],
  clusterPct: number,
  touchTol: number
): number {
  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingHigh(candles, i)) swings.push(candles[i].high);
  }
  if (swings.length === 0) return 0;

  const sorted = [...swings].sort((a, b) => b - a);
  const claimed: boolean[] = swings.map(() => false);
  let levels = 0;

  for (const seed of sorted) {
    const seedIdx = swings.findIndex((h, i) => h === seed && !claimed[i]);
    if (seedIdx < 0) continue;

    const clusterIdx: number[] = [];
    for (let i = 0; i < swings.length; i += 1) {
      if (claimed[i]) continue;
      if (Math.abs(swings[i] - seed) / seed <= clusterPct) clusterIdx.push(i);
    }
    if (clusterIdx.length === 0) continue;

    const level = clusterIdx.reduce((s, i) => s + swings[i], 0) / clusterIdx.length;
    clusterIdx.forEach((i) => {
      claimed[i] = true;
    });

    const tests = countLevelTests(candles, level, 'resistance', touchTol);
    if (tests.touches >= 2 || tests.rejections >= 1) levels += 1;
  }

  return levels;
}

/** All distinct swing-high cluster levels (high → low). */
function listResistanceClusterLevels(candles: Candle[], clusterPct: number): number[] {
  const swings: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if (isSwingHigh(candles, i)) swings.push(candles[i].high);
  }
  if (swings.length === 0) return [];

  const sorted = [...swings].sort((a, b) => b - a);
  const claimed: boolean[] = swings.map(() => false);
  const levels: number[] = [];

  for (const seed of sorted) {
    const seedIdx = swings.findIndex((h, i) => h === seed && !claimed[i]);
    if (seedIdx < 0) continue;

    const clusterIdx: number[] = [];
    for (let i = 0; i < swings.length; i += 1) {
      if (claimed[i]) continue;
      if (Math.abs(swings[i] - seed) / seed <= clusterPct) clusterIdx.push(i);
    }
    if (clusterIdx.length === 0) continue;

    const level = clusterIdx.reduce((s, i) => s + swings[i], 0) / clusterIdx.length;
    clusterIdx.forEach((i) => {
      claimed[i] = true;
    });
    levels.push(level);
  }

  return levels;
}

/** Resistance line price is pressing now (within tolerance under a tested cluster). */
export function resolveActiveResistanceNearPrice(
  candles: Candle[],
  price: number,
  clusterPct: number,
  touchTol: number
): { level: number; touches: number; rejections: number } | null {
  if (price <= 0) return null;

  const levels = listResistanceClusterLevels(candles, clusterPct);
  let best: { level: number; touches: number; rejections: number; score: number } | null = null;

  for (const level of levels) {
    const tests = countLevelTests(candles, level, 'resistance', touchTol);
    if (tests.touches < 2) continue;

    const distBelowPct = (level - price) / level;
    // Price at, slightly below, or slightly above the cluster (retest from either side).
    if (distBelowPct < -touchTol * 2 || distBelowPct > Math.max(0.02, touchTol * 6)) continue;

    const score = tests.rejections * 10 + tests.touches;
    if (!best || score > best.score) {
      best = { level, touches: tests.touches, rejections: tests.rejections, score };
    }
  }

  return best ? { level: best.level, touches: best.touches, rejections: best.rejections } : null;
}

function lastBarRejectsResistance(
  candles: Candle[],
  level: number,
  touchTol: number
): boolean {
  const c = candles[candles.length - 1];
  if (!c || level <= 0) return false;
  const tested = c.high >= level * (1 - touchTol);
  const closedBelow = c.close < level * (1 - touchTol * 0.35);
  return tested && closedBelow && c.close <= c.open * 1.0001;
}

/** Price was mostly above the level before the current bar — retest from above. */
function detectResistanceApproach(
  candles: Candle[],
  level: number,
  touchTol: number
): 'from_below' | 'from_above' | 'mixed' {
  if (level <= 0 || candles.length < 5) return 'mixed';
  const prior = candles.slice(-7, -1);
  if (prior.length < 3) return 'mixed';

  const aboveBand = level * (1 + touchTol * 0.35);
  const belowBand = level * (1 - touchTol * 0.35);
  const aboveCount = prior.filter((c) => c.close > aboveBand).length;
  const belowCount = prior.filter((c) => c.close < belowBand).length;
  const threshold = Math.ceil(prior.length * 0.55);

  if (aboveCount >= threshold) return 'from_above';
  if (belowCount >= threshold) return 'from_below';
  return 'mixed';
}

/** Bullish hold — price dipped to tested resistance from above and closed back above. */
function lastBarHoldsResistanceAsSupport(
  candles: Candle[],
  level: number,
  touchTol: number
): boolean {
  const c = candles[candles.length - 1];
  if (!c || level <= 0) return false;
  const tested = c.low <= level * (1 + touchTol);
  const closedAbove = c.close > level * (1 + touchTol * 0.35);
  return tested && closedAbove && c.close >= c.open * 0.9999;
}

/** Bearish fail — retest from above: level did not hold as support. */
function lastBarFailsResistanceAsSupport(
  candles: Candle[],
  level: number,
  touchTol: number
): boolean {
  const c = candles[candles.length - 1];
  if (!c || level <= 0) return false;
  const tested = c.low <= level * (1 + touchTol);
  const closedBelow = c.close < level * (1 - touchTol * 0.35);
  return tested && closedBelow && c.close <= c.open * 1.0001;
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

export function analyzeSrZones(candles15: Candle[], candles1h: Candle[]): SrZoneAnalysis {
  const cfg = config.hyperliquid.entryLocation;
  const price = candles15[candles15.length - 1]?.close ?? 0;

  const resistance15 = resolveResistanceLevel(candles15, cfg.swingClusterPct);
  const support15 = resolveSupportLevel(candles15, cfg.swingClusterPct);

  // Range ceiling/floor — max resistance & min support (was inverted: understated ceiling).
  let resistance = resistance15;
  let support = support15;

  if (candles1h.length >= 20) {
    const resistance1h = resolveResistanceLevel(candles1h, cfg.swingClusterPct);
    const support1h = resolveSupportLevel(candles1h, cfg.swingClusterPct);
    resistance = Math.max(resistance, resistance1h);
    support = Math.min(support, support1h);
  }

  const active15 = resolveActiveResistanceNearPrice(
    candles15,
    price,
    cfg.swingClusterPct,
    cfg.touchTolerancePct
  );
  const active1h =
    candles1h.length >= 12
      ? resolveActiveResistanceNearPrice(candles1h, price, cfg.swingClusterPct, cfg.touchTolerancePct)
      : null;
  const activeResistance =
    active15 && active1h
      ? active15.rejections >= active1h.rejections
        ? active15
        : active1h
      : active15 ?? active1h;
  const resistanceLevel =
    activeResistance?.level ?? resistance;

  const resTests = countLevelTests(candles15, resistanceLevel, 'resistance', cfg.touchTolerancePct);
  const supTests = countLevelTests(candles15, support, 'support', cfg.touchTolerancePct);
  const resistanceLevelCount = Math.max(
    countResistanceStructureLevels(candles15, cfg.swingClusterPct, cfg.touchTolerancePct),
    candles1h.length >= 12
      ? countResistanceStructureLevels(candles1h, cfg.swingClusterPct, cfg.touchTolerancePct)
      : 0
  );

  const rangeCeiling = Math.max(resistance, resistanceLevel);
  const pos = pricePosition(price, support, rangeCeiling);
  const distToResPct = rangeCeiling > 0 ? (rangeCeiling - price) / rangeCeiling : 1;
  const distToSupPct = support > 0 ? (price - support) / support : 1;

  const nearResistance =
    pos >= cfg.rangeTopBlock ||
    distToResPct <= cfg.nearLevelPct ||
    price >= resistanceLevel * (1 - cfg.nearLevelPct) ||
    activeResistance != null;

  const nearSupport =
    pos <= cfg.rangeBottomBlock ||
    distToSupPct <= cfg.nearLevelPct ||
    price <= support * (1 + cfg.nearLevelPct);

  const resistanceRejectionBar = activeResistance
    ? lastBarRejectsResistance(candles15, activeResistance.level, cfg.touchTolerancePct)
    : lastBarRejectsResistance(candles15, resistanceLevel, cfg.touchTolerancePct);

  const resistanceApproach = detectResistanceApproach(candles15, resistanceLevel, cfg.touchTolerancePct);
  const resistanceSupportHoldBar = activeResistance
    ? lastBarHoldsResistanceAsSupport(candles15, activeResistance.level, cfg.touchTolerancePct)
    : lastBarHoldsResistanceAsSupport(candles15, resistanceLevel, cfg.touchTolerancePct);
  const resistanceSupportFailBar = activeResistance
    ? lastBarFailsResistanceAsSupport(candles15, activeResistance.level, cfg.touchTolerancePct)
    : lastBarFailsResistanceAsSupport(candles15, resistanceLevel, cfg.touchTolerancePct);

  return {
    support,
    resistance: resistanceLevel,
    activeResistance: activeResistance?.level ?? null,
    price,
    pricePosition: pos,
    resistanceTouches: resTests.touches,
    resistanceRejections: resTests.rejections,
    resistanceLevelCount,
    activeResistanceRejections: activeResistance?.rejections ?? resTests.rejections,
    supportTouches: supTests.touches,
    supportRejections: supTests.rejections,
    confirmedBreakoutUp: confirmedBreakoutUp(
      candles15,
      resistanceLevel,
      cfg.breakoutBufferPct,
      cfg.breakoutConfirmBars
    ),
    confirmedBreakdown: confirmedBreakdown(
      candles15,
      support,
      cfg.breakoutBufferPct,
      cfg.breakoutConfirmBars
    ),
    nearResistance,
    nearSupport,
    resistanceRejectionBar,
    resistanceApproach,
    resistanceSupportHoldBar,
    resistanceSupportFailBar,
  };
}

function fmtLevel(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function emptyAnalysis(): SrZoneAnalysis {
  return {
    support: 0,
    resistance: 0,
    activeResistance: null,
    price: 0,
    pricePosition: 0.5,
    resistanceTouches: 0,
    resistanceRejections: 0,
    resistanceLevelCount: 0,
    activeResistanceRejections: 0,
    supportTouches: 0,
    supportRejections: 0,
    confirmedBreakoutUp: false,
    confirmedBreakdown: false,
    nearResistance: false,
    nearSupport: false,
    resistanceRejectionBar: false,
    resistanceApproach: 'mixed',
    resistanceSupportHoldBar: false,
    resistanceSupportFailBar: false,
  };
}

/** Price is pressing a tested resistance line (multi-bounce ceiling). */
export function isPressingTestedResistance(analysis: SrZoneAnalysis): boolean {
  const cfg = config.hyperliquid.entryLocation;
  const rejections = Math.max(analysis.resistanceRejections, analysis.activeResistanceRejections);
  const touches = analysis.resistanceTouches;

  if (analysis.activeResistance != null && rejections >= 1) return true;
  if (rejections >= cfg.minRejectionsToBlock) return true;
  if (touches >= 4) return true;
  if (analysis.resistanceLevelCount >= 2 && analysis.nearResistance) return true;
  if (analysis.nearResistance && rejections >= 2) return true;
  if (analysis.pricePosition >= cfg.rangeTopBlock - 0.08 && rejections >= 2) return true;

  return false;
}

function resistanceBlockReason(analysis: SrZoneAnalysis, direction: 'LONG' | 'SHORT'): string {
  const rejections = Math.max(analysis.resistanceRejections, analysis.activeResistanceRejections);
  const level = fmtLevel(analysis.activeResistance ?? analysis.resistance);
  const touches = analysis.resistanceTouches;
  const side =
    analysis.resistanceApproach === 'from_above'
      ? 'retest from above'
      : analysis.resistanceApproach === 'from_below'
        ? 'approach from below'
        : 'at resistance';

  if (direction === 'LONG') {
    if (analysis.resistanceApproach === 'from_above') {
      return `LONG blocked — resistance ${level} retest from above (${rejections}× rejections) — need support-hold candle or confirmed breakout`;
    }
    return `LONG blocked — pressing resistance ${level} (${rejections}× rejections, ${touches} touches${analysis.resistanceLevelCount >= 2 ? `, ${analysis.resistanceLevelCount} levels` : ''}, ${side}) — need confirmed breakout above`;
  }

  if (analysis.resistanceApproach === 'from_above') {
    return `SHORT blocked — resistance ${level} holding as support (${rejections}× prior rejections, ${side}) — need support-fail candle before short`;
  }
  return `SHORT blocked — at resistance ${level} (${rejections}× rejections, ${side}) without fresh rejection candle — wait for fade after touch`;
}

/** At tested resistance — block unless direction-specific confirmation bar matches approach side. */
export function lacksResistanceEntryConfirmation(
  analysis: SrZoneAnalysis,
  direction: 'LONG' | 'SHORT'
): boolean {
  if (!isPressingTestedResistance(analysis)) return false;
  if (analysis.confirmedBreakdown && direction === 'SHORT') return false;
  if (analysis.confirmedBreakoutUp && direction === 'LONG') return false;

  const fromAbove = analysis.resistanceApproach === 'from_above';
  const fromBelow =
    analysis.resistanceApproach === 'from_below' || analysis.resistanceApproach === 'mixed';

  if (direction === 'SHORT') {
    if (fromAbove) {
      return !analysis.resistanceSupportFailBar;
    }
    if (fromBelow) {
      return !analysis.resistanceRejectionBar;
    }
    return !analysis.resistanceRejectionBar && !analysis.resistanceSupportFailBar;
  }

  // LONG
  if (fromAbove) {
    return !analysis.resistanceSupportHoldBar;
  }
  if (fromBelow) {
    return true;
  }
  return !analysis.resistanceSupportHoldBar;
}

/** Overhead resistance still intact — do not short the range low. */
export function hasOverheadResistanceStructure(analysis: SrZoneAnalysis): boolean {
  if (isPressingTestedResistance(analysis)) return true;
  if (analysis.resistance <= analysis.price) return false;
  const cfg = config.hyperliquid.entryLocation;
  return (
    analysis.resistanceRejections >= cfg.minRejectionsToBlock ||
    analysis.resistanceLevelCount >= 2 ||
    analysis.resistanceTouches >= 4 ||
    (analysis.resistanceTouches >= 2 && analysis.resistanceRejections >= 1)
  );
}

function shortChaseLowBlockReason(analysis: SrZoneAnalysis): string | null {
  const cfg = config.hyperliquid.entryLocation;
  if (analysis.confirmedBreakdown) return null;
  if (analysis.nearResistance) return null;
  if (analysis.pricePosition >= 1 - cfg.pullbackMaxPosition) return null;

  const lowInRange = analysis.pricePosition <= cfg.pullbackMaxPosition;
  if (!lowInRange && !analysis.nearSupport) return null;

  if (!hasOverheadResistanceStructure(analysis)) return null;

  const parts = [
    `${analysis.resistanceRejections}× rejections at ${fmtLevel(analysis.resistance)}`,
  ];
  if (analysis.resistanceLevelCount >= 2) {
    parts.push(`${analysis.resistanceLevelCount} resistance levels`);
  }

  return `SHORT blocked — price low in range (${(analysis.pricePosition * 100).toFixed(0)}%) with overhead resistance (${parts.join(', ')}) — fade rally at resistance, not chase lows`;
}

export function evaluateEntryLocation(
  direction: 'LONG' | 'SHORT',
  analysis: SrZoneAnalysis
): EntryLocationResult {
  const cfg = config.hyperliquid.entryLocation;

  if (direction === 'LONG') {
    if (isPressingTestedResistance(analysis) && lacksResistanceEntryConfirmation(analysis, 'LONG')) {
      return { ok: false, analysis, reason: resistanceBlockReason(analysis, 'LONG') };
    }

    if (analysis.confirmedBreakoutUp) {
      return {
        ok: true,
        analysis,
        reason: `Breakout above resistance ${fmtLevel(analysis.resistance)} confirmed`,
      };
    }

    if (analysis.pricePosition <= cfg.pullbackMaxPosition) {
      if (isPressingTestedResistance(analysis) && lacksResistanceEntryConfirmation(analysis, 'LONG')) {
        return { ok: false, analysis, reason: resistanceBlockReason(analysis, 'LONG') };
      }
      return {
        ok: true,
        analysis,
        reason: `Pullback entry (${(analysis.pricePosition * 100).toFixed(0)}% of range, support ${fmtLevel(analysis.support)})`,
      };
    }

    if (analysis.nearResistance && !analysis.confirmedBreakoutUp) {
      const failedTests = analysis.resistanceRejections;
      if (failedTests >= cfg.minRejectionsToBlock) {
        return {
          ok: false,
          analysis,
          reason: `LONG blocked — resistance ${fmtLevel(analysis.resistance)} rejected ${failedTests}× without breakout`,
        };
      }
      return {
        ok: false,
        analysis,
        reason: `LONG blocked — price at resistance ${fmtLevel(analysis.resistance)} (${(analysis.pricePosition * 100).toFixed(0)}% of range) — need confirmed break above`,
      };
    }

    if (analysis.pricePosition > cfg.rangeTopBlock) {
      return {
        ok: false,
        analysis,
        reason: `LONG blocked — ${(analysis.pricePosition * 100).toFixed(0)}% of range (buy low — need pullback below ${(cfg.pullbackMaxPosition * 100).toFixed(0)}% or confirmed breakout)`,
      };
    }

    return {
      ok: false,
      analysis,
      reason: `LONG blocked — ${(analysis.pricePosition * 100).toFixed(0)}% of range (no entry into resistance chop — need pullback below ${(cfg.pullbackMaxPosition * 100).toFixed(0)}% or breakout)`,
    };
  }

  if (isPressingTestedResistance(analysis) && lacksResistanceEntryConfirmation(analysis, 'SHORT')) {
    return { ok: false, analysis, reason: resistanceBlockReason(analysis, 'SHORT') };
  }

  const chaseBlock = shortChaseLowBlockReason(analysis);
  if (chaseBlock) {
    return { ok: false, analysis, reason: chaseBlock };
  }

  if (analysis.confirmedBreakdown) {
    return {
      ok: true,
      analysis,
      reason: `Breakdown below support ${fmtLevel(analysis.support)} confirmed`,
    };
  }

  if (analysis.pricePosition >= 1 - cfg.pullbackMaxPosition) {
    if (isPressingTestedResistance(analysis) && lacksResistanceEntryConfirmation(analysis, 'SHORT')) {
      return { ok: false, analysis, reason: resistanceBlockReason(analysis, 'SHORT') };
    }
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
    return {
      ok: false,
      analysis,
      reason: `SHORT blocked — price at support ${fmtLevel(analysis.support)} without breakdown`,
    };
  }

  if (analysis.pricePosition < cfg.rangeBottomBlock) {
    return {
      ok: false,
      analysis,
      reason: `SHORT blocked — ${(analysis.pricePosition * 100).toFixed(0)}% of range (need breakdown below ${fmtLevel(analysis.support)} or rally to resistance)`,
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
  const candles15 = await signalEngine.fetchCandles(opts.symbol, '15m', 48);
  const candles1h = await signalEngine.fetchCandles(opts.symbol, '1h', 48);

  if (candles15.length < 12 || candles1h.length < 8) {
    return {
      ok: false,
      reason: 'insufficient candle history — resistance check blocked open',
      analysis: emptyAnalysis(),
    };
  }

  const sr = analyzeSrZones(candles15, candles1h);
  return evaluateEntryLocation(opts.direction, sr);
}
