/**
 * Pre-open analytics — read last N closed candles before any HL market open.
 * Blocks trades that fight visible candle structure (wrong side of range, wrong momentum).
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle, type Timeframe } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type PreOpenCandleAnalytics = {
  ok: boolean;
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

function detectStructure(candles: Candle[]): 'up' | 'down' | 'chop' {
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

export async function validatePreOpenCandleAnalytics(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** Standard opens use 5m structure; aggressive uses 1m. */
  timeframe?: '1m' | '5m';
}): Promise<PreOpenCandleAnalytics> {
  const cfg = config.hyperliquid.preOpenCandles;
  const fail = (partial: Omit<PreOpenCandleAnalytics, 'ok'>): PreOpenCandleAnalytics => ({
    ok: false,
    ...partial,
  });
  const pass = (partial: Omit<PreOpenCandleAnalytics, 'ok'>): PreOpenCandleAnalytics => ({
    ok: true,
    ...partial,
  });

  if (!cfg.enabled) {
    return pass({
      reason: '20-candle pre-open analytics disabled',
      summary: 'disabled',
      netMovePct: 0,
      greenCount: 0,
      redCount: 0,
      rangePosition: 0.5,
      recentMovePct: 0,
      volumeRatio: 1,
      structure: 'chop',
      rejectionsAtHigh: 0,
      rejectionsAtLow: 0,
    });
  }

  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);
  const tf = opts.timeframe ?? cfg.timeframe;
  const n = cfg.candleCount;

  try {
    const raw = await signalEngine.fetchCandles(symbol, tf, n + 2);
    const window = closedCandles(raw, n);
    if (window.length < Math.min(n, 12)) {
      return fail({
        reason: `Open blocked — ${coin}: only ${window.length}/${n} ${tf} candles (need history)`,
        summary: `insufficient ${tf} data`,
        netMovePct: 0,
        greenCount: 0,
        redCount: 0,
        rangePosition: 0.5,
        recentMovePct: 0,
        volumeRatio: 0,
        structure: 'chop',
        rejectionsAtHigh: 0,
        rejectionsAtLow: 0,
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

    const minRatio = cfg.minDirectionalCandleRatio;
    const minNet = cfg.minNetMovePct;
    const dir = opts.direction;

    if (dir === 'LONG') {
      const greenRatio = greens / window.length;
      if (net < minNet && greenRatio < minRatio) {
        const reason = `Open blocked — ${coin} LONG: last ${window.length}×${tf} bearish (net ${net.toFixed(2)}%, ${greens}G/${reds}R)`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (pos >= cfg.maxRangePositionLong && recent5 < cfg.breakoutRecentMovePct) {
        const sidewaysGrindLong =
          pos < 0.68 &&
          recent5 >= 0 &&
          net >= -minNet &&
          (structure === 'up' || structure === 'chop') &&
          rejH < cfg.maxRejectionsAtLevel;
        if (!sidewaysGrindLong) {
          const reason = `Open blocked — ${coin} LONG: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (buy low — wait for pullback)`;
          logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
          return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
        }
      }
      if (rejH >= cfg.maxRejectionsAtLevel && recent5 < minNet) {
        const reason = `Open blocked — ${coin} LONG: ${rejH} rejections at range high in last 8 bars`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (structure === 'down' && net <= -minNet * 1.5) {
        const reason = `Open blocked — ${coin} LONG: ${window.length}×${tf} structure still down (net ${net.toFixed(2)}%)`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
    } else {
      const redRatio = reds / window.length;
      if (net > -minNet && redRatio < minRatio) {
        const reason = `Open blocked — ${coin} SHORT: last ${window.length}×${tf} bullish (net ${net >= 0 ? '+' : ''}${net.toFixed(2)}%, ${greens}G/${reds}R)`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (pos <= cfg.maxRangePositionShort && recent5 > -cfg.breakoutRecentMovePct) {
        const trendContinuationShort =
          structure === 'down' && net <= -minNet && dir === 'SHORT';
        const sidewaysGrindShort =
          !trendContinuationShort &&
          pos > 0.32 &&
          recent5 <= 0 &&
          net <= minNet &&
          (structure === 'down' || structure === 'chop') &&
          rejL < cfg.maxRejectionsAtLevel;
        if (!trendContinuationShort && !sidewaysGrindShort) {
          const reason = `Open blocked — ${coin} SHORT: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (shorting lows)`;
          logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
          return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
        }
      }
      if (rejL >= cfg.maxRejectionsAtLevel && recent5 > -minNet) {
        const reason = `Open blocked — ${coin} SHORT: ${rejL} rejections at range low in last 8 bars`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (structure === 'up' && net >= minNet * 1.5) {
        const reason = `Open blocked — ${coin} SHORT: ${window.length}×${tf} structure still up (net +${net.toFixed(2)}%)`;
        logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
    }

    if (volR < cfg.minVolumeRatio) {
      const reason = `Open blocked — ${coin} ${dir}: volume fading (recent/base ${volR.toFixed(2)}×)`;
      logger.info('Pre-open 20-candle block', { coin, direction: dir, summary });
      return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
    }

    const reason = `20-candle OK — ${coin} ${dir} · ${summary}`;
    logger.info('Pre-open 20-candle pass', { coin, direction: dir, summary });
    return pass({
      reason,
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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail({
      reason: `Open blocked — ${coin} 20-candle analytics failed (${msg.slice(0, 60)})`,
      summary: 'fetch error',
      netMovePct: 0,
      greenCount: 0,
      redCount: 0,
      rangePosition: 0.5,
      recentMovePct: 0,
      volumeRatio: 0,
      structure: 'chop',
      rejectionsAtHigh: 0,
      rejectionsAtLow: 0,
    });
  }
}
