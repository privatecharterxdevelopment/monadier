/**
 * Entry location gate — resistance/support awareness before HL bot opens.
 *
 * Blocks LONG into a ceiling that already rejected price multiple times.
 * Allows LONG only on confirmed breakout above resistance or pullback toward support.
 */
import { config } from '../config';
import { signalEngine, type Candle } from './signalEngine';

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
};

export type EntryLocationResult = {
  ok: boolean;
  reason: string;
  analysis: SrZoneAnalysis;
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

export function analyzeSrZones(candles15: Candle[], candles1h: Candle[]): SrZoneAnalysis {
  const cfg = config.hyperliquid.entryLocation;
  const price = candles15[candles15.length - 1]?.close ?? 0;

  const resistance15 = resolveResistanceLevel(candles15, cfg.swingClusterPct);
  const support15 = resolveSupportLevel(candles15, cfg.swingClusterPct);

  let resistance = resistance15;
  let support = support15;

  if (candles1h.length >= 20) {
    const resistance1h = resolveResistanceLevel(candles1h, cfg.swingClusterPct);
    const support1h = resolveSupportLevel(candles1h, cfg.swingClusterPct);
    resistance = Math.min(resistance, resistance1h);
    support = Math.max(support, support1h);
  }

  const resTests = countLevelTests(candles15, resistance, 'resistance', cfg.touchTolerancePct);
  const supTests = countLevelTests(candles15, support, 'support', cfg.touchTolerancePct);

  const pos = pricePosition(price, support, resistance);
  const distToResPct = resistance > 0 ? (resistance - price) / resistance : 1;
  const distToSupPct = support > 0 ? (price - support) / support : 1;

  const nearResistance =
    pos >= cfg.rangeTopBlock ||
    distToResPct <= cfg.nearLevelPct ||
    price >= resistance * (1 - cfg.nearLevelPct);

  const nearSupport =
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
      candles15,
      resistance,
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

    return {
      ok: true,
      analysis,
      reason: `Entry ok — ${(analysis.pricePosition * 100).toFixed(0)}% of range (R ${fmtLevel(analysis.resistance)})`,
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

  return {
    ok: true,
    analysis,
    reason: `Entry ok — ${(analysis.pricePosition * 100).toFixed(0)}% of range (S ${fmtLevel(analysis.support)})`,
  };
}

export async function validateEntryLocation(opts: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
}): Promise<EntryLocationResult> {
  const candles15 = await signalEngine.fetchCandles(opts.symbol, '15m', 96);
  const candles1h = await signalEngine.fetchCandles(opts.symbol, '1h', 72);

  if (candles15.length < 24) {
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
      },
    };
  }

  const sr = analyzeSrZones(candles15, candles1h);
  return evaluateEntryLocation(opts.direction, sr);
}
