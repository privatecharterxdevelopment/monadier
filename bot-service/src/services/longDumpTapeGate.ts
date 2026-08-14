/**
 * Block LONG opens into a clear red dump tape.
 * User rule: market going down → SHORT, never LONG.
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
    const [c15m, c1h, c5m] = await Promise.all([
      signalEngine.fetchCandles(symbol, '15m', 12),
      signalEngine.fetchCandles(symbol, '1h', 12),
      signalEngine.fetchCandles(symbol, '5m', 16),
    ]);

    const check = (tf: string, candles: typeof c15m, lookback: number) => {
      if (candles.length < lookback + 1) return null;
      const closed = candles.slice(0, -1).slice(-lookback);
      if (closed.length < lookback) return null;
      const red = closed.filter((c) => c.close < c.open).length;
      const first = closed[0]!;
      const last = closed[closed.length - 1]!;
      const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
      // Strict again: ≥3/5 red with any net down, or ≥4/5 red, or net ≤ −0.25%.
      if (red >= 4 || (red >= 3 && netPct < -0.08) || netPct <= -0.25) {
        return `LONG blocked — ${coin} ${red}/${lookback} red ${tf} (net ${netPct >= 0 ? '+' : ''}${netPct.toFixed(2)}%) — dump tape, no long into red`;
      }
      return null;
    };

    const hit5 = check('5m', c5m, 5);
    if (hit5) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '5m' });
      return { ok: false, reason: hit5 };
    }
    const hit15 = check('15m', c15m, 5);
    if (hit15) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '15m' });
      return { ok: false, reason: hit15 };
    }
    const hit1h = check('1h', c1h, 5);
    if (hit1h) {
      logger.info('Long dump-tape gate blocked', { coin, tf: '1h' });
      return { ok: false, reason: hit1h };
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
