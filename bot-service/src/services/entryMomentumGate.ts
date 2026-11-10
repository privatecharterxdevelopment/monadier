/**
 * Pre-open gate — only enter when price is already moving in our direction.
 * No opens on weak/contra momentum; bot waits for plus, never auto-closes red.
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
      signalEngine.fetchCandles(symbol, '1h', 10),
    ]);

    const change5mPct = pctChangeClosed(c5m, 1);
    const change15mPct = pctChangeClosed(c15m, 1);
    const change1hPct = pctChangeClosed(c1h, 1);

    const min5 = cfg.minMove5mPct;
    const min15 = cfg.minMove15mPct;

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

    let momentumAligned = false;
    if (opts.direction === 'LONG') {
      momentumAligned =
        change5mPct >= min5 &&
        change15mPct >= min15 &&
        change1hPct >= -cfg.maxCounter1hPct &&
        lastNCandlesMove(c5m, cfg.minConfirmCandles5m, 'LONG');
    } else {
      momentumAligned =
        change5mPct <= -min5 &&
        change15mPct <= -min15 &&
        change1hPct <= cfg.maxCounter1hPct &&
        lastNCandlesMove(c5m, cfg.minConfirmCandles5m, 'SHORT');
    }

    if (!momentumAligned) {
      const reason =
        `Entry blocked — ${opts.direction} ${coin} needs live momentum (5m ${change5mPct >= 0 ? '+' : ''}${change5mPct.toFixed(2)}%, ` +
        `15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}%, 1h ${change1hPct >= 0 ? '+' : ''}${change1hPct.toFixed(2)}%) — ` +
        `need 5m/15m ${opts.direction === 'LONG' ? 'up' : 'down'} + ${cfg.minConfirmCandles5m}× 5m candles confirming`;
      logger.info('Entry momentum gate blocked', { coin, direction: opts.direction, change5mPct, change15mPct });
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
      reason:
        `Entry momentum OK ${opts.direction} ${coin} — 5m ${change5mPct >= 0 ? '+' : ''}${change5mPct.toFixed(2)}% · ` +
        `15m ${change15mPct >= 0 ? '+' : ''}${change15mPct.toFixed(2)}% · 1h ${change1hPct >= 0 ? '+' : ''}${change1hPct.toFixed(2)}%`,
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
