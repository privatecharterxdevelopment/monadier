/**
 * Pre-open gate — buy dips / sell rallies, never chase extended moves.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { evaluateMacroBetaAlignment } from './macroBetaGate';

export type EntryMomentumResult = {
  ok: boolean;
  reason: string;
  change5mPct: number;
  change15mPct: number;
  change1hPct: number;
  momentumAligned: boolean;
};

function pctChangeClosed(candles: Candle[], bars: number): number {
  const closed = candles.slice(0, -1);
  if (closed.length < bars + 1) return 0;
  const end = closed[closed.length - 1];
  const start = closed[closed.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

/** Includes forming candle — catch live flush bottoms closed bars miss. */
function pctChangeLive(candles: Candle[], bars: number): number {
  if (candles.length < bars + 1) return 0;
  const end = candles[candles.length - 1];
  const start = candles[candles.length - 1 - bars];
  if (!start?.close || !end?.close || start.close <= 0) return 0;
  return ((end.close - start.close) / start.close) * 100;
}

function lastNCandlesMove(candles: Candle[], n: number, direction: 'LONG' | 'SHORT'): boolean {
  const closed = candles.slice(-n - 1, -1);
  if (closed.length < n) return false;
  if (direction === 'LONG') {
    return closed.every((c) => c.close >= c.open * 0.9999);
  }
  return closed.every((c) => c.close <= c.open * 1.0001);
}

/** Live-aware range position (includes forming high/low) so dump bottoms aren't mid-range. */
function rangePosition(candles: Candle[]): number {
  const window = candles.slice(-25);
  if (window.length < 4) return 0.5;
  const price = window[window.length - 1]?.close ?? 0;
  const hi = Math.max(...window.map((c) => c.high));
  const lo = Math.min(...window.map((c) => c.low));
  const span = hi - lo;
  if (span <= 0 || price <= 0) return 0.5;
  return (price - lo) / span;
}

