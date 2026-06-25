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

function lastNCandlesMove(candles: Candle[], n: number, direction: 'LONG' | 'SHORT'): boolean {
  const closed = candles.slice(-n - 1, -1);
  if (closed.length < n) return false;
  if (direction === 'LONG') {
    return closed.every((c) => c.close >= c.open * 0.9999);
  }
  return closed.every((c) => c.close <= c.open * 1.0001);
}

function rangePosition(candles: Candle[]): number {
  const closed = candles.slice(0, -1).slice(-24);
  if (closed.length < 4) return 0.5;
  const price = closed[closed.length - 1]?.close ?? 0;
  const hi = Math.max(...closed.map((c) => c.high));
  const lo = Math.min(...closed.map((c) => c.low));
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
    const [c5m, c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '5m', 20),
      signalEngine.fetchCandles(symbol, '15m', 20),
      signalEngine.fetchCandles(symbol, '1h', 26),
    ]);

    const change5mPct = pctChangeClosed(c5m, 1);
    const change15mPct = pctChangeClosed(c15m, 1);
    const change1hPct = pctChangeClosed(c1h, 1);
    const rangePos = rangePosition(c1h);

    const macro = await evaluateMacroBetaAlignment({ coin, direction: opts.direction });
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

    const min5 = cfg.minMove5mPct;
    const bounce5m = change5mPct >= min5 && lastNCandlesMove(c5m, cfg.minConfirmCandles5m, 'LONG');
    const fade5m = change5mPct <= -min5 && lastNCandlesMove(c5m, cfg.minConfirmCandles5m, 'SHORT');

    let momentumAligned = false;
    let reason = '';

    if (opts.direction === 'LONG') {
      if (change15mPct >= cfg.maxChase15mPct && change1hPct >= cfg.maxChase1hPct) {
        reason =
          `LONG blocked — ${coin} already extended (15m +${change15mPct.toFixed(2)}%, 1h +${change1hPct.toFixed(2)}%) — wait for pullback, buy low`;
      } else if (rangePos > cfg.longMaxRangePosition) {
        reason =
          `LONG blocked — ${coin} at ${(rangePos * 100).toFixed(0)}% of 1h range (buy low, not at highs)`;
      } else if (!bounce5m) {
        const inLowerRange = rangePos <= cfg.longMaxRangePosition;
        const smallDip = change5mPct <= 0 && change5mPct > -0.3;
        if (inLowerRange && smallDip) {
          momentumAligned = true;
          reason =
            `Dip-buy OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · small 5m dip ${change5mPct.toFixed(2)}% to buy`;
        } else {
          reason =
            `LONG blocked — ${coin} needs 5m bounce from dip (5m ${change5mPct >= 0 ? '+' : ''}${change5mPct.toFixed(2)}%, range ${(rangePos * 100).toFixed(0)}%)`;
        }
      } else if (change1hPct < -cfg.maxCounter1hPct) {
        reason = `LONG blocked — ${coin} 1h still dumping (${change1hPct.toFixed(2)}%) — wait for higher-low`;
      } else {
        momentumAligned = true;
        reason =
          `Dip-buy OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · 5m +${change5mPct.toFixed(2)}% bounce · 15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}%`;
      }
    } else {
      if (change15mPct <= cfg.maxChaseShort15mPct && change1hPct <= cfg.maxChaseShort1hPct) {
        reason =
          `SHORT blocked — ${coin} already extended down (15m ${change15mPct.toFixed(2)}%, 1h ${change1hPct.toFixed(2)}%) — wait for bounce, sell high`;
      } else if (rangePos < cfg.shortMinRangePosition) {
        reason =
          `SHORT blocked — ${coin} at ${(rangePos * 100).toFixed(0)}% of 1h range (sell high, not at lows)`;
      } else if (!fade5m) {
        const inUpperRange = rangePos >= cfg.shortMinRangePosition;
        const smallRally = change5mPct >= 0 && change5mPct < 0.3;
        if (inUpperRange && smallRally) {
          momentumAligned = true;
          reason =
            `Rally-fade OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · small 5m bounce +${change5mPct.toFixed(2)}% to fade`;
        } else {
          reason =
            `SHORT blocked — ${coin} needs 5m rejection from rally (5m ${change5mPct >= 0 ? '+' : ''}${change5mPct.toFixed(2)}%, range ${(rangePos * 100).toFixed(0)}%)`;
        }
      } else if (change1hPct > cfg.maxCounter1hPct) {
        reason = `SHORT blocked — ${coin} 1h still ripping (+${change1hPct.toFixed(2)}%) — wait for lower-high`;
      } else {
        momentumAligned = true;
        reason =
          `Rally-fade OK — ${coin} at ${(rangePos * 100).toFixed(0)}% range · 5m ${change5mPct.toFixed(2)}% fade · 15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}%`;
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
