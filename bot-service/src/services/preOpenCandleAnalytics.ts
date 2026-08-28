/**
 * Pre-open analytics — read last N closed candles before any HL market open.
 * LONG → 15m structure · SHORT → 5m structure.
 */
import { config } from '../config';
import { preOpenTimeframeForDirection } from '../config/directionProfiles';
import { logger } from '../utils/logger';
import { signalEngine, type Candle, type Timeframe } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { btcLeadIsPumping } from './macroBetaGate';

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

/** Avg per-bar range as % of close — cheap ATR proxy for volatility normalization. */
function avgRangePct(candles: Candle[]): number {
  let sum = 0;
  let n = 0;
  for (const c of candles) {
    if (c.close > 0 && c.high >= c.low) {
      sum += (c.high - c.low) / c.close;
      n += 1;
    }
  }
  return n > 0 ? (sum / n) * 100 : 0;
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
  /** HTF (1h) trend label from the scan. When it confirms the trade direction the
   *  mean-reversion guards below are skipped — a confirmed uptrend LONG is *supposed*
   *  to sit high in its range and ride shallow pullbacks; blocking that strangles the
   *  momentum signal. Only active reversal / volume fade still blocks in that case. */
  h1Trend?: string;
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
      reason: 'pre-open candle analytics disabled',
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
  const tf = (
    process.env.HL_PRE_OPEN_CANDLE_TF ||
    preOpenTimeframeForDirection(config.hyperliquid.directionProfile, opts.direction)
  ) as Timeframe;
  const n = cfg.candleCount;

  try {
    const raw = await signalEngine.fetchCandles(symbol, tf, n + 2);
    const window = closedCandles(raw, n);
    if (window.length < n) {
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
    // ATR-normalized reversal threshold: a real trend-break/flush must clear typical
    // per-bar noise, not a −0.15% drift over the full window. Floor keeps calm majors sane.
    const atrPct = avgRangePct(window);
    const reversalPct = Math.max(cfg.reversalMinNetPct, atrPct * cfg.reversalAtrMult);

    const summary = buildSummary(tf, window.length, net, greens, reds, pos, recent5, volR, structure, rejH, rejL);

    const minRatio = cfg.minDirectionalCandleRatio;
    const minNet = cfg.minNetMovePct;
    const dir = opts.direction;

    // HTF trend confirms the trade direction → this is a momentum entry, not a chop
    // guess. Skip the mean-reversion guards (net-flat/bearish, buy-low range position,
    // rejections at range high) that would otherwise strangle a strong trending signal.
    // Active reversal (structure flipping) still blocks below. Volume fade is skipped
    // when HTF confirms — quiet-hour majors were stuck at 0.17× with full SHORT stacks.
    const t = (opts.h1Trend ?? '').toUpperCase();
    const trendConfirms =
      (dir === 'LONG' && /UP/.test(t)) || (dir === 'SHORT' && /DOWN/.test(t));

    if (dir === 'LONG') {
      const greenRatio = greens / window.length;
      if (!trendConfirms && net < minNet && greenRatio < minRatio) {
        const reason = `Open blocked — ${coin} LONG: last ${window.length}×${tf} bearish (net ${net.toFixed(2)}%, ${greens}G/${reds}R)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (!btcLeadIsPumping() && !trendConfirms && pos >= cfg.maxRangePositionLong && recent5 < cfg.breakoutRecentMovePct) {
        const reason = `Open blocked — ${coin} LONG: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (buy low — wait for pullback)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (!btcLeadIsPumping() && !trendConfirms && rejH >= cfg.maxRejectionsAtLevel && recent5 < minNet) {
        const reason = `Open blocked — ${coin} LONG: ${rejH} rejections at range high in last 8 bars`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      // Reversal veto — only a MEANINGFUL down-move against the LONG blocks: a sustained
      // down-structure past the ATR threshold, OR an active fresh dump in the last 5 bars.
      // A sluggish net drift (e.g. −0.15% over 100min) inside a confirmed uptrend is noise.
      const sustainedDown = structure === 'down' && net <= -reversalPct;
      const activeDump = recent5 <= -reversalPct;
      if (sustainedDown || activeDump) {
        const kind = activeDump ? 'active dump' : 'structure still down';
        const reason = `Open blocked — ${coin} LONG: ${kind} (net ${net.toFixed(2)}%, recent5 ${recent5.toFixed(2)}%, thr −${reversalPct.toFixed(2)}%)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
    } else {
      const redRatio = reds / window.length;
      if (!trendConfirms && net > -minNet && redRatio < minRatio) {
        const reason = `Open blocked — ${coin} SHORT: last ${window.length}×${tf} bullish (net ${net >= 0 ? '+' : ''}${net.toFixed(2)}%, ${greens}G/${reds}R)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (!trendConfirms && pos <= cfg.maxRangePositionShort && recent5 > -cfg.breakoutRecentMovePct) {
        const reason = `Open blocked — ${coin} SHORT: price at ${(pos * 100).toFixed(0)}% of ${window.length}-bar range (shorting lows)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      if (!trendConfirms && rejL >= cfg.maxRejectionsAtLevel && recent5 > -minNet) {
        const reason = `Open blocked — ${coin} SHORT: ${rejL} rejections at range low in last 8 bars`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
      // Reversal veto (mirror of LONG): sustained up-structure past the ATR threshold, or
      // an active fresh pump in the last 5 bars. A slow drift up is noise, not a trend break.
      const sustainedUp = structure === 'up' && net >= reversalPct;
      const activePump = recent5 >= reversalPct;
      if (sustainedUp || activePump) {
        const kind = activePump ? 'active pump' : 'structure still up';
        const reason = `Open blocked — ${coin} SHORT: ${kind} (net +${net.toFixed(2)}%, recent5 ${recent5.toFixed(2)}%, thr +${reversalPct.toFixed(2)}%)`;
        logger.info('Pre-open candle block', { coin, direction: dir, summary });
        return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
      }
    }

    if (!trendConfirms && volR < cfg.minVolumeRatio) {
      const reason = `Open blocked — ${coin} ${dir}: volume fading (recent/base ${volR.toFixed(2)}×)`;
      logger.info('Pre-open candle block', { coin, direction: dir, summary });
      return fail({ reason, summary, netMovePct: net, greenCount: greens, redCount: reds, rangePosition: pos, recentMovePct: recent5, volumeRatio: volR, structure, rejectionsAtHigh: rejH, rejectionsAtLow: rejL });
    }

    const reason = `${n}-candle OK — ${coin} ${dir} · ${summary}`;
    logger.info('Pre-open candle pass', { coin, direction: dir, summary });
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
      reason: `Open blocked — ${coin} pre-open candle analytics failed (${msg.slice(0, 60)})`,
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