export async function validateEntryMomentum(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<EntryMomentumResult> {
  const coin = opts.coin.toUpperCase();
  const cfg = config.hyperliquid.entryMomentum;
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 20),
      signalEngine.fetchCandles(symbol, '1h', 26),
    ]);

    const change5mPct = 0;
    const change15mPct = pctChangeClosed(c15m, 1);
    const change1hPct = pctChangeClosed(c1h, 1);
    const live15mPct = pctChangeLive(c15m, 1);
    const live1hPct = pctChangeLive(c1h, 1);
    const rangePos = rangePosition(c1h);

    const macro = await evaluateMacroBetaAlignment({
      coin,
      direction: opts.direction,
      scope: 'open',
    });
    if (!macro.ok) {
      return {
        ok: false,
        reason: `Entry blocked — macro against ${opts.direction}: ${macro.blockers.join('; ') || macro.reason}`,
        change5mPct,
        change15mPct,
        change1hPct,
        momentumAligned: false,
      };
    }

    const min15 = cfg.minMove15mPct;
    const bounce15m =
      change15mPct >= min15 && lastNCandlesMove(c15m, 1, 'LONG');
    const fade15m =
      change15mPct <= -min15 && lastNCandlesMove(c15m, 1, 'SHORT');

    let momentumAligned = false;
    let reason = '';

    if (opts.direction === 'LONG') {
      if (change15mPct >= cfg.maxChase15mPct && change1hPct >= cfg.maxChase1hPct) {
        reason =
          `LONG blocked — ${coin} already extended (15m +${change15mPct.toFixed(2)}%, 1h +${change1hPct.toFixed(2)}%) — wait for pullback, buy low`;
      } else if (rangePos > cfg.longMaxRangePosition) {
        reason =
          `LONG blocked — ${coin} at ${(rangePos * 100).toFixed(0)}% of 1h range (buy low, not at highs)`;
      } else if (!bounce15m) {
        const inLowerRange = rangePos <= cfg.longMaxRangePosition;
        const smallDip = change15mPct <= 0 && change15mPct > -0.6;
        if (inLowerRange && smallDip) {
          momentumAligned = true;
          reason =
            `Dip-buy OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · small 15m dip ${change15mPct.toFixed(2)}% to buy`;
        } else {
          reason =
            `LONG blocked — ${coin} needs 15m bounce from dip (15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}%, range ${(rangePos * 100).toFixed(0)}%)`;
        }
      } else if (change1hPct < -cfg.maxCounter1hPct) {
        reason = `LONG blocked — ${coin} 1h still dumping (${change1hPct.toFixed(2)}%) — wait for higher-low`;
      } else {
        momentumAligned = true;
        reason =
          `Dip-buy OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · 15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}% bounce`;
      }
    } else {
      // Chase / flush bottom — require BOTH TFs extended (live-aware min).
      // 2851481 used OR + tight floors → dumped trade rate; keep live min so
      // closed-only bars can't miss a forming flush, but don't OR-kill mild dumps.
      const chase15 =
        Math.min(change15mPct, live15mPct) <= cfg.maxChaseShort15mPct;
      const chase1h =
        Math.min(change1hPct, live1hPct) <= cfg.maxChaseShort1hPct;
      if (chase15 && chase1h) {
        reason =
          `SHORT blocked — ${coin} already extended down ` +
          `(15m ${Math.min(change15mPct, live15mPct).toFixed(2)}%, 1h ${Math.min(change1hPct, live1hPct).toFixed(2)}%) ` +
          `— wait for bounce, sell high`;
      } else if (rangePos < cfg.shortMinRangePosition) {
        reason =
          `SHORT blocked — ${coin} at ${(rangePos * 100).toFixed(0)}% of 1h range (sell high, not at lows)`;
      } else if (!fade15m) {
        const inUpperRange = rangePos >= Math.max(cfg.shortMinRangePosition, 0.5);
        const smallRally = change15mPct >= 0 && change15mPct < 0.6;
        // Only R-fade / upper-half — never "dump continuation" in lower/mid range
        // (that reopened TRUMP Open S on the dump shelf).
        if (inUpperRange && smallRally) {
          momentumAligned = true;
          reason =
            `Rally-fade OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · small 15m bounce +${change15mPct.toFixed(2)}% to fade`;
        } else {
          reason =
            `SHORT blocked — ${coin} needs upper-range fade (15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}%, range ${(rangePos * 100).toFixed(0)}% <50% = floor)`;
        }
      } else if (change1hPct > cfg.maxCounter1hPct) {
        reason = `SHORT blocked — ${coin} 1h still ripping (+${change1hPct.toFixed(2)}%) — wait for lower-high`;
      } else {
        momentumAligned = true;
        reason =
          `Rally-fade OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · 15m ${change15mPct.toFixed(2)}% fade`;
      }
    }

    if (!momentumAligned) {
      logger.info('Entry momentum gate blocked', { coin, direction: opts.direction, change5mPct, change15mPct, rangePos });
      return {
        ok: false,
        reason,
        change5mPct,
        change15mPct,
        change1hPct,
        momentumAligned: false,
      };
    }

    return {
      ok: true,
      reason,
      change5mPct,
      change15mPct,
      change1hPct,
      momentumAligned: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Entry momentum check failed — open blocked (${msg.slice(0, 60)})`,
      change5mPct: 0,
      change15mPct: 0,
      change1hPct: 0,
      momentumAligned: false,
    };
  }
}


/**
 * Loose anti-chase for LONG (always on, also for trusted scan picks).
 * Only blocks a real pump-top buy — not normal trend entries.
 * Block if: last 1h (4×15m) ≥ +2.0%, OR last 15m bar ≥ +1.0%,
 * OR price in the top 10% of the last 12h range after ≥ +3% off the 12h low.
 */
export async function validateLongNotAtPumpTop(coin: string): Promise<{ ok: boolean; reason: string }> {
  try {
    const symbol = hlCoinToBinanceSymbol(coin.toUpperCase());
    const c = await signalEngine.fetchCandles(symbol, '15m', 50);
    if (!c || c.length < 10) return { ok: true, reason: 'anti-chase: not enough candles — allow' };
    const last = c[c.length - 1];
    const px = last.close;
    const ref1h = c[Math.max(0, c.length - 5)].close;
    const ch1h = ((px - ref1h) / ref1h) * 100;
    const ch15 = ((last.close - last.open) / last.open) * 100;
    const win = c.slice(-48);
    const hi = Math.max(...win.map((k) => k.high));
    const lo = Math.min(...win.map((k) => k.low));
    const pos = hi > lo ? (px - lo) / (hi - lo) : 0.5;
    const offLow = lo > 0 ? ((px - lo) / lo) * 100 : 0;
    if (ch1h >= 2.0) return { ok: false, reason: `LONG anti-chase — 1h already +${ch1h.toFixed(2)}% (pump top)` };
    if (ch15 >= 1.0) return { ok: false, reason: `LONG anti-chase — 15m bar +${ch15.toFixed(2)}% (pump candle)` };
    if (pos >= 0.9 && offLow >= 3) {
      return { ok: false, reason: `LONG anti-chase — top ${(100 - pos * 100).toFixed(0)}% of 12h range, +${offLow.toFixed(1)}% off low` };
    }
    return { ok: true, reason: `anti-chase ok (1h ${ch1h.toFixed(2)}% · 15m ${ch15.toFixed(2)}% · range ${(pos * 100).toFixed(0)}%)` };
  } catch {
    return { ok: true, reason: 'anti-chase: data error — allow' };
  }
}
