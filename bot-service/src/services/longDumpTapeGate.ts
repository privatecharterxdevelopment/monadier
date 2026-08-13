/**
 * Block LONG opens into a clear red dump tape.
 * User rule: last candles red / price falling → SHORT, never LONG.
 */
import { logger } from '../utils/logger';
import { signalEngine } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type LongDumpTapeResult = {
  ok: boolean;
  reason: string;
};

export async function validateLongDumpTapeGate(opts: {
  coin: string;
}): Promise<LongDumpTapeResult> {
  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [c15m, c1h] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 12),
      signalEngine.fetchCandles(symbol, '1h', 12),
    ]);

    const check = (tf: string, candles: typeof c15m, lookback: number) => {
      if (candles.length < lookback + 1) return null;
      const closed = candles.slice(0, -1).slice(-lookback);
      if (closed.length < lookback) return null;
      const red = closed.filter((c) => c.close < c.open).length;
      const first = closed[0]!;
      const last = closed[closed.length - 1]!;
      const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
      // Need a clear dump — ≥5/5 red, or ≥4/5 red with deeper net down.
      // Old ≥3/5 blocked every dip-buy LONG (no room-up entries in chop).
      if (red >= 5 || (red >= 4 && netPct < -0.35)) {
        return `LONG blocked — ${coin} ${red}/${lookback} red ${tf} (net ${netPct >= 0 ? '+' : ''}${netPct.toFixed(2)}%) — dump tape, no long into red`;
      }
      return null;
    };

    // Prefer 15m tape; only escalate to 1h when 15m is also soft-red (≥3/5).
    const hit15 = check('15m', c15m, 5);
    if (hit15) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '15m' });
      return { ok: false, reason: hit15 };
    }
    const closed15 = c15m.slice(0, -1).slice(-5);
    const red15 = closed15.filter((c) => c.close < c.open).length;
    if (red15 >= 3) {
      const hit1h = check('1h', c1h, 5);
      if (hit1h) {
        logger.info('Long dump-tape gate blocked', { coin, tf: '1h' });
        return { ok: false, reason: hit1h };
      }
    }
    return { ok: true, reason: `Dump-tape OK LONG ${coin}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Long dump-tape gate error — fail closed', { coin, error: msg });
    return {
      ok: false,
      reason: `LONG blocked — ${coin} dump-tape check failed (${msg.slice(0, 60)})`,
    };
  }
}
