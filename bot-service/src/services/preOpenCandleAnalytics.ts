/**
 * Pre-open analytics — read last N closed candles before any HL market open.
 * Blocks trades that fight visible 1m structure (wrong side of range, wrong momentum).
 *
 * SHORT range-low / low-rejection vetoes are skipped only when a 5m/15m breakdown
 * is already confirmed (same helper as location + HTF quality). Unconfirmed floors stay blocked.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle, type Timeframe } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { isConfirmedShortBreakdown } from './shortBreakdownConfirm';

export type PreOpenBlockCode =
  | 'PRE_OPEN_DISABLED'
  | 'PRE_OPEN_INSUFFICIENT_DATA'
  | 'PRE_OPEN_FETCH_ERROR'
  | 'PRE_OPEN_BEARISH_TAPE'
  | 'PRE_OPEN_CHASING_HIGH'
  | 'PRE_OPEN_HIGH_REJECTIONS'
  | 'PRE_OPEN_STRUCTURE_DOWN'
  | 'PRE_OPEN_BULLISH_TAPE'
  | 'PRE_OPEN_SHORTING_LOWS'
  | 'PRE_OPEN_LOW_REJECTIONS'
  | 'PRE_OPEN_STRUCTURE_UP'
  | 'PRE_OPEN_VOLUME_FADE'
  | 'PRE_OPEN_PASS';

export type PreOpenCandleAnalytics = {
  ok: boolean;
  code: PreOpenBlockCode;
  reason: string;
  summary: string;
  netMovePct: number;
  greenCount: number;
  redCount: number;
  rangePosition: number;
  recentMovePct: number;
  volumeRatio: number;
  structure: 'up' | 'down' | 'chop';
  rejectionsAtHigh: number;
  rejectionsAtLow: number;
  shortBreakdownConfirmed: boolean;
};

function closedCandles(candles: Candle[], count: number): Candle[] {
  const all = candles.slice(0, -1);
  if (all.length < count) return all;
  return all.slice(-count);
}

function avgVolume(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((s, c) => s + c.volume, 0) / candles.length;
}

function netMovePct(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const start = candles[0].close;
  const end = candles[candles.length - 1].close;
  if (start <= 0) return 0;
  return ((end - start) / start) * 100;
}

function rangePosition(candles: Candle[]): number {
  if (candles.length === 0) return 0.5;
  const price = candles[candles.length - 1].close;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = hi - lo;
  if (span <= 0) return 0.5;
  return (price - lo) / span;
}

function countRejections(candles: Candle[], side: 'high' | 'low'): number {
  let n = 0;
  for (const c of candles) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range <= 0 || body < 1e-12) continue;
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    if (side === 'high' && upper > body * 1.2 && c.close < c.high - range * 0.25) n += 1;
    if (side === 'low' && lower > body * 1.2 && c.close > c.low + range * 0.25) n += 1;
  }
  return n;
}

export function detectStructure(candles: Candle[]): 'up' | 'down' | 'chop' {
  if (candles.length < 6) return 'chop';
  const mid = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, mid);
  const secondHalf = candles.slice(mid);
  const highs1 = firstHalf.map((c) => c.high);
  const highs2 = secondHalf.map((c) => c.high);
  const lows1 = firstHalf.map((c) => c.low);
  const lows2 = secondHalf.map((c) => c.low);
  const hh = Math.max(...highs2) > Math.max(...highs1) * 1.0003;
  const hl = Math.min(...lows2) > Math.min(...lows1) * 1.0003;
  const lh = Math.max(...highs2) < Math.max(...highs1) * 0.9997;
  const ll = Math.min(...lows2) < Math.min(...lows1) * 0.9997;
  if (hh && hl) return 'up';
  if (lh && ll) return 'down';
  return 'chop';
}

function buildSummary(
  tf: Timeframe,
  n: number,
  net: number,
  greens: number,
  reds: number,
  pos: number,
  recent: number,
  volR: number,
  structure: string,
  rejH: number,
  rejL: number
): string {
  return (
    `last ${n}×${tf} closed · net ${net >= 0 ? '+' : ''}${net.toFixed(2)}% · ` +
    `${greens}G/${reds}R · range ${(pos * 100).toFixed(0)}% · recent5 ${recent >= 0 ? '+' : ''}${recent.toFixed(2)}% · ` +
    `vol×${volR.toFixed(2)} · ${structure} · rej↑${rejH} rej↓${rejL}`
  );
}

const emptyMetrics = {
  netMovePct: 0,
  greenCount: 0,
  redCount: 0,
  rangePosition: 0.5,
  recentMovePct: 0,
  volumeRatio: 0,
  structure: 'chop' as const,
  rejectionsAtHigh: 0,
  rejectionsAtLow: 0,
};

export function evaluatePreOpenCandleWindow(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  candles: Candle[];
  shortBreakdownConfirmed?: boolean;
  /** 6×1m scalp print — do not veto on marginal volume/structure noise. */
  aggressiveScalp?: boolean;
}): PreOpenCandleAnalytics {
  const cfg = config.hyperliquid.preOpenCandles;
  const coin = opts.coin.toUpperCase();
  const tf = cfg.timeframe;
  const n = cfg.candleCount;
  const confirmed = opts.shortBreakdownConfirmed === true;

  const fail = (
    code: PreOpenBlockCode,
    reason: string,
    extra: Partial<PreOpenCandleAnalytics>
  ): PreOpenCandleAnalytics => ({
    ok: false,
    code,
    reason,
    summary: extra.summary ?? '',
    netMovePct: extra.netMovePct ?? 0,
    greenCount: extra.greenCount ?? 0,
    redCount: extra.redCount ?? 0,
    rangePosition: extra.rangePosition ?? 0.5,
    recentMovePct: extra.recentMovePct ?? 0,
    volumeRatio: extra.volumeRatio ?? 0,
    structure: extra.structure ?? 'chop',
    rejectionsAtHigh: extra.rejectionsAtHigh ?? 0,
    rejectionsAtLow: extra.rejectionsAtLow ?? 0,
    shortBreakdownConfirmed: confirmed,
  });

  if (!cfg.enabled) {
    return {
      ok: true,
      code: 'PRE_OPEN_DISABLED',
      reason: '20-candle pre-open analytics disabled',
      summary: 'disabled',
      ...emptyMetrics,
      volumeRatio: 1,
      shortBreakdownConfirmed: confirmed,
    };
  }

  const window = closedCandles(opts.candles, n);
  if (window.length < Math.min(n, 12)) {
    return fail('PRE_OPEN_INSUFFICIENT_DATA', `Open blocked — ${coin}: only ${window.length}/${n} ${tf} candles (need history)`, {
      summary: `insufficient ${tf} data`,
      ...emptyMetrics,
    });
  }

  const greens = window.filter((c) => c.close > c.open).length;
  const reds = window.length - greens;
  const net = netMovePct(window);
  const pos = rangePosition(window);
  const recent5 = window.length >= 5 ? netMovePct(window.slice(-5)) : net;
  const volBase = avgVolume(window.slice(0, -5));
  const volRecent = avgVolume(window.slice(-5));
  const volR = volBase > 0 ? volRecent / volBase : 1;
  const structure = detectStructure(window);
  const rejH = countRejections(window.slice(-8), 'high');
  const rejL = countRejections(window.slice(-8), 'low');
  const summary = buildSummary(tf, window.length, net, greens, reds, pos, recent5, volR, structure, rejH, rejL);
  const metrics = {
    summary,
    netMovePct: net,
    greenCount: greens,
    redCount: reds,
    rangePosition: pos,
    recentMovePct: recent5,
    volumeRatio: volR,
    structure,
    rejectionsAtHigh: rejH,
    rejectionsAtLow: rejL,
  };

  const minRatio = cfg.minDirectionalCandleRatio;
  const minNet = cfg.minNetMovePct;
  const dir = opts.direction;
  /**
   * Skip low-range vetoes only when breakdown is confirmed AND price is still
   * pressing lower (not pausing on support after one red spike).
   */
  const skipFloorVeto =
    dir === 'SHORT' &&
    confirmed &&
    recent5 <= -Math.max(0.04, cfg.breakoutRecentMovePct * 0.45) &&
    structure !== 'up';

  if (dir === 'LONG') {
    const greenRatio = greens / window.length;
    if (net < minNet && greenRatio < minRatio) {
      return fail(
        'PRE_OPEN_BEARISH_TAPE',
        `Open blocked — ${coin} LONG: last ${window.length}×${tf} bearish (net ${net.toFixed(2)}%, ${greens}G/${reds}R)`,
        metrics
      );
    }
    if (pos >= cfg.maxRangePositionLong && recent5 < cfg.breakoutRecentMovePct) {
      return fail(
        'PRE_OPEN_CHASING_HIGH',
        `Open blocked — ${coin} LONG: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (chasing high)`,
        metrics
      );
    }
    if (rejH >= cfg.maxRejectionsAtLevel && recent5 < minNet) {
      return fail(
        'PRE_OPEN_HIGH_REJECTIONS',
        `Open blocked — ${coin} LONG: ${rejH} rejections at range high in last 8 bars`,
        metrics
      );
    }
    if (structure === 'down' && net <= -minNet * 1.5) {
      return fail(
        'PRE_OPEN_STRUCTURE_DOWN',
        `Open blocked — ${coin} LONG: ${window.length}×${tf} structure still down (net ${net.toFixed(2)}%)`,
        metrics
      );
    }
  } else {
    const redRatio = reds / window.length;
    if (net > -minNet && redRatio < minRatio) {
      return fail(
        'PRE_OPEN_BULLISH_TAPE',
        `Open blocked — ${coin} SHORT: last ${window.length}×${tf} bullish (net ${net >= 0 ? '+' : ''}${net.toFixed(2)}%, ${greens}G/${reds}R)`,
        metrics
      );
    }
    if (!skipFloorVeto && pos <= cfg.maxRangePositionShort && recent5 > -cfg.breakoutRecentMovePct) {
      return fail(
        'PRE_OPEN_SHORTING_LOWS',
        `Open blocked — ${coin} SHORT: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (shorting lows)`,
        metrics
      );
    }
    if (!skipFloorVeto && rejL >= cfg.maxRejectionsAtLevel && recent5 > -minNet) {
      return fail(
        'PRE_OPEN_LOW_REJECTIONS',
        `Open blocked — ${coin} SHORT: ${rejL} rejections at range low in last 8 bars`,
        metrics
      );
    }
    const structureUpMinNet = opts.aggressiveScalp ? 0.35 : minNet * 1.5;
    if (structure === 'up' && net >= structureUpMinNet) {
      return fail(
        'PRE_OPEN_STRUCTURE_UP',
        `Open blocked — ${coin} SHORT: ${window.length}×${tf} structure still up (net +${net.toFixed(2)}%)`,
        metrics
      );
    }
  }

  const minVolRatio = opts.aggressiveScalp
    ? Math.min(cfg.minVolumeRatio, 0.38)
    : cfg.minVolumeRatio;
  if (volR < minVolRatio) {
    return fail(
      'PRE_OPEN_VOLUME_FADE',
      `Open blocked — ${coin} ${dir}: volume fading (recent/base ${volR.toFixed(2)}×)`,
      metrics
    );
  }

  return {
    ok: true,
    code: 'PRE_OPEN_PASS',
    reason: `20-candle OK — ${coin} ${dir} · ${summary}`,
    shortBreakdownConfirmed: confirmed,
    ...metrics,
  };
}

export async function validatePreOpenCandleAnalytics(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  aggressiveScalp?: boolean;
}): Promise<PreOpenCandleAnalytics> {
  const cfg = config.hyperliquid.preOpenCandles;
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);
  const tf = cfg.timeframe;
  const n = cfg.candleCount;

  try {
    const raw = await signalEngine.fetchCandles(symbol, tf, n + 2);
    let shortBreakdownConfirmed = false;
    if (opts.direction === 'SHORT') {
      const [candles5m, candles15m] = await Promise.all([
        signalEngine.fetchCandles(symbol, '5m', 48),
        signalEngine.fetchCandles(symbol, '15m', 24),
      ]);
      shortBreakdownConfirmed = isConfirmedShortBreakdown({ candles5m, candles15m });
    }
    const result = evaluatePreOpenCandleWindow({
      coin,
      direction: opts.direction,
      candles: raw,
      shortBreakdownConfirmed,
      aggressiveScalp: opts.aggressiveScalp,
    });
    logger.info(result.ok ? 'Pre-open 20-candle pass' : 'Pre-open 20-candle block', {
      coin,
      direction: opts.direction,
      gate: 'pre_open_candles',
      code: result.code,
      summary: result.summary,
      netMovePct: result.netMovePct,
      rangePosition: result.rangePosition,
      recentMovePct: result.recentMovePct,
      volumeRatio: result.volumeRatio,
      structure: result.structure,
      rejectionsAtHigh: result.rejectionsAtHigh,
      rejectionsAtLow: result.rejectionsAtLow,
      shortBreakdownConfirmed: result.shortBreakdownConfirmed,
      reason: result.reason,
    });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'PRE_OPEN_FETCH_ERROR',
      reason: `Open blocked — ${coin} 20-candle analytics failed (${msg.slice(0, 60)})`,
      summary: 'fetch error',
      ...emptyMetrics,
      shortBreakdownConfirmed: false,
    };
  }
}
